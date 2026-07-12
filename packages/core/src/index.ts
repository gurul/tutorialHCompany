// Public API. Bundled by tsup with --global-name Handyman, so the IIFE
// exposes `Handyman.init(...)` and `Handyman.ask(...)`.

import type { HandymanConfig } from './types.ts';
import { createOverlay } from './overlay.ts';
import { createPointer } from './pointer.ts';
import { createFab } from './fab.ts';
import { captureViewport } from './capture.ts';
import { createSession, type SessionHandle } from './session.ts';

export type * from './types.ts';
export type { SessionCallbacks, SessionState } from './session.ts';

const DEFAULT_Z = 2147483000;
const DEFAULT_HOTKEY = 'Alt+KeyH';

/** Parsed keyboard combo: required modifier state + physical key `code`. */
interface Hotkey {
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
	meta: boolean;
	code: string;
}

/** Parse a combo like "Alt+KeyH" / "Ctrl+Shift+Space" / "F2". null if unusable. */
function parseHotkey(spec: string): Hotkey | null {
	const parts = spec
		.split('+')
		.map((p) => p.trim())
		.filter((p) => p.length > 0);
	if (parts.length === 0) return null;
	const code = parts[parts.length - 1]!;
	const mods = parts.slice(0, -1).map((m) => m.toLowerCase());
	return {
		ctrl: mods.includes('ctrl') || mods.includes('control'),
		alt: mods.includes('alt') || mods.includes('option'),
		shift: mods.includes('shift'),
		meta: mods.includes('meta') || mods.includes('cmd') || mods.includes('command'),
		code,
	};
}

function hotkeyMatches(e: KeyboardEvent, h: Hotkey): boolean {
	return (
		e.code === h.code &&
		e.ctrlKey === h.ctrl &&
		e.altKey === h.alt &&
		e.shiftKey === h.shift &&
		e.metaKey === h.meta
	);
}

// Voice module contract (built in parallel under src/voice/). Types are
// declared locally so core compiles and ships while voice is absent.
interface VoiceTTS {
	speak(t: string): Promise<void>;
	stop(): void;
}
interface VoiceModule {
	createTTS(endpoint: string): VoiceTTS;
	startSTT(
		endpoint: string,
		opts: { onFinal(text: string): void },
	): Promise<{ stop(): void }>;
}

async function loadVoice(): Promise<VoiceModule | null> {
	try {
		// Literal specifier so tsup bundles voice into the IIFE; voice failures
		// (no mic, token endpoint down) must never break the tour itself.
		return (await import('./voice/index.ts')) as VoiceModule;
	} catch {
		return null;
	}
}

interface Instance {
	session: SessionHandle;
	destroy(): void;
}

let instance: Instance | null = null;

export function init(config: HandymanConfig): void {
	if (instance !== null) instance.destroy();

	const z = config.zIndex ?? DEFAULT_Z;
	let tts: VoiceTTS | null = null;
	// Hotkey listener teardown, installed once voice loads; called by destroy().
	let removeHotkey: (() => void) | null = null;

	const fab = createFab({
		zIndex: z,
		onAsk: (q) => session.ask(q),
	});

	const overlay = createOverlay({
		zIndex: z,
		callbacks: {
			onNext: () => session.ui.next(),
			onBack: () => session.ui.back(),
			onSkip: () => session.ui.skip(),
			onDoIt: () => session.ui.doIt(),
			onTargetLost: () => session.ui.targetLost(),
		},
	});

	const pointer = createPointer({ zIndex: z + 3 });

	const session = createSession({
		config,
		overlay,
		pointer,
		fabCenter: () => fab.center(),
		capture: captureViewport,
		callbacks: {
			// Return the speak() promise so the agent loop can await narration
			// before it acts. Resolves immediately when TTS is off/absent.
			onStepInstruction: (text) => {
				tts?.stop();
				return tts?.speak(text).catch(() => {}) ?? Promise.resolve();
			},
			onAnswer: (text) => {
				tts?.stop();
				return tts?.speak(text).catch(() => {}) ?? Promise.resolve();
			},
		},
	});

	instance = {
		session,
		destroy() {
			removeHotkey?.();
			removeHotkey = null;
			session.destroy();
			overlay.destroy();
			pointer.destroy();
			fab.destroy();
			tts?.stop();
			instance = null;
		},
	};

	// Voice is optional: wire TTS + the FAB mic + the keyboard hotkey if present.
	void loadVoice().then((voice) => {
		if (voice === null || instance === null) return;
		if (config.tts !== false) tts = voice.createTTS(config.endpoint);
		if (config.stt === false) return;

		// Shared listen path: the FAB mic button and the keyboard hotkey both
		// drive this, so click and hotkey behave identically (same startSTT /
		// onFinal wiring, same FAB recording indicator).
		let sttHandle: { stop(): void } | null = null;
		let listening = false;

		function startListening(): void {
			if (listening) return;
			listening = true;
			fab.setListening(true);
			voice!
				.startSTT(config.endpoint, {
					// Gradium's semantic VAD (or a server end_of_stream) resolves the
					// utterance here; stop() only cancels and never reaches this.
					onFinal: (text) => {
						listening = false;
						sttHandle = null;
						fab.setListening(false);
						fab.closePanel();
						if (text) session.ask(text);
					},
				})
				.then((handle) => {
					// A cancel that raced the await already flipped `listening`; if so,
					// tear the just-opened session straight back down.
					if (!listening) handle.stop();
					else sttHandle = handle;
				})
				.catch(() => {
					listening = false;
					sttHandle = null;
					fab.setListening(false);
				});
		}

		function stopListening(): void {
			if (!listening) return;
			listening = false;
			fab.setListening(false);
			sttHandle?.stop();
			sttHandle = null;
		}

		function toggleListening(): void {
			if (listening) stopListening();
			else startListening();
		}

		fab.setMicHandler(toggleListening);

		// Keyboard hotkey. Push-to-talk (hold-to-talk-with-transcription) is not
		// supported by the voice contract — STTSession exposes only stop(), which
		// cancels the utterance without flushing a transcript (only VAD/end_of_stream
		// flush, and neither is exposed). So hotkeyPushToTalk falls back to
		// press-to-toggle; no keyup handler is wired.
		const hotkey = parseHotkey(config.hotkey ?? DEFAULT_HOTKEY);
		if (hotkey !== null) {
			const onKeyDown = (e: KeyboardEvent): void => {
				// Escape cancels an in-flight listen from anywhere.
				if (listening && e.code === 'Escape') {
					e.preventDefault();
					e.stopPropagation();
					stopListening();
					return;
				}
				if (!hotkeyMatches(e, hotkey)) return;
				if (e.repeat) return; // ignore key auto-repeat
				// Capture-phase + preventDefault/stopPropagation so the host page's
				// own shortcuts never see the combo (same rationale as the overlay's
				// capture-phase keyboard handling).
				e.preventDefault();
				e.stopPropagation();
				toggleListening();
			};
			document.addEventListener('keydown', onKeyDown, true);
			removeHotkey = () => document.removeEventListener('keydown', onKeyDown, true);
		}
	});

	// Cross-page survival: pick up a persisted session from before the nav.
	session.resume();
}

export function ask(question: string): void {
	if (instance === null) {
		throw new Error('handyman: call Handyman.init(config) before ask()');
	}
	instance.session.ask(question);
}

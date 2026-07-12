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

/**
 * Human label for a hotkey spec: "Alt+KeyH" → "Alt+H". Strips the physical
 * KeyboardEvent.code prefixes (Key/Digit) and, on Mac-like platforms, renders
 * Alt/Meta the way the OS labels them (⌥/⌘). Pure — platform is injected.
 */
function formatHotkeyLabel(spec: string, platform: string): string {
	const mac = /mac|iphone|ipad|ipod/i.test(platform);
	return spec
		.split('+')
		.map((p) => p.trim())
		.filter((p) => p.length > 0)
		.map((part) => {
			switch (part.toLowerCase()) {
				case 'ctrl':
				case 'control':
					return 'Ctrl';
				case 'alt':
				case 'option':
					return mac ? '⌥' : 'Alt';
				case 'shift':
					return 'Shift';
				case 'meta':
				case 'cmd':
				case 'command':
					return mac ? '⌘' : 'Meta';
				default:
					return part.replace(/^(Key|Digit)/, '');
			}
		})
		.join('+');
}

// Voice module contract (built in parallel under src/voice/). Types are
// declared locally so core compiles and ships while voice is absent.
// `transport` mirrors HandymanConfig.transport and `socketFactory`
// HandymanConfig.socketFactory: BOTH halves of the voice network surface (the
// /voice-token fetch and the Gradium WebSocket) route through the extension
// bridge, so voice works on strict-CSP third-party sites.
type VoiceTransport = HandymanConfig['transport'];
type VoiceSocketFactory = HandymanConfig['socketFactory'];
interface VoiceTTS {
	/** Create + resume the AudioContext; must run from a user gesture. */
	unlock(): void;
	speak(t: string): Promise<void>;
	stop(): void;
}
interface VoiceModule {
	createTTS(
		endpoint: string,
		transport?: VoiceTransport,
		socketFactory?: VoiceSocketFactory,
	): VoiceTTS;
	startSTT(
		endpoint: string,
		opts: { onFinal(text: string): void; onError?(err: unknown): void },
		transport?: VoiceTransport,
		socketFactory?: VoiceSocketFactory,
	): Promise<{ stop(): void }>;
}

/**
 * Human-readable cause for a voice failure. Voice dying silently is why the mic
 * "just closes instantly" with nothing in the console — every branch here is a
 * failure seen in the wild, and the user can act on each one.
 */
function voiceErrorMessage(err: unknown): string {
	const name =
		typeof err === 'object' && err !== null && 'name' in err
			? String((err as { name: unknown }).name)
			: '';
	const msg = err instanceof Error ? err.message : String(err);
	if (name === 'NotAllowedError' || /permission denied|not allowed/i.test(msg)) {
		return 'Handyman needs microphone access. Allow the mic for this site, then try again.';
	}
	if (name === 'NotFoundError' || name === 'OverconstrainedError') {
		return 'No microphone found. Connect one, then try again.';
	}
	if (/\b503\b/.test(msg)) {
		return 'Voice is not configured on the Handyman server (missing GRADIUM_API_KEY).';
	}
	if (/websocket|transport|fetch|network|timeout/i.test(msg)) {
		return 'Voice could not reach the speech service — this site may be blocking it. You can still type your question.';
	}
	return 'Voice is unavailable right now. You can still type your question.';
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
	/** ask() that also marks the FAB "pointer out" (see markBuddyOut). */
	ask(question: string): void;
	destroy(): void;
}

let instance: Instance | null = null;

export function init(config: HandymanConfig): void {
	if (instance !== null) instance.destroy();
	// Hard singleton: sweep any orphan hosts a prior instance left behind
	// (double script-load, or a bfcache-restored page whose module-level
	// `instance` reset but whose DOM survived). Two live widgets fight over
	// the overlay and a second query then never starts cleanly.
	document.querySelectorAll('[data-handyman]').forEach((h) => h.remove());

	const z = config.zIndex ?? DEFAULT_Z;
	let tts: VoiceTTS | null = null;
	// Hotkey listener teardown, installed once voice loads; called by destroy().
	let removeHotkey: (() => void) | null = null;

	// Buddy pointer state. buddyOut mirrors "the pointer is away from home" —
	// it stays true while a tour guides (follow mode exits inside pointer.ts,
	// but the FAB must still read empty) and clears ONLY in onDock below, so
	// session-driven docks (tour finish/skip) reset the FAB automatically.
	let buddyOut = false;

	function summonBuddy(): void {
		if (buddyOut) return;
		const s = session.getState();
		if (s !== 'idle' && s !== 'done') return; // tour guidance outranks buddy
		pointer.show();
		pointer.startFollow(fab.center());
		fab.setBuddyOut(true);
		buddyOut = true;
	}

	function dockBuddy(): void {
		if (!buddyOut) return;
		// Same guard as summonBuddy: a live tour owns the pointer, and a FAB
		// press mid-tour must not yank it off the step target (it would also
		// clear buddyOut via onDock while the tour still needs it).
		const s = session.getState();
		if (s !== 'idle' && s !== 'done') return;
		const c = fab.center();
		// buddyOut clears in onDock — the single place buddy state resets.
		pointer.dockTo(c.x, c.y).catch(() => {});
	}

	/** Every ask puts the pointer on duty (session shows it via pointTo), so
	 *  the FAB reads "out" until the session docks the pointer home. */
	function markBuddyOut(): void {
		buddyOut = true;
		fab.setBuddyOut(true);
	}

	const fab = createFab({
		zIndex: z,
		onFabPress: () => {
			if (buddyOut) dockBuddy();
			else summonBuddy();
		},
		// FAB submit is a real user gesture: unlock the AudioContext here so the
		// step narration that follows is audible under Chrome's autoplay policy.
		onAsk: (q) => {
			tts?.unlock();
			markBuddyOut();
			session.ask(q);
		},
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

	const pointer = createPointer({
		zIndex: z + 3,
		onDock: () => {
			buddyOut = false;
			fab.setBuddyOut(false);
		},
	});

	/** Narration failed: say so in the console, never touch the tour's UI —
	 *  the instruction text is already on screen, and the answer card must not
	 *  be replaced by an error the user can do nothing about mid-step. */
	function narrationFailed(err: unknown): void {
		console.error('[handyman] voice narration failed:', voiceErrorMessage(err), err);
	}

	/** Listening failed: this one the user asked for, so it needs an answer.
	 *  Reuse the overlay's answer card (the only message affordance there is),
	 *  but only while no tour is on screen — a live tour outranks it. */
	function listenFailed(err: unknown): void {
		console.error('[handyman] voice input failed:', voiceErrorMessage(err), err);
		const state = session.getState();
		if (state !== 'idle' && state !== 'done') return;
		overlay.showAnswer(voiceErrorMessage(err), () => {
			overlay.hide();
		});
	}

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
				return tts?.speak(text).catch(narrationFailed) ?? Promise.resolve();
			},
			onAnswer: (text) => {
				tts?.stop();
				return tts?.speak(text).catch(narrationFailed) ?? Promise.resolve();
			},
		},
	});

	instance = {
		session,
		ask(q: string): void {
			markBuddyOut();
			session.ask(q);
		},
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
		if (config.tts !== false) {
			tts = voice.createTTS(config.endpoint, config.transport, config.socketFactory);
		}
		if (config.stt === false) return;

		// Shared listen path: the FAB mic button and the keyboard hotkey both
		// drive this, so click and hotkey behave identically (same startSTT /
		// onFinal wiring, same FAB recording indicator).
		let sttHandle: { stop(): void } | null = null;
		let listening = false;

		function startListening(): void {
			if (listening) return;
			// Reached only from the mic click or the hotkey — both user gestures —
			// so unlock the AudioContext for the answer narration that follows.
			tts?.unlock();
			// The buddy pops out while we listen, signalling "I'm listening".
			// Escape-cancel leaves it out (the user can click it home).
			summonBuddy();
			listening = true;
			fab.setListening(true);
			voice!
				.startSTT(
					config.endpoint,
					{
						// Gradium's semantic VAD (or a server end_of_stream) resolves the
						// utterance here; stop() only cancels and never reaches this.
						onFinal: (text) => {
							listening = false;
							sttHandle = null;
							fab.setListening(false);
							fab.closePanel();
							if (text) {
								markBuddyOut();
								session.ask(text);
							}
						},
						// Mid-utterance death (socket dropped, server error frame).
						onError: (err) => {
							if (!listening) return; // already cancelled by the user
							listening = false;
							sttHandle = null;
							fab.setListening(false);
							listenFailed(err);
						},
					},
					config.transport,
					config.socketFactory,
				)
				.then((handle) => {
					// A cancel that raced the await already flipped `listening`; if so,
					// tear the just-opened session straight back down.
					if (!listening) handle.stop();
					else sttHandle = handle;
				})
				.catch((err: unknown) => {
					listening = false;
					sttHandle = null;
					fab.setListening(false);
					listenFailed(err);
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
			// Advertise the hotkey only now that it actually works — a failed
			// voice load must not leave a dead "(Alt+H to speak)" promise around.
			fab.setHotkeyLabel(
				formatHotkeyLabel(
					config.hotkey ?? DEFAULT_HOTKEY,
					typeof navigator !== 'undefined' ? navigator.platform : '',
				),
			);
		}
	});

	// Cross-page survival: pick up a persisted session from before the nav.
	session.resume();
}

export function ask(question: string): void {
	if (instance === null) {
		throw new Error('handyman: call Handyman.init(config) before ask()');
	}
	instance.ask(question);
}

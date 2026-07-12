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
			session.destroy();
			overlay.destroy();
			pointer.destroy();
			fab.destroy();
			tts?.stop();
			instance = null;
		},
	};

	// Voice is optional: wire TTS + the FAB mic if the module is present.
	void loadVoice().then((voice) => {
		if (voice === null || instance === null) return;
		if (config.tts !== false) tts = voice.createTTS(config.endpoint);
		if (config.stt !== false) {
			fab.setMicHandler(() => {
				void voice
					.startSTT(config.endpoint, {
						onFinal: (text) => {
							fab.closePanel();
							session.ask(text);
						},
					})
					.catch(() => {});
			});
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

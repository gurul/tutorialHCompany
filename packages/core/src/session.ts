// Agent loop state machine.
//
//   idle → asking → observing → showing_step → waiting_user | acting
//        → observing → … → done
//
// observe = screenshot → POST /step → render the returned tool_call.
// Guide mode waits for the user's real click inside the cutout (or Next);
// act mode (or "Do it for me") dispatches the events itself.

import type {
	ActClickCall,
	ActWriteCall,
	HandymanConfig,
	PointCall,
	Step,
	StepRequest,
	StepResponse,
} from './types.ts';
import type { OverlayHandle } from './overlay.ts';
import type { PointerHandle } from './pointer.ts';
import type { ViewportCapture } from './capture.ts';
import { isInteractive, snapToElement, type SnapResult } from './snap.ts';

export type SessionState =
	| 'idle'
	| 'asking'
	| 'observing'
	| 'showing_step'
	| 'waiting_user'
	| 'acting'
	| 'done';

/** TTS hook points — index.ts wires voice onto these. */
export interface SessionCallbacks {
	/** Return a promise that resolves when narration finishes; the agent
	 *  loop awaits it (capped) before acting so it never talks over itself. */
	onStepInstruction?(text: string): void | Promise<void>;
	onAnswer?(text: string): void | Promise<void>;
	onStateChange?(state: SessionState): void;
	onError?(err: unknown): void;
}

/** Injectable so tests run in milliseconds. */
export interface SessionTimings {
	settleQuiet: number;
	settleFloor: number;
	settleCap: number;
	glideMs: number;
	/** Max time to wait for narration before acting anyway (stuck TTS guard). */
	narrationCap: number;
	/** Beat after an agent action so the user sees the result land. */
	postActPause: number;
}

// Tightened 2026-07-11 to cut client-side per-step latency (the model call and
// narration dominate; these fixed animation/settle waits were padded). Still
// long enough for the glide to read and the DOM to quiesce; all overridable via
// deps.timings (tests inject their own). narrationCap is voice-bound — untouched.
const DEFAULT_TIMINGS: SessionTimings = {
	settleQuiet: 300,
	settleFloor: 180,
	settleCap: 1400,
	glideMs: 350,
	narrationCap: 12000,
	postActPause: 250,
};

interface PersistedSession {
	session_id: string;
	question: string;
	mode: 'live' | 'replay';
	/** Steps already shown, so the counter survives full navigations. */
	step_number?: number;
	/** Live only: steps received so far, so the finished tour caches the
	 *  COMPLETE list even when it spanned several page loads. */
	recorded?: Step[];
	/** Where the tour STARTED — multi-page tours must cache under the page
	 *  the user asks on, not wherever the answer step lands. */
	origin_path?: string;
	/** "Do it for me" toggle, so autopilot survives full page loads. */
	act_mode?: boolean;
	/** Replay only: the cached step list and cursor. */
	replay_steps?: Step[];
	replay_index?: number;
}

export interface SessionDeps {
	config: HandymanConfig;
	overlay: OverlayHandle;
	pointer: PointerHandle;
	fabCenter(): { x: number; y: number };
	capture(): Promise<ViewportCapture>;
	callbacks?: SessionCallbacks;
	timings?: Partial<SessionTimings>;
}

export interface SessionHandle {
	ask(question: string): void;
	/** Resume a persisted cross-page session. Returns true if one existed. */
	resume(): boolean;
	stop(): void;
	getState(): SessionState;
	/** Session-facing hooks for the overlay's UI callbacks. */
	ui: {
		next(): void;
		back(): void;
		skip(): void;
		doIt(): void;
		targetLost(): void;
	};
	destroy(): void;
}

function sessionKey(prefix: string): string {
	return `${prefix}:session`;
}

interface TransportInit {
	method: 'GET' | 'POST';
	body?: unknown;
}

/** Default transport: fetch against `endpoint + path`, returns parsed JSON. */
async function fetchTransport(
	endpoint: string,
	path: string,
	init: TransportInit,
): Promise<unknown> {
	const res = await fetch(`${endpoint}${path}`, {
		method: init.method,
		headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	});
	if (!res.ok) throw new Error(`handyman: ${path} ${res.status}`);
	return res.json();
}

/** Narrow an unknown transport payload to StepResponse before use. */
function asStepResponse(raw: unknown): StepResponse {
	if (
		typeof raw !== 'object' ||
		raw === null ||
		typeof (raw as { step?: unknown }).step !== 'object' ||
		(raw as { step?: unknown }).step === null
	) {
		throw new Error('handyman: malformed /step response');
	}
	return raw as StepResponse;
}

function cacheKey(prefix: string, originPath: string, question: string): string {
	return `${prefix}:cache:v1:${originPath}:${question}`;
}

const DESCRIPTION_QUERY =
	'button, a[href], input, select, textarea, summary, label, [role="button"], [role="link"], [role="tab"], [role="menuitem"]';

/** Replay re-snap: match the cached element description against visible
 *  interactive elements; fall back to the cached coordinates. */
const EDITABLE_QUERY = 'input, textarea, [contenteditable="true"], [contenteditable=""]';

function isEditable(el: Element): boolean {
	if (el instanceof HTMLInputElement) {
		return !['button', 'submit', 'reset', 'checkbox', 'radio', 'file'].includes(el.type);
	}
	if (el instanceof HTMLTextAreaElement) return true;
	return el instanceof HTMLElement && el.isContentEditable;
}

/** The editable target for act_write: the element itself, or an input
 *  inside it (models often describe the labelled row, not the input). */
function resolveEditable(el: Element | null): Element | null {
	if (el === null) return null;
	if (isEditable(el)) return el;
	for (const child of el.querySelectorAll(EDITABLE_QUERY)) {
		if (isEditable(child)) return child;
	}
	return null;
}

function labelOf(el: Element): string {
	return (
		el.getAttribute('aria-label') ??
		el.getAttribute('placeholder') ??
		el.getAttribute('title') ??
		el.textContent ??
		''
	)
		.trim()
		.toLowerCase();
}

// Generic words carry no disambiguating signal — a description of "the Add to
// cart button" and six "Add … to cart" buttons only differ by the product noun.
const STOP_WORDS = new Set([
	'the', 'a', 'an', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'with',
	'button', 'link', 'icon', 'field', 'input', 'box', 'menu', 'item', 'option',
	'click', 'select', 'choose', 'press', 'tap', 'open', 'go', 'your', 'you',
	'this', 'that', 'it', 'into', 'under', 'above', 'below', 'next', 'top',
	'bottom', 'left', 'right', 'corner', 'page', 'section', 'primary', 'please',
	'named', 'labeled', 'labelled', 'called', 'product', 'element',
]);

function meaningfulTokens(s: string): string[] {
	return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
		(w) => w.length > 1 && !STOP_WORDS.has(w),
	);
}

/**
 * Resolve a model element description to a real interactive element. Priority:
 *   1. a quoted label the description names verbatim ("the 'New Invoice' button")
 *   2. the element sharing the most meaningful tokens with the description —
 *      this is what disambiguates one "Add … to cart" among many by the product
 *      noun when the coordinate hit landed on a non-interactive sibling.
 *   3. a plain substring match either direction (last resort).
 */
export function findByDescription(desc: string, editableOnly = false): Element | null {
	const needle = desc.trim().toLowerCase();
	if (needle.length === 0) return null;
	const quoted = [...desc.matchAll(/['"‘“]([^'"’”]{2,60})['"’”]/g)].map((m) =>
		(m[1] ?? '').trim().toLowerCase(),
	);
	const descTokens = new Set(meaningfulTokens(desc));
	const query = editableOnly ? EDITABLE_QUERY : DESCRIPTION_QUERY;
	let best: Element | null = null;
	let bestScore = 0;
	let substring: Element | null = null;
	for (const el of document.querySelectorAll(query)) {
		if (el.closest('[data-handyman]') !== null) continue;
		if (editableOnly && !isEditable(el)) continue;
		const label = labelOf(el);
		if (label.length === 0) continue;
		if (quoted.some((q) => q.length > 0 && (label.includes(q) || q.includes(label)))) {
			return el;
		}
		let score = 0;
		for (const t of new Set(meaningfulTokens(label))) if (descTokens.has(t)) score++;
		if (score > bestScore) {
			bestScore = score;
			best = el;
		}
		if (substring === null && (label.includes(needle) || needle.includes(label))) {
			substring = el;
		}
	}
	// Two shared meaningful tokens is a confident match; one is too weak to trust
	// over the substring signal.
	if (bestScore >= 2) return best;
	return substring;
}

/** React & co. track the value via a property descriptor; write through the
 *  native prototype setter so their change detection still fires. */
function setNativeValue(
	el: HTMLInputElement | HTMLTextAreaElement,
	value: string,
): void {
	const proto =
		el instanceof HTMLTextAreaElement
			? HTMLTextAreaElement.prototype
			: HTMLInputElement.prototype;
	const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
	if (setter) setter.call(el, value);
	else el.value = value;
}

export function createSession(deps: SessionDeps): SessionHandle {
	const { config, overlay, pointer, capture } = deps;
	const cb = deps.callbacks ?? {};
	const timings: SessionTimings = { ...DEFAULT_TIMINGS, ...deps.timings };
	const prefix = config.storagePrefix ?? 'handyman';

	let state: SessionState = 'idle';
	let sessionId = '';
	let question = '';
	let stepNumber = 0;
	let recorded: Step[] = [];
	let actMode = false;
	let replaySteps: Step[] | null = null;
	let replayIndex = 0;
	let currentSnap: SnapResult | null = null;
	let currentStep: Step | null = null;
	// origin+pathname of the page the tour STARTED on; cache key anchor.
	let originPath = '';
	// Bumped on stop/new ask so stale async continuations become no-ops.
	let gen = 0;
	let targetClickCleanup: (() => void) | null = null;

	function setState(s: SessionState): void {
		state = s;
		cb.onStateChange?.(s);
	}

	/** Route a proxy call through config.transport when provided (the extension
	 *  relays it past the host page's CSP), else the default fetch. */
	function callProxy(path: string, init: TransportInit): Promise<unknown> {
		return config.transport
			? config.transport(path, init)
			: fetchTransport(config.endpoint, path, init);
	}

	function persist(): void {
		const data: PersistedSession = {
			session_id: sessionId,
			question,
			mode: replaySteps === null ? 'live' : 'replay',
			step_number: stepNumber,
			act_mode: actMode,
		};
		if (replaySteps !== null) {
			data.replay_steps = replaySteps;
			data.replay_index = replayIndex;
		} else {
			data.recorded = recorded;
			data.origin_path = originPath;
		}
		try {
			sessionStorage.setItem(sessionKey(prefix), JSON.stringify(data));
		} catch {
			// storage full/unavailable — cross-page survival degrades, tour continues
		}
	}

	function clearPersisted(): void {
		try {
			sessionStorage.removeItem(sessionKey(prefix));
		} catch {
			// ignore
		}
	}

	function readPersisted(): PersistedSession | null {
		try {
			const raw = sessionStorage.getItem(sessionKey(prefix));
			if (raw === null) return null;
			return JSON.parse(raw) as PersistedSession;
		} catch {
			return null;
		}
	}

	function readCache(q: string): Step[] | null {
		try {
			const raw = localStorage.getItem(
				cacheKey(prefix, location.origin + location.pathname, q),
			);
			if (raw === null) return null;
			const steps = JSON.parse(raw) as Step[];
			return Array.isArray(steps) && steps.length > 0 ? steps : null;
		} catch {
			return null;
		}
	}

	function writeCache(q: string, steps: Step[]): void {
		try {
			const anchor = originPath || location.origin + location.pathname;
			localStorage.setItem(cacheKey(prefix, anchor, q), JSON.stringify(steps));
		} catch {
			// ignore
		}
	}

	/** Fire the narration callback and hand back a promise that settles when
	 *  the sentence has been spoken (or immediately if voice is off). */
	function narrate(text: string): Promise<void> {
		const r = cb.onStepInstruction?.(text);
		return r instanceof Promise ? r : Promise.resolve();
	}

	/** Resolve when p settles OR the cap elapses, whichever comes first. */
	function capped(p: Promise<void>, ms: number): Promise<void> {
		return Promise.race([
			p.catch(() => {}),
			new Promise<void>((res) => setTimeout(res, ms)),
		]);
	}

	function detachTargetListener(): void {
		targetClickCleanup?.();
		targetClickCleanup = null;
	}

	/** MutationObserver settle: quiet-window debounce with floor + cap. */
	function settle(): Promise<void> {
		return new Promise((resolve) => {
			const start = Date.now();
			let finished = false;
			let quietTimer: ReturnType<typeof setTimeout>;
			const observer = new MutationObserver(() => {
				clearTimeout(quietTimer);
				quietTimer = setTimeout(tryFinish, timings.settleQuiet);
			});
			const capTimer = setTimeout(finish, timings.settleCap);
			function finish(): void {
				if (finished) return;
				finished = true;
				observer.disconnect();
				clearTimeout(quietTimer);
				clearTimeout(capTimer);
				resolve();
			}
			function tryFinish(): void {
				const remaining = timings.settleFloor - (Date.now() - start);
				if (remaining > 0) quietTimer = setTimeout(tryFinish, remaining);
				else finish();
			}
			observer.observe(document.documentElement, {
				childList: true,
				subtree: true,
				attributes: true,
				characterData: true,
			});
			quietTimer = setTimeout(tryFinish, timings.settleQuiet);
		});
	}

	function fail(err: unknown): void {
		cb.onError?.(err);
		detachTargetListener();
		clearPersisted();
		overlay.showAnswer(
			'Handyman could not finish this tour. Try asking again.',
			() => {
				overlay.hide();
			},
		);
		pointer.dockTo(deps.fabCenter().x, deps.fabCenter().y).catch(() => {});
		setState('done');
	}

	async function observe(
		event: StepRequest['event'],
		myGen: number,
	): Promise<void> {
		if (myGen !== gen) return;
		setState('observing');
		detachTargetListener();
		overlay.hide();
		try {
			const { screenshot, viewport } = await capture();
			if (myGen !== gen) return;
			const body: StepRequest = {
				session_id: sessionId,
				question,
				screenshot,
				viewport,
				event,
				url: location.href,
			};
			const { step } = asStepResponse(await callProxy('/step', { method: 'POST', body }));
			if (myGen !== gen) return;
			recorded.push(step);
			handleStep(step, myGen);
		} catch (err) {
			if (myGen !== gen) return;
			fail(err);
		}
	}

	function finishWithAnswer(content: string, myGen: number): void {
		detachTargetListener();
		cb.onAnswer?.(content);
		overlay.showAnswer(content, () => {
			if (myGen !== gen) return;
			overlay.hide();
		});
		const c = deps.fabCenter();
		pointer.dockTo(c.x, c.y).catch(() => {});
		// recorded spans page loads (restored from the persisted session), so
		// this is the complete tour even when it crossed several navigations.
		if (replaySteps === null && recorded.length > 0) {
			writeCache(question, recorded);
		}
		clearPersisted();
		setState('done');
	}

	function handleStep(step: Step, myGen: number): void {
		currentStep = step;
		const tc = step.tool_call;
		switch (tc.tool_name) {
			case 'answer':
				finishWithAnswer(tc.content, myGen);
				return;
			case 'point':
				if (actMode) {
					// User flipped "Do it for me": treat point steps as clicks.
					void performAct(
						{ ...tc, tool_name: 'act_click' },
						myGen,
					);
					return;
				}
				showPoint(tc, myGen);
				return;
			case 'act_click':
			case 'act_write':
				void performAct(tc, myGen);
				return;
		}
	}

	function snapFor(tc: PointCall | ActClickCall | ActWriteCall): SnapResult {
		const needsEditable = tc.tool_name === 'act_write';
		if (replaySteps !== null) {
			const el = findByDescription(tc.element, needsEditable);
			if (el !== null) return ensureVisible({ el, rect: el.getBoundingClientRect() });
		}
		const snap = snapToElement(tc.x, tc.y, {
			width: window.innerWidth,
			height: window.innerHeight,
		});
		if (needsEditable) {
			// The write must land on something editable or it silently no-ops.
			const ed = resolveEditable(snap.el);
			if (ed !== null) return ensureVisible({ el: ed, rect: ed.getBoundingClientRect() });
		} else if (snap.el !== null && isInteractive(snap.el)) {
			return ensureVisible(snap);
		}
		// Coord snap found nothing usable (grounding drift, or the target is
		// scrolled out of view where elementFromPoint cannot see it) — fall
		// back to the model's own element description.
		const el = findByDescription(tc.element, needsEditable);
		if (el !== null) return ensureVisible({ el, rect: el.getBoundingClientRect() });
		return snap;
	}

	function ensureVisible(snap: SnapResult): SnapResult {
		const el = snap.el;
		if (el === null) return snap;
		const r = snap.rect;
		const off =
			r.top < 0 || r.left < 0 || r.bottom > window.innerHeight || r.right > window.innerWidth;
		if (!off) return snap;
		(el as HTMLElement).scrollIntoView?.({ block: 'center', inline: 'nearest' });
		return { el, rect: el.getBoundingClientRect() };
	}

	function counterText(): string {
		return replaySteps !== null
			? `Step ${stepNumber} of ${Math.max(1, replaySteps.length - 1)}`
			: `Step ${stepNumber}`;
	}

	function showPoint(tc: PointCall, myGen: number): void {
		setState('showing_step');
		stepNumber += 1;
		// Persist NOW: a link click navigates before advance()'s settle runs,
		// so anything persisted later never survives full page loads.
		persist();
		const snap = snapFor(tc);
		currentSnap = snap;
		const { cut, side } = overlay.showStep({
			el: snap.el,
			rect: snap.rect,
			instruction: tc.instruction,
			counter: counterText(),
			showDoIt: true,
		});
		pointer.show();
		pointer.pointTo(cut, side);
		// Guide mode: narrate, but the user paces the step, so don't await.
		void narrate(tc.instruction);
		setState('waiting_user');

		// A real user click inside the cutout advances the tour — the
		// click-through scrim panels make this possible.
		if (snap.el !== null) {
			const el = snap.el;
			const onClick = (): void => {
				if (myGen !== gen || state !== 'waiting_user') return;
				advance('user_acted', myGen);
			};
			el.addEventListener('click', onClick, { once: true });
			targetClickCleanup = () => el.removeEventListener('click', onClick);
		}
	}

	function advance(event: StepRequest['event'], myGen: number): void {
		if (myGen !== gen) return;
		detachTargetListener();
		setState('observing');
		void (async () => {
			await settle();
			if (myGen !== gen) return;
			if (replaySteps !== null) {
				replayIndex += 1;
				persist();
				playReplay(myGen);
			} else {
				persist();
				await observe(event, myGen);
			}
		})();
	}

	async function performAct(
		tc: ActClickCall | ActWriteCall,
		myGen: number,
	): Promise<void> {
		setState('acting');
		stepNumber += 1;
		persist();
		const snap = snapFor(tc);
		currentSnap = snap;
		const { cut, side } = overlay.showStep({
			el: snap.el,
			rect: snap.rect,
			instruction: tc.instruction,
			counter: counterText(),
			showDoIt: false,
		});
		const narration = narrate(tc.instruction);
		pointer.show();
		pointer.pointTo(cut, side);
		// Glide while the sentence is spoken, then act — never mid-narration.
		await Promise.all([
			new Promise((r) => setTimeout(r, timings.glideMs)),
			capped(narration, timings.narrationCap),
		]);
		if (myGen !== gen) return;
		await pointer.press();
		if (myGen !== gen) return;

		const el = snap.el;
		if (el !== null) {
			if (tc.tool_name === 'act_click') {
				(el as HTMLElement).click?.();
			} else {
				dispatchWrite(el, tc);
			}
		}

		// Let the user register the result before the next step begins.
		await new Promise((r) => setTimeout(r, timings.postActPause));
		if (myGen !== gen) return;
		await settle();
		if (myGen !== gen) return;
		if (replaySteps !== null) {
			replayIndex += 1;
			persist();
			playReplay(myGen);
		} else {
			persist();
			await observe('agent_acted', myGen);
		}
	}

	function dispatchWrite(el: Element, tc: ActWriteCall): void {
		if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
			el.focus();
			setNativeValue(el, tc.content);
			el.dispatchEvent(new Event('input', { bubbles: true }));
			el.dispatchEvent(new Event('change', { bubbles: true }));
			if (tc.press_enter) {
				const opts = { key: 'Enter', code: 'Enter', bubbles: true };
				el.dispatchEvent(new KeyboardEvent('keydown', opts));
				el.dispatchEvent(new KeyboardEvent('keyup', opts));
			}
			return;
		}
		if (el instanceof HTMLElement && el.isContentEditable) {
			el.focus();
			el.textContent = tc.content;
			el.dispatchEvent(new Event('input', { bubbles: true }));
		}
	}

	function playReplay(myGen: number): void {
		if (myGen !== gen || replaySteps === null) return;
		const step = replaySteps[replayIndex];
		if (step === undefined) {
			// Cache exhausted without an answer step — end quietly.
			endSession();
			return;
		}
		handleStep(step, myGen);
	}

	function endSession(): void {
		detachTargetListener();
		clearPersisted();
		overlay.hide();
		const c = deps.fabCenter();
		pointer.dockTo(c.x, c.y).catch(() => {});
		setState('done');
	}

	function startLive(q: string): void {
		gen += 1;
		const myGen = gen;
		question = q;
		sessionId =
			typeof crypto !== 'undefined' && 'randomUUID' in crypto
				? crypto.randomUUID()
				: `hm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		stepNumber = 0;
		recorded = [];
		replaySteps = null;
		replayIndex = 0;
		actMode = false;
		originPath = location.origin + location.pathname;
		setState('asking');
		persist();
		void observe('start', myGen);
	}

	function startReplay(q: string, steps: Step[]): void {
		gen += 1;
		const myGen = gen;
		question = q;
		sessionId = `replay-${Date.now()}`;
		stepNumber = 0;
		recorded = [];
		replaySteps = steps;
		replayIndex = 0;
		actMode = false;
		setState('asking');
		persist();
		playReplay(myGen);
	}

	// SPA navigations: pushState/replaceState/popstate are settle triggers —
	// while waiting for the user, a route change means they did the thing.
	function onNavigate(): void {
		if (state === 'waiting_user') {
			advance('user_acted', gen);
		}
	}
	const origPush = history.pushState.bind(history);
	const origReplace = history.replaceState.bind(history);
	history.pushState = function pushState(...args: Parameters<History['pushState']>) {
		origPush(...args);
		onNavigate();
	};
	history.replaceState = function replaceState(
		...args: Parameters<History['replaceState']>
	) {
		origReplace(...args);
		onNavigate();
	};
	window.addEventListener('popstate', onNavigate);

	return {
		ask(q: string): void {
			const cached = readCache(q);
			if (cached !== null) startReplay(q, cached);
			else startLive(q);
		},
		resume(): boolean {
			const persisted = readPersisted();
			if (persisted === null) return false;
			gen += 1;
			const myGen = gen;
			question = persisted.question;
			sessionId = persisted.session_id;
			stepNumber = persisted.step_number ?? 0;
			recorded = persisted.recorded ?? [];
			originPath = persisted.origin_path ?? '';
			actMode = persisted.act_mode ?? false;
			if (persisted.mode === 'replay' && persisted.replay_steps !== undefined) {
				replaySteps = persisted.replay_steps;
				replayIndex = persisted.replay_index ?? 0;
				void settle().then(() => {
					if (myGen === gen) playReplay(myGen);
				});
			} else {
				replaySteps = null;
				void settle().then(() => {
					if (myGen === gen) void observe('user_acted', myGen);
				});
			}
			return true;
		},
		stop(): void {
			gen += 1;
			endSession();
		},
		getState(): SessionState {
			return state;
		},
		ui: {
			next(): void {
				if (state === 'waiting_user') advance('user_acted', gen);
			},
			back(): void {
				// The agent loop cannot rewind an observation; back is a no-op.
			},
			skip(): void {
				if (state === 'done' || state === 'idle') return;
				gen += 1;
				endSession();
			},
			doIt(): void {
				actMode = true;
				persist();
				if (
					state === 'waiting_user' &&
					currentStep !== null &&
					currentStep.tool_call.tool_name === 'point' &&
					currentSnap !== null
				) {
					const tc = currentStep.tool_call;
					detachTargetListener();
					// Undo the double-count: performAct increments stepNumber
					// for what is visually the same step.
					stepNumber -= 1;
					void performAct({ ...tc, tool_name: 'act_click' }, gen);
				}
			},
			targetLost(): void {
				// Element vanished mid-step: re-observe rather than crash.
				if (state === 'waiting_user') advance('user_acted', gen);
			},
		},
		destroy(): void {
			gen += 1;
			detachTargetListener();
			history.pushState = origPush;
			history.replaceState = origReplace;
			window.removeEventListener('popstate', onNavigate);
		},
	};
}

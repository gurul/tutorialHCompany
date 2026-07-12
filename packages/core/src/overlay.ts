// Overlay engine — a light highlight ring on the target plus a tooltip card.
// No page dimming and no click-eating scrim: the whole page stays live and
// interactive, the animated pointer moves to the element, and the card shows
// the instruction. A real user click on the highlighted element advances the
// tour (session wires that listener directly on the target, not on a scrim).

export type Side = 'left' | 'right' | 'top' | 'bottom';

export interface CutBox {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface OverlayCallbacks {
	onNext(): void;
	onBack(): void;
	onSkip(): void;
	/** "Do it for me" toggle pressed while a step is showing. */
	onDoIt(): void;
	/** Current target element left the DOM (re-observe, don't crash). */
	onTargetLost(): void;
}

export interface OverlayStepInput {
	/** Snapped target element; null = coordinate fallback (rect only). */
	el: Element | null;
	rect: DOMRect;
	instruction: string;
	/** e.g. "Step 3" or "Step 3 of 5". */
	counter: string;
	/** Show the "Do it for me" toggle (guide-mode point steps). */
	showDoIt: boolean;
}

export interface OverlayHandle {
	/** Show a step. Returns the padded cutout + chosen side for the pointer. */
	showStep(input: OverlayStepInput): { cut: CutBox; side: Side };
	/** Final answer card: centered, no spotlight. Enter/Escape also close. */
	showAnswer(content: string, onDone: () => void): void;
	hide(): void;
	destroy(): void;
}

const PAD = 8;
const CARD_W = 300;
const CARD_H_EST = 170;
const MARGIN = 16;
// Clearance between the cutout edge and the card, past the pointer.
const POINTER_CLEAR = 64;

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(Math.max(v, lo), hi < lo ? lo : hi);
}

/** Side with the most free viewport space around the cutout. */
function pickSide(cut: CutBox): Side {
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const spaces: Array<[Side, number]> = [
		['right', vw - (cut.left + cut.width)],
		['left', cut.left],
		['bottom', vh - (cut.top + cut.height)],
		['top', cut.top],
	];
	let best = spaces[0]!;
	for (const s of spaces) if (s[1] > best[1]) best = s;
	return best[0];
}

/** Card top-left, on the pointer's side of the target, clamped to viewport. */
function cardPlacement(cut: CutBox, side: Side): { left: number; top: number } {
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const cx = cut.left + cut.width / 2;
	const cy = cut.top + cut.height / 2;
	let left: number;
	let top: number;
	switch (side) {
		case 'right':
			left = cut.left + cut.width + 12 + POINTER_CLEAR;
			top = cy - CARD_H_EST / 2;
			break;
		case 'left':
			left = cut.left - 12 - POINTER_CLEAR - CARD_W;
			top = cy - CARD_H_EST / 2;
			break;
		case 'bottom':
			left = cx - CARD_W / 2;
			top = cut.top + cut.height + 12 + POINTER_CLEAR;
			break;
		case 'top':
			left = cx - CARD_W / 2;
			top = cut.top - 12 - POINTER_CLEAR - CARD_H_EST;
			break;
	}
	return {
		left: clamp(left, MARGIN, vw - CARD_W - MARGIN),
		top: clamp(top, MARGIN, vh - CARD_H_EST - MARGIN),
	};
}

const OVERLAY_CSS = `
:host {
	/* Host stays click-through so the page underneath is fully interactive;
	   only the card re-enables pointer-events. Explicit font/box baseline so
	   nothing inherits from the third-party host page. */
	pointer-events: none;
	font-family: var(--handyman-font, 'Figtree', system-ui, sans-serif);
	font-size: 13px;
	line-height: 1.4;
	font-weight: 400;
}
*, *::before, *::after { box-sizing: border-box; }
/* Light highlight ring on the target — no page dimming, no click blocking.
   A crisp accent outline plus a soft halo so the element reads clearly on any
   background without hiding the rest of the page. Slightly longer ease-out
   curve than the card so the ring trails fluidly instead of snapping. */
.handyman-spotlight {
	position: fixed;
	border-radius: 8px;
	box-shadow:
		0 0 0 2px var(--handyman-accent, #4353ff),
		0 0 0 5px color-mix(in srgb, var(--handyman-accent, #4353ff) 30%, transparent),
		0 0 14px 2px color-mix(in srgb, var(--handyman-accent, #4353ff) 35%, transparent);
	transition:
		left 420ms cubic-bezier(0.22, 1, 0.36, 1),
		top 420ms cubic-bezier(0.22, 1, 0.36, 1),
		width 420ms cubic-bezier(0.22, 1, 0.36, 1),
		height 420ms cubic-bezier(0.22, 1, 0.36, 1),
		opacity 200ms ease;
	pointer-events: none;
}
.handyman-card {
	position: fixed;
	/* The :host is click-through so the page stays interactive; the card is the
	   one part that must take clicks, or Next/Skip/Do-it-for-me are dead. */
	pointer-events: auto;
	width: ${CARD_W}px;
	box-sizing: border-box;
	background: var(--handyman-paper, #fff);
	color: var(--handyman-ink, #16161a);
	border: 1px solid var(--handyman-border, rgba(22, 22, 26, 0.1));
	border-radius: 14px;
	/* Layered shadow: tight contact edge + medium spread + far ambient, so the
	   card floats instead of stamping a single hard drop on the host page. */
	box-shadow:
		0 1px 2px rgba(0, 0, 0, 0.06),
		0 8px 24px rgba(0, 0, 0, 0.12),
		0 24px 56px rgba(0, 0, 0, 0.08);
	padding: 16px;
	outline: none;
	font-family: var(--handyman-font, 'Figtree', system-ui, sans-serif);
	/* Same ease-out family as the spotlight ring so the two elements tracking
	   one step move stay in sync; overshoot is reserved for the pointer (real
	   spring) and would also carry the card past its clamped placement. */
	transition:
		left 420ms cubic-bezier(0.22, 1, 0.36, 1),
		top 420ms cubic-bezier(0.22, 1, 0.36, 1),
		opacity 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
/* Entrance on hidden → shown only; step-to-step moves use the transition. */
@keyframes handyman-card-in {
	from { opacity: 0; transform: translateY(8px); }
	to { opacity: 1; transform: translateY(0); }
}
.handyman-card--enter {
	animation: handyman-card-in 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
.handyman-card__counter {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 11px;
	font-weight: 500;
	letter-spacing: 0.02em;
	color: var(--handyman-ink-40, rgba(22, 22, 26, 0.4));
	margin-bottom: 6px;
}
.handyman-dots { display: inline-flex; align-items: center; gap: 4px; }
.handyman-dot {
	width: 5px;
	height: 5px;
	border-radius: 50%;
	border: 1px solid var(--handyman-ink-40, rgba(22, 22, 26, 0.4));
	background: transparent;
	transition: background 200ms ease, border-color 200ms ease;
}
.handyman-dot--done {
	background: var(--handyman-accent, #4353ff);
	border-color: var(--handyman-accent, #4353ff);
}
.handyman-card__text {
	/* The instruction is the card's headline — a step up from the 13px chrome,
	   medium weight (Figtree is variable, so 500 renders true, not faux-bold). */
	font-size: 14px;
	font-weight: 500;
	line-height: 1.45;
	margin-bottom: 12px;
}
.handyman-card__row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}
.handyman-card__actions { display: flex; gap: 8px; }
.handyman-btn {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	border: 1px solid var(--handyman-border, rgba(22, 22, 26, 0.15));
	background: var(--handyman-paper, #fff);
	color: var(--handyman-ink, #16161a);
	font-size: 12px;
	font-weight: 600;
	letter-spacing: 0.01em;
	font-family: inherit;
	border-radius: 8px;
	padding: 6px 10px;
	cursor: pointer;
	white-space: nowrap;
	transition: background 120ms ease, border-color 120ms ease, color 120ms ease, transform 120ms ease;
}
.handyman-btn svg { display: block; }
.handyman-btn:hover {
	background: color-mix(in srgb, var(--handyman-ink, #16161a) 6%, var(--handyman-paper, #fff));
}
.handyman-btn:active { transform: scale(0.97); }
.handyman-btn:focus-visible {
	outline: 2px solid var(--handyman-accent, #4353ff);
	outline-offset: 2px;
}
.handyman-btn--primary {
	background: var(--handyman-ink, #16161a);
	color: var(--handyman-paper, #fff);
	border-color: var(--handyman-ink, #16161a);
}
.handyman-btn--primary:hover {
	background: color-mix(in srgb, var(--handyman-ink, #16161a) 85%, var(--handyman-paper, #fff));
}
.handyman-btn--ghost {
	border-color: transparent;
	background: transparent;
	color: var(--handyman-ink-60, rgba(22, 22, 26, 0.6));
}
.handyman-btn--ghost:hover {
	background: color-mix(in srgb, var(--handyman-ink, #16161a) 6%, transparent);
	color: var(--handyman-ink, #16161a);
}
.handyman-btn[aria-pressed="true"],
.handyman-btn[aria-pressed="true"]:hover {
	background: var(--handyman-accent, #4353ff);
	border-color: var(--handyman-accent, #4353ff);
	color: #fff;
}
.handyman-card__hint {
	margin-top: 10px;
	font-size: 11px;
	color: color-mix(in srgb, var(--handyman-ink, #16161a) 45%, transparent);
}
@media (prefers-reduced-motion: reduce) {
	.handyman-spotlight, .handyman-card, .handyman-pointer, .handyman-pointer__bob, .handyman-fab,
	.handyman-btn, .handyman-dot {
		transition-duration: 0ms !important;
		animation: none !important;
	}
}
`;

export function createOverlay(opts: {
	zIndex: number;
	callbacks: OverlayCallbacks;
}): OverlayHandle {
	const { zIndex, callbacks } = opts;
	const root = document.createElement('div');
	root.setAttribute('data-handyman', 'overlay');
	// All markup lives inside a shadow root so the host page's CSS can't deform
	// the card/spotlight and our styles can't leak out. The host element itself
	// stays in the light DOM carrying [data-handyman] (snapdom exclusion + the
	// capture-phase key handlers key on the document).
	const shadow = root.attachShadow({ mode: 'open' });

	// Clicking our own card must not dismiss the page's open UI. Sites close
	// dropdowns/menus/popovers on a document-level "click outside" listener, and
	// a click on the card IS outside their menu — so pressing Next would collapse
	// the very menu the next step points into. Stopping propagation at the host,
	// in the BUBBLE phase, keeps the event fully usable inside the shadow root
	// (our buttons have already handled it by the time it reaches here) while it
	// never reaches document/window listeners on the page.
	// Caveat: a page listening in the CAPTURE phase still sees it — capture runs
	// top-down before the event ever reaches us, and the only way to beat that is
	// to swallow the event before our own buttons get it.
	const POINTER_EVENTS = [
		'pointerdown',
		'pointerup',
		'mousedown',
		'mouseup',
		'click',
		'dblclick',
		'touchstart',
		'touchend',
	] as const;
	const containPointer = (e: Event): void => e.stopPropagation();
	for (const type of POINTER_EVENTS) root.addEventListener(type, containPointer);

	const style = document.createElement('style');
	style.textContent = OVERLAY_CSS;
	shadow.appendChild(style);

	// Highlight ring only — no click-eating panels, so the page underneath
	// stays fully interactive.
	const spotlight = document.createElement('div');
	spotlight.className = 'handyman-spotlight';
	spotlight.setAttribute('aria-hidden', 'true');
	spotlight.style.zIndex = String(zIndex + 1);
	shadow.appendChild(spotlight);

	const card = document.createElement('div');
	card.className = 'handyman-card';
	card.tabIndex = -1;
	card.setAttribute('role', 'dialog');
	card.style.zIndex = String(zIndex + 2);

	const counterEl = document.createElement('div');
	counterEl.className = 'handyman-card__counter';
	const textEl = document.createElement('div');
	textEl.className = 'handyman-card__text';
	const row = document.createElement('div');
	row.className = 'handyman-card__row';

	const skipBtn = document.createElement('button');
	skipBtn.type = 'button';
	skipBtn.className = 'handyman-btn handyman-btn--ghost';
	skipBtn.dataset.handymanBtn = 'skip';
	skipBtn.textContent = 'Skip';
	skipBtn.addEventListener('click', () => callbacks.onSkip());

	const actions = document.createElement('div');
	actions.className = 'handyman-card__actions';

	const doItBtn = document.createElement('button');
	doItBtn.type = 'button';
	doItBtn.className = 'handyman-btn';
	doItBtn.dataset.handymanBtn = 'doit';
	// Inline SVG spark (no emoji font dependency on the host page).
	doItBtn.innerHTML =
		'<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="currentColor">' +
		'<path d="M5 0 L6.2 3.8 L10 5 L6.2 6.2 L5 10 L3.8 6.2 L0 5 L3.8 3.8 Z"/></svg>';
	doItBtn.appendChild(document.createTextNode('Do it for me'));
	doItBtn.setAttribute('aria-pressed', 'false');
	doItBtn.addEventListener('click', () => {
		doItBtn.setAttribute('aria-pressed', 'true');
		callbacks.onDoIt();
	});

	const nextBtn = document.createElement('button');
	nextBtn.type = 'button';
	nextBtn.className = 'handyman-btn handyman-btn--primary';
	nextBtn.dataset.handymanBtn = 'next';
	nextBtn.textContent = 'Next';
	nextBtn.addEventListener('click', () => {
		if (answerMode) {
			const done = onAnswerDone;
			onAnswerDone = null;
			done?.();
			return;
		}
		callbacks.onNext();
	});

	actions.appendChild(doItBtn);
	actions.appendChild(nextBtn);
	row.appendChild(skipBtn);
	row.appendChild(actions);

	// Discoverability footer for the capture-phase shortcuts. aria-hidden: the
	// card's aria-label already announces counter + instruction; this is a
	// sighted-user hint only. Hidden in answer mode (arrows don't apply there).
	const hintEl = document.createElement('div');
	hintEl.className = 'handyman-card__hint';
	hintEl.setAttribute('aria-hidden', 'true');
	// Only advertise keys that do something: back() is a session no-op, so ←
	// stays out of the hint even though the handler swallows it.
	hintEl.textContent = '→ next · Esc exit';

	card.appendChild(counterEl);
	card.appendChild(textEl);
	card.appendChild(row);
	card.appendChild(hintEl);
	shadow.appendChild(card);

	document.body.appendChild(root);

	let visible = false;
	let answerMode = false;
	let onAnswerDone: (() => void) | null = null;
	let currentEl: Element | null = null;

	function setVisible(v: boolean): void {
		visible = v;
		root.style.display = v ? '' : 'none';
	}
	setVisible(false);

	// Entrance rise only on hidden → shown; while visible, step changes glide
	// via the left/top transition instead. Reflow between class toggles so a
	// hide→show in the same frame still restarts the keyframes.
	function playEntrance(): void {
		if (visible) return;
		card.classList.remove('handyman-card--enter');
		void card.offsetWidth;
		card.classList.add('handyman-card--enter');
	}

	// "Step 3 of 5" → progress dots + a muted "3/5" label. Anything else (or an
	// implausibly long tour) falls back to the plain sentence. Presentation
	// only: the card's aria-label still announces the raw counter string.
	const COUNTER_RE = /^Step (\d+) of (\d+)$/;
	function renderCounter(counter: string): void {
		const m = COUNTER_RE.exec(counter);
		counterEl.textContent = '';
		const current = m ? Number(m[1]) : 0;
		const total = m ? Number(m[2]) : 0;
		if (!m || total < 1 || total > 12 || current < 1 || current > total) {
			counterEl.removeAttribute('aria-label');
			counterEl.textContent = counter;
			return;
		}
		const dots = document.createElement('span');
		dots.className = 'handyman-dots';
		dots.setAttribute('aria-hidden', 'true');
		for (let i = 1; i <= total; i++) {
			const dot = document.createElement('span');
			dot.className = i <= current ? 'handyman-dot handyman-dot--done' : 'handyman-dot';
			dots.appendChild(dot);
		}
		const label = document.createElement('span');
		label.textContent = `${current}/${total}`;
		counterEl.appendChild(dots);
		counterEl.appendChild(label);
		counterEl.setAttribute('aria-label', counter);
	}

	function applyCut(cut: CutBox): void {
		spotlight.style.left = `${cut.left}px`;
		spotlight.style.top = `${cut.top}px`;
		spotlight.style.width = `${cut.width}px`;
		spotlight.style.height = `${cut.height}px`;
		spotlight.style.display = '';
	}

	function padRect(r: DOMRect): CutBox {
		return {
			left: r.left - PAD,
			top: r.top - PAD,
			width: r.width + PAD * 2,
			height: r.height + PAD * 2,
		};
	}

	// Re-measure on resize + scroll. Element gone → onTargetLost, not a crash.
	function remeasure(): void {
		if (!visible || answerMode) return;
		if (currentEl === null) return; // coordinate-fallback rect: nothing to track
		if (!currentEl.isConnected) {
			callbacks.onTargetLost();
			return;
		}
		const cut = padRect(currentEl.getBoundingClientRect());
		applyCut(cut);
		const side = pickSide(cut);
		const pos = cardPlacement(cut, side);
		card.style.left = `${pos.left}px`;
		card.style.top = `${pos.top}px`;
	}
	window.addEventListener('resize', remeasure, { passive: true });
	window.addEventListener('scroll', remeasure, { passive: true, capture: true });

	// Capture-phase keyboard so tour keys win over host document handlers
	// (the reference's PlatformTour.tsx:387-443 pattern).
	function onKey(e: KeyboardEvent): void {
		if (!visible) return;
		// Unlike the look-don't-touch reference, our cutout is interactive:
		// keys aimed at an editable target (user typing, agent act_write)
		// must pass through. Only Escape stays global.
		// Events crossing a shadow boundary are retargeted, so at this
		// document-level listener e.target is the shadow HOST of whatever the
		// user is really typing in, never the input itself — composedPath()[0]
		// is the true origin. (Guarded: composedPath may be absent in tests.)
		const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
		const t: EventTarget | null = path.length > 0 ? path[0]! : e.target;
		const editable =
			t instanceof HTMLElement &&
			(t instanceof HTMLInputElement ||
				t instanceof HTMLTextAreaElement ||
				t instanceof HTMLSelectElement ||
				t.isContentEditable);
		if (editable && e.key !== 'Escape') return;
		if (answerMode) {
			if (e.key === 'Escape' || e.key === 'Enter') {
				e.stopPropagation();
				e.preventDefault();
				const done = onAnswerDone;
				onAnswerDone = null;
				done?.();
			}
			return;
		}
		if (e.key === 'Escape') {
			e.stopPropagation();
			e.preventDefault();
			callbacks.onSkip();
			return;
		}
		if (e.key === 'ArrowRight') {
			e.stopPropagation();
			e.preventDefault();
			callbacks.onNext();
			return;
		}
		if (e.key === 'ArrowLeft') {
			e.stopPropagation();
			e.preventDefault();
			callbacks.onBack();
			return;
		}
		if (e.key === 'Enter') {
			// If one of our buttons is focused, let its native click fire
			// instead of double-advancing. Focus lives inside the shadow root,
			// so document.activeElement is the host — read the shadow's.
			const active = shadow.activeElement;
			if (active instanceof HTMLButtonElement && active.dataset.handymanBtn) {
				return;
			}
			e.stopPropagation();
			e.preventDefault();
			callbacks.onNext();
		}
	}
	document.addEventListener('keydown', onKey, true);

	return {
		showStep(input: OverlayStepInput): { cut: CutBox; side: Side } {
			answerMode = false;
			currentEl = input.el;
			const cut = padRect(input.rect);
			const side = pickSide(cut);
			applyCut(cut);
			renderCounter(input.counter);
			counterEl.style.display = '';
			textEl.textContent = input.instruction;
			doItBtn.style.display = input.showDoIt ? '' : 'none';
			doItBtn.setAttribute('aria-pressed', 'false');
			nextBtn.textContent = 'Next';
			nextBtn.style.display = '';
			hintEl.style.display = '';
			card.setAttribute('aria-label', `${input.counter}: ${input.instruction}`);
			const pos = cardPlacement(cut, side);
			card.style.left = `${pos.left}px`;
			card.style.top = `${pos.top}px`;
			playEntrance();
			setVisible(true);
			card.focus();
			return { cut, side };
		},
		showAnswer(content: string, onDone: () => void): void {
			answerMode = true;
			currentEl = null;
			onAnswerDone = onDone;
			spotlight.style.display = 'none';
			counterEl.style.display = 'none';
			textEl.textContent = content;
			doItBtn.style.display = 'none';
			nextBtn.textContent = 'Done';
			hintEl.style.display = 'none';
			card.setAttribute('aria-label', content);
			const left = clamp(
				window.innerWidth / 2 - CARD_W / 2,
				MARGIN,
				window.innerWidth - CARD_W - MARGIN,
			);
			card.style.left = `${left}px`;
			card.style.top = `${Math.max(MARGIN, window.innerHeight / 2 - CARD_H_EST / 2)}px`;
			playEntrance();
			setVisible(true);
			card.focus();
		},
		hide(): void {
			setVisible(false);
			currentEl = null;
			answerMode = false;
		},
		destroy(): void {
			document.removeEventListener('keydown', onKey, true);
			window.removeEventListener('resize', remeasure);
			window.removeEventListener('scroll', remeasure, { capture: true } as EventListenerOptions);
			root.remove();
		},
	};
}

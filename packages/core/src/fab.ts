// Launcher FAB: fixed bottom-right circle where the pointer rests, plus a
// small ask panel (text input + mic placeholder wired to voice by index.ts).

import { POINTER_SVG } from './pointer.ts';

export interface FabHandle {
	/** Viewport center of the FAB circle (dock target for the pointer). */
	center(): { x: number; y: number };
	/** Wire the mic button (voice STT). No-op button until wired. */
	setMicHandler(fn: () => void): void;
	/**
	 * Reflect an active voice-listening state on the FAB (pulse + accent
	 * colour on the launcher and mic button). Shared by the mic button and the
	 * keyboard hotkey so both paths show the same recording indicator.
	 */
	setListening(on: boolean): void;
	closePanel(): void;
	destroy(): void;
}

const FAB_SIZE = 56;

const FAB_CSS = `
:host {
	/* Explicit font baseline + box reset so the FAB and ask-panel input/buttons
	   never inherit the third-party host page's form resets or typography. */
	font-family: var(--handyman-font, system-ui, sans-serif);
	font-size: 13px;
	line-height: 1.4;
	font-weight: 400;
}
*, *::before, *::after { box-sizing: border-box; }
.handyman-fab {
	position: fixed;
	right: 20px;
	bottom: 20px;
	width: ${FAB_SIZE}px;
	height: ${FAB_SIZE}px;
	border-radius: 999px;
	border: none;
	background: var(--handyman-ink, #16161a);
	color: var(--handyman-paper, #fff);
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
}
.handyman-fab .handyman-pointer__svg { width: 24px; height: 24px; }
.handyman-fab .handyman-pointer__svg path {
	fill: var(--handyman-paper, #fff);
	stroke: var(--handyman-ink, #16161a);
}
/* Recording indicator: accent fill + pulsing ring while listening. */
.handyman-fab--listening {
	background: var(--handyman-recording, #e5484d);
	animation: handyman-fab-pulse 1.4s ease-in-out infinite;
}
@keyframes handyman-fab-pulse {
	0% { box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25), 0 0 0 0 rgba(229, 72, 77, 0.55); }
	70% { box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25), 0 0 0 12px rgba(229, 72, 77, 0); }
	100% { box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25), 0 0 0 0 rgba(229, 72, 77, 0); }
}
@media (prefers-reduced-motion: reduce) {
	.handyman-fab--listening { animation: none; }
}
.handyman-ask {
	position: fixed;
	right: 20px;
	bottom: ${20 + FAB_SIZE + 8}px;
	width: 280px;
	box-sizing: border-box;
	background: var(--handyman-paper, #fff);
	color: var(--handyman-ink, #16161a);
	border: 1px solid var(--handyman-border, rgba(22, 22, 26, 0.1));
	border-radius: 12px;
	box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
	padding: 10px;
	display: flex;
	gap: 6px;
	font-family: var(--handyman-font, system-ui, sans-serif);
}
.handyman-ask__input {
	flex: 1;
	min-width: 0;
	font-size: 13px;
	font-family: inherit;
	color: inherit;
	background: transparent;
	border: 1px solid var(--handyman-border, rgba(22, 22, 26, 0.15));
	border-radius: 8px;
	padding: 6px 8px;
}
.handyman-ask__btn {
	border: 1px solid var(--handyman-border, rgba(22, 22, 26, 0.15));
	background: var(--handyman-paper, #fff);
	color: var(--handyman-ink, #16161a);
	border-radius: 8px;
	font-size: 13px;
	font-family: inherit;
	padding: 6px 8px;
	cursor: pointer;
}
.handyman-ask__btn--primary {
	background: var(--handyman-ink, #16161a);
	color: var(--handyman-paper, #fff);
}
.handyman-ask__btn--listening {
	background: var(--handyman-recording, #e5484d);
	color: var(--handyman-paper, #fff);
	border-color: var(--handyman-recording, #e5484d);
}
`;

export function createFab(opts: {
	zIndex: number;
	onAsk(question: string): void;
}): FabHandle {
	const root = document.createElement('div');
	root.setAttribute('data-handyman', 'fab');
	// Shadow-isolate the FAB + ask panel from host-page CSS; host div stays in
	// the light DOM carrying [data-handyman] for snapdom exclusion.
	const shadow = root.attachShadow({ mode: 'open' });

	const style = document.createElement('style');
	style.textContent = FAB_CSS;
	shadow.appendChild(style);

	const fab = document.createElement('button');
	fab.type = 'button';
	fab.className = 'handyman-fab';
	fab.setAttribute('aria-label', 'Ask Handyman');
	fab.style.zIndex = String(opts.zIndex);
	fab.innerHTML = POINTER_SVG;
	shadow.appendChild(fab);

	const panel = document.createElement('form');
	panel.className = 'handyman-ask';
	panel.style.zIndex = String(opts.zIndex);
	panel.style.display = 'none';

	const input = document.createElement('input');
	input.className = 'handyman-ask__input';
	input.type = 'text';
	input.placeholder = 'How do I…?';
	input.setAttribute('aria-label', 'Ask a question');

	const micBtn = document.createElement('button');
	micBtn.type = 'button';
	micBtn.className = 'handyman-ask__btn';
	micBtn.textContent = '🎤';
	micBtn.setAttribute('aria-label', 'Ask by voice');

	const submitBtn = document.createElement('button');
	submitBtn.type = 'submit';
	submitBtn.className = 'handyman-ask__btn handyman-ask__btn--primary';
	submitBtn.textContent = 'Ask';

	panel.appendChild(input);
	panel.appendChild(micBtn);
	panel.appendChild(submitBtn);
	shadow.appendChild(panel);
	document.body.appendChild(root);

	let micHandler: (() => void) | null = null;
	micBtn.addEventListener('click', () => micHandler?.());

	function closePanel(): void {
		panel.style.display = 'none';
	}

	fab.addEventListener('click', () => {
		const open = panel.style.display !== 'none';
		panel.style.display = open ? 'none' : 'flex';
		if (!open) input.focus();
	});

	panel.addEventListener('submit', (e) => {
		e.preventDefault();
		const q = input.value.trim();
		if (!q) return;
		input.value = '';
		closePanel();
		opts.onAsk(q);
	});

	return {
		center(): { x: number; y: number } {
			const r = fab.getBoundingClientRect();
			// happy-dom / detached rects are all zeros; fall back to the
			// fixed CSS coordinates (right: 20, bottom: 20).
			if (r.width === 0 && r.height === 0) {
				return {
					x: window.innerWidth - 20 - FAB_SIZE / 2,
					y: window.innerHeight - 20 - FAB_SIZE / 2,
				};
			}
			return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
		},
		setMicHandler(fn: () => void): void {
			micHandler = fn;
		},
		setListening(on: boolean): void {
			fab.classList.toggle('handyman-fab--listening', on);
			micBtn.classList.toggle('handyman-ask__btn--listening', on);
			fab.setAttribute('aria-pressed', on ? 'true' : 'false');
			micBtn.setAttribute('aria-label', on ? 'Stop listening' : 'Ask by voice');
		},
		closePanel,
		destroy(): void {
			root.remove();
		},
	};
}

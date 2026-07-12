import { stubRect } from './setup.ts';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createOverlay, type OverlayHandle } from '../overlay.ts';

/** Overlay markup now lives inside a shadow root; query through it. */
function q<T extends Element = HTMLElement>(sel: string): T {
	const host = document.querySelector('[data-handyman="overlay"]')!;
	return host.shadowRoot!.querySelector(sel) as unknown as T;
}

function makeCallbacks() {
	return {
		onNext: mock(() => {}),
		onBack: mock(() => {}),
		onSkip: mock(() => {}),
		onDoIt: mock(() => {}),
		onTargetLost: mock(() => {}),
	};
}

describe('overlay', () => {
	let overlay: OverlayHandle;
	let cb: ReturnType<typeof makeCallbacks>;
	let target: HTMLElement;

	beforeEach(() => {
		document.body.innerHTML = '';
		cb = makeCallbacks();
		overlay = createOverlay({ zIndex: 1000, callbacks: cb });
		target = document.createElement('button');
		target.textContent = 'Save';
		stubRect(target, 100, 100, 200, 100);
		document.body.appendChild(target);
	});

	afterEach(() => {
		overlay.destroy();
		target.remove();
	});

	function show(): void {
		overlay.showStep({
			el: target,
			rect: target.getBoundingClientRect(),
			instruction: 'Click the Save button',
			counter: 'Step 1',
			showDoIt: true,
		});
	}

	it('renders instruction, counter, and buttons', () => {
		show();
		const card = q('.handyman-card');
		expect(card.textContent).toContain('Click the Save button');
		expect(card.textContent).toContain('Step 1');
		expect(card.textContent).toContain('Skip');
		expect(card.textContent).toContain('Do it for me');
		expect(card.textContent).toContain('Next');
	});

	it('Skip button fires onSkip', () => {
		show();
		(q('[data-handyman-btn="skip"]') as HTMLElement).click();
		expect(cb.onSkip).toHaveBeenCalledTimes(1);
	});

	it('Do it for me fires onDoIt and marks pressed', () => {
		show();
		const btn = q('[data-handyman-btn="doit"]') as HTMLElement;
		btn.click();
		expect(cb.onDoIt).toHaveBeenCalledTimes(1);
		expect(btn.getAttribute('aria-pressed')).toBe('true');
	});

	it('keyboard: Escape skips, ArrowRight next, ArrowLeft back, Enter next', () => {
		show();
		const key = (k: string) =>
			document.body.dispatchEvent(
				new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }),
			);
		key('Escape');
		expect(cb.onSkip).toHaveBeenCalledTimes(1);
		key('ArrowRight');
		expect(cb.onNext).toHaveBeenCalledTimes(1);
		key('ArrowLeft');
		expect(cb.onBack).toHaveBeenCalledTimes(1);
		key('Enter');
		expect(cb.onNext).toHaveBeenCalledTimes(2);
	});

	it('keyboard handling is capture-phase and stops propagation to the host', () => {
		show();
		const hostHandler = mock(() => {});
		document.body.addEventListener('keydown', hostHandler);
		document.body.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
		);
		expect(cb.onSkip).toHaveBeenCalledTimes(1);
		// The capture-phase document listener stopped the event before it
		// reached the host's own body listener.
		expect(hostHandler).not.toHaveBeenCalled();
		document.body.removeEventListener('keydown', hostHandler);
	});

	it('Enter on a tour button defers to the native click', () => {
		show();
		const skip = q('[data-handyman-btn="skip"]') as HTMLButtonElement;
		skip.focus();
		document.body.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
		);
		expect(cb.onNext).not.toHaveBeenCalled();
	});

	it('rings the target without dimming or blocking the page', () => {
		show();
		// rect 100,100 200x100 + 8px pad → cut 92,92 216x116.
		const ring = q('.handyman-spotlight') as HTMLElement;
		expect(ring.style.left).toBe('92px');
		expect(ring.style.top).toBe('92px');
		expect(ring.style.width).toBe('216px');
		expect(ring.style.height).toBe('116px');
		// No dimming scrim exists; a real click on the target still lands.
		const clicked = mock(() => {});
		target.addEventListener('click', clicked);
		target.click();
		expect(clicked).toHaveBeenCalledTimes(1);
	});

	it('target removed from DOM → onTargetLost on re-measure, no crash', () => {
		show();
		target.remove();
		window.dispatchEvent(new Event('resize'));
		expect(cb.onTargetLost).toHaveBeenCalledTimes(1);
	});

	it('showAnswer renders content, hides spotlight, Done closes', () => {
		show();
		const onDone = mock(() => {});
		overlay.showAnswer('All set. Invoice created.', onDone);
		const card = q('.handyman-card');
		expect(card.textContent).toContain('All set. Invoice created.');
		const spotlight = q('.handyman-spotlight') as HTMLElement;
		expect(spotlight.style.display).toBe('none');
		(q('[data-handyman-btn="next"]') as HTMLElement).click();
		expect(onDone).toHaveBeenCalledTimes(1);
	});
});

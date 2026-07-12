// Shadow-DOM key retargeting: the widget must not leak its keystrokes to the
// host page, and the overlay must not hijack keys typed into a shadow input.
//
// NOTE ON THE TEST ENVIRONMENT: happy-dom does NOT retarget event.target across
// a shadow boundary (a document listener still sees the <input>, where a real
// browser sees the shadow host). It does implement composedPath() faithfully.
// So the fab tests below dispatch real shadow events, while the overlay test
// must synthesise the retargeted view (target = host, composedPath()[0] = the
// true origin) to reproduce what a browser actually delivers.
import './setup.ts';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createFab, type FabHandle } from '../fab.ts';
import { createOverlay, type OverlayHandle } from '../overlay.ts';

function fabHost(): HTMLElement {
	return document.querySelector('[data-handyman="fab"]') as HTMLElement;
}

function fabInput(): HTMLInputElement {
	return fabHost().shadowRoot!.querySelector('.handyman-ask__input') as HTMLInputElement;
}

function keydown(key: string): KeyboardEvent {
	return new KeyboardEvent('keydown', {
		key,
		bubbles: true,
		cancelable: true,
		composed: true,
	});
}

describe('fab keys do not leak to the host page', () => {
	let fab: FabHandle;
	let onAsk: ReturnType<typeof mock>;
	let hostKeys: ReturnType<typeof mock>;

	beforeEach(() => {
		document.body.innerHTML = '';
		onAsk = mock(() => {});
		fab = createFab({ zIndex: 1000, onAsk: onAsk as (q: string) => void });
		// A typical host-page shortcut handler, registered capture-phase on
		// document (the strongest position a page realistically takes).
		hostKeys = mock(() => {});
		document.addEventListener('keydown', hostKeys as EventListener, true);
	});

	afterEach(() => {
		document.removeEventListener('keydown', hostKeys as EventListener, true);
		fab.destroy();
	});

	it('stops widget-originated keys before any document listener sees them', () => {
		fabInput().dispatchEvent(keydown('j'));
		expect(hostKeys).not.toHaveBeenCalled();
	});

	it('leaves host-page keys alone', () => {
		const pageInput = document.createElement('input');
		document.body.appendChild(pageInput);
		pageInput.dispatchEvent(keydown('j'));
		expect(hostKeys).toHaveBeenCalledTimes(1);
	});

	it('Enter in the ask input calls onAsk once, clears, and closes the panel', () => {
		const input = fabInput();
		input.value = '  How do I export?  ';
		input.dispatchEvent(keydown('Enter'));
		expect(onAsk).toHaveBeenCalledTimes(1);
		expect(onAsk.mock.calls[0]).toEqual(['How do I export?']);
		expect(input.value).toBe('');
		const panel = fabHost().shadowRoot!.querySelector('.handyman-ask') as HTMLElement;
		expect(panel.style.display).toBe('none');
	});

	it('Enter does not double-fire when the form also submits', () => {
		const input = fabInput();
		input.value = 'ship it';
		input.dispatchEvent(keydown('Enter'));
		// Simulate a UA that ran implicit submission anyway: the input is already
		// cleared, so the submit handler must no-op rather than ask twice.
		const panel = fabHost().shadowRoot!.querySelector('.handyman-ask') as HTMLFormElement;
		panel.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		expect(onAsk).toHaveBeenCalledTimes(1);
	});

	it('ignores an empty / whitespace-only question', () => {
		const input = fabInput();
		input.value = '   ';
		input.dispatchEvent(keydown('Enter'));
		expect(onAsk).not.toHaveBeenCalled();
		expect(input.value).toBe('   ');
	});

	it('destroy removes the window key listeners (no leak across init cycles)', () => {
		const host = fabHost();
		const input = fabInput();
		fab.destroy();
		// The detached input is still composed-path-linked to the removed host;
		// with the listeners gone the event must reach the page untouched.
		document.body.appendChild(host);
		input.dispatchEvent(keydown('j'));
		expect(hostKeys).toHaveBeenCalledTimes(1);
		host.remove();
	});
});

describe('overlay respects the true (retargeted) event origin', () => {
	let overlay: OverlayHandle;
	let cb: {
		onNext: ReturnType<typeof mock>;
		onBack: ReturnType<typeof mock>;
		onSkip: ReturnType<typeof mock>;
		onDoIt: ReturnType<typeof mock>;
		onTargetLost: ReturnType<typeof mock>;
	};
	let host: HTMLElement;
	let shadowInput: HTMLInputElement;

	beforeEach(() => {
		document.body.innerHTML = '';
		cb = {
			onNext: mock(() => {}),
			onBack: mock(() => {}),
			onSkip: mock(() => {}),
			onDoIt: mock(() => {}),
			onTargetLost: mock(() => {}),
		};
		overlay = createOverlay({ zIndex: 1000, callbacks: cb });
		const target = document.createElement('button');
		document.body.appendChild(target);
		overlay.showStep({
			el: target,
			rect: target.getBoundingClientRect(),
			instruction: 'Type your name',
			counter: 'Step 1',
			showDoIt: false,
		});
		// A shadow-DOM input on the host page (e.g. a web-component form field).
		host = document.createElement('div');
		const shadow = host.attachShadow({ mode: 'open' });
		shadowInput = document.createElement('input');
		shadow.appendChild(shadowInput);
		document.body.appendChild(host);
	});

	afterEach(() => {
		overlay.destroy();
	});

	/**
	 * Dispatch the event as a browser delivers it to a document listener: target
	 * retargeted to the shadow host, composedPath() still rooted at the real
	 * input. happy-dom won't retarget on its own, so we stage it.
	 */
	function retargetedKey(key: string): void {
		const e = keydown(key);
		const truePath: EventTarget[] = [shadowInput, host, document.body, document, window];
		Object.defineProperty(e, 'composedPath', {
			value: () => truePath,
			configurable: true,
		});
		host.dispatchEvent(e); // e.target === host, exactly as after retargeting
	}

	it('does not hijack Enter / arrows typed into a shadow-DOM input', () => {
		retargetedKey('Enter');
		retargetedKey('ArrowRight');
		retargetedKey('ArrowLeft');
		expect(cb.onNext).not.toHaveBeenCalled();
		expect(cb.onBack).not.toHaveBeenCalled();
	});

	it('keeps Escape global even from inside an editable', () => {
		retargetedKey('Escape');
		expect(cb.onSkip).toHaveBeenCalledTimes(1);
	});

	it('still drives the tour for keys from a non-editable origin', () => {
		document.body.dispatchEvent(keydown('ArrowRight'));
		expect(cb.onNext).toHaveBeenCalledTimes(1);
	});

	it('lets a plain light-DOM editable type through', () => {
		const pageInput = document.createElement('input');
		document.body.appendChild(pageInput);
		pageInput.dispatchEvent(keydown('Enter'));
		expect(cb.onNext).not.toHaveBeenCalled();
	});

	// The `typeof e.composedPath !== 'function'` fallback in overlay.ts/fab.ts is
	// deliberately untested: happy-dom's own dispatcher calls composedPath(), so
	// an event without it cannot be dispatched here at all. The guard exists for
	// environments that lack the method, and is unreachable in this suite.
});

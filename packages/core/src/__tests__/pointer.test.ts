import { waitFor } from './setup.ts';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createPointer, type PointerHandle } from '../pointer.ts';

function host(): HTMLElement {
	return document.querySelector('[data-handyman="pointer"]') as HTMLElement;
}

/** Current translate() from the inline transform, or null before first paint. */
function pos(): { x: number; y: number } | null {
	const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(host().style.transform);
	return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

function mouseMove(x: number, y: number): void {
	window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
}

describe('pointer buddy mode', () => {
	let pointer: PointerHandle;
	let onDock: ReturnType<typeof mock>;

	beforeEach(() => {
		document.body.innerHTML = '';
		onDock = mock(() => {});
		pointer = createPointer({ zIndex: 1000, onDock });
	});

	afterEach(() => {
		pointer.destroy();
	});

	it('startFollow seeds at `from` and springs toward the cursor + offset', async () => {
		pointer.startFollow({ x: 500, y: 400 });
		expect(host().style.display).not.toBe('none');
		// Seed snap: center (500,400) → translate(480,380) for the 40px box.
		expect(pos()).toEqual({ x: 480, y: 380 });

		mouseMove(100, 100);
		// Spring loop (happy-dom rAF is timer-driven) chases cursor+(26,30):
		// center (126,130) → translate(106,110).
		await waitFor(() => {
			const p = pos();
			return p !== null && Math.abs(p.x - 106) < 2 && Math.abs(p.y - 110) < 2;
		}, 4000);
	});

	it('buddy never takes pointer-events, even while following', () => {
		pointer.startFollow({ x: 500, y: 400 });
		// The host must stay click-through in every mode — going home is the
		// launcher's job, and the buddy must never swallow a page click.
		expect(host().style.pointerEvents).toBe('');
		expect(getComputedStyle(host()).pointerEvents === 'auto').toBe(false);
	});

	it('stopFollow detaches the mousemove listener', async () => {
		pointer.startFollow({ x: 500, y: 400 });
		pointer.stopFollow();
		mouseMove(100, 100);
		await new Promise((r) => setTimeout(r, 60));
		// Still parked at the seed — the move was ignored.
		expect(pos()).toEqual({ x: 480, y: 380 });
	});

	it('dockTo lands, hides, and fires onDock', async () => {
		pointer.startFollow({ x: 500, y: 400 });
		await pointer.dockTo(900, 700);
		expect(host().style.display).toBe('none');
		expect(onDock).toHaveBeenCalledTimes(1);
		// Follow exited with the dock: a later move must not resurrect it.
		mouseMove(100, 100);
		await new Promise((r) => setTimeout(r, 60));
		expect(host().style.display).toBe('none');
	});

	it('show() within the dock window cancels the stale landing timer', async () => {
		pointer.startFollow({ x: 500, y: 400 });
		const dock = pointer.dockTo(900, 700);
		// A new appearance before the 650ms landing (cached-replay tours start
		// synchronously) must not be display:none'd by the stale timer, and the
		// superseded dock must not report a landing.
		pointer.show();
		await dock; // resolves early via cancelDock
		await new Promise((r) => setTimeout(r, 700));
		expect(host().style.display).not.toBe('none');
		expect(onDock).toHaveBeenCalledTimes(0);
	});
});

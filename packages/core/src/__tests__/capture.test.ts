// The `captureScreenshot` override path (the extension's out-of-page screenshot
// bridge). Only this path is covered here: it never touches snapdom, so it runs
// honestly under happy-dom. The snapdom path itself is NOT testable here —
// happy-dom has no layout, no canvas rasterizer and no real paint, so a "test" of
// it would only assert against a mock of snapdom, not against any real behaviour.

import './setup.ts';
import { describe, expect, it } from 'bun:test';
import { captureViewport } from '../capture.ts';

function widgetRoot(kind: string): HTMLElement {
	const el = document.createElement('div');
	el.setAttribute('data-handyman', kind);
	document.body.appendChild(el);
	return el;
}

describe('captureViewport with a captureScreenshot override', () => {
	it('uses the override instead of snapdom and reports the TRUE CSS viewport', async () => {
		const calls: Array<{ width: number; height: number }> = [];
		const res = await captureViewport(async (opts) => {
			calls.push(opts);
			return 'data:image/jpeg;base64,ZZZ';
		});

		expect(res.screenshot).toBe('data:image/jpeg;base64,ZZZ');
		// viewport is the CSS viewport, never the raster size — the normalized
		// coordinate contract depends on this.
		expect(res.viewport).toEqual({
			width: window.innerWidth,
			height: window.innerHeight,
		});
		expect(calls).toEqual([{ width: window.innerWidth, height: window.innerHeight }]);
	});

	it('hides every [data-handyman] root while the shot is taken, and restores after', async () => {
		document.body.innerHTML = '';
		const overlay = widgetRoot('overlay');
		const fab = widgetRoot('fab');
		const pointer = widgetRoot('pointer');
		// A root that already carries an inline visibility must get it back verbatim.
		pointer.style.setProperty('visibility', 'visible');

		const seen: string[] = [];
		await captureViewport(async () => {
			// The real screenshot is taken by the worker at exactly this moment —
			// whatever is visible now is what lands in the observation.
			seen.push(
				overlay.style.visibility,
				fab.style.visibility,
				pointer.style.visibility,
			);
			return 'data:image/jpeg;base64,ZZZ';
		});

		expect(seen).toEqual(['hidden', 'hidden', 'hidden']);
		// Restored: no inline visibility where there was none, and the prior value back.
		expect(overlay.style.getPropertyValue('visibility')).toBe('');
		expect(fab.style.getPropertyValue('visibility')).toBe('');
		expect(pointer.style.getPropertyValue('visibility')).toBe('visible');
	});

	it('restores the widget even when the capture fails', async () => {
		document.body.innerHTML = '';
		const fab = widgetRoot('fab');

		await expect(
			captureViewport(async () => {
				throw new Error('screenshot timed out');
			}),
		).rejects.toThrow('screenshot timed out');

		// An error must never leave the user with an invisible widget.
		expect(fab.style.getPropertyValue('visibility')).toBe('');
	});
});

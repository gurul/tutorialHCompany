// Viewport screenshot → downscaled JPEG data URI.
//
// Library choice (grounded via `npm view`, 2026-07-11):
//   @zumer/snapdom 2.15.0  — last publish 2026-07-03, actively maintained
//   modern-screenshot 4.7.0 — last publish 2026-04-16
//   html-to-image 1.11.13  — last publish 2025-04-19
//   html2canvas 1.4.1      — effectively unmaintained (last release 2022)
// snapdom is the best-maintained full-fidelity DOM rasterizer and supports
// declarative exclusion (`exclude` + excludeMode:"hide" keeps layout), which
// we use to keep handyman's own overlay/pointer/FAB out of the observation.

import { snapdom } from '@zumer/snapdom';

export interface ViewportCapture {
	/** JPEG data URI of the current viewport (downscaled; longest side ≤ MAX_IMAGE_EDGE). */
	screenshot: string;
	/**
	 * The TRUE CSS viewport in px — {innerWidth, innerHeight}. This is NOT the
	 * raster/image pixel size and MUST NOT be changed to it (see coord note).
	 */
	viewport: { width: number; height: number };
}

// --- Normalized-coordinate contract (why downscaling is safe) ---
// The model returns element coordinates in [0,1000] normalized to the IMAGE it
// was sent. The widget converts them back with `viewport.width/height` (CSS px),
// NEVER with the image's pixel dimensions (see snap.ts). So the raster resolution
// is a free variable: as long as the image is a faithful, aspect-preserving
// capture of exactly the CSS viewport region, (x/1000)*viewport.width maps a
// normalized coordinate to the same CSS point no matter how many pixels the JPEG
// actually has. Shrinking the raster therefore does not touch the coord math —
// which is exactly why `viewport` MUST stay the true CSS viewport, and why the
// downscale below preserves aspect ratio (a non-uniform squash WOULD break it).
const MAX_IMAGE_EDGE = 1024;

// PNG of a full-viewport screenshot is large to encode and upload, and a big
// image also costs the model more input tokens / latency. JPEG @ 0.72 is roughly
// an order of magnitude smaller for a UI screenshot while keeping text and button
// edges legible enough for grounding; below ~0.6 labels start to smear. JPEG has
// no alpha channel, so the canvas is filled white first (opaque background,
// matching snapdom's own #fff default) — otherwise transparent pixels go black.
const JPEG_QUALITY = 0.72;

export async function captureViewport(): Promise<ViewportCapture> {
	const width = window.innerWidth;
	const height = window.innerHeight;

	// One scalar for both axes so the output preserves the viewport aspect ratio
	// exactly — required by the normalized-coordinate contract above. Never > 1
	// (we downscale only; upscaling wastes bytes for no fidelity gain).
	const longest = Math.max(width, height);
	const outScale = longest > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / longest : 1;

	// snapdom has no region/clip option — the 2.15 typedefs expose only
	// scale/width/height/dpr for sizing, none of which crop — so it still
	// traverses and rasterizes the whole <body>. We can't skip that traversal,
	// but rendering at `outScale` (≤1) produces the raster at the reduced
	// resolution we need anyway: a long page rasterizes proportionally fewer
	// pixels instead of full-res-then-downscale. The viewport crop below then
	// discards everything outside the current fold.
	const result = await snapdom(document.body, {
		fast: true,
		scale: outScale,
		dpr: 1, // keep the raster 1:1 with CSS px (× outScale) so coords map cleanly
		exclude: ['[data-handyman]'],
		excludeMode: 'hide',
		compress: true,
	});
	const full = await result.toCanvas();

	// snapdom rasterizes the whole body; crop the current viewport region.
	// scaleX/scaleY come from the ACTUAL raster dimensions (robust to any snapdom
	// rounding under `scale`), used only to locate the source rect in the raster.
	const bodyW = Math.max(1, document.body.scrollWidth || width);
	const bodyH = Math.max(1, document.body.scrollHeight || height);
	const scaleX = full.width / bodyW;
	const scaleY = full.height / bodyH;

	// Output canvas uses the single `outScale` on both axes, so its aspect ratio
	// matches the CSS viewport exactly regardless of scaleX/scaleY drift.
	const outW = Math.max(1, Math.round(width * outScale));
	const outH = Math.max(1, Math.round(height * outScale));
	const out = document.createElement('canvas');
	out.width = outW;
	out.height = outH;
	const ctx = out.getContext('2d');
	if (ctx === null) throw new Error('handyman: 2d canvas unavailable');
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, outW, outH);
	ctx.drawImage(
		full,
		window.scrollX * scaleX,
		window.scrollY * scaleY,
		width * scaleX,
		height * scaleY,
		0,
		0,
		outW,
		outH,
	);

	return {
		screenshot: out.toDataURL('image/jpeg', JPEG_QUALITY),
		viewport: { width, height },
	};
}

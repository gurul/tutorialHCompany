// Hand art engine — vendored from era-maker's EraHand cursor bootstrap
// (era-maker public/era-hand-bootstrap.js), reduced to what handyman needs:
// the finger renderer, the pose data, and pose-to-pose interpolation.
//
// Deliberately NOT vendored: global mousemove tracking, native-cursor hiding,
// hover rules, and press listeners — handyman's own spring loop (pointer.ts)
// owns position/rotation, and the session owns when poses change. This module
// only paints a hand into a canvas and animates between poses.
//
// Colors are NOT the Era brand palette. Each finger takes a tint of the
// widget's single accent color (--handyman-accent), darkest on the index (the
// finger that does the pointing), lightening toward the pinky — so the hand
// reads as one themed object on any host page instead of a rainbow.

export type HandPose = 'open' | 'pointer' | 'grab' | 'excited';

export interface HandHandle {
	/** The canvas element; caller positions/rotates it (or its wrapper). */
	el: HTMLCanvasElement;
	/** Animate to a pose (instant under reduced motion / no rAF). */
	setPose(pose: HandPose, instant?: boolean): void;
	destroy(): void;
}

interface FingerParams {
	tipX: number;
	tipY: number;
	baseX: number;
	baseY: number;
	pipX: number;
	pipY: number;
	rectWidth: number;
	/** ≥0.5 circle mode, 0.3–0.5 transition rectangle, <0.3 bezier stroke. */
	rectBezOrCircle: number;
	/** 0 straight … 1 fully curved (bezier mode only). */
	rectOrBez: number;
}

const FINGER_ORDER = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;
type FingerName = (typeof FINGER_ORDER)[number];

interface PoseDef {
	fingers: Record<FingerName, FingerParams>;
	/** Design-space size the coordinates were authored at. */
	refSize: number;
}

// Pose geometry copied verbatim from the reference engine (colors stripped —
// they were the brand palette; ours are derived below).
const POSES: Record<HandPose, PoseDef> = {
	open: {
		fingers: {
			thumb: { tipX: -238.854, tipY: 152.503, baseX: -62.614, baseY: 302.668, pipX: -169.183, pipY: 194.34, rectWidth: 115.769, rectBezOrCircle: 0, rectOrBez: 0 },
			index: { tipX: -169.76, tipY: -149.304, baseX: -58.299, baseY: 53.64, pipX: -103.419, pipY: -18.413, rectWidth: 115.769, rectBezOrCircle: 0, rectOrBez: 0 },
			middle: { tipX: -49.209, tipY: -205.985, baseX: 19.092, baseY: 15.25, pipX: -5.23, pipY: -54.824, rectWidth: 115.769, rectBezOrCircle: 0, rectOrBez: 0 },
			ring: { tipX: 76.116, tipY: -191.248, baseX: 100.978, baseY: 38.951, pipX: 99.627, pipY: -48.899, rectWidth: 115.769, rectBezOrCircle: 0, rectOrBez: 0 },
			pinky: { tipX: 209.528, tipY: -122.559, baseX: 173.022, baseY: 106.083, pipX: 200.028, pipY: 2.289, rectWidth: 115.769, rectBezOrCircle: 0, rectOrBez: 0 },
		},
		refSize: 855.96,
	},
	pointer: {
		fingers: {
			thumb: { tipX: -152.091, tipY: -3.407, baseX: -102.522, baseY: 214.24, pipX: -125.694, pipY: 71.348, rectWidth: 111.61, rectBezOrCircle: 0, rectOrBez: 0 },
			index: { tipX: -242.031, tipY: -197.651, baseX: -132.216, baseY: -3.311, pipX: -173.673, pipY: -65.963, rectWidth: 111.61, rectBezOrCircle: 0, rectOrBez: 0 },
			middle: { tipX: -57.603, tipY: 22.953, baseX: 160.907, baseY: -31.083, pipX: -60.436, pipY: -93.32, rectWidth: 112.546, rectBezOrCircle: 0.999, rectOrBez: 0 },
			ring: { tipX: 4.455, tipY: 40.398, baseX: 196.919, baseY: -76.324, pipX: 23.077, pipY: -80.125, rectWidth: 112.546, rectBezOrCircle: 0.999, rectOrBez: 0.297 },
			pinky: { tipX: 62.533, tipY: 69.58, baseX: 261.649, baseY: -35.394, pipX: 93.074, pipY: -21.66, rectWidth: 112.546, rectBezOrCircle: 0.999, rectOrBez: 0.433 },
		},
		refSize: 841.32,
	},
	grab: {
		fingers: {
			thumb: { tipX: -148.335, tipY: -11.708, baseX: -144.923, baseY: 208.086, pipX: -176.493, pipY: 47.934, rectWidth: 109.91, rectBezOrCircle: 0, rectOrBez: 0.999 },
			index: { tipX: -40.853, tipY: 81.727, baseX: -159.039, baseY: -101.521, pipX: -78.685, pipY: -39.757, rectWidth: 109.027, rectBezOrCircle: 0.999, rectOrBez: 0 },
			middle: { tipX: 8.178, tipY: 75.652, baseX: -35.732, baseY: -145.116, pipX: -9.053, pipY: -64.016, rectWidth: 112.546, rectBezOrCircle: 0.999, rectOrBez: 0 },
			ring: { tipX: 57.068, tipY: 67.058, baseX: 94.457, baseY: -154.907, pipX: 65.433, pipY: -63.293, rectWidth: 112.546, rectBezOrCircle: 0.999, rectOrBez: 0.297 },
			pinky: { tipX: 100.636, tipY: 65.322, baseX: 268.541, baseY: -84.593, pipX: 133.247, pipY: -28.291, rectWidth: 112.546, rectBezOrCircle: 0.999, rectOrBez: 0.433 },
		},
		refSize: 765.22,
	},
	excited: {
		fingers: {
			thumb: { tipX: -253.585, tipY: 171.748, baseX: -62.614, baseY: 302.668, pipX: -179.922, pipY: 206.073, rectWidth: 115.769, rectBezOrCircle: 0, rectOrBez: 0 },
			index: { tipX: -185.34, tipY: -139.933, baseX: -58.299, baseY: 53.64, pipX: -108.934, pipY: -14.651, rectWidth: 115.769, rectBezOrCircle: 0, rectOrBez: 0 },
			middle: { tipX: -49.209, tipY: -205.985, baseX: 19.092, baseY: 15.25, pipX: -5.23, pipY: -54.824, rectWidth: 115.769, rectBezOrCircle: 0, rectOrBez: 0 },
			ring: { tipX: 94.254, tipY: -192.489, baseX: 100.978, baseY: 38.951, pipX: 106.524, pipY: -48.734, rectWidth: 115.769, rectBezOrCircle: 0, rectOrBez: 0 },
			pinky: { tipX: 233.228, tipY: -117.491, baseX: 173.022, baseY: 106.083, pipX: 210.729, pipY: 5.681, rectWidth: 115.769, rectBezOrCircle: 0, rectOrBez: 0 },
		},
		refSize: 855.96,
	},
};

// ---------------------------------------------------------------------------
// Accent-derived finger tints
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] | null {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return null;
	const n = parseInt(m[1]!, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
	const c = (v: number): string =>
		Math.round(Math.min(255, Math.max(0, v)))
			.toString(16)
			.padStart(2, '0');
	return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mix `hex` toward white (t>0) or black (t<0). t in [-1, 1]. */
function tint(hex: string, t: number): string {
	const rgb = hexToRgb(hex);
	if (!rgb) return hex;
	const target = t >= 0 ? 255 : 0;
	const k = Math.abs(t);
	return rgbToHex(
		rgb[0] + (target - rgb[0]) * k,
		rgb[1] + (target - rgb[1]) * k,
		rgb[2] + (target - rgb[2]) * k,
	);
}

export const DEFAULT_ACCENT = '#4353ff';

/**
 * Five tints of one accent, thumb → pinky. The index finger is the pure
 * accent (it points, it leads); the rest step toward white so the hand has
 * the reference engine's per-finger depth without its brand palette.
 */
export function fingerTints(accent: string): Record<FingerName, string> {
	const base = hexToRgb(accent) ? accent : DEFAULT_ACCENT;
	return {
		thumb: tint(base, 0.18),
		index: base,
		middle: tint(base, 0.34),
		ring: tint(base, 0.5),
		pinky: tint(base, 0.64),
	};
}

/** Overlap shade: 50/50 mix of the pair, pulled toward black for depth.
 *  Replaces the reference's hand-tuned brand overlap table with a computed
 *  blend, since our palette is theme-derived rather than fixed. */
function overlapColor(a: string, b: string): string {
	const ra = hexToRgb(a);
	const rb = hexToRgb(b);
	if (!ra || !rb) return a;
	return tint(
		rgbToHex((ra[0] + rb[0]) / 2, (ra[1] + rb[1]) / 2, (ra[2] + rb[2]) / 2),
		-0.16,
	);
}

// ---------------------------------------------------------------------------
// Finger renderer (verbatim port of the reference renderFinger)
// ---------------------------------------------------------------------------

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
	const dx = x2 - x1;
	const dy = y2 - y1;
	return Math.sqrt(dx * dx + dy * dy);
}

/** De Casteljau split: control points of the cubic's [t0, 1] tail. */
function bezierTail(
	p0x: number, p0y: number, p1x: number, p1y: number,
	p2x: number, p2y: number, p3x: number, p3y: number,
	t0: number,
): number[] {
	const ab = { x: lerp(p0x, p1x, t0), y: lerp(p0y, p1y, t0) };
	const bc = { x: lerp(p1x, p2x, t0), y: lerp(p1y, p2y, t0) };
	const cd = { x: lerp(p2x, p3x, t0), y: lerp(p2y, p3y, t0) };
	const abc = { x: lerp(ab.x, bc.x, t0), y: lerp(ab.y, bc.y, t0) };
	const bcd = { x: lerp(bc.x, cd.x, t0), y: lerp(bc.y, cd.y, t0) };
	const abcd = { x: lerp(abc.x, bcd.x, t0), y: lerp(abc.y, bcd.y, t0) };
	return [abcd.x, abcd.y, bcd.x, bcd.y, cd.x, cd.y, p3x, p3y];
}

function drawRoundedRect(
	ctx: CanvasRenderingContext2D,
	x: number, y: number, w: number, h: number, r: number,
): void {
	r = Math.max(0, Math.min(r, w / 2, h / 2));
	ctx.beginPath();
	if (typeof ctx.roundRect === 'function') {
		ctx.roundRect(x, y, w, h, r);
	} else {
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + w - r, y);
		ctx.arcTo(x + w, y, x + w, y + r, r);
		ctx.lineTo(x + w, y + h - r);
		ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
		ctx.lineTo(x + r, y + h);
		ctx.arcTo(x, y + h, x, y + h - r, r);
		ctx.lineTo(x, y + r);
		ctx.arcTo(x, y, x + r, y, r);
		ctx.closePath();
	}
}

function renderFinger(
	ctx: CanvasRenderingContext2D,
	params: FingerParams,
	color: string,
	scale: number,
): void {
	const tipX = params.tipX * scale;
	const tipY = params.tipY * scale;
	const baseX = params.baseX * scale;
	const baseY = params.baseY * scale;
	const pipX = params.pipX * scale;
	const pipY = params.pipY * scale;
	const rectWidth = params.rectWidth * scale;
	const rbc = params.rectBezOrCircle;
	const rob = params.rectOrBez;

	const len = dist(baseX, baseY, tipX, tipY);
	const angle = Math.atan2(tipY - baseY, tipX - baseX);

	ctx.fillStyle = color;
	ctx.strokeStyle = color;

	if (rbc >= 0.5) {
		// Circle / rounded-square mode (curled fingertip dot).
		const fullDiam = rectWidth * 1.28;
		const fullR = fullDiam / 2;
		const tp = (rbc - 0.5) * 2;

		const borderRadius = fullR / 2 + (fullR / 2) * tp;
		const edgeLength = rectWidth + (fullDiam - rectWidth) * tp;

		const midX = (baseX + tipX) / 2;
		const midY = (baseY + tipY) / 2;
		const cx = lerp(midX, tipX, tp);
		const cy = lerp(midY, tipY, tp);

		ctx.save();
		ctx.translate(cx, cy);
		ctx.rotate(angle);
		drawRoundedRect(ctx, -edgeLength / 2, -edgeLength / 2, edgeLength, edgeLength, borderRadius);
		ctx.fill();
		ctx.restore();
	} else if (rbc >= 0.3) {
		// Transition rectangle between stroke and dot.
		const fullR = (rectWidth * 1.28) / 2;
		const tp = (rbc - 0.3) / 0.2;

		const visibleLength = len * 0.7 - (len * 0.7 - rectWidth) * tp;
		const br = Math.max(0, (fullR / 2) * tp);

		const visStartDist = len - visibleLength;
		const visStartX = baseX + (tipX - baseX) * (visStartDist / len);
		const visStartY = baseY + (tipY - baseY) * (visStartDist / len);
		const rcx = (visStartX + tipX) / 2;
		const rcy = (visStartY + tipY) / 2;

		ctx.save();
		ctx.translate(rcx, rcy);
		ctx.rotate(angle);
		drawRoundedRect(ctx, -visibleLength / 2, -rectWidth / 2, visibleLength, rectWidth, br);
		ctx.fill();
		ctx.restore();
	} else {
		// Bezier stroke mode (extended finger).
		const DEG30 = Math.PI / 6;

		const raw1x = baseX + (pipX - baseX) * 0.7;
		const raw1y = baseY + (pipY - baseY) * 0.7;
		const raw2x = tipX + (pipX - tipX) * 0.6;
		const raw2y = tipY + (pipY - tipY) * 0.6;

		const cp1 = { x: raw1x, y: raw1y };
		const cp2 = { x: raw2x, y: raw2y };
		if (len > 0.001) {
			const btNX = (tipX - baseX) / len;
			const btNY = (tipY - baseY) / len;
			const perpX = -btNY;
			const perpY = btNX;
			const v1x = raw1x - baseX;
			const v1y = raw1y - baseY;
			const v1L = Math.sqrt(v1x * v1x + v1y * v1y);
			if (v1L > 0.001) {
				let a1 = Math.atan2(v1y, v1x);
				a1 += (v1x * perpX + v1y * perpY >= 0 ? 1 : -1) * DEG30;
				cp1.x = baseX + Math.cos(a1) * v1L;
				cp1.y = baseY + Math.sin(a1) * v1L;
			}
			const v2x = raw2x - tipX;
			const v2y = raw2y - tipY;
			const v2L = Math.sqrt(v2x * v2x + v2y * v2y);
			if (v2L > 0.001) {
				let a2 = Math.atan2(v2y, v2x);
				a2 += (v2x * perpX + v2y * perpY >= 0 ? -1 : 1) * DEG30;
				cp2.x = tipX + Math.cos(a2) * v2L;
				cp2.y = tipY + Math.sin(a2) * v2L;
			}
		}

		const s1x = baseX + (tipX - baseX) / 3;
		const s1y = baseY + (tipY - baseY) / 3;
		const s2x = baseX + (tipX - baseX) * (2 / 3);
		const s2y = baseY + (tipY - baseY) * (2 / 3);

		let c1x = lerp(s1x, cp1.x, rob);
		let c1y = lerp(s1y, cp1.y, rob);
		let c2x = lerp(s2x, cp2.x, rob);
		let c2y = lerp(s2y, cp2.y, rob);

		// Double-straighten toward the 1/3 points as rbc approaches rect mode.
		const sf = Math.min(1, rbc / 0.3);
		c1x += (s1x - c1x) * sf; c1y += (s1y - c1y) * sf;
		c2x += (s2x - c2x) * sf; c2y += (s2y - c2y) * sf;
		c1x += (s1x - c1x) * sf; c1y += (s1y - c1y) * sf;
		c2x += (s2x - c2x) * sf; c2y += (s2y - c2y) * sf;

		const visPortion = 1.0 - (rbc / 0.3) * 0.3;

		ctx.lineCap = 'butt';
		ctx.lineWidth = rectWidth;
		ctx.beginPath();
		if (visPortion < 1.0) {
			const sub = bezierTail(baseX, baseY, c1x, c1y, c2x, c2y, tipX, tipY, 1 - visPortion);
			ctx.moveTo(sub[0]!, sub[1]!);
			ctx.bezierCurveTo(sub[2]!, sub[3]!, sub[4]!, sub[5]!, sub[6]!, sub[7]!);
		} else {
			ctx.moveTo(baseX, baseY);
			ctx.bezierCurveTo(c1x, c1y, c2x, c2y, tipX, tipY);
		}
		ctx.stroke();
	}
}

// ---------------------------------------------------------------------------
// Pose interpolation
// ---------------------------------------------------------------------------

const NUMERIC_KEYS = [
	'tipX', 'tipY', 'baseX', 'baseY', 'pipX', 'pipY',
	'rectWidth', 'rectBezOrCircle', 'rectOrBez',
] as const;

function lerpFinger(a: FingerParams, b: FingerParams, t: number): FingerParams {
	const out = {} as FingerParams;
	for (const k of NUMERIC_KEYS) out[k] = lerp(a[k], b[k], t);
	return out;
}

interface RenderState {
	fingers: Record<FingerName, FingerParams>;
	refSize: number;
}

function lerpState(a: RenderState, b: RenderState, t: number): RenderState {
	const fingers = {} as Record<FingerName, FingerParams>;
	for (const f of FINGER_ORDER) fingers[f] = lerpFinger(a.fingers[f], b.fingers[f], t);
	return { fingers, refSize: lerp(a.refSize, b.refSize, t) };
}

function easeOutCubic(t: number): number {
	return 1 - Math.pow(1 - t, 3);
}

function prefersReducedMotion(): boolean {
	try {
		return (
			typeof window !== 'undefined' &&
			typeof window.matchMedia === 'function' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		);
	} catch {
		return false;
	}
}

const CAN_RAF =
	typeof requestAnimationFrame === 'function' &&
	typeof cancelAnimationFrame === 'function';

const POSE_MS = 220;

// ---------------------------------------------------------------------------
// createHand
// ---------------------------------------------------------------------------

export function createHand(opts: { size: number; accent?: string }): HandHandle {
	const size = opts.size;
	const colors = fingerTints(opts.accent ?? DEFAULT_ACCENT);
	// Precompute the 10 pair overlap shades once (palette is fixed per hand).
	const overlaps: Array<[FingerName, FingerName, string]> = [];
	for (let i = 0; i < FINGER_ORDER.length; i++) {
		for (let j = i + 1; j < FINGER_ORDER.length; j++) {
			const a = FINGER_ORDER[i]!;
			const b = FINGER_ORDER[j]!;
			overlaps.push([a, b, overlapColor(colors[a], colors[b])]);
		}
	}

	// Render at device resolution so the hand stays crisp on retina displays
	// (the reference draws at CSS resolution and softens on 2x screens).
	const dpr = Math.min(
		2,
		typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1,
	);
	const px = Math.round(size * dpr);

	const canvas = document.createElement('canvas');
	canvas.width = px;
	canvas.height = px;
	canvas.style.width = `${size}px`;
	canvas.style.height = `${size}px`;
	canvas.style.display = 'block';
	canvas.setAttribute('aria-hidden', 'true');

	// happy-dom (tests) has no 2D context; the hand simply doesn't paint there.
	const ctx = canvas.getContext('2d');
	const off = document.createElement('canvas');
	off.width = px;
	off.height = px;
	const offCtx = off.getContext('2d');

	let current: RenderState = { ...POSES.open, refSize: POSES.open.refSize };
	let from: RenderState = current;
	let target: RenderState = current;
	let t = 1;
	let startTime = 0;
	let rafId: number | null = null;
	let destroyed = false;

	/** Paint `state`, mirrored and centered exactly like the reference
	 *  (translate(size,0); scale(-1,1); then center). */
	function paintInto(c: CanvasRenderingContext2D, state: RenderState, only?: FingerName[]): void {
		c.save();
		c.setTransform(dpr, 0, 0, dpr, 0, 0);
		c.translate(size, 0);
		c.scale(-1, 1);
		c.translate(size / 2, size / 2);
		const scale = size / state.refSize;
		for (const f of only ?? FINGER_ORDER) renderFinger(c, state.fingers[f], colors[f], scale);
		c.restore();
	}

	function draw(state: RenderState): void {
		if (!ctx) return;
		current = state;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, px, px);
		paintInto(ctx, state);
		if (!offCtx) return;
		// Overlap pass — source-in compositing yields the exact intersection of
		// each finger pair, filled with the pair's blend shade (reference trick).
		for (const [a, b, shade] of overlaps) {
			offCtx.setTransform(1, 0, 0, 1, 0, 0);
			offCtx.clearRect(0, 0, px, px);
			offCtx.globalCompositeOperation = 'source-over';
			paintInto(offCtx, state, [a]);
			offCtx.globalCompositeOperation = 'source-in';
			paintInto(offCtx, state, [b]);
			offCtx.fillStyle = shade;
			offCtx.setTransform(1, 0, 0, 1, 0, 0);
			offCtx.fillRect(0, 0, px, px);
			ctx.drawImage(off, 0, 0);
		}
	}

	function stop(): void {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
	}

	function frame(now: number): void {
		rafId = null;
		if (destroyed) return;
		t = Math.min(1, (now - startTime) / POSE_MS);
		draw(lerpState(from, target, easeOutCubic(t)));
		if (t < 1) rafId = requestAnimationFrame(frame);
	}

	// First paint (open pose) so the hand is never blank before its first move.
	draw(current);

	return {
		el: canvas,
		setPose(pose: HandPose, instant = false): void {
			const def = POSES[pose];
			const next: RenderState = { fingers: def.fingers, refSize: def.refSize };
			stop();
			if (instant || prefersReducedMotion() || !CAN_RAF) {
				t = 1;
				from = next;
				target = next;
				draw(next);
				return;
			}
			from = current;
			target = next;
			t = 0;
			startTime = performance.now();
			rafId = requestAnimationFrame(frame);
		},
		destroy(): void {
			destroyed = true;
			stop();
			canvas.remove();
		},
	};
}

// ---------------------------------------------------------------------------
// Static open-pose glyph (FAB) — the same five strokes as the `open` pose,
// pre-baked to SVG lines (all fingers are straight butt-capped strokes there,
// so the whole pose reduces to five <line>s; same reduction era-maker uses
// for its FAB icon). Drawn in currentColor with an opacity ramp so it works
// on the FAB's ink background without introducing any palette.
// ---------------------------------------------------------------------------

export function handGlyphSvg(width: number, height: number): string {
	const w = (n: number): string => n.toFixed(0);
	return (
		`<svg class="handyman-hand-glyph" viewBox="-297 -264 595 625" width="${w(width)}" height="${w(height)}" ` +
		'aria-hidden="true" focusable="false" fill="none" stroke="currentColor" ' +
		'stroke-width="115.769" stroke-linecap="butt">' +
		'<g transform="scale(-1 1)">' +
		'<line opacity="0.95" x1="-62.614" y1="302.668" x2="-238.854" y2="152.503"/>' +
		'<line opacity="1" x1="-58.299" y1="53.64" x2="-169.76" y2="-149.304"/>' +
		'<line opacity="0.95" x1="19.092" y1="15.25" x2="-49.209" y2="-205.985"/>' +
		'<line opacity="0.85" x1="100.978" y1="38.951" x2="76.116" y2="-191.248"/>' +
		'<line opacity="0.75" x1="173.022" y1="106.083" x2="209.528" y2="-122.559"/>' +
		'</g></svg>'
	);
}

// The handyman buddy hand — exact geometry from packages/core/src/hand.ts
// (POSES.open / POSES.pointer, viewBox and mirror included), so the video
// draws the SAME hand the widget renders. Two poses cover the video's needs:
// `open` (five straight strokes) and `pointer` (thumb+index strokes, three
// curled-fingertip dots).
//
// Parents animate placement (translate/rotate/scale); this component only
// owns per-finger reveal (stroke draw-on for lines, scale-pop for dots) via
// `reveal` in [0,1], staggered thumb → pinky.

import React from 'react';
import { interpolate } from 'remotion';
import { FINGER_TINTS, FINGER_ORDER, PAPER, INK, type FingerName } from './tokens';

export const HAND_VIEWBOX = '-297 -264 595 625';
/** Aspect ratio height/width of the viewBox (625/595). */
export const HAND_ASPECT = 625 / 595;

// Soft-rounded skin (design/hand-styles/soft-rounded.js): thinner strokes,
// round caps, longer fingers. The pose's subtle bezier bows are approximated
// as straight lines here — invisible at video sizes.
const OPEN_LINES: Record<FingerName, { x1: number; y1: number; x2: number; y2: number }> = {
	thumb: { x1: -58, y1: 285, x2: -248, y2: 128 },
	index: { x1: -64, y1: 56, x2: -160, y2: -190 },
	middle: { x1: 12, y1: 20, x2: -32, y2: -236 },
	ring: { x1: 95, y1: 42, x2: 80, y2: -212 },
	pinky: { x1: 162, y1: 110, x2: 212, y2: -110 },
};

const POINTER_LINES: Partial<Record<FingerName, { x1: number; y1: number; x2: number; y2: number }>> = {
	thumb: { x1: -98, y1: 218, x2: -155, y2: 8 },
	index: { x1: -130, y1: 0, x2: -258, y2: -212 },
};

// Curled fingertip dots: diameter = rectWidth(85) × 1.28 → r ≈ 54.4.
const POINTER_DOTS: Partial<Record<FingerName, { cx: number; cy: number; r: number }>> = {
	middle: { cx: -56, cy: 24, r: 54.4 },
	ring: { cx: 6, cy: 42, r: 54.4 },
	pinky: { cx: 64, cy: 70, r: 54.4 },
};

const STROKE_OPEN = 87;
const STROKE_POINTER = 85;

export type HandPalette = 'tints' | 'paper' | 'ink';

function fingerColor(finger: FingerName, palette: HandPalette): string {
	if (palette === 'paper') return PAPER;
	if (palette === 'ink') return INK;
	return FINGER_TINTS[finger];
}

/** Per-finger reveal window: thumb starts first, pinky last, each finger
 *  takes 45% of the total reveal. */
function fingerReveal(reveal: number, index: number): number {
	const start = (index / FINGER_ORDER.length) * 0.55;
	return interpolate(reveal, [start, start + 0.45], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
}

export const Hand: React.FC<{
	pose?: 'open' | 'pointer';
	width: number;
	palette?: HandPalette;
	/** 0..1 staggered draw-on; default 1 (fully drawn). */
	reveal?: number;
	/** Skip the engine's X-mirror so the pointer aims left instead of right. */
	flip?: boolean;
	style?: React.CSSProperties;
}> = ({ pose = 'open', width, palette = 'tints', reveal = 1, flip = false, style }) => {
	const strokeWidth = pose === 'pointer' ? STROKE_POINTER : STROKE_OPEN;
	const lines = pose === 'pointer' ? POINTER_LINES : OPEN_LINES;
	const dots = pose === 'pointer' ? POINTER_DOTS : {};
	return (
		<svg
			viewBox={HAND_VIEWBOX}
			width={width}
			height={width * HAND_ASPECT}
			fill="none"
			style={style}
		>
			<g transform={flip ? undefined : 'scale(-1 1)'}>
				{FINGER_ORDER.map((finger, i) => {
					const r = fingerReveal(reveal, i);
					if (r <= 0) return null;
					const line = lines[finger];
					if (line) {
						const len = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
						return (
							<line
								key={finger}
								x1={line.x1}
								y1={line.y1}
								x2={line.x2}
								y2={line.y2}
								stroke={fingerColor(finger, palette)}
								strokeWidth={strokeWidth}
								strokeLinecap="round"
								strokeDasharray={len}
								strokeDashoffset={len * (1 - r)}
							/>
						);
					}
					const dot = dots[finger];
					if (dot) {
						return (
							<circle
								key={finger}
								cx={dot.cx}
								cy={dot.cy}
								r={dot.r * r}
								fill={fingerColor(finger, palette)}
							/>
						);
					}
					return null;
				})}
			</g>
		</svg>
	);
};

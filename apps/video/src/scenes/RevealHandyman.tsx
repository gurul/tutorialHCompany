// Scene 3 — "reveal-handyman" (240 frames). Light world. THE reveal.
// Beat 1: "ask the website itself." masked line, exits upward.
// Beat 2: a lone accent "?" hangs center; the hand's index stroke slides in
//   from the right and taps it — the "?" pops and dissolves, then the other
//   strokes draw on around the index (lib stagger thumb→pinky draws beneath
//   the already-landed index overlay, which shares its exact geometry).
// Beat 3: hand springs left to x≈700, "handyman" wordmark rises beside it.
// Beat 4: supporting line fades in; final 12 frames push the frame forward.

import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop } from '../lib/Backdrop';
import { Hand, HAND_ASPECT, HAND_VIEWBOX } from '../lib/Hand';
import { TypeReveal } from '../lib/TypeReveal';
import { ACCENT, INK, INK_60, SPRING_POP, SPRING_SNAPPY, SPRING_SOFT } from '../lib/tokens';
import { fontFamily } from '../lib/font';

// Frame map (30 fps, 240 frames total).
const F = {
	copyIn: 2, // beat 1 line enters
	copyOut: 40, // beat 1 line exits upward
	qIn: 46, // "?" hangs center
	slideIn: 50, // index stroke starts sliding in from the right
	tap: 64, // index lands on the "?"
	qFadeStart: 70,
	qFadeEnd: 84, // "?" fully dissolved
	drawStart: 72, // remaining strokes draw on (thumb→pinky)
	drawEnd: 106, // pinky completes
	pop: 104, // whole-hand celebratory overshoot
	move: 122, // hand springs left to the lockup position
	wordmark: 128, // "handyman" masked reveal
	support: 182, // supporting line fade+rise
	pushStart: 228, // final 12-frame push forward
} as const;

const HAND_W = 420;
const HAND_H = HAND_W * HAND_ASPECT;
// viewBox '-297 -264 595 625' → px scale + center offset for the index tip.
const VB_SCALE = HAND_W / 595;
// Index fingertip (Hand.tsx OPEN_LINES.index endpoint, X-mirrored by the
// engine's scale(-1 1)) relative to the viewBox center (0.5, 48.5).
const INDEX_TIP_PX = { x: (160 - 0.5) * VB_SCALE, y: (-190 - 48.5) * VB_SCALE };
// The "?" hangs at screen center; the hand is placed so its index tip touches
// the glyph's dot from below-left (NOT the glyph center — the ~82px-wide
// accent stroke would fully occlude the accent "?" and hide the tap beat).
const Q_POS = { x: 960, y: 540 };
// Nudged for the soft-rounded skin: round caps extend ~r past the endpoint,
// so the touch point sits lower-left or the cap swallows the "?" dot.
const TIP_TOUCH = { x: 926, y: 612 };
const HAND_C2 = { x: TIP_TOUCH.x - INDEX_TIP_PX.x, y: TIP_TOUCH.y - INDEX_TIP_PX.y };
const HAND_C3 = { x: 700, y: 500 };

// Exact index-stroke geometry from Hand.tsx (OPEN_LINES.index / STROKE_OPEN),
// mirrored the same way, so the overlay sits pixel-perfect over the lib hand.
const INDEX_LINE = { x1: -64, y1: 56, x2: -160, y2: -190 };
const STROKE_OPEN = 87;

export const RevealHandyman: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	// Beat 2 — "?" enter, tap pop, dissolve.
	const qEnter = Math.min(1, spring({ frame: frame - F.qIn, fps, config: SPRING_SOFT }));
	const qPop = spring({ frame: frame - F.tap, fps, config: SPRING_SNAPPY });
	const qFade = interpolate(frame, [F.qFadeStart, F.qFadeEnd], [1, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const qScale = (0.9 + 0.1 * qEnter) * (1 + 0.28 * qPop);
	const qOpacity = qEnter * qFade;

	// Index stroke slides in from the right (single subtle settle = the tap).
	const slide = spring({ frame: frame - F.slideIn, fps, config: SPRING_SNAPPY });
	const indexDx = (1 - slide) * 1150;

	// Remaining strokes draw on thumb→pinky; the lib redraws the index beneath
	// the identical overlay, so the index reads as born first.
	const reveal = interpolate(frame, [F.drawStart, F.drawEnd], [0, 1], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// ONE celebratory overshoot on the whole hand as the pinky completes
	// (scale 100→~104→100): pop up, soft return.
	const popUp = spring({ frame: frame - F.pop, fps, config: SPRING_POP });
	const popDown = spring({ frame: frame - F.pop - 6, fps, config: SPRING_SOFT });
	const handScale = 1 + 0.045 * (popUp - popDown);

	// Beat 3 — hand springs left into the lockup.
	const move = spring({ frame: frame - F.move, fps, config: SPRING_SOFT });
	const handX = interpolate(move, [0, 1], [HAND_C2.x, HAND_C3.x]);
	const handY = interpolate(move, [0, 1], [HAND_C2.y, HAND_C3.y]);

	// Beat 4 — supporting line fade + 40px rise.
	const supportRise = spring({ frame: frame - F.support, fps, config: SPRING_SOFT });
	const supportOpacity = interpolate(frame, [F.support, F.support + 18], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// Final 12 frames — the frame pushes forward ~4% (ease-out); the next
	// scene's zoom-through completes the move.
	const push = interpolate(frame, [F.pushStart, 239], [1, 1.04], {
		easing: Easing.out(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	return (
		<AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: '50% 50%' }}>
			<Backdrop variant="light">
				{/* Beat 1 — "ask the website itself." */}
				{frame < 64 && (
					<AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
						<TypeReveal
							lines={['ask the website itself.']}
							delay={F.copyIn}
							align="center"
							exitAt={F.copyOut}
							lineStyle={{
								fontSize: 96,
								fontWeight: 700,
								letterSpacing: '-0.03em',
								lineHeight: 1.05,
								color: INK,
							}}
						/>
					</AbsoluteFill>
				)}

				{/* Beat 2 — the lone accent "?" */}
				{frame >= F.qIn - 4 && frame <= F.qFadeEnd + 2 && (
					<div
						style={{
							position: 'absolute',
							left: Q_POS.x,
							top: Q_POS.y,
							transform: `translate(-50%, -50%) scale(${qScale})`,
							fontFamily,
							fontSize: 120,
							fontWeight: 700,
							letterSpacing: '-0.03em',
							lineHeight: 1,
							color: ACCENT,
							opacity: qOpacity,
						}}
					>
						?
					</div>
				)}

				{/* The hand — born from the question, then springs into the lockup. */}
				{frame >= F.slideIn - 2 && (
					<div
						style={{
							position: 'absolute',
							left: handX - HAND_W / 2,
							top: handY - HAND_H / 2,
							width: HAND_W,
							height: HAND_H,
							transform: `scale(${handScale})`,
							transformOrigin: '50% 50%',
						}}
					>
						<Hand pose="open" width={HAND_W} reveal={reveal} style={{ position: 'absolute', inset: 0 }} />
						{/* Index overlay — exact lib geometry, slides in from the right. */}
						<svg
							viewBox={HAND_VIEWBOX}
							width={HAND_W}
							height={HAND_H}
							fill="none"
							style={{ position: 'absolute', inset: 0, transform: `translateX(${indexDx}px)` }}
						>
							<g transform="scale(-1 1)">
								<line
									x1={INDEX_LINE.x1}
									y1={INDEX_LINE.y1}
									x2={INDEX_LINE.x2}
									y2={INDEX_LINE.y2}
									stroke={ACCENT}
									strokeWidth={STROKE_OPEN}
									strokeLinecap="round"
								/>
							</g>
						</svg>
					</div>
				)}

				{/* Beat 3 — wordmark rises beside the hand (baseline-aligned lockup). */}
				<TypeReveal
					lines={['handyman']}
					delay={F.wordmark}
					align="left"
					style={{ position: 'absolute', left: 952, top: 468 }}
					lineStyle={{
						fontSize: 150,
						fontWeight: 700,
						letterSpacing: '-0.03em',
						lineHeight: 1.02,
						color: INK,
					}}
				/>

				{/* Beat 4 — supporting line, ~90px below the lockup. */}
				<div
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						top: 810,
						textAlign: 'center',
						fontFamily,
						fontSize: 36,
						fontWeight: 400,
						letterSpacing: '-0.01em',
						lineHeight: 1.3,
						color: INK_60,
						opacity: supportOpacity,
						transform: `translateY(${(1 - supportRise) * 40}px)`,
					}}
				>
					an animated hand shows you — or does it for you.
				</div>
			</Backdrop>
		</AbsoluteFill>
	);
};

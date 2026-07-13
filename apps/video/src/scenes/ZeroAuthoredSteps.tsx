// Scene 5 — "zero-authored-steps" (240 frames, light world).
// The mechanism: capture the live page → holo3 plans → crosshair grounds the
// next step. One full cycle at line 2, then a compressed replay selling
// "every step". Ends with the spotlight ring settled (scene 6 match-cuts).

import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop } from '../lib/Backdrop';
import { TypeReveal } from '../lib/TypeReveal';
import { SpotlightRing } from '../lib/widget';
import { ACCENT, INK, INK_60, PAPER, SPRING_SNAPPY, SPRING_SOFT } from '../lib/tokens';
import { fontFamily } from '../lib/font';

// ————— Geometry (absolute, 1920×1080) —————
const CARD_X = 1120;
const CARD_Y = 200;
const CARD_W = 560;
const CARD_H = 680;
const PAD = 36;

// Target button (primary button of the realistic row, inside the card).
const BTN_W = 180;
const BTN_H = 48;
const BTN_X = CARD_X + CARD_W - PAD - BTN_W; // 1464
const BTN_Y = CARD_Y + CARD_H - PAD - BTN_H; // 796
const BTN_CX = BTN_X + BTN_W / 2; // 1554
const BTN_CY = BTN_Y + BTN_H / 2; // 820

// holo3 chip near the top.
const CHIP_CX = 1520;
const CHIP_CY = 116;

type Pt = { x: number; y: number };
const qb = (a: Pt, c: Pt, b: Pt, t: number): Pt => ({
	x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t ** 2 * b.x,
	y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t ** 2 * b.y,
});

// Dotted path: target button ⇄ chip (bows right).
const PATH_A: Pt = { x: BTN_CX, y: BTN_CY };
const PATH_C: Pt = { x: 1748, y: 470 };
const PATH_B: Pt = { x: CHIP_CX + 6, y: CHIP_CY + 26 };

// Thumbnail flight: card center → just under the chip (bows right).
const FLY_A: Pt = { x: CARD_X + CARD_W / 2, y: CARD_Y + CARD_H / 2 };
const FLY_C: Pt = { x: 1730, y: 420 };
const FLY_B: Pt = { x: CHIP_CX, y: 180 };

// Base cycle offsets (frames at speed 1). Flash at 0, ring blooms at 50.
const OFF_SNAP_HOLD = 3;
const OFF_ARRIVE = 25;
const OFF_CROSS = 32;
const OFF_RING = 50;

const CYCLES = [
	{ t0: 60, s: 1 }, // the CAPTURE, with line 2
	{ t0: 150, s: 0.6 }, // compressed replay — "every step"
] as const;

const SkeletonBar: React.FC<{ x: number; y: number; w: number; h: number; a?: number }> = ({
	x,
	y,
	w,
	h,
	a = 0.07,
}) => (
	<div
		style={{
			position: 'absolute',
			left: x,
			top: y,
			width: w,
			height: h,
			borderRadius: h / 2,
			background: `rgba(22,22,26,${a})`,
		}}
	/>
);

export const ZeroAuthoredSteps: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	// Card entrance.
	const cardIn = spring({ frame: frame - 4, fps, config: SPRING_SOFT });
	const cardY = (1 - cardIn) * 44;

	// Chip entrance (before the first capture).
	const chipIn = spring({ frame: frame - 36, fps, config: SPRING_SNAPPY });

	// Chip pulse — once per cycle when the thumbnail lands.
	let chipPulse = 0;
	for (const { t0, s } of CYCLES) {
		const local = (frame - t0) / s;
		chipPulse = Math.max(
			chipPulse,
			interpolate(local, [OFF_ARRIVE - 1, OFF_ARRIVE + 4, OFF_ARRIVE + 10], [0, 1, 0], {
				extrapolateLeft: 'clamp',
				extrapolateRight: 'clamp',
			}),
		);
	}

	return (
		<Backdrop variant="light">
			{/* LEFT column — copy. */}
			<div
				style={{
					position: 'absolute',
					left: 160,
					top: 0,
					bottom: 0,
					width: 720,
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'center',
					gap: 30,
				}}
			>
				<TypeReveal
					lines={['zero authored steps.']}
					delay={8}
					lineStyle={{
						fontSize: 64,
						fontWeight: 700,
						letterSpacing: '-0.02em',
						lineHeight: 1.1,
						color: INK,
					}}
				/>
				<TypeReveal
					lines={['it screenshots the live page —', 'holo3 plans the next step. every step.']}
					delay={55}
					stagger={50}
					lineStyle={{
						fontSize: 40,
						fontWeight: 400,
						letterSpacing: '-0.01em',
						lineHeight: 1.3,
						color: INK_60,
					}}
				/>
			</div>

			{/* RIGHT — rebuilt page mockup (never a screenshot). */}
			<div
				style={{
					position: 'absolute',
					left: CARD_X,
					top: CARD_Y,
					width: CARD_W,
					height: CARD_H,
					background: PAPER,
					borderRadius: 16,
					boxShadow: '0 2px 6px rgba(0,0,0,0.05), 0 18px 50px rgba(0,0,0,0.10)',
					transform: `translateY(${cardY}px)`,
					opacity: cardIn,
				}}
			>
				{/* Header row */}
				<div
					style={{
						position: 'absolute',
						left: PAD,
						top: PAD,
						width: 44,
						height: 44,
						borderRadius: 999,
						background: 'rgba(22,22,26,0.08)',
					}}
				/>
				<SkeletonBar x={PAD + 58} y={PAD + 6} w={130} h={14} a={0.08} />
				<SkeletonBar x={PAD + 58} y={PAD + 26} w={90} h={10} a={0.06} />
				<SkeletonBar x={CARD_W - PAD - 64} y={PAD + 14} w={64} h={16} a={0.08} />
				{/* Hero block */}
				<div
					style={{
						position: 'absolute',
						left: PAD,
						top: 108,
						width: CARD_W - PAD * 2,
						height: 172,
						borderRadius: 12,
						background: 'rgba(22,22,26,0.06)',
					}}
				/>
				{/* Copy bars */}
				<SkeletonBar x={PAD} y={308} w={CARD_W - PAD * 2} h={18} a={0.08} />
				<SkeletonBar x={PAD} y={338} w={428} h={18} a={0.08} />
				<SkeletonBar x={PAD} y={368} w={332} h={18} a={0.07} />
				<SkeletonBar x={PAD} y={418} w={196} h={22} a={0.08} />
				<SkeletonBar x={PAD} y={458} w={CARD_W - PAD * 2} h={14} a={0.06} />
				<SkeletonBar x={PAD} y={484} w={452} h={14} a={0.06} />
				<SkeletonBar x={PAD} y={510} w={376} h={14} a={0.06} />
				<SkeletonBar x={PAD} y={560} w={140} h={26} a={0.08} />
				{/* Realistic button row */}
				<div
					style={{
						position: 'absolute',
						left: BTN_X - CARD_X - 156,
						top: BTN_Y - CARD_Y,
						width: 140,
						height: BTN_H,
						borderRadius: 13,
						border: '1.6px solid rgba(22,22,26,0.15)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						fontFamily,
						fontSize: 19,
						fontWeight: 600,
						color: INK_60,
					}}
				>
					Details
				</div>
				<div
					style={{
						position: 'absolute',
						left: BTN_X - CARD_X,
						top: BTN_Y - CARD_Y,
						width: BTN_W,
						height: BTN_H,
						borderRadius: 13,
						background: INK,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						fontFamily,
						fontSize: 19,
						fontWeight: 600,
						letterSpacing: '0.01em',
						color: PAPER,
					}}
				>
					Add to cart
				</div>
			</div>

			{/* Per-cycle choreography: flash → snapshot flight → crosshair → ring. */}
			{CYCLES.map(({ t0, s }, ci) => {
				const local = (frame - t0) / s;
				if (local < 0) return null;
				const isLast = ci === CYCLES.length - 1;

				// 1-frame 60% white flash over the card.
				const flash = frame >= t0 && frame < t0 + 1 ? 0.6 : 0;

				// Snapshot frame → thumbnail flight.
				const fly = spring({ frame: local - OFF_SNAP_HOLD, fps, config: SPRING_SNAPPY });
				const flyPt = qb(FLY_A, FLY_C, FLY_B, fly);
				const thumbW = interpolate(fly, [0, 1], [CARD_W, 120]);
				const thumbH = thumbW * (CARD_H / CARD_W);
				const thumbR = interpolate(fly, [0, 1], [16, 6]);
				const thumbOpacity = interpolate(local, [0, 2, OFF_ARRIVE + 1, OFF_ARRIVE + 9], [0, 1, 1, 0], {
					extrapolateLeft: 'clamp',
					extrapolateRight: 'clamp',
				});

				// Dotted path visibility (fades before the next capture / at the end).
				const pathIn = interpolate(local, [2, 10], [0, 0.55], {
					extrapolateLeft: 'clamp',
					extrapolateRight: 'clamp',
				});
				const pathOut = interpolate(local, [82, 90], [1, 0], {
					extrapolateLeft: 'clamp',
					extrapolateRight: 'clamp',
				});
				const pathOpacity = pathIn * pathOut;

				// Crosshair travels chip → button along the dotted path.
				const travel = spring({ frame: local - OFF_CROSS, fps, config: SPRING_SNAPPY });
				const cross = qb(PATH_A, PATH_C, PATH_B, 1 - travel);
				const crossOpacity =
					interpolate(local, [OFF_CROSS - 2, OFF_CROSS + 2], [0, 1], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					}) *
					interpolate(local, [OFF_RING, OFF_RING + 6], [1, 0], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					});

				// Spotlight ring: blooms 130% → 100% (workhorse), page NOT dimmed.
				const ringProgress = spring({ frame: local - OFF_RING, fps, config: SPRING_SOFT });
				const ringScale = interpolate(ringProgress, [0, 1], [1.3, 1]);
				// Earlier cycle's ring fades out just before the next capture.
				const next = CYCLES[ci + 1];
				const ringFade = isLast
					? 1
					: interpolate(frame, [next.t0 - 5, next.t0 + 1], [1, 0], {
							extrapolateLeft: 'clamp',
							extrapolateRight: 'clamp',
						});

				const RING_M = 12;
				return (
					<React.Fragment key={ci}>
						{/* Dotted path + crosshair hairlines. */}
						<svg
							width={1920}
							height={1080}
							viewBox="0 0 1920 1080"
							style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
						>
							<path
								d={`M ${PATH_A.x} ${PATH_A.y} Q ${PATH_C.x} ${PATH_C.y} ${PATH_B.x} ${PATH_B.y}`}
								fill="none"
								stroke={ACCENT}
								strokeWidth={2.5}
								strokeLinecap="round"
								strokeDasharray="0.5 12"
								opacity={pathOpacity}
							/>
							{crossOpacity > 0 && (
								<g opacity={crossOpacity}>
									<line
										x1={1060}
										y1={cross.y}
										x2={1740}
										y2={cross.y}
										stroke={ACCENT}
										strokeWidth={1.5}
										opacity={0.7}
									/>
									<line
										x1={cross.x}
										y1={160}
										x2={cross.x}
										y2={920}
										stroke={ACCENT}
										strokeWidth={1.5}
										opacity={0.7}
									/>
									<circle cx={cross.x} cy={cross.y} r={7} fill="none" stroke={ACCENT} strokeWidth={2.5} />
								</g>
							)}
						</svg>

						{/* Snapshot frame / flying thumbnail. */}
						{thumbOpacity > 0 && (
							<div
								style={{
									position: 'absolute',
									left: flyPt.x - thumbW / 2,
									top: flyPt.y - thumbH / 2,
									width: thumbW,
									height: thumbH,
									border: `3px solid ${ACCENT}`,
									borderRadius: thumbR,
									background: `rgba(255,255,255,${0.9 * fly})`,
									opacity: thumbOpacity,
								}}
							>
								<div
									style={{
										position: 'absolute',
										left: '14%',
										top: '16%',
										width: '72%',
										height: '10%',
										borderRadius: 99,
										background: 'rgba(22,22,26,0.08)',
										opacity: fly,
									}}
								/>
								<div
									style={{
										position: 'absolute',
										left: '14%',
										top: '34%',
										width: '52%',
										height: '10%',
										borderRadius: 99,
										background: 'rgba(22,22,26,0.06)',
										opacity: fly,
									}}
								/>
							</div>
						)}

						{/* 1-frame capture flash over the card. */}
						{flash > 0 && (
							<div
								style={{
									position: 'absolute',
									left: CARD_X,
									top: CARD_Y,
									width: CARD_W,
									height: CARD_H,
									borderRadius: 16,
									background: PAPER,
									opacity: flash,
								}}
							/>
						)}

						{/* Spotlight ring around the target button. */}
						{ringProgress > 0.001 && ringFade > 0 && (
							<div style={{ position: 'absolute', left: 0, top: 0, opacity: ringFade }}>
								<SpotlightRing
									width={BTN_W + RING_M * 2}
									height={BTN_H + RING_M * 2}
									progress={ringProgress}
									style={{
										position: 'absolute',
										left: BTN_CX - (BTN_W / 2 + RING_M),
										top: BTN_CY - (BTN_H / 2 + RING_M),
										transform: `scale(${ringScale * (0.92 + 0.08 * ringProgress)})`,
									}}
								/>
							</div>
						)}
					</React.Fragment>
				);
			})}

			{/* holo3 chip — INK pill near the top; pulses when the capture lands. */}
			<div
				style={{
					position: 'absolute',
					left: CHIP_CX,
					top: CHIP_CY,
					transform: `translate(-50%, -50%) translateY(${(1 - chipIn) * -18}px) scale(${1 + 0.03 * chipPulse})`,
					opacity: chipIn,
					background: INK,
					color: PAPER,
					borderRadius: 999,
					padding: '11px 26px',
					fontFamily,
					fontSize: 22,
					fontWeight: 500,
					letterSpacing: '0.01em',
					boxShadow: '0 8px 26px rgba(22,22,26,0.22)',
				}}
			>
				holo3
			</div>
		</Backdrop>
	);
};

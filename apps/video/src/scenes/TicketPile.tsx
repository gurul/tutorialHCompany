// Scene 2 "ticket-pile" — 210 frames. Dark world, tension build.
// The lone "how do I…?" (scene 1's final frame) shrinks into a ticket chip;
// nine more tickets rain into a messy pile while three copy lines land in the
// upper half. Held breath, then THE HAND WIPE erases the dark world to light.

import React from 'react';
import {
	AbsoluteFill,
	Easing,
	interpolate,
	interpolateColors,
	random,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';
import { Backdrop } from '../lib/Backdrop';
import { TypeReveal } from '../lib/TypeReveal';
import { fontFamily } from '../lib/font';
import { INK, INK_60, PAPER, PAPER_WARM, SPRING_SNAPPY, SPRING_POP } from '../lib/tokens';

const W = 1920;
const H = 1080;
const CHIP_W = 480;
const CHIP_H = 88;

// First chip (the morph target) — bottom row, centered under the copy.
const CHIP0 = { left: (W - CHIP_W) / 2, top: 968 };

// Nine raining tickets. Bursts of three with 3-frame start staggers inside
// each burst, bursts spaced so the last chip lands with the frame-116 slam.
const RAIN: { text: string; left: number; top: number; start: number }[] = [
	{ text: 'how do I invite…', left: 150, top: 972, start: 18 },
	{ text: 'how do I export…', left: 1310, top: 966, start: 21 },
	{ text: 'how do I undo…', left: 430, top: 892, start: 24 },
	{ text: 'how do I reset my…', left: 990, top: 888, start: 56 },
	{ text: 'how do I share…', left: 1442, top: 894, start: 59 },
	{ text: 'how do I change…', left: 250, top: 812, start: 62 },
	{ text: 'how do I connect…', left: 780, top: 806, start: 100 },
	{ text: 'how do I filter…', left: 1252, top: 816, start: 103 },
	{ text: 'how do I delete…', left: 600, top: 730, start: 106 },
];

const COPY_LINE: React.CSSProperties = {
	fontSize: 72,
	fontWeight: 600,
	letterSpacing: '-0.02em',
	lineHeight: 1.15,
	color: PAPER,
};

const chipShadow = (a: number) =>
	`0 20px 44px rgba(0,0,0,${0.5 * a}), 0 6px 14px rgba(0,0,0,${0.35 * a})`;

export const TicketPile: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	// --- Frames 2–16: "how do I…?" (140px = 28px × scale 5) shrinks into chip 0.
	// Held for 2 frames first so the 1→2 match cut lands (same line, same spot).
	const morph = spring({ frame: frame - 2, fps, config: SPRING_SNAPPY, durationInFrames: 14 });
	const morphScale = interpolate(morph, [0, 1], [5, 1]);
	const morphTop = interpolate(morph, [0, 1], [H / 2 - CHIP_H / 2, CHIP0.top]);
	const morphBg = interpolate(morph, [0.45, 1], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	// Scene 1's hook is rgba(255,255,255,0.92) at -0.025em — start from exactly that.
	const morphColor = interpolateColors(morph, [0.35, 0.85], ['rgba(255, 255, 255, 0.92)', INK]);
	const morphTracking = interpolate(morph, [0, 1], [-0.025, -0.02]);
	const morphWeight = Math.round(interpolate(morph, [0, 1], [700, 500]) / 100) * 100;
	const chip0Rot = (random('ticket-rot-0') * 4 - 2) * morph;

	// --- Copy line dims.
	const line1Dim = interpolate(frame, [68, 82], [1, 0.35], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const line2Dim = interpolate(frame, [116, 130], [1, 0.35], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// --- Line 3 type slam (SPRING_POP allowed here by the scene spec).
	const slam = spring({ frame: frame - 116, fps, config: SPRING_POP });
	const slamScale = 1.06 - 0.06 * slam;
	const slamOpacity = interpolate(slam, [0, 0.35], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// --- Frames 150–168: held breath, radial dim (-30% glow).
	const dim = interpolate(frame, [150, 168], [0, 0.3], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// --- Frames 168–~190: the hand wipe. Leading edge of a 140px near-white
	// band sweeps left→right; behind it the world is light and empty.
	const edge = interpolate(frame, [168, 190], [-140, W + 140], {
		easing: Easing.bezier(0.4, 0, 0.1, 1),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	return (
		<AbsoluteFill style={{ fontFamily }}>
			<Backdrop variant="dark">
				{/* Copy — masked reveals, upper half, centered. */}
				<div
					style={{
						position: 'absolute',
						top: 148,
						left: 0,
						right: 0,
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						gap: 14,
					}}
				>
					<div style={{ opacity: line1Dim }}>
						<TypeReveal
							lines={['the docs have the answer.']}
							delay={20}
							align="center"
							lineStyle={COPY_LINE}
						/>
					</div>
					<div style={{ opacity: line2Dim }}>
						<TypeReveal
							lines={['nobody opens the docs.']}
							delay={68}
							align="center"
							lineStyle={COPY_LINE}
						/>
					</div>
					<div
						style={{
							...COPY_LINE,
							fontFamily,
							opacity: slamOpacity,
							transform: `scale(${slamScale})`,
						}}
					>
						so it becomes a ticket.
					</div>
				</div>

				{/* Chip 0 — the shrunken "how do I…?". */}
				<div
					style={{
						position: 'absolute',
						left: CHIP0.left,
						top: morphTop,
						width: CHIP_W,
						height: CHIP_H,
						borderRadius: 12,
						backgroundColor: `rgba(247, 247, 249, ${morphBg})`,
						boxShadow: chipShadow(morphBg),
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						transform: `scale(${morphScale}) rotate(${chip0Rot}deg)`,
						fontFamily,
						fontSize: 28,
						fontWeight: morphWeight,
						letterSpacing: `${morphTracking}em`,
						color: morphColor,
						whiteSpace: 'nowrap',
					}}
				>
					{/* Drawn ellipsis dots mirroring ColdOpenQuestions' construction
					    (30px dots at 140px type = 6px at this 28px chip, gaps ÷5), so
					    the 1→2 match cut shows the identical lockup, not a font "…".
					    One wrapping span: the chip is a centering flexbox, and bare
					    inline-blocks as flex items would center instead of sitting on
					    the text baseline like scene 1's dots. */}
					<span>
						how do I
						{[0, 1, 2].map((i) => (
							<span
								key={i}
								style={{
									display: 'inline-block',
									width: 6,
									height: 6,
									borderRadius: '50%',
									background: 'currentcolor',
									marginLeft: i === 0 ? 3.2 : 3.6,
								}}
							/>
						))}
						<span style={{ marginLeft: 2.8 }}>?</span>
					</span>
				</div>

				{/* Nine raining tickets. */}
				{RAIN.map((c, i) => {
					if (frame < c.start) return null;
					const drop = spring({ frame: frame - c.start, fps, config: SPRING_SNAPPY });
					const y = interpolate(drop, [0, 1], [-(c.top + CHIP_H + 260), 0]);
					const rot = random(`ticket-rot-${i + 1}`) * 4 - 2;
					return (
						<div
							key={i}
							style={{
								position: 'absolute',
								left: c.left,
								top: c.top,
								width: CHIP_W,
								height: CHIP_H,
								borderRadius: 12,
								backgroundColor: PAPER_WARM,
								boxShadow: chipShadow(1),
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								overflow: 'hidden',
								transform: `translateY(${y}px) rotate(${rot}deg)`,
								fontFamily,
								fontSize: 28,
								fontWeight: 500,
								letterSpacing: '-0.02em',
								color: INK_60,
								whiteSpace: 'nowrap',
							}}
						>
							{c.text}
						</div>
					);
				})}
			</Backdrop>

			{/* Held-breath radial dim over the dark world. */}
			<AbsoluteFill
				style={{
					pointerEvents: 'none',
					opacity: dim,
					background:
						'radial-gradient(ellipse 90% 80% at 50% 45%, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.6) 100%)',
				}}
			/>

			{/* Light, EMPTY world revealed behind the wipe's leading edge. */}
			{frame >= 166 && (
				<AbsoluteFill style={{ clipPath: `inset(0 ${Math.max(0, W - edge)}px 0 0)` }}>
					<Backdrop variant="light" />
				</AbsoluteFill>
			)}

			{/* The 140px near-white wipe band. */}
			{frame >= 166 && (
				<div
					style={{
						position: 'absolute',
						left: edge - 140,
						top: 0,
						width: 140,
						height: H,
						backgroundColor: PAPER,
						boxShadow: '0 0 60px 24px rgba(255,255,255,0.35)',
					}}
				/>
			)}
		</AbsoluteFill>
	);
};

// Scene 6 — "two-modes-and-voice" (300 frames · light world).
// Beat 1+2 (0–195): split-screen guide mode vs do-it-for-me, each panel a
// rebuilt page mockup with a live click loop (system cursor left, brand hand
// right, offset half a cycle). Kicker line lower-third; a 6-frame 8%-black
// scrim flashes over both mockups and wipes away — showing what does NOT
// happen. Beat 3 (195–300): voice — 24-bar accent waveform, Alt+H keycap,
// StatusPill; bars collapse into one accent line that whips off right.

import React from 'react';
import {
	AbsoluteFill,
	Easing,
	interpolate,
	random,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';
import { Backdrop } from '../lib/Backdrop';
import { Hand } from '../lib/Hand';
import { TypeReveal } from '../lib/TypeReveal';
import { SpotlightRing, StatusPill, TourCard } from '../lib/widget';
import { fontFamily } from '../lib/font';
import {
	ACCENT,
	EASE_OUT_EXPO,
	INK,
	INK_60,
	PAPER,
	SPRING_SNAPPY,
	SPRING_SOFT,
} from '../lib/tokens';

// ---------------------------------------------------------------- constants

const PANEL_W = 960;
const PANELS_EXIT = 195; // panels slide apart + fade over 10 frames

// Click loop.
const CYCLE = 90;
const CLICK_T = 46; // press starts
const ADVANCE_T = 50; // ring + card spring to the next target

// Page mockup (panel-relative).
const CARD_X = 160;
const CARD_Y = 200;
const CARD_W = 640;
const CARD_H = 460;

type Rect = { x: number; y: number; w: number; h: number };

/** Two tour targets inside the mockup, panel coords. */
const TARGETS: [Rect, Rect] = [
	{ x: CARD_X + 48, y: CARD_Y + 340, w: 190, h: 54 }, // "Save changes" button
	{ x: CARD_X + 410, y: CARD_Y + 40, w: 170, h: 46 }, // "Settings" chip
];
const CARD_POS: [{ x: number; y: number }, { x: number; y: number }] = [
	{ x: 440, y: 600 },
	{ x: 430, y: 330 },
];
const INSTRUCTIONS: [string, string] = [
	'Click "Save changes" to publish.',
	'Open Settings from the top bar.',
];

// Scrim graft (scene frames).
const SCRIM_IN = 120;
const SCRIM_HOLD_END = 126;
const SCRIM_WIPE_END = 134;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const center = (r: Rect): { x: number; y: number } => ({
	x: r.x + r.w / 2,
	y: r.y + r.h / 2,
});
const easeInOutCubic = (u: number): number =>
	u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

/** Cubic bezier between two points with a perpendicular arc. */
function bezierGlide(
	p0: { x: number; y: number },
	p1: { x: number; y: number },
	u: number,
): { x: number; y: number } {
	const dx = p1.x - p0.x;
	const dy = p1.y - p0.y;
	const len = Math.max(1, Math.hypot(dx, dy));
	const px = (-dy / len) * 70;
	const py = (dx / len) * 70;
	const c1 = { x: p0.x + dx * 0.3 + px, y: p0.y + dy * 0.3 + py };
	const c2 = { x: p0.x + dx * 0.7 + px, y: p0.y + dy * 0.7 + py };
	const v = 1 - u;
	return {
		x: v * v * v * p0.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * p1.x,
		y: v * v * v * p0.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * p1.y,
	};
}

// ------------------------------------------------------------- mode panels

const ModePanel: React.FC<{
	side: 'left' | 'right';
	headline: string;
	headlineDelay: number;
	loopStart: number;
}> = ({ side, headline, headlineDelay, loopStart }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	const out = interpolate(frame, [PANELS_EXIT, PANELS_EXIT + 10], [0, 1], {
		easing: Easing.bezier(...EASE_OUT_EXPO),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// ---- click loop state
	const elapsed = Math.max(0, frame - loopStart);
	const cycle = Math.floor(elapsed / CYCLE);
	const t = elapsed % CYCLE;
	const cur = cycle % 2;
	const nxt = (cur + 1) % 2;

	// Cursor travels previous target -> current target during t 0..44.
	const uRaw =
		side === 'left'
			? easeInOutCubic(
					interpolate(t, [0, 44], [0, 1], {
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					}),
				)
			: spring({ frame: t, fps, config: SPRING_SOFT, durationInFrames: 44 });
	const cursorPos = bezierGlide(center(TARGETS[nxt]), center(TARGETS[cur]), uRaw);

	// Press pulse 0 -> 1 -> 0 around the click.
	const press =
		spring({ frame: t - CLICK_T, fps, config: SPRING_SNAPPY }) -
		spring({ frame: t - (CLICK_T + 8), fps, config: SPRING_SNAPPY });

	// Ring + card advance to the next target after the click.
	const moveProg = spring({ frame: t - ADVANCE_T, fps, config: SPRING_SNAPPY });
	const advanced = t >= ADVANCE_T;
	const activeIdx = advanced ? nxt : cur;
	const step = ((cycle + (advanced ? 1 : 0)) % 4) + 1;

	const bloom = spring({ frame, fps, config: SPRING_SOFT });
	const ringProgress = bloom * (advanced ? 0.55 + 0.45 * moveProg : 1);
	const ring = {
		x: lerp(TARGETS[cur].x, TARGETS[nxt].x, moveProg) - 8,
		y: lerp(TARGETS[cur].y, TARGETS[nxt].y, moveProg) - 8,
		w: lerp(TARGETS[cur].w, TARGETS[nxt].w, moveProg) + 16,
		h: lerp(TARGETS[cur].h, TARGETS[nxt].h, moveProg) + 16,
	};
	const cardPos = {
		x: lerp(CARD_POS[cur].x, CARD_POS[nxt].x, moveProg),
		y: lerp(CARD_POS[cur].y, CARD_POS[nxt].y, moveProg),
	};

	const depress: [number, number] = [cur === 0 ? 2 * press : 0, cur === 1 ? 2 * press : 0];

	// ---- entrances
	const mockIn = spring({ frame: frame - 2, fps, config: SPRING_SOFT });
	const tourIn = spring({ frame: frame - 14, fps, config: SPRING_SOFT });
	const handReveal = spring({ frame: frame - 4, fps, config: SPRING_SOFT });

	// ---- scrim graft + luminance pulse
	const scrimOn = frame >= SCRIM_IN && frame <= SCRIM_WIPE_END;
	const scrimWipe = interpolate(frame, [SCRIM_HOLD_END, SCRIM_WIPE_END], [0, 100], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const lum = interpolate(frame, [SCRIM_WIPE_END, 141, 154], [0, 0.16, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	const skeleton = 'rgba(22,22,26,0.07)';

	return (
		<div
			style={{
				position: 'absolute',
				left: side === 'left' ? 0 : PANEL_W,
				top: 0,
				width: PANEL_W,
				height: 1080,
				transform: `translateX(${(side === 'left' ? -60 : 60) * out}px)`,
				opacity: 1 - out,
			}}
		>
			<TypeReveal
				lines={[headline]}
				delay={headlineDelay}
				style={{ position: 'absolute', left: 84, top: 84 }}
				lineStyle={{
					fontSize: 44,
					fontWeight: 700,
					letterSpacing: '-0.02em',
					lineHeight: 1.1,
					color: INK,
				}}
			/>

			{/* Page mockup */}
			<div
				style={{
					position: 'absolute',
					left: CARD_X,
					top: CARD_Y,
					width: CARD_W,
					height: CARD_H,
					background: PAPER,
					borderRadius: 20,
					border: '1px solid rgba(22,22,26,0.10)',
					boxShadow: '0 2px 6px rgba(0,0,0,0.05), 0 18px 50px rgba(0,0,0,0.08)',
					transform: `scale(${0.97 + 0.03 * mockIn})`,
					opacity: Math.min(1, mockIn * 1.5),
				}}
			>
				{/* skeleton content */}
				<div
					style={{
						position: 'absolute',
						left: 36,
						top: 36,
						width: 30,
						height: 30,
						borderRadius: 99,
						background: skeleton,
					}}
				/>
				<div
					style={{
						position: 'absolute',
						left: 82,
						top: 44,
						width: 200,
						height: 14,
						borderRadius: 7,
						background: skeleton,
					}}
				/>
				{[430, 360, 300].map((w, i) => (
					<div
						key={i}
						style={{
							position: 'absolute',
							left: 36,
							top: 130 + i * 30,
							width: w,
							height: 12,
							borderRadius: 6,
							background: skeleton,
						}}
					/>
				))}
				{/* target B — Settings chip */}
				<div
					style={{
						position: 'absolute',
						left: 410,
						top: 40,
						width: 170,
						height: 46,
						borderRadius: 10,
						border: '1.5px solid rgba(22,22,26,0.18)',
						background: PAPER,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						fontFamily,
						fontSize: 17,
						fontWeight: 600,
						color: INK,
						transform: `translateY(${depress[1]}px)`,
					}}
				>
					Settings
				</div>
				{/* target A — Save button */}
				<div
					style={{
						position: 'absolute',
						left: 48,
						top: 340,
						width: 190,
						height: 54,
						borderRadius: 12,
						background: INK,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						fontFamily,
						fontSize: 18,
						fontWeight: 600,
						color: PAPER,
						transform: `translateY(${depress[0]}px)`,
					}}
				>
					Save changes
				</div>
				{/* the scrim that does NOT happen — flash + wipe away */}
				{scrimOn && (
					<div
						style={{
							position: 'absolute',
							inset: 0,
							borderRadius: 20,
							background: 'rgba(0,0,0,0.08)',
							clipPath: `inset(0 0 0 ${scrimWipe}%)`,
						}}
					/>
				)}
				{/* luminance pulse right after the scrim wipes */}
				{lum > 0 && (
					<div
						style={{
							position: 'absolute',
							inset: 0,
							borderRadius: 20,
							background: PAPER,
							opacity: lum,
						}}
					/>
				)}
			</div>

			<SpotlightRing
				width={ring.w}
				height={ring.h}
				progress={ringProgress}
				style={{ position: 'absolute', left: ring.x, top: ring.y }}
			/>

			<TourCard
				instruction={INSTRUCTIONS[activeIdx]}
				step={step}
				totalSteps={4}
				pressed={side === 'right' && press > 0.3}
				style={{
					position: 'absolute',
					left: cardPos.x,
					top: cardPos.y + (1 - tourIn) * 20,
					transform: 'scale(0.72)',
					transformOrigin: 'top left',
					opacity: tourIn,
				}}
			/>

			{side === 'left' ? (
				// plain system cursor arrow (ink)
				<svg
					width={30}
					height={34}
					viewBox="0 0 12 19"
					style={{
						position: 'absolute',
						left: cursorPos.x,
						top: cursorPos.y,
						transform: `scale(${1 - 0.1 * press})`,
						transformOrigin: 'top left',
					}}
				>
					<path
						d="M0 0 L0 15.2 L3.6 12 L5.8 17.6 L8.2 16.5 L6 11 L11 10.6 Z"
						fill={INK}
					/>
				</svg>
			) : (
				// the brand hand, pointer pose — fingertip on the click point
				<Hand
					pose="pointer"
					width={150}
					palette="tints"
					reveal={handReveal}
					style={{
						position: 'absolute',
						left: cursorPos.x - 136,
						top: cursorPos.y - 17,
						transform: `scale(${1 - 0.07 * press})`,
						transformOrigin: '90% 10%',
					}}
				/>
			)}
		</div>
	);
};

// ------------------------------------------------------------------ kicker

const KICKER_GROUPS = [
	'a ring.',
	'no dimming.',
	'no scrim.',
	'your real click advances the tour.',
] as const;

const Kicker: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const out = interpolate(frame, [PANELS_EXIT, PANELS_EXIT + 8], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	return (
		<div
			style={{
				position: 'absolute',
				bottom: 104,
				left: 0,
				width: '100%',
				display: 'flex',
				justifyContent: 'center',
				gap: '0.55em',
				fontFamily,
				fontSize: 30,
				fontWeight: 500,
				letterSpacing: '-0.01em',
				color: INK_60,
				opacity: 1 - out,
			}}
		>
			{KICKER_GROUPS.map((group, i) => {
				const enter = spring({ frame: frame - 105 - i * 8, fps, config: SPRING_SNAPPY });
				return (
					<span key={i} style={{ overflow: 'hidden', padding: '0.06em 0', display: 'inline-block' }}>
						<span
							style={{
								display: 'inline-block',
								transform: `translateY(${(1 - enter) * 110}%)`,
							}}
						>
							{group}
						</span>
					</span>
				);
			})}
		</div>
	);
};

// -------------------------------------------------------------- voice beat

const BAR_COUNT = 24;
const BAR_W = 6;
const BAR_GAP = 10;
const WAVE_START = 210;
const WAVE_WIN = 10; // 3 target changes per second (≤3 Hz)

/** Deterministic target height for bar i in window w. */
function barTarget(w: number, i: number): number {
	if (w < 0) return 10;
	const env = Math.sin(((i + 0.5) / BAR_COUNT) * Math.PI);
	return (12 + random(`wave-${i}-${w}`) * 118) * (0.35 + 0.65 * env);
}

const VoiceStage: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	// waveform
	const local = Math.max(0, frame - WAVE_START);
	const wIdx = Math.floor(local / WAVE_WIN);
	const wProg = spring({ frame: local - wIdx * WAVE_WIN, fps, config: SPRING_SOFT });

	// exit: bars collapse to a 4px line, line whips right off-frame
	const collapse = interpolate(frame, [292, 296], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const barsFade = interpolate(frame, [293, 296], [1, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const lineIn = interpolate(frame, [292, 295], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	// Must fully clear the right edge by frame 298 (line left edge ≈ 771 +
	// whip ≥ 1920) so the hard cut into scene 7 lands on empty ground.
	const whip = interpolate(frame, [293, 298], [0, 1400], {
		easing: Easing.in(Easing.cubic),
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// keycap
	const keyIn = spring({ frame: frame - 222, fps, config: SPRING_SOFT });
	const keyPress =
		spring({ frame: frame - 250, fps, config: SPRING_SNAPPY }) -
		spring({ frame: frame - 256, fps, config: SPRING_SNAPPY });
	const pillIn = spring({ frame: frame - 235, fps, config: SPRING_SOFT });

	const lineW = BAR_COUNT * BAR_W + (BAR_COUNT - 1) * BAR_GAP;

	return (
		<AbsoluteFill>
			<TypeReveal
				lines={['ask by voice. every step narrated.']}
				delay={206}
				align="center"
				style={{ position: 'absolute', top: 292, left: 0, right: 0 }}
				lineStyle={{
					fontSize: 56,
					fontWeight: 700,
					letterSpacing: '-0.02em',
					lineHeight: 1.1,
					color: INK,
				}}
			/>

			{/* waveform */}
			<div
				style={{
					position: 'absolute',
					top: 470,
					left: 0,
					width: '100%',
					height: 180,
					display: 'flex',
					justifyContent: 'center',
					alignItems: 'center',
					gap: BAR_GAP,
				}}
			>
				{Array.from({ length: BAR_COUNT }, (_, i) => {
					const target = lerp(barTarget(wIdx - 1, i), barTarget(wIdx, i), wProg);
					const enter = spring({
						frame: frame - 212 - Math.abs(i - (BAR_COUNT - 1) / 2) * 1.1,
						fps,
						config: SPRING_SNAPPY,
					});
					const h = lerp(Math.max(4, target * enter), 4, collapse);
					return (
						<div
							key={i}
							style={{
								width: BAR_W,
								height: h,
								borderRadius: 3,
								background: ACCENT,
								opacity: barsFade * Math.min(1, enter * 2),
							}}
						/>
					);
				})}
				{/* the single line the bars collapse into */}
				{lineIn > 0 && (
					<div
						style={{
							position: 'absolute',
							left: '50%',
							top: '50%',
							width: lineW + 4,
							height: 4,
							borderRadius: 2,
							background: ACCENT,
							opacity: lineIn,
							transform: `translate(-50%, -50%) translateX(${whip}px) scaleX(${0.3 + 0.7 * lineIn})`,
						}}
					/>
				)}
			</div>

			{/* Alt+H keycap + status pill — the PAIR is centered as one group */}
			<div
				style={{
					position: 'absolute',
					top: 726,
					left: 0,
					width: '100%',
					height: 80,
					display: 'flex',
					justifyContent: 'center',
					alignItems: 'center',
					gap: 36,
				}}
			>
				<div
					style={{
						transform: `translateY(${(1 - keyIn) * 18 + 2 * keyPress}px)`,
						opacity: keyIn,
						border: `1px solid ${INK}`,
						borderRadius: 12,
						padding: '14px 26px',
						background: PAPER,
						boxShadow: `0 ${3 - 2 * keyPress}px 0 rgba(22,22,26,0.18)`,
						fontFamily,
						fontSize: 30,
						fontWeight: 600,
						letterSpacing: '0.01em',
						color: INK,
					}}
				>
					Alt+H
				</div>
				{/* opacity is 0 until frame 235; always mounted so the flex row
				    never re-centers (no keycap jump when the pill appears) */}
				<StatusPill
					label="Listening — release to ask"
					frame={frame}
					style={{
						opacity: pillIn,
						transform: `translateY(${(1 - pillIn) * 14}px)`,
					}}
				/>
			</div>
		</AbsoluteFill>
	);
};

// ------------------------------------------------------------------- scene

export const TwoModesAndVoice: React.FC = () => {
	const frame = useCurrentFrame();

	const dividerOut = interpolate(frame, [PANELS_EXIT, PANELS_EXIT + 10], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	return (
		<Backdrop variant="light">
			{frame < PANELS_EXIT + 11 && (
				<AbsoluteFill>
					<ModePanel
						side="left"
						headline="guide mode — you click."
						headlineDelay={8}
						loopStart={12}
					/>
					<ModePanel
						side="right"
						headline="do-it-for-me — it clicks."
						headlineDelay={20}
						loopStart={57}
					/>
					<div
						style={{
							position: 'absolute',
							left: PANEL_W - 1,
							top: 0,
							width: 2,
							height: '100%',
							background: 'rgba(22,22,26,0.10)',
							opacity: 1 - dividerOut,
						}}
					/>
					<Kicker />
				</AbsoluteFill>
			)}
			{frame >= 190 && <VoiceStage />}
		</Backdrop>
	);
};

// Scene 7 "meet-the-hand" — 240 frames. Light world; THE character beat.
// The hand cycles rest → point → grab → wave-home in sync with GRAFT-style
// caption fragments, then docks into the launcher Fab bottom-right.

import React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop } from '../lib/Backdrop';
import { Hand, HAND_ASPECT } from '../lib/Hand';
import { TypeReveal } from '../lib/TypeReveal';
import { Fab, SpotlightRing } from '../lib/widget';
import { ACCENT, INK, INK_60, PAPER, SPRING_POP, SPRING_SNAPPY, SPRING_SOFT, TYPE } from '../lib/tokens';
import { fontFamily } from '../lib/font';

const HAND_W = 360;
const HAND_H = HAND_W * HAND_ASPECT;

// Verb fragments + the frame each becomes ACTIVE (phase starts).
const FRAGMENTS: ReadonlyArray<{ text: string; active: number }> = [
	{ text: 'it rests.', active: 30 },
	{ text: 'it points.', active: 72 },
	{ text: 'it grabs.', active: 114 },
	{ text: 'it waves home.', active: 148 },
];

// Stage geometry.
const REST = { x: 960, y: 480 };
const POINT = { x: 1054, y: 405 }; // rest + ~120px dart toward the dot
const DOT = { x: 1232, y: 262 }; // just beyond the pointer fingertip
const FAB = { x: 1769, y: 929 }; // title-safe bottom-right dock
const BTN = { x: 1420, y: 660 }; // page-mockup button "in the way"

// Quadratic bezier travel path POINT → FAB, arcing over/right of BTN.
const CTRL = { x: 1564.5, y: 457 };
const bez = (t: number): { x: number; y: number } => {
	const a = (1 - t) * (1 - t);
	const b = 2 * (1 - t) * t;
	const c = t * t;
	return {
		x: a * POINT.x + b * CTRL.x + c * FAB.x,
		y: a * POINT.y + b * CTRL.y + c * FAB.y,
	};
};

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export const MeetTheHand: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	// ---- hand state -------------------------------------------------------
	// Draw-on entrance (frames 30+).
	const reveal = spring({ frame: frame - 30, fps, config: SPRING_SOFT });

	// Pose mix: 0 = open, 1 = pointer. Crossfade at 72 (→pointer) and 148 (→open).
	const poseMix =
		interpolate(frame, [72, 79], [0, 1], CLAMP) *
		interpolate(frame, [148, 155], [1, 0], CLAMP);

	// Idle float during rest, fading out as the dart begins.
	const floatAmp = interpolate(frame, [30, 44, 72, 86], [0, 6, 6, 0], CLAMP);
	const floatY = floatAmp * Math.sin((frame / 48) * Math.PI * 2);

	// Dart toward the dot (point phase).
	const dart = spring({ frame: frame - 74, fps, config: SPRING_SNAPPY });
	const dartX = REST.x + dart * (POINT.x - REST.x);
	const dartY = REST.y + dart * (POINT.y - REST.y);

	// Grab feel: quick squash + 2px press (SPRING_POP pulse, rises then returns).
	const grabPulse =
		spring({ frame: frame - 116, fps, config: SPRING_POP }) -
		spring({ frame: frame - 125, fps, config: SPRING_POP });

	// Wave home: exactly two swings (±8°) around a wrist pivot while traveling.
	const waveT = interpolate(frame, [150, 178], [0, 1], CLAMP);
	const waveEnv = interpolate(waveT, [0, 0.12, 0.8, 1], [0, 1, 1, 0], CLAMP);
	const waveDeg = 8 * Math.sin(waveT * Math.PI * 4) * waveEnv;

	// Travel POINT → FAB with a single dock overshoot.
	const tRaw = spring({ frame: frame - 158, fps, config: SPRING_POP, durationInFrames: 40 });
	const tPos = tRaw <= 1 ? tRaw : 1 + (tRaw - 1) * 0.3; // soften path overshoot
	const traveling = frame >= 158;
	const pos = traveling
		? bez(tPos)
		: { x: dartX, y: dartY + floatY };
	const travelScale = interpolate(Math.min(tRaw, 1), [0, 1], [1, 0.32], CLAMP);
	// Dissolve tied to travel progress (POP spring is front-loaded) so the hand
	// melts INTO the Fab on arrival instead of parking on top of it.
	const dockFade = traveling ? interpolate(Math.min(tRaw, 1), [0.78, 0.96], [1, 0], CLAMP) : 1;

	// ---- targets ----------------------------------------------------------
	const ringIn = spring({ frame: frame - 78, fps, config: SPRING_SNAPPY });
	const ringOut = interpolate(frame, [150, 162], [1, 0], CLAMP);
	const dotScale = ringIn * (1 - 0.3 * grabPulse);

	const btnIn = interpolate(frame, [144, 156], [0, 1], CLAMP);

	const fabIn = spring({ frame: frame - 140, fps, config: SPRING_SNAPPY });
	const fabPulse =
		spring({ frame: frame - 176, fps, config: SPRING_SNAPPY }) -
		spring({ frame: frame - 184, fps, config: SPRING_SNAPPY });
	const fabScale = fabIn * (1 - 0.03 * fabPulse);

	// ---- copy -------------------------------------------------------------
	const line3 = interpolate(frame, [185, 200], [0, 1], CLAMP);

	// Final push-in toward the docked Fab (hard-cut handoff to the end card).
	const push = interpolate(frame, [230, 240], [1, 1.03], {
		easing: Easing.in(Easing.cubic),
		...CLAMP,
	});

	return (
		<Backdrop variant="light">
			{/* Warmed center glow on the light ground. */}
			<AbsoluteFill
				style={{
					background:
						'radial-gradient(ellipse 62% 52% at 50% 44%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0) 68%), radial-gradient(ellipse 55% 45% at 50% 44%, rgba(67,83,255,0.05) 0%, rgba(67,83,255,0) 70%)',
				}}
			/>

			<AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: `${FAB.x}px ${FAB.y}px` }}>
				{/* Title — masked reveal, top-center, 72px Bold. */}
				<div style={{ position: 'absolute', left: 0, right: 0, top: 104 }}>
					<TypeReveal
						lines={['meet the hand.']}
						delay={3}
						align="center"
						lineStyle={{
							fontSize: 72,
							fontWeight: 700,
							letterSpacing: TYPE.h2.letterSpacing,
							lineHeight: 1.1,
							color: INK,
						}}
					/>
				</div>

				{/* Dotted trail along the travel arc, revealed as the hand passes. */}
				{Array.from({ length: 20 }, (_, i) => {
					const td = 0.06 + (i / 19) * 0.86;
					const p = bez(td);
					const o = interpolate(Math.min(tRaw, 1), [Math.max(0, td - 0.08), td], [0, 1], CLAMP);
					return (
						<div
							key={i}
							style={{
								position: 'absolute',
								left: p.x - 3,
								top: p.y - 3,
								width: 6,
								height: 6,
								borderRadius: 99,
								background: 'rgba(67, 83, 255, 0.45)',
								opacity: o,
							}}
						/>
					);
				})}

				{/* Page-mockup button in the way — the trail arcs around it. */}
				<div
					style={{
						position: 'absolute',
						left: BTN.x - 75,
						top: BTN.y - 24,
						width: 150,
						height: 48,
						borderRadius: 10,
						background: PAPER,
						border: '1px solid rgba(22,22,26,0.12)',
						boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						opacity: btnIn,
						transform: `translateY(${(1 - btnIn) * 8}px)`,
					}}
				>
					<div style={{ width: 70, height: 10, borderRadius: 5, background: 'rgba(22,22,26,0.25)' }} />
				</div>

				{/* Accent target dot + spotlight ring (point/grab phases). */}
				<div
					style={{
						position: 'absolute',
						left: DOT.x - 45,
						top: DOT.y - 45,
						opacity: ringOut,
					}}
				>
					<SpotlightRing width={90} height={90} progress={ringIn} />
				</div>
				<div
					style={{
						position: 'absolute',
						left: DOT.x - 7,
						top: DOT.y - 7,
						width: 14,
						height: 14,
						borderRadius: 99,
						background: ACCENT,
						opacity: Math.min(1, ringIn * 2) * ringOut,
						transform: `scale(${dotScale})`,
					}}
				/>

				{/* Launcher Fab, bottom-right title-safe. */}
				<div style={{ position: 'absolute', left: FAB.x - 55, top: FAB.y - 55 }}>
					<Fab size={110} style={{ transform: `scale(${fabScale})` }} />
				</div>

				{/* THE hand. Outer = position, mid = wave rotation (wrist pivot),
				    inner = travel shrink + grab squash, poses crossfaded. */}
				<div
					style={{
						position: 'absolute',
						left: pos.x - HAND_W / 2,
						top: pos.y - HAND_H / 2,
						width: HAND_W,
						height: HAND_H,
						opacity: dockFade,
					}}
				>
					<div style={{ width: '100%', height: '100%', transform: `rotate(${waveDeg}deg)`, transformOrigin: '50% 100%' }}>
						<div
							style={{
								width: '100%',
								height: '100%',
								transform: `translateY(${2 * grabPulse}px) scale(${travelScale * (1 + 0.02 * grabPulse)}, ${travelScale * (1 - 0.06 * grabPulse)})`,
							}}
						>
							<div style={{ position: 'absolute', inset: 0, opacity: 1 - poseMix, transform: `scale(${0.96 + 0.04 * (1 - poseMix)})` }}>
								<Hand pose="open" width={HAND_W} reveal={reveal} />
							</div>
							<div style={{ position: 'absolute', inset: 0, opacity: poseMix, transform: `scale(${0.96 + 0.04 * poseMix})` }}>
								<Hand pose="pointer" width={HAND_W} />
							</div>
						</div>
					</div>
				</div>

				{/* Line 2 — four verb fragments, GRAFT caption sync, bottom third. */}
				<div
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						top: 880,
						display: 'flex',
						justifyContent: 'center',
						gap: 56,
					}}
				>
					{FRAGMENTS.map((f, i) => {
						const on = interpolate(frame, [f.active, f.active + 8], [0, 1], CLAMP);
						const off =
							i < FRAGMENTS.length - 1
								? interpolate(
										frame,
										[FRAGMENTS[i + 1]!.active, FRAGMENTS[i + 1]!.active + 8],
										[1, 0],
										CLAMP,
									)
								: 1;
						const act = on * off;
						const uStart = Math.max(f.active + 2, 42 + i * 12);
						const underline = spring({ frame: frame - uStart, fps, config: SPRING_SNAPPY });
						return (
							<div key={f.text} style={{ opacity: 0.4 + 0.6 * act }}>
								<TypeReveal
									lines={[f.text]}
									delay={34 + i * 12}
									align="center"
									lineStyle={{
										fontSize: TYPE.body.fontSize,
										fontWeight: TYPE.body.fontWeight,
										letterSpacing: TYPE.body.letterSpacing,
										lineHeight: 1.2,
										color: INK,
									}}
								/>
								<div
									style={{
										height: 2,
										marginTop: 8,
										background: ACCENT,
										transform: `scaleX(${underline})`,
										transformOrigin: 'left',
										opacity: act,
									}}
								/>
							</div>
						);
					})}
				</div>

				{/* Line 3 — plain fade, motivated by the arcing trail. */}
				<div
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						top: 524,
						textAlign: 'center',
						fontFamily,
						fontSize: 30,
						fontWeight: 500,
						letterSpacing: '-0.01em',
						color: INK_60,
						opacity: line3,
						transform: `translateY(${(1 - line3) * 10}px)`,
					}}
				>
					it never blocks a click.
				</div>
			</AbsoluteFill>
		</Backdrop>
	);
};

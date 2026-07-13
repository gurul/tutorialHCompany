// Scene 8 "install-endcard" — 240 frames. Light world. Install + end card.
//
// Beat 1 (0–105): centered INK code chip types "Handyman.init({ endpoint })";
// a Chrome-extension subline rises beneath. Beat 2 (105–240): GRAFT match cut
// — the chip springs down-right into a FAB-like rounded square (becoming the
// launcher house) while the lockup (Hand + "handyman") assembles center with
// one SPRING_POP overshoot, tagline beneath, one glow breath, then stillness
// and a 6-frame fade to black.

import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop } from '../lib/Backdrop';
import { Hand, HAND_ASPECT } from '../lib/Hand';
import { TypeReveal } from '../lib/TypeReveal';
import { ACCENT, INK, INK_60, PAPER, SPRING_POP, SPRING_SNAPPY, SPRING_SOFT } from '../lib/tokens';
import { fontFamily } from '../lib/font';

// ---- Beat 1 timing -------------------------------------------------------
const TYPE_START = 10; // typing begins after the chip settles in
const CHARS_PER_FRAME = 2;

const CODE_SEGMENTS: ReadonlyArray<{ text: string; color: string }> = [
	{ text: 'Handyman.', color: PAPER },
	{ text: 'init', color: ACCENT },
	{ text: '({ ', color: PAPER },
	{ text: 'endpoint', color: ACCENT },
	{ text: ' })', color: PAPER },
];
const CODE_TOTAL = CODE_SEGMENTS.reduce((n, s) => n + s.text.length, 0); // 27
const TYPE_END = TYPE_START + Math.ceil(CODE_TOTAL / CHARS_PER_FRAME); // frame 24
const SUBLINE_AT = TYPE_END + 12; // frame 36

// ---- Beat 2 timing -------------------------------------------------------
const GRAFT_AT = 105; // chip → FAB morph begins
const HAND_REVEAL_START = 112; // lockup hand draw-on, 10 frames
const WORDMARK_AT = 116; // masked rise of "handyman"
const POP_AT = 140; // ONE overshoot on the lockup as a unit
const TAGLINE_AT = 140; // settles by 154 so frames 155+ are still
const GLOW_START = 140;
const GLOW_END = 200;
const FADE_START = 234; // last 6 frames → black

// Chip geometry (beat 1) and FAB geometry (beat 2 destination).
const CHIP_W = 900;
const CHIP_H = 120;
const CHIP_R = 18;
const FAB_SIZE = 90;
const FAB_R = 24;
const CHIP_CX = 960;
const CHIP_CY = 540;
// Bottom-right, title-safe (~5% margins on 1920×1080).
const FAB_CX = 1920 - 96 - FAB_SIZE / 2;
const FAB_CY = 1080 - 54 - FAB_SIZE / 2;

export const InstallEndcard: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	// ---- Beat 1: chip entrance + typing ------------------------------------
	const chipIn = spring({ frame, fps, config: SPRING_SOFT });
	const typedChars = Math.min(
		CODE_TOTAL,
		Math.max(0, Math.floor((frame - TYPE_START) * CHARS_PER_FRAME)),
	);
	const caretOn = frame % 30 < 15; // 1 Hz blink at 30 fps

	const sublineIn = spring({ frame: frame - SUBLINE_AT, fps, config: SPRING_SOFT });
	const sublineOut = interpolate(frame, [GRAFT_AT, GRAFT_AT + 10], [1, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// ---- Beat 2: GRAFT morph (chip → launcher house) ------------------------
	// Clamped at 1: SPRING_SNAPPY overshoots (~1.06), and because width travels
	// 810px per unit m vs height's 30px, any overshoot inverts the FAB's aspect
	// into a narrow vertical pill mid-settle.
	const m = Math.min(1, spring({ frame: frame - GRAFT_AT, fps, config: SPRING_SNAPPY }));
	const boxW = interpolate(m, [0, 1], [CHIP_W, FAB_SIZE]);
	const boxH = interpolate(m, [0, 1], [CHIP_H, FAB_SIZE]);
	const boxR = interpolate(m, [0, 1], [CHIP_R, FAB_R]);
	const boxCX = interpolate(m, [0, 1], [CHIP_CX, FAB_CX]);
	const boxCY = interpolate(m, [0, 1], [CHIP_CY, FAB_CY]);
	const codeFade = interpolate(m, [0, 0.35], [1, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const glyphFade = interpolate(m, [0.5, 1], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// ---- Lockup assembly -----------------------------------------------------
	const handReveal = interpolate(frame, [HAND_REVEAL_START, HAND_REVEAL_START + 10], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	// Assembles at 0.94; the pop springs it to 1 with a single overshoot,
	// fully settled by frame 154 (durationInFrames forces the rest).
	const pop = spring({
		frame: frame - POP_AT,
		fps,
		config: SPRING_POP,
		durationInFrames: 14,
	});
	const lockupScale = interpolate(pop, [0, 1], [0.94, 1], { extrapolateLeft: 'clamp' });
	const lockupIn = spring({ frame: frame - HAND_REVEAL_START, fps, config: SPRING_SOFT });

	// Tagline — settles by frame 154 so frames 155–234 are completely still.
	const taglineIn = spring({
		frame: frame - TAGLINE_AT,
		fps,
		config: SPRING_SOFT,
		durationInFrames: 14,
	});

	// One glow breath behind the lockup (opacity only; sanctioned by spec).
	const glowT = interpolate(frame, [GLOW_START, GLOW_END], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const glowOpacity = Math.sin(Math.PI * glowT); // 0 → 1 → 0, once

	// Final 6 frames: fade the whole frame to black.
	const blackout = interpolate(frame, [FADE_START, 239], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	return (
		<AbsoluteFill>
			<Backdrop variant="light">
				{/* Soft accent glow breathing once behind the lockup. */}
				<AbsoluteFill
					style={{
						alignItems: 'center',
						justifyContent: 'center',
						opacity: glowOpacity,
					}}
				>
					<div
						style={{
							width: 1100,
							height: 1100,
							borderRadius: '50%',
							background:
								'radial-gradient(circle, rgba(67, 83, 255, 0.06) 0%, rgba(67, 83, 255, 0) 65%)',
						}}
					/>
				</AbsoluteFill>

				{/* ---- Beat 2: end-card lockup, center frame ---- */}
				{frame >= HAND_REVEAL_START && (
					<AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
						<div style={{ transform: `scale(${lockupScale})` }}>
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 52,
									opacity: lockupIn,
								}}
							>
								<Hand pose="open" width={200} palette="tints" reveal={handReveal} />
								<TypeReveal
									lines={['handyman']}
									delay={WORDMARK_AT}
									lineStyle={{
										fontSize: 120,
										fontWeight: 700,
										letterSpacing: '-0.03em',
										lineHeight: 1.02,
										color: INK,
									}}
								/>
							</div>
							{/* Tagline beneath the lockup. */}
							<div
								style={{
									marginTop: 44,
									textAlign: 'center',
									fontFamily,
									fontSize: 32,
									fontWeight: 500,
									letterSpacing: '-0.01em',
									color: INK_60,
									opacity: taglineIn,
									transform: `translateY(${(1 - taglineIn) * 12}px)`,
								}}
							>
								{'ask any website “how do I…?”'}
							</div>
						</div>
					</AbsoluteFill>
				)}

				{/* ---- Beat 1 subline (fades out at the graft) ---- */}
				{frame < GRAFT_AT + 12 && (
					<div
						style={{
							position: 'absolute',
							left: 0,
							right: 0,
							top: CHIP_CY + CHIP_H / 2 + 44,
							textAlign: 'center',
							fontFamily,
							fontSize: 30,
							fontWeight: 500,
							letterSpacing: '-0.01em',
							color: INK_60,
							opacity: sublineIn * sublineOut,
							transform: `translateY(${(1 - sublineIn) * 16}px)`,
						}}
					>
						or the Chrome extension — every site, even strict CSP.
					</div>
				)}

				{/* ---- The chip → launcher house (GRAFT element) ---- */}
				<div
					style={{
						position: 'absolute',
						left: boxCX - boxW / 2,
						top: boxCY - boxH / 2,
						width: boxW,
						height: boxH,
						borderRadius: boxR,
						background: INK,
						boxShadow: '0 10px 36px rgba(0, 0, 0, 0.22)',
						overflow: 'hidden',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						opacity: chipIn,
						transform: `translateY(${(1 - chipIn) * 24}px)`,
					}}
				>
					{/* Code content (beat 1), cross-fading out during the graft. */}
					{codeFade > 0 && (
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								whiteSpace: 'pre',
								fontFamily,
								fontSize: 44,
								fontWeight: 500,
								letterSpacing: '-0.01em',
								opacity: codeFade,
							}}
						>
							{(() => {
								let consumed = 0;
								return CODE_SEGMENTS.map((seg, i) => {
									const visible = Math.max(
										0,
										Math.min(seg.text.length, typedChars - consumed),
									);
									consumed += seg.text.length;
									return (
										<span key={i} style={{ color: seg.color }}>
											{seg.text.slice(0, visible)}
										</span>
									);
								});
							})()}
							{/* Caret: solid while typing, 1 Hz blink after. */}
							<span
								style={{
									display: 'inline-block',
									width: 4,
									height: 48,
									marginLeft: 6,
									background: PAPER,
									opacity: typedChars < CODE_TOTAL || caretOn ? 1 : 0,
								}}
							/>
						</div>
					)}
					{/* Paper hand glyph (the launcher house), cross-fading in. */}
					{glyphFade > 0 && (
						<div
							style={{
								position: 'absolute',
								inset: 0,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								opacity: glyphFade,
							}}
						>
							<Hand
								pose="open"
								width={Math.min(boxW, boxH) * 0.46}
								palette="paper"
								style={{ height: Math.min(boxW, boxH) * 0.46 * HAND_ASPECT }}
							/>
						</div>
					)}
				</div>
			</Backdrop>

			{/* Final 6 frames: fade to black above everything (incl. grain). */}
			{blackout > 0 && (
				<AbsoluteFill style={{ background: INK, opacity: blackout }} />
			)}
		</AbsoluteFill>
	);
};

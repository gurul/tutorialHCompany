// Scene 1 — "cold-open-questions" (210 frames · 7 s · dark world).
// Three unanswered "how do I…?" questions stack up as masked line reveals,
// each new arrival pushing the pile up and dimming its elders; at frame 135
// the stack hard-cuts away and the lone hook "how do I…?" slams in centered
// (140 px), where it stays for scene 2's match cut. The blinking accent
// caret is the scene's only chromatic element.

import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Backdrop } from '../lib/Backdrop';
import { fontFamily } from '../lib/font';
import { ACCENT, SPRING_POP, SPRING_SNAPPY, SPRING_SOFT } from '../lib/tokens';

const QUESTIONS = [
	'how do I add a teammate?',
	'how do I export this?',
	'how do I cancel my plan?',
] as const;

/** Frame at which each stacked question starts its masked reveal. */
const ENTER_FRAMES = [10, 37, 64] as const;
/** Stack exit: hard 4-frame fade + 8 px drop. */
const STACK_EXIT = 135;
/** Hook line starts here so the pop settles ~frame 145. */
const HOOK_ENTER = 137;
/** Ellipsis dots stagger in 3 frames apart, riding the hook slam so all
 *  three read by ~frame 145. */
const DOT_FRAMES = [137, 140, 143] as const;
/** Drawn ellipsis dot geometry at the 140 px type size. */
const DOT_SIZE = 30;
const DOT_GAP = 18;
/** Caret starts blinking once the hook has landed (1 Hz = 15 on / 15 off). */
const CARET_START = 150;

const HOT = 'rgba(255, 255, 255, 0.92)';

export const ColdOpenQuestions: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	// One push spring per line — fires the moment that line starts entering,
	// shifting every earlier line up ~20 px (workhorse spring, no bounce).
	const pushes = ENTER_FRAMES.map((f) =>
		spring({ frame: frame - f, fps, config: SPRING_SOFT }),
	);

	// Hard stack exit: 4-frame fade + 8 px drop.
	const exitFade = interpolate(frame, [STACK_EXIT, STACK_EXIT + 4], [1, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const exitDrop = interpolate(frame, [STACK_EXIT, STACK_EXIT + 4], [0, 8], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// Hook slam: SPRING_POP is allowed here — it is the hook. 108% → 100%
	// with a single subtle overshoot.
	const hookIn = spring({ frame: frame - HOOK_ENTER, fps, config: SPRING_POP });
	const hookScale = interpolate(hookIn, [0, 1], [1.08, 1]);
	const hookFade = interpolate(frame, [HOOK_ENTER, HOOK_ENTER + 4], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	// Accent caret: 1 Hz blink — 15 frames on, 15 off.
	const caretOn = frame >= CARET_START && (frame - CARET_START) % 30 < 15;

	return (
		<Backdrop variant="dark" grid={0.35}>
			{/* ——— The stack of unanswered questions ——— */}
			{frame < STACK_EXIT + 5 && (
				<div
					style={{
						position: 'absolute',
						left: 240,
						top: 0,
						height: '100%',
						display: 'flex',
						flexDirection: 'column',
						justifyContent: 'center',
						alignItems: 'flex-start',
						opacity: exitFade,
					}}
				>
					{QUESTIONS.map((line, i) => {
						const enter = spring({
							frame: frame - ENTER_FRAMES[i],
							fps,
							config: SPRING_SNAPPY,
						});
						// Every later arrival pushes this line up another ~20 px.
						let lift = 0;
						for (let j = i + 1; j < ENTER_FRAMES.length; j++) lift += pushes[j];
						// Settled lines dim to 40% the moment the next line arrives;
						// the newest line stays hot.
						const dim =
							i < QUESTIONS.length - 1
								? interpolate(pushes[i + 1], [0, 1], [0.92, 0.4], {
										extrapolateLeft: 'clamp',
										extrapolateRight: 'clamp',
									})
								: 0.92;
						return (
							<div
								key={line}
								style={{
									overflow: 'hidden',
									padding: '0.07em 0',
									transform: `translateY(${-20 * lift + exitDrop}px)`,
								}}
							>
								<div
									style={{
										fontFamily,
										fontSize: 88,
										fontWeight: 600,
										letterSpacing: '-0.02em',
										lineHeight: 1.08,
										color: `rgba(255, 255, 255, ${dim})`,
										whiteSpace: 'nowrap',
										transform: `translateY(${(1 - enter) * 115}%)`,
									}}
								>
									{line}
								</div>
							</div>
						);
					})}
				</div>
			)}

			{/* ——— The lone hook — centered, stays to the final frame for the
			      scene-2 match cut (same position, 140 px, centered). ——— */}
			{frame >= HOOK_ENTER && (
				<AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
					<div
						style={{
							position: 'relative',
							fontFamily,
							fontSize: 140,
							fontWeight: 700,
							letterSpacing: '-0.025em',
							lineHeight: 1.02,
							color: HOT,
							whiteSpace: 'nowrap',
							opacity: hookFade,
							transform: `scale(${hookScale})`,
						}}
					>
						how do I
						{DOT_FRAMES.map((d, i) => {
							const dotIn = spring({ frame: frame - d, fps, config: SPRING_SNAPPY });
							// Fast 3-frame fade so a mid-entrance dot never reads gray.
							const dotFade = interpolate(frame, [d, d + 3], [0, 1], {
								extrapolateLeft: 'clamp',
								extrapolateRight: 'clamp',
							});
							return (
								<span
									key={i}
									style={{
										// Inline-block: bottom margin edge sits on the text
										// baseline — real ellipsis-dot alignment.
										display: 'inline-block',
										width: DOT_SIZE,
										height: DOT_SIZE,
										borderRadius: '50%',
										backgroundColor: HOT,
										marginLeft: i === 0 ? 16 : DOT_GAP,
										opacity: dotFade,
										transform: `translateY(${(1 - dotIn) * 14}px)`,
									}}
								/>
							);
						})}
						<span style={{ display: 'inline-block', marginLeft: 14 }}>?</span>
						{/* The ONLY accent in the scene: 6×96 px caret after the "?". */}
						<div
							style={{
								position: 'absolute',
								left: '100%',
								top: '50%',
								marginLeft: 26,
								width: 6,
								height: 96,
								transform: 'translateY(-50%)',
								backgroundColor: ACCENT,
								opacity: caretOn ? 1 : 0,
							}}
						/>
					</div>
				</AbsoluteFill>
			)}
		</Backdrop>
	);
};

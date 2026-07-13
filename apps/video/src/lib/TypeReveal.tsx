// Masked line reveal — the house type-entrance. Each line rises from behind
// its own baseline mask on a spring with a slight settle; lines stagger.
// Exit (optional) drops lines 12px and fades, for scenes that hand off hard.

import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { SPRING_SNAPPY } from './tokens';
import { fontFamily } from './font';

export const TypeReveal: React.FC<{
	lines: string[];
	/** Frames (scene-relative) before the first line starts. */
	delay?: number;
	/** Frames between line starts. */
	stagger?: number;
	style?: React.CSSProperties;
	lineStyle?: React.CSSProperties;
	align?: 'left' | 'center';
	/** Scene-relative frame at which lines exit (fade + drop). Omit = stay. */
	exitAt?: number;
}> = ({ lines, delay = 0, stagger = 5, style, lineStyle, align = 'left', exitAt }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	return (
		<div style={{ fontFamily, textAlign: align, ...style }}>
			{lines.map((line, i) => {
				const enter = spring({
					frame: frame - delay - i * stagger,
					fps,
					config: SPRING_SNAPPY,
				});
				const exit =
					exitAt === undefined
						? 0
						: spring({ frame: frame - exitAt - i * 3, fps, config: SPRING_SNAPPY });
				const y = (1 - enter) * 110 + exit * -14;
				return (
					<div key={i} style={{ overflow: 'hidden', padding: '0.06em 0' }}>
						<div
							style={{
								transform: `translateY(${y}%)`,
								opacity: 1 - exit,
								...lineStyle,
							}}
						>
							{line}
						</div>
					</div>
				);
			})}
		</div>
	);
};

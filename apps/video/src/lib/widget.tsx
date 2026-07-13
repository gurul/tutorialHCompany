// Widget vignettes — the real product UI (overlay.ts / fab.ts) rebuilt as
// motion-graphic primitives so scenes recreate it faithfully instead of
// screenshotting it. Geometry, radii, and shadows mirror the source CSS.

import React from 'react';
import { ACCENT, INK, INK_40, PAPER, RECORDING } from './tokens';
import { fontFamily } from './font';
import { Hand } from './Hand';

/** The spotlight ring the tour draws around a target (overlay.ts). */
export const SpotlightRing: React.FC<{
	width: number;
	height: number;
	/** 0..1 pop-in progress (ring scales in + halo blooms). */
	progress?: number;
	style?: React.CSSProperties;
}> = ({ width, height, progress = 1, style }) => (
	<div
		style={{
			width,
			height,
			borderRadius: 12,
			boxShadow: `0 0 0 3px ${ACCENT}, 0 0 0 ${8 * progress}px rgba(67, 83, 255, 0.30), 0 0 ${22 * progress}px ${3 * progress}px rgba(67, 83, 255, 0.35)`,
			transform: `scale(${0.92 + 0.08 * progress})`,
			opacity: Math.min(1, progress * 2),
			...style,
		}}
	/>
);

/** The tour card (counter dots, instruction, buttons) — overlay.ts scaled ~1.6× for 1080p legibility. */
export const TourCard: React.FC<{
	instruction: string;
	step?: number;
	totalSteps?: number;
	showDoIt?: boolean;
	/** Highlight state of the primary button (e.g. mid "press"). */
	pressed?: boolean;
	style?: React.CSSProperties;
}> = ({ instruction, step = 1, totalSteps = 4, showDoIt = true, pressed = false, style }) => (
	<div
		style={{
			width: 480,
			background: PAPER,
			color: INK,
			border: '1px solid rgba(22,22,26,0.1)',
			borderRadius: 22,
			boxShadow:
				'0 1px 3px rgba(0,0,0,0.06), 0 13px 38px rgba(0,0,0,0.12), 0 38px 90px rgba(0,0,0,0.08)',
			padding: 26,
			fontFamily,
			...style,
		}}
	>
		<div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 10 }}>
			<div style={{ display: 'flex', gap: 6 }}>
				{Array.from({ length: totalSteps }, (_, i) => (
					<div
						key={i}
						style={{
							width: 8,
							height: 8,
							borderRadius: 99,
							border: `1.6px solid ${i < step ? ACCENT : INK_40}`,
							background: i < step ? ACCENT : 'transparent',
						}}
					/>
				))}
			</div>
			<span style={{ fontSize: 17, fontWeight: 500, letterSpacing: '0.02em', color: INK_40 }}>
				{step}/{totalSteps}
			</span>
		</div>
		<div style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.45, marginBottom: 19 }}>
			{instruction}
		</div>
		<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
			<span style={{ fontSize: 19, fontWeight: 600, color: 'rgba(22,22,26,0.6)' }}>Skip</span>
			<div style={{ display: 'flex', gap: 13 }}>
				{showDoIt && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							border: '1.6px solid rgba(22,22,26,0.15)',
							borderRadius: 13,
							padding: '10px 16px',
							fontSize: 19,
							fontWeight: 600,
							letterSpacing: '0.01em',
						}}
					>
						<svg width="16" height="16" viewBox="0 0 10 10" fill={INK}>
							<path d="M5 0 L6.2 3.8 L10 5 L6.2 6.2 L5 10 L3.8 6.2 L0 5 L3.8 3.8 Z" />
						</svg>
						Do it for me
					</div>
				)}
				<div
					style={{
						background: pressed ? ACCENT : INK,
						color: PAPER,
						borderRadius: 13,
						padding: '10px 21px',
						fontSize: 19,
						fontWeight: 600,
						letterSpacing: '0.01em',
						transform: pressed ? 'scale(0.96)' : undefined,
					}}
				>
					Next
				</div>
			</div>
		</div>
	</div>
);

/** The launcher FAB (fab.ts): ink circle housing the paper hand glyph. */
export const Fab: React.FC<{
	size?: number;
	listening?: boolean;
	/** 0..1 pulse phase for the listening ring. */
	pulse?: number;
	style?: React.CSSProperties;
}> = ({ size = 100, listening = false, pulse = 0, style }) => (
	<div
		style={{
			width: size,
			height: size,
			borderRadius: 999,
			background: listening ? RECORDING : INK,
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			boxShadow: listening
				? `0 10px 36px rgba(0,0,0,0.25), 0 0 0 ${pulse * size * 0.24}px rgba(229,72,77,${0.5 * (1 - pulse)})`
				: '0 10px 36px rgba(0,0,0,0.25)',
			...style,
		}}
	>
		<Hand pose="open" width={size * 0.46} palette="paper" />
	</div>
);

/** The status pill ("Listening — release to ask" / "Analyzing…"). */
export const StatusPill: React.FC<{
	label: string;
	/** Scene-relative frame, for the bouncing dots. */
	frame?: number;
	style?: React.CSSProperties;
}> = ({ label, frame = 0, style }) => (
	<div
		style={{
			display: 'inline-flex',
			alignItems: 'center',
			gap: 12,
			background: PAPER,
			color: INK,
			border: '1px solid rgba(22,22,26,0.1)',
			borderRadius: 999,
			padding: '13px 22px',
			fontFamily,
			fontSize: 21,
			fontWeight: 500,
			boxShadow: '0 6px 22px rgba(0,0,0,0.14)',
			...style,
		}}
	>
		{label}
		<span style={{ display: 'inline-flex', gap: 5 }}>
			{[0, 1, 2].map((i) => {
				const t = ((frame / 36 + 1 - i * 0.125) % 1 + 1) % 1;
				const up = t < 0.3 ? Math.sin((t / 0.3) * Math.PI) : 0;
				return (
					<span
						key={i}
						style={{
							width: 6,
							height: 6,
							borderRadius: 99,
							background: ACCENT,
							opacity: 0.25 + 0.75 * up,
							transform: `translateY(${-3.5 * up}px)`,
						}}
					/>
				);
			})}
		</span>
	</div>
);

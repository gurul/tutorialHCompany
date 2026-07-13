// Scene backdrop: flat brand surface + faint dot grid + corner vignette +
// live film grain. Grain is deterministic (seed advances every 2 frames via
// the frame counter, never Math.random) and subtle — texture, not noise.

import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { INK, PAPER_WARM } from './tokens';

export const Backdrop: React.FC<{
	variant?: 'dark' | 'light';
	/** Dot grid visibility; 0 disables. */
	grid?: number;
	children?: React.ReactNode;
}> = ({ variant = 'dark', grid = 0.5, children }) => {
	const frame = useCurrentFrame();
	const dark = variant === 'dark';
	const dot = dark ? 'rgba(255,255,255,0.05)' : 'rgba(22,22,26,0.06)';
	const seed = Math.floor(frame / 2);
	return (
		<AbsoluteFill style={{ backgroundColor: dark ? INK : PAPER_WARM }}>
			{grid > 0 && (
				<AbsoluteFill
					style={{
						opacity: grid,
						backgroundImage: `radial-gradient(${dot} 2px, transparent 2px)`,
						backgroundSize: '48px 48px',
						backgroundPosition: '24px 24px',
					}}
				/>
			)}
			{children}
			{/* Vignette above content, below grain. */}
			<AbsoluteFill
				style={{
					pointerEvents: 'none',
					background: dark
						? 'radial-gradient(ellipse 90% 80% at 50% 45%, transparent 55%, rgba(0,0,0,0.5) 100%)'
						: 'radial-gradient(ellipse 90% 80% at 50% 45%, transparent 60%, rgba(22,22,26,0.10) 100%)',
				}}
			/>
			<AbsoluteFill style={{ pointerEvents: 'none', opacity: dark ? 0.055 : 0.04, mixBlendMode: 'overlay' }}>
				<svg width="100%" height="100%">
					<filter id={`grain-${variant}`}>
						<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed} stitchTiles="stitch" />
						<feColorMatrix type="saturate" values="0" />
					</filter>
					<rect width="100%" height="100%" filter={`url(#grain-${variant})`} />
				</svg>
			</AbsoluteFill>
		</AbsoluteFill>
	);
};

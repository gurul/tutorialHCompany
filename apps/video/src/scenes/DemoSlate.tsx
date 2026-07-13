// Scene 4 "demo-slate" — 600 frames. The replaceable demo placeholder.
// A BrowserChrome mockup completes the zoom-through (112% → 100% + fade over
// the first 15 frames), then holds rock-still so replacement footage sits in
// a perfectly static frame. ALL placeholder content lives in <SlateContents>
// — the creator swaps that single element for <OffthreadVideo>.

import React from 'react';
import {
	AbsoluteFill,
	getStaticFiles,
	interpolate,
	OffthreadVideo,
	spring,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';
import { Backdrop } from '../lib/Backdrop';
import { BrowserChrome } from '../lib/BrowserChrome';
import { ACCENT, INK, SPRING_SOFT } from '../lib/tokens';
import { fontFamily } from '../lib/font';

const CHROME_W = 1640;
const CHROME_H = 940;
// Mirrors BrowserChrome's internal bar math so the viewport size is exact.
const BAR_H = Math.max(44, Math.round(CHROME_H * 0.055));
const VIEW_W = CHROME_W;
const VIEW_H = CHROME_H - BAR_H;
const BOUNDARY_INSET = 24;

/** Dashed 1px guide rectangle at a fractional inset, with a tiny corner label. */
const SafeGuide: React.FC<{ inset: number; label: string }> = ({ inset, label }) => {
	const x = `${inset * 100}%`;
	return (
		<div
			style={{
				position: 'absolute',
				top: x,
				left: x,
				right: x,
				bottom: x,
				border: '1px dashed rgba(255,255,255,0.15)',
				pointerEvents: 'none',
			}}
		>
			<div
				style={{
					position: 'absolute',
					top: 6,
					left: 10,
					fontFamily,
					fontSize: 16,
					fontWeight: 500,
					letterSpacing: '0.08em',
					color: 'rgba(255,255,255,0.25)',
					whiteSpace: 'nowrap',
				}}
			>
				{label}
			</div>
		</div>
	);
};

/**
 * THE REPLACEABLE LAYER. Delete this single element inside the BrowserChrome
 * viewport and drop your <OffthreadVideo> in its place — chrome, shadow and
 * the zoom-through entrance survive the swap untouched.
 */
const SlateContents: React.FC = () => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={{ backgroundColor: INK }}>
			{/* Faint 45° diagonal hatch. */}
			<AbsoluteFill
				style={{
					backgroundImage:
						'repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) 1px, transparent 1px, transparent 48px)',
				}}
			/>
			{/* Safe-area guides: action safe 5%, title safe 10%. */}
			<SafeGuide inset={0.05} label="action safe" />
			<SafeGuide inset={0.1} label="title safe" />
			{/* Replaceable-region boundary: 2px dashed accent, dashes crawl 1px/frame. */}
			<svg
				width={VIEW_W}
				height={VIEW_H}
				viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
				style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
			>
				<rect
					x={BOUNDARY_INSET}
					y={BOUNDARY_INSET}
					width={VIEW_W - BOUNDARY_INSET * 2}
					height={VIEW_H - BOUNDARY_INSET * 2}
					rx={14}
					fill="none"
					stroke={ACCENT}
					strokeWidth={2}
					strokeDasharray="12 9"
					strokeDashoffset={-frame}
				/>
			</svg>
			{/* Centered copy stack. */}
			<AbsoluteFill
				style={{
					alignItems: 'center',
					justifyContent: 'center',
					flexDirection: 'column',
					gap: 22,
				}}
			>
				<div
					style={{
						fontFamily,
						fontSize: 54,
						fontWeight: 700,
						letterSpacing: '0.06em',
						color: 'rgba(255,255,255,0.9)',
						textAlign: 'center',
					}}
				>
					DROP DEMO FOOTAGE HERE
				</div>
				<div
					style={{
						fontFamily,
						fontSize: 24,
						fontWeight: 500,
						letterSpacing: '0.02em',
						color: 'rgba(255,255,255,0.45)',
						textAlign: 'center',
					}}
				>
					handyman demo · 18–22s · 1920×1080 · 30fps
				</div>
				<div
					style={{
						fontFamily,
						fontSize: 20,
						fontWeight: 500,
						letterSpacing: '0.02em',
						color: 'rgba(255,255,255,0.35)',
						textAlign: 'center',
					}}
				>
					{'replace the <SlateContents/> layer'}
				</div>
			</AbsoluteFill>
		</AbsoluteFill>
	);
};

/** public/demo.mov | demo.mp4 → its staticFile URL, else null (slate mode). */
function demoSrc(): string | null {
	const files = getStaticFiles();
	for (const name of ['demo.mov', 'demo.mp4']) {
		if (files.some((f) => f.name === name)) return staticFile(name);
	}
	return null;
}

export const DemoSlate: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	// Entrance completes the zoom-through: fully settled by frame 15, then the
	// chrome holds perfectly static for the remainder of the 600 frames.
	const enter = spring({ frame, fps, config: SPRING_SOFT, durationInFrames: 15 });
	const scale = interpolate(enter, [0, 1], [1.12, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const opacity = interpolate(enter, [0, 1], [0, 1], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

	return (
		<Backdrop variant="light" grid={0.15}>
			<AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
				<div style={{ transform: `scale(${scale})`, opacity }}>
					<BrowserChrome width={CHROME_W} height={CHROME_H} url="app.example.com" variant="light">
						{/* Real footage when public/demo.mov (or .mp4) exists; the guide
						    slate otherwise. Drop the file in and re-render — no code
						    edit needed. */}
						{demoSrc() !== null ? (
							<OffthreadVideo
								src={demoSrc()!}
								style={{ width: '100%', height: '100%', objectFit: 'cover' }}
							/>
						) : (
							<SlateContents />
						)}
					</BrowserChrome>
				</div>
			</AbsoluteFill>
		</Backdrop>
	);
};

// Minimal browser-window mockup: traffic lights + URL pill on a paper (or
// ink) chrome bar. Used for UI vignettes and the demo-footage slate.

import React from 'react';
import { INK, INK_40, PAPER } from './tokens';
import { fontFamily } from './font';

export const BrowserChrome: React.FC<{
	width: number;
	height: number;
	url?: string;
	variant?: 'light' | 'dark';
	children?: React.ReactNode;
	style?: React.CSSProperties;
}> = ({ width, height, url = 'acme-invoices.example', variant = 'light', children, style }) => {
	const dark = variant === 'dark';
	const barH = Math.round(height * 0.055);
	return (
		<div
			style={{
				width,
				height,
				borderRadius: 18,
				overflow: 'hidden',
				background: dark ? '#1d1d23' : PAPER,
				boxShadow:
					'0 2px 6px rgba(0,0,0,0.14), 0 24px 64px rgba(0,0,0,0.28), 0 64px 140px rgba(0,0,0,0.22)',
				border: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(22,22,26,0.08)',
				display: 'flex',
				flexDirection: 'column',
				...style,
			}}
		>
			<div
				style={{
					height: barH,
					minHeight: 44,
					display: 'flex',
					alignItems: 'center',
					gap: 10,
					padding: '0 20px',
					background: dark ? '#26262d' : '#f1f1f4',
					borderBottom: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(22,22,26,0.07)',
				}}
			>
				{['#ff5f57', '#febc2e', '#28c840'].map((c) => (
					<div key={c} style={{ width: 13, height: 13, borderRadius: 99, background: c }} />
				))}
				<div
					style={{
						marginLeft: 16,
						flex: 1,
						maxWidth: '46%',
						height: Math.max(28, barH * 0.58),
						borderRadius: 8,
						background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(22,22,26,0.05)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						fontFamily,
						fontSize: 15,
						fontWeight: 500,
						color: dark ? 'rgba(255,255,255,0.55)' : INK_40,
						letterSpacing: '0.01em',
					}}
				>
					{url}
				</div>
			</div>
			<div style={{ flex: 1, position: 'relative', color: INK }}>{children}</div>
		</div>
	);
};

// Brand-asset compositions: the hand alone, for `remotion still` export.
// HandStill renders on nothing (transparent PNG); HandStillWhite on white.

import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Hand } from './lib/Hand';

const Centered: React.FC<{ background?: string }> = ({ background }) => (
	<AbsoluteFill
		style={{
			background: background ?? 'transparent',
			alignItems: 'center',
			justifyContent: 'center',
		}}
	>
		<Hand pose="open" width={1000} palette="tints" />
	</AbsoluteFill>
);

export const HandStill: React.FC = () => <Centered />;
export const HandStillWhite: React.FC = () => <Centered background="#ffffff" />;

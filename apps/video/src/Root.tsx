import React from 'react';
import { Composition } from 'remotion';
import { HandymanLaunch, TOTAL_FRAMES } from './HandymanLaunch';
import { HandStill, HandStillWhite } from './HandStill';

export const RemotionRoot: React.FC = () => (
	<>
		<Composition
			id="HandymanLaunch"
			component={HandymanLaunch}
			durationInFrames={TOTAL_FRAMES}
			fps={30}
			width={1920}
			height={1080}
		/>
		{/* Brand stills: `remotion still HandStill --image-format=png` gives a
		    transparent hand; HandStillWhite the white-background variant. */}
		<Composition id="HandStill" component={HandStill} durationInFrames={1} fps={30} width={1400} height={1470} />
		<Composition id="HandStillWhite" component={HandStillWhite} durationInFrames={1} fps={30} width={1400} height={1470} />
	</>
);

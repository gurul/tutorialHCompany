// The 76s handyman launch film — scene timeline. All cuts are hard cuts on
// scene boundaries; in-scene transitions (the dark→light hand wipe, the
// zoom-throughs) are owned by the scenes themselves. Music: drop a track at
// public/music.mp3 and uncomment the <Audio> line (structure is scored for
// ~104 BPM; see docs/video.md).

import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import { ColdOpenQuestions } from './scenes/ColdOpenQuestions';
import { TicketPile } from './scenes/TicketPile';
import { RevealHandyman } from './scenes/RevealHandyman';
import { DemoSlate } from './scenes/DemoSlate';
import { ZeroAuthoredSteps } from './scenes/ZeroAuthoredSteps';
import { TwoModesAndVoice } from './scenes/TwoModesAndVoice';
import { MeetTheHand } from './scenes/MeetTheHand';
import { InstallEndcard } from './scenes/InstallEndcard';

export const SCENES = [
	{ id: 'cold-open-questions', frames: 210, Comp: ColdOpenQuestions },
	{ id: 'ticket-pile', frames: 210, Comp: TicketPile },
	{ id: 'reveal-handyman', frames: 240, Comp: RevealHandyman },
	// Sized to the real demo footage (public/demo.mov, 32.28s ≈ 968 frames);
	// was 600 when the slate placeholder occupied this slot.
	{ id: 'demo-slate', frames: 968, Comp: DemoSlate },
	{ id: 'zero-authored-steps', frames: 240, Comp: ZeroAuthoredSteps },
	{ id: 'two-modes-and-voice', frames: 300, Comp: TwoModesAndVoice },
	{ id: 'meet-the-hand', frames: 240, Comp: MeetTheHand },
	{ id: 'install-endcard', frames: 240, Comp: InstallEndcard },
] as const;

export const TOTAL_FRAMES = SCENES.reduce((sum, s) => sum + s.frames, 0);

export const HandymanLaunch: React.FC = () => (
	<AbsoluteFill style={{ backgroundColor: '#16161a' }}>
		{/* <Audio src={staticFile('music.mp3')} /> */}
		<Series>
			{SCENES.map((s) => (
				<Series.Sequence key={s.id} durationInFrames={s.frames}>
					<s.Comp />
				</Series.Sequence>
			))}
		</Series>
	</AbsoluteFill>
);

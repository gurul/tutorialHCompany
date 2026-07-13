// CARTOON-CHUNKY: big friendly claymation glove — very thick round-capped
// strokes, short stubby fingers, wide splay, oversized thumb.
window.STYLES.push({
	name: 'cartoon-chunky',
	blurb: 'Aardman-style glove hand — massive round-capped stubby fingers, oversized thumb, charm over elegance.',
	lineCap: 'round',
	poses: {
		open: {
			refSize: 880,
			fingers: {
				thumb: { tipX: -245, tipY: 155, baseX: -40, baseY: 265, pipX: -155, pipY: 235, rectWidth: 190, rectBezOrCircle: 0, rectOrBez: 0.45 },
				index: { tipX: -195, tipY: -105, baseX: -75, baseY: 80, pipX: -150, pipY: -15, rectWidth: 165, rectBezOrCircle: 0, rectOrBez: 0.35 },
				middle: { tipX: -40, tipY: -175, baseX: 0, baseY: 55, pipX: -35, pipY: -60, rectWidth: 165, rectBezOrCircle: 0, rectOrBez: 0.3 },
				ring: { tipX: 115, tipY: -150, baseX: 75, baseY: 65, pipX: 110, pipY: -45, rectWidth: 165, rectBezOrCircle: 0, rectOrBez: 0.3 },
				pinky: { tipX: 230, tipY: -55, baseX: 145, baseY: 105, pipX: 205, pipY: 25, rectWidth: 145, rectBezOrCircle: 0, rectOrBez: 0.35 },
			},
		},
		pointer: {
			refSize: 860,
			fingers: {
				thumb: { tipX: -135, tipY: 185, baseX: 30, baseY: 150, pipX: -60, pipY: 205, rectWidth: 180, rectBezOrCircle: 0, rectOrBez: 0.35 },
				index: { tipX: -250, tipY: -205, baseX: -110, baseY: 20, pipX: -185, pipY: -70, rectWidth: 170, rectBezOrCircle: 0, rectOrBez: 0.25 },
				middle: { tipX: -30, tipY: 30, baseX: 85, baseY: 55, pipX: 25, pipY: 40, rectWidth: 155, rectBezOrCircle: 0.999, rectOrBez: 0 },
				ring: { tipX: 50, tipY: 65, baseX: 150, baseY: 90, pipX: 100, pipY: 75, rectWidth: 150, rectBezOrCircle: 0.999, rectOrBez: 0 },
				pinky: { tipX: 110, tipY: 115, baseX: 200, baseY: 140, pipX: 155, pipY: 125, rectWidth: 135, rectBezOrCircle: 0.999, rectOrBez: 0 },
			},
		},
	},
});

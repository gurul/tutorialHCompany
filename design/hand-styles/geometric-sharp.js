// GEOMETRIC-SHARP: crystalline swiss-grid hand — butt caps, tapered stroke widths
// (thumb 140 → pinky 70), long parallel fingers, axis-aligned square knuckle dots.
window.STYLES.push({
	name: 'geometric-sharp',
	blurb: 'Crystalline swiss-grid hand: long parallel butt-capped strokes tapering from a 140-wide thumb to a 70-wide pinky, with square curled knuckles.',
	lineCap: 'butt',
	poses: {
		open: {
			refSize: 800,
			fingers: {
				thumb: { tipX: -248, tipY: 100, baseX: -112, baseY: 240, pipX: -180, pipY: 170, rectWidth: 140, rectBezOrCircle: 0, rectOrBez: 0 },
				index: { tipX: -190, tipY: -205, baseX: -182, baseY: 95, pipX: -186, pipY: -55, rectWidth: 115, rectBezOrCircle: 0, rectOrBez: 0 },
				middle: { tipX: -62, tipY: -252, baseX: -58, baseY: 105, pipX: -60, pipY: -73, rectWidth: 100, rectBezOrCircle: 0, rectOrBez: 0 },
				ring: { tipX: 55, tipY: -218, baseX: 50, baseY: 100, pipX: 52, pipY: -59, rectWidth: 85, rectBezOrCircle: 0, rectOrBez: 0 },
				pinky: { tipX: 150, tipY: -140, baseX: 145, baseY: 85, pipX: 147, pipY: -27, rectWidth: 70, rectBezOrCircle: 0, rectOrBez: 0 },
			},
		},
		pointer: {
			refSize: 800,
			fingers: {
				thumb: { tipX: -138, tipY: 48, baseX: -75, baseY: 248, pipX: -106, pipY: 148, rectWidth: 140, rectBezOrCircle: 0, rectOrBez: 0 },
				index: { tipX: -258, tipY: -222, baseX: -112, baseY: 22, pipX: -185, pipY: -100, rectWidth: 115, rectBezOrCircle: 0, rectOrBez: 0 },
				middle: { tipX: -15, tipY: 22, baseX: -60, baseY: 22, pipX: -37, pipY: 22, rectWidth: 100, rectBezOrCircle: 0.6, rectOrBez: 0 },
				ring: { tipX: 62, tipY: 44, baseX: 20, baseY: 44, pipX: 41, pipY: 44, rectWidth: 85, rectBezOrCircle: 0.6, rectOrBez: 0 },
				pinky: { tipX: 142, tipY: 66, baseX: 105, baseY: 66, pipX: 123, pipY: 66, rectWidth: 70, rectBezOrCircle: 0.6, rectOrBez: 0 },
			},
		},
	},
});

// DOT-MATRIX: constellation hand — five separated dots fanned like fingertips;
// in the pointer pose the index snaps into a stroke while the rest stay dots.
window.STYLES.push({
	name: 'dot-matrix',
	blurb: 'Constellation hand built from graduated dots; the index becomes a clean stroke when pointing.',
	lineCap: 'round',
	poses: {
		open: {
			refSize: 770,
			fingers: {
				thumb: { tipX: -245, tipY: 145, baseX: -180, baseY: 125, pipX: -212, pipY: 135, rectWidth: 150, rectBezOrCircle: 0.999, rectOrBez: 0 },
				index: { tipX: -183, tipY: -80, baseX: -135, baseY: -30, pipX: -159, pipY: -55, rectWidth: 115, rectBezOrCircle: 0.999, rectOrBez: 0 },
				middle: { tipX: -43, tipY: -165, baseX: -35, baseY: -90, pipX: -39, pipY: -127, rectWidth: 118, rectBezOrCircle: 0.999, rectOrBez: 0 },
				ring: { tipX: 117, tipY: -130, baseX: 90, baseY: -65, pipX: 103, pipY: -97, rectWidth: 115, rectBezOrCircle: 0.999, rectOrBez: 0 },
				pinky: { tipX: 237, tipY: -25, baseX: 180, baseY: 10, pipX: 208, pipY: -7, rectWidth: 100, rectBezOrCircle: 0.999, rectOrBez: 0 },
			},
		},
		pointer: {
			refSize: 770,
			fingers: {
				thumb: { tipX: -120, tipY: 175, baseX: -110, baseY: 95, pipX: -115, pipY: 135, rectWidth: 125, rectBezOrCircle: 0.999, rectOrBez: 0 },
				index: { tipX: -255, tipY: -210, baseX: -115, baseY: 10, pipX: -185, pipY: -100, rectWidth: 115, rectBezOrCircle: 0, rectOrBez: 0 },
				middle: { tipX: 0, tipY: 60, baseX: -45, baseY: 20, pipX: -22, pipY: 40, rectWidth: 112, rectBezOrCircle: 0.999, rectOrBez: 0 },
				ring: { tipX: 140, tipY: 78, baseX: 85, baseY: 50, pipX: 112, pipY: 64, rectWidth: 98, rectBezOrCircle: 0.999, rectOrBez: 0 },
				pinky: { tipX: 255, tipY: 58, baseX: 200, baseY: 45, pipX: 227, pipY: 51, rectWidth: 84, rectBezOrCircle: 0.999, rectOrBez: 0 },
			},
		},
	},
});

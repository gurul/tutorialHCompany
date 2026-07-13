// Curved-organic: fingers as flowing bezier strokes with soft round caps —
// each finger bows like a relaxed real hand instead of straight geometric bars.
window.STYLES.push({
	name: 'curved-organic',
	blurb: 'Flowing curved-stroke fingers with round caps — relaxed, hand-drawn and alive rather than geometric.',
	lineCap: 'round',
	poses: {
		open: {
			refSize: 820,
			fingers: {
				thumb: { tipX: -245, tipY: 110, baseX: -45, baseY: 235, pipX: -169, pipY: 211, rectWidth: 95, rectBezOrCircle: 0, rectOrBez: 0.7 },
				index: { tipX: -180, tipY: -170, baseX: -40, baseY: 75, pipX: -138, pipY: -32, rectWidth: 95, rectBezOrCircle: 0, rectOrBez: 0.6 },
				middle: { tipX: -45, tipY: -225, baseX: 10, baseY: 55, pipX: -45, pipY: -92, rectWidth: 95, rectBezOrCircle: 0, rectOrBez: 0.5 },
				ring: { tipX: 70, tipY: -210, baseX: 80, baseY: 70, pipX: 105, pipY: -69, rectWidth: 95, rectBezOrCircle: 0, rectOrBez: 0.55 },
				pinky: { tipX: 225, tipY: -100, baseX: 150, baseY: 120, pipX: 224, pipY: 22, rectWidth: 95, rectBezOrCircle: 0, rectOrBez: 0.7 },
			},
		},
		pointer: {
			refSize: 800,
			fingers: {
				thumb: { tipX: -140, tipY: -10, baseX: -80, baseY: 170, pipX: -132, pipY: 90, rectWidth: 92, rectBezOrCircle: 0, rectOrBez: 0.55 },
				index: { tipX: -250, tipY: -205, baseX: -130, baseY: 5, pipX: -205, pipY: -90, rectWidth: 92, rectBezOrCircle: 0, rectOrBez: 0.4 },
				middle: { tipX: -55, tipY: 25, baseX: 160, baseY: -30, pipX: -60, pipY: -90, rectWidth: 95, rectBezOrCircle: 0.999, rectOrBez: 0.6 },
				ring: { tipX: 8, tipY: 42, baseX: 195, baseY: -75, pipX: 25, pipY: -80, rectWidth: 95, rectBezOrCircle: 0.999, rectOrBez: 0.6 },
				pinky: { tipX: 65, tipY: 70, baseX: 260, baseY: -35, pipX: 95, pipY: -20, rectWidth: 95, rectBezOrCircle: 0.999, rectOrBez: 0.7 },
			},
		},
	},
});

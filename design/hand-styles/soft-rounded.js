// Soft-rounded: the original 5-stroke hand, warmed up — round caps, thinner
// strokes, slightly longer fingers, gentler fan, subtle outward bows.
window.STYLES.push({
	name: 'soft-rounded',
	blurb: 'Round-capped, ~25% thinner strokes with slightly longer fingers and a gentler fan — the original gone from brutalist to approachable.',
	lineCap: 'round',
	poses: {
		open: {
			refSize: 855,
			fingers: {
				thumb: { tipX: -248, tipY: 128, baseX: -58, baseY: 285, pipX: -166, pipY: 222, rectWidth: 87, rectBezOrCircle: 0, rectOrBez: 0.35 },
				index: { tipX: -160, tipY: -190, baseX: -64, baseY: 56, pipX: -119, pipY: -65, rectWidth: 87, rectBezOrCircle: 0, rectOrBez: 0.22 },
				middle: { tipX: -32, tipY: -236, baseX: 12, baseY: 20, pipX: -18, pipY: -108, rectWidth: 87, rectBezOrCircle: 0, rectOrBez: 0.2 },
				ring: { tipX: 80, tipY: -212, baseX: 95, baseY: 42, pipX: 98, pipY: -84, rectWidth: 87, rectBezOrCircle: 0, rectOrBez: 0.25 },
				pinky: { tipX: 212, tipY: -110, baseX: 162, baseY: 110, pipX: 202, pipY: 3, rectWidth: 87, rectBezOrCircle: 0, rectOrBez: 0.35 },
			},
		},
		pointer: {
			refSize: 841,
			fingers: {
				thumb: { tipX: -155, tipY: 8, baseX: -98, baseY: 218, pipX: -142, pipY: 108, rectWidth: 85, rectBezOrCircle: 0, rectOrBez: 0.35 },
				index: { tipX: -258, tipY: -212, baseX: -130, baseY: 0, pipX: -206, pipY: -100, rectWidth: 85, rectBezOrCircle: 0, rectOrBez: 0.3 },
				middle: { tipX: -56, tipY: 24, baseX: 158, baseY: -30, pipX: -60, pipY: -93, rectWidth: 85, rectBezOrCircle: 0.999, rectOrBez: 0 },
				ring: { tipX: 6, tipY: 42, baseX: 194, baseY: -74, pipX: 23, pipY: -80, rectWidth: 85, rectBezOrCircle: 0.999, rectOrBez: 0 },
				pinky: { tipX: 64, tipY: 70, baseX: 258, baseY: -34, pipX: 93, pipY: -22, rectWidth: 85, rectBezOrCircle: 0.999, rectOrBez: 0 },
			},
		},
	},
});

// Brand tokens — lifted from packages/core (fab.ts / overlay.ts / hand.ts).
// One accent on near-black and near-white; the five finger tints are the ONLY
// other chromatic values allowed anywhere in the video.

export const INK = '#16161a';
export const PAPER = '#ffffff';
export const ACCENT = '#4353ff';
export const RECORDING = '#e5484d';

/** Soft off-white used for large light backgrounds (pure white strobes). */
export const PAPER_WARM = '#f7f7f9';
/** Muted ink for secondary copy on light. */
export const INK_60 = 'rgba(22, 22, 26, 0.6)';
export const INK_40 = 'rgba(22, 22, 26, 0.4)';
/** Paper at reduced alpha for secondary copy on dark. */
export const PAPER_70 = 'rgba(255, 255, 255, 0.7)';
export const PAPER_40 = 'rgba(255, 255, 255, 0.4)';

/** Finger tints of the accent, thumb → pinky (fingerTints() in hand.ts:
 *  index = pure accent; others step toward white by 18/34/50/64%). */
export const FINGER_TINTS = {
	thumb: '#6572ff',
	index: '#4353ff',
	middle: '#838dff',
	ring: '#a1a9ff',
	pinky: '#bbc1ff',
} as const;

export const FINGER_ORDER = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;
export type FingerName = (typeof FINGER_ORDER)[number];

/** Type scale for 1920×1080 (per 2026 launch-video norms: hero ≥ 96px,
 *  tight tracking on large sizes, Figtree variable weights render true). */
export const TYPE = {
	hero: { fontSize: 128, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.02 },
	h1: { fontSize: 96, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.05 },
	h2: { fontSize: 64, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 },
	body: { fontSize: 36, fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.3 },
	label: { fontSize: 26, fontWeight: 600, letterSpacing: '0.12em', lineHeight: 1 },
	small: { fontSize: 24, fontWeight: 500, letterSpacing: '0', lineHeight: 1.3 },
} as const;

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/** House spring configs — snappy with a hint of overshoot; heavier for big
 *  set pieces. Use with spring({frame, fps, config}). */
export const SPRING_SNAPPY = { damping: 16, stiffness: 160, mass: 0.9 };
export const SPRING_SOFT = { damping: 22, stiffness: 110, mass: 1 };
export const SPRING_POP = { damping: 12, stiffness: 220, mass: 0.7 };

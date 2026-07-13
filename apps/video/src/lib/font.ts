// Figtree — the same family the widget embeds (packages/core/src/fonts.ts).
// Loaded via @remotion/google-fonts so rendering waits for it (no FOUT in
// the encoded frames).

import { loadFont } from '@remotion/google-fonts/Figtree';

export const { fontFamily } = loadFont();

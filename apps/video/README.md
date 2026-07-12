# @handyman/video

The handyman launch film — ~88 s · 1920×1080 · 30 fps, built in
[Remotion](https://remotion.dev) 4. Eight fully-produced motion-graphics
scenes around the real product demo (scene 4, `public/demo.mov`, 32 s).

```bash
bun install                # from the repo root
cd apps/video
bun run studio             # live preview + scrubbing
bun run render             # → out/handyman-launch.mp4
```

## Swapping the demo footage

Scene 4 (`src/scenes/DemoSlate.tsx`) renders a browser-chrome mockup that
auto-plays `public/demo.mov` (or `demo.mp4`) when the file exists and falls
back to a framed placeholder slate when it doesn't — no code edit needed to
swap recordings. If the new footage's length differs, adjust the
`demo-slate` frame count in `src/HandymanLaunch.tsx` (duration s × 30).

## Music

`src/HandymanLaunch.tsx` plays `public/music.mp3` through a frame-driven
volume envelope: fade-in, full under the motion scenes, ducked to 35% while
the demo's own audio plays, silent through the end card. The track itself is
**not in git** (licensed audio — Epidemic Sound "Hold You", Andre Aguado);
put your licensed copy at `public/music.mp3` to render with sound.

## Layout

- `src/HandymanLaunch.tsx` — scene timeline (frame budget per scene).
- `src/scenes/` — one file per scene.
- `src/lib/` — design system: brand tokens, the exact widget hand glyph
  (`Hand.tsx`, geometry lifted from `packages/core/src/hand.ts`), masked
  type reveals, grain/vignette backdrop, browser chrome, and the product UI
  rebuilt as motion primitives (spotlight ring, tour card, FAB, status pill).
- `DESIGN.md` — the binding motion/design contract the scenes follow.
- `REMOTION-NOTES.md` — researched API notes (Remotion 4.0.489).

Stills for review: `bun run still -- --frame=560 out/stills/f560.png`.

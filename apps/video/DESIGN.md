# handyman launch video — design contract

76 s · 1920×1080 · 30 fps · 2280 frames. Concept: unanswered "how do I…?"
questions pile up in the dark; the brand hand draws itself on and wipes the
world to light; the product lives in the light. The hand is the only
character and bookends the piece.

## Non-negotiable motion rules

- ONE spring family. Workhorse entrance: `SPRING_SOFT`/`SPRING_SNAPPY` from
  `lib/tokens` (no visible bounce beyond a single subtle settle). The
  celebratory single-overshoot spring (`SPRING_POP`) is reserved for the hand
  and the final lockup ONLY.
- No linear easing, no default ease on hero motion. No element animates more
  than one idea at a time (no scale+spin+blur combos).
- Type: Figtree via `lib/font` (`fontFamily`). Scale + tracking come from
  `TYPE` in `lib/tokens`. Never loose tracking on large lowercase display.
- Color: `INK` / `PAPER_WARM` grounds, `ACCENT` (#4353ff) as the ONLY accent,
  finger tints only on the hand. Nothing else chromatic, ever.
- Backgrounds always via `<Backdrop variant="dark|light">` (grain + vignette
  + dot grid built in). Never flat #000/#fff.
- Determinism: no `Math.random()` (use `random(seed)` from remotion), no
  `Date.now()`. Everything derives from `useCurrentFrame()`.
- Text must sit fully readable ≥ 0.5 s (15 frames) after settling before
  anything cuts it away.
- Every scene is mounted in a `<Series.Sequence>`: `useCurrentFrame()` is
  ALREADY scene-relative. Scenes take no props and fill the frame
  (`AbsoluteFill`).

## Shared library (apps/video/src/lib)

- `tokens.ts` — INK, PAPER, PAPER_WARM, ACCENT, RECORDING, INK_60/40,
  PAPER_70/40, FINGER_TINTS, TYPE, SPRING_SNAPPY/SOFT/POP.
- `font.ts` — `fontFamily` (Figtree, load-blocked).
- `Hand.tsx` — `<Hand pose="open|pointer" width palette="tints|paper|ink"
  reveal flip style/>`; exact widget geometry; `reveal` 0..1 staggers a
  per-finger draw-on. `HAND_ASPECT` for height math.
- `TypeReveal.tsx` — `<TypeReveal lines delay stagger align style lineStyle
  exitAt/>`; the house masked line reveal (rise from behind baseline mask on
  a spring; optional exit).
- `Backdrop.tsx` — `<Backdrop variant grid>` scene ground.
- `BrowserChrome.tsx` — `<BrowserChrome width height url variant>` browser
  mockup (traffic lights, URL pill, shadow).
- `widget.tsx` — `SpotlightRing`, `TourCard`, `Fab`, `StatusPill`: the real
  product UI rebuilt as motion-graphic primitives. Use these instead of
  re-inventing product chrome.

## Scene timeline (frames are per-scene, cuts are hard)

| # | file (src/scenes/) | export | frames |
|---|---|---|---|
| 1 | ColdOpenQuestions.tsx | ColdOpenQuestions | 210 |
| 2 | TicketPile.tsx | TicketPile | 210 |
| 3 | RevealHandyman.tsx | RevealHandyman | 240 |
| 4 | DemoSlate.tsx | DemoSlate | 968 (fits public/demo.mov, 32.28s) |
| 5 | ZeroAuthoredSteps.tsx | ZeroAuthoredSteps | 240 |
| 6 | TwoModesAndVoice.tsx | TwoModesAndVoice | 300 |
| 7 | MeetTheHand.tsx | MeetTheHand | 240 |
| 8 | InstallEndcard.tsx | InstallEndcard | 240 |

Cross-scene stitches (owned by the LATER scene unless noted):
- 1→2: the lone "how do I…?" ends scene 1 centered at 140 px; scene 2 opens
  with the same line in the same position shrinking into the first ticket chip.
- 2→3: scene 2's LAST 14 frames run the hand wipe — a 140 px near-white
  vertical band sweeps left→right erasing the dark world (clip-path). Scene 3
  opens already light.
- 5's spotlight ring ends center-right; scene 6 opens with a ring in the same
  region (loose match cut).
- 7 ends zoomed toward the docked FAB; scene 8 opens on light ground (hard cut).

## Demo placeholder rule (scene 4)

ALL placeholder content (label, spec line, hatch, dashed boundary, safe-area
guides) lives in ONE child component named `SlateContents` inside
DemoSlate.tsx, rendered inside the BrowserChrome viewport. The creator
replaces that single component with `<OffthreadVideo>` — chrome, shadow, and
zoom transitions must survive the swap untouched.

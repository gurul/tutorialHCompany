# handyman

Ask any website "how do I …?" — an animated pointer shows you, step by step, or does it for you.

**handyman** is a drop-in guided-tour widget with zero authored steps: it screenshots the live page, asks [H Company](https://hub.hcompany.ai)'s `holo3-1-35b-a3b` computer-use model to plan and ground the next step, then spotlights the real DOM element with a gliding pointer and a voice narration ([Gradium](https://docs.gradium.ai) TTS). Ask by voice too (Gradium STT). Multi-page flows work because the agent re-plans after every page change.

Built for the Computer Use Hackathon — Track 2 (Browser Use) + Voice challenge.

Two ways to put it on a page:

```html
<!-- 1. Embed (a site you own) -->
<script src="/handyman.js"></script>
<script>Handyman.init({ endpoint: "/api" })</script>
```

- **2. Chrome extension** (every site, including strict-CSP ones): load
  `apps/extension/dist` unpacked. Its content script and service worker relay the
  widget's network, screenshots, and voice socket, so a page's CSP can't block
  them.

The widget mounts inside Shadow DOM, so host-page CSS can't deform it and its own
styles never leak out.

## How it works

```
widget (packages/core, zero-dep TS)          server (Bun + Hono)
  screenshot viewport ──► POST /api/step ──► api.hcompany.ai  holo3-1-35b-a3b
  ◄── one step: point | act_click | act_write | answer   (structured outputs)
  snap [0,1000] coords → DOM element → spotlight + pointer glide
  guide mode: user clicks; do-it-for-me: widget dispatches real events
  page settles → new screenshot → next step → ... → answer
  voice: Gradium TTS/STT over WebSocket (ephemeral tokens via /api/voice-token)
```

- **The buddy hand**: an animated five-stroke hand (pose engine vendored from era-maker's EraHand cursor, recolored to accent-derived tints — no brand palette) rests inside the bottom-right launcher until summoned (click the launcher or press the voice hotkey, default `Alt+H`). Out of its house it spring-follows your real mouse open-palmed — slightly trailing, never blocking clicks — then takes the lead during a tour: index-finger *point* at each target, a momentary *grab* when it presses, an excited wave as it docks home. Click the launcher to send it home. All motion collapses to instant snaps under `prefers-reduced-motion`.
- **Status pill**: while the agent round-trips ("Analyzing…" on a fresh ask, "Working…" between steps) a pill beside the launcher fills the dead air; clicking **Ask** mid-listen also cuts the mic immediately instead of waiting out the VAD.
- **Typography**: the widget ships Figtree (variable, OFL) embedded as a data URI and registered on the document — shadow roots can't host `@font-face` — falling back to `system-ui` where CSP blocks `data:` fonts.
- **Element snapping** absorbs grounding error: model coordinates only need to land inside the element; `elementFromPoint` + interactive-ancestor climb does the rest.
- **Click-through spotlight**: a highlight ring, no dimming and no scrim, so the page stays fully live — your real click on the real element advances the tour.
- **Site scout** (`server/scout/`): an H Agents Platform [multi-agent](https://hub.hcompany.ai/computer-use-agents/multi-agent) manager fans out page-scout + flow-verifier subagents in parallel cloud browsers to pre-map a site's flows.

## Run it

```bash
bun install
cp server/.env.example server/.env   # add HAI_API_KEY (required) + GRADIUM_API_KEY (voice)
bun run demo             # build widget + extension, then serve the proxy on :3000
```

Load `apps/extension/dist` as an unpacked extension (`chrome://extensions` → Developer mode → Load unpacked), open any site, click the pointer button bottom-right (or press `Alt+H` to ask by voice), and ask a question. The pointer pops out of its house and follows your mouse; ask a question and it takes the lead.

## Layout

| Path | What |
|---|---|
| `packages/core` | The widget: overlay engine, hand pointer (`hand.ts` pose engine + `pointer.ts` spring), snapping, agent-loop session, voice clients, embedded Figtree (`fonts.ts`) |
| `server` | Key-holding proxy: `/api/step` (Holo3), `/api/voice-token` (Gradium), widget hosting |
| `server/scout` | Multi-agent site scout (hai-agents SDK) |
| `apps/extension` | Chrome extension: runs the widget on any site, bridges capture/network/voice past page CSP |
| `apps/video` | Remotion launch film (~88 s, 8 scenes + real demo footage) — see its README |
| `assets` | Brand assets: the hand as SVG + transparent/white PNGs |
| `docs/PLAN-adaptive-tours.md` | Architecture plan of record |

## Credits

Built on [H Company](https://hub.hcompany.ai) Holo3 models & Agents Platform, and Gradium voice. Pointer/spotlight mechanics generalized from an internal onboarding tour experiment.

## License

MIT — see [LICENSE](LICENSE).

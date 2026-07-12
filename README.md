# handyman

Ask any website "how do I …?" — an animated pointer shows you, step by step, or does it for you.

**handyman** is a drop-in guided-tour widget with zero authored steps: it screenshots the live page, asks [H Company](https://hub.hcompany.ai)'s `holo3-1-35b-a3b` computer-use model to plan and ground the next step, then spotlights the real DOM element with a gliding pointer and a voice narration ([Gradium](https://docs.gradium.ai) TTS). Ask by voice too (Gradium STT). Multi-page flows work because the agent re-plans after every page change.

Built for the Computer Use Hackathon — Track 2 (Browser Use) + Voice challenge.

Three ways to put it on a page:

```html
<!-- 1. Embed (a site you own) -->
<script src="/handyman.js"></script>
<script>Handyman.init({ endpoint: "/api" })</script>
```

- **2. Bookmarklet** (any lenient site, zero install): open `/embed/bookmarklet`,
  drag the button to your bookmarks bar, click it on any page.
- **3. Chrome extension** (every site, including strict-CSP ones): load
  `apps/extension/dist` unpacked. Its content script relays the widget's network
  through the isolated world, so a page's `connect-src` CSP can't block it.

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

- **The buddy pointer**: the arrow rests inside the bottom-right launcher until summoned (click the launcher or press the voice hotkey, default `Alt+H`). Out of its house it spring-follows your real mouse as a companion — slightly trailing, never blocking clicks — then takes the lead during a tour, gliding to each target with spring physics (a hand-moved feel, not a rail). Click the launcher to send it home. All motion collapses to instant snaps under `prefers-reduced-motion`.
- **Element snapping** absorbs grounding error: model coordinates only need to land inside the element; `elementFromPoint` + interactive-ancestor climb does the rest.
- **Click-through spotlight**: the dim scrim is 4 panels around the cutout, so the highlighted element stays genuinely clickable — your real click advances the tour.
- **Site scout** (`server/scout/`): an H Agents Platform [multi-agent](https://hub.hcompany.ai/computer-use-agents/multi-agent) manager fans out page-scout + flow-verifier subagents in parallel cloud browsers to pre-map a site's flows.
- **Fixture mode**: record real sessions, replay offline (`HANDYMAN_FIXTURES=1`) — the demo survives dead wifi.

## Run it

```bash
bun install
bun run build            # bundle the widget
cp server/.env.example server/.env   # add HAI_API_KEY + GRADIUM_API_KEY (optional: fixture mode needs none)
bun run server           # serves the Acme Invoices demo at http://localhost:3000
```

Open http://localhost:3000, click the pointer button bottom-right (or press `Alt+H` to ask by voice), and ask *"how do I create an invoice?"*. The pointer pops out of its house and follows your mouse; ask a question and it takes the lead.

## Layout

| Path | What |
|---|---|
| `packages/core` | The widget: overlay engine, pointer, snapping, agent-loop session, voice clients |
| `server` | Key-holding proxy: `/api/step` (Holo3), `/api/voice-token` (Gradium), fixtures, static demo hosting |
| `server/scout` | Multi-agent site scout (hai-agents SDK) |
| `apps/demo` | "Acme Invoices" — plain-HTML fake SaaS the demo runs on |
| `docs/PLAN.md` | Architecture plan of record |
| `docs/vendor/hai` | Local mirror of the H Company docs used to build this |

## Credits

H Company Holo3 models & Agents Platform · Gradium voice · pointer/spotlight mechanics generalized from an internal onboarding tour experiment.

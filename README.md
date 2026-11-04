# iron-man — The Legacy Protocol

*The end of an era. The rise of Doom.*

A four-act cinematic short rendered live in WebGL and directed by scroll: a damaged helmet
and a dying arc reactor, the armour coming apart into embers, a silent gap, then a hall of
iron where a cloaked figure calls up a sphere of green energy.

An unofficial fan tribute, not affiliated with or endorsed by Marvel Studios or The Walt
Disney Company. Every model is sculpted in code and every sound is synthesised in the
browser — no footage, images, likenesses, music or sound effects are used.

Screenplay, storyboard, timelines and technical design: [`docs/LEGACY_PROTOCOL.md`](docs/LEGACY_PROTOCOL.md).

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
npm run lint
```

## How it is built

Vite + React 19, vanilla three.js, one GSAP ScrollTrigger timeline, Lenis smooth scroll.

| Path | Role |
|------|------|
| `src/legacy/Legacy.jsx` | Gate (enter with / without sound), narration overlays, HUD, fallback |
| `src/legacy/content.js` | Acts, narration, title cards and their timeline times |
| `src/legacy/three/sculpts.js` | SDF sculpts: helmet shell + faceplate, Doom's mask, hood, armour |
| `src/legacy/three/sculpt.worker.js` | Meshes the sculpts in parallel workers |
| `src/legacy/three/shading.js` | Shared GLSL: simplex noise, the erosion field, metal wear |
| `src/legacy/three/helmetSet.js` | Acts I–II: helmet, faceplate servo, arc reactor, embers, shards |
| `src/legacy/three/doomSet.js` | Acts III–IV: hall, gears, figure, vertex-animated cloak, sigil, energy |
| `src/legacy/three/Stage.js` | Renderer, environments, post (DOF, bloom, grain), camera rig, heartbeat, adaptive quality |
| `src/legacy/three/choreography.js` | The single scrubbed timeline and the forward-only audio cue track |
| `src/legacy/audio/Score.js` | Web Audio synthesis of the whole soundtrack |
| `src/lib/sdf.js` | Signed-distance sculpting + Surface Nets mesher |
| `src/lib/scroll.js` | Lenis smooth scroll synced to ScrollTrigger; WebGL 2 check |

To retime a moment, edit `choreography.js` (camera, light and state tweens) and `content.js`
(copy). Timeline units are 3 per act; 1 unit ≈ 110 vh of scroll.

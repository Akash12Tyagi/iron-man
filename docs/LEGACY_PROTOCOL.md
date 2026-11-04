# The Legacy Protocol — screenplay, storyboard & technical design

*THE END OF AN ERA. THE RISE OF DOOM.*

A scroll-driven cinematic short in four acts, rendered live in WebGL. This
document was written before the code (workflow steps 1–5) and is kept in sync
with it. The experience is served at the site root (`/`).

> **Origin.** The film was first built inside `Akash12Tyagi/aws-frontend` (route
> `/#/legacy`) and moved here as a standalone project. Section 1 records the
> inspection of that repository; its shared helpers now live in `src/lib/`
> (`sdf.js`, the SDF sculpting + Surface Nets mesher, and `scroll.js`, the
> Lenis ↔ ScrollTrigger bridge).

> **Narrative guard-rail.** Tony Stark and Victor von Doom are two distinct
> characters. Nothing in the film shows, says or implies that one becomes the
> other. The two sets are physically separate places (60 m apart, never on
> screen together), the Iron Man embers burn out *before* the Doom hall is
> found, and the only bridge between them is cinematic grammar: a mirrored shot,
> a palette inversion and a shared silence — the symbolism of one actor leaving
> one role behind and stepping into an opposite one.
>
> This is an unofficial fan tribute. No film footage, stills, logos, likenesses,
> music or sound effects from any studio are used: every model is sculpted in
> code, every sound is synthesised in the browser.

---

## 1. Inspection of the existing project (step 1)

| Item | Found | Consequence |
|------|-------|-------------|
| Toolchain | Vite 7, React 19, ESLint 9 | Kept as is |
| 3D | `three` 0.186, vanilla (no R3F / Drei) | Vanilla three.js, same `Stage` + `choreography` split as `src/atelier` |
| Motion | `gsap` 3.15 + ScrollTrigger, `lenis` smooth scroll | One scrubbed master timeline; `src/atelier/scroll.js` reused |
| Overlays | CSS + GSAP (no Framer Motion) | HTML overlays are tweened by the same GSAP timeline, which keeps text frame-locked to the camera (a second animation system could drift) |
| Modelling | `src/atelier/three/sdf.js`: SDF sculpting + Surface Nets, run in a Web Worker | Helmet, mask, hood and armour are sculpted the same way, off the main thread |
| Fonts | `@fontsource` Cormorant Garamond + Jost, self-hosted | Reused; no new font downloads |
| Routing | `main.jsx` switches on `location.hash` (`#/dashboard`) | New route `#/legacy`; the atelier and dashboard are untouched |

No new runtime dependencies are added.

---

## 2. Screenplay & storyboard (step 2)

The film is one master timeline of **12 units** (3 per act) mapped to about
**1 300 vh** of scroll. Times below are timeline units; `→` means a tween.

### ACT 01 — THE LAST LIGHT  (0.0 – 3.0) · *sacrifice, legacy, humanity*

| Shot | t | Picture | Camera | Light / colour | Sound | On screen |
|------|---|---------|--------|----------------|-------|-----------|
| 1.1 Black | 0.0–0.5 | Absolute black. Nothing. | — | Exposure 0 | Mechanical heartbeat fades in: sub thump + servo tick, 52 bpm | "Some hearts are made of iron." |
| 1.2 Ignition | 0.5–1.3 | An arc reactor lying in the dark stutters on — three failed sparks, then a weak, breathing glow. Its light crawls up the floor | Macro, 18 cm from the lens, slow push-in; very shallow focus | Warm orange-white core; the reactor *is* the key light (shadow-casting spot) | Startup whine rising with each spark, electrical crackle; hum follows the glow | — |
| 1.3 The helmet | 1.3–2.2 | Rack focus past the reactor: a damaged red-and-gold helmet lies on its side, faceplate cracked, eye slits faintly lit. The faceplate servo twitches, trying to close | Pull-up and back on an arc, low 3/4, dolly-in on the face | Under-light from the reactor; a cold red rim from behind; dust in the beam | Servo strain on each twitch, metal creak | "This one gave everything." |
| 1.4 The face | 2.2–3.0 | Close-up of the cracked faceplate. The eyes flicker in time with the heart | Slow dolly-in to 45 cm, tiny handheld drift | Eye glow dims each beat | Heartbeat slows to 40 bpm | "And asked for nothing in return." |

### ACT 02 — THE SILENCE  (3.0 – 6.0) · *absence, memory, time*

| Shot | t | Picture | Camera | Light / colour | Sound | On screen |
|------|---|---------|--------|----------------|-------|-----------|
| 2.1 Last beat | 3.0–3.6 | The reactor gives two last flickers and goes dark. The eyes die with it | Locked off. The only still shot in the film | Warm key → 0; rim drains from red to charcoal | Heart: one beat, a long gap, a final beat. Hum winds down. Then true silence | "Silence." |
| 2.2 Disintegration | 3.6–4.8 | From the cracks outward the armour comes apart into tens of thousands of embers and a few hundred metal shards. The surface burns away with a glowing edge; the embers lift and drift | Slow pull back and rise, 3° roll | Embers are the only light: hot orange at the burning edge, cooling to ember red | Deep transition rumble swells; metal fragments tick and ring | "Time does not stop for heroes." |
| 2.3 Drift | 4.8–5.6 | The embers cool to ash grey and are carried into the depth. The last, farthest ones catch the faintest trace of green from somewhere very far away | Tilt and drift toward the depth, following them | Orange → ash grey → a hint of green on the farthest few | Rumble falls away; a single distant metallic ring | "It only remembers them." |
| 2.4 The gap | 5.6–6.0 | Complete darkness | — | Exposure 0 | Sub-bass only, then nothing | — |

### ACT 03 — THE UNKNOWN  (6.0 – 9.0) · *mystery, transformation, anticipation*

| Shot | t | Picture | Camera | Light / colour | Sound | On screen |
|------|---|---------|--------|----------------|-------|-----------|
| 3.1 The hall | 6.0–6.9 | Green breathes into the fog. A vast mechanical hall: ribbed stone columns, colossal gears turning in the dark, pipes, a round window at the far end glowing green | Low crawl forward at knee height between the columns | Emerald back-light through fog; green shafts from high windows; gunmetal everywhere else | Dark drone (minor-second cluster), slow gear groans, chains | "Far from here, another throne has waited." |
| 3.2 Footsteps | 6.9–8.0 | Out of the green haze a cloaked figure steps forward — a silhouette only, back-lit, his long shadow reaching the lens | Hold, then a very slow push; slight dip on each footfall | Back-light only; no front light at all | Six heavy footsteps, each a sub thud and a metal clank with a long reverb tail, one per scroll step | "He does not ask for permission." |
| 3.3 Partial reveal | 8.0–9.0 | Lateral tracking past a column: the edge of the green cloak, the rim of the hood, a glint of metal where the face should be. Never the whole figure | Truck right behind a column (foreground wipe), end on a 3/4 profile | Hard green rim; face in total shadow | Footsteps stop. Cloth movement. The drone thins | "He does not need to be loved." |

### ACT 04 — THE RISE OF DOOM  (9.0 – 12.0) · *power, fear, destiny*

| Shot | t | Picture | Camera | Light / colour | Sound | On screen |
|------|---|---------|--------|----------------|-------|-----------|
| 4.1 Mirror | 9.0–9.8 | **The exact framing of shot 1.2** — low, close, under-lit — but the light that comes on is an emerald energy sphere rising out of a sigil in the floor. Its light climbs the cloak and reveals the iron mask | Low macro push, then tilt up the figure to the mask | Green under-light (the reactor's inverse); eyes stay black | Energy activation: rising FM swell, crackle, sub | "Only obeyed." |
| 4.2 The mask | 9.8–10.5 | Close-up of the mask: rivets, brow, the mouth grille. Lightning crawls over the sphere | Slow dolly-in to the eye line, the stillest shot of the act | Green key from below, cool silver speculars | Energy hum builds; heartbeat motif returns as a *drum*, not a heart | "A hero left a legacy." → "A villain will make history." |
| 4.3 Monument | 10.5–11.4 | The sphere surges: a shockwave of green runs across the floor and up the columns; the sigil blazes; every shaft ignites. A single orange ember from Act 2 drifts through the foreground and goes out | Long pull back and up to a symmetrical wide — Doom dead centre, columns framing him | Green floods the hall; the ember is the only warm pixel left | Final impact: sub drop, noise burst, low brass-like chord, long tail | "THE END OF AN ERA." (as the ember dies) → "THE RISE OF DOOM." (on the impact) |
| 4.4 End frame | 11.4–12.0 | Clean end frame: the monument, darkened, under the title | Locked | Exposure eases down to 40 % | Reverb tail only | "AVENGERS: DOOMSDAY" · fan-tribute note · replay |

### Narration (complete)

1. Some hearts are made of iron.
2. This one gave everything.
3. And asked for nothing in return.
4. Silence.
5. Time does not stop for heroes.
6. It only remembers them.
7. Far from here, another throne has waited.
8. He does not ask for permission.
9. He does not need to be loved.
10. Only obeyed.
11. A hero left a legacy.
12. A villain will make history.

Title: **THE END OF AN ERA. / THE RISE OF DOOM.** — then **AVENGERS: DOOMSDAY**.

### Transition logic between acts

| Cut | Technique | Why |
|-----|-----------|-----|
| I → II | No cut. The reactor's death *is* the transition; Act II starts with the stillest shot of the film | Loss is felt as a stop, not a wipe |
| II → III | Fade to complete black (2.4), 0.4 units of nothing, hard set change inside the black, fade up green | The "emotional gap": the two worlds never share a frame |
| III → IV | No cut. The sigil ignition carries the energy from Act III's ambience into Act IV's light | Continuity of power |
| Mirror | Shot 4.1 reuses shot 1.2's camera height, lens and under-lighting | The only bridge between the two identities is how they are filmed |

Scrolling backwards plays the whole film in reverse, including re-assembly of the
helmet from its embers; audio cues fire only on forward crossings so reversing
never produces stutters.

---

## 3. Visual references & asset requirements (step 3)

| Asset | References studied (descriptions, not copied) | Built as |
|-------|-----------------------------------------------|----------|
| Damaged helmet | Hot-rod red shell, gold faceplate, angular eye slits, mouth line, cheek seams; battle damage: cracks, a torn panel, scorching | SDF sculpt (shell with real thickness + separate faceplate), Surface Nets mesh, `MeshPhysicalMaterial` with clearcoat; scratches, scorch and cracks in the shader from object-space noise |
| Arc reactor | Round housing, ten copper coil segments, glass lens, white-hot core | Lathe housing + instanced coils + physical glass + emissive core shader; its light is a shadow-casting spot plus a point fill |
| Floating fragments | Thin torn armour plates | ~200 instanced shard meshes, metal PBR |
| Embers | — | GPU points sampled area-weighted from the helmet surface; motion and colour are entirely in the vertex shader |
| Doom's mask | Flat iron face, heavy brow, rectangular eye holes, nose ridge, mouth grille, rivets | SDF sculpt, dark silver metal, rivets as geometry |
| Hood & cloak | Heavy dark-green wool, deep hood, floor-length cloak open at the front | Hood: SDF shell with folds. Cloak: parametric surface with fold profile; sway, wind and footstep flare in a vertex shader (shadow pass included). Sheen lobe for wool |
| Armour under the cloak | Gunmetal breastplate, segmented abdomen, belt disc | SDF sculpt |
| Hall | Gothic-mechanical: ribbed columns, arches, giant gears, pipes, round window | Instanced columns, extruded gears, tube pipes, tiled stone floor (canvas texture) |
| Green energy | Sphere of plasma, crawling lightning, shockwave | Fresnel + fbm shader, CPU-generated billboard bolts, ring and shell shaders, burst points |
| Atmosphere | Volumetric shafts, ground fog, dust | Additive noise-modulated cones, layered fog planes, exponential fog |

**Honest limitation.** These are stylised, cinematic sculpts made in code, not
production character models and not likenesses of any actor. Photoreal
characters would need licensed, artist-made assets (high-poly sculpt, baked
textures, a cloth sim); the `Stage` loads its meshes through one function
(`sculptAll`), so a glTF loader could replace it without touching the
choreography.

---

## 4. Timelines (step 4)

### Camera keys (world units: metres; Doom set origin at z = −60)

| Shot | Position | Target | FOV | DOF |
|------|----------|--------|-----|-----|
| 1.2 | reactor + (0.05, 0.06, 0.20) | reactor | 26 | strong |
| 1.3 | (0.42, 0.16, 0.85) | helmet | 30 | medium |
| 1.4 | (0.22, 0.13, 0.46) | faceplate | 28 | medium |
| 2.2 | (0.6, 0.55, 1.5) | helmet | 34 | light |
| 2.3 | (0.2, 1.0, 1.9) | (0, 0.9, −2.5) | 38 | none |
| 3.1 | hall (0.3, 0.45, 11) → (0.1, 0.5, 7.5) | figure | 36 | none |
| 3.2 | (0, 0.9, 6.4) | figure chest | 32 | light |
| 3.3 | (2.3, 1.5, 2.6) → (1.4, 1.6, 1.9) | hood | 30 | medium |
| 4.1 | orb + (0.05, 0.02, 0.32) → mask | orb / mask | 26 | strong |
| 4.2 | (0.18, 1.72, 0.75) | mask | 24 | medium |
| 4.3 | (0, 2.4, 11.5) | (0, 1.6, 0) | 40 | none |

Eases: `sine.inOut` for drifts, `power2.inOut` for dollies, `power3.out` for
reveals, `expo.out` for the shockwave. Nothing camera-related is linear except
the walk (so footsteps stay on exact scroll positions).

### Lighting & colour

| t | Exposure | Key | Rim | Env / fog |
|---|----------|-----|-----|-----------|
| 0.0 | 0 | — | — | warm env, fog #000 |
| 0.5–3.0 | 1 | reactor spot (#ffb070), flicker | red-copper back rim | warm env 0.35 |
| 3.0–3.6 | 1 → 0.8 | reactor → 0 | rim → charcoal | env → 0.1 |
| 3.6–5.6 | 0.8 | embers only (bloom) | — | fog #000 |
| 5.6–6.0 | → 0 | — | — | env swapped to green |
| 6.0–9.0 | 1 | green back-light spot (shadows toward lens) | green shafts | fog #020604 |
| 9.0–10.5 | 1 | orb point light (#3dff8a) from below | green rim | — |
| 10.5–11.4 | 1.2 peak | orb surge, sigil, all shafts | — | flash 0.35 |
| 11.4–12.0 | → 0.4 | — | — | — |

### Particles

| t | Embers | Shards |
|---|--------|--------|
| < 3.6 | hidden (mesh intact) | attached |
| 3.6–4.8 | released along the erosion front (noise + sweep from the crack line), outward then upward | break off with the front, slow tumble |
| 4.8–5.6 | cool, drift into −z, fade | drift and dim |
| 9.0–11.4 | — | green burst points ride the shockwave |

### Scroll mapping (≈110 vh per timeline unit)

| Scroll | Story |
|--------|-------|
| 0–25 % | Act 01 |
| 25–50 % | Act 02 |
| 50–75 % | Act 03 |
| 75–100 % | Act 04 |

Text lines are tweened by the same timeline (fade, blur-in, tracking) so the
narration is always frame-locked to the camera. The HUD shows the current act
(numeral and name), a film time-code that scrubs with scroll, and four act
ticks on the right edge. A subtle "scroll" cue appears at the start and again
whenever the reader has been idle for a while.

---

## 5. Architecture & loading (step 5)

```
src/legacy/
  Legacy.jsx          gate (enter with / without sound), overlays, HUD, fallback
  legacy.css
  content.js          acts, narration and cue times — all copy lives here
  three/
    Stage.js          renderer, camera rig, post (bokeh, bloom, grain, flash), adaptive quality
    sculpts.js        SDF definitions: helmet shell + faceplate, mask, hood, armour
    sculpt.worker.js  meshes the sculpts off the main thread
    shading.js        shared GLSL: noise, erosion field, metal wear
    helmetSet.js      Act I–II: floor, helmet, reactor, shards, embers, dust
    doomSet.js        Act III–IV: hall, gears, figure, cloak, sigil, energy
    choreography.js   the single scrubbed timeline + forward-only cue track
  audio/
    Score.js          Web Audio synthesis: every sound in the film
```

* The route chunk loads on demand; three.js and the sets load after the gate
  paints. Sculpts are meshed in a worker while the reader reads the gate.
* Each set is hidden (and its shadow light disabled) when off screen; only one
  set renders at a time.
* Every geometry, material, texture and render target is disposed on unmount.
* React holds only the act index and the gate state; time-code, progress ticks
  and narration are written straight to the DOM by the timeline, so scrolling
  causes no React re-renders.

### Sound architecture

`Score` builds one `AudioContext` *only after* the reader presses **Enter with
sound** — nothing ever autoplays. Graph: sources → per-layer gains → a
generated-impulse convolution reverb and a dry bus → compressor → master gain
(mute). Continuous layers (warm drone, reactor hum, rumble, dark drone, gear
groans, energy hum) follow timeline values every frame with
`setTargetAtTime`, so they move exactly with the picture. One-shot cues
(heartbeats, startup, servo, metal impacts, footsteps, activation, final
impact) are fired by the cue track when the playhead crosses them forwards.
The heartbeat clock lives in the stage, so reactor flicker, eye glow and the
heart are one signal.

### Performance & accessibility

* Embers: 70 k points desktop / 20 k mobile. Shards and columns are instanced.
* Sculpt resolution, shadow map size, bloom and DOF scale with device class;
  an adaptive governor lowers pixel ratio and switches off DOF when frame time
  stays above 22 ms, and restores it when there is headroom.
* Portrait screens pull the camera back so subjects fit the narrow frame.
* `prefers-reduced-motion`: native scroll (no smoothing), no handheld drift,
  gentler reactor flicker, no flash, shorter embers drift.
* Flicker never exceeds 3 high-contrast changes per second (photosensitivity).
* No WebGL 2 → a typographic version of the full screenplay.
* Rendering pauses when the tab is hidden; audio suspends with it.

---

## 6. Build notes, testing & known limitations (steps 6–10)

**Built as designed**, with these deliberate deviations:

* **Vanilla three.js instead of React Three Fiber / Drei, CSS + GSAP instead of
  Framer Motion.** The repository already runs vanilla three.js under one GSAP
  timeline (`src/atelier`); adding a second renderer abstraction and a second
  animation system would have broken the "one timeline drives everything"
  guarantee and added ~150 kB for no visual gain.
* **Sound is synthesised, not sampled.** Every heartbeat, servo, footstep and
  impact is built from oscillators, filtered noise, modal metal partials and a
  generated convolution reverb. That makes licensing a non-issue and keeps the
  download at zero bytes of audio; the trade-off is a stylised rather than
  Foley-realistic palette.
* **Characters are stylised sculpts** (see §3). They are honest procedural
  representations designed to read in low light, silhouette and rim light —
  which is how the film stages them — not photoreal character models.

**Tested** (headless Chromium, software WebGL via SwiftShader, so frame times
are pessimistic): every shot from the first frame to the end frame at
1280×720 and 390×844 portrait; a forward pass with sound that fires every cue;
mute / unmute; replay (full reverse scrub); `prefers-reduced-motion`; and a
browser with WebGL disabled (typographic fallback). No runtime errors. Even on
the software rasteriser the adaptive governor held 20–50 ms frames; real GPUs
have far more headroom.

**Known limitations**

* Sculpting takes a few seconds (about 5 s of CPU work split across up to four
  workers on desktop; a coarser mesh on phones) behind the
  gate; meshes are not cached between visits.
* No screen-space reflections: the wet floors reflect lights and the
  environment, not other objects.
* Lightning is camera-facing ribbons regenerated on the CPU every ~90 ms; it is
  cheap but not volumetric.
* Audio cues fire only when scrolling forwards (by design); continuous layers
  follow in both directions.

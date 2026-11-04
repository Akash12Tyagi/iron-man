import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CARDS, DURATION, FINALE, LINES } from "../content.js";
import { HELMET_POS, REACTOR_POS } from "./helmetSet.js";
import { DOOM_ORIGIN, MASK_Y, ORB_REST, WALK_STEPS } from "./doomSet.js";

gsap.registerPlugin(ScrollTrigger);

/*
 * One scrubbed timeline for the whole film (12 units, 3 per act). Camera,
 * lights, particles, cloth, narration and audio levels are all tweens on it,
 * so they cannot drift apart. One-shot sounds live on a cue track that fires
 * only when the playhead crosses a cue moving forward.
 */

const D = (x, y, z) => ({ x: x + DOOM_ORIGIN.x, y: y + DOOM_ORIGIN.y, z: z + DOOM_ORIGIN.z });
const H = HELMET_POS;
const R = REACTOR_POS;

/** Camera key: position + target in world space. */
const key = (p, t, fov, roll = 0) => ({ px: p.x, py: p.y, pz: p.z, tx: t.x, ty: t.y, tz: t.z, fov, roll });

const WALK_FROM = 6.95;
const WALK_TO = 8.0;

export const CUES = [
  { t: 0.6, name: "spark" },
  { t: 0.78, name: "spark" },
  { t: 0.95, name: "spark" },
  { t: 1.08, name: "ignite" },
  { t: 1.72, name: "servo" },
  { t: 2.05, name: "servo" },
  { t: 2.62, name: "servo" },
  { t: 3.12, name: "lastBeat", arg: 0.8 },
  { t: 3.25, name: "powerdown" },
  { t: 3.48, name: "lastBeat", arg: 0.45 },
  { t: 3.62, name: "crack" },
  { t: 4.9, name: "water" },
  { t: 5.15, name: "ring" },
  { t: 6.04, name: "hall" },
  ...Array.from({ length: WALK_STEPS }, (_, i) => ({
    t: WALK_FROM + ((i + 1) / WALK_STEPS) * (WALK_TO - WALK_FROM),
    name: "footstep",
    arg: i,
  })),
  { t: 8.15, name: "cloth" },
  { t: 9.02, name: "activate" },
  { t: 9.8, name: "forge" },
  { t: 10.62, name: "surge" },
  { t: FINALE.doom.at, name: "impact" },
];

export function buildChoreography(stage, storyEl, overlay, { reducedMotion, onCue, onUpdate }) {
  const { cam, look } = stage;
  const HS = stage.helmet.state;
  const DS = stage.doom.state;
  const audio = { warm: 0, rumble: 0, dark: 0, gears: 0 };
  // Opening state: everything dark because nothing is lit, not because the
  // exposure is down.
  Object.assign(look, { exposure: 1, set: 0, env: 0.08, vignette: 1, dof: 1.4 });
  Object.assign(HS, { reactor: 0, rim: 0, eyes: 0, erode: 0 });

  let last = 0;
  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: storyEl,
      start: "top top",
      end: "bottom bottom",
      scrub: reducedMotion ? true : 1.1,
    },
    onUpdate() {
      const t = tl.time();
      if (t > last) {
        for (const c of CUES) if (c.t > last && c.t <= t) onCue(c);
      }
      last = t;
      onUpdate?.(t);
    },
  });
  tl.set({}, {}, DURATION); // fix the timeline length to the scroll length

  // ------------------------------------------------------------- camera
  const shots = {
    macro: key({ x: R.x - 0.035, y: R.y + 0.085, z: R.z + 0.16 }, { x: R.x, y: R.y + 0.01, z: R.z }, 26),
    macroIn: key({ x: R.x - 0.025, y: R.y + 0.065, z: R.z + 0.12 }, { x: R.x + 0.01, y: R.y + 0.012, z: R.z - 0.01 }, 26),
    helmet: key({ x: -0.2, y: 0.19, z: 0.7 }, { x: H.x - 0.01, y: H.y + 0.01, z: H.z }, 30),
    face: key({ x: -0.13, y: 0.16, z: 0.4 }, { x: H.x - 0.03, y: H.y + 0.015, z: H.z + 0.06 }, 28),
    faceIn: key({ x: -0.1, y: 0.152, z: 0.33 }, { x: H.x - 0.035, y: H.y + 0.015, z: H.z + 0.07 }, 28),
    pull: key({ x: 0.1, y: 0.48, z: 1.25 }, { x: 0, y: 0.22, z: -0.05 }, 34, 0.04),
    water: key({ x: R.x + 0.3, y: 0.42, z: R.z + 0.46 }, { x: R.x, y: 0.0, z: R.z }, 30, 0.01),
    waterIn: key({ x: R.x + 0.2, y: 0.27, z: R.z + 0.3 }, { x: R.x, y: 0.004, z: R.z }, 30, 0.0),
    hall: key(D(0.6, 0.35, 12.5), D(0, 1.2, -2), 36),
    hallIn: key(D(0.25, 0.45, 8.8), D(0, 1.15, -2), 36),
    walk: key(D(0, 0.85, 6.8), D(0, 1.25, -1.5), 32),
    walkIn: key(D(0, 0.95, 5.4), D(0, 1.3, -0.5), 32),
    side: key(D(6.0, 1.4, 5.2), D(0, 1.55, 0), 30),
    sideIn: key(D(1.9, 1.62, 2.7), D(0, 1.62, 0.05), 30),
    orb: key(D(-0.3, 0.17, ORB_REST.z + 0.34), D(0, 0.08, ORB_REST.z), 28),
    tilt: key(D(0.12, 1.05, 1.35), D(0, 1.6, 0.02), 30),
    mask: key(D(0.14, MASK_Y + 0.01, 0.66), D(0, MASK_Y - 0.005, 0.03), 24),
    maskIn: key(D(0.1, MASK_Y, 0.5), D(0, MASK_Y, 0.03), 24),
    monument: key(D(0, 2.5, 12.5), D(0, 2.0, 0), 40),
    end: key(D(0, 2.7, 13.5), D(0, 2.1, 0), 40),
  };
  Object.assign(cam, shots.macro);
  const move = (shot, at, dur, ease = "power2.inOut") => tl.to(cam, { ...shot, duration: dur, ease }, at);

  move(shots.macroIn, 0, 1.25, "sine.inOut");
  move(shots.helmet, 1.25, 0.9, "power2.inOut");
  move(shots.face, 2.15, 0.85, "sine.inOut");
  move(shots.faceIn, 3.0, 0.6, "sine.inOut"); // 2.1 — nearly still
  move(shots.pull, 3.6, 1.25, "power2.inOut");
  move(shots.water, 4.75, 0.35, "power2.inOut");
  move(shots.waterIn, 5.1, 0.7, "sine.out");
  tl.set(cam, shots.hall, 5.92);
  move(shots.hallIn, 5.92, 1.0, "sine.out");
  move(shots.walk, 6.92, 0.35, "power2.inOut");
  move(shots.walkIn, 7.27, 0.73, "sine.inOut");
  move(shots.side, 8.0, 0.2, "power2.inOut");
  move(shots.sideIn, 8.2, 0.75, "sine.inOut");
  tl.set(cam, shots.orb, 8.98);
  move(shots.tilt, 9.25, 0.55, "power2.inOut");
  move(shots.mask, 9.8, 0.35, "power2.out");
  move(shots.maskIn, 10.15, 0.45, "sine.inOut");
  move(shots.monument, 10.6, 0.85, "power3.inOut");
  move(shots.end, 11.45, 0.55, "sine.out");

  // Depth of field per shot.
  tl.set(look, { dof: 1.4 }, 0);
  tl.to(look, { dof: 0.7, duration: 0.6, ease: "sine.inOut" }, 1.2);
  tl.to(look, { dof: 0.5, duration: 0.4 }, 2.2);
  tl.to(look, { dof: 0.15, duration: 0.6 }, 3.6);
  tl.to(look, { dof: 0.45, duration: 0.3 }, 4.8);
  tl.to(look, { dof: 0, duration: 0.2 }, 5.7);
  tl.to(look, { dof: 0.35, duration: 0.3 }, 7.2);
  tl.to(look, { dof: 0.6, duration: 0.3 }, 8.1);
  tl.set(look, { dof: 1.4 }, 8.98);
  tl.to(look, { dof: 0.5, duration: 0.5 }, 9.3);
  tl.to(look, { dof: 0, duration: 0.4 }, 10.6);

  // -------------------------------------------------------- act I — light
  tl.fromTo(look, { heartRate: 0 }, { heartRate: 52, duration: 0.05, immediateRender: false }, 0.01);
  tl.to(look, { heartRate: 40, duration: 2.6, ease: "sine.inOut" }, 0.3);
  tl.to(look, { heartRate: 0, duration: 0.05 }, 2.98);
  tl.to(look, { env: 0.32, duration: 0.6 }, 1.1);
  // Ignition: three failed sparks, then a breathing glow.
  tl.to(HS, {
    keyframes: [
      { reactor: 0, duration: 0.6 },
      { reactor: 0.55, duration: 0.02 },
      { reactor: 0.03, duration: 0.05 },
      { reactor: 0, duration: 0.1 },
      { reactor: 0.7, duration: 0.02 },
      { reactor: 0.06, duration: 0.06 },
      { reactor: 0.02, duration: 0.09 },
      { reactor: 0.45, duration: 0.02 },
      { reactor: 0.12, duration: 0.06 },
      { reactor: 1, duration: 0.18, ease: "power2.out" },
    ],
  }, 0);
  tl.to(HS, { rim: 1, duration: 0.6, ease: "sine.inOut" }, 1.1);
  tl.to(HS, {
    keyframes: [
      { eyes: 0.6, duration: 0.05 },
      { eyes: 0.1, duration: 0.05 },
      { eyes: 0.9, duration: 0.3 },
    ],
  }, 1.45);
  tl.to(HS, { eyes: 0.6, duration: 0.6 }, 2.4);
  for (const at of [1.72, 2.05, 2.62]) {
    tl.to(HS, { twitch: 1, duration: 0.08, ease: "power2.out" }, at);
    tl.to(HS, { twitch: 0, duration: 0.14, ease: "bounce.out" }, at + 0.1);
  }
  tl.to(audio, { warm: 0.7, duration: 1.0, ease: "sine.inOut" }, 0.4);

  // ------------------------------------------------------ act II — silence
  tl.to(HS, {
    keyframes: [
      { reactor: 0.85, duration: 0.1 },
      { reactor: 0.15, duration: 0.04 },
      { reactor: 0.7, duration: 0.05 },
      { reactor: 0.06, duration: 0.08 },
      { reactor: 0.35, duration: 0.04 },
      { reactor: 0.0, duration: 0.22, ease: "power2.in" },
    ],
  }, 3.0);
  tl.to(HS, { eyes: 0, duration: 0.4, ease: "power2.in" }, 3.05);
  tl.to(HS, { rim: 0.18, duration: 0.6, ease: "sine.inOut" }, 3.05);
  tl.to(look, { env: 0.06, duration: 0.6 }, 3.05);
  tl.to(audio, { warm: 0, duration: 0.5, ease: "power2.in" }, 3.0);
  // Disintegration: mesh gone by ~4.8, last embers die at 5.6.
  tl.to(HS, { erode: 1, duration: 2.05, ease: "none" }, 3.6);
  tl.to(HS, { rim: 0.0, duration: 0.8 }, 4.4);
  tl.to(audio, { rumble: 0.9, duration: 0.5, ease: "sine.in" }, 3.55);
  tl.to(audio, { rumble: 0.25, duration: 0.7, ease: "sine.out" }, 4.6);
  tl.to(audio, { rumble: 0.0, duration: 0.4 }, 5.5);
  // The reactor laid on still water in a ring of petals; one last glow.
  tl.to(HS, { water: 1, duration: 0.55, ease: "sine.inOut" }, 4.55);
  tl.to(HS, { petals: 1, duration: 0.6, ease: "sine.out" }, 4.85);
  tl.to(HS, { keyframes: [{ reactor: 0.09, duration: 0.25, ease: "sine.inOut" }, { reactor: 0, duration: 0.35, ease: "sine.in" }] }, 5.0);
  tl.to(look, { env: 0.16, duration: 0.4 }, 4.7);
  tl.to(look, { exposure: 0, duration: 0.25, ease: "power1.in" }, 5.6);

  // ----------------------------------------------------- act III — unknown
  tl.set(look, { set: 1, env: 0.0, bloom: 1 }, 5.88);
  tl.to(look, { exposure: 1, duration: 0.45, ease: "sine.out" }, 5.95);
  tl.to(look, { env: 0.22, duration: 0.6 }, 5.95);
  tl.fromTo(DS, { hall: 0, shafts: 0, sigil: 0 }, { hall: 1, shafts: 0.6, sigil: 0.12, duration: 0.8, ease: "sine.inOut", immediateRender: false }, 5.95);
  tl.to(audio, { dark: 0.75, gears: 0.8, duration: 0.8, ease: "sine.inOut" }, 5.9);
  tl.fromTo(DS, { walk: 0 }, { walk: WALK_STEPS, duration: WALK_TO - WALK_FROM, ease: "none", immediateRender: false }, WALK_FROM);
  tl.to(DS, { rim: 1, duration: 0.3, ease: "power2.out" }, 8.0);
  tl.to(audio, { gears: 0.4, duration: 0.6 }, 8.0);

  // -------------------------------------------------- act IV — rise of doom
  tl.to(DS, { orb: 1, duration: 0.45, ease: "power3.out" }, 9.0);
  tl.to(DS, { orbRise: 1, duration: 0.75, ease: "power2.inOut" }, 9.05);
  tl.to(DS, { bolts: 1, duration: 0.3 }, 9.3);
  tl.to(DS, { sigil: 1, duration: 0.45, ease: "power2.inOut" }, 9.3);
  tl.to(DS, { front: 0.4, duration: 0.5, ease: "sine.inOut" }, 9.45);
  tl.to(DS, { eyes: 1, duration: 0.3 }, 10.2);
  // The forge: the mask is red-hot in the close-up and cools to iron.
  tl.fromTo(DS, { heat: 0 }, { heat: 1, duration: 0.05, immediateRender: false }, 9.76);
  tl.to(DS, { heat: 0, duration: 0.48, ease: "power1.out" }, 9.86);
  tl.to(DS, { hall: 0.7, duration: 0.5 }, 9.3);
  tl.to(audio, { dark: 0.4, duration: 0.5 }, 9.0);
  // The surge.
  tl.to(DS, { surge: 1, duration: 0.9, ease: "expo.out" }, 10.62);
  tl.to(DS, { wind: 1, duration: 0.25, ease: "power2.out" }, 10.62);
  tl.to(DS, { wind: 0.3, duration: 0.8, ease: "sine.inOut" }, 10.9);
  tl.to(DS, { sigil: 2.2, shafts: 2.4, hall: 1.6, gears: 3, front: 0.7, duration: 0.3, ease: "power2.out" }, 10.62);
  tl.to(DS, { shafts: 1.4, hall: 1.2, gears: 0.6, duration: 0.8, ease: "sine.inOut" }, 10.95);
  tl.to(look, { flash: 0.32, duration: 0.04 }, 10.62);
  tl.to(look, { flash: 0, duration: 0.35, ease: "power2.out" }, 10.66);
  tl.to(look, { flash: 0.12, duration: 0.03 }, FINALE.doom.at);
  tl.to(look, { flash: 0, duration: 0.3, ease: "power2.out" }, FINALE.doom.at + 0.03);
  tl.to(look, { shake: 1, duration: 0.05 }, 10.62);
  tl.to(look, { shake: 0, duration: 0.5, ease: "power2.out" }, 10.67);
  tl.to(look, { ember: 1, duration: 0.5, ease: "sine.in" }, 10.72);
  tl.to(DS, { bolts: 0.35, orb: 0.75, duration: 0.6 }, 11.1);
  tl.to(look, { exposure: 0.45, vignette: 1.3, duration: 0.5, ease: "sine.inOut" }, 11.5);
  tl.to(audio, { dark: 0.2, duration: 1.0 }, 11.0);

  // ----------------------------------------------------------- overlays
  const q = (sel) => overlay.querySelector(sel);
  const blurIn = (el, at, out, { y = 12, track = ["0.42em", "0.22em"] } = {}) => {
    tl.fromTo(
      el,
      { autoAlpha: 0, y, filter: "blur(10px)", letterSpacing: track[0] },
      { autoAlpha: 1, y: 0, filter: "blur(0px)", letterSpacing: track[1], duration: 0.16, ease: "power2.out" },
      at
    );
    if (out != null) tl.to(el, { autoAlpha: 0, y: -8, filter: "blur(6px)", duration: 0.14, ease: "power2.in" }, out - 0.14);
  };
  LINES.forEach((l, i) => blurIn(q(`[data-line="${i}"]`), l.at, l.out));
  CARDS.forEach((c, i) => blurIn(q(`[data-card="${i}"]`), c.at, c.out, { y: 0, track: ["0.9em", "0.6em"] }));
  blurIn(q("[data-final=era]"), FINALE.era.at, null, { y: 0, track: ["0.5em", "0.28em"] });
  tl.to(q("[data-final=era]"), { opacity: 0.75, duration: 0.3 }, FINALE.doom.at);
  tl.fromTo(
    q("[data-final=doom]"),
    { autoAlpha: 0, scale: 1.18, filter: "blur(16px)" },
    { autoAlpha: 1, scale: 1, filter: "blur(0px)", duration: 0.12, ease: "expo.out" },
    FINALE.doom.at
  );
  blurIn(q("[data-final=film]"), FINALE.film.at, null, { y: 0, track: ["1.2em", "0.62em"] });
  tl.fromTo(q("[data-final=note]"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, FINALE.note.at);
  // Letterbox closes in for the monument.
  tl.fromTo(overlay, { "--bars": 0 }, { "--bars": 1, duration: 0.6, ease: "power2.inOut" }, 10.6);

  return {
    tl,
    audio,
    kill() {
      tl.scrollTrigger?.kill();
      tl.kill();
    },
  };
}

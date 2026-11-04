import * as THREE from "three";
import { noise3, sdEllipsoid, sdRoundBox, sdTaper, smax, smin, surfaceNets } from "../../lib/sdf.js";

/*
 * Every solid in the film is a signed-distance sculpt, meshed with the
 * Surface Nets mesher in src/lib/sdf.js. These run in a
 * worker (sculpt.worker.js). Object space: y up, the face looks down +z,
 * metres. Shells have real thickness so torn edges and eye holes show an
 * interior instead of a paper-thin surface.
 *
 * Small helpers below extend sdf.js with rotated boxes, 2D (extruded)
 * shapes and an "emboss" that raises a 2D shape off an arbitrary surface.
 */

const ell = (p, cx, cy, cz, rx, ry, rz) => sdEllipsoid(p, { x: cx, y: cy, z: cz }, { x: rx, y: ry, z: rz });
const tap = (p, a, b, ra, rb) => sdTaper(p, { x: a[0], y: a[1], z: a[2] }, { x: b[0], y: b[1], z: b[2] }, ra, rb);
const q = new THREE.Vector3();

/** Box rotated by `ang` around z (in the xy plane). */
function boxZ(p, cx, cy, cz, hx, hy, hz, ang, r) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const x = p.x - cx;
  const y = p.y - cy;
  q.set(c * x + s * y, -s * x + c * y, p.z - cz);
  return sdRoundBox(q, { x: 0, y: 0, z: 0 }, { x: hx, y: hy, z: hz }, r);
}

/** Distance from (x, y) to the 2D segment a–b. */
function seg2(x, y, ax, ay, bx, by) {
  const px = x - ax;
  const py = y - ay;
  const ex = bx - ax;
  const ey = by - ay;
  const h = Math.min(1, Math.max(0, (px * ex + py * ey) / (ex * ex + ey * ey)));
  return Math.hypot(px - ex * h, py - ey * h);
}

/** Piecewise-linear lookup in a sorted [[y, value], …] table. */
function table(y, t) {
  if (y <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) {
    if (y <= t[i][0]) {
      const [y0, v0] = t[i - 1];
      const [y1, v1] = t[i];
      return v0 + ((v1 - v0) * (y - y0)) / (y1 - y0);
    }
  }
  return t[t.length - 1][1];
}

const shell = (outer, thick, k = 0.002) => smax(outer, -(outer + thick), k);

// ------------------------------------------------------------------ helmet
// Half-width of the faceplate outline at height y (front view).
const PLATE_W = [
  [-0.132, 0.03],
  [-0.1, 0.058],
  [-0.04, 0.08],
  [0.02, 0.087],
  [0.046, 0.083],
  [0.054, 0.034],
  [0.085, 0.022],
  [0.116, 0.015],
];

function helmetOuter(p) {
  let s = ell(p, 0, 0.025, -0.012, 0.1, 0.118, 0.126);
  s = smin(s, ell(p, 0, -0.045, 0.018, 0.088, 0.086, 0.108), 0.045);
  s = smin(s, ell(p, 0, -0.098, 0.05, 0.052, 0.036, 0.062), 0.03);
  s = smin(s, ell(p, 0, -0.078, -0.05, 0.086, 0.062, 0.088), 0.03);
  // Ear discs.
  const ax = Math.abs(p.x);
  q.set(ax, p.y, p.z);
  const disc = Math.max(Math.hypot(p.y + 0.002, p.z + 0.012) - 0.031, Math.abs(ax - 0.097) - 0.009);
  s = smin(s, disc, 0.006);
  return s;
}

function plateMask(p) {
  // Extruded 2D outline, front half only.
  const hw = p.y > 0.12 || p.y < -0.136 ? -0.02 : table(p.y, PLATE_W);
  let m = Math.abs(p.x) - hw;
  m = Math.max(m, p.y - 0.118, -0.136 - p.y);
  return Math.max(m, -0.005 - p.z);
}

function eyeCut(p) {
  const ax = Math.abs(p.x);
  q.set(ax, p.y, p.z);
  // Angular eye slit: outer end lifts, the slit narrows toward the nose.
  return boxZ(q, 0.04, 0.013, 0.13, 0.025, 0.0068, 0.07, 0.2, 0.002);
}

const TEAR = { x: -0.07, y: 0.082, z: 0.035 };

function tearCut(p) {
  const d = Math.hypot(p.x - TEAR.x, p.y - TEAR.y, p.z - TEAR.z);
  return d - 0.03 - 0.014 * (noise3(p.x * 70, p.y * 70, p.z * 70) - 0.5) - 0.006 * (noise3(p.x * 190, p.y * 190, p.z * 190) - 0.5);
}

export function helmetShellField(p) {
  const o = helmetOuter(p);
  let s = shell(o, 0.0075);
  // Under the faceplate the shell is cut away: the plate is the face.
  s = smax(s, -(plateMask(p) + 0.003), 0.002);
  // Crest grooves over the top.
  const crest = Math.max(Math.abs(Math.abs(p.x) - 0.03) - 0.0019, -(o + 0.003), 0.055 - p.y, -0.06 - p.z);
  s = smax(s, -crest, 0.0015);
  // Ear disc inset ring.
  const ring = Math.max(Math.abs(Math.hypot(p.y + 0.002, p.z + 0.012) - 0.022) - 0.0018, -(o + 0.0025));
  s = smax(s, -ring, 0.0012);
  // Open neck.
  s = smax(s, -(p.y + 0.128) - 0.02 * Math.max(0, -p.z - 0.02), 0.004);
  s = smax(s, -tearCut(p), 0.003);
  return s;
}

export function faceplateField(p) {
  const o = helmetOuter(p);
  let s = Math.abs(o + 0.0005) - 0.0058;
  s = smax(s, plateMask(p), 0.002);
  s = smax(s, -eyeCut(p), 0.0015);
  // Mouth line and cheek seams.
  const mouth = Math.max(Math.abs(p.x) - 0.027, Math.abs(p.y + 0.074) - 0.0021, 0.05 - p.z);
  s = smax(s, -mouth, 0.001);
  const ax = Math.abs(p.x);
  const cheek = Math.max(seg2(ax, p.y, 0.058, -0.004, 0.036, -0.072) - 0.0021, -(o + 0.0035), 0.04 - p.z);
  s = smax(s, -cheek, 0.001);
  const jaw = Math.max(seg2(ax, p.y, 0.036, -0.072, 0.03, -0.118) - 0.002, -(o + 0.0035), 0.04 - p.z);
  s = smax(s, -jaw, 0.001);
  // A dent across the right cheek.
  const dd = (p.x - 0.052) ** 2 + (p.y + 0.035) ** 2 + (p.z - 0.088) ** 2;
  s += 0.0045 * Math.exp(-dd / 0.00035);
  s = smax(s, -tearCut(p), 0.003);
  return s;
}

/** Where the eye slits sit on the plate, for the glow lenses. */
export function helmetAnchors() {
  return {
    eyes: [
      { x: 0.04, y: 0.013, z: findFront(faceplateField, 0.055, 0.006) - 0.007, ang: 0.2 },
      { x: -0.04, y: 0.013, z: findFront(faceplateField, -0.055, 0.006) - 0.007, ang: -0.2 },
    ],
  };
}

/** March along -z at (x, y) to the first surface (front face). */
function findFront(field, x, y, z0 = 0.25) {
  const p = new THREE.Vector3(x, y, z0);
  for (let i = 0; i < 400; i++) {
    const d = field(p);
    if (d < 0.0005) return p.z;
    p.z -= Math.max(d * 0.8, 0.0004);
  }
  return 0;
}

// ------------------------------------------------------------- doom's mask
function maskOuter(p) {
  let s = ell(p, 0, 0, -0.02, 0.079, 0.118, 0.1);
  const ax = Math.abs(p.x);
  // Facets: a flat front, chamfered cheeks and jaw.
  s = smax(s, p.z - 0.074, 0.012);
  s = smax(s, (ax * 0.55 + p.z * 0.835) - 0.083, 0.008);
  s = smax(s, (ax * 0.38 - p.y * 0.42 + p.z * 0.82) - 0.09, 0.01);
  // Brow ridge: two angled bars meeting low over the nose.
  q.set(ax, p.y, p.z);
  const brow = smax(boxZ(q, 0.036, 0.036, 0.066, 0.038, 0.0075, 0.012, 0.16, 0.004), ell(p, 0, 0, -0.02, 0.083, 0.122, 0.112), 0.006);
  s = smin(s, brow, 0.01);
  // Nose ridge and cheekbones.
  s = smin(s, tap(p, [0, 0.03, 0.07], [0, -0.026, 0.082], 0.008, 0.012), 0.012);
  s = smin(s, ell(q, 0.046, -0.018, 0.052, 0.026, 0.014, 0.02), 0.012);
  return s;
}

function emboss(p, outer, d2, h) {
  return Math.max(d2, outer - h, -(outer + 0.004));
}

export function maskField(p) {
  const o = maskOuter(p);
  let s = shell(o, 0.008);
  s = smax(s, -0.045 - p.z, 0.004); // open behind; the hood covers the rest
  const ax = Math.abs(p.x);
  // Border rim and rivets.
  const ex = ax / 0.071;
  const ey = p.y / 0.108;
  const er = Math.hypot(ex, ey);
  const ring = Math.abs(er - 1) * 0.07 - 0.0028;
  s = smin(s, emboss(p, o, Math.max(ring, 0.01 - p.z), 0.0022), 0.0015);
  let rivet = Infinity;
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI;
    const rx = Math.cos(a) * 0.0635;
    const ry = Math.sin(a) * 0.098;
    rivet = Math.min(rivet, Math.hypot(ax - rx, p.y - ry) - 0.0034);
  }
  s = smin(s, emboss(p, o, Math.max(rivet, 0.005 - p.z), 0.0034), 0.0012);
  // Eye holes, slanted down toward the nose.
  q.set(ax, p.y, p.z);
  s = smax(s, -boxZ(q, 0.031, 0.015, 0.09, 0.019, 0.0078, 0.06, -0.13, 0.002), 0.0015);
  // Mouth: a recessed band with five vertical slots.
  const band = Math.max(Math.abs(p.x) - 0.033, Math.abs(p.y + 0.062) - 0.012, -(o + 0.0035), 0.03 - p.z);
  s = smax(s, -band, 0.002);
  let slots = Infinity;
  for (let i = -2; i <= 2; i++) slots = Math.min(slots, Math.max(Math.abs(p.x - i * 0.0125) - 0.0031, Math.abs(p.y + 0.062) - 0.0082));
  s = smax(s, -Math.max(slots, 0.03 - p.z), 0.0012);
  // Cheek seams.
  const seam = Math.max(seg2(ax, p.y, 0.06, -0.005, 0.041, -0.088) - 0.0016, -(o + 0.0025), 0.02 - p.z);
  s = smax(s, -seam, 0.001);
  return s;
}

export function maskAnchors() {
  return {
    eyes: [
      { x: 0.031, y: 0.015, z: findFront(maskField, 0.031, 0.03) - 0.012 },
      { x: -0.031, y: 0.015, z: findFront(maskField, -0.031, 0.03) - 0.012 },
    ],
  };
}

// --------------------------------------------------------------------- hood
// Origin at the mask's centre. The drape flows down into the cloak's mantle.
export function hoodField(p) {
  let o = ell(p, 0, 0.032, -0.03, 0.124, 0.152, 0.152);
  o = smin(o, ell(p, 0, 0.082, 0.04, 0.102, 0.076, 0.092), 0.05);
  o = smin(o, ell(p, 0, -0.2, -0.04, 0.25, 0.085, 0.17), 0.1);
  o = smin(o, tap(p, [0, -0.06, -0.05], [0, -0.2, -0.05], 0.115, 0.16), 0.06);
  // Folds radiating from the crown and gathering at the shoulders.
  const a = Math.atan2(p.x, p.z);
  const drape = THREE.MathUtils.smoothstep(0.02, -0.18, p.y);
  o += 0.0055 * Math.sin(a * 9 + p.y * 18) * drape;
  o += 0.004 * Math.sin(a * 5 - p.y * 30 + 1.3) * (1 - drape) * THREE.MathUtils.smoothstep(-0.05, 0.12, p.z);
  o += 0.003 * (noise3(p.x * 40, p.y * 40, p.z * 40) - 0.5);
  let s = shell(o, 0.014, 0.004);
  // Face opening and the open bottom edge.
  s = smax(s, -ell(p, 0, -0.012, 0.135, 0.09, 0.13, 0.16), 0.02);
  s = smax(s, -(p.y + 0.27), 0.01);
  return s;
}

// ------------------------------------------------------------------ armour
// Figure space: feet at y = 0, the mask centre at y = 1.72.
export function torsoField(p) {
  const ax = Math.abs(p.x);
  q.set(ax, p.y, p.z);
  let s = ell(p, 0, 1.3, 0.0, 0.19, 0.2, 0.12);
  s = smin(s, ell(q, 0.075, 1.33, 0.05, 0.095, 0.085, 0.085), 0.03); // chest plates
  s = smin(s, tap(p, [0, 1.12, 0.0], [0, 1.0, 0.0], 0.135, 0.145), 0.05); // waist
  s = smin(s, tap(p, [0, 1.5, -0.01], [0, 1.62, -0.01], 0.07, 0.055), 0.03); // gorget
  // Segmented abdomen: shallow grooves between plates, front only.
  const o = s;
  for (const y of [1.17, 1.11, 1.05]) {
    s = smax(s, -Math.max(Math.abs(p.y - y) - 0.004, -(o + 0.006), -p.z), 0.003);
  }
  // Plate seams across the chest and down either side of the sternum.
  for (const y of [1.24, 1.4]) s = smax(s, -Math.max(Math.abs(p.y - y) - 0.0035, -(o + 0.006), -p.z), 0.003);
  s = smax(s, -Math.max(Math.abs(ax - 0.085) - 0.0035, -(o + 0.006), -p.z, p.y - 1.46, 1.18 - p.y), 0.003);
  // Sternum groove and the chest seam.
  s = smax(s, -Math.max(Math.abs(p.x) - 0.004, Math.abs(p.y - 1.3) - 0.08, 0.06 - p.z), 0.003);
  // Belt with a round buckle disc.
  const belt = Math.max(Math.hypot(p.x / 1.0, p.z / 0.85) - 0.152, Math.abs(p.y - 0.975) - 0.03);
  s = smin(s, belt, 0.008);
  const disc = Math.max(Math.hypot(p.x, p.y - 0.975) - 0.042, Math.abs(p.z - 0.13) - 0.012);
  s = smin(s, disc, 0.006);
  s = smax(s, -Math.max(Math.abs(Math.hypot(p.x, p.y - 0.975) - 0.028) - 0.003, 0.135 - p.z), 0.002);
  // Hips.
  s = smin(s, ell(p, 0, 0.92, 0, 0.16, 0.09, 0.11), 0.04);
  return s;
}

/** One armoured leg, hip at the origin, foot pointing +z. side = ±1. */
export function legField(p) {
  let s = tap(p, [0, 0, 0], [0.005, -0.43, 0.005], 0.085, 0.06);
  s = smin(s, ell(p, 0.005, -0.44, 0.03, 0.06, 0.05, 0.055), 0.02); // knee cop
  s = smin(s, tap(p, [0.005, -0.45, 0], [0.005, -0.84, -0.01], 0.058, 0.045), 0.02);
  // Boot.
  s = smin(s, ell(p, 0.005, -0.88, 0.04, 0.055, 0.045, 0.12), 0.03);
  s = smax(s, -(p.y + 0.915), 0.004);
  // Greave ridge.
  s = smin(s, Math.max(Math.abs(p.x - 0.005) - 0.006, Math.abs(p.y + 0.64) - 0.17, p.z - 0.062, 0.03 - p.z), 0.006);
  return s;
}

// ------------------------------------------------------------------ meshing
const box = (x0, y0, z0, x1, y1, z1) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));

/** Each sculpt as an independent job, so several workers can share them. */
export const JOBS = {
  helmet: (k) => surfaceNets(helmetShellField, box(-0.12, -0.15, -0.16, 0.12, 0.16, 0.15), 0.0024 * k),
  faceplate: (k) => surfaceNets(faceplateField, box(-0.1, -0.15, -0.02, 0.1, 0.13, 0.14), 0.0019 * k),
  mask: (k) => surfaceNets(maskField, box(-0.09, -0.13, -0.06, 0.09, 0.13, 0.1), 0.0017 * k),
  hood: (k) => surfaceNets(hoodField, box(-0.28, -0.3, -0.22, 0.28, 0.2, 0.2), 0.0042 * k),
  torso: (k) => surfaceNets(torsoField, box(-0.23, 0.82, -0.16, 0.23, 1.66, 0.2), 0.0065 * k),
  leg: (k) => surfaceNets(legField, box(-0.1, -0.93, -0.1, 0.1, 0.1, 0.18), 0.007 * k),
};

/** quality 1 = desktop, ~0.6 = mobile. Synchronous; the worker runs JOBS. */
export function sculptAll(quality = 1) {
  const geos = {};
  for (const [name, job] of Object.entries(JOBS)) geos[name] = job(1 / quality);
  return { geos, anchors: anchors() };
}

export function anchors() {
  return { helmet: helmetAnchors(), mask: maskAnchors() };
}

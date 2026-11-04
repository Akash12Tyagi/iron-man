import * as THREE from "three";
import { NOISE, glowTexture, mulberry, wear } from "./shading.js";

/*
 * Acts III–IV. A gothic-mechanical hall far from the first set. A cloaked
 * figure walks out of the green haze, stops, and calls up a sphere of energy
 * whose light — from below, like the reactor's — reveals the iron mask. Then
 * the sphere surges: a shockwave crosses the floor, the cloak billows, every
 * shaft ignites.
 *
 * Local space: the figure stands at the origin facing +z, the camera comes
 * from +z. The stage places the whole set at DOOM_ORIGIN.
 */

export const DOOM_ORIGIN = new THREE.Vector3(0, 0, -60);
export const MASK_Y = 1.72;
export const ORB_REST = new THREE.Vector3(0, 1.2, 0.5);
const STEP = 0.56;
export const WALK_STEPS = 6;
export const WALK_START_Z = -STEP * WALK_STEPS;
const GREEN = new THREE.Color("#22e07a");

// --------------------------------------------------------------- textures
function stoneTexture(size = 1024) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const rand = mulberry(11);
  g.fillStyle = "#3a3c3d";
  g.fillRect(0, 0, size, size);
  const n = 4;
  const t = size / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = 46 + rand() * 30;
      g.fillStyle = `rgb(${v},${v + 2},${v + 1})`;
      g.fillRect(x * t + 4, y * t + 4, t - 8, t - 8);
      // Mottling and wear.
      for (let k = 0; k < 140; k++) {
        const r = 4 + rand() * 40;
        const a = rand() * 0.08;
        g.fillStyle = rand() > 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.6})`;
        g.beginPath();
        g.arc(x * t + rand() * t, y * t + rand() * t, r, 0, Math.PI * 2);
        g.fill();
      }
      // A few cracks.
      g.strokeStyle = "rgba(0,0,0,0.35)";
      g.lineWidth = 1.5;
      for (let k = 0; k < 2; k++) {
        if (rand() > 0.55) continue;
        g.beginPath();
        let px = x * t + rand() * t;
        let py = y * t + rand() * t;
        g.moveTo(px, py);
        for (let s = 0; s < 6; s++) {
          px += (rand() - 0.5) * 50;
          py += (rand() - 0.5) * 50;
          g.lineTo(px, py);
        }
        g.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ------------------------------------------------------------- geometries
function gearShape(R, teeth, depth, hole) {
  const s = new THREE.Shape();
  const N = teeth * 4;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const k = i % 4;
    const r = k === 1 || k === 2 ? R : R - depth;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  const h = new THREE.Path();
  h.absarc(0, 0, hole, 0, Math.PI * 2, true);
  s.holes.push(h);
  // Spoke windows.
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2 + 0.12;
    const a1 = a0 + Math.PI / 3 - 0.24;
    const r0 = hole + R * 0.12;
    const r1 = R - depth - R * 0.1;
    const w = new THREE.Path();
    w.absarc(0, 0, r1, a0, a1, false);
    w.absarc(0, 0, r0, a1, a0, true);
    s.holes.push(w);
  }
  return s;
}

function columnGeometry(h) {
  const parts = [];
  const base = new THREE.BoxGeometry(1.2, 0.6, 1.2);
  base.translate(0, 0.3, 0);
  parts.push(base);
  const plinth = new THREE.CylinderGeometry(0.62, 0.7, 0.3, 24);
  plinth.translate(0, 0.75, 0);
  parts.push(plinth);
  // A clustered shaft: a core and four engaged colonnettes.
  const core = new THREE.CylinderGeometry(0.42, 0.44, h - 1.6, 24);
  core.translate(0, 0.9 + (h - 1.6) / 2, 0);
  parts.push(core);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const c = new THREE.CylinderGeometry(0.14, 0.14, h - 1.6, 12);
    c.translate(Math.cos(a) * 0.46, 0.9 + (h - 1.6) / 2, Math.sin(a) * 0.46);
    parts.push(c);
  }
  // Iron bands.
  for (const y of [2.2, 4.4]) {
    const b = new THREE.TorusGeometry(0.5, 0.05, 8, 32);
    b.rotateX(Math.PI / 2);
    b.translate(0, y, 0);
    parts.push(b);
  }
  const cap = new THREE.CylinderGeometry(0.8, 0.5, 0.7, 24);
  cap.translate(0, h - 0.35, 0);
  parts.push(cap);
  return mergeInto(parts);
}

function mergeInto(parts) {
  // Minimal merge (position + normal + index) to keep the import list small.
  let vCount = 0;
  let iCount = 0;
  const nonIndexed = parts.map((p) => (p.index ? p : p.toNonIndexed()));
  for (const p of nonIndexed) {
    vCount += p.attributes.position.count;
    iCount += p.index ? p.index.count : p.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const p of nonIndexed) {
    pos.set(p.attributes.position.array, vo * 3);
    nor.set(p.attributes.normal.array, vo * 3);
    if (p.index) {
      for (let i = 0; i < p.index.count; i++) idx[io + i] = p.index.array[i] + vo;
      io += p.index.count;
    } else {
      for (let i = 0; i < p.attributes.position.count; i++) idx[io + i] = vo + i;
      io += p.attributes.position.count;
    }
    vo += p.attributes.position.count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

/** Catmull-Rom through keyframes [[v, a, b, …], …] at parameter v. */
function keyed(keys, v) {
  let i = 0;
  while (i < keys.length - 2 && v > keys[i + 1][0]) i++;
  const k0 = keys[Math.max(0, i - 1)];
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const k3 = keys[Math.min(keys.length - 1, i + 2)];
  const t = (v - k1[0]) / (k2[0] - k1[0]);
  const t2 = t * t;
  const t3 = t2 * t;
  return k1.map((_, j) => {
    if (j === 0) return v;
    const p0 = k0[j];
    const p1 = k1[j];
    const p2 = k2[j];
    const p3 = k3[j];
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  });
}

/**
 * The cloak: a surface of revolution open at the front, from the collar to
 * the floor, with folds deepening toward the hem. aV runs collar → hem, aU
 * edge → around the back → edge.
 */
function cloakGeometry(nu, nv) {
  //           v     y     rx    rz    open  fold
  const keys = [
    [0.0, 1.6, 0.1, 0.1, 0.55, 0.0],
    [0.06, 1.53, 0.24, 0.165, 0.55, 0.0],
    [0.13, 1.42, 0.295, 0.2, 0.32, 0.012],
    [0.4, 1.0, 0.33, 0.235, 0.4, 0.035],
    [0.75, 0.45, 0.4, 0.31, 0.82, 0.055],
    [1.0, 0.015, 0.46, 0.37, 0.92, 0.07],
  ];
  const pos = [];
  const uv = [];
  const av = [];
  const au = [];
  const rand = mulberry(9);
  const phases = Array.from({ length: 4 }, () => rand() * 6.28);
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    const [, y, rx, rz, open, fold] = keyed(keys, v);
    for (let i = 0; i <= nu; i++) {
      const s = i / nu;
      const a = open + (Math.PI * 2 - 2 * open) * s;
      const f =
        fold *
        (Math.sin(a * 11 + phases[0] + v * 2.3) * 0.65 +
          Math.sin(a * 5 + phases[1] - v * 1.2) * 0.35 +
          Math.sin(a * 23 + phases[2] + v * 4.0) * 0.15);
      const edge = Math.min(s, 1 - s);
      const curl = 1 - 0.06 * Math.exp(-edge * 40) * v;
      const r = (1 + f) * curl;
      pos.push(Math.sin(a) * rx * r, y + fold * 0.3 * Math.sin(a * 11 + phases[3]), Math.cos(a) * rz * r);
      uv.push(s, v);
      av.push(v);
      au.push(s);
    }
  }
  const idx = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      const b = a + 1;
      const c = a + nu + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aV", new THREE.Float32BufferAttribute(av, 1));
  g.setAttribute("aU", new THREE.Float32BufferAttribute(au, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const CLOTH_VERTEX = /* glsl */ `
  #include <begin_vertex>
  {
    float v = aV;
    vec3 radial = normalize(vec3(transformed.x, 0.0, transformed.z) + 1e-5);
    vec3 sway = vec3(sin(uTime * 0.6 + v * 2.2 + aU * 1.5) * 0.014, 0.0, cos(uTime * 0.5 + v * 1.7 + aU * 2.0) * 0.012) * v * v * uSway;
    sway += radial * uFlare * 0.05 * v * v;
    sway.z -= uFlare * 0.03 * v * v;
    float rip = sin(v * 9.0 - uTime * 6.0 + aU * 8.0);
    sway += vec3(0.0, 0.0, -1.0) * uWind * v * v * (0.32 + 0.08 * rip);
    sway += radial * uWind * v * (0.1 + 0.03 * rip);
    sway.y += uWind * v * v * 0.12;
    transformed += sway;
  }
`;

function clothPatch(material, uniforms, key) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aV; attribute float aU; uniform float uTime; uniform float uSway; uniform float uFlare; uniform float uWind;"
      )
      .replace("#include <begin_vertex>", CLOTH_VERTEX);
  };
  material.customProgramCacheKey = () => key;
  return material;
}

// -------------------------------------------------------------------- set
export class DoomSet {
  constructor({ geos, anchors, lowPower, reducedMotion }) {
    this.group = new THREE.Group();
    this.group.position.copy(DOOM_ORIGIN);
    this.lowPower = lowPower;
    this.reducedMotion = reducedMotion;
    this.state = {
      hall: 0, // ambient green: window, shafts, rims
      walk: 0, // footsteps taken, 0 … WALK_STEPS
      flare: 0, // cloak kick on a footfall
      rim: 0,
      front: 0, // the cold front fill used only for the reveal
      orbRise: 0,
      orb: 0,
      bolts: 0,
      surge: 0, // shockwave progress 0 … 1
      sigil: 0,
      wind: 0,
      eyes: 0,
      shafts: 0,
      gears: 1,
    };
    this.u = {
      uTime: { value: 0 },
      uSway: { value: reducedMotion ? 0.3 : 1 },
      uFlare: { value: 0 },
      uWind: { value: 0 },
      uScale: { value: 800 },
    };
    this._disposables = [];
    this.rand = mulberry(42);

    this._hall();
    this._figure(geos, anchors);
    this._sigil();
    this._energy();
    this._atmosphere();
    this._lights();
  }

  _keep(...things) {
    this._disposables.push(...things);
    return things[0];
  }

  _hall() {
    const g = this.group;
    const stone = this._keep(stoneTexture(this.lowPower ? 512 : 1024));
    stone.repeat.set(10, 10);
    stone.anisotropy = 8;
    const floorMat = this._keep(
      new THREE.MeshStandardMaterial({ map: stone, color: "#5b5f5e", roughness: 0.6, metalness: 0.15, bumpMap: stone, bumpScale: 1.2 })
    );
    floorMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vW;")
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nvarying vec3 vW;\n${NOISE}`)
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
          float wet = smoothstep(0.1, 0.5, fbm3(vW * 0.35) * 0.5 + 0.35);
          roughnessFactor = mix(roughnessFactor, 0.42, wet);
          diffuseColor.rgb *= mix(1.0, 0.6, wet);`
        );
    };
    const floor = new THREE.Mesh(this._keep(new THREE.PlaneGeometry(40, 40)), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);

    const ironMat = this._keep(
      wear(new THREE.MeshPhysicalMaterial({ color: "#2a2d30", metalness: 0.75, roughness: 0.5 }), {
        scorch: 0.5,
        scratch: 0.3,
        scale: 0.6,
        key: "hall-iron",
      })
    );
    this.ironMat = ironMat;

    // Two rows of columns, joined by arches.
    const H = 9;
    const zs = [11, 6.5, 2, -2.5];
    const colGeo = this._keep(columnGeometry(H));
    const cols = new THREE.InstancedMesh(colGeo, ironMat, zs.length * 2);
    const m = new THREE.Matrix4();
    let i = 0;
    for (const z of zs) {
      for (const x of [-3.4, 3.4]) {
        m.makeTranslation(x, 0, z);
        cols.setMatrixAt(i++, m);
      }
    }
    cols.castShadow = true;
    cols.receiveShadow = true;
    g.add(cols);
    const archGeo = this._keep(new THREE.TorusGeometry(2.25, 0.22, 10, 40, Math.PI));
    const arches = new THREE.InstancedMesh(archGeo, ironMat, (zs.length - 1) * 2 + zs.length);
    i = 0;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    for (let k = 0; k < zs.length - 1; k++) {
      for (const x of [-3.4, 3.4]) {
        m.compose(new THREE.Vector3(x, H, (zs[k] + zs[k + 1]) / 2), q, new THREE.Vector3(1, 1.3, 1));
        arches.setMatrixAt(i++, m);
      }
    }
    for (const z of zs) {
      m.compose(new THREE.Vector3(0, H, z), new THREE.Quaternion(), new THREE.Vector3(1.5, 1.7, 1));
      arches.setMatrixAt(i++, m);
    }
    g.add(arches);

    // Back wall with a rose window; side walls with pipe runs.
    const wallMat = this._keep(new THREE.MeshStandardMaterial({ color: "#151718", roughness: 0.85, metalness: 0.2 }));
    const back = new THREE.Mesh(this._keep(new THREE.PlaneGeometry(30, 20)), wallMat);
    back.position.set(0, 10, -6.2);
    g.add(back);
    for (const x of [-7.5, 7.5]) {
      const side = new THREE.Mesh(this._keep(new THREE.PlaneGeometry(40, 20)), wallMat);
      side.position.set(x, 10, 2);
      side.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(side);
    }
    const ring = new THREE.Mesh(this._keep(new THREE.TorusGeometry(3.1, 0.28, 16, 96)), ironMat);
    ring.position.set(0, 4.2, -6.0);
    g.add(ring);
    const tracery = new THREE.Group();
    tracery.position.copy(ring.position);
    const barGeo = this._keep(new THREE.BoxGeometry(0.12, 3.0, 0.12));
    barGeo.translate(0, 1.5, 0);
    for (let k = 0; k < 12; k++) {
      const b = new THREE.Mesh(barGeo, ironMat);
      b.rotation.z = (k / 12) * Math.PI * 2;
      tracery.add(b);
    }
    const inner = new THREE.Mesh(this._keep(new THREE.TorusGeometry(1.2, 0.1, 10, 64)), ironMat);
    tracery.add(inner);
    g.add(tracery);

    this.windowMat = this._keep(
      new THREE.ShaderMaterial({
        uniforms: { uTime: this.u.uTime, uI: { value: 0 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform float uI; varying vec2 vUv;
          ${NOISE}
          void main(){
            vec2 p = vUv * 2.0 - 1.0; float r = length(p);
            float n = fbm3(vec3(p * 2.2, uTime * 0.05)) * 0.5 + 0.5;
            float glow = smoothstep(1.0, 0.0, r) * (0.55 + 0.6 * n);
            vec3 c = mix(vec3(0.02, 0.35, 0.16), vec3(0.55, 1.0, 0.75), pow(smoothstep(0.75, 0.0, r), 2.0));
            gl_FragColor = vec4(c * glow * uI * 2.2, 1.0);
          }`,
      })
    );
    const win = new THREE.Mesh(this._keep(new THREE.CircleGeometry(3.05, 64)), this.windowMat);
    win.position.set(0, 4.2, -6.1);
    g.add(win);

    // Gears in the dark behind the columns.
    this.gears = [];
    const gearDefs = [
      { R: 2.3, teeth: 26, x: -5.4, y: 3.4, z: -5.8, speed: 0.05 },
      { R: 2.3, teeth: 26, x: 5.4, y: 3.4, z: -5.8, speed: -0.05 },
      { R: 3.2, teeth: 36, x: 0, y: 9.6, z: -5.9, speed: -0.035 },
      { R: 1.1, teeth: 14, x: 3.15, y: 6.9, z: -5.7, speed: 0.11 },
      { R: 1.1, teeth: 14, x: -3.15, y: 6.9, z: -5.7, speed: -0.11 },
    ];
    for (const d of gearDefs) {
      const geo = this._keep(
        new THREE.ExtrudeGeometry(gearShape(d.R, d.teeth, d.R * 0.09, d.R * 0.14), {
          depth: 0.25,
          bevelEnabled: true,
          bevelSize: 0.03,
          bevelThickness: 0.03,
          bevelSegments: 1,
          curveSegments: 6,
        })
      );
      const mesh = new THREE.Mesh(geo, ironMat);
      mesh.position.set(d.x, d.y, d.z);
      mesh.userData.speed = d.speed;
      g.add(mesh);
      this.gears.push(mesh);
    }

    // Pipes up the side walls.
    const pipeGeo = this._keep(new THREE.CylinderGeometry(0.16, 0.16, 18, 16));
    const pipes = new THREE.InstancedMesh(pipeGeo, ironMat, 10);
    i = 0;
    for (const x of [-6.9, 6.9]) {
      for (let k = 0; k < 5; k++) {
        m.makeTranslation(x + (x < 0 ? 0.25 : -0.25) * (k % 2), 9, -4.5 + k * 0.45 + (k > 2 ? 9 : 0));
        pipes.setMatrixAt(i++, m);
      }
    }
    g.add(pipes);
  }

  _figure(geos, anchors) {
    const fig = new THREE.Group();
    this.group.add(fig);
    this.figure = fig;

    const gun = this._keep(
      wear(new THREE.MeshPhysicalMaterial({ color: "#2b2e32", metalness: 0.9, roughness: 0.48, clearcoat: 0.15 }), {
        scorch: 0.35,
        scratch: 0.5,
        scale: 0.8,
        key: "doom-gun",
      })
    );
    const silver = this._keep(
      wear(new THREE.MeshPhysicalMaterial({ color: "#a5aaae", metalness: 1, roughness: 0.3, clearcoat: 0.25, clearcoatRoughness: 0.35 }), {
        scorch: 0.3,
        scratch: 0.65,
        scale: 1,
        key: "doom-mask",
      })
    );
    const wool = (color, sheen) =>
      this._keep(
        new THREE.MeshPhysicalMaterial({
          color,
          roughness: 0.88,
          metalness: 0,
          sheen: 0.4,
          sheenRoughness: 0.55,
          sheenColor: new THREE.Color(sheen),
          side: THREE.DoubleSide,
        })
      );
    const cloakMat = clothPatch(wool("#0b2e19", "#2f8a55"), this.u, "cloak");
    const hoodMat = wool("#0a2a17", "#2f8a55");

    const torso = new THREE.Mesh(geos.torso, gun);
    torso.castShadow = true;
    torso.receiveShadow = true;
    fig.add(torso);

    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(0.1 * side, 0.93, 0);
      const leg = new THREE.Mesh(geos.leg, gun);
      leg.castShadow = true;
      hip.add(leg);
      fig.add(hip);
      return hip;
    });

    const head = new THREE.Group();
    head.position.set(0, MASK_Y, 0.02);
    fig.add(head);
    this.head = head;
    const blocker = new THREE.Mesh(this._keep(new THREE.SphereGeometry(1, 24, 16)), this._keep(new THREE.MeshBasicMaterial({ color: "#000000" })));
    blocker.scale.set(0.068, 0.1, 0.075);
    blocker.position.z = -0.02;
    head.add(blocker);
    const mask = new THREE.Mesh(geos.mask, silver);
    mask.castShadow = true;
    mask.receiveShadow = true;
    head.add(mask);
    const hood = new THREE.Mesh(geos.hood, hoodMat);
    hood.castShadow = true;
    hood.receiveShadow = true;
    head.add(hood);
    this.eyeMat = this._keep(
      new THREE.SpriteMaterial({ map: this._keep(glowTexture(32, 2)), color: GREEN.clone(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })
    );
    for (const e of anchors.mask.eyes) {
      const s = new THREE.Sprite(this.eyeMat);
      s.position.set(e.x, e.y, e.z - 0.006);
      s.scale.set(0.022, 0.012, 1);
      head.add(s);
    }

    const cloakGeo = this._keep(cloakGeometry(this.lowPower ? 90 : 150, this.lowPower ? 50 : 80));
    const cloak = new THREE.Mesh(cloakGeo, cloakMat);
    cloak.castShadow = true;
    cloak.receiveShadow = true;
    const depth = this._keep(clothPatch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), this.u, "cloak-depth"));
    cloak.customDepthMaterial = depth;
    fig.add(cloak);
  }

  _sigil() {
    this.sigilMat = this._keep(
      new THREE.ShaderMaterial({
        uniforms: { uTime: this.u.uTime, uI: { value: 0 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform float uI; varying vec2 vUv;
          float ring(float r, float c, float w){ return smoothstep(w, 0.0, abs(r - c)); }
          void main(){
            vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = atan(p.y, p.x);
            float s = ring(r, 0.96, 0.012) + ring(r, 0.9, 0.006) + ring(r, 0.62, 0.008) + ring(r, 0.3, 0.01);
            float ticks = step(0.92, fract(a / 6.2832 * 72.0)) * step(0.9, r) * step(r, 0.96);
            float runes = step(0.6, fract(a / 6.2832 * 12.0 + 0.25)) * step(0.66, r) * step(r, 0.86) * step(0.5, fract(r * 9.0 + a * 0.5));
            float spokes = smoothstep(0.02, 0.0, abs(sin(a * 4.0 + uTime * 0.05)) * r) * step(0.3, r) * step(r, 0.62);
            float m = s + ticks * 0.8 + runes * 0.45 + spokes * 0.6;
            float glow = smoothstep(1.0, 0.0, r) * 0.15;
            gl_FragColor = vec4(vec3(0.15, 1.0, 0.5) * (m + glow) * uI * 1.6, 1.0);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const s = new THREE.Mesh(this._keep(new THREE.PlaneGeometry(3.4, 3.4)), this.sigilMat);
    s.rotation.x = -Math.PI / 2;
    s.position.set(0, 0.012, 0.35);
    this.group.add(s);
  }

  _energy() {
    const orb = new THREE.Group();
    orb.position.copy(ORB_REST);
    this.group.add(orb);
    this.orb = orb;
    this.orbMat = this._keep(
      new THREE.ShaderMaterial({
        uniforms: { uTime: this.u.uTime, uI: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main(){
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform float uI; varying vec3 vN; varying vec3 vV; varying vec3 vP;
          ${NOISE}
          void main(){
            float f = 1.0 - abs(dot(vN, vV));
            float n = fbm3(vP * 15.0 + vec3(0.0, uTime * 1.1, uTime * 0.5));
            float n2 = snoise(vP * 34.0 - vec3(uTime * 1.7, 0.0, uTime));
            float vein = smoothstep(0.035, 0.0, abs(n)) + smoothstep(0.03, 0.0, abs(n2)) * 0.5;
            vec3 c = vec3(0.1, 1.0, 0.45) * (pow(f, 2.2) * 1.4 + vein * 1.1 + 0.12) + vec3(0.7, 1.0, 0.85) * pow(1.0 - f, 5.0) * 1.1;
            gl_FragColor = vec4(c * uI, 1.0);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const sphere = new THREE.Mesh(this._keep(new THREE.SphereGeometry(0.085, 48, 32)), this.orbMat);
    orb.add(sphere);
    this.orbGlowMat = this._keep(
      new THREE.SpriteMaterial({ map: this._keep(glowTexture(128, 2.4)), color: new THREE.Color(0.25, 1, 0.55), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })
    );
    this.orbGlow = new THREE.Sprite(this.orbGlowMat);
    this.orbGlow.scale.setScalar(0.7);
    orb.add(this.orbGlow);
    this.orbLight = new THREE.PointLight(GREEN.clone(), 0, 9, 2);
    orb.add(this.orbLight);

    // Lightning: camera-facing ribbons regenerated in short bursts.
    this.MAX_BOLTS = 6;
    this.SEG = 14;
    const verts = this.MAX_BOLTS * (this.SEG + 1) * 2;
    const g = this._keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAcross", new THREE.BufferAttribute(new Float32Array(verts), 1));
    g.setAttribute("aAlong", new THREE.BufferAttribute(new Float32Array(verts), 1));
    const idx = [];
    for (let b = 0; b < this.MAX_BOLTS; b++) {
      for (let s = 0; s < this.SEG; s++) {
        const a = (b * (this.SEG + 1) + s) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    g.setIndex(idx);
    const across = g.attributes.aAcross.array;
    const along = g.attributes.aAlong.array;
    for (let b = 0; b < this.MAX_BOLTS; b++) {
      for (let s = 0; s <= this.SEG; s++) {
        const k = (b * (this.SEG + 1) + s) * 2;
        across[k] = -1;
        across[k + 1] = 1;
        along[k] = along[k + 1] = s / this.SEG;
      }
    }
    this.boltMat = this._keep(
      new THREE.ShaderMaterial({
        uniforms: { uI: { value: 0 } },
        vertexShader: /* glsl */ `
          attribute float aAcross; attribute float aAlong; varying float vA; varying float vL;
          void main(){ vA = aAcross; vL = aAlong; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uI; varying float vA; varying float vL;
          void main(){
            float core = exp(-vA * vA * 9.0);
            float fade = (1.0 - vL) * smoothstep(0.0, 0.08, vL) + 0.15;
            vec3 c = mix(vec3(0.1, 1.0, 0.45), vec3(0.6, 1.0, 0.75), core * core);
            gl_FragColor = vec4(c * core * fade * uI * 3.0, 1.0);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    this.bolts = new THREE.Mesh(g, this.boltMat);
    this.bolts.frustumCulled = false;
    this.group.add(this.bolts);
    this._boltClock = 0;
    this._boltPaths = [];

    // Shockwave: a ring across the floor and an expanding shell.
    this.shockMat = this._keep(
      new THREE.ShaderMaterial({
        uniforms: { uR: { value: 0 }, uI: { value: 0 }, uTime: this.u.uTime },
        vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uR; uniform float uI; uniform float uTime; varying vec2 vP;
          ${NOISE}
          void main(){
            float d = length(vP);
            float n = snoise(vec3(vP * 1.4, uTime * 0.5)) * 0.25;
            float w = 0.18 + uR * 0.05;
            float ring = exp(-pow((d - uR + n) / w, 2.0));
            float trail = step(d, uR) * exp(-(uR - d) * 0.9) * 0.22;
            gl_FragColor = vec4(vec3(0.15, 1.0, 0.5) * (ring * 1.4 + trail) * uI, 1.0);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const shock = new THREE.Mesh(this._keep(new THREE.PlaneGeometry(36, 36)), this.shockMat);
    shock.rotation.x = -Math.PI / 2;
    shock.position.set(0, 0.02, ORB_REST.z);
    this.group.add(shock);
    this.shellMat = this._keep(
      new THREE.ShaderMaterial({
        uniforms: { uI: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vV;
          void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `
          uniform float uI; varying vec3 vN; varying vec3 vV;
          void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(vec3(0.2, 1.0, 0.55) * f * uI, 1.0); }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    this.shell = new THREE.Mesh(this._keep(new THREE.SphereGeometry(1, 48, 24)), this.shellMat);
    this.shell.position.copy(ORB_REST);
    this.group.add(this.shell);

    // Burst particles riding the shockwave.
    const n = this.lowPower ? 1500 : 5000;
    const dir = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const r = this.rand;
    for (let i = 0; i < n; i++) {
      const th = r() * Math.PI * 2;
      const y = (r() * 2 - 1) * 0.55;
      const k = Math.sqrt(1 - y * y);
      dir[i * 3] = Math.cos(th) * k;
      dir[i * 3 + 1] = y;
      dir[i * 3 + 2] = Math.sin(th) * k;
      seed[i] = r();
    }
    const bg = this._keep(new THREE.BufferGeometry());
    bg.setAttribute("position", new THREE.BufferAttribute(dir, 3));
    bg.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    this.burstMat = this._keep(
      new THREE.ShaderMaterial({
        uniforms: { uP: { value: 0 }, uScale: this.u.uScale, uTime: this.u.uTime },
        vertexShader: /* glsl */ `
          uniform float uP; uniform float uScale; uniform float uTime; attribute float aSeed; varying float vA;
          void main(){
            float dist = (1.0 - exp(-uP * (3.0 + aSeed * 3.0))) * (3.0 + aSeed * 9.0);
            vec3 p = position * dist;
            p.y = max(p.y + sin(uTime + aSeed * 30.0) * 0.05, -1.15);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vA = (1.0 - smoothstep(0.35, 1.0, uP)) * step(0.001, uP);
            gl_PointSize = max((0.012 + aSeed * 0.02) * uScale / -mv.z, 1.0);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vA;
          void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = pow(smoothstep(1.0, 0.0, r), 2.0) * vA; gl_FragColor = vec4(vec3(0.3, 1.0, 0.6) * a * 1.5, 1.0); }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.burst = new THREE.Points(bg, this.burstMat);
    this.burst.position.copy(ORB_REST);
    this.burst.frustumCulled = false;
    this.group.add(this.burst);
  }

  _atmosphere() {
    // Shafts from high windows.
    this.shaftMat = this._keep(
      new THREE.ShaderMaterial({
        uniforms: { uTime: this.u.uTime, uI: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vV; varying float vH; varying vec3 vP;
          void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vH = uv.y; vP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform float uI; varying vec3 vN; varying vec3 vV; varying float vH; varying vec3 vP;
          ${NOISE}
          void main(){
            float edge = pow(abs(dot(vN, vV)), 1.8);
            float n = snoise(vP * 0.6 + vec3(0.0, -uTime * 0.08, uTime * 0.03)) * 0.5 + 0.5;
            float a = edge * (0.35 + 0.65 * vH) * (0.45 + 0.55 * n) * 0.07 * uI;
            gl_FragColor = vec4(vec3(0.3, 1.0, 0.6) * a, 1.0);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const shaftGeo = this._keep(new THREE.CylinderGeometry(0.5, 1.6, 14, 32, 1, true));
    shaftGeo.translate(0, -7, 0);
    for (const [x, z, rx] of [
      [-2.0, -1.0, 0.32],
      [2.2, 4.5, -0.3],
      [0.0, -4.0, 0.12],
    ]) {
      const s = new THREE.Mesh(shaftGeo, this.shaftMat);
      s.position.set(x, 13.5, z);
      s.rotation.set(rx * 0.4, 0, rx);
      s.renderOrder = 3;
      this.group.add(s);
    }

    // Layered ground fog.
    this.fogMat = this._keep(
      new THREE.ShaderMaterial({
        uniforms: { uTime: this.u.uTime, uI: { value: 0 }, uGreen: { value: 0 } },
        vertexShader: /* glsl */ `varying vec3 vP; void main(){ vP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform float uI; uniform float uGreen; varying vec3 vP;
          ${NOISE}
          void main(){
            float n = fbm3(vec3(vP.xz * 0.32 + vec2(uTime * 0.02, -uTime * 0.012), vP.y * 0.5 + uTime * 0.03)) * 0.5 + 0.5;
            float d = length(vP.xz - vec2(0.0, -60.0 + 0.0));
            float a = smoothstep(0.45, 0.9, n) * 0.05 * uI * smoothstep(16.0, 4.0, d);
            vec3 c = mix(vec3(0.22, 0.28, 0.25), vec3(0.2, 0.9, 0.5), uGreen);
            gl_FragColor = vec4(c * a, 1.0);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const fogGeo = this._keep(new THREE.PlaneGeometry(30, 30));
    for (const y of [0.12, 0.4, 0.8, 1.4]) {
      const f = new THREE.Mesh(fogGeo, this.fogMat);
      f.rotation.x = -Math.PI / 2;
      f.position.y = y;
      f.renderOrder = 5;
      this.group.add(f);
    }

    // Motes in the green light.
    const n = this.lowPower ? 500 : 1400;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const r = this.rand;
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * 9;
      pos[i * 3 + 1] = r() * 6;
      pos[i * 3 + 2] = (r() - 0.5) * 14 + 1;
      seed[i] = r();
    }
    const g = this._keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    this.moteMat = this._keep(
      new THREE.ShaderMaterial({
        uniforms: { uTime: this.u.uTime, uScale: this.u.uScale, uI: { value: 0 } },
        vertexShader: /* glsl */ `
          uniform float uTime; uniform float uScale; attribute float aSeed; varying float vA;
          void main(){
            vec3 p = position;
            float t = uTime * (0.03 + aSeed * 0.05);
            p.y = mod(p.y + t, 6.0);
            p.x += sin(t * 4.0 + aSeed * 40.0) * 0.2;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vA = (0.3 + 0.7 * fract(aSeed * 13.7));
            gl_PointSize = max((0.006 + aSeed * 0.012) * uScale / -mv.z, 1.0);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uI; varying float vA;
          void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.1, r) * vA * uI; gl_FragColor = vec4(vec3(0.45, 1.0, 0.7) * a * 0.6, 1.0); }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const motes = new THREE.Points(g, this.moteMat);
    motes.frustumCulled = false;
    this.group.add(motes);
  }

  _lights() {
    const size = this.lowPower ? 1024 : 2048;
    // Back light through the haze: the figure's long shadow reaches the lens.
    const back = new THREE.SpotLight(GREEN.clone(), 0, 22, 0.32, 0.6, 1.6);
    back.position.set(0, 3.4, -5.4);
    back.target.position.set(0, 0.0, 0.6);
    back.castShadow = true;
    back.shadow.mapSize.set(size, size);
    back.shadow.camera.near = 1;
    back.shadow.camera.far = 22;
    back.shadow.bias = -0.0002;
    back.shadow.normalBias = 0.02;
    back.shadow.radius = 4;
    // Hard rims from behind on either side.
    const rimL = new THREE.SpotLight("#3dff95", 0, 12, 0.3, 0.6, 1.5);
    rimL.position.set(-2.6, 3.6, -3.4);
    rimL.target.position.set(0, 1.3, 0);
    const rimR = new THREE.SpotLight("#8fffc4", 0, 12, 0.3, 0.6, 1.5);
    rimR.position.set(2.8, 3.0, -3.0);
    rimR.target.position.set(0, 1.4, 0);
    // A cold front fill used only to reveal the mask in Act IV.
    const front = new THREE.SpotLight("#b9d8cc", 0, 10, 0.35, 0.8, 1.5);
    front.position.set(1.2, 2.6, 4.2);
    front.target.position.set(0, 1.5, 0);
    const hemi = new THREE.HemisphereLight("#1d4a33", "#020403", 0);
    this.group.add(back, back.target, rimL, rimL.target, rimR, rimR.target, front, front.target, hemi);
    this.lights = { back, rimL, rimR, front, hemi };
  }

  _regenBolts(cam, surge) {
    const pos = this.bolts.geometry.attributes.position.array;
    const r = this.rand;
    const c = this.orb.position;
    const toCam = new THREE.Vector3();
    const camLocal = this.group.worldToLocal(cam.position.clone());
    const pts = [];
    const side = new THREE.Vector3();
    for (let b = 0; b < this.MAX_BOLTS; b++) {
      const dir = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
      const len = (0.14 + r() * 0.3) * (1 + surge * 6 * r());
      const end = c.clone().addScaledVector(dir, len);
      if (surge > 0.05 && b % 3 === 0) end.y = Math.max(0.02, end.y - surge * 2);
      pts.length = 0;
      for (let s = 0; s <= this.SEG; s++) {
        const t = s / this.SEG;
        const p = c.clone().lerp(end, t);
        const j = Math.sin(t * Math.PI) * len * 0.22;
        p.x += (r() - 0.5) * j;
        p.y += (r() - 0.5) * j;
        p.z += (r() - 0.5) * j;
        pts.push(p);
      }
      const w = 0.002 + r() * 0.0028 + surge * 0.008;
      for (let s = 0; s <= this.SEG; s++) {
        const p = pts[s];
        const q = pts[Math.min(s + 1, this.SEG)];
        const o = pts[Math.max(s - 1, 0)];
        toCam.subVectors(camLocal, p).normalize();
        side.subVectors(q, o).cross(toCam).normalize().multiplyScalar(w * (1 - (s / this.SEG) * 0.6));
        const k = (b * (this.SEG + 1) + s) * 6;
        pos[k] = p.x - side.x;
        pos[k + 1] = p.y - side.y;
        pos[k + 2] = p.z - side.z;
        pos[k + 3] = p.x + side.x;
        pos[k + 4] = p.y + side.y;
        pos[k + 5] = p.z + side.z;
      }
    }
    this.bolts.geometry.attributes.position.needsUpdate = true;
  }

  /** Footfall envelope for the current walk position (1 at each footfall). */
  get footfall() {
    const w = this.state.walk;
    if (w <= 0 || w >= WALK_STEPS) return 0;
    const f = w - Math.floor(w);
    return Math.exp(-f * 9);
  }

  update(t, dt, camera) {
    const S = this.state;
    this.u.uTime.value = t;
    this.u.uFlare.value = S.flare + this.footfall * 0.6;
    this.u.uWind.value = this.reducedMotion ? S.wind * 0.4 : S.wind;

    // Walk: heavy steps; the body dips on each footfall, legs alternate.
    const w = S.walk;
    const f = w - Math.floor(w);
    const moving = w > 0 && w < WALK_STEPS ? 1 : 0;
    this.figure.position.z = WALK_START_Z + w * STEP;
    this.figure.position.y = -0.03 * Math.exp(-f * 7) * moving + 0.012 * Math.sin(f * Math.PI) * moving;
    const swing = 0.3 * Math.sin(w * Math.PI) * moving;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.head.rotation.x = 0.02 * Math.sin(w * Math.PI * 2) * moving;

    // Gears turn; they shudder with the surge.
    for (const g of this.gears) g.rotation.z += g.userData.speed * dt * S.gears * (this.reducedMotion ? 0.4 : 1);

    // Orb.
    const rise = S.orbRise;
    this.orb.position.set(ORB_REST.x, THREE.MathUtils.lerp(0.06, ORB_REST.y, rise), ORB_REST.z);
    const pulse = 0.85 + 0.15 * Math.sin(t * 7.3) * Math.sin(t * 3.1);
    const orbI = S.orb * pulse;
    this.orbMat.uniforms.uI.value = orbI;
    this.orbGlowMat.opacity = Math.min(1, orbI * 0.32);
    this.orbGlow.scale.setScalar(0.32 + 0.2 * S.orb + S.surge * 2.0 * (1 - S.surge));
    this.orb.scale.setScalar(0.35 + 0.65 * Math.min(1, S.orb * 1.2) + S.surge * 0.25 * (1 - S.surge));
    this.orbLight.intensity = 0.55 * orbI * (0.06 + 0.94 * rise * rise) + 22 * S.surge * (1 - S.surge);

    // Lightning: re-strike every 70–110 ms.
    this._boltClock -= dt;
    if (S.bolts > 0.01 && this._boltClock <= 0 && camera) {
      this._regenBolts(camera, S.surge);
      this._boltClock = 0.07 + this.rand() * 0.04;
    }
    const flick = this.reducedMotion ? 0.8 : 0.6 + 0.4 * this.rand();
    this.boltMat.uniforms.uI.value = S.bolts * flick * 0.6;

    // Shockwave.
    const sp = S.surge;
    this.shockMat.uniforms.uR.value = sp * 15;
    this.shockMat.uniforms.uI.value = sp > 0.001 ? (1 - sp) * 1.4 : 0;
    this.shell.scale.setScalar(0.1 + sp * 12);
    this.shellMat.uniforms.uI.value = sp > 0.001 ? Math.pow(1 - sp, 2) * 0.9 : 0;
    this.burstMat.uniforms.uP.value = sp;

    // Hall light.
    const hall = S.hall;
    this.windowMat.uniforms.uI.value = hall * (1 + 0.6 * S.sigil);
    this.shaftMat.uniforms.uI.value = S.shafts;
    this.fogMat.uniforms.uI.value = 0.4 + hall;
    this.fogMat.uniforms.uGreen.value = Math.min(1, 0.4 + S.sigil * 0.6);
    this.moteMat.uniforms.uI.value = hall * 0.8 + S.sigil * 0.6;
    this.sigilMat.uniforms.uI.value = S.sigil * (0.85 + 0.15 * Math.sin(t * 2.0));
    this.eyeMat.opacity = S.eyes * (0.7 + 0.3 * Math.sin(t * 1.7));

    const L = this.lights;
    L.back.intensity = 120 * hall;
    L.rimL.intensity = 55 * S.rim;
    L.rimR.intensity = 40 * S.rim;
    L.front.intensity = 12 * S.front;
    L.hemi.intensity = 0.12 * S.sigil;
  }

  setUScale(s) {
    this.u.uScale.value = s;
  }

  setVisible(v) {
    this.group.visible = v;
    this.lights.back.castShadow = v;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.isMesh || o.isPoints) o.geometry?.dispose();
      if (o.isInstancedMesh) o.dispose();
    });
    this._disposables.forEach((d) => d.dispose?.());
  }
}

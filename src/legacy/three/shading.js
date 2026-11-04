import * as THREE from "three";

/*
 * Shared GLSL. The erosion field is the heart of the disintegration: the
 * helmet's surface, its embers and its shadow all evaluate the same function
 * of object-space position, so the burning edge on the metal, the moment an
 * ember leaves it and the shadow that shrinks with it always agree.
 */

// 3D simplex noise — Ashima Arts / Stefan Gustavson (MIT).
export const NOISE = /* glsl */ `
vec3 lpMod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 lpMod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 lpPermute(vec4 x){ return lpMod289(((x * 34.0) + 10.0) * x); }
vec4 lpInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = lpMod289(i);
  vec4 p = lpPermute(lpPermute(lpPermute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = lpInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbm3(vec3 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++){ s += a * snoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
`;

// Release time of a point on the helmet, 0 (first) … 1 (last). The front
// starts at the torn panel and spreads outward, broken up by noise. The metal
// is gone everywhere once uErode ≈ 0.5; the last embers die at uErode = 1.
export const EROSION = /* glsl */ `
uniform float uErode;
const vec3 LP_TEAR = vec3(-0.07, 0.082, 0.035);
const float LP_SPAN = 1.0;
float erodeField(vec3 p){
  float d = length(p - LP_TEAR) / 0.31;
  float n = snoise(p * 21.0) * 0.5 + 0.5;
  float n2 = snoise(p * 66.0) * 0.5 + 0.5;
  return clamp(d * 0.7 + n * 0.24 + n2 * 0.06, 0.0, 1.0);
}
// > 0: this point has left the armour.
float erodeRelease(vec3 p){ return uErode * (1.0 + LP_SPAN + 0.02) - erodeField(p); }
// 0 … 1: age of the ember that left from p.
float erodeLife(vec3 p){ return erodeRelease(p) / LP_SPAN; }
`;

/** CPU twin of erodeField without the noise, for the instanced shards. */
export const ERODE_K = 2.02;
export const ERODE_SPAN = 1.0;
export function erodeFieldApprox(p, r) {
  const d = Math.hypot(p.x + 0.07, p.y - 0.082, p.z - 0.035) / 0.31;
  return Math.min(1, Math.max(0, d * 0.7 + r * 0.24 + 0.03));
}

/**
 * Patch a MeshPhysicalMaterial (and its shadow depth twin) with object-space
 * wear: scorch, fine scratches, cracks and, optionally, the erosion front.
 *
 * opts: { uniforms, erode: bool, scorch, scratch, crack (0 = none), scale, key }
 */
export function wear(material, opts = {}) {
  const {
    uniforms = {},
    erode = false,
    scorch = 0.6,
    scratch = 0.5,
    crack = 0,
    scale = 1,
    key = "wear",
  } = opts;
  material.userData.uniforms = uniforms;
  const defines = `
    #define LP_SCALE ${scale.toFixed(3)}
    #define LP_SCORCH ${scorch.toFixed(3)}
    #define LP_SCRATCH ${scratch.toFixed(3)}
    #define LP_CRACK ${crack.toFixed(3)}
    ${crack > 0 ? "#define LP_HAS_CRACK 1" : ""}
    ${erode ? "#define LP_ERODE 1" : ""}
  `;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObj;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        ${defines}
        varying vec3 vObj;
        ${NOISE}
        ${erode ? EROSION : ""}
        float lpCrack(vec3 p){
          float c = 0.0;
          #ifdef LP_HAS_CRACK
            float n = abs(snoise(p * vec3(30.0, 48.0, 30.0)));
            float n2 = abs(snoise(p * 95.0 + 3.0));
            float mask = smoothstep(0.075, 0.03, length(p - vec3(-0.07, 0.082, 0.035)))
                       + smoothstep(0.05, 0.012, length(p - vec3(0.052, -0.035, 0.09)))
                       + smoothstep(0.035, 0.008, length(p - vec3(0.03, 0.06, 0.1))) * 0.8;
            c = (1.0 - smoothstep(0.0, 0.025, n)) * clamp(mask, 0.0, 1.0) * LP_CRACK;
            c = max(c, (1.0 - smoothstep(0.0, 0.02, n2)) * clamp(mask, 0.0, 1.0) * 0.5 * LP_CRACK);
          #endif
          return c;
        }`
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        #ifdef LP_ERODE
          float lpRel = erodeRelease(vObj);
          if (lpRel > 0.0) discard;
        #endif`
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        vec3 lpP = vObj * LP_SCALE;
        float lpScorch = smoothstep(0.1, 0.75, fbm3(lpP * 18.0) * 0.5 + 0.5) * LP_SCORCH;
        // Scratches: zero-crossings of noise stretched along two directions
        // read as fine straight-ish lines, only where a mask allows.
        float lpMaskS = smoothstep(0.15, 0.6, snoise(lpP * 11.0 + 5.0));
        float lpS1 = 1.0 - smoothstep(0.0, 0.03, abs(snoise(vec3(dot(lpP, vec3(0.8, 0.6, 0.0)) * 520.0, lpP.y * 14.0, lpP.z * 14.0))));
        float lpS2 = 1.0 - smoothstep(0.0, 0.025, abs(snoise(vec3(dot(lpP, vec3(-0.3, 0.2, 0.93)) * 600.0, lpP.x * 12.0, lpP.y * 12.0) + 9.0)));
        float lpScratch = max(lpS1, lpS2 * 0.8) * lpMaskS * LP_SCRATCH;
        float lpCr = lpCrack(vObj);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.18, lpScorch);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.6, 0.58), lpScratch * 0.55);
        diffuseColor.rgb *= 1.0 - lpCr * 0.95;`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + lpScorch * 0.35 - lpScratch * 0.12 + lpCr * 0.6 + (snoise(lpP * 120.0) * 0.06), 0.04, 1.0);`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        #ifdef LP_ERODE
          float lpEdge = smoothstep(-0.05, 0.0, lpRel) * step(0.001, uErode);
          totalEmissiveRadiance += vec3(1.0, 0.42, 0.12) * lpEdge * lpEdge * 2.2
                                 + vec3(1.0, 0.75, 0.4) * pow(lpEdge, 10.0) * 3.5;
        #endif`
      );
  };
  material.customProgramCacheKey = () => `${key}-${erode}`;
  return material;
}

/** Shadow depth material that discards the eroded part of a surface. */
export function erodingDepth(uniforms) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObj;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vObj;\n${NOISE}\n${EROSION}`)
      .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif (erodeRelease(vObj) > 0.0) discard;");
  };
  m.customProgramCacheKey = () => "erode-depth";
  return m;
}

/** A soft round sprite for points and glows. */
export function glowTexture(size = 64, power = 2) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      const a = Math.pow(1 - r, power);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Area-weighted random points (and normals) on a mesh's surface. */
export function sampleSurface(geo, count, rand = Math.random) {
  const pos = geo.attributes.position.array;
  const nor = geo.attributes.normal.array;
  const idx = geo.index.array;
  const tris = idx.length / 3;
  const cdf = new Float32Array(tris);
  let total = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < tris; t++) {
    a.fromArray(pos, idx[t * 3] * 3);
    b.fromArray(pos, idx[t * 3 + 1] * 3).sub(a);
    c.fromArray(pos, idx[t * 3 + 2] * 3).sub(a);
    total += b.cross(c).length() * 0.5;
    cdf[t] = total;
  }
  const outP = new Float32Array(count * 3);
  const outN = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = rand() * total;
    let lo = 0;
    let hi = tris - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    let u = rand();
    let v = rand();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - u - v;
    for (let k = 0; k < 3; k++) {
      const i0 = idx[lo * 3] * 3 + k;
      const i1 = idx[lo * 3 + 1] * 3 + k;
      const i2 = idx[lo * 3 + 2] * 3 + k;
      outP[i * 3 + k] = pos[i0] * w + pos[i1] * u + pos[i2] * v;
      outN[i * 3 + k] = nor[i0] * w + nor[i1] * u + nor[i2] * v;
    }
  }
  return { positions: outP, normals: outN };
}

/** Seeded PRNG so every visit gets the same composition. */
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

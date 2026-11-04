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

// Cheap 3D cellular noise: distance to the nearest of a jittered lattice of
// points (F1). Hammered metal is a field of shallow round dimples.
export const CELLS = /* glsl */ `
vec3 lpHash3(vec3 p){
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
float cells(vec3 p){
  vec3 i = floor(p); vec3 f = fract(p); float d = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = lpHash3(i + g);
    vec3 r = g + o - f;
    d = min(d, dot(r, r));
  }
  return sqrt(d);
}
// Bump-mapping without a texture: perturb the normal by the screen-space
// gradient of a procedural height, normalised to world units so the relief
// looks the same at any distance.
vec3 lpPerturb(vec3 surfPos, vec3 n, float h, float faceDir){
  vec3 dpx = dFdx(surfPos); vec3 dpy = dFdy(surfPos);
  vec2 dh = vec2(dFdx(h), dFdy(h)) / max(vec2(length(dpx), length(dpy)), vec2(1e-6));
  vec3 sx = normalize(dpx); vec3 sy = normalize(dpy);
  vec3 r1 = cross(sy, n); vec3 r2 = cross(n, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * n - grad);
}
`;

/**
 * Patch a MeshPhysicalMaterial (and nothing else) with object-space detail:
 *
 *  - baked occlusion (the aAO vertex attribute from the sculpt worker):
 *    darkens indirect light and grime collects in the crevices
 *  - scorch, fine directional scratches and cracks
 *  - relief: procedural bump ("paint" orange-peel + scratch grooves,
 *    "hammered" forged dimples, "weave" for cloth), faded out where a pixel
 *    is larger than the detail so it never sparkles
 *  - inner: the inside of a shell shows dark circuitry (torn panels)
 *  - heat: red-hot glow that cools from the thin edges inward (uHeat)
 *  - tunic: the torso's middle is a green cloth tunic, not metal
 *  - band: an embroidered border round the hood's face opening
 *  - erode: the disintegration front (Act II)
 */
export function wear(material, opts = {}) {
  const {
    uniforms = {},
    erode = false,
    scorch = 0.6,
    scratch = 0.5,
    crack = 0,
    scale = 1,
    ao = false,
    relief = "paint",
    reliefScale = 1,
    inner = false,
    heat = false,
    tunic = false,
    band = false,
    key = "wear",
  } = opts;
  material.userData.uniforms = uniforms;
  const defines = `
    #define LP_SCALE ${scale.toFixed(3)}
    #define LP_SCORCH ${scorch.toFixed(3)}
    #define LP_SCRATCH ${scratch.toFixed(3)}
    #define LP_CRACK ${crack.toFixed(3)}
    #define LP_RELIEF_K ${reliefScale.toFixed(3)}
    ${crack > 0 ? "#define LP_HAS_CRACK 1" : ""}
    ${erode ? "#define LP_ERODE 1" : ""}
    ${ao ? "#define LP_AO 1" : ""}
    ${relief === "paint" ? "#define LP_PAINT 1" : ""}
    ${relief === "hammered" ? "#define LP_HAMMERED 1" : ""}
    ${relief === "weave" ? "#define LP_WEAVE 1" : ""}
    ${inner ? "#define LP_INNER 1" : ""}
    ${heat ? "#define LP_HEAT 1" : ""}
    ${tunic ? "#define LP_TUNIC 1" : ""}
    ${band ? "#define LP_BAND 1" : ""}
  `;
  if (heat && !uniforms.uHeat) uniforms.uHeat = { value: 0 };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vObj;
        ${ao ? "attribute float aAO; varying float vAO;" : ""}`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vObj = position;
        ${ao ? "vAO = aAO;" : ""}`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        ${defines}
        varying vec3 vObj;
        #ifdef LP_AO
          varying float vAO;
        #endif
        #ifdef LP_HEAT
          uniform float uHeat;
        #endif
        ${NOISE}
        ${CELLS}
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
        float lpAO = 1.0;
        #ifdef LP_AO
          lpAO = clamp(vAO, 0.0, 1.0);
        #endif
        float lpCav = 1.0 - lpAO; // 1 deep in a crevice
        float lpScorch = smoothstep(0.1, 0.75, fbm3(lpP * 18.0) * 0.5 + 0.5) * LP_SCORCH;
        lpScorch = clamp(lpScorch + lpCav * 0.6 * LP_SCORCH, 0.0, 1.0); // soot gathers in the seams
        float lpMaskS = smoothstep(0.15, 0.6, snoise(lpP * 11.0 + 5.0));
        float lpS1 = 1.0 - smoothstep(0.0, 0.03, abs(snoise(vec3(dot(lpP, vec3(0.8, 0.6, 0.0)) * 520.0, lpP.y * 14.0, lpP.z * 14.0))));
        float lpS2 = 1.0 - smoothstep(0.0, 0.025, abs(snoise(vec3(dot(lpP, vec3(-0.3, 0.2, 0.93)) * 600.0, lpP.x * 12.0, lpP.y * 12.0) + 9.0)));
        float lpScratch = max(lpS1, lpS2 * 0.8) * lpMaskS * LP_SCRATCH * (1.0 - lpCav);
        float lpCr = lpCrack(vObj);
        // Edge wear: on raised, exposed metal the paint is rubbed back.
        float lpEdgeWear = smoothstep(0.985, 1.0, lpAO) * smoothstep(0.55, 0.8, snoise(lpP * 60.0) * 0.5 + 0.5) * LP_SCRATCH;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.16, lpScorch);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.6, 0.58), max(lpScratch * 0.55, lpEdgeWear * 0.6));
        diffuseColor.rgb *= (1.0 - lpCr * 0.95) * mix(1.0, 0.55, lpCav);
        float lpCloth = 0.0;
        #ifdef LP_TUNIC
          // The middle of the torso is a dark green wool tunic over the armour.
          lpCloth = smoothstep(1.005, 1.02, vObj.y) * (1.0 - smoothstep(1.47, 1.49, vObj.y));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.022, 0.07, 0.04) * mix(1.0, 0.5, lpCav), lpCloth);
        #endif
        #ifdef LP_BAND
          // Embroidered border round the face opening: a tight meander in
          // darker thread with a faint metallic edge.
          vec3 lpE = (vObj - vec3(0.0, -0.012, 0.135)) / vec3(0.09, 0.13, 0.16);
          float lpER = length(lpE);
          float lpBand = smoothstep(1.02, 1.05, lpER) * (1.0 - smoothstep(1.28, 1.31, lpER));
          float lpAng = atan(lpE.y, lpE.x);
          float lpMeander = step(0.5, fract(lpAng * 9.549 + step(0.5, fract(lpER * 14.0)) * 0.5));
          float lpThread = lpBand * (0.55 + 0.45 * lpMeander);
          float lpRim = lpBand * (smoothstep(0.02, 0.0, abs(lpER - 1.06)) + smoothstep(0.02, 0.0, abs(lpER - 1.27)));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.11, 0.06), lpThread * 0.8);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.27, 0.15), lpRim);
        #endif`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + lpScorch * 0.35 - lpScratch * 0.12 + lpCr * 0.6 + lpCav * 0.25 + (snoise(lpP * 120.0) * 0.06), 0.04, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.9, lpCloth);`
      )
      .replace(
        "#include <metalnessmap_fragment>",
        `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.0, lpCloth);
        #ifdef LP_BAND
          metalnessFactor = max(metalnessFactor, lpRim * 0.7);
        #endif`
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          float lpPix = length(fwidth(vObj));
          float lpH = 0.0;
          #ifdef LP_PAINT
            lpH += snoise(lpP * 380.0) * 0.000025 * smoothstep(0.0012, 0.0003, lpPix);
            lpH -= lpScratch * 0.00009 * smoothstep(0.002, 0.0005, lpPix);
            lpH += fbm3(lpP * 30.0) * 0.00025;
          #endif
          #ifdef LP_HAMMERED
            float lpC = cells(lpP * 170.0 * LP_RELIEF_K);
            lpH += smoothstep(0.0, 0.75, lpC) * 0.00032 / LP_RELIEF_K * smoothstep(0.003, 0.0008, lpPix);
            lpH += snoise(lpP * 700.0) * 0.00001 * smoothstep(0.0008, 0.0002, lpPix);
            lpH -= lpScratch * 0.00007;
          #endif
          #ifdef LP_WEAVE
            vec3 lpW = vObj * 1400.0 * LP_RELIEF_K;
            float lpWv = sin(lpW.x + lpW.y) * sin(lpW.y - lpW.z + lpW.x * 0.5);
            lpH += lpWv * 0.00003 / LP_RELIEF_K * smoothstep(0.0012, 0.0003, lpPix);
            lpH += fbm3(vObj * 60.0) * 0.0006;
          #endif
          #ifdef LP_TUNIC
            vec3 lpT = vObj * 1300.0;
            lpH += lpCloth * sin(lpT.x + lpT.y) * sin(lpT.y - lpT.x) * 0.00003 * smoothstep(0.0012, 0.0003, lpPix);
          #endif
          #ifdef LP_BAND
            lpH += lpThread * 0.00025 + lpMeander * lpBand * 0.00015;
          #endif
          normal = lpPerturb(-vViewPosition, normal, lpH, faceDirection);
        }`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        #ifdef LP_INNER
          // The inside of a torn shell: dark machinery and copper traces.
          if (!gl_FrontFacing) {
            vec3 lpG = vObj * 160.0;
            float lpTr = max(step(0.93, fract(lpG.x + floor(lpG.y) * 0.37)) * step(0.5, fract(lpG.y * 0.5)),
                             step(0.95, fract(lpG.y + floor(lpG.z) * 0.21)));
            diffuseColor.rgb = mix(vec3(0.03, 0.03, 0.032), vec3(0.5, 0.28, 0.12), lpTr);
            totalEmissiveRadiance += vec3(1.0, 0.45, 0.15) * lpTr * 0.04;
          }
        #endif
        #ifdef LP_HEAT
          // Red-hot iron cooling: thin edges cool first, recesses hold heat.
          float lpHt = clamp(uHeat * (0.75 + 0.5 * lpCav) * (0.85 + 0.3 * snoise(lpP * 40.0)), 0.0, 1.0);
          // Scale flakes stay dark while the iron between them glows.
          float lpScale = smoothstep(0.42, 0.7, fbm3(lpP * 55.0) * 0.5 + 0.5);
          lpHt *= mix(1.0, 0.68, lpScale) * (0.8 + 0.2 * (fbm3(lpP * 140.0) * 0.5 + 0.5));
          lpHt = lpHt * lpHt;
          vec3 lpBody = vec3(1.0, 0.16 + 0.42 * lpHt, 0.03 + 0.12 * lpHt * lpHt);
          totalEmissiveRadiance += lpBody * lpHt * 1.5;
          diffuseColor.rgb *= 1.0 - 0.6 * lpHt;
        #endif
        #ifdef LP_ERODE
          float lpEdge = smoothstep(-0.05, 0.0, lpRel) * step(0.001, uErode);
          totalEmissiveRadiance += vec3(1.0, 0.42, 0.12) * lpEdge * lpEdge * 2.2
                                 + vec3(1.0, 0.75, 0.4) * pow(lpEdge, 10.0) * 3.5;
        #endif`
      )
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
        // Baked occlusion: indirect light mostly, direct light a little.
        reflectedLight.indirectDiffuse *= lpAO;
        reflectedLight.indirectSpecular *= mix(1.0, lpAO, 0.9);
        reflectedLight.directDiffuse *= mix(1.0, lpAO, 0.45);
        reflectedLight.directSpecular *= mix(1.0, lpAO, 0.6);`
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

import * as THREE from "three";
import { EROSION, ERODE_K, ERODE_SPAN, NOISE, erodeFieldApprox, erodingDepth, glowTexture, mulberry, sampleSurface, wear } from "./shading.js";

/*
 * Acts I–II. A damaged helmet rests on a dark floor; a detached arc reactor
 * lies in front of it and is the only key light. In Act II the reactor dies
 * and the armour comes apart: the same erosion field drives the burning edge
 * on the metal, the embers that leave it, the shards that break off and the
 * shrinking shadow.
 */

export const HELMET_POS = new THREE.Vector3(0, 0.127, 0);
export const REACTOR_POS = new THREE.Vector3(-0.17, 0.012, 0.21);

export class HelmetSet {
  constructor({ geos, anchors, lowPower, reducedMotion }) {
    this.group = new THREE.Group();
    this.lowPower = lowPower;
    this.reducedMotion = reducedMotion;
    // Plain numbers the timeline animates.
    this.state = {
      reactor: 0, // base power 0 … 1 (stutters are keyed in the timeline)
      eyes: 0,
      twitch: 0, // faceplate servo, 0 shut … 1 straining open
      rim: 1,
      dust: 1,
      erode: 0,
      drift: 1,
    };
    this.power = 0; // the reactor's actual output this frame, after flicker
    this.uniforms = {
      uErode: { value: 0 },
      uTime: { value: 0 },
      uScale: { value: 800 },
      uDrift: { value: 1 },
    };
    this._disposables = [];

    this._floor();
    this._helmet(geos, anchors);
    this._reactor();
    this._embers(geos);
    this._shards(geos);
    this._debris();
    this._dust();
    this._lights();
  }

  _keep(...things) {
    this._disposables.push(...things);
    return things[0];
  }

  _floor() {
    const mat = this._keep(
      new THREE.MeshStandardMaterial({ color: "#0b0b0c", roughness: 0.5, metalness: 0.0 })
    );
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vW;")
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nvarying vec3 vW;\n${NOISE}`)
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
          float wet = smoothstep(0.05, 0.35, fbm3(vW * 2.2) * 0.5 + 0.3);
          float grit = snoise(vW * 90.0) * 0.5 + 0.5;
          roughnessFactor = mix(0.72 + grit * 0.2, 0.12, wet);
          float burn = smoothstep(0.45, 0.0, length(vW.xz - vec2(0.0, 0.02)));
          diffuseColor.rgb *= mix(1.0, 0.25, burn) * (0.75 + 0.25 * grit) * mix(1.0, 0.55, wet);`
        );
    };
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), mat);
    this._keep(floor.geometry);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);
  }

  _helmet(geos, anchors) {
    const u = this.uniforms;
    const pivot = new THREE.Group();
    pivot.position.copy(HELMET_POS);
    pivot.rotation.set(-0.07, -0.42, 0.13);
    this.group.add(pivot);
    this.helmetPivot = pivot;

    const red = wear(
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0.42, 0.035, 0.025),
        metalness: 0.82,
        roughness: 0.4,
        clearcoat: 0.55,
        clearcoatRoughness: 0.22,
        side: THREE.DoubleSide,
      }),
      { uniforms: u, erode: true, scorch: 0.75, scratch: 0.55, crack: 1, key: "helmet-red" }
    );
    const gold = wear(
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0.78, 0.52, 0.2),
        metalness: 1,
        roughness: 0.34,
        clearcoat: 0.35,
        clearcoatRoughness: 0.3,
        side: THREE.DoubleSide,
      }),
      { uniforms: u, erode: true, scorch: 0.45, scratch: 0.6, crack: 1, key: "helmet-gold" }
    );
    const depth = erodingDepth(u);
    this._keep(red, gold, depth);

    const shell = new THREE.Mesh(geos.helmet, red);
    shell.castShadow = true;
    shell.receiveShadow = true;
    shell.customDepthMaterial = depth;
    pivot.add(shell);

    // The faceplate hinges at the ear discs; its servo still tries to move.
    const hinge = new THREE.Group();
    hinge.position.set(0, -0.002, -0.012);
    pivot.add(hinge);
    const plate = new THREE.Mesh(geos.faceplate, gold);
    plate.position.set(0, 0.002, 0.012);
    plate.castShadow = true;
    plate.receiveShadow = true;
    plate.customDepthMaterial = depth;
    hinge.add(plate);
    this.hinge = hinge;

    // The eyes: soft glows inside the helmet, seen only through the slits.
    this.eyeGlowMat = this._keep(
      new THREE.SpriteMaterial({ map: this._keep(glowTexture(64, 2.2)), color: new THREE.Color(1.0, 0.7, 0.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
    );
    this.eyeGlows = anchors.helmet.eyes.map((e) => {
      const s = new THREE.Sprite(this.eyeGlowMat);
      s.position.set(e.x, e.y, e.z - 0.004);
      s.scale.set(0.07, 0.03, 1);
      plate.add(s);
      return s;
    });
  }

  _reactor() {
    const g = new THREE.Group();
    g.position.copy(REACTOR_POS);
    // Lying on the floor, tipped up toward the helmet and the lens.
    g.lookAt(REACTOR_POS.clone().add(new THREE.Vector3(0.35, 1.0, 0.55)));
    g.rotateX(Math.PI / 2);
    this.group.add(g);
    this.reactor = g;

    const steel = this._keep(
      wear(new THREE.MeshPhysicalMaterial({ color: "#8d9096", metalness: 1, roughness: 0.3, clearcoat: 0.3 }), {
        scorch: 0.25,
        scratch: 0.5,
        scale: 2,
        key: "reactor-steel",
      })
    );
    const copper = this._keep(new THREE.MeshPhysicalMaterial({ color: "#c27a45", metalness: 1, roughness: 0.3 }));
    // Housing: a lathe profile (radius, height).
    const prof = [
      [0.0, 0.0],
      [0.047, 0.0],
      [0.051, 0.003],
      [0.051, 0.012],
      [0.047, 0.016],
      [0.041, 0.016],
      [0.039, 0.011],
      [0.025, 0.011],
      [0.023, 0.014],
      [0.021, 0.014],
      [0.02, 0.008],
      [0.0, 0.008],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const housing = new THREE.Mesh(this._keep(new THREE.LatheGeometry(prof, 72)), steel);
    housing.castShadow = true;
    g.add(housing);
    // Ten copper coils around the ring.
    const coilGeo = this._keep(new THREE.BoxGeometry(0.0055, 0.0035, 0.009));
    const coils = new THREE.InstancedMesh(coilGeo, copper, 10);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      m.makeRotationY(-a).setPosition(Math.cos(a) * 0.032, 0.0135, Math.sin(a) * 0.032);
      coils.setMatrixAt(i, m);
    }
    g.add(coils);
    const ring = new THREE.Mesh(this._keep(new THREE.TorusGeometry(0.0225, 0.0022, 12, 64)), steel);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.0145;
    g.add(ring);

    // The core: an emissive disc behind glass.
    this.coreMat = this._keep(
      new THREE.ShaderMaterial({
        uniforms: { uPower: { value: 0 }, uTime: this.uniforms.uTime },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uPower; uniform float uTime; varying vec2 vUv;
          ${NOISE}
          void main(){
            vec2 p = vUv * 2.0 - 1.0; float r = length(p);
            float core = smoothstep(0.55, 0.0, r);
            float ring = smoothstep(0.07, 0.0, abs(r - 0.74));
            float spokes = pow(abs(cos(atan(p.y, p.x) * 5.0)), 10.0) * smoothstep(0.3, 0.62, r) * smoothstep(0.98, 0.78, r);
            float n = snoise(vec3(p * 4.0, uTime * 1.3)) * 0.5 + 0.5;
            vec3 hot = vec3(1.0, 0.94, 0.84);
            vec3 warm = vec3(1.0, 0.5, 0.17);
            vec3 c = hot * core * 3.2 + warm * (ring * 1.6 + spokes * 0.9 + n * 0.35 * smoothstep(1.0, 0.3, r));
            vec3 dead = vec3(0.035, 0.032, 0.03) * (0.6 + 0.4 * ring + 0.3 * spokes);
            gl_FragColor = vec4(dead + c * uPower * 1.4, 1.0);
          }`,
      })
    );
    const core = new THREE.Mesh(this._keep(new THREE.CircleGeometry(0.021, 48)), this.coreMat);
    core.rotation.x = -Math.PI / 2;
    core.position.y = 0.0105;
    g.add(core);
    const glass = new THREE.Mesh(
      this._keep(new THREE.SphereGeometry(0.023, 48, 16, 0, Math.PI * 2, 0, 0.9)),
      this._keep(
        new THREE.MeshPhysicalMaterial({ color: "#ffffff", metalness: 0, roughness: 0.04, transparent: true, opacity: 0.18, clearcoat: 1, depthWrite: false })
      )
    );
    glass.scale.y = 0.35;
    glass.position.y = 0.009;
    g.add(glass);

    // A glow above the lens that the bloom turns into a halo.
    this.reactorGlowMat = this._keep(
      new THREE.SpriteMaterial({ map: this._keep(glowTexture(128, 2.6)), color: new THREE.Color(1.0, 0.62, 0.3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
    );
    this.reactorGlow = new THREE.Sprite(this.reactorGlowMat);
    this.reactorGlow.position.y = 0.02;
    this.reactorGlow.scale.setScalar(0.16);
    g.add(this.reactorGlow);

    // A faint beam of light rising out of the lens through the dust.
    this.beamMat = this._keep(
      new THREE.ShaderMaterial({
        uniforms: { uPower: { value: 0 }, uTime: this.uniforms.uTime },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vV; varying float vH; varying vec3 vP;
          void main(){
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vH = uv.y; vP = position;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uPower; uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vH; varying vec3 vP;
          ${NOISE}
          void main(){
            float edge = pow(abs(dot(vN, vV)), 1.6);
            float fall = pow(vH, 1.7);
            float n = snoise(vP * 9.0 + vec3(0.0, -uTime * 0.25, 0.0)) * 0.5 + 0.5;
            float a = edge * (1.0 - vH) * (0.5 + 0.5 * n) * 0.035 * uPower;
            gl_FragColor = vec4(vec3(1.0, 0.62, 0.3) * a, 1.0);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const beamGeo = this._keep(new THREE.CylinderGeometry(0.2, 0.022, 0.9, 48, 1, true));
    beamGeo.translate(0, 0.46, 0);
    const beam = new THREE.Mesh(beamGeo, this.beamMat);
    beam.renderOrder = 3;
    g.add(beam);
  }

  _embers(geos) {
    const n = this.lowPower ? 20000 : 70000;
    const rand = mulberry(7);
    const a = sampleSurface(geos.helmet, Math.round(n * 0.62), rand);
    const b = sampleSurface(geos.faceplate, n - Math.round(n * 0.62), rand);
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    pos.set(a.positions);
    nor.set(a.normals);
    // Faceplate samples sit in the hinge's frame; at rest it is the helmet frame.
    pos.set(b.positions, a.positions.length);
    nor.set(b.normals, a.normals.length);
    const seed = new Float32Array(n * 4);
    const gold = new Float32Array(n);
    for (let i = 0; i < n * 4; i++) seed[i] = rand();
    for (let i = a.positions.length / 3; i < n; i++) gold[i] = 1;
    const g = this._keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aNormal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    g.setAttribute("aGold", new THREE.BufferAttribute(gold, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);

    this.emberMat = this._keep(
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: /* glsl */ `
          uniform float uTime; uniform float uScale; uniform float uDrift;
          attribute vec3 aNormal; attribute vec4 aSeed; attribute float aGold;
          varying vec3 vCol; varying float vA;
          ${NOISE}
          ${EROSION}
          void main(){
            float life = erodeLife(position);
            if (life <= 0.0 || life >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
            float e = life;
            vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
            vec3 wn = normalize(mat3(modelMatrix) * aNormal);
            float burst = 1.0 - pow(1.0 - min(e * 5.0, 1.0), 3.0);
            vec3 off = wn * (0.012 + 0.04 * aSeed.x) * burst;
            vec3 q = wp * 2.6 + vec3(0.0, -uTime * 0.12, uTime * 0.05) + aSeed.yzw * 3.0;
            vec3 curl = vec3(snoise(q), snoise(q + 19.1), snoise(q + 47.3));
            off += curl * (0.1 + 0.14 * aSeed.y) * e * uDrift;
            off += vec3(0.7 * (aSeed.z - 0.5), 0.3 + 0.55 * aSeed.x, -0.5 - 1.7 * aSeed.w) * pow(e, 1.4) * uDrift;
            wp += off;
            vec4 mv = viewMatrix * vec4(wp, 1.0);
            gl_Position = projectionMatrix * mv;
            float flick = 0.7 + 0.3 * sin(uTime * (5.0 + aSeed.x * 9.0) + aSeed.y * 40.0);
            vec3 hot = mix(vec3(1.0, 0.72, 0.45), vec3(1.0, 0.84, 0.5), aGold) * 2.4;
            vec3 ember = mix(vec3(1.0, 0.26, 0.05), vec3(1.0, 0.45, 0.1), aGold) * 1.3;
            vec3 ash = vec3(0.3, 0.27, 0.25);
            vec3 green = vec3(0.06, 0.45, 0.22);
            vec3 c = mix(hot, ember, smoothstep(0.0, 0.1, e));
            c = mix(c, ash, smoothstep(0.25, 0.6, e));
            c = mix(c, green, smoothstep(0.6, 0.9, e) * step(0.8, aSeed.w));
            vCol = c * mix(flick, 1.0, smoothstep(0.3, 0.6, e));
            vA = smoothstep(0.0, 0.01, e) * (1.0 - smoothstep(0.75, 1.0, e));
            float size = (0.0022 + 0.0024 * aSeed.y) * (1.0 - 0.45 * e);
            gl_PointSize = max(size * uScale / -mv.z, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vCol; varying float vA;
          void main(){
            float r = length(gl_PointCoord - 0.5) * 2.0;
            float a = smoothstep(1.0, 0.0, r);
            if (vA <= 0.0) discard;
            gl_FragColor = vec4(vCol * a * a * vA, 1.0);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const pts = new THREE.Points(g, this.emberMat);
    pts.frustumCulled = false;
    pts.renderOrder = 4;
    this.helmetPivot.add(pts);
    this.embers = pts;
  }

  _shardGeometry(rand) {
    // A torn, slightly bent plate: a random convex polygon, extruded thin.
    const shape = new THREE.Shape();
    const k = 5 + Math.floor(rand() * 3);
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + rand() * 0.5;
      const r = 0.5 + rand() * 0.5;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r * (0.5 + rand() * 0.5);
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
    g.center();
    return g;
  }

  _shards(geos) {
    const n = this.lowPower ? 60 : 180;
    const rand = mulberry(21);
    const s = sampleSurface(geos.helmet, n, rand);
    const geo = this._keep(this._shardGeometry(rand));
    const red = this._keep(
      new THREE.MeshPhysicalMaterial({ color: "#ffffff", metalness: 0.85, roughness: 0.32, clearcoat: 0.5 })
    );
    const mesh = new THREE.InstancedMesh(geo, red, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    const gold = new THREE.Color(0.75, 0.5, 0.18);
    const redC = new THREE.Color(0.4, 0.035, 0.025);
    this.shardData = [];
    for (let i = 0; i < n; i++) {
      const p = new THREE.Vector3().fromArray(s.positions, i * 3);
      const nn = new THREE.Vector3().fromArray(s.normals, i * 3).normalize();
      const r = rand();
      this.shardData.push({
        p,
        n: nn,
        f: erodeFieldApprox(p, r),
        size: 0.006 + rand() * 0.014,
        spin: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(5),
        drift: new THREE.Vector3((rand() - 0.5) * 0.4, 0.25 + rand() * 0.45, -0.3 - rand() * 0.9),
        phase: rand() * 10,
      });
      mesh.setColorAt(i, p.z > 0.02 && Math.abs(p.x) < 0.085 ? gold : redC);
    }
    this.shards = mesh;
    this.group.add(mesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._sc = new THREE.Vector3();
  }

  _debris() {
    // Torn plates that fell earlier, scattered on the floor.
    const rand = mulberry(5);
    const n = this.lowPower ? 18 : 40;
    const geo = this._keep(this._shardGeometry(rand));
    const mat = this._keep(
      wear(new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.3, 0.04, 0.03), metalness: 0.8, roughness: 0.45 }), {
        scorch: 0.9,
        scratch: 0.4,
        scale: 4,
        key: "debris",
      })
    );
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const r = 0.22 + Math.pow(rand(), 0.7) * 1.1;
      const s = 0.01 + rand() * 0.035;
      q.setFromEuler(new THREE.Euler(-Math.PI / 2 + (rand() - 0.5) * 0.3, 0, rand() * 6.3));
      m.compose(new THREE.Vector3(Math.cos(a) * r, s * 0.04, Math.sin(a) * r - 0.1), q, new THREE.Vector3(s, s, s * 0.6));
      mesh.setMatrixAt(i, m);
    }
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.group.add(mesh);
  }

  _dust() {
    const n = this.lowPower ? 350 : 900;
    const rand = mulberry(3);
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rand() - 0.5) * 1.6;
      pos[i * 3 + 1] = rand() * 0.9;
      pos[i * 3 + 2] = (rand() - 0.5) * 1.4 + 0.1;
      seed[i] = rand();
    }
    const g = this._keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    this.dustMat = this._keep(
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: this.uniforms.uTime,
          uScale: this.uniforms.uScale,
          uLight: { value: 0 },
          uSrc: { value: REACTOR_POS.clone() },
        },
        vertexShader: /* glsl */ `
          uniform float uTime; uniform float uScale; uniform vec3 uSrc; attribute float aSeed; varying float vA;
          void main(){
            vec3 p = position;
            float t = uTime * (0.012 + aSeed * 0.02);
            p.y = mod(p.y + t, 0.9);
            p.x += sin(t * 9.0 + aSeed * 40.0) * 0.03;
            p.z += cos(t * 7.0 + aSeed * 17.0) * 0.03;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            float d = distance(p, uSrc);
            vA = exp(-d * 3.2) * (0.3 + 0.7 * fract(aSeed * 13.7)) * smoothstep(0.0, 0.08, p.y);
            gl_PointSize = clamp((0.0012 + aSeed * 0.0016) * uScale / -mv.z, 1.0, 6.0);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uLight; varying float vA;
          void main(){
            float r = length(gl_PointCoord - 0.5) * 2.0;
            float a = smoothstep(1.0, 0.2, r) * vA * uLight;
            gl_FragColor = vec4(vec3(1.0, 0.7, 0.45) * a * 0.5, 1.0);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const pts = new THREE.Points(g, this.dustMat);
    pts.frustumCulled = false;
    this.group.add(pts);
  }

  _lights() {
    const size = this.lowPower ? 1024 : 2048;
    const src = REACTOR_POS.clone().add(new THREE.Vector3(0.006, 0.03, 0.006));
    // The reactor as key: a shadow-casting spot aimed at the helmet …
    const key = new THREE.SpotLight("#ffb072", 0, 4, 1.15, 1, 2);
    key.position.copy(src);
    key.target.position.copy(HELMET_POS).add(new THREE.Vector3(0.05, 0.02, -0.05));
    key.castShadow = true;
    key.shadow.mapSize.set(size, size);
    key.shadow.camera.near = 0.02;
    key.shadow.camera.far = 3;
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.004;
    key.shadow.radius = 3;
    // … and an unshadowed point for the spill around it on the floor.
    const spill = new THREE.PointLight("#ff9a55", 0, 1.6, 2);
    spill.position.copy(src);
    // A cold-red rim from behind and above that draws the helmet's outline.
    const rim = new THREE.SpotLight("#ff4a26", 0, 6, 0.42, 0.9, 1.5);
    rim.position.set(-0.6, 1.25, -1.15);
    rim.target.position.copy(HELMET_POS);
    const rim2 = new THREE.SpotLight("#c9d4e6", 0, 6, 0.35, 0.9, 1.5);
    rim2.position.set(0.95, 0.9, -0.9);
    rim2.target.position.copy(HELMET_POS);
    this.group.add(key, key.target, spill, rim, rim.target, rim2, rim2.target);
    this.lights = { key, spill, rim, rim2 };
  }

  /** Called by the stage once per frame. `pulse` is the heartbeat envelope 0 … 1. */
  update(t, dt, { pulse = 0, eyeLevel = 1 } = {}) {
    const S = this.state;
    const u = this.uniforms;
    u.uTime.value = t;
    u.uErode.value = S.erode;
    u.uDrift.value = this.reducedMotion ? 0.55 : S.drift;

    // Flicker: slow dips layered on the base power, swelling with each beat.
    // Kept under 3 strong changes per second (photosensitivity).
    const soft = this.reducedMotion ? 0.04 : 0.1;
    const dip = Math.max(0, Math.sin(t * 2.1) * Math.sin(t * 0.73 + 1.3)) * soft * 2;
    const p = Math.max(0, S.reactor * (1 - dip) * (0.82 + 0.18 * pulse));
    this.power = p;

    this.coreMat.uniforms.uPower.value = p;
    this.beamMat.uniforms.uPower.value = p;
    this.reactorGlowMat.opacity = Math.min(1, p * 0.45);
    this.reactorGlow.scale.setScalar(0.05 + 0.04 * p);
    this.dustMat.uniforms.uLight.value = p * S.dust;
    const L = this.lights;
    L.key.intensity = 0.22 * p;
    L.spill.intensity = 0.05 * p;
    L.rim.intensity = 7 * S.rim;
    L.rim2.intensity = 2.2 * S.rim;

    const eyes = S.eyes * eyeLevel * (0.55 + 0.45 * pulse) * (S.erode > 0.02 ? 0 : 1);
    this.eyeGlowMat.opacity = Math.min(1, eyes * 0.9);

    // Servo: the faceplate strains open a few millimetres and drops back.
    this.hinge.rotation.x = -0.075 * S.twitch * (1 - S.erode * 4);

    this._updateShards(t);
  }

  _updateShards(t) {
    const rel = this.uniforms.uErode.value * ERODE_K;
    const pivot = this.helmetPivot;
    pivot.updateMatrixWorld();
    const mw = pivot.matrixWorld;
    const nm = new THREE.Matrix3().getNormalMatrix(mw);
    const m = this._m;
    const v = this._v;
    for (let i = 0; i < this.shardData.length; i++) {
      const d = this.shardData[i];
      const life = (rel - d.f) / ERODE_SPAN;
      if (life <= 0 || life >= 1) {
        m.makeScale(0, 0, 0);
        this.shards.setMatrixAt(i, m);
        continue;
      }
      const e = life;
      v.copy(d.p).applyMatrix4(mw);
      const n = this._sc.copy(d.n).applyMatrix3(nm).normalize();
      const burst = 1 - Math.pow(1 - Math.min(e * 2.5, 1), 3);
      v.addScaledVector(n, 0.035 * burst);
      v.addScaledVector(d.drift, Math.pow(e, 1.4) * (this.reducedMotion ? 0.5 : 1));
      v.y += Math.sin(t * 0.8 + d.phase) * 0.004 * e;
      this._e.set(d.spin.x * e + d.phase, d.spin.y * e, d.spin.z * e);
      this._q.setFromEuler(this._e);
      const s = d.size * (1 - Math.pow(e, 3));
      m.compose(v, this._q, new THREE.Vector3(s, s, s * 0.35));
      this.shards.setMatrixAt(i, m);
    }
    this.shards.instanceMatrix.needsUpdate = true;
  }

  setUScale(s) {
    this.uniforms.uScale.value = s;
  }

  setVisible(v) {
    this.group.visible = v;
    this.lights.key.castShadow = v;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.isMesh || o.isPoints) o.geometry?.dispose();
    });
    this._disposables.forEach((d) => d.dispose?.());
    this.shards.dispose();
  }
}

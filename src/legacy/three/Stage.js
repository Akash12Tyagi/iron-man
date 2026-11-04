import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { anchors as sculptAnchors } from "./sculpts.js";
import { HelmetSet } from "./helmetSet.js";
import { DoomSet } from "./doomSet.js";
import { glowTexture } from "./shading.js";

const SCULPTS = ["helmet", "faceplate", "mask", "hood", "torso", "leg"];

/**
 * Mesh every sculpt in parallel workers. Resolves to { geos, anchors }.
 * `onProgress(0 … 1)` reports finished jobs.
 */
export function prepareSculpts(quality, onProgress = () => {}) {
  const threads = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
  const workers = Array.from({ length: threads }, () => new Worker(new URL("./sculpt.worker.js", import.meta.url), { type: "module" }));
  // Longest jobs first so the threads finish together.
  const queue = ["hood", "mask", "helmet", "faceplate", "torso", "leg"];
  const geos = {};
  let done = 0;
  return new Promise((resolve, reject) => {
    const next = (w) => {
      const name = queue.shift();
      if (!name) return;
      w.postMessage({ id: name, name, quality });
    };
    for (const w of workers) {
      w.onmessage = ({ data }) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(data.position, 3));
        g.setAttribute("normal", new THREE.BufferAttribute(data.normal, 3));
        g.setIndex(new THREE.BufferAttribute(data.index, 1));
        g.computeBoundingSphere();
        geos[data.name] = g;
        done++;
        onProgress(done / SCULPTS.length);
        if (done === SCULPTS.length) {
          workers.forEach((x) => x.terminate());
          resolve({ geos, anchors: sculptAnchors() });
        } else next(w);
      };
      w.onerror = (e) => {
        workers.forEach((x) => x.terminate());
        reject(e);
      };
      next(w);
    }
  });
}

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.05 },
    uVignette: { value: 1 },
    uFade: { value: 1 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(0.6, 1.0, 0.75) },
    uCA: { value: 0.0015 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uGrain; uniform float uVignette;
    uniform float uFade; uniform float uFlash; uniform vec3 uFlashColor; uniform float uCA; uniform float uAspect;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 7.13) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      // Lens: a touch of radial chromatic aberration toward the corners.
      vec2 off = d * uCA * (0.4 + dot(d, d) * 4.0);
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + off).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - off).b;
      float vig = smoothstep(0.95, 0.25, length(d * vec2(uAspect * 0.75, 1.0)));
      c *= mix(1.0, vig, 0.82 * uVignette);
      c += uFlashColor * uFlash;
      c *= uFade;
      // Film grain, stronger in the shadows, never lifting pure black much.
      float g = (hash(vUv * 1000.0) - 0.5) * uGrain;
      float lum = dot(c, vec3(0.299, 0.587, 0.114));
      c += g * mix(0.35, 1.0, smoothstep(0.0, 0.25, lum));
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

function envScene(kind) {
  const s = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide }));
  s.add(box);
  const panel = (w, h, color, k, x, y, z, ry = 0, rx = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    s.add(m);
  };
  if (kind === "warm") {
    panel(6, 0.5, "#ff8a3d", 3, 0, -2.5, 3, 0, -0.6); // the reactor's glow from below
    panel(2, 4, "#ff3b1f", 1.2, -4.5, 1, -2, Math.PI / 2);
    panel(4, 0.3, "#d9dde6", 1.5, 2, 4.5, -2, 0, Math.PI / 2);
    panel(1.2, 3, "#ffd0a0", 0.8, 4.5, 0.5, 1, -Math.PI / 2);
  } else {
    panel(5, 5, "#1fe07a", 0.9, 0, 1, -4.9);
    panel(0.6, 6, "#7dffc0", 1.2, -4.5, 1, -1, Math.PI / 2);
    panel(0.6, 6, "#7dffc0", 0.9, 4.5, 1, -1, -Math.PI / 2);
    panel(6, 0.4, "#b5d6c8", 0.7, 0, 4.6, 2, 0, Math.PI / 2);
  }
  return s;
}

/**
 * Owns the renderer, the two sets and the camera. The scroll timeline
 * (choreography.js) only writes plain numbers into `stage.cam`, `stage.look`
 * and the sets' `state`; `tick` turns those into pixels.
 */
export class Stage {
  constructor(container, { geos, anchors, reducedMotion = false, lowPower = false }) {
    this.container = container;
    this.reducedMotion = reducedMotion;
    this.lowPower = lowPower;

    const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, powerPreference: "high-performance", alpha: false, stencil: false });
    this.maxDpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2);
    this.dpr = this.maxDpr;
    renderer.setPixelRatio(this.dpr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0;
    renderer.setClearColor(0x000000, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.setAttribute("aria-hidden", "true");
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.35);
    this.scene = scene;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const warm = envScene("warm");
    const green = envScene("green");
    this.envs = { warm: pmrem.fromScene(warm, 0.03).texture, green: pmrem.fromScene(green, 0.03).texture };
    [warm, green].forEach((s) => s.traverse((o) => (o.geometry?.dispose(), o.material?.dispose())));
    pmrem.dispose();
    scene.environment = this.envs.warm;
    scene.environmentIntensity = 0.3;

    this.camera = new THREE.PerspectiveCamera(26, 1, 0.01, 120);
    scene.add(this.camera);
    // Plain numbers the timeline animates (world space).
    this.cam = { px: 0, py: 0.1, pz: 1, tx: 0, ty: 0.1, tz: 0, fov: 26, roll: 0 };
    this.look = {
      exposure: 0,
      set: 0, // 0 = Acts I–II, 1 = Acts III–IV
      heartRate: 0, // bpm; 0 stops the heart
      env: 0.3,
      dof: 0,
      focus: -1, // < 0: focus on the camera target
      shake: 0,
      flash: 0,
      ember: 0, // the final orange ember's life 0 … 1
      vignette: 1,
      bloom: 1,
    };
    this.heart = { phase: 0, last: -10, onBeat: null };
    this.pointer = new THREE.Vector2();
    this.pointerSmooth = new THREE.Vector2();

    this.helmet = new HelmetSet({ geos, anchors, lowPower, reducedMotion });
    this.doom = new DoomSet({ geos, anchors, lowPower, reducedMotion });
    scene.add(this.helmet.group, this.doom.group);
    this.doom.setVisible(false);
    this._activeSet = 0;

    // The last ember of Act II drifting through the final frame.
    this.emberMat = new THREE.SpriteMaterial({
      map: glowTexture(64, 2),
      color: new THREE.Color(1.0, 0.45, 0.12),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      opacity: 0,
    });
    this.ember = new THREE.Sprite(this.emberMat);
    this.ember.renderOrder = 10;
    this.camera.add(this.ember);

    this._composer();
    this._resize = this._resize.bind(this);
    this._onPointer = this._onPointer.bind(this);
    window.addEventListener("resize", this._resize);
    window.addEventListener("pointermove", this._onPointer, { passive: true });
    this._resize();

    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.time = 0;
    this.running = true;
    this.quality = { level: 0, slow: 0, fast: 0, ema: 16 };
    this._v = { pos: new THREE.Vector3(), target: new THREE.Vector3(), right: new THREE.Vector3() };
  }

  _composer() {
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bokeh = new BokehPass(this.scene, this.camera, { focus: 1, aperture: 0.01, maxblur: 0.008 });
    this.bokeh.enabled = false;
    composer.addPass(this.bokeh);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.45, 0.9);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    if (this.reducedMotion) this.finish.uniforms.uGrain.value = 0.025;
    composer.addPass(this.finish);
    this.composer = composer;
  }

  _resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.size = { w, h };
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(w, h);
    const bloomScale = this.lowPower ? 0.35 : 0.5;
    this.bloom.resolution.set(w * bloomScale, h * bloomScale);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.finish.uniforms.uAspect.value = w / h;
  }

  _onPointer(e) {
    this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  }

  /** A heartbeat now (also used by the timeline for the last two beats). */
  beat(strength = 1) {
    this.heart.last = this.time;
    this.heart.strength = strength;
    this.heart.onBeat?.(strength);
  }

  _heartPulse() {
    const x = this.time - this.heart.last;
    if (x < 0 || x > 1.5) return 0;
    const lub = Math.exp(-x * 9);
    const dub = x > 0.27 ? 0.65 * Math.exp(-(x - 0.27) * 9) : 0;
    return Math.min(1, (lub + dub) * (this.heart.strength ?? 1));
  }

  _applyCamera() {
    const c = this.cam;
    const L = this.look;
    const cam = this.camera;
    const { pos, target, right } = this._v;
    target.set(c.tx, c.ty, c.tz);
    pos.set(c.px, c.py, c.pz);
    const aspect = this.size.w / this.size.h;
    let fov = c.fov;
    // Portrait screens: pull back and widen so the subject fits the width.
    if (aspect < 1) {
      const k = THREE.MathUtils.clamp(0.95 / aspect, 1, 2.1);
      pos.sub(target).multiplyScalar(1 + (k - 1) * 0.55).add(target);
      fov = Math.min(60, fov * (1 + (k - 1) * 0.35));
    }
    const dist = pos.distanceTo(target);
    if (!this.reducedMotion) {
      // Handheld: slow layered drift, plus shake from footfalls and impacts.
      const t = this.time;
      const hx = Math.sin(t * 0.43) * 0.6 + Math.sin(t * 1.13 + 1.7) * 0.3;
      const hy = Math.sin(t * 0.37 + 0.6) * 0.6 + Math.sin(t * 0.97 + 2.9) * 0.3;
      const amp = 0.004 + L.shake * 0.02;
      const sx = L.shake > 0 ? Math.sin(t * 31) * Math.sin(t * 17.3) * L.shake * 0.012 : 0;
      this.pointerSmooth.lerp(this.pointer, 0.035);
      right.subVectors(pos, target).cross(cam.up).normalize();
      pos.addScaledVector(right, (hx * amp - this.pointerSmooth.x * 0.012 + sx) * dist);
      pos.y += (hy * amp + this.pointerSmooth.y * 0.008 + sx * 0.6) * dist;
    }
    cam.position.copy(pos);
    cam.lookAt(target);
    cam.rotateZ(c.roll);
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }

    const dof = L.dof;
    this.bokeh.enabled = dof > 0.01 && !this.lowPower && this.quality.level < 1;
    if (this.bokeh.enabled) {
      const u = this.bokeh.uniforms;
      u.focus.value = L.focus > 0 ? L.focus : dist;
      u.aperture.value = 0.012 * dof / Math.max(dist, 0.2);
      u.maxblur.value = 0.012 * dof;
    }
  }

  _adapt(dt) {
    // Adaptive quality: drop DOF, then pixel ratio, when frames stay slow.
    const q = this.quality;
    q.ema += (dt * 1000 - q.ema) * 0.05;
    if (q.ema > 22) {
      q.slow += dt;
      q.fast = 0;
    } else if (q.ema < 13) {
      q.fast += dt;
      q.slow = 0;
    } else {
      q.slow = q.fast = 0;
    }
    if (q.slow > 2 && q.level < 3) {
      q.level++;
      q.slow = 0;
      this.dpr = Math.max(1, this.maxDpr - q.level * 0.35);
      this._resize();
    } else if (q.fast > 6 && q.level > 0) {
      q.level--;
      q.fast = 0;
      this.dpr = Math.max(1, this.maxDpr - q.level * 0.35);
      this._resize();
    }
  }

  tick() {
    if (!this.running) return;
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.time += dt;
    const t = this.time;
    const L = this.look;

    // Heart clock.
    const h = this.heart;
    if (L.heartRate > 0) {
      const before = Math.floor(h.phase);
      h.phase += (L.heartRate / 60) * dt;
      if (Math.floor(h.phase) !== before) this.beat(0.8 + 0.2 * Math.min(1, L.heartRate / 50));
    }
    const pulse = this._heartPulse();

    // Only one set is live at a time.
    const active = L.set < 0.5 ? 0 : 1;
    if (active !== this._activeSet) {
      this._activeSet = active;
      this.helmet.setVisible(active === 0);
      this.doom.setVisible(active === 1);
      this.scene.environment = active === 0 ? this.envs.warm : this.envs.green;
      this.scene.fog.density = active === 0 ? 0.35 : 0.07;
      this.scene.fog.color.set(active === 0 ? 0x000000 : 0x010302);
    }
    this.scene.environmentIntensity = L.env;

    const scale = (this.size.h * this.dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    this._applyCamera();
    if (active === 0) {
      this.helmet.setUScale(scale);
      this.helmet.update(t, dt, { pulse });
    } else {
      this.doom.setUScale(scale);
      this.doom.update(t, dt, this.camera);
    }

    // The final ember.
    const e = L.ember;
    if (e > 0 && e < 1) {
      this.ember.visible = true;
      this.ember.position.set(-0.16 + e * 0.07, 0.07 - e * 0.13, -0.85);
      const s = 0.05 * (1 - e * 0.6);
      this.ember.scale.set(s, s, 1);
      const fl = this.reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(t * 11) * Math.sin(t * 4.3);
      this.emberMat.opacity = THREE.MathUtils.smoothstep(e, 0, 0.12) * (1 - THREE.MathUtils.smoothstep(e, 0.55, 1)) * fl;
      this.emberMat.color.setRGB(1, 0.45, 0.12).lerp(new THREE.Color(0.2, 0.18, 0.16), THREE.MathUtils.smoothstep(e, 0.5, 0.95));
    } else {
      this.ember.visible = false;
    }

    this.bloom.strength = 0.4 * L.bloom;
    this.renderer.toneMappingExposure = L.exposure;
    const f = this.finish.uniforms;
    f.uTime.value = this.reducedMotion ? 0 : t;
    f.uFlash.value = this.reducedMotion ? L.flash * 0.3 : L.flash;
    f.uVignette.value = L.vignette;
    f.uFade.value = Math.min(1, L.exposure * 4);

    this.composer.render(dt);
    this._adapt(dt);
  }

  setPaused(paused) {
    this.running = !paused;
    if (!paused) this.timer.reset();
  }

  dispose() {
    this.running = false;
    window.removeEventListener("resize", this._resize);
    window.removeEventListener("pointermove", this._onPointer);
    this.timer.dispose();
    this.helmet.dispose();
    this.doom.dispose();
    this.emberMat.map.dispose();
    this.emberMat.dispose();
    this.envs.warm.dispose();
    this.envs.green.dispose();
    this.bokeh.dispose?.();
    this.bloom.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

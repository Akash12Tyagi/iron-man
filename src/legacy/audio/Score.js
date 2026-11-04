/*
 * The whole soundtrack, synthesised with the Web Audio API — no recordings,
 * so nothing to license and nothing to download.
 *
 *   one-shots ─┐                         ┌─ dry ────────────┐
 *   layers ────┼─ per-layer gain ────────┤                  ├─ compressor ─ master (mute) ─ out
 *              │                         └─ send ─ reverb ──┘
 *
 * Continuous layers (drones, hum, rumble, energy) follow levels the timeline
 * writes each frame. One-shots are fired by the cue track on forward
 * crossings. Nothing makes a sound until start() is called from a click.
 */

const LAYERS = ["warm", "hum", "rumble", "dark", "gears", "energy"];

export class Score {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.levels = Object.fromEntries(LAYERS.map((k) => [k, 0]));
  }

  get ready() {
    return !!this.ctx;
  }

  /** Must be called from a user gesture. */
  async start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: "interactive" });
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, ctx.currentTime, 0.4);
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.3;
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    this.dry = ctx.createGain();
    this.dry.connect(this.comp);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(4.2, 2.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.comp);
    this.send = ctx.createGain();
    this.send.connect(this.reverb);

    this.white = this._noise(2, "white");
    this.brown = this._noise(4, "brown");
    this._layers();
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return buf;
  }

  _noise(seconds, kind) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "brown") {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  _src(buf, loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    return s;
  }

  _osc(type, freq, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    return o;
  }

  _out(node, wet = 0.3) {
    node.connect(this.dry);
    if (wet > 0) {
      const g = this.ctx.createGain();
      g.gain.value = wet;
      node.connect(g).connect(this.send);
    }
  }

  _layers() {
    const ctx = this.ctx;
    this.layer = {};
    const make = (name, wet) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      this._out(g, wet);
      this.layer[name] = g;
      return g;
    };

    // Warm drone: an open fifth, softly filtered, breathing.
    {
      const g = make("warm", 0.5);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 380;
      lp.Q.value = 0.7;
      lp.connect(g);
      for (const [f, d] of [
        [55, -6],
        [55, 7],
        [82.41, -4],
        [110, 5],
        [164.8, 0],
      ]) {
        const o = this._osc("sawtooth", f, d);
        const og = ctx.createGain();
        og.gain.value = f > 150 ? 0.03 : 0.07;
        o.connect(og).connect(lp);
        o.start();
      }
      const lfo = this._osc("sine", 0.07);
      const lg = ctx.createGain();
      lg.gain.value = 140;
      lfo.connect(lg).connect(lp.frequency);
      lfo.start();
    }
    // Reactor hum: a mains-like tone with a little shimmer, tremolo.
    {
      const g = make("hum", 0.15);
      const trem = ctx.createGain();
      trem.gain.value = 0.8;
      trem.connect(g);
      for (const [type, f, a] of [
        ["sine", 110, 0.25],
        ["triangle", 220.6, 0.08],
        ["sine", 330.2, 0.03],
      ]) {
        const o = this._osc(type, f);
        const og = ctx.createGain();
        og.gain.value = a;
        o.connect(og).connect(trem);
        o.start();
      }
      const n = this._src(this.white);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 3200;
      bp.Q.value = 4;
      const ng = ctx.createGain();
      ng.gain.value = 0.012;
      n.connect(bp).connect(ng).connect(trem);
      n.start();
      const lfo = this._osc("sine", 5.3);
      const lg = ctx.createGain();
      lg.gain.value = 0.18;
      lfo.connect(lg).connect(trem.gain);
      lfo.start();
    }
    // Rumble: brown noise under a low lowpass.
    {
      const g = make("rumble", 0.2);
      const n = this._src(this.brown);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 110;
      const ng = ctx.createGain();
      ng.gain.value = 1.4;
      n.connect(lp).connect(ng).connect(g);
      n.start();
    }
    // Dark drone: a minor-second cluster with a tritone above, slowly opening.
    {
      const g = make("dark", 0.6);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 260;
      lp.Q.value = 2;
      lp.connect(g);
      for (const [f, d, a] of [
        [36.71, -5, 0.09],
        [38.89, 6, 0.07],
        [51.91, 0, 0.05],
        [73.42, 3, 0.04],
        [77.78, -3, 0.03],
      ]) {
        const o = this._osc("sawtooth", f, d);
        const og = ctx.createGain();
        og.gain.value = a;
        o.connect(og).connect(lp);
        o.start();
      }
      const lfo = this._osc("sine", 0.045);
      const lg = ctx.createGain();
      lg.gain.value = 120;
      lfo.connect(lg).connect(lp.frequency);
      lfo.start();
      this.darkFilter = lp;
    }
    // Gear groans: resonant noise wandering slowly.
    {
      const g = make("gears", 0.7);
      const n = this._src(this.brown);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 170;
      bp.Q.value = 9;
      const ng = ctx.createGain();
      ng.gain.value = 2.2;
      n.connect(bp).connect(ng).connect(g);
      n.start();
      const lfo = this._osc("sine", 0.11);
      const lg = ctx.createGain();
      lg.gain.value = 60;
      lfo.connect(lg).connect(bp.frequency);
      lfo.start();
    }
    // Energy hum: FM growl plus crackle.
    {
      const g = make("energy", 0.4);
      const car = this._osc("sine", 73.42);
      const mod = this._osc("sine", 146.84);
      const mg = ctx.createGain();
      mg.gain.value = 60;
      mod.connect(mg).connect(car.frequency);
      const cg = ctx.createGain();
      cg.gain.value = 0.25;
      car.connect(cg).connect(g);
      car.start();
      mod.start();
      this.energyMod = mg;
      const n = this._src(this.white);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2600;
      bp.Q.value = 1.2;
      const crackle = ctx.createGain();
      crackle.gain.value = 0;
      n.connect(bp).connect(crackle).connect(g);
      n.start();
      this.crackle = crackle;
    }
  }

  /** Continuous levels, 0 … 1, written by the timeline every frame. */
  update(levels) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const k of LAYERS) {
      const v = Math.max(0, levels[k] ?? 0);
      if (Math.abs(v - this.levels[k]) < 0.002) continue;
      this.levels[k] = v;
      const scale = { warm: 0.55, hum: 0.35, rumble: 0.9, dark: 0.7, gears: 0.25, energy: 0.5 }[k];
      this.layer[k].gain.setTargetAtTime(v * scale, t, 0.12);
    }
    const e = this.levels.energy;
    this.energyMod.gain.setTargetAtTime(40 + e * 260, t, 0.2);
    this.darkFilter.frequency.setTargetAtTime(220 + this.levels.dark * 180 + e * 400, t, 0.3);
    // Crackle: random flutter while the energy is up.
    this.crackle.gain.setTargetAtTime(e > 0.05 && Math.random() < 0.3 ? e * 0.12 * Math.random() : 0, t, 0.01);
  }

  // ---------------------------------------------------------------- one-shots
  _env(g, t, a, peak, d, curve = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(curve, t + a + d);
  }

  _thump(t, f0, f1, dur, peak, wet = 0.2) {
    const ctx = this.ctx;
    const o = this._osc("sine", f0);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    this._env(g, t, 0.006, peak, dur);
    o.connect(g);
    this._out(g, wet);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _burst(t, dur, type, freq, q, peak, wet = 0.2, buf = this.white) {
    const ctx = this.ctx;
    const n = this._src(buf, false);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this._env(g, t, 0.002, peak, dur);
    n.connect(f).connect(g);
    this._out(g, wet);
    n.start(t, Math.random() * 1.5);
    n.stop(t + dur + 0.05);
    return f;
  }

  /** Inharmonic partials of a struck plate. */
  _metal(t, f0, dur, peak, wet = 0.5) {
    const ctx = this.ctx;
    const ratios = [1, 2.76, 5.4, 8.93, 13.34];
    ratios.forEach((r, i) => {
      const o = this._osc("sine", f0 * r * (1 + (Math.random() - 0.5) * 0.01));
      const g = ctx.createGain();
      this._env(g, t, 0.002, peak / (1 + i * 0.9), dur / (1 + i * 0.6));
      o.connect(g);
      this._out(g, wet);
      o.start(t);
      o.stop(t + dur + 0.1);
    });
  }

  _sweep(t, type, f0, f1, dur, peak, filterF = 1200, q = 4, wet = 0.3) {
    const ctx = this.ctx;
    const o = this._osc(type, f0);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = filterF;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp).connect(g);
    this._out(g, wet);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name, arg) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime + 0.01;
    const fn = this[`_cue_${name}`];
    if (fn) fn.call(this, t, arg);
  }

  _cue_heartbeat(t, s = 1) {
    // Mechanical heart: a sub thump, a servo tick, then the softer second beat.
    this._thump(t, 78, 42, 0.2, 0.9 * s, 0.15);
    this._burst(t, 0.012, "highpass", 3500, 0.7, 0.12 * s, 0.1);
    this._metal(t + 0.004, 1900, 0.05, 0.015 * s, 0.1);
    this._thump(t + 0.27, 70, 40, 0.18, 0.6 * s, 0.15);
    this._burst(t + 0.27, 0.01, "highpass", 3000, 0.7, 0.07 * s, 0.1);
  }

  _cue_spark(t) {
    for (let i = 0; i < 6; i++) this._burst(t + Math.random() * 0.14, 0.012 + Math.random() * 0.02, "bandpass", 3000 + Math.random() * 3000, 2, 0.12, 0.2);
    this._sweep(t, "sawtooth", 180, 700, 0.5, 0.05, 900, 3);
  }

  _cue_ignite(t) {
    this._sweep(t, "sawtooth", 260, 1500, 1.4, 0.06, 1400, 2.5, 0.4);
    this._sweep(t + 0.05, "sine", 520, 2900, 1.3, 0.03, 2400, 3, 0.4);
    this._thump(t, 50, 38, 1.4, 0.35, 0.3);
    this._burst(t, 0.9, "lowpass", 700, 0.8, 0.12, 0.4, this.brown);
  }

  _cue_servo(t) {
    const ctx = this.ctx;
    const o = this._osc("sawtooth", 380);
    o.frequency.setValueAtTime(380, t);
    o.frequency.linearRampToValueAtTime(560, t + 0.12);
    o.frequency.linearRampToValueAtTime(420, t + 0.26);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(bp).connect(g);
    this._out(g, 0.25);
    o.start(t);
    o.stop(t + 0.35);
    this._burst(t, 0.25, "bandpass", 1600, 3, 0.04, 0.2);
    this._metal(t + 0.29, 1200, 0.15, 0.04, 0.3);
  }

  _cue_powerdown(t) {
    this._sweep(t, "sawtooth", 900, 50, 2.2, 0.06, 700, 2, 0.5);
    this._thump(t + 0.1, 60, 30, 1.6, 0.4, 0.4);
  }

  _cue_crack(t) {
    this._burst(t, 0.05, "highpass", 1800, 0.8, 0.35, 0.5);
    this._metal(t, 760, 1.1, 0.12, 0.6);
    this._burst(t + 0.05, 1.6, "lowpass", 300, 0.7, 0.25, 0.4, this.brown);
  }

  _cue_ring(t) {
    this._metal(t, 330, 4.5, 0.05, 0.95);
  }

  _cue_water(t) {
    // A drop on still water: a falling sine "plink", then soft lapping.
    const ctx = this.ctx;
    const o = this._osc("sine", 1400);
    o.frequency.setValueAtTime(1400, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.09);
    const g = ctx.createGain();
    this._env(g, t, 0.002, 0.08, 0.16);
    o.connect(g);
    this._out(g, 0.8);
    o.start(t);
    o.stop(t + 0.25);
    for (let i = 0; i < 4; i++) this._burst(t + 0.3 + i * 0.55 + Math.random() * 0.2, 0.5, "bandpass", 500 + Math.random() * 300, 1.5, 0.025, 0.6, this.brown);
  }

  _cue_forge(t) {
    // Red-hot iron meeting skin and air: a long hiss and a cooling tick.
    const f = this._burst(t, 1.8, "highpass", 3500, 0.7, 0.22, 0.5);
    f.frequency.setValueAtTime(5000, t);
    f.frequency.exponentialRampToValueAtTime(1800, t + 1.8);
    this._thump(t, 60, 35, 0.6, 0.35, 0.4);
    for (let i = 0; i < 5; i++) this._metal(t + 0.4 + i * 0.28 + Math.random() * 0.1, 2400 + Math.random() * 800, 0.06, 0.012, 0.5);
  }

  _cue_hall(t) {
    this._thump(t, 45, 28, 2.5, 0.6, 0.7);
    for (let i = 0; i < 9; i++) this._metal(t + 0.3 + i * 0.09 + Math.random() * 0.05, 900 + Math.random() * 600, 0.12, 0.025, 0.7);
  }

  _cue_footstep(t, i = 0) {
    // Heavy armoured footfall: sub, scuff, iron clank, long hall tail.
    const s = 0.85 + 0.15 * Math.random();
    this._thump(t, 70, 32, 0.45, 1.0 * s, 0.6);
    this._burst(t, 0.14, "lowpass", 500, 0.8, 0.35 * s, 0.5, this.brown);
    this._metal(t + 0.01, 120 + (i % 2) * 14, 0.7, 0.07 * s, 0.85);
    this._metal(t + 0.015, 640 + Math.random() * 80, 0.2, 0.03 * s, 0.6);
  }

  _cue_cloth(t) {
    const f = this._burst(t, 0.7, "bandpass", 500, 0.9, 0.12, 0.3);
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(1500, t + 0.3);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.7);
  }

  _cue_activate(t) {
    const ctx = this.ctx;
    const car = this._osc("sine", 110);
    const mod = this._osc("sine", 220);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(10, t);
    mg.gain.exponentialRampToValueAtTime(500, t + 1.6);
    mod.connect(mg).connect(car.frequency);
    car.frequency.setValueAtTime(110, t);
    car.frequency.exponentialRampToValueAtTime(220, t + 1.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    car.connect(g);
    this._out(g, 0.6);
    car.start(t);
    mod.start(t);
    car.stop(t + 2.7);
    mod.stop(t + 2.7);
    this._thump(t, 40, 55, 1.8, 0.4, 0.5);
    for (let i = 0; i < 14; i++) this._burst(t + 0.3 + Math.random() * 1.4, 0.01 + Math.random() * 0.03, "bandpass", 2000 + Math.random() * 4000, 1.5, 0.08, 0.3);
  }

  _cue_surge(t) {
    const f = this._burst(t, 2.0, "lowpass", 200, 1.2, 0.6, 0.7, this.white);
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(6000, t + 0.35);
    f.frequency.exponentialRampToValueAtTime(250, t + 2.0);
    this._thump(t, 90, 30, 1.6, 0.9, 0.6);
  }

  _cue_impact(t) {
    const ctx = this.ctx;
    this._thump(t, 52, 26, 3.5, 1.3, 0.6);
    this._burst(t, 1.8, "lowpass", 1400, 0.7, 0.6, 0.8, this.white);
    this._metal(t, 90, 3.5, 0.12, 0.9);
    // A low, brass-like minor chord that swells and decays.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(1300, t + 0.25);
    lp.frequency.exponentialRampToValueAtTime(250, t + 7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 8);
    lp.connect(g);
    this._out(g, 0.7);
    for (const [f, d] of [
      [36.71, 0],
      [73.42, -6],
      [73.42, 7],
      [110, 4],
      [146.83, -3],
      [174.61, 5],
    ]) {
      const o = this._osc("sawtooth", f, d);
      const og = ctx.createGain();
      og.gain.value = 0.12;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + 8.2);
    }
  }

  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.15);
  }

  suspend() {
    this.ctx?.suspend();
  }

  resume() {
    this.ctx?.resume();
  }

  dispose() {
    this.ctx?.close();
    this.ctx = null;
  }
}

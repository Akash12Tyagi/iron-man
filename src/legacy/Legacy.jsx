import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "@fontsource/cormorant-garamond/300.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource/jost/300.css";
import "@fontsource/jost/400.css";
import "@fontsource/jost/500.css";
import "./legacy.css";
import { ACTS, CARDS, DISCLAIMER, DURATION, FINALE, LINES, TITLE, VH_PER_UNIT } from "./content.js";
import { setupScroll, supportsWebGL } from "../lib/scroll.js";
import { Score } from "./audio/Score.js";

const pad = (n) => String(Math.floor(n)).padStart(2, "0");
// The film runs three minutes of "screen time"; 24 fps time-code.
function timecode(t) {
  const s = (t / DURATION) * 180;
  return `${pad(s / 3600)}:${pad((s / 60) % 60)}:${pad(s % 60)}:${pad((s % 1) * 24)}`;
}
const actAt = (t) => ACTS.reduce((a, act, i) => (t >= act.start - 0.12 ? i : a), 0);

function Fallback() {
  return (
    <div className="lp-fallback">
      <p className="lp-eyebrow">{TITLE}</p>
      <p className="lp-fallback__note">
        This experience needs WebGL 2, which this browser or device does not provide. Here is the screenplay instead.
      </p>
      {ACTS.map((act, i) => (
        <section key={act.n} className={`lp-fallback__act lp-tone-${act.tone}`}>
          <h2>
            Act {act.n} — {act.name}
          </h2>
          {LINES.filter((l) => l.at >= act.start && l.at < act.start + 3).map((l) => (
            <p key={l.text}>{l.text}</p>
          ))}
          {i === 3 && (
            <p className="lp-fallback__title">
              {FINALE.era.text} {FINALE.doom.text}
              <br />
              {FINALE.film.text}
            </p>
          )}
        </section>
      ))}
      <p className="lp-disclaimer">{DISCLAIMER}</p>
    </div>
  );
}

export default function Legacy() {
  const stageEl = useRef(null);
  const storyEl = useRef(null);
  const overlayEl = useRef(null);
  const tcEl = useRef(null);
  const railEl = useRef(null);
  const api = useRef({});
  const [phase, setPhase] = useState("loading"); // loading | gate | running | fallback
  const [progress, setProgress] = useState(0);
  const [act, setAct] = useState(0);
  const [muted, setMuted] = useState(true);
  const [idle, setIdle] = useState(true);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    document.title = `${TITLE} — The end of an era. The rise of Doom.`;
    document.documentElement.classList.add("lp-root", "lp-locked");
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const lowPower = coarse || (navigator.hardwareConcurrency || 8) <= 4 || Math.min(window.innerWidth, window.innerHeight) < 600;
    const scroll = setupScroll({ reducedMotion });
    scroll.lenis?.stop();
    const score = new Score();
    api.current = { scroll, score, reducedMotion };
    let disposed = false;
    let cleanupStage = () => {};

    if (!supportsWebGL()) {
      setPhase("fallback");
    } else {
      Promise.all([import("./three/Stage.js"), import("./three/choreography.js")])
        .then(async ([stageMod, chorMod]) => {
          const sculpts = await stageMod.prepareSculpts(lowPower ? 0.62 : 1, (p) => !disposed && setProgress(p));
          return { stageMod, chorMod, sculpts };
        })
        .then(({ stageMod, chorMod, sculpts }) => {
          if (disposed) return;
          let stage;
          try {
            stage = new stageMod.Stage(stageEl.current, { ...sculpts, reducedMotion, lowPower });
          } catch (err) {
            console.error(err);
            setPhase("fallback");
            return;
          }
          api.current.stage = stage;
          if (import.meta.env.DEV) window.__legacy = stage;
          stage.heart.onBeat = (s) => score.play("heartbeat", s);

          let actNow = 0;
          const chor = chorMod.buildChoreography(stage, storyEl.current, overlayEl.current, {
            reducedMotion,
            onCue: (c) => {
              if (c.name === "lastBeat") stage.beat(c.arg);
              else score.play(c.name, c.arg);
            },
            onUpdate: (t) => {
              if (tcEl.current) tcEl.current.textContent = timecode(t);
              railEl.current?.style.setProperty("--p", (t / DURATION).toFixed(4));
              const a = actAt(t);
              if (a !== actNow) {
                actNow = a;
                setAct(a);
              }
              setEnded(t > FINALE.note.at);
            },
          });
          api.current.chor = chor;
          const tick = () => {
            stage.tick();
            const D = stage.doom.state;
            score.update({
              ...chor.audio,
              hum: stage.helmet.power * (stage.look.set < 0.5 ? 1 : 0),
              energy: Math.min(1.2, D.orb * 0.8 + D.surge * (1 - D.surge) * 2),
            });
          };
          gsap.ticker.add(tick);
          // Stop drawing when the tab is hidden; the audio sleeps with it.
          const onVis = () => {
            stage.setPaused(document.hidden);
            if (document.hidden) score.suspend();
            else score.resume();
          };
          document.addEventListener("visibilitychange", onVis);
          document.fonts?.ready.then(() => !disposed && ScrollTrigger.refresh());
          setPhase("gate");

          cleanupStage = () => {
            document.removeEventListener("visibilitychange", onVis);
            gsap.ticker.remove(tick);
            chor.kill();
            stage.dispose();
          };
        })
        .catch((err) => {
          console.error(err);
          if (!disposed) setPhase("fallback");
        });
    }

    return () => {
      disposed = true;
      cleanupStage();
      score.dispose();
      scroll.destroy();
      document.documentElement.classList.remove("lp-root", "lp-locked");
    };
  }, []);

  // The typographic fallback is a normal scrolling page.
  useEffect(() => {
    if (phase === "fallback") document.documentElement.classList.remove("lp-locked");
  }, [phase]);

  // The scroll cue fades as soon as the reader scrolls and returns when idle.
  useEffect(() => {
    if (phase !== "running") return undefined;
    let timer;
    const onScroll = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), 6000);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
    };
  }, [phase]);

  const enter = useCallback(async (withSound) => {
    const { score, scroll } = api.current;
    if (withSound) {
      await score.start();
      score.setMuted(false);
      setMuted(false);
    }
    document.documentElement.classList.remove("lp-locked");
    scroll.lenis?.start();
    setPhase("running");
    requestAnimationFrame(() => ScrollTrigger.refresh());
  }, []);

  const toggleSound = useCallback(async () => {
    const { score } = api.current;
    if (!score.ready) await score.start();
    const next = !muted;
    score.setMuted(next);
    setMuted(next);
  }, [muted]);

  const replay = useCallback(() => {
    const { scroll, reducedMotion } = api.current;
    if (scroll.lenis) scroll.lenis.scrollTo(0, { duration: 2.5 });
    else window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  }, []);

  if (phase === "fallback") return <Fallback />;

  const tone = ACTS[act].tone;
  return (
    <div className={`lp lp--${phase} lp-tone-${tone}`}>
      <div className="lp-stage" ref={stageEl} />

      <div className="lp-overlay" ref={overlayEl} aria-live="off">
        <div className="lp-bars" aria-hidden="true" />
        {CARDS.map((c, i) => (
          <p key={i} className="lp-card" data-card={i}>
            <span>Act {ACTS[c.act].n}</span>
            {ACTS[c.act].name}
          </p>
        ))}
        {LINES.map((l, i) => (
          <p key={i} className={`lp-line lp-line--${l.tone}${l.pos ? ` lp-line--${l.pos}` : ""}`} data-line={i}>
            {l.text}
          </p>
        ))}
        <div className="lp-finale">
          <p className="lp-finale__era" data-final="era">
            {FINALE.era.text}
          </p>
          <h2 className="lp-finale__doom" data-final="doom">
            {FINALE.doom.text}
          </h2>
          <p className="lp-finale__film" data-final="film">
            {FINALE.film.text}
          </p>
          <div className="lp-finale__note" data-final="note">
            <button type="button" className="lp-btn lp-btn--ghost" onClick={replay} tabIndex={ended ? 0 : -1}>
              Replay from the first heartbeat
            </button>
            <p className="lp-disclaimer">{DISCLAIMER}</p>
          </div>
        </div>
      </div>

      {/* Story text for screen readers; the visual copy above is decorative. */}
      <div className="lp-sr">
        <h1>{TITLE}</h1>
        {LINES.map((l) => (
          <p key={l.text}>{l.text}</p>
        ))}
        <p>
          {FINALE.era.text} {FINALE.doom.text} {FINALE.film.text}
        </p>
      </div>

      <div className="lp-hud" aria-hidden={phase !== "running"}>
        <div className="lp-hud__act">
          <span className="lp-hud__num">Act {ACTS[act].n}</span>
          <span className="lp-hud__name" key={act}>
            {ACTS[act].name}
          </span>
        </div>
        <div className="lp-hud__tc" ref={tcEl}>
          00:00:00:00
        </div>
        <div className="lp-rail" ref={railEl} aria-hidden="true">
          {ACTS.map((a, i) => (
            <span key={a.n} className={`lp-rail__seg${i === act ? " is-on" : ""}`} style={{ "--i": i }}>
              <i />
            </span>
          ))}
        </div>
        <button type="button" className={`lp-sound${muted ? "" : " is-on"}`} onClick={toggleSound} aria-pressed={!muted}>
          <span className="lp-sound__bars" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          {muted ? "Sound off" : "Sound on"}
        </button>
        <div className={`lp-cue${idle && !ended ? " is-on" : ""}`} aria-hidden="true">
          <span>Scroll</span>
          <i />
        </div>
      </div>

      <div className="lp-gate" aria-hidden={phase === "running"}>
        <div className="lp-gate__inner">
          <p className="lp-eyebrow">A cinematic experience in four acts</p>
          <h1 className="lp-gate__title">{TITLE}</h1>
          <p className="lp-gate__sub">The end of an era. The rise of Doom.</p>
          {phase === "loading" ? (
            <div className="lp-gate__load" role="status" aria-label="Loading">
              <span style={{ transform: `scaleX(${0.08 + progress * 0.92})` }} />
              <em>Forging the armour</em>
            </div>
          ) : (
            <div className="lp-gate__actions">
              <button type="button" className="lp-btn" onClick={() => enter(true)} disabled={phase !== "gate"}>
                Enter with sound
              </button>
              <button type="button" className="lp-btn lp-btn--ghost" onClick={() => enter(false)} disabled={phase !== "gate"}>
                Enter in silence
              </button>
            </div>
          )}
          <p className="lp-gate__hint">Headphones recommended · Scroll to direct the camera</p>
        </div>
      </div>

      <main className="lp-story" ref={storyEl} style={{ height: `${DURATION * VH_PER_UNIT + 100}vh` }} aria-hidden="true" />
    </div>
  );
}

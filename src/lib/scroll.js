import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

gsap.registerPlugin(ScrollTrigger);

/**
 * Smooth scrolling driven from GSAP's ticker so Lenis and ScrollTrigger read
 * the same scroll position every frame (per the Lenis README). Reduced
 * motion keeps native scrolling.
 */
export function setupScroll({ reducedMotion }) {
  if (reducedMotion) {
    return { lenis: null, destroy() {} };
  }
  const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, touchMultiplier: 1.2, anchors: true });
  lenis.on("scroll", ScrollTrigger.update);
  const raf = (time) => lenis.raf(time * 1000);
  gsap.ticker.add(raf);
  gsap.ticker.lagSmoothing(0);
  return {
    lenis,
    destroy() {
      gsap.ticker.remove(raf);
      lenis.destroy();
    },
  };
}

export function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGL2RenderingContext && c.getContext("webgl2"));
  } catch {
    return false;
  }
}

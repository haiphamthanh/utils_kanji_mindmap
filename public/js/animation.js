// animation.js — entrance / exit choreography for the graph.

const prefersReduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const raf2 = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));

/**
 * Center pops in, edges draw out, then nodes stagger in.
 */
export function playEnter({ edgeEls, nodeEls }) {
  if (prefersReduced()) {
    edgeEls.forEach((el) => el.classList.add("drawn"));
    nodeEls.forEach((el) => el.classList.add("visible"));
    return;
  }

  edgeEls.forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i * 16, 240)}ms`;
  });

  nodeEls.forEach((el, i) => {
    // center (index 0) first, then stagger the rest
    el.style.setProperty("--delay", `${i === 0 ? 0 : Math.min(i * 45, 520)}ms`);
  });

  raf2(() => {
    edgeEls.forEach((el) => el.classList.add("drawn"));
    nodeEls.forEach((el) => el.classList.add("visible"));
  });
}

/**
 * Fade the current graph out. Resolves when done.
 */
export function playExit(dom) {
  if (prefersReduced()) return Promise.resolve();

  return new Promise((resolve) => {
    dom.nodes.classList.add("exiting");
    dom.edges.classList.add("exiting");
    setTimeout(() => {
      dom.nodes.classList.remove("exiting");
      dom.edges.classList.remove("exiting");
      resolve();
    }, 180);
  });
}

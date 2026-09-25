// interaction.js — zoom / pan viewport controller.

const MIN_SCALE = 0.05;
const MAX_SCALE = 3;
const DRAG_THRESHOLD = 5; // px — below this a pointer gesture is a click

export function createViewport(svg, viewport) {
  let scale = 1;
  let tx = 0;
  let ty = 0;

  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let startTx = 0;
  let startTy = 0;
  let suppressClick = false;

  const listeners = new Set();

  function apply() {
    viewport.setAttribute("transform", `translate(${tx} ${ty}) scale(${scale})`);
    listeners.forEach((fn) => fn({ scale, tx, ty }));
  }

  function onChange(fn) {
    listeners.add(fn);
    fn({ scale, tx, ty });
    return () => listeners.delete(fn);
  }

  function setTransform(nextScale, nextTx, nextTy) {
    scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    tx = nextTx;
    ty = nextTy;
    apply();
  }

  function zoomAt(factor, cx, cy) {
    const next = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
    const k = next / scale;
    tx = cx - k * (cx - tx);
    ty = cy - k * (cy - ty);
    scale = next;
    apply();
  }

  function zoomBy(factor) {
    const rect = svg.getBoundingClientRect();
    zoomAt(factor, rect.width / 2, rect.height / 2);
  }

  function zoomTo(next) {
    const rect = svg.getBoundingClientRect();
    zoomAt(clamp(next, MIN_SCALE, MAX_SCALE) / scale, rect.width / 2, rect.height / 2);
  }

  function reset() {
    setTransform(1, 0, 0);
  }

  // ---- wheel zoom -------------------------------------------------
  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
    },
    { passive: false }
  );

  // ---- pointer pan ------------------------------------------------
  svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    startTx = tx;
    startTy = ty;
    suppressClick = false;
    // Không capture ở đây: capture sẽ làm click của node bị chuyển sang SVG.
  });

  svg.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      moved = true;
      svg.classList.add("grabbing");
      try {
        svg.setPointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
    }
    if (moved) {
      tx = startTx + dx;
      ty = startTy + dy;
      apply();
    }
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    svg.classList.remove("grabbing");
    suppressClick = moved;
    if (e && svg.hasPointerCapture && svg.hasPointerCapture(e.pointerId)) {
      try {
        svg.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
    }
  }

  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  return {
    onChange,
    setTransform,
    zoomBy,
    zoomTo,
    reset,
    /** true once if the last gesture was a drag (used to cancel click) */
    consumeClickSuppressed() {
      const value = suppressClick;
      suppressClick = false;
      return value;
    },
    get scale() {
      return scale;
    },
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

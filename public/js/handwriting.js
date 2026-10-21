// handwriting.js — pad viết tay + nhận diện Hán tự.
//
// Offline : KanjiCanvas (MIT — public/vendor/) chạy hoàn toàn trong trình duyệt.
// Online  : /api/handwriting (server proxy Google IME), chỉ dùng khi offline
//           không nhận ra hoặc không tải được bộ nhận diện.
//
// Pad giữ nét vẽ ở hệ toạ độ logic 0..300, tự vẽ lại (để đồng bộ theme và hỗ
// trợ DPR), rồi đẩy nét vào KanjiCanvas.recordedPattern_* khi cần nhận diện.

const LOGICAL_SIZE = 300;
const AUTO_RECOGNIZE_MS = 700;
const ENGINE_ID = "hw";
const ENGINE_FILES = ["/vendor/kanji-canvas.min.js", "/vendor/ref-patterns.js"];

const ENGINE_LABELS = {
  offline: "Offline",
  online: "Google",
};

let enginePromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Không tải được ${src}`));
    document.head.appendChild(script);
  });
}

// Tải engine lần đầu mở pad; 6.4MB ref-patterns nên chỉ tải khi thật cần.
function loadEngine() {
  if (hasEngine()) return Promise.resolve();
  if (!enginePromise) {
    enginePromise = loadScript(ENGINE_FILES[0])
      .then(() => loadScript(ENGINE_FILES[1]))
      .then(() => {
        if (!hasEngine()) throw new Error("Bộ nhận diện không hợp lệ.");
      })
      .catch((err) => {
        enginePromise = null;
        throw err;
      });
  }
  return enginePromise;
}

function hasEngine() {
  return Boolean(
    window.KanjiCanvas &&
      Array.isArray(window.KanjiCanvas.refPatterns) &&
      window.KanjiCanvas.refPatterns.length
  );
}

function parseCandidates(raw) {
  if (Array.isArray(raw)) return raw.filter((c) => typeof c === "string");
  if (typeof raw !== "string") return [];
  return raw.split(/\s+/).filter(Boolean);
}

export function createHandwritingPad({ els, onResults }) {
  const {
    panel,
    canvas,
    hint,
    engine: engineEl,
    undoBtn,
    clearBtn,
    recognizeBtn,
    onlineBtn,
    results,
    status,
    closeBtn,
  } = els;

  const ctx = canvas.getContext("2d");

  let strokes = [];
  let drawing = false;
  let busy = false;
  let autoTimer = null;
  let lastSource = "offline";
  let inkColor = null;

  // -----------------------------------------------------------
  // Vẽ
  // -----------------------------------------------------------

  function pointFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 1;
    const h = rect.height || 1;
    return [
      ((e.clientX - rect.left) / w) * LOGICAL_SIZE,
      ((e.clientY - rect.top) / h) * LOGICAL_SIZE,
    ];
  }

  function strokeColor() {
    if (inkColor) return inkColor;
    const value = getComputedStyle(canvas).getPropertyValue("--text").trim();
    inkColor = value || "#243447";
    return inkColor;
  }

  function paint() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    const color = strokeColor();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const stroke of strokes) {
      if (!stroke.length) continue;
      if (stroke.length === 1) {
        ctx.beginPath();
        ctx.arc(stroke[0][0], stroke[0][1], 2.5, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      ctx.beginPath();
      ctx.moveTo(stroke[0][0], stroke[0][1]);
      for (let i = 1; i < stroke.length - 1; i++) {
        const mx = (stroke[i][0] + stroke[i + 1][0]) / 2;
        const my = (stroke[i][1] + stroke[i + 1][1]) / 2;
        ctx.quadraticCurveTo(stroke[i][0], stroke[i][1], mx, my);
      }
      const last = stroke[stroke.length - 1];
      ctx.lineTo(last[0], last[1]);
      ctx.stroke();
    }

    if (hint) hint.hidden = strokes.length > 0;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.max(1, Math.round(rect.width * dpr));
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    const scale = canvas.width / LOGICAL_SIZE;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    paint();
  }

  // -----------------------------------------------------------
  // Nét vẽ
  // -----------------------------------------------------------

  function startStroke(e) {
    if (busy) return;
    if (e.button !== undefined && e.button !== 0) return;
    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (_) {
        /* Safari cũ có thể ném lỗi — bỏ qua */
      }
    }
    drawing = true;
    clearTimeout(autoTimer);
    strokes.push([pointFromEvent(e)]);
    paint();
  }

  function moveStroke(e) {
    if (!drawing || !strokes.length) return;
    const point = pointFromEvent(e);
    const stroke = strokes[strokes.length - 1];
    const last = stroke[stroke.length - 1];
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 1) return;
    stroke.push(point);
    paint();
  }

  function endStroke() {
    if (!drawing) return;
    drawing = false;
    scheduleAutoRecognize();
  }

  function clearInk() {
    clearTimeout(autoTimer);
    strokes = [];
    hideResults();
    setStatus("");
    showOnline(false);
    paint();
  }

  // -----------------------------------------------------------
  // Nhận diện
  // -----------------------------------------------------------

  function bindEngineCanvas() {
    const engine = window.KanjiCanvas;
    engine["canvas_" + ENGINE_ID] = canvas;
    engine["ctx_" + ENGINE_ID] = ctx;
    engine["w_" + ENGINE_ID] = canvas.width;
    engine["h_" + ENGINE_ID] = canvas.height;
    engine["recordedPattern_" + ENGINE_ID] = [];
    engine["flagDown_" + ENGINE_ID] = false;
    engine["currentLine_" + ENGINE_ID] = null;
  }

  async function recognizeLocal() {
    await loadEngine();
    bindEngineCanvas();

    const engine = window.KanjiCanvas;
    engine["recordedPattern_" + ENGINE_ID] = strokes.map((stroke) =>
      stroke.map(([x, y]) => [x, y])
    );

    // KanjiCanvas in debug cho chữ 委 trong fineClassification — tắt tạm.
    const nativeLog = console.log;
    console.log = () => {};
    try {
      return parseCandidates(engine.recognize(ENGINE_ID));
    } finally {
      console.log = nativeLog;
    }
  }

  async function recognizeOnline() {
    const response = await fetch("/api/handwriting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strokes: strokes.map((stroke) =>
          stroke.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])
        ),
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || !Array.isArray(data.candidates)) {
      throw new Error((data && data.error) || "Dịch vụ nhận diện online không phản hồi.");
    }
    return data.candidates.filter((c) => typeof c === "string");
  }

  async function recognize({ online = false } = {}) {
    if (busy) return;
    if (!strokes.length) {
      setStatus("Viết một chữ Hán trước đã.");
      return;
    }
    const points = strokes.reduce((sum, stroke) => sum + stroke.length, 0);
    if (points < 3) {
      setStatus("Viết rõ hơn một chút nhé.");
      return;
    }

    busy = true;
    clearTimeout(autoTimer);
    setBusy(true);
    showOnline(false);
    setEngineLabel(online ? "online" : "offline");
    setStatus(online ? "Đang gọi Google…" : "Đang nhận diện…");

    try {
      const candidates = online ? await recognizeOnline() : await recognizeLocal();
      lastSource = online ? "online" : "offline";

      if (!candidates.length) {
        hideResults();
        setStatus(
          online
            ? "Google không nhận ra chữ nào. Thử viết lại."
            : "Chưa nhận ra chữ nào. Thử viết lại hoặc dùng Google."
        );
        if (!online) showOnline(navigator.onLine !== false);
        return;
      }

      onResults(candidates, lastSource);
    } catch (err) {
      hideResults();
      if (online) {
        setStatus("Không gọi được Google. Kiểm tra kết nối mạng.");
      } else {
        setStatus("Không tải được bộ nhận diện offline.");
        showOnline(navigator.onLine !== false);
      }
      console.warn(err);
    } finally {
      busy = false;
      setBusy(false);
      paint();
    }
  }

  function scheduleAutoRecognize() {
    clearTimeout(autoTimer);
    if (!strokes.length) return;
    autoTimer = setTimeout(() => recognize(), AUTO_RECOGNIZE_MS);
  }

  // -----------------------------------------------------------
  // UI helpers
  // -----------------------------------------------------------

  function setStatus(text) {
    if (status) status.textContent = text || "";
  }

  function setEngineLabel(source) {
    if (engineEl) engineEl.textContent = ENGINE_LABELS[source] || "Offline";
  }

  function setBusy(value) {
    recognizeBtn.disabled = value;
    undoBtn.disabled = value;
    clearBtn.disabled = value;
  }

  function showOnline(value) {
    if (!onlineBtn) return;
    onlineBtn.hidden = !value;
  }

  function hideResults() {
    if (!results) return;
    results.replaceChildren();
    results.hidden = true;
  }

  // -----------------------------------------------------------
  // Vòng đời
  // -----------------------------------------------------------

  function open() {
    panel.hidden = false;
    inkColor = null;
    clearInk();
    setEngineLabel("offline");
    requestAnimationFrame(() => {
      resize();
      canvas.focus({ preventScroll: true });
    });

    if (!hasEngine()) {
      setStatus("Đang tải bộ nhận diện…");
      loadEngine()
        .then(() => {
          if (!strokes.length) setStatus("Viết một chữ Hán vào ô vuông");
        })
        .catch(() => {
          setStatus("Không tải được bộ nhận diện offline.");
          showOnline(navigator.onLine !== false);
        });
    } else {
      setStatus("Viết một chữ Hán vào ô vuông");
    }
  }

  function close() {
    drawing = false;
    clearTimeout(autoTimer);
    clearInk();
    panel.hidden = true;
  }

  function undo() {
    if (busy || !strokes.length) return;
    strokes.pop();
    if (!strokes.length) {
      hideResults();
      setStatus("");
      showOnline(false);
      paint();
      return;
    }
    paint();
    scheduleAutoRecognize();
  }

  // -----------------------------------------------------------
  // Wiring
  // -----------------------------------------------------------

  canvas.tabIndex = 0;
  canvas.addEventListener("pointerdown", startStroke);
  canvas.addEventListener("pointermove", moveStroke);
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);
  // Bắt pointerup ngoài khung (nhỡ trình duyệt không giữ pointer capture).
  window.addEventListener("pointerup", endStroke);
  window.addEventListener("pointercancel", endStroke);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  undoBtn.addEventListener("click", undo);
  clearBtn.addEventListener("click", () => {
    if (busy) return;
    clearInk();
    setStatus("Viết một chữ Hán vào ô vuông");
    canvas.focus({ preventScroll: true });
  });
  recognizeBtn.addEventListener("click", () => recognize());
  if (onlineBtn) {
    onlineBtn.addEventListener("click", () => recognize({ online: true }));
  }
  if (closeBtn) closeBtn.addEventListener("click", close);

  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => {
      if (!panel.hidden) resize();
    }).observe(canvas);
  }

  return {
    open,
    close,
    clear: clearInk,
    recognize,
    isOpen: () => !panel.hidden,
  };
}

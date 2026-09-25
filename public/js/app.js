// app.js — controller: state, search, navigation, wiring.

import { loadData, searchKanji } from "./data.js";
import { buildGraph } from "./graph.js";
import { computeLayout } from "./layout.js";
import { renderGraph, renderDetail, jlptColor } from "./render.js";
import { playEnter, playExit } from "./animation.js";
import { createViewport } from "./interaction.js";

const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"];
const DEFAULT_KANJI = "車";

const dom = {
  svg: document.getElementById("kanjiGraph"),
  viewport: document.getElementById("viewport"),
  edges: document.getElementById("edges"),
  nodes: document.getElementById("nodes"),
  area: document.querySelector(".graph-area"),
  search: document.getElementById("searchInput"),
  clearSearch: document.getElementById("clearSearch"),
  suggestions: document.getElementById("suggestions"),
  createBtn: document.getElementById("createBtn"),
  jlptFilters: document.getElementById("jlptFilters"),
  depthSelect: document.getElementById("depthSelect"),
  layoutSelect: document.getElementById("layoutSelect"),
  zoomOut: document.getElementById("zoomOut"),
  zoomIn: document.getElementById("zoomIn"),
  zoomRange: document.getElementById("zoomRange"),
  fitBtn: document.getElementById("fitBtn"),
  themeBtn: document.getElementById("themeBtn"),
  historyBtn: document.getElementById("historyBtn"),
  detailPanel: document.getElementById("detailPanel"),
  tooltip: document.getElementById("tooltip"),
  emptyState: document.getElementById("emptyState"),
  breadcrumb: document.getElementById("breadcrumb"),
  status: document.getElementById("status"),
};

const state = {
  data: null,
  center: null,
  depth: 3,
  layoutMode: "grid",
  jlpt: new Set(JLPT_LEVELS),
  pinnedId: null,
  path: [],
  rendered: null,
  layout: null,
};

let nodeClickTimer = null;

const viewport = createViewport(dom.svg, dom.viewport);

// =============================================================
// Boot
// =============================================================

init();

async function init() {
  initTheme();
  buildJlptChips();
  wireToolbar();
  wireKeyboard();
  viewport.onChange(({ scale }) => {
    dom.zoomRange.value = Math.round(scale * 100);
  });

  try {
    state.data = await loadData();
  } catch (err) {
    console.error(err);
    showEmpty("Không tải được dữ liệu Kanji.");
    return;
  }

  const params = new URLSearchParams(location.search);
  const initial = params.get("kanji") || DEFAULT_KANJI;
  const start = state.data.kanji[initial] ? initial : DEFAULT_KANJI;

  dom.search.value = start;
  state.path = [start];
  state.center = start;
  addHistory(start);
  await renderCurrent({ animate: true, fit: true, push: false });

  window.addEventListener("popstate", () => {
    const id = new URLSearchParams(location.search).get("kanji");
    if (id && state.data.kanji[id]) setCenter(id, { mode: "navigate", animate: true });
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.center) renderCurrent({ animate: false, fit: false, push: false });
    }, 160);
  });
}

// =============================================================
// Render pipeline
// =============================================================

async function renderCurrent({ animate = true, fit = true, push = false } = {}) {
  const entry = state.data.kanji[state.center];
  if (!entry) {
    showEmpty();
    return;
  }
  hideEmpty();

  const pinned = state.pinnedId;

  const graph = buildGraph(state.center, {
    depth: state.depth,
    data: state.data,
    jlpt: state.jlpt,
  });

  if (animate && state.rendered) {
    await playExit(dom);
  }

  const layout = computeLayout(graph, { mode: state.layoutMode });
  state.layout = layout;
  state.rendered = renderGraph(layout, state.data, dom);

  bindNodeEvents(state.rendered);

  // Giữ lại ghim tô sáng nếu node vẫn còn sau khi render.
  if (pinned && state.rendered.byId.has(pinned)) {
    state.pinnedId = pinned;
    applyFocus(pinned);
    markPinned(pinned);
  } else {
    state.pinnedId = null;
  }

  if (animate) {
    playEnter(state.rendered);
  } else {
    state.rendered.edgeEls.forEach((el) => el.classList.add("drawn"));
    state.rendered.nodeEls.forEach((el) => el.classList.add("visible"));
  }

  if (fit) fitToContent();

  renderDetailPanel(state.pinnedId || state.center);
  renderBreadcrumb();
  renderStatus(graph, layout);

  if (push) updateURL(state.center);
}

function setCenter(id, { mode = "navigate", animate = true } = {}) {
  if (!state.data.kanji[id]) return;

  state.pinnedId = null;
  clearFocus();

  if (mode === "reset") {
    state.path = [id];
  } else {
    const idx = state.path.indexOf(id);
    state.path = idx >= 0 ? state.path.slice(0, idx + 1) : [...state.path, id];
  }

  state.center = id;
  dom.search.value = id;
  addHistory(id);
  renderCurrent({ animate, fit: true, push: true });
}

function fitToContent() {
  if (!state.layout) return;
  const rect = dom.svg.getBoundingClientRect();
  const b = state.layout.bounds;
  const pad = 90;

  const gw = Math.max(b.maxX - b.minX, 1);
  const gh = Math.max(b.maxY - b.minY, 1);
  const scale = Math.min(
    (rect.width - pad * 2) / gw,
    (rect.height - pad * 2) / gh,
    1.6
  );

  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  viewport.setTransform(scale, rect.width / 2 - scale * cx, rect.height / 2 - scale * cy);
}

// =============================================================
// Node events: click, hover focus, tooltip
// =============================================================

function bindNodeEvents({ nodeEls }) {
  for (const el of nodeEls) {
    const id = el.dataset.id;

    el.addEventListener("mouseenter", () => {
      if (state.pinnedId) {
        showTooltip(el, state.data.kanji[id]);
        return;
      }
      applyFocus(id);
      showTooltip(el, state.data.kanji[id]);
    });

    el.addEventListener("mouseleave", () => {
      hideTooltip();
      if (state.pinnedId) return;
      clearFocus();
    });
  }
}

// Click/dblclick bắt ở SVG (hit-test theo toạ độ) để không phụ thuộc target.
function nodeFromEvent(e) {
  for (const el of [e.target, document.elementFromPoint(e.clientX, e.clientY)]) {
    if (el && el.closest) {
      const node = el.closest(".kanji-node");
      if (node) return node;
    }
  }
  return null;
}

function pinFocus(id) {
  state.pinnedId = id;
  applyFocus(id);
  markPinned(id);
  renderDetailPanel(id);
}

function unpinFocus() {
  if (!state.pinnedId) return;
  state.pinnedId = null;
  clearFocus();
  renderDetailPanel(state.center);
}

function markPinned(id) {
  for (const node of dom.nodes.children) {
    node.classList.toggle("pinned", node.dataset.id === id);
  }
}

function applyFocus(id) {
  const related = new Set([id, state.center]);

  for (const edge of dom.edges.children) {
    const touches = edge.dataset.source === id || edge.dataset.target === id;
    edge.classList.toggle("highlight", touches);
    if (touches) {
      related.add(edge.dataset.source);
      related.add(edge.dataset.target);
    }
  }

  for (const node of dom.nodes.children) {
    node.classList.toggle("related", related.has(node.dataset.id));
  }

  dom.svg.classList.add("focusing");
}

function clearFocus() {
  dom.svg.classList.remove("focusing");
  for (const edge of dom.edges.children) edge.classList.remove("highlight");
  for (const node of dom.nodes.children) {
    node.classList.remove("related", "pinned");
  }
}

function showTooltip(el, entry) {
  if (!entry) return;
  const areaRect = dom.area.getBoundingClientRect();
  const rect = el.getBoundingClientRect();

  const vi = entry.meanings_vi || [];
  const lv = state.data.level[entry.character]?.level;

  dom.tooltip.innerHTML = `
    <div class="tooltip-char">
      ${entry.character}
      ${entry.jlpt ? `<span class="detail-badge" style="--jlpt:${jlptColor(entry.jlpt)}">${entry.jlpt}</span>` : ""}
    </div>
    <div class="tooltip-reading">${entry.chosen_name || "—"}${lv ? ` · Cấp ${lv}` : ""}</div>
    <div class="tooltip-meaning">${vi.join(", ") || "—"}</div>
  `;
  dom.tooltip.style.left = `${rect.left - areaRect.left + rect.width / 2}px`;
  dom.tooltip.style.top = `${rect.top - areaRect.top - 10}px`;
  dom.tooltip.hidden = false;
}

function hideTooltip() {
  dom.tooltip.hidden = true;
}

// =============================================================
// Detail panel
// =============================================================

function renderDetailPanel(id) {
  const entry = state.data.kanji[id];
  if (!entry) return;
  dom.detailPanel.innerHTML = renderDetail(entry, state.data);
  dom.detailPanel.hidden = false;

  const btn = dom.detailPanel.querySelector("[data-action='copy']");
  if (btn) {
    btn.addEventListener("click", () => {
      const url = `${location.origin}${location.pathname}?kanji=${encodeURIComponent(id)}`;
      navigator.clipboard?.writeText(url);
      btn.textContent = "Đã sao chép!";
      setTimeout(() => (btn.textContent = "Sao chép liên kết"), 1200);
    });
  }
}

// =============================================================
// Breadcrumb + history
// =============================================================

function renderBreadcrumb() {
  dom.breadcrumb.replaceChildren();
  state.path.forEach((id, i) => {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.className = "sep";
      sep.textContent = "→";
      dom.breadcrumb.appendChild(sep);
    }
    const btn = document.createElement("button");
    btn.textContent = id;
    if (i === state.path.length - 1) btn.classList.add("current");
    btn.addEventListener("click", () => setCenter(id, { mode: "navigate" }));
    dom.breadcrumb.appendChild(btn);
  });
}

function addHistory(id) {
  try {
    const history = JSON.parse(localStorage.getItem("kanji-history") || "[]");
    const next = [id, ...history.filter((h) => h !== id)].slice(0, 10);
    localStorage.setItem("kanji-history", JSON.stringify(next));
  } catch (_) {
    /* ignore */
  }
}

function openHistoryMenu() {
  const existing = document.querySelector(".history-popover");
  if (existing) {
    existing.remove();
    return;
  }

  let history = [];
  try {
    history = JSON.parse(localStorage.getItem("kanji-history") || "[]");
  } catch (_) {
    history = [];
  }

  const menu = document.createElement("div");
  menu.className = "history-popover";

  if (!history.length) {
    menu.innerHTML = `<div class="sug-empty">Chưa có lịch sử</div>`;
  } else {
    for (const id of history) {
      const item = document.createElement("button");
      item.className = "history-item";
      item.textContent = id;
      item.style.setProperty("--jlpt", jlptColor(state.data.kanji[id]?.jlpt));
      item.addEventListener("click", () => {
        setCenter(id, { mode: "reset" });
        menu.remove();
      });
      menu.appendChild(item);
    }
  }

  const rect = dom.historyBtn.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 8}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;
  document.body.appendChild(menu);

  setTimeout(() => {
    document.addEventListener(
      "click",
      (e) => {
        if (!menu.contains(e.target) && e.target !== dom.historyBtn) menu.remove();
      },
      { once: true }
    );
  }, 0);
}

// =============================================================
// Toolbar
// =============================================================

function wireToolbar() {
  dom.search.addEventListener("input", () => {
    const q = dom.search.value;
    dom.clearSearch.hidden = !q;
    showSuggestions(q);
  });

  dom.search.addEventListener("keydown", (e) => {
    const items = [...dom.suggestions.querySelectorAll("li[data-id]")];
    if (!items.length) {
      if (e.key === "Enter") createFromSearch();
      return;
    }
    let index = items.findIndex((li) => li.classList.contains("active"));
    if (e.key === "ArrowDown") {
      e.preventDefault();
      index = Math.min(index + 1, items.length - 1);
      setActiveSuggestion(items, index);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      index = Math.max(index - 1, 0);
      setActiveSuggestion(items, index);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = items[Math.max(index, 0)];
      selectKanji(chosen.dataset.id);
    }
  });

  dom.clearSearch.addEventListener("click", () => {
    dom.search.value = "";
    dom.clearSearch.hidden = true;
    hideSuggestions();
    dom.search.focus();
  });

  dom.createBtn.addEventListener("click", createFromSearch);

  dom.depthSelect.addEventListener("change", () => {
    state.depth = Number(dom.depthSelect.value);
    if (state.center) renderCurrent({ animate: true, fit: true, push: false });
  });

  dom.layoutSelect.addEventListener("change", () => {
    state.layoutMode = dom.layoutSelect.value;
    if (state.center) renderCurrent({ animate: false, fit: true, push: false });
  });

  dom.zoomIn.addEventListener("click", () => viewport.zoomBy(1.18));
  dom.zoomOut.addEventListener("click", () => viewport.zoomBy(1 / 1.18));
  dom.fitBtn.addEventListener("click", fitToContent);
  dom.zoomRange.addEventListener("input", () => {
    viewport.zoomTo(Number(dom.zoomRange.value) / 100);
  });

  dom.themeBtn.addEventListener("click", toggleTheme);
  dom.historyBtn.addEventListener("click", openHistoryMenu);

  document.addEventListener("click", (e) => {
    if (!dom.suggestions.contains(e.target) && e.target !== dom.search) {
      hideSuggestions();
    }
  });

  // Click node: ghim tô sáng. Double-click: điều hướng. Click nền: bỏ ghim.
  dom.svg.addEventListener("click", (e) => {
    if (viewport.consumeClickSuppressed()) return;
    clearTimeout(nodeClickTimer);
    const node = nodeFromEvent(e);
    if (!node) {
      unpinFocus();
      return;
    }
    if (e.detail > 1) return; // để dblclick xử lý
    const id = node.dataset.id;
    nodeClickTimer = setTimeout(() => pinFocus(id), 240);
  });

  dom.svg.addEventListener("dblclick", (e) => {
    clearTimeout(nodeClickTimer);
    const node = nodeFromEvent(e);
    if (!node) return;
    const id = node.dataset.id;
    if (id === state.center) return;
    setCenter(id, { mode: "navigate" });
  });
}

function buildJlptChips() {
  dom.jlptFilters.replaceChildren();
  for (const level of JLPT_LEVELS) {
    const chip = document.createElement("button");
    chip.className = "jlpt-chip active";
    chip.style.setProperty("--jlpt", jlptColor(level));
    chip.dataset.jlpt = level;
    chip.innerHTML = `<span class="check">✓</span>${level}`;
    chip.addEventListener("click", () => {
      if (state.jlpt.has(level)) state.jlpt.delete(level);
      else state.jlpt.add(level);
      chip.classList.toggle("active", state.jlpt.has(level));
      if (state.center) renderCurrent({ animate: false, fit: true, push: false });
    });
    dom.jlptFilters.appendChild(chip);
  }
}

function createFromSearch() {
  const q = dom.search.value.trim();
  if (!q) return;
  if (state.data.kanji[q]) {
    selectKanji(q);
    return;
  }
  const results = searchKanji(q, state.data, 1);
  if (results.length) selectKanji(results[0].character);
}

function selectKanji(id) {
  hideSuggestions();
  dom.search.value = id;
  dom.clearSearch.hidden = false;
  setCenter(id, { mode: "reset" });
}

// =============================================================
// Suggestions
// =============================================================

function showSuggestions(query) {
  const q = query.trim();
  if (!q) {
    hideSuggestions();
    return;
  }

  const results = searchKanji(q, state.data, 8);
  dom.suggestions.replaceChildren();

  if (!results.length) {
    const empty = document.createElement("li");
    empty.className = "sug-empty";
    empty.textContent = "Không tìm thấy";
    dom.suggestions.appendChild(empty);
  } else {
    for (const entry of results) {
      const vi = entry.meanings_vi || [];
      const lv = state.data.level[entry.character]?.level;

      const li = document.createElement("li");
      li.dataset.id = entry.character;
      li.innerHTML = `
        <span class="sug-char" style="--jlpt:${jlptColor(entry.jlpt)}">${entry.character}</span>
        <span class="sug-meta">
          <span class="sug-reading">${entry.chosen_name || "—"}${entry.jlpt ? ` · ${entry.jlpt}` : ""}${lv ? ` · Cấp ${lv}` : ""}</span>
          <span class="sug-meaning">${vi.join(", ")}</span>
        </span>
      `;
      li.addEventListener("click", () => selectKanji(entry.character));
      dom.suggestions.appendChild(li);
    }
  }

  dom.suggestions.hidden = false;
}

function setActiveSuggestion(items, index) {
  items.forEach((li, i) => li.classList.toggle("active", i === index));
  items[index]?.scrollIntoView({ block: "nearest" });
}

function hideSuggestions() {
  dom.suggestions.hidden = true;
}

// =============================================================
// Misc
// =============================================================

const LAYOUT_LABELS = {
  radial: "Hướng tâm",
  "radial-compact": "Hướng tâm gọn",
  grid: "Lưới",
};

function renderStatus(graph, layout) {
  const count = graph.nodes.length;
  const edges = graph.edges.length;
  const levels = graph.levels && graph.levels.length ? graph.levels.join("→") : "—";
  const jlpt = JLPT_LEVELS.filter((l) => state.jlpt.has(l)).join(" ") || "—";
  const mode = layout ? LAYOUT_LABELS[layout.mode] || layout.mode : "—";
  dom.status.textContent = `${count} Hán tự · ${edges} quan hệ · Cấp ${levels} · ${jlpt} · ${mode}`;
}

function updateURL(id) {
  const url = `?kanji=${encodeURIComponent(id)}`;
  if (location.search !== url) history.pushState({ kanji: id }, "", url);
}

function showEmpty(message) {
  dom.emptyState.hidden = false;
  if (message) {
    dom.emptyState.innerHTML = `<p>${message}</p>`;
  }
}

function hideEmpty() {
  dom.emptyState.hidden = true;
}

function initTheme() {
  const saved = localStorage.getItem("kanji-theme");
  document.documentElement.dataset.theme = saved || "dark";
  dom.themeBtn.textContent =
    document.documentElement.dataset.theme === "dark" ? "☀" : "🌙";
}

function toggleTheme() {
  const dark = document.documentElement.dataset.theme === "dark";
  const next = dark ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("kanji-theme", next);
  dom.themeBtn.textContent = next === "dark" ? "☀" : "🌙";
}

function wireKeyboard() {
  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    const typing = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";

    if (e.key === "/" && !typing) {
      e.preventDefault();
      dom.search.focus();
    } else if (e.key === "Escape") {
      hideSuggestions();
      hideTooltip();
      unpinFocus();
      if (typing) dom.search.blur();
    } else if ((e.key === "+" || e.key === "=") && !typing) {
      viewport.zoomBy(1.18);
    } else if ((e.key === "-" || e.key === "_") && !typing) {
      viewport.zoomBy(1 / 1.18);
    } else if (e.key.toLowerCase() === "r" && !typing) {
      fitToContent();
    }
  });
}

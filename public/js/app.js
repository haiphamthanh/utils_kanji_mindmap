// app.js — controller: state, search, navigation, wiring.

import { loadData, searchKanji } from "./data.js";
import { buildGraph } from "./graph.js";
import { computeLayout, edgePath } from "./layout.js";
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
  editToggle: document.getElementById("editToggle"),
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
  listBtn: document.getElementById("listBtn"),
  listModal: document.getElementById("listModal"),
  listClose: document.getElementById("listClose"),
  listSearch: document.getElementById("listSearch"),
  listLevels: document.getElementById("listLevels"),
  listFav: document.getElementById("listFav"),
  listLearned: document.getElementById("listLearned"),
  listBody: document.getElementById("listBody"),
};

const LIST_LEVELS = [...JLPT_LEVELS];

const state = {
  data: null,
  center: null,
  depth: 3,
  layoutMode: "grid",
  jlpt: new Set(JLPT_LEVELS),
  listLevels: new Set(JLPT_LEVELS),
  listFavOnly: false,
  listLearnedOnly: false,
  learned: new Set(),
  favorites: new Set(),
  hidden: new Set(),
  editMode: false,
  pinnedId: null,
  selectedId: null,
  path: [],
  rendered: null,
  layout: null,
};

let nodeClickTimer = null;
let posAnim = null;
let currentPositions = new Map();

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

  await loadMarks();

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

  cancelAnimationFrame(posAnim);
  posAnim = null;

  const pinned = state.pinnedId;
  const selected = state.selectedId;

  let graph = buildGraph(state.center, {
    depth: state.depth,
    data: state.data,
    jlpt: state.jlpt,
  });
  if (!state.editMode && state.hidden.size) graph = pruneHidden(graph);

  if (animate && state.rendered) {
    await playExit(dom);
  }

  const layout = computeLayout(graph, { mode: state.layoutMode });
  state.layout = layout;
  state.rendered = renderGraph(layout, state.data, dom, {
    learned: state.learned,
    favorites: state.favorites,
    hidden: state.hidden,
    editMode: state.editMode,
  });
  currentPositions = layoutPositions();

  bindNodeEvents(state.rendered);

  // Giữ lại ghim tô sáng nếu node vẫn còn sau khi render.
  if (pinned && state.rendered.byId.has(pinned)) {
    state.pinnedId = pinned;
    state.selectedId =
      selected && state.rendered.byId.has(selected) ? selected : pinned;
    applyFocus(pinned);
    markPinned(pinned);
    markSelected(state.selectedId);
    applyPositions(focusPositions(pinned));
  } else {
    state.pinnedId = null;
    state.selectedId =
      selected && state.rendered.byId.has(selected) ? selected : null;
  }

  if (animate) {
    playEnter(state.rendered);
  } else {
    state.rendered.edgeEls.forEach((el) => el.classList.add("drawn"));
    state.rendered.nodeEls.forEach((el) => el.classList.add("visible"));
  }

  if (fit) fitToContent();

  renderDetailPanel(state.selectedId || state.center);
  renderBreadcrumb();
  renderStatus(graph, layout);

  if (push) updateURL(state.center);
}

function setCenter(id, { mode = "navigate", animate = true } = {}) {
  if (!state.data.kanji[id]) return;

  state.pinnedId = null;
  state.selectedId = null;
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
  state.selectedId = id;
  applyFocus(id);
  markPinned(id);
  markSelected(id);
  renderDetailPanel(id);
  animatePositions(focusPositions(id));
}

// Đang ghim: click node liên quan chỉ đổi detail, không đổi ghim.
function activateNode(id) {
  if (state.pinnedId) {
    if (relatedSet(state.pinnedId).has(id)) {
      state.selectedId = id;
      markSelected(id);
      renderDetailPanel(id);
      return;
    }
    pinFocus(id);
    return;
  }
  pinFocus(id);
}

function markSelected(id) {
  for (const node of dom.nodes.children) {
    node.classList.toggle("selected", node.dataset.id === id);
  }
}

function unpinFocus() {
  if (!state.pinnedId) return;
  state.pinnedId = null;
  state.selectedId = null;
  clearFocus();
  renderDetailPanel(state.center);
  animatePositions(layoutPositions());
}

function markPinned(id) {
  for (const node of dom.nodes.children) {
    node.classList.toggle("pinned", node.dataset.id === id);
  }
}

// Tập node liên quan tới id (dựa trên các cạnh).
function relatedSet(id) {
  const related = new Set([id, state.center]);
  for (const edge of dom.edges.children) {
    if (edge.dataset.source === id || edge.dataset.target === id) {
      related.add(edge.dataset.source);
      related.add(edge.dataset.target);
    }
  }
  return related;
}

// Vị trí khi ghim: xếp các node liên quan thành vòng quanh node ghim,
// cạnh nối ngắn đều nhau và khoảng cách node rộng rãi.
function focusPositions(pinnedId) {
  if (!state.layout) return null;
  const pin = state.layout.nodes.find((n) => n.id === pinnedId);
  if (!pin) return null;

  const pos = new Map();
  for (const n of state.layout.nodes) pos.set(n.id, { x: n.x, y: n.y });

  const related = relatedSet(pinnedId);
  // Không di chuyển center (hub) để tránh kéo giãn các cạnh khác.
  const neighbors = state.layout.nodes.filter(
    (n) => n.id !== pinnedId && n.id !== state.center && related.has(n.id)
  );
  const count = neighbors.length;
  if (!count) return pos;

  const MIN = 110;
  const RING = Math.max(150, (count * MIN) / (Math.PI * 2));
  const baseAngle = Math.atan2(neighbors[0].y - pin.y, neighbors[0].x - pin.x);

  // Sắp theo góc gốc để ít cắt nét.
  neighbors.sort(
    (a, b) =>
      Math.atan2(a.y - pin.y, a.x - pin.x) -
      Math.atan2(b.y - pin.y, b.x - pin.x)
  );

  neighbors.forEach((node, i) => {
    const angle = baseAngle + (Math.PI * 2 * i) / count;
    pos.set(node.id, {
      x: pin.x + Math.cos(angle) * RING,
      y: pin.y + Math.sin(angle) * RING,
    });
  });

  return pos;
}

function applyPositions(pos) {
  if (!pos || !state.rendered) return;
  for (const el of state.rendered.nodeEls) {
    const p = pos.get(el.dataset.id);
    if (p) el.setAttribute("transform", `translate(${p.x} ${p.y})`);
  }
  for (const path of state.rendered.edgeEls) {
    const a = pos.get(path.dataset.source);
    const b = pos.get(path.dataset.target);
    if (a && b) path.setAttribute("d", edgePath(a, b));
  }
  currentPositions = new Map(pos);
}

function layoutPositions() {
  const pos = new Map();
  if (state.layout) {
    for (const n of state.layout.nodes) pos.set(n.id, { x: n.x, y: n.y });
  }
  return pos;
}

// Nội suy vị trí từ currentPositions -> target cho mượt.
function animatePositions(target) {
  if (!target) return;
  cancelAnimationFrame(posAnim);
  const from = new Map(currentPositions);
  const t0 = performance.now();
  const duration = 260;

  const step = (t) => {
    const k = Math.min(1, (t - t0) / duration);
    const e = 1 - Math.pow(1 - k, 3);
    const pos = new Map();
    for (const [id, f] of from) {
      const g = target.get(id) || f;
      pos.set(id, { x: f.x + (g.x - f.x) * e, y: f.y + (g.y - f.y) * e });
    }
    applyPositions(pos);
    if (k < 1) posAnim = requestAnimationFrame(step);
  };
  posAnim = requestAnimationFrame(step);
}

function applyFocus(id) {
  const related = relatedSet(id);

  for (const edge of dom.edges.children) {
    const touches = edge.dataset.source === id || edge.dataset.target === id;
    edge.classList.toggle("highlight", touches);
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
    node.classList.remove("related", "pinned", "selected");
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
  dom.detailPanel.innerHTML = renderDetail(entry, state.data, {
    learned: state.learned,
    favorites: state.favorites,
    hidden: state.hidden,
    editMode: state.editMode,
    center: state.center,
  });
  dom.detailPanel.hidden = false;

  const copyBtn = dom.detailPanel.querySelector("[data-action='copy']");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const url = `${location.origin}${location.pathname}?kanji=${encodeURIComponent(id)}`;
      navigator.clipboard?.writeText(url);
      copyBtn.textContent = "Đã sao chép!";
      setTimeout(() => (copyBtn.textContent = "Sao chép liên kết"), 1200);
    });
  }

  const learnedBtn = dom.detailPanel.querySelector("[data-action='learned']");
  if (learnedBtn) {
    learnedBtn.addEventListener("click", () => toggleMark("learned", id));
  }

  const favBtn = dom.detailPanel.querySelector("[data-action='favorite']");
  if (favBtn) {
    favBtn.addEventListener("click", () => toggleMark("favorites", id));
  }

  const hideBtn = dom.detailPanel.querySelector("[data-action='hide']");
  if (hideBtn) {
    hideBtn.addEventListener("click", () => toggleHidden(id));
  }
}

// =============================================================
// Marks: đã nhớ / yêu thích (lưu server-side)
// =============================================================

async function loadMarks() {
  try {
    const res = await fetch("/api/marks");
    if (!res.ok) return;
    const marks = await res.json();
    state.learned = new Set(marks.learned || []);
    state.favorites = new Set(marks.favorites || []);
  } catch (_) {
    /* offline: giữ rỗng */
  }
}

async function toggleMark(kind, id) {
  const set = kind === "learned" ? state.learned : state.favorites;
  const value = !set.has(id);
  if (value) set.add(id);
  else set.delete(id);

  renderCurrent({ animate: false, fit: false, push: false });

  try {
    await fetch(`/api/marks/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ character: id, value }),
    });
  } catch (err) {
    console.error("Không lưu được đánh dấu", err);
  }
}

// =============================================================
// Ẩn node tạm thời (chỉ trong edit mode thuộc state.hidden)
// =============================================================

function toggleHidden(id) {
  if (id === state.center) return;
  if (state.hidden.has(id)) state.hidden.delete(id);
  else state.hidden.add(id);
  renderCurrent({ animate: false, fit: true, push: false });
}

// Bỏ các node bị ẩn và toàn bộ node con của chúng.
function pruneHidden(graph) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const removed = new Set();

  for (const node of graph.nodes) {
    let cur = node;
    while (cur) {
      if (state.hidden.has(cur.id)) {
        removed.add(node.id);
        break;
      }
      cur = cur.parent ? byId.get(cur.parent) : null;
    }
  }

  return {
    ...graph,
    nodes: graph.nodes.filter((n) => !removed.has(n.id)),
    edges: graph.edges.filter(
      (e) => !removed.has(e.source) && !removed.has(e.target)
    ),
  };
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

  dom.editToggle.addEventListener("change", () => {
    state.editMode = dom.editToggle.checked;
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

  dom.listBtn.addEventListener("click", openList);
  dom.listClose.addEventListener("click", closeList);
  dom.listModal.addEventListener("click", (e) => {
    if (e.target.dataset.close) closeList();
  });
  dom.listSearch.addEventListener("input", renderList);
  dom.listFav.addEventListener("click", () => {
    state.listFavOnly = !state.listFavOnly;
    dom.listFav.classList.toggle("active", state.listFavOnly);
    renderList();
  });
  dom.listLearned.addEventListener("click", () => {
    state.listLearnedOnly = !state.listLearnedOnly;
    dom.listLearned.classList.toggle("active", state.listLearnedOnly);
    renderList();
  });
  dom.listBody.addEventListener("click", (e) => {
    const item = e.target.closest(".list-item");
    if (!item) return;
    selectKanji(item.dataset.id);
    closeList();
  });

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
    nodeClickTimer = setTimeout(() => activateNode(id), 240);
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

// =============================================================
// List modal: danh sách kanji theo cấp, có search
// =============================================================

const MAX_LIST = 800;

function buildListLevelChips() {
  dom.listLevels.replaceChildren();
  for (const level of LIST_LEVELS) {
    const chip = document.createElement("button");
    chip.className = `jlpt-chip${state.listLevels.has(level) ? " active" : ""}`;
    chip.style.setProperty("--jlpt", jlptColor(level));
    chip.dataset.jlpt = level;
    chip.innerHTML = `<span class="check">✓</span>${level}`;
    chip.addEventListener("click", () => {
      if (state.listLevels.has(level)) state.listLevels.delete(level);
      else state.listLevels.add(level);
      chip.classList.toggle("active", state.listLevels.has(level));
      renderList();
    });
    dom.listLevels.appendChild(chip);
  }
}

function openList() {
  dom.listModal.hidden = false;
  buildListLevelChips();
  dom.listFav.classList.toggle("active", state.listFavOnly);
  dom.listLearned.classList.toggle("active", state.listLearnedOnly);
  renderList();
  dom.listSearch.focus();
}

function closeList() {
  dom.listModal.hidden = true;
  dom.listSearch.value = "";
}

function renderList() {
  if (!state.data) return;

  const q = dom.listSearch.value.trim();
  const base = q ? searchKanji(q, state.data, state.data.list.length) : state.data.list;

  const groups = new Map(LIST_LEVELS.map((l) => [l, []]));
  let total = 0;
  for (const entry of base) {
    if (!state.listLevels.has(entry.jlpt)) continue;
    if (state.listFavOnly && !state.favorites.has(entry.character)) continue;
    if (state.listLearnedOnly && !state.learned.has(entry.character)) continue;
    const bucket = groups.get(entry.jlpt);
    if (!bucket) continue;
    bucket.push(entry);
    total++;
  }

  let shown = 0;
  let html = "";
  for (const level of LIST_LEVELS) {
    const items = groups.get(level);
    if (!items.length || shown >= MAX_LIST) continue;
    html += `<div class="list-group-title">${level} · ${items.length}</div><div class="list-grid">`;
    for (const entry of items) {
      if (shown >= MAX_LIST) break;
      const meaning = (entry.meanings_vi || []).slice(0, 2).join(", ");
      const learned = state.learned.has(entry.character);
      const fav = state.favorites.has(entry.character);
      html += `
        <button class="list-item${learned ? " learned" : ""}" data-id="${entry.character}">
          <span class="li-char" style="--jlpt:${learned ? "#8aa0b8" : jlptColor(entry.jlpt)}">${entry.character}</span>
          <span class="li-meta">
            <span class="li-name">${entry.chosen_name || "—"}${fav ? ' <span class="li-fav">★</span>' : ""}</span>
            <span class="li-meaning">${meaning || "—"}</span>
          </span>
        </button>`;
      shown++;
    }
    html += `</div>`;
  }

  if (!shown) {
    dom.listBody.innerHTML = `<div class="list-empty">Không tìm thấy Hán tự phù hợp.</div>`;
    return;
  }

  const note =
    total > shown
      ? `Hiển thị ${shown} / ${total} — lọc thêm bằng cấp độ.`
      : `${total} Hán tự`;
  dom.listBody.innerHTML = `<div class="list-count">${note}</div>${html}`;
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
      if (!dom.listModal.hidden) {
        closeList();
        return;
      }
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

// render.js — build SVG nodes/edges and the detail panel.

import { edgePath } from "./layout.js";

const NS = "http://www.w3.org/2000/svg";

export const JLPT_COLORS = {
  N5: "#22b573",
  N4: "#2778d8",
  N3: "#7c4dcc",
  N2: "#e5a817",
  N1: "#d94b4b",
};

export function jlptColor(jlpt) {
  return JLPT_COLORS[jlpt] || "#8aa0b8";
}

export const LEARNED_COLOR = "#8aa0b8";

/**
 * Draw the graph into the SVG groups. Returns element lists for animation
 * and a position map for hit-testing / highlighting.
 */
export function renderGraph(layout, data, dom, marks = {}) {
  const learned = marks.learned || new Set();
  const favorites = marks.favorites || new Set();

  dom.edges.replaceChildren();
  dom.nodes.replaceChildren();

  const byId = new Map(layout.nodes.map((n) => [n.id, n]));

  const edgeEls = [];
  for (const edge of layout.edges) {
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    if (!a || !b) continue;

    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", edgePath(a, b));
    path.setAttribute("class", `edge edge-type-${edge.type}`);
    path.setAttribute("pathLength", "1");
    path.dataset.source = edge.source;
    path.dataset.target = edge.target;
    dom.edges.appendChild(path);
    edgeEls.push(path);
  }

  const nodeEls = [];
  for (const node of layout.nodes) {
    const entry = data.kanji[node.id] || {};
    const isCenter = node.isCenter;
    const isLearned = learned.has(node.id);
    const isFav = favorites.has(node.id);

    const g = document.createElementNS(NS, "g");
    g.setAttribute(
      "class",
      `kanji-node${isCenter ? " center" : ""}${isLearned ? " learned" : ""}`
    );
    g.setAttribute("transform", `translate(${node.x} ${node.y})`);
    g.dataset.id = node.id;
    g.style.setProperty(
      "--jlpt",
      isLearned ? LEARNED_COLOR : jlptColor(entry.jlpt)
    );

    const inner = document.createElementNS(NS, "g");
    inner.setAttribute("class", "node-inner");

    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("r", isCenter ? layout.radius.center : layout.radius.node);

    const text = document.createElementNS(NS, "text");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.setAttribute("font-size", isCenter ? 30 : 22);
    text.textContent = node.id;

    inner.append(circle, text);
    g.appendChild(inner);

    if (isFav) {
      const r = isCenter ? layout.radius.center : layout.radius.node;
      const star = document.createElementNS(NS, "text");
      star.setAttribute("class", "fav-star");
      star.setAttribute("x", r * 0.72);
      star.setAttribute("y", -r * 0.72);
      star.setAttribute("text-anchor", "middle");
      star.setAttribute("dominant-baseline", "central");
      star.setAttribute("font-size", isCenter ? 20 : 16);
      star.textContent = "★";
      g.appendChild(star);
    }

    dom.nodes.appendChild(g);
    nodeEls.push(g);
  }

  return { edgeEls, nodeEls, byId };
}

/**
 * Fill the detail panel for a kanji entry.
 */
export function renderDetail(entry, data, marks = {}) {
  if (!entry) return "";

  const ch = entry.character;
  const lv = data.level[ch] && data.level[ch].level;
  const vi = entry.meanings_vi || [];
  const components = entry.components || [];
  const upCount = (data.upAdj.get(ch) || []).length;
  const downCount = (data.downAdj.get(ch) || []).length;
  const learned = marks.learned ? marks.learned.has(ch) : false;
  const fav = marks.favorites ? marks.favorites.has(ch) : false;

  const componentTags = components
    .map((c) => `<span class="tag">${c}</span>`)
    .join("");

  const alias =
    entry.character_name_vi && entry.character_name_vi !== entry.chosen_name
      ? `<span class="detail-sub">(${entry.character_name_vi})</span>`
      : "";

  return `
    <div class="detail-head" style="--jlpt:${learned ? LEARNED_COLOR : jlptColor(entry.jlpt)}">
      <div class="detail-char">${entry.character}</div>
      <div class="detail-title">
        ${entry.jlpt ? `<span class="detail-badge">${entry.jlpt}</span>` : ""}
        <span class="detail-badge">Cấp ${lv ?? "—"}</span>
        ${learned ? `<span class="detail-badge">Đã nhớ</span>` : ""}
        <span class="detail-sub">${entry.chosen_name || ""}</span>
      </div>
    </div>

    <div class="detail-section">
      <h3>Tên Hán-Việt</h3>
      <div class="detail-meaning">${entry.chosen_name || "—"} ${alias}</div>
    </div>

    <div class="detail-section">
      <h3>Nghĩa</h3>
      <div class="detail-meaning">${vi.join(", ") || "—"}</div>
    </div>

    ${
      components.length
        ? `<div class="detail-section">
             <h3>Thành phần</h3>
             <div class="detail-tags">${componentTags}</div>
           </div>`
        : ""
    }

    ${
      entry.biggest_component
        ? `<div class="detail-section">
             <h3>Bộ chính</h3>
             <div class="detail-meaning">${entry.biggest_component}</div>
           </div>`
        : ""
    }

    <div class="detail-section">
      <h3>Quan hệ</h3>
      <div class="detail-sub">Chữ chứa nó: ${upCount} · Bộ phận cấp dưới: ${downCount}</div>
    </div>

    <div class="detail-actions">
      <button class="mark-btn${learned ? " is-on" : ""}" data-action="learned">
        ${learned ? "✓ Đã nhớ" : "Đánh dấu đã nhớ"}
      </button>
      <button class="fav-btn${fav ? " is-on" : ""}" data-action="favorite" title="Yêu thích">
        ${fav ? "★" : "☆"}
      </button>
      <button class="primary-btn" data-action="copy">Sao chép liên kết</button>
    </div>
  `;
}

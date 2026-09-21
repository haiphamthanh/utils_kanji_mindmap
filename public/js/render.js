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

export function jlptColor(level) {
  return JLPT_COLORS[level] || "#8aa0b8";
}

/**
 * Draw the graph into the SVG groups. Returns element lists for animation
 * and a position map for hit-testing / highlighting.
 */
export function renderGraph(layout, data, dom) {
  dom.edges.replaceChildren();
  dom.nodes.replaceChildren();

  const byId = new Map(layout.nodes.map((n) => [n.id, n]));

  const edgeEls = [];
  for (const edge of layout.edges) {
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    if (!a || !b) continue;

    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", edgePath(a, b, layout.radius));
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
    const isCenter = node.level === 0;

    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", `kanji-node${isCenter ? " center" : ""}`);
    g.setAttribute("transform", `translate(${node.x} ${node.y})`);
    g.dataset.id = node.id;
    g.style.setProperty("--jlpt", jlptColor(entry.jlpt));

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
    dom.nodes.appendChild(g);
    nodeEls.push(g);
  }

  return { edgeEls, nodeEls, byId };
}

/**
 * Fill the detail panel for a kanji entry.
 */
export function renderDetail(entry, data) {
  if (!entry) return "";

  const on = (entry.readings && entry.readings.on) || [];
  const kun = (entry.readings && entry.readings.kun) || [];
  const vi = (entry.meanings && entry.meanings.vi) || [];
  const en = (entry.meanings && entry.meanings.en) || [];
  const components = entry.components || [];
  const outCount = (data.outAdj.get(entry.literal) || []).length;
  const inCount = (data.inAdj.get(entry.literal) || []).length;

  const readingRows = [];
  if (on.length) {
    readingRows.push(
      `<div class="detail-reading"><span class="label">On</span>${on.join("、")}</div>`
    );
  }
  if (kun.length) {
    readingRows.push(
      `<div class="detail-reading"><span class="label">Kun</span>${kun.join("、")}</div>`
    );
  }

  const componentTags = components
    .map((c) => `<span class="tag">${c.character}</span>`)
    .join("");

  return `
    <div class="detail-head" style="--jlpt:${jlptColor(entry.jlpt)}">
      <div class="detail-char">${entry.literal}</div>
      <div class="detail-title">
        <span class="detail-badge">${entry.jlpt || "—"}</span>
        <span class="detail-sub">${entry.stroke_count || "?"} nét</span>
      </div>
    </div>

    <div class="detail-section">
      <h3>Cách đọc</h3>
      ${readingRows.join("") || '<div class="detail-sub">—</div>'}
    </div>

    <div class="detail-section">
      <h3>Nghĩa</h3>
      <div class="detail-meaning">${vi.join(", ") || en.join(", ") || "—"}</div>
    </div>

    ${
      components.length
        ? `<div class="detail-section">
             <h3>Thành phần</h3>
             <div class="detail-tags">${componentTags}</div>
           </div>`
        : ""
    }

    <div class="detail-section">
      <h3>Quan hệ</h3>
      <div class="detail-sub">Chứa bộ phận: ${outCount} · Nằm trong: ${inCount}</div>
    </div>

    <div class="detail-actions">
      <button class="primary-btn" data-action="copy">Sao chép liên kết</button>
    </div>
  `;
}

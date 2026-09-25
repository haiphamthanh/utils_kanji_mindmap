// render.js — build SVG nodes/edges and the detail panel.

import { edgePath } from "./layout.js";

const NS = "http://www.w3.org/2000/svg";

export const LEVEL_COLORS = {
  1: "#22b573",
  2: "#2778d8",
  3: "#7c4dcc",
};

export function levelColor(level) {
  return LEVEL_COLORS[level] || "#8aa0b8";
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
    const lv = data.level[node.id] && data.level[node.id].level;
    const isCenter = node.level === 0;

    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", `kanji-node${isCenter ? " center" : ""}`);
    g.setAttribute("transform", `translate(${node.x} ${node.y})`);
    g.dataset.id = node.id;
    g.style.setProperty("--jlpt", levelColor(lv));

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

  const ch = entry.character;
  const lv = data.level[ch] && data.level[ch].level;
  const vi = entry.meanings_vi || [];
  const components = entry.components || [];
  const upCount = (data.upAdj.get(ch) || []).length;
  const downCount = (data.downAdj.get(ch) || []).length;

  const componentTags = components
    .map((c) => `<span class="tag">${c}</span>`)
    .join("");

  const alias =
    entry.character_name_vi && entry.character_name_vi !== entry.chosen_name
      ? `<span class="detail-sub">(${entry.character_name_vi})</span>`
      : "";

  return `
    <div class="detail-head" style="--jlpt:${levelColor(lv)}">
      <div class="detail-char">${entry.character}</div>
      <div class="detail-title">
        <span class="detail-badge">Cấp ${lv ?? "—"}</span>
        ${entry.jlpt ? `<span class="detail-badge">${entry.jlpt}</span>` : ""}
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
      <div class="detail-sub">Bóc thành phần: ${downCount} · Đi lên: ${upCount}</div>
    </div>

    <div class="detail-actions">
      <button class="primary-btn" data-action="copy">Sao chép liên kết</button>
    </div>
  `;
}

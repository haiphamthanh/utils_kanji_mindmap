// layout.js — hierarchical layout, top-down theo cấp dữ liệu.
//
// Cấp nhỏ (1) nằm trên, cấp lớn (3) nằm dưới; center nằm đúng hàng cấp của nó.
// Mỗi cấp trải thành các hàng ngang, tự động xuống dòng khi quá dài.

const CENTER_R = 42;
const NODE_R = 27;
const GAP_X = 92;
const GAP_Y = 132;
const LEVEL_GAP = 56;
const MAX_PER_ROW = 10;

export function computeLayout(graph, { width, height }) {
  const radius = { center: CENTER_R, node: NODE_R };

  if (!graph.nodes.length) {
    return {
      nodes: [],
      edges: [],
      center: null,
      radius,
      bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 },
    };
  }

  for (const node of graph.nodes) node.isCenter = node.id === graph.root;

  const levels = [...new Set(graph.nodes.map((n) => n.dataLevel))].sort(
    (a, b) => a - b
  );

  const byLevel = new Map();
  for (const lv of levels) byLevel.set(lv, []);
  for (const node of graph.nodes) byLevel.get(node.dataLevel).push(node);

  // Xếp thứ tự trong từng cấp: center trước, còn lại theo vị trí của cha.
  const orderIndex = new Map();
  const ordered = new Map();
  for (const lv of levels) {
    const list = byLevel.get(lv).slice();
    list.sort((a, b) => {
      if (a.isCenter !== b.isCenter) return a.isCenter ? -1 : 1;
      const pa = orderIndex.has(a.parent) ? orderIndex.get(a.parent) : Infinity;
      const pb = orderIndex.has(b.parent) ? orderIndex.get(b.parent) : Infinity;
      return pa - pb;
    });
    list.forEach((node, i) => orderIndex.set(node.id, i));
    ordered.set(lv, list);
  }

  // Đặt vị trí: mỗi cấp là một dải hàng ngang.
  let cursorY = 0;
  for (const lv of levels) {
    const list = ordered.get(lv);
    for (let i = 0; i < list.length; i++) {
      const row = Math.floor(i / MAX_PER_ROW);
      const col = i % MAX_PER_ROW;
      const rowNodes = list.slice(row * MAX_PER_ROW, row * MAX_PER_ROW + MAX_PER_ROW);
      const total = (rowNodes.length - 1) * GAP_X;
      list[i].x = -total / 2 + col * GAP_X;
      list[i].y = cursorY + row * GAP_Y;
    }
    const rowCount = Math.ceil(list.length / MAX_PER_ROW);
    cursorY += rowCount * GAP_Y + LEVEL_GAP;
  }

  // Dời trục dọc để center nằm ở y = 0.
  const center = graph.nodes.find((n) => n.isCenter);
  const shiftY = center ? center.y : 0;
  for (const node of graph.nodes) node.y -= shiftY;

  // Bounds cho fit-to-view.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of graph.nodes) {
    const r = node.isCenter ? CENTER_R : NODE_R;
    minX = Math.min(minX, node.x - r);
    maxX = Math.max(maxX, node.x + r);
    minY = Math.min(minY, node.y - r);
    maxY = Math.max(maxY, node.y + r);
  }

  return {
    nodes: graph.nodes,
    edges: graph.edges,
    center,
    radius,
    bounds: { minX, maxX, minY, maxY },
  };
}

/**
 * Cubic-bezier connector between two positioned nodes.
 */
export function edgePath(a, b, radius) {
  const r1 = a.isCenter ? radius.center : radius.node;
  const r2 = b.isCenter ? radius.center : radius.node;

  const dir = b.y >= a.y ? 1 : -1;
  const y1 = a.y + dir * r1;
  const y2 = b.y - dir * r2;
  const midY = (y1 + y2) / 2;

  return `M ${a.x} ${y1} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${y2}`;
}

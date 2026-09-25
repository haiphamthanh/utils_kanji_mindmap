// layout.js — tidy-tree layout, top-down theo cấp dữ liệu.
//
// Cấp nhỏ (1) nằm trên, cấp lớn (3) nằm dưới; center nằm đúng hàng cấp của nó.
// Mỗi cấp = 1 hàng duy nhất. Node cha căn giữa theo các con của nó nên các
// đường nối trong cùng một cây không cắt nhau.

const CENTER_R = 42;
const NODE_R = 27;
const GAP_X = 96;
const GAP_Y = 150;

export function computeLayout(graph) {
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

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const node of graph.nodes) {
    node.isCenter = node.id === graph.root;
    node.children = [];
  }

  const center = byId.get(graph.root);

  // Dựng cây theo con trỏ parent (luôn hướng về center).
  for (const node of graph.nodes) {
    if (node.isCenter) continue;
    const parent = byId.get(node.parent);
    if (parent) parent.children.push(node);
  }

  const Lc = center.dataLevel;
  const upRoots = center.children.filter((n) => n.dataLevel < Lc);
  const downRoots = center.children.filter((n) => n.dataLevel > Lc);
  center.children = [];

  layForest(upRoots);
  const upCenterX = centerX(upRoots);
  layForest(downRoots);
  const downCenterX = centerX(downRoots);

  for (const node of upRoots) applyTree(node, -1, upCenterX);
  for (const node of downRoots) applyTree(node, 1, downCenterX);

  center.x = 0;
  center.y = 0;

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

  // -------------------------------------------------------------

  // Đặt cây con bằng con trỏ chạy: lá chiếm GAP_X, cha căn giữa theo con.
  function layForest(roots) {
    let cursor = 0;
    const walk = (node, depth) => {
      node._depth = depth;
      if (!node.children.length) {
        node._x = cursor;
        cursor += GAP_X;
        return;
      }
      for (const child of node.children) walk(child, depth + 1);
      const first = node.children[0];
      const last = node.children[node.children.length - 1];
      node._x = (first._x + last._x) / 2;
    };
    for (const root of roots) walk(root, 1);
  }

  function centerX(roots) {
    if (!roots.length) return 0;
    return (roots[0]._x + roots[roots.length - 1]._x) / 2;
  }

  // Dịch cây về quanh center (x) và ra hai phía trên/dưới (y).
  function applyTree(node, dir, originX) {
    node.x = node._x - originX;
    node.y = dir * node._depth * GAP_Y;
    for (const child of node.children) applyTree(child, dir, originX);
  }
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

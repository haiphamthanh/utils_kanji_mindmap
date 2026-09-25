// layout.js — radial tidy-tree layout theo cấp dữ liệu.
//
// Center ở giữa. Cấp 1 (bộ phận) toả lên trên, cấp cao hơn toả xuống dưới
// (hoặc cả vòng tròn khi chỉ có 1 hướng). Mỗi cấp = 1 vòng bán kính riêng.
// Node cha căn giữa theo góc của các con nên các đường nối không cắt nhau.

const CENTER_R = 42;
const NODE_R = 27;
const MIN_ARC = 86; // cung tối thiểu giữa 2 node cùng vòng
const RING_GAP = 124; // khoảng cách bán kính giữa 2 vòng
const MIN_R1 = 120; // bán kính tối thiểu của vòng 1
const TWO_PI = Math.PI * 2;

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

  const countLeaves = (node) => {
    if (node._leaves == null) {
      node._leaves = node.children.length
        ? node.children.reduce((sum, c) => sum + countLeaves(c), 0)
        : 1;
    }
    return node._leaves;
  };
  const sumLeaves = (roots) => roots.reduce((sum, n) => sum + countLeaves(n), 0);

  const upLeaves = sumLeaves(upRoots);
  const downLeaves = sumLeaves(downRoots);
  const totalLeaves = upLeaves + downLeaves;

  // Chia góc: cả 2 hướng -> mỗi hướng một nửa (trên/dưới) theo tỉ lệ lá.
  let upSector = null;
  let downSector = null;
  if (upLeaves && downLeaves) {
    const downWidth = TWO_PI * (downLeaves / totalLeaves);
    const upWidth = TWO_PI - downWidth;
    downSector = [Math.PI / 2 - downWidth / 2, Math.PI / 2 + downWidth / 2];
    upSector = [Math.PI * 1.5 - upWidth / 2, Math.PI * 1.5 + upWidth / 2];
  } else if (upLeaves) {
    upSector = [0, TWO_PI];
  } else if (downLeaves) {
    downSector = [0, TWO_PI];
  }

  const place = (node, a, b, depth) => {
    node._depth = depth;
    node._width = b - a;
    node._angle = (a + b) / 2;
    const w = countLeaves(node);
    let cursor = a;
    for (const child of node.children) {
      const cw = countLeaves(child);
      const next = cursor + ((b - a) * cw) / w;
      place(child, cursor, next, depth + 1);
      cursor = next;
    }
  };

  const assign = (roots, sector) => {
    if (!sector) return;
    const w = sumLeaves(roots);
    let a = sector[0];
    for (const root of roots) {
      const rw = countLeaves(root);
      const b = a + ((sector[1] - sector[0]) * rw) / w;
      place(root, a, b, 1);
      a = b;
    }
  };

  assign(upRoots, upSector);
  assign(downRoots, downSector);

  // Bán kính từng vòng: đủ rộng để không chồng node, và tăng dần.
  const depthNodes = new Map();
  for (const node of graph.nodes) {
    if (!node._depth) continue;
    if (!depthNodes.has(node._depth)) depthNodes.set(node._depth, []);
    depthNodes.get(node._depth).push(node);
  }

  const radii = new Map();
  let prevR = 0;
  const maxDepth = depthNodes.size ? Math.max(...depthNodes.keys()) : 0;
  for (let d = 1; d <= maxDepth; d++) {
    const nodes = depthNodes.get(d) || [];
    const minWidth = nodes.reduce((m, n) => Math.min(m, n._width), Infinity);
    const required = MIN_ARC / Math.max(minWidth, 1e-6);
    const minR = d === 1 ? MIN_R1 : prevR + RING_GAP;
    const r = Math.max(minR, required);
    radii.set(d, r);
    prevR = r;
  }

  for (const node of graph.nodes) {
    if (node.isCenter) {
      node.x = 0;
      node.y = 0;
      continue;
    }
    const r = radii.get(node._depth) || MIN_R1;
    node.x = Math.cos(node._angle) * r;
    node.y = Math.sin(node._angle) * r;
  }

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
 * Straight radial connector between two positioned nodes.
 */
export function edgePath(a, b) {
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
}

// layout.js — chọn layout thích ứng theo số node.
//
//   tree    : 1 cấp 1 hàng, dễ đọc, hợp graph nhỏ.
//   radial  : hướng tâm, hợp graph nhiều node.
//   compact : radial với cung/vành nhỏ hơn cho graph rất lớn.
//
// mode: "auto" (theo số node) | "tree" | "radial".

const CENTER_R = 42;
const NODE_R = 27;

const GAP_X = 96;
const GAP_Y = 150;

const RING_NORMAL = { arc: 86, gap: 124, r1: 120 };
const RING_COMPACT = { arc: 64, gap: 96, r1: 108 };
const TWO_PI = Math.PI * 2;

const TREE_MAX = 24; // <= số này dùng tree
const COMPACT_MIN = 150; // > số này dùng radial compact

export function computeLayout(graph, { mode = "auto" } = {}) {
  const radius = { center: CENTER_R, node: NODE_R };

  if (!graph.nodes.length) {
    return {
      nodes: [],
      edges: [],
      center: null,
      radius,
      mode: "empty",
      bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 },
    };
  }

  const { center, upRoots, downRoots } = prepare(graph);
  const resolved = resolveMode(graph, mode);
  const compact = graph.nodes.length > COMPACT_MIN;

  let label;
  if (resolved === "tree") {
    layoutTree(upRoots, downRoots, center);
    label = "tree";
  } else {
    layoutRadial(graph, upRoots, downRoots, center, compact ? RING_COMPACT : RING_NORMAL);
    label = compact ? "radial-compact" : "radial";
  }

  return {
    nodes: graph.nodes,
    edges: graph.edges,
    center,
    radius,
    mode: label,
    bounds: computeBounds(graph),
  };
}

// -------------------------------------------------------------

function resolveMode(graph, mode) {
  if (mode === "tree" || mode === "radial") return mode;
  return graph.nodes.length <= TREE_MAX ? "tree" : "radial";
}

function prepare(graph) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const node of graph.nodes) {
    node.isCenter = node.id === graph.root;
    node.children = [];
  }

  const center = byId.get(graph.root);
  for (const node of graph.nodes) {
    if (node.isCenter) continue;
    const parent = byId.get(node.parent);
    if (parent) parent.children.push(node);
  }

  const Lc = center.dataLevel;
  const upRoots = center.children.filter((n) => n.dataLevel < Lc);
  const downRoots = center.children.filter((n) => n.dataLevel > Lc);
  center.children = [];

  return { center, upRoots, downRoots };
}

function computeBounds(graph) {
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
  return { minX, maxX, minY, maxY };
}

// ---- tree (top-down, 1 cấp 1 hàng) --------------------------

function layoutTree(upRoots, downRoots, center) {
  const forest = (roots) => {
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
  };

  const rootsCenter = (roots) =>
    roots.length ? (roots[0]._x + roots[roots.length - 1]._x) / 2 : 0;

  const apply = (node, dir, originX) => {
    node.x = node._x - originX;
    node.y = dir * node._depth * GAP_Y;
    for (const child of node.children) apply(child, dir, originX);
  };

  forest(upRoots);
  const upOrigin = rootsCenter(upRoots);
  forest(downRoots);
  const downOrigin = rootsCenter(downRoots);

  for (const node of upRoots) apply(node, -1, upOrigin);
  for (const node of downRoots) apply(node, 1, downOrigin);

  center.x = 0;
  center.y = 0;
}

// ---- radial (tidy rings) ------------------------------------

function layoutRadial(graph, upRoots, downRoots, center, ring) {
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

  // Bán kính từng vòng: đủ rộng để không chồng node và tăng dần.
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
    const required = ring.arc / Math.max(minWidth, 1e-6);
    const minR = d === 1 ? ring.r1 : prevR + ring.gap;
    const r = Math.max(minR, required);
    radii.set(d, r);
    prevR = r;
  }

  applyRadial(center, upRoots, radii, ring.r1);
  applyRadial(center, downRoots, radii, ring.r1);
}

function applyRadial(center, roots, radii, fallbackR) {
  const walk = (node) => {
    const r = radii.get(node._depth) || fallbackR;
    node.x = Math.cos(node._angle) * r;
    node.y = Math.sin(node._angle) * r;
    for (const child of node.children) walk(child);
  };
  for (const root of roots) walk(root);
  center.x = 0;
  center.y = 0;
}

/**
 * Straight connector between two positioned nodes.
 */
export function edgePath(a, b) {
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
}

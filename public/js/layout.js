// layout.js — bố cục theo cấp dữ liệu.
//
//   radial : hướng tâm (tidy rings); tự dùng bản compact khi nhiều node.
//   grid   : lưới gọn theo cấp, hợp vài trăm node.
//
// mode: "auto" | "radial" | "grid".
// auto: <= 150 node -> radial, > 150 -> grid.

const CENTER_R = 42;
const NODE_R = 27;

// grid
const GRID_X = 92;
const GRID_Y = 90;
const GRID_BAND = 64;
const GRID_COLS = 16;

// radial
const RING_NORMAL = { arc: 86, gap: 124, r1: 120 };
const RING_COMPACT = { arc: 64, gap: 96, r1: 108 };
const TWO_PI = Math.PI * 2;

const COMPACT_MIN = 150;

const MODES = ["radial", "grid"];

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
  let label = resolved;

  if (resolved === "grid") {
    layoutGrid(graph, center);
  } else {
    layoutRadial(
      graph,
      upRoots,
      downRoots,
      center,
      compact ? RING_COMPACT : RING_NORMAL
    );
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
  if (mode !== "auto" && MODES.includes(mode)) return mode;
  return graph.nodes.length > COMPACT_MIN ? "grid" : "radial";
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

// ---- grid (bands by level) ----------------------------------

function layoutGrid(graph, center) {
  const levels = [...new Set(graph.nodes.map((n) => n.dataLevel))].sort(
    (a, b) => a - b
  );
  const byLevel = new Map(levels.map((l) => [l, []]));
  for (const node of graph.nodes) byLevel.get(node.dataLevel).push(node);

  const xOf = new Map();
  let y = 0;

  for (const lv of levels) {
    const list = byLevel.get(lv).slice();
    list.sort((a, b) => {
      const pa = a.isCenter ? 0 : xOf.get(a.parent) ?? 0;
      const pb = b.isCenter ? 0 : xOf.get(b.parent) ?? 0;
      return pa - pb;
    });

    const cols = Math.min(list.length, GRID_COLS);
    const rows = Math.ceil(list.length / cols);
    for (let i = 0; i < list.length; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const rowCount = Math.min(cols, list.length - row * cols);
      const x = (col - (rowCount - 1) / 2) * GRID_X;
      list[i].x = x;
      list[i].y = y + row * GRID_Y;
      xOf.set(list[i].id, x);
    }
    y += rows * GRID_Y + GRID_BAND;
  }

  const shift = center.y || 0;
  for (const node of graph.nodes) node.y -= shift;
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

  const walkApply = (node) => {
    const r = radii.get(node._depth) || ring.r1;
    node.x = Math.cos(node._angle) * r;
    node.y = Math.sin(node._angle) * r;
    for (const child of node.children) walkApply(child);
  };
  for (const root of upRoots) walkApply(root);
  for (const root of downRoots) walkApply(root);

  center.x = 0;
  center.y = 0;
}

/**
 * Straight connector between two positioned nodes.
 */
export function edgePath(a, b) {
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
}

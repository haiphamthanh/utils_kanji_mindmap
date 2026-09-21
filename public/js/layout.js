// layout.js — hierarchical layout (no force simulation).

const CENTER_R = 42;
const NODE_R = 27;
const GAP_X = 92;
const GAP_Y = 150;

export function computeLayout(graph, { width, height }) {
  const centerX = width / 2;
  const centerY = height / 2;

  const byLevel = new Map();
  for (const node of graph.nodes) {
    if (!byLevel.has(node.level)) byLevel.set(node.level, []);
    byLevel.get(node.level).push(node);
  }

  const rootNode = graph.nodes.find((n) => n.level === 0);
  rootNode.x = centerX;
  rootNode.y = centerY;

  const level1 = byLevel.get(1) || [];
  const half = Math.ceil(level1.length / 2);
  const topGroup = level1.slice(0, half);
  const bottomGroup = level1.slice(half);

  spreadRow(topGroup, centerY - GAP_Y, centerX);
  spreadRow(bottomGroup, centerY + GAP_Y, centerX);

  // parent id -> [child ids]
  const childrenOf = new Map();
  for (const edge of graph.edges) {
    if (!childrenOf.has(edge.source)) childrenOf.set(edge.source, []);
    childrenOf.get(edge.source).push(edge.target);
  }
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const topParents = topGroup.filter((p) => childrenOf.has(p.id));
  const bottomParents = bottomGroup.filter((p) => childrenOf.has(p.id));

  placeLevel2(topParents, "top");
  placeLevel2(bottomParents, "bottom");

  // bounds (for fit-to-view)
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of graph.nodes) {
    const r = node.level === 0 ? CENTER_R : NODE_R;
    minX = Math.min(minX, node.x - r);
    maxX = Math.max(maxX, node.x + r);
    minY = Math.min(minY, node.y - r);
    maxY = Math.max(maxY, node.y + r);
  }

  return {
    nodes: graph.nodes,
    edges: graph.edges,
    center: rootNode,
    radius: { center: CENTER_R, node: NODE_R },
    bounds: { minX, maxX, minY, maxY },
  };

  // -------------------------------------------------------------

  function placeLevel2(parents, side) {
    const items = [];

    for (const parent of parents) {
      const kids = childrenOf.get(parent.id) || [];
      kids.forEach((kid, i) => {
        const node = byId.get(kid);
        if (!node) return;
        const offset = (i - (kids.length - 1) / 2) * GAP_X;
        items.push({ node, x: parent.x + offset });
      });
    }

    if (!items.length) return;

    // push apart on the same row, then re-center the whole row
    items.sort((a, b) => a.x - b.x);
    const MIN = GAP_X * 0.95;
    for (let i = 1; i < items.length; i++) {
      if (items[i].x - items[i - 1].x < MIN) {
        items[i].x = items[i - 1].x + MIN;
      }
    }

    const first = items[0].x;
    const last = items[items.length - 1].x;
    const shift = centerX - (first + last) / 2;
    const y = side === "top" ? centerY - 2 * GAP_Y : centerY + 2 * GAP_Y;

    for (const item of items) {
      item.node.x = item.x + shift;
      item.node.y = y;
    }
  }

  function spreadRow(nodes, y, cx) {
    if (!nodes.length) return;
    const total = (nodes.length - 1) * GAP_X;
    const start = cx - total / 2;
    nodes.forEach((node, i) => {
      node.x = start + i * GAP_X;
      node.y = y;
    });
  }
}

/**
 * Cubic-bezier connector between two positioned nodes.
 */
export function edgePath(a, b, radius) {
  const r1 = a.level === 0 ? radius.center : radius.node;
  const r2 = b.level === 0 ? radius.center : radius.node;

  const dir = b.y >= a.y ? 1 : -1;
  const y1 = a.y + dir * r1;
  const y2 = b.y - dir * r2;
  const midY = (y1 + y2) / 2;

  return `M ${a.x} ${y1} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${y2}`;
}

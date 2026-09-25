// graph.js — turn data/final/level.json into a small, renderable subgraph.

/**
 * buildGraph walks the level graph from a root kanji.
 *
 * @param {string} root            character of the center kanji
 * @param {object} opts
 * @param {number} opts.depth      how many levels to expand
 * @param {"children"|"reverse"} opts.direction
 *        children = đi lên chữ phức tạp hơn (level1 -> level2 -> level3)
 *        reverse  = bóc thành phần đơn giản hơn (level3 -> level2 -> level1)
 * @param {object} opts.data       loaded dataset (kanji, level, upAdj, downAdj)
 * @param {Set<number>} opts.levels  cấp độ đang bật (1,2,3)
 * @returns {{root:string, nodes:Array, edges:Array, direction:string}}
 */
export function buildGraph(root, opts) {
  const { depth, direction, data, levels } = opts;
  const adj = direction === "reverse" ? data.downAdj : data.upAdj;

  const nodes = new Map();
  nodes.set(root, { id: root, level: 0 });

  const edges = [];
  const edgeKeys = new Set();
  const visited = new Set([root]); // cycle guard

  let frontier = [root];

  for (let level = 1; level <= depth; level++) {
    const next = [];

    for (const id of frontier) {
      const list = adj.get(id) || [];

      for (const other of list) {
        if (visited.has(other)) continue;

        const entry = data.kanji[other];
        if (!entry) continue;

        const otherLevel = data.level[other] && data.level[other].level;
        if (levels && otherLevel && !levels.has(otherLevel)) continue;

        const key = `${id}->${other}`;
        if (edgeKeys.has(key)) continue;
        edgeKeys.add(key);

        visited.add(other);
        nodes.set(other, { id: other, level });
        edges.push({
          source: id,
          target: other,
          type: direction === "reverse" ? "component" : "expand",
          position: null,
        });
        next.push(other);
      }
    }

    frontier = next;
  }

  return {
    root,
    nodes: [...nodes.values()],
    edges,
    direction,
  };
}

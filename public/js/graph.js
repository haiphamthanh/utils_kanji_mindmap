// graph.js — turn the dataset into a small, renderable subgraph.

/**
 * buildGraph walks the relation graph from a root kanji.
 *
 * @param {string} root            literal of the center kanji
 * @param {object} opts
 * @param {number} opts.depth      how many levels to expand
 * @param {"children"|"reverse"} opts.direction
 *        children = kanji that CONTAIN root (default)
 *        reverse  = components that MAKE UP root
 * @param {object} opts.data       loaded dataset (kanji, outAdj, inAdj)
 * @param {Set<string>} opts.jlpt  active JLPT levels
 * @returns {{root:string, nodes:Array, edges:Array, direction:string}}
 */
export function buildGraph(root, opts) {
  const { depth, direction, data, jlpt } = opts;
  const { kanji, outAdj, inAdj } = data;

  const nodes = new Map();
  nodes.set(root, { id: root, level: 0 });

  const edges = [];
  const edgeKeys = new Set();
  const visited = new Set([root]); // cycle guard (see idea #29)

  let frontier = [root];

  for (let level = 1; level <= depth; level++) {
    const next = [];

    for (const id of frontier) {
      const list =
        direction === "reverse"
          ? inAdj.get(id) || []
          : outAdj.get(id) || [];

      for (const edge of list) {
        const other = direction === "reverse" ? edge.from : edge.to;
        if (visited.has(other)) continue;

        const entry = kanji[other];
        if (!entry) continue;
        if (jlpt && !jlpt.has(entry.jlpt)) continue;

        const key = `${id}->${other}`;
        if (edgeKeys.has(key)) continue;
        edgeKeys.add(key);

        visited.add(other);
        nodes.set(other, { id: other, level });
        edges.push({
          source: id,
          target: other,
          type: edge.type || "component",
          position: edge.position || null,
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

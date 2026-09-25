// graph.js — build a level-window subgraph from data/final/level.json.
//
// Cấp dữ liệu (level.json.level):
//   1 = chữ cơ sở (bộ phận / bộ thủ)
//   2 = chữ ghép từ cấp 1
//   3 = chữ ghép từ cấp 2
//
// Từ center, ta chỉ mở rộng theo 2 hướng đúng nghĩa "cấp":
//   lên  (components) : cấp 3 -> cấp 2 -> cấp 1
//   xuống (composites): cấp 1 -> cấp 2 -> cấp 3
// Không đi ngang sang chữ cùng cấp (tránh bùng nổ node).

const MAX_LEVEL = 3;

function levelOf(data, ch) {
  const entry = data.level[ch];
  return entry ? entry.level : null;
}

function charsOf(list) {
  return (list || []).map((x) => x.character);
}

// Các bộ phận đơn giản hơn (đi lên) của một chữ.
function componentsOf(data, ch) {
  const entry = data.level[ch];
  if (!entry) return [];
  if (entry.level === 2) return charsOf(entry.level1);
  if (entry.level === 3) return charsOf(entry.level2);
  return [];
}

// Các chữ phức tạp hơn chứa nó (đi xuống).
function compositesOf(data, ch) {
  const entry = data.level[ch];
  if (!entry) return [];
  if (entry.level === 1) return charsOf(entry.level2);
  if (entry.level === 2) return charsOf(entry.level3);
  return [];
}

/**
 * @param {string} root  chữ trung tâm
 * @param {object} opts
 * @param {number} opts.depth        số cấp độ hiển thị (1..3)
 * @param {object} opts.data         dataset đã load
 * @param {Set<string>} opts.jlpt    các cấp JLPT đang bật (N5..N1)
 */
export function buildGraph(root, opts) {
  const { depth, data, jlpt } = opts;
  const Lc = levelOf(data, root);
  if (!Lc) return { root, nodes: [], edges: [], centerLevel: null, levels: [] };

  const clampDepth = Math.max(1, Math.min(MAX_LEVEL, depth || 1));

  // Cửa sổ cấp độ: bắt đầu từ center rồi dịch lên nếu vượt mức 3.
  const startLevel = Math.min(Lc, MAX_LEVEL - clampDepth + 1);
  const window = new Set();
  for (let lv = startLevel; lv < startLevel + clampDepth; lv++) {
    if (lv >= 1 && lv <= MAX_LEVEL) window.add(lv);
  }
  const minW = Math.min(...window);
  const maxW = Math.max(...window);

  const nodes = new Map();
  const edges = [];
  const edgeKeys = new Set();

  const addNode = (id, role, parent) => {
    if (!data.kanji[id]) return false;
    if (!nodes.has(id)) nodes.set(id, { id, role, dataLevel: levelOf(data, id), parent: parent ?? null });
    return true;
  };

  const addEdge = (source, target, type) => {
    const key = `${source}->${target}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ source, target, type });
  };

  addNode(root, "center", null);

  // Đi xuống: center -> cấp cao hơn.
  let frontier = [{ id: root }];
  for (let step = 1; step <= maxW - Lc; step++) {
    const next = [];
    for (const node of frontier) {
      for (const child of compositesOf(data, node.id)) {
        if (!window.has(levelOf(data, child))) continue;
        if (!addNode(child, "down", node.id)) continue;
        addEdge(node.id, child, "expand");
        next.push({ id: child });
      }
    }
    frontier = next;
  }

  // Đi lên: center -> cấp thấp hơn.
  frontier = [{ id: root }];
  for (let step = 1; step <= Lc - minW; step++) {
    const next = [];
    for (const node of frontier) {
      for (const parent of componentsOf(data, node.id)) {
        if (!window.has(levelOf(data, parent))) continue;
        if (!addNode(parent, "up", node.id)) continue;
        addEdge(parent, node.id, "component");
        next.push({ id: parent });
      }
    }
    frontier = next;
  }

  // Lọc JLPT (center luôn hiện).
  const jlptKept = (id) => {
    if (id === root) return true;
    if (!jlpt || jlpt.size === 0) return false;
    return jlpt.has(data.kanji[id] && data.kanji[id].jlpt);
  };

  const keptEdges = edges.filter(
    (e) => jlptKept(e.source) && jlptKept(e.target)
  );

  // Chỉ giữ node còn nối tới center qua các node được giữ.
  const adj = new Map();
  for (const e of keptEdges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source).push(e.target);
    adj.get(e.target).push(e.source);
  }

  const reachable = new Set([root]);
  const queue = [root];
  while (queue.length) {
    const id = queue.shift();
    for (const nb of adj.get(id) || []) {
      if (reachable.has(nb)) continue;
      reachable.add(nb);
      queue.push(nb);
    }
  }

  const finalNodes = [...nodes.values()].filter((n) => reachable.has(n.id));

  return {
    root,
    nodes: finalNodes,
    edges: keptEdges,
    centerLevel: Lc,
    levels: [...window].sort((a, b) => a - b),
  };
}

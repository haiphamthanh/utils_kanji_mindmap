// data.js — load data/final/kanji.json + data/final/level.json, build lookup indexes.
//
// kanji.json : mảng các chữ { id, character, character_name_vi, chosen_name,
//              meanings_vi, components, biggest_component }
// level.json : object keyed theo chữ, chứa cấp độ 1/2/3 và quan hệ giữa các cấp

let cache = null;

export async function loadData() {
  if (cache) return cache;

  const [kanjiList, level] = await Promise.all([
    fetch("/data/kanji.json").then((r) => r.json()),
    fetch("/data/level.json").then((r) => r.json()),
  ]);

  const kanji = {};
  for (const entry of kanjiList) kanji[entry.character] = entry;

  // upAdj   : đi lên (bóc ra chữ đơn giản hơn)  level1 -> level2 -> level3
  // downAdj : đi xuống (chữ phức tạp chứa nó)    level3 -> level2 -> level1
  const upAdj = new Map();
  const downAdj = new Map();
  const addEdge = (map, from, to) => {
    if (!map.has(from)) map.set(from, []);
    if (!map.get(from).includes(to)) map.get(from).push(to);
  };

  for (const [ch, lv] of Object.entries(level)) {
    if (lv.level === 1) {
      for (const x of lv.level2 || []) addEdge(upAdj, ch, x.character);
    } else if (lv.level === 2) {
      for (const x of lv.level3 || []) addEdge(upAdj, ch, x.character);
      for (const x of lv.level1 || []) addEdge(downAdj, ch, x.character);
    } else if (lv.level === 3) {
      for (const x of lv.level2 || []) addEdge(downAdj, ch, x.character);
    }
  }

  cache = {
    kanji,
    level,
    list: kanjiList,
    upAdj,
    downAdj,
  };
  return cache;
}

// ---------------------------------------------------------------
// Search: literal / chosen_name / character_name_vi / nghĩa tiếng Việt
// ---------------------------------------------------------------

export function searchKanji(query, data, limit = 8) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored = [];
  for (const entry of data.list) {
    const score = scoreEntry(entry, q);
    if (score > 0) scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score || a.entry.id - b.entry.id);
  return scored.slice(0, limit).map((s) => s.entry);
}

function scoreEntry(entry, q) {
  let score = 0;

  const ch = entry.character;
  if (ch === q) score = Math.max(score, 120);
  else if (ch.includes(q)) score = Math.max(score, 80);

  const chosen = (entry.chosen_name || "").toLowerCase();
  if (chosen === q) score = Math.max(score, 110);
  else if (chosen.startsWith(q)) score = Math.max(score, 75);
  else if (chosen.includes(q)) score = Math.max(score, 55);

  const names = (entry.character_name_vi || "").toLowerCase();
  if (names.includes(q)) score = Math.max(score, 50);

  for (const meaning of entry.meanings_vi || []) {
    const m = meaning.toLowerCase();
    if (m === q) score = Math.max(score, 70);
    else if (m.startsWith(q)) score = Math.max(score, 45);
    else if (m.includes(q)) score = Math.max(score, 30);
  }

  return score;
}

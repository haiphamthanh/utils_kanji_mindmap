// scripts/build-data.js
// Stage 2 — đọc data/kanji-source.json và sinh dữ liệu cho project:
//   public/data/kanji.json
//   public/data/relations.json
//
// Mục tiêu: dữ liệu khớp schema UI BẢN GỐC (không cần sửa giao diện).
//
// Quan hệ (nhiều tầng, để chọn số tầng có ý nghĩa):
//   1. V6 containment: component_seed <-> chain (type "component"), 2 chiều để
//      đi được cả xuống (mở rộng) lẫn lên (về seed).
//   2. Fallback theo bộ cho ký tự KHÔNG có trong V6 (type "radical").
//   Sau đó giới hạn fan-out mỗi node (MAX_OUT) vì layout bản gốc chỉ hợp ~20 node.
//
// `jlpt` được gán TRANG TRÍ (deterministic) chỉ để tô màu/filter như bản gốc.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "data/kanji-source.json");
const OUT_DIR = path.join(ROOT, "public/data");
const OUT_KANJI = path.join(OUT_DIR, "kanji.json");
const OUT_RELATIONS = path.join(OUT_DIR, "relations.json");

const LEVELS = ["N5", "N4", "N3", "N2", "N1"];
const MAX_OUT = 24; // số quan hệ tối đa tỏa ra từ 1 node (layout gốc ~20)

function decorativeLevel(ch) {
  let hash = 0;
  for (const c of ch) hash = (hash * 31 + c.codePointAt(0)) >>> 0;
  return LEVELS[hash % LEVELS.length];
}

function toCodepoint(ch) {
  return "U+" + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
}

function build() {
  if (!fs.existsSync(SRC)) {
    throw new Error("Chưa có data/kanji-source.json — hãy chạy `npm run extract` trước.");
  }

  const src = JSON.parse(fs.readFileSync(SRC, "utf8"));
  const kanji = {};

  // -----------------------------------------------------------------
  // 1. Ký tự có trong từ điển bộ thủ
  // -----------------------------------------------------------------
  for (const c of Object.values(src.characters)) {
    kanji[c.character] = {
      literal: c.character,
      codepoint: toCodepoint(c.character),
      node_type: "kanji",
      jlpt: decorativeLevel(c.character),
      stroke_count: null,
      readings: { on: [], kun: [] },
      meanings: { vi: c.meanings_vi, en: [] },
      radical: {
        character: c.component,
        name_vi: c.radical_name_vi,
        stroke_count: c.radical_stroke_count,
      },
      components: [{ character: c.component, role: "radical", position: null }],
      tags: c.is_joyo ? ["joyo"] : [],
      han_viet: c.han_viet,
    };
  }

  // tra cứu bộ: thành viên -> bộ, và bộ -> các thành viên
  const componentOf = new Map();
  const membersByComponent = new Map();
  for (const family of src.families) {
    const members = family.members.filter((m) => m !== family.component);
    membersByComponent.set(family.component, members);
    for (const m of members) componentOf.set(m, family.component);
  }

  // -----------------------------------------------------------------
  // 2. Sinh quan hệ (thô)
  // -----------------------------------------------------------------
  const raw = [];
  const edgeKeys = new Set();
  const covered = new Set();

  function addRaw(from, to, type) {
    if (!from || !to || from === to) return;
    const key = `${from}|${to}|${type}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    raw.push({ from, to, type });
  }

  // 2a. V6 containment (2 chiều)
  for (const fam of src.formationFamilies || []) {
    const seed = fam.component_seed;
    if (!seed) continue;
    for (const member of fam.chain || []) {
      if (member === seed) continue;
      addRaw(seed, member, "component");
      addRaw(member, seed, "component");
      covered.add(seed);
      covered.add(member);
    }
  }

  // 2b. Fallback theo bộ (chỉ với ký tự không có trong V6)
  for (const ch of Object.keys(kanji)) {
    if (covered.has(ch)) continue;
    const component = membersByComponent.has(ch) ? ch : componentOf.get(ch);
    const siblings = component ? membersByComponent.get(component) : null;
    if (!siblings) continue;
    for (const sibling of siblings) addRaw(ch, sibling, "radical");
  }

  // -----------------------------------------------------------------
  // 3. Giới hạn fan-out: ưu tiên "component" trước "radical", giữ ổn định
  // -----------------------------------------------------------------
  const bySource = new Map();
  for (const edge of raw) {
    if (!bySource.has(edge.from)) bySource.set(edge.from, []);
    bySource.get(edge.from).push(edge);
  }

  const edges = [];
  const priority = { component: 0, radical: 1 };
  for (const list of bySource.values()) {
    list.sort((a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9));
    for (const edge of list.slice(0, MAX_OUT)) {
      edges.push({ ...edge, position: null });
    }
  }

  // -----------------------------------------------------------------
  // 4. Node phụ: ký tự được quan hệ nhắc tới nhưng chưa có trong từ điển
  // -----------------------------------------------------------------
  let extraNodes = 0;
  for (const edge of edges) {
    for (const id of [edge.from, edge.to]) {
      if (kanji[id]) continue;
      extraNodes++;
      kanji[id] = {
        literal: id,
        codepoint: toCodepoint(id),
        node_type: "extra",
        jlpt: decorativeLevel(id),
        stroke_count: null,
        readings: { on: [], kun: [] },
        meanings: { vi: [], en: [] },
        radical: { character: null, name_vi: null, stroke_count: null },
        components: [],
        tags: [],
        han_viet: null,
      };
    }
  }

  const relations = {
    version: "5.0.0",
    generated_at: new Date().toISOString(),
    model: "v6-containment",
    edge_types: ["component", "radical"],
    max_out: MAX_OUT,
    note: "component = V6 containment (seed <-> chain); radical = fallback cùng bộ. jlpt trang trí để tô màu.",
    edges,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_KANJI, JSON.stringify(kanji, null, 2));
  fs.writeFileSync(OUT_RELATIONS, JSON.stringify(relations, null, 2));

  // -----------------------------------------------------------------
  // 5. Kiểm tra
  // -----------------------------------------------------------------
  const problems = [];
  for (const e of edges) {
    if (!kanji[e.from]) problems.push(`from thiếu: ${e.from}`);
    if (!kanji[e.to]) problems.push(`to thiếu: ${e.to}`);
  }
  const orphan = Object.keys(kanji).filter(
    (id) => !bySource.has(id)
  ).length;

  console.log(
    `[build] ${Object.keys(kanji).length} node (${extraNodes} extra) · ${edges.length} cạnh ` +
      `(component ${edges.filter((e) => e.type === "component").length}, ` +
      `radical ${edges.filter((e) => e.type === "radical").length}) -> public/data/`
  );
  console.log(`[build] node không có quan hệ đi ra: ${orphan}`);
  if (problems.length) {
    console.warn(`[build] ${problems.length} cảnh báo:`);
    problems.slice(0, 10).forEach((p) => console.warn("  -", p));
  }
}

build();

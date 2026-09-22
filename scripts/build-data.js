// scripts/build-data.js
// Stage 2 — đọc data/kanji-source.json và sinh dữ liệu cho project:
//   public/data/kanji.json
//   public/data/relations.json
//
// Mục tiêu: dữ liệu khớp schema UI BẢN GỐC (không cần sửa giao diện).
//   - kanji.json: literal, jlpt, stroke_count, readings, meanings, components...
//   - relations.json: cạnh CÓ HƯỚNG { from, to, type } để graph children/reverse chạy.
//
// Vì dữ liệu thật KHÔNG có JLPT, trường `jlpt` được gán TRANG TRÍ (deterministic)
// chỉ để tô màu/ filter như bản gốc. Không phải JLPT thật.
//
// Quan hệ theo bộ thủ, phát 2 chiều để bất kỳ Hán tự nào cũng có sơ đồ:
//   bộ -> thành viên   (xem các Hán tự cùng bộ)
//   thành viên -> bộ   (đi lên tâm bộ, rồi tỏa ra các thành viên khác)

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "data/kanji-source.json");
const OUT_DIR = path.join(ROOT, "public/data");
const OUT_KANJI = path.join(OUT_DIR, "kanji.json");
const OUT_RELATIONS = path.join(OUT_DIR, "relations.json");

const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

// Gán level trang trí, ổn định theo ký tự (để tô màu như bản gốc).
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
  // 1. Ký tự có trong từ điển
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

  // -----------------------------------------------------------------
  // 2. Bộ thủ không có trong từ điển (vd 丶 丿) -> node để click được
  // -----------------------------------------------------------------
  let radicalNodes = 0;
  for (const family of src.families) {
    const comp = family.component;
    if (kanji[comp]) continue;
    radicalNodes++;
    kanji[comp] = {
      literal: comp,
      codepoint: toCodepoint(comp),
      node_type: "radical",
      jlpt: decorativeLevel(comp),
      stroke_count: family.radical_stroke_count,
      readings: { on: [], kun: [] },
      meanings: { vi: [], en: [] },
      radical: {
        character: comp,
        name_vi: family.radical_name_vi,
        stroke_count: family.radical_stroke_count,
      },
      components: [{ character: comp, role: "radical", position: null }],
      tags: ["radical"],
      han_viet: family.radical_name_vi,
    };
  }

  // -----------------------------------------------------------------
  // 3. Quan hệ: bộ <-> thành viên (2 chiều)
  // -----------------------------------------------------------------
  const edges = [];
  const seen = new Set();
  for (const family of src.families) {
    const comp = family.component;
    for (const member of family.members) {
      if (member === comp) continue;

      const down = `${comp}->${member}`;
      if (!seen.has(down)) {
        seen.add(down);
        edges.push({ from: comp, to: member, type: "component", position: null });
      }

      const up = `${member}->${comp}`;
      if (!seen.has(up)) {
        seen.add(up);
        edges.push({ from: member, to: comp, type: "component", position: null });
      }
    }
  }

  const relations = {
    version: "3.0.0",
    generated_at: new Date().toISOString(),
    model: "radical-family-directed",
    lookLike: "original-ui",
    edge_types: ["component"],
    note: "jlpt được gán trang trí để tô màu, không phải JLPT thật.",
    edges,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_KANJI, JSON.stringify(kanji, null, 2));
  fs.writeFileSync(OUT_RELATIONS, JSON.stringify(relations, null, 2));

  // -----------------------------------------------------------------
  // 4. Kiểm tra
  // -----------------------------------------------------------------
  const problems = [];
  for (const e of edges) {
    if (!kanji[e.from]) problems.push(`from thiếu: ${e.from}`);
    if (!kanji[e.to]) problems.push(`to thiếu: ${e.to}`);
  }

  const levelCounts = {};
  for (const k of Object.values(kanji)) levelCounts[k.jlpt] = (levelCounts[k.jlpt] || 0) + 1;

  console.log(
    `[build] ${Object.keys(kanji).length} node (${radicalNodes} bộ-only) · ${edges.length} cạnh -> public/data/`
  );
  console.log(`[build] phân bố màu (trang trí): ${JSON.stringify(levelCounts)}`);
  if (problems.length) {
    console.warn(`[build] ${problems.length} cảnh báo:`);
    problems.slice(0, 10).forEach((p) => console.warn("  -", p));
  }
}

build();

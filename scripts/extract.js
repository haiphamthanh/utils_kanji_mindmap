// scripts/extract.js
// Stage 1 — đọc dữ liệu thô trong idea/data/ và chỉ rút trích các trường cần thiết,
// lưu thành file trung gian data/kanji-source.json.
//
// Model: radical-family (theo bộ) -> dùng file "han_tu_theo_bo...".
// File "2136_Kanji_V6..." chỉ được rút trích sang mục formationFamilies để tham khảo,
// KHÔNG được build sử dụng.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RAW_DICT = path.join(ROOT, "idea/data/han_tu_theo_bo_hoan_chinh_1895_v2.json");
const RAW_FORMATION = path.join(ROOT, "idea/data/2136_Kanji_V6_Full_Expansion_Bank.json");
const OUT = path.join(ROOT, "data/kanji-source.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function extract() {
  if (!fs.existsSync(RAW_DICT)) {
    throw new Error(`Không thấy file từ điển: ${path.relative(ROOT, RAW_DICT)}`);
  }

  const dict = readJson(RAW_DICT);

  // -----------------------------------------------------------------
  // characters: gom mỗi ký tự một lần, kèm bộ (radical family) của nó
  // -----------------------------------------------------------------
  const characters = {};
  for (const group of dict.groups) {
    for (const item of group.items) {
      const ch = item.character;
      if (characters[ch]) continue; // mỗi ký tự chỉ thuộc 1 bộ
      characters[ch] = {
        character: ch,
        han_viet: item.character_name_vi || null,
        meanings_vi: Array.isArray(item.meanings_vi) ? item.meanings_vi : [],
        is_joyo: !!item.is_joyo,
        meaning_source: item.meaning_source || null,
        component: group.component,
        radical_name_vi: group.radical_name_vi || null,
        radical_stroke_count: group.radical_stroke_count ?? null,
      };
    }
  }

  // -----------------------------------------------------------------
  // families: bộ -> danh sách ký tự cùng bộ (nguồn quan hệ)
  // -----------------------------------------------------------------
  const families = dict.groups.map((group) => ({
    component: group.component,
    radical_name_vi: group.radical_name_vi || null,
    radical_stroke_count: group.radical_stroke_count ?? null,
    members: group.items.map((item) => item.character),
  }));

  // -----------------------------------------------------------------
  // formationFamilies: rút gọn file V6 (tham khảo, không dùng để build)
  // -----------------------------------------------------------------
  let formationFamilies = [];
  let formationNote = null;
  if (fs.existsSync(RAW_FORMATION)) {
    try {
      const raw = readJson(RAW_FORMATION);
      formationFamilies = raw.map((o) => ({
        id: o.id,
        component_seed: o.component_seed || null,
        semantic_seed: o.semantic_seed || null,
        relation_class: o.relation_class || null,
        confidence: o.confidence || null,
        status: o.status || null,
        known_bridges: o.known_bridges || [],
        chain: o.chain || [],
        new_kanji: o.new_kanji || [],
      }));
    } catch (err) {
      formationNote = `Bỏ qua file formation: ${err.message}`;
    }
  } else {
    formationNote = "Không có file formation.";
  }

  const meta = {
    generated_at: new Date().toISOString(),
    model: "radical-family",
    sources: {
      dictionary: path.relative(ROOT, RAW_DICT),
      formation: fs.existsSync(RAW_FORMATION) ? path.relative(ROOT, RAW_FORMATION) : null,
    },
    character_count: Object.keys(characters).length,
    family_count: families.length,
    formation_family_count: formationFamilies.length,
    note:
      "formationFamilies chỉ để tham khảo cho tương lai; build-data.js KHÔNG dùng (mô hình theo bộ).",
    warning: formationNote,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ meta, characters, families, formationFamilies }, null, 2));

  console.log(
    `[extract] ${meta.character_count} ký tự · ${meta.family_count} bộ · ` +
      `${meta.formation_family_count} formation family (không dùng) -> ${path.relative(ROOT, OUT)}`
  );
}

extract();

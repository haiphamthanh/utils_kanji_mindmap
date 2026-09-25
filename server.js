const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, "data", "final");

// Dữ liệu runtime lấy trực tiếp từ data/final/ (nguồn chuẩn).
app.use(
  "/data",
  express.static(DATA_DIR, {
    etag: false,
    maxAge: 0,
  })
);

app.use(
  express.static(path.join(__dirname, "public"), {
    etag: false,
    maxAge: 0,
  })
);

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "kanji-map" });
});

// ---------------------------------------------------------------
// Đánh dấu: đã nhớ (learned) + yêu thích (favorites)
// ---------------------------------------------------------------

const MARK_FILES = {
  learned: path.join(DATA_DIR, "learned.json"),
  favorites: path.join(DATA_DIR, "favorites.json"),
};

function readMarks(kind) {
  try {
    const raw = fs.readFileSync(MARK_FILES[kind], "utf8");
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

function writeMarks(kind, list) {
  const unique = [...new Set(list)].sort();
  fs.writeFileSync(MARK_FILES[kind], JSON.stringify(unique, null, 2) + "\n");
  return unique;
}

app.get("/api/marks", (req, res) => {
  res.json({
    learned: readMarks("learned"),
    favorites: readMarks("favorites"),
  });
});

app.post("/api/marks/:kind", (req, res) => {
  const { kind } = req.params;
  if (!MARK_FILES[kind]) {
    return res.status(400).json({ error: "Loại đánh dấu không hợp lệ." });
  }

  const { character, value } = req.body || {};
  if (typeof character !== "string" || character.length === 0) {
    return res.status(400).json({ error: "Thiếu character." });
  }

  const list = readMarks(kind);
  const next = value
    ? [...list, character]
    : list.filter((c) => c !== character);

  try {
    const saved = writeMarks(kind, next);
    res.json({ ok: true, values: saved });
  } catch (err) {
    res.status(500).json({ error: "Không ghi được dữ liệu." });
  }
});

app.listen(PORT, () => {
  console.log(`Kanji Map running at http://localhost:${PORT}`);
});

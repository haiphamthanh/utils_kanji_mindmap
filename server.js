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
  hidden: path.join(DATA_DIR, "hidden.json"),
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
    hidden: readMarks("hidden"),
  });
});

// ---------------------------------------------------------------
// UI settings (view state)
// ---------------------------------------------------------------

const UI_FILE = path.join(DATA_DIR, "ui_setting.json");

function readUISettings() {
  try {
    const data = JSON.parse(fs.readFileSync(UI_FILE, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch (_) {
    return {};
  }
}

app.get("/api/ui", (req, res) => {
  res.json(readUISettings());
});

app.post("/api/ui", (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ error: "Dữ liệu không hợp lệ." });
  }
  try {
    fs.writeFileSync(UI_FILE, JSON.stringify(body, null, 2) + "\n");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Không ghi được ui_setting." });
  }
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

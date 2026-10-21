const express = require("express");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");

const app = express();
const PORT = process.env.PORT || 5188;

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

// ---------------------------------------------------------------
// Nhận diện chữ viết tay — fallback online (Google IME handwriting)
// ---------------------------------------------------------------

const HANDWRITING_ENDPOINT =
  "https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8";

const MAX_STROKES = 40;
const MAX_POINTS_PER_STROKE = 600;
const MAX_POINTS_TOTAL = 4000;

function sanitizeStrokes(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_STROKES) {
    return null;
  }

  const strokes = [];
  let total = 0;

  for (const stroke of raw) {
    if (
      !Array.isArray(stroke) ||
      stroke.length === 0 ||
      stroke.length > MAX_POINTS_PER_STROKE
    ) {
      return null;
    }

    const points = [];
    for (const point of stroke) {
      if (!Array.isArray(point) || point.length !== 2) return null;
      const x = Number(point[0]);
      const y = Number(point[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      points.push([
        Math.min(300, Math.max(0, Math.round(x))),
        Math.min(300, Math.max(0, Math.round(y))),
      ]);
    }

    total += points.length;
    if (total > MAX_POINTS_TOTAL) return null;
    strokes.push(points);
  }

  return strokes;
}

app.post("/api/handwriting", async (req, res) => {
  const ink = sanitizeStrokes(req.body && req.body.strokes);
  if (!ink) {
    return res.status(400).json({ error: "Nét vẽ không hợp lệ." });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const upstream = await fetch(HANDWRITING_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        options: "enable_pre_space",
        requests: [
          {
            writing_guide: { writing_area_width: 300, writing_area_height: 300 },
            ink,
            language: "ja",
          },
        ],
      }),
    });

    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);

    const data = await upstream.json();
    const raw =
      data && data[1] && data[1][0] && data[1][0][1] ? data[1][0][1] : [];
    const candidates = raw.filter((c) => typeof c === "string" && c.length > 0);

    if (!candidates.length) {
      return res.status(502).json({ error: "Dịch vụ nhận diện không trả về kết quả." });
    }

    res.json({ candidates: candidates.slice(0, 10) });
  } catch (err) {
    res.status(502).json({ error: "Không gọi được dịch vụ nhận diện online." });
  } finally {
    clearTimeout(timer);
  }
});

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Kanji Map running at ${url}`);
  if (process.env.KANJI_OPEN === "1") openBrowser(url);
});

function openBrowser(url) {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

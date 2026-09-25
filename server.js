const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Dữ liệu runtime lấy trực tiếp từ data/final/ (nguồn chuẩn).
app.use(
  "/data",
  express.static(path.join(__dirname, "data", "final"), {
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

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "kanji-map" });
});

app.listen(PORT, () => {
  console.log(`Kanji Map running at http://localhost:${PORT}`);
});

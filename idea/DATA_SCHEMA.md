# Kanji Map — Đặc tả dữ liệu (JSON Schema)

Tài liệu này chốt **format dữ liệu** cho 2.136 Jōyō Kanji. Mục tiêu: khi có data,
chỉ cần đổ vào đúng 2 file là graph engine chạy, **không sửa code**.

Nguyên tắc bất di bất dịch (mục #49 trong `idea.md`):

> DATA → GRAPH → UI. Không bao giờ để UI tự đoán quan hệ từ hình dạng Unicode.

---

## 1. Hai file dữ liệu

| File | Vai trò | Kích thước dự kiến |
|------|---------|--------------------|
| `public/data/kanji.json` | Từ điển: mỗi Hán tự là 1 entry | ~1.5–2.5 MB |
| `public/data/relations.json` | Danh sách cạnh (quan hệ) giữa các Hán tự | ~0.5–1.5 MB |

Cả hai load 1 lần bằng `fetch()` khi mở trang. Không cần API.

---

## 2. `kanji.json` — Từ điển Hán tự

Là **object keyed by literal** (không phải array) để tra cứu O(1) khi build graph.

```json
{
  "車": {
    "literal": "車",
    "codepoint": "U+8ECA",
    "stroke_count": 7,
    "grade": 1,
    "jlpt": "N5",
    "frequency": 101,
    "radical": {
      "character": "車",
      "number": 159,
      "name_vi": "xa",
      "name_en": "cart"
    },
    "readings": {
      "on": ["シャ"],
      "kun": ["くるま"]
    },
    "meanings": {
      "vi": ["xe", "xe cộ"],
      "en": ["car", "vehicle"]
    },
    "components": [
      { "character": "車", "role": "radical", "position": "full" }
    ],
    "tags": ["joyo", "grade1"],
    "svg": null
  },

  "軍": {
    "literal": "軍",
    "codepoint": "U+8ECD",
    "stroke_count": 9,
    "grade": 4,
    "jlpt": "N3",
    "frequency": 253,
    "radical": {
      "character": "車",
      "number": 159,
      "name_vi": "xa",
      "name_en": "cart"
    },
    "readings": {
      "on": ["グン"],
      "kun": []
    },
    "meanings": {
      "vi": ["quân đội", "quân"],
      "en": ["army", "force", "troops", "war"]
    },
    "components": [
      { "character": "冖", "role": "component", "position": "top" },
      { "character": "車", "role": "radical", "position": "bottom" }
    ],
    "tags": ["joyo", "grade4"],
    "svg": null
  }
}
```

### 2.1. Bảng field

| Field | Bắt buộc | Kiểu | Ghi chú |
|-------|:--------:|------|---------|
| `literal` | ✓ | string (1 ký tự) | Chính là key. Dùng để validate chống lệch key. |
| `codepoint` | – | string | `"U+8ECA"`. Tiện debug / tra Unihan. |
| `stroke_count` | ✓ | integer 1–34 | Số nét. |
| `grade` | – | integer \| null | 1–6 = cấp tiểu học, 8 = Jōyō trung học, 9 = Jinmeiyō, null = khác. |
| `jlpt` | ✓ | `"N5".."N1"` | Dùng để tô màu node + filter. |
| `frequency` | – | integer \| null | Thứ hạng tần suất (1 = phổ biến nhất). Sắp xếp search. |
| `radical` | – | object | Bộ thủ. |
| `readings.on` | – | string[] | Âm On (katakana). |
| `readings.kun` | – | string[] | Âm Kun (hiragana). |
| `meanings.vi` | ✓ | string[] | Nghĩa tiếng Việt — hiển thị chính. |
| `meanings.en` | – | string[] | Nghĩa tiếng Anh — fallback. |
| `components` | – | object[] | Các bộ phận cấu thành (xem 2.2). |
| `tags` | – | string[] | `joyo`, `grade1`, `jinmeiyo`, `kokuji`... |
| `svg` | – | string \| null | Tùy chọn: path/nội dung SVG nét vẽ (KanjiVG). |

### 2.2. `components[]` — bộ phận cấu thành

Đây là nguồn để **sinh `relations.json`** (xem mục 4). Mỗi phần tử:

| Field | Kiểu | Ghi chú |
|-------|------|---------|
| `character` | string | Ký tự bộ phận (có thể là bộ thủ hoặc thành phần không phải chữ). |
| `role` | enum | `radical` \| `component` \| `phonetic` \| `part`. |
| `position` | enum | `full` \| `left` \| `right` \| `top` \| `bottom` \| `enclosure` \| `inside` \| `overlay`. |

> Khuyến nghị nguồn: **IDS** (Ideographic Description Sequence) trong Unihan hoặc
> dữ liệu cấu tạo của KanjiVG. Không tự tách bằng regex.

---

## 3. `relations.json` — Quan hệ

```json
{
  "version": "1.0.0",
  "generated_at": "2026-09-22T00:00:00Z",
  "edge_types": ["component", "radical", "phonetic", "semantic", "variant", "similar"],
  "edges": [
    { "from": "車", "to": "軍", "type": "component", "position": "bottom", "weight": 1 },
    { "from": "車", "to": "転", "type": "component", "position": "left", "weight": 1 },
    { "from": "軍", "to": "運", "type": "component", "position": "bottom", "weight": 1 },
    { "from": "軍", "to": "揮", "type": "component", "position": "right", "weight": 1 }
  ]
}
```

### 3.1. Hướng của cạnh — RẤT QUAN TRỌNG

`component` đọc là: **`from` là bộ phận của `to`** (from ⊂ to).

```text
車 ──component──▶ 軍     nghĩa là: 軍 chứa 車
車 ──component──▶ 転     nghĩa là: 転 chứa 車
```

Vì vậy khi center = 車, graph hiển thị các Hán tự **chứa 車** (軍, 転, 軸, 軽...).
Chế độ **Đảo ngược** sẽ đi ngược cạnh: hiển thị các bộ phận **cấu thành 車**.

### 3.2. Bảng field cạnh

| Field | Bắt buộc | Kiểu | Ghi chú |
|-------|:--------:|------|---------|
| `from` | ✓ | string (1 ký tự) | Bộ phận / gốc. Phải tồn tại trong `kanji.json`. |
| `to` | ✓ | string (1 ký tự) | Hán tự chứa bộ phận. Phải tồn tại trong `kanji.json`. |
| `type` | ✓ | enum | Xem 3.3. |
| `position` | – | enum | Vị trí của `from` trong `to`. |
| `weight` | – | number 0–1 | Độ mạnh quan hệ, dùng để ưu tiên layout / độ đậm nét. |
| `note` | – | string | Ghi chú tự do. |

### 3.3. Các loại quan hệ

| `type` | Ý nghĩa | Màu nét gợi ý |
|--------|---------|---------------|
| `component` | `from` là thành phần cấu tạo `to` | xanh nhạt |
| `radical` | `from` là bộ thủ của `to` | xanh đậm |
| `phonetic` | `from` là thành phần biểu âm của `to` | tím |
| `semantic` | Liên quan ngữ nghĩa | vàng |
| `variant` | Biến thể / dạng khác của nhau | xám |
| `similar` | Hình dạng gần giống | xám nét đứt |

> Không phải cứ chung bộ là chung nghĩa. Luôn hiển thị nhãn loại quan hệ cho
> người dùng (mục #5 idea.md).

---

## 4. Cách sinh dữ liệu (build-time, không phải runtime)

```text
Unihan / KanjiVG / KANJIDIC
        │
        ▼
script build-data.js  (Node, chạy 1 lần)
        │
        ├── kiểm tra mọi literal là 1 ký tự & unique
        ├── kiểm tra mọi from/to trong edges tồn tại trong kanji.json
        ├── sinh edges[type=component] từ kanji.components[]
        ├── sắp xếp edges theo from
        └── ghi kanji.json + relations.json
```

Script này chạy **offline 1 lần**, không đưa vào server runtime.

---

## 5. Ràng buộc toàn cục (validator sẽ kiểm)

1. Mỗi key trong `kanji.json` dài đúng 1 ký tự và trùng `literal`.
2. `jlpt` chỉ thuộc `N5..N1`.
3. Mọi `edges[].from` và `edges[].to` đều tồn tại trong `kanji.json`.
4. Không có cạnh trùng `(from, to, type)`.
5. Tổng số node = 2136 (nếu là full Jōyō).
6. Graph phải được duyệt có `visited` để chống cycle (xem `idea.md` #29).

---

## 6. File schema máy đọc

- [`kanji.schema.json`](./kanji.schema.json) — JSON Schema cho `kanji.json`.
- [`relations.schema.json`](./relations.schema.json) — JSON Schema cho `relations.json`.

Validate nhanh (nếu cài `ajv-cli`):

```bash
npx ajv-cli validate -s idea/kanji.schema.json -d public/data/kanji.json
npx ajv-cli validate -s idea/relations.schema.json -d public/data/relations.json
```

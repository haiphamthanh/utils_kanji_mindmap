Đúng hướng nhất với bài toán này là **không làm một graph database hay framework frontend phức tạp**, mà xây một **Kanji Relationship Map** bằng **SVG + Vanilla JavaScript + JSON + Express**.

Với 2.136 Hán tự, SVG rất phù hợp vì bạn cần **node, đường nối, text, zoom, pan và animation**. Canvas sẽ khó xử lý interaction với từng Kanji hơn.

---

# 1. Hình dung sản phẩm

Trang chính có thể hoạt động như sau:

```text
┌──────────────────────────────────────────────────────────────┐
│  漢字 MAP                                      ☾             │
│                                                              │
│  ┌─────────────────────────────┐                             │
│  │ 🔍 車                         │  [Tạo sơ đồ]               │
│  └─────────────────────────────┘                             │
│                                                              │
│  [N5 ✓] [N4 ✓] [N3 ✓] [N2 ✓] [N1 ✓]    [−] ━━━ [＋]        │
│                                                              │
│                    転   軸   軽   較   載   輩   輪   輸       │
│                     ╲   ╲   ╲   │   │   ╱   ╱              │
│                       ╲   ╲   ╲ │ ╱   ╱                    │
│                            ┌───────┐                         │
│                            │  車   │                         │
│                            └───────┘                         │
│                       ╱      │       ╲                       │
│                     連      斬        軍     軌   軒   軟      │
│                             │        │                       │
│                            暫        揮 輝 運                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Nhưng tôi đề xuất cải tiến UX hơn hình mẫu:

**Click vào bất kỳ Kanji nào → Kanji đó trở thành trung tâm → sơ đồ chuyển cảnh sang Kanji mới.**

Ví dụ:

```text
車
 ↓ click
軍
 ↓ click
運
 ↓ click
...
```

Như vậy người dùng có cảm giác **khám phá một mạng lưới Kanji**, thay vì chỉ xem một sơ đồ tĩnh.

---

# 2. Kiến trúc tổng thể

Giữ cực kỳ đơn giản:

```text
Browser
   │
   ├── HTML
   ├── CSS
   ├── JavaScript
   └── SVG
        │
        ↓
      JSON
        │
        ↓
     Express
```

Không cần:

* React
* Vue
* Angular
* Redux
* TypeScript
* Graph database
* PostgreSQL
* D3.js
* Tailwind

Ở giai đoạn đầu **Vanilla JS + SVG là đủ**.

---

# 3. Cấu trúc project

Tôi đề xuất:

```text
kanji-map/
│
├── package.json
├── server.js
│
├── public/
│   │
│   ├── index.html
│   │
│   ├── css/
│   │   ├── reset.css
│   │   ├── variables.css
│   │   ├── layout.css
│   │   ├── components.css
│   │   └── graph.css
│   │
│   ├── js/
│   │   ├── app.js
│   │   ├── graph.js
│   │   ├── layout.js
│   │   ├── animation.js
│   │   ├── interaction.js
│   │   └── data.js
│   │
│   └── data/
│       ├── kanji.json
│       ├── relations.json
│       └── components.json
│
└── README.md
```

Tuy nhiên nếu muốn **còn đơn giản hơn**, có thể gộp CSS/JS:

```text
kanji-map/
├── server.js
├── package.json
│
└── public/
    ├── index.html
    ├── style.css
    ├── app.js
    │
    └── data/
        ├── kanji.json
        └── relations.json
```

Tôi nghiêng về phương án thứ hai cho project cá nhân của bạn.

---

# 4. Quan trọng nhất: thiết kế dữ liệu

Đây mới là phần quyết định chất lượng của website.

Không nên lưu graph dưới dạng:

```json
{
  "車": ["転", "軸", "軽", "較"]
}
```

vì sau này rất khó mở rộng.

Nên tách:

## `kanji.json`

```json
{
  "車": {
    "literal": "車",
    "meaning_vi": ["xe", "xe cộ"],
    "on": ["シャ"],
    "kun": ["くるま"],
    "jlpt": "N5",
    "stroke_count": 7
  },

  "転": {
    "literal": "転",
    "meaning_vi": ["chuyển", "quay"],
    "on": ["テン"],
    "kun": ["ころ"],
    "jlpt": "N4",
    "stroke_count": 11
  }
}
```

---

# 5. Quan hệ giữa Kanji

Đây là phần cần thiết kế kỹ.

Ví dụ:

```json
{
  "車": {
    "parents": [],
    "children": [
      "転",
      "軸",
      "軽",
      "較",
      "載",
      "輩",
      "輪",
      "輸",
      "轟",
      "陣",
      "連",
      "斬",
      "庫",
      "軍",
      "撃",
      "範",
      "繋",
      "軌",
      "軒",
      "軟"
    ]
  }
}
```

Nhưng tốt hơn nữa là relation có loại:

```json
{
  "from": "車",
  "to": "軍",
  "type": "component"
}
```

hoặc:

```json
{
  "from": "軍",
  "to": "運",
  "type": "component"
}
```

Sau này bạn có thể có:

```text
component
semantic
phonetic
derived
radical
similar
```

Ví dụ:

```json
[
  {
    "from": "車",
    "to": "軍",
    "type": "component"
  },
  {
    "from": "軍",
    "to": "運",
    "type": "component"
  }
]
```

Điều này rất quan trọng vì **không phải cứ hai Kanji có cùng bộ là chúng có quan hệ ngữ nghĩa trực tiếp**.

Website nên hiển thị:

> Quan hệ: Component

thay vì khiến người học hiểu rằng mọi đường nối đều mang nghĩa "Kanji này tạo ra Kanji kia".

---

# 6. Mô hình graph

Tôi đề xuất graph 3 tầng.

Ví dụ chọn:

```text
              転
              │
       軸 ─── 車 ─── 軽
              │
              軍
           ╱  │  ╲
         揮   輝   運
```

Ta gọi:

```text
Level 0
    車

Level 1
    転 軸 軽 軍 ...

Level 2
    揮 輝 運
```

Trong code:

```javascript
const graph = buildGraph("車", {
    depth: 2
});
```

---

# 7. Không nên hiển thị toàn bộ 2.136 Kanji

Đây là một điểm UX rất quan trọng.

Nếu người dùng chọn một Kanji:

```text
車
```

không nên render toàn bộ graph 2.136 node.

Thay vào đó:

```text
selected node
      ↓
depth 1
      ↓
depth 2
```

Ví dụ:

```text
              転
          軸   車   軽
              軍
           /  |  \
          揮  輝  運
```

Khoảng:

```text
10–20 node
```

là đẹp.

Có thể cho user chọn:

```text
Depth

○ 1
● 2
○ 3
```

---

# 8. Layout nên dùng SVG

Tôi **không khuyến nghị HTML div + CSS để vẽ đường nối**.

Nên:

```html
<svg id="kanjiGraph">
    <g id="graphViewport">

        <g id="edges">
        </g>

        <g id="nodes">
        </g>

    </g>
</svg>
```

Mỗi Kanji:

```html
<g class="kanji-node">
    <circle />
    <text>車</text>
</g>
```

Edge:

```html
<path class="edge"></path>
```

Điều này giúp:

* zoom
* pan
* animation
* click
* hover
* responsive
* đường cong đẹp

rất dễ.

---

# 9. Layout algorithm

Không cần force-directed graph.

Với kiểu sơ đồ giống hình của bạn, **hierarchical layout** đẹp hơn nhiều.

Ví dụ:

```text
              Level 2

        転   軸   軽   較   載
          \   \   |   /   /
                 車
          /   /   |   \   \
        連   斬   軍   軌   軟

                 軍
              /  |  \
             揮  輝  運
```

Algorithm đơn giản:

```javascript
function calculateLayout(center, nodes) {

    const centerX = width / 2;
    const centerY = height / 2;

    center.position = {
        x: centerX,
        y: centerY
    };

    layoutChildrenAbove(nodes);
    layoutChildrenBelow(nodes);

}
```

Không cần machine learning.

---

# 10. Cách chia node trên/dưới

Ví dụ:

```text
                    Level +1

       1     2     3     4     5     6

                     車

       7     8     9     10    11    12

                    Level +1
```

Có thể tự động:

```javascript
const maxPerRow = 6;

nodes.forEach((node, index) => {
    const row = Math.floor(index / maxPerRow);
    const column = index % maxPerRow;
});
```

Sau đó căn giữa:

```javascript
const totalWidth = count * spacing;

const startX =
    centerX - totalWidth / 2;
```

Kết quả rất ổn với 10–20 node.

---

# 11. Đường nối nên là Curve

Đừng dùng:

```svg
<line>
```

nên dùng:

```svg
<path>
```

Ví dụ:

```text
       転
        ╲
         ╲
          ╲
           車
```

hoặc:

```text
       転
        ╲
         ╲____
              ╲
               車
```

SVG:

```javascript
function createCurve(x1, y1, x2, y2) {

    const midY = (y1 + y2) / 2;

    return `
        M ${x1} ${y1}
        C ${x1} ${midY},
          ${x2} ${midY},
          ${x2} ${y2}
    `;
}
```

Đây sẽ tạo cảm giác giống sơ đồ trong ảnh nhưng mềm mại hơn.

---

# 12. Animation khi tạo graph

Đây là phần tôi nghĩ sẽ làm website của bạn khác biệt.

Khi click:

```text
[Tạo sơ đồ]
```

không render tất cả cùng lúc.

### Bước 1

Center xuất hiện:

```text
        ●
       車
```

Animation:

```text
scale: 0.5 → 1
opacity: 0 → 1
```

---

### Bước 2

Đường nối chạy ra:

```text
          ────────
        ╱
       ╱
      車
```

Dùng:

```css
.edge {
    stroke-dasharray: 1000;
    stroke-dashoffset: 1000;
}

.edge.visible {
    stroke-dashoffset: 0;
}
```

JS:

```javascript
requestAnimationFrame(() => {
    edge.classList.add("visible");
});
```

---

### Bước 3

Kanji xuất hiện lần lượt:

```text
         転
        ↓
       軸
        ↓
       車
```

Delay:

```javascript
node.style.animationDelay =
    `${index * 50}ms`;
```

Khoảng:

```text
40–70 ms
```

mỗi node là đẹp.

Không nên quá chậm.

---

# 13. Animation khi chuyển Kanji

Đây là animation quan trọng nhất.

User click:

```text
軍
```

thì không nên:

```text
clear();
render();
```

vì sẽ tạo cảm giác website reload.

Thay vào đó:

```text
             車
             ↓
        [user click]
             ↓

             車
              \
               \
                軍
```

Sau đó:

```text
old graph
   ↓
fade / move out
   ↓
new graph
   ↓
center = 軍
```

Có thể dùng:

```css
.graph-exit {
    opacity: 0;
    transform: scale(.95);
}

.graph-enter {
    opacity: 0;
    transform: scale(.95);
}

.graph-enter-active {
    opacity: 1;
    transform: scale(1);
}
```

Thời gian:

```text
180–250ms
```

Không nên 500–1000ms vì sẽ gây cảm giác chậm.

---

# 14. Hover Kanji

Khi mouse hover:

```text
      軍
      ↑
```

node:

```css
.kanji-node:hover circle {
    transform: scale(1.15);
}
```

và:

```text
         軍
       ┌────┐
       │ 軍 │
       └────┘
      軍隊
      ぐんたい
```

Có thể xuất hiện tooltip:

```text
軍

N3
ぐん

quân đội
```

Nhưng tooltip chỉ nên chứa thông tin nhanh.

---

# 15. Click Kanji

Click vào node:

```text
┌──────────────────────────┐
│ 軍                        │
│                          │
│ N3                       │
│ ぐん / グン               │
│ quân đội                 │
│                          │
│  軍隊                     │
│  軍人                     │
│                          │
│ [Xem sơ đồ]              │
└──────────────────────────┘
```

Tôi đề xuất **không mở popup ngay khi click**.

Click:

```text
→ chuyển graph
```

Double click hoặc nút nhỏ:

```text
→ mở detail
```

UX sẽ sạch hơn.

---

# 16. Search bar

Search phải hỗ trợ:

```text
車
```

nhưng cũng nên hỗ trợ:

```text
kuruma
くるま
xe
```

Ví dụ:

```text
🔍 Search Kanji
```

gõ:

```text
kur
```

hiện:

```text
車   くるま
来   くる
...
```

Nhưng giai đoạn MVP chỉ cần:

```text
Kanji
```

sau đó mới mở rộng.

---

# 17. JLPT filter

Giống hình:

```text
[N5] [N4] [N3] [N2] [N1]
```

Nhưng UX tôi đề xuất:

```text
Level

✓ N5
✓ N4
✓ N3
✓ N2
✓ N1
```

Khi bỏ:

```text
N5
```

thì các node N5:

```text
opacity: .15
```

hoặc **ẩn khỏi graph**.

Tôi thích:

> Ẩn node không phù hợp

hơn là làm mờ, vì graph sạch hơn.

---

# 18. Màu sắc

Không nên mỗi node một màu ngẫu nhiên.

Nên dùng màu theo JLPT:

```text
N5 → xanh lá
N4 → xanh dương
N3 → tím
N2 → vàng
N1 → đỏ
```

Giống hình bạn gửi.

Nhưng background nên nhẹ:

```text
#F5F9FD
```

Node center:

```text
N5 → green
N4 → blue
...
```

Điều này giúp người dùng **nhìn vào là biết level**.

---

# 19. Center node phải khác biệt

Ví dụ:

```text
              転

          軸        軽


              ┌─────┐
              │ 車  │
              └─────┘


       軍       連       軌
```

Center:

```text
80 × 80
```

Node bình thường:

```text
52 × 52
```

Center có:

```css
box-shadow
```

và animation nhẹ:

```text
pulse
```

nhưng **không nên pulse liên tục quá mạnh**.

---

# 20. Zoom và Pan

Đây là thứ SVG làm rất tốt.

Cấu trúc:

```html
<svg>

    <g id="viewport">

        <g id="graph">
            ...
        </g>

    </g>

</svg>
```

JS:

```javascript
let scale = 1;
let translateX = 0;
let translateY = 0;

function updateTransform() {

    viewport.setAttribute(
        "transform",
        `translate(${translateX} ${translateY})
         scale(${scale})`
    );
}
```

Mouse wheel:

```text
wheel up
   ↓
zoom in

wheel down
   ↓
zoom out
```

Buttons:

```text
−  ━━━━━●━━━━━  +
```

---

# 21. Pan bằng chuột

Cho phép:

```text
mousedown
    ↓
drag
    ↓
move graph
```

Giống Google Maps.

Nhưng có một quy tắc UX:

**click node không được bị nhầm thành drag.**

Bạn cần phân biệt:

```text
mousedown
mousemove < 5px
mouseup
```

→ click

Nếu:

```text
mousemove > 5px
```

→ drag

---

# 22. Mobile

Đừng chỉ thiết kế desktop.

Mobile:

```text
┌───────────────────┐
│ 漢字 MAP      ☰   │
│                   │
│ 🔍 車             │
│                   │
│ [N5][N4][N3]      │
│                   │
│        転         │
│         ╲         │
│          車       │
│         ╱ ╲       │
│       軍   軽     │
│                   │
│                   │
└───────────────────┘
```

Graph có thể:

```text
width: 100vw
height: calc(100vh - header)
```

và user pan/zoom.

---

# 23. Layout UI tôi đề xuất

Tách thành 3 vùng:

```text
┌───────────────────────────────────────────┐
│ HEADER                                    │
│ 漢字 MAP                                  │
├───────────────────────────────────────────┤
│ TOOLBAR                                   │
│ 🔍 車   [Tạo sơ đồ]   N5 N4 N3 N2 N1      │
├───────────────────────────────────────────┤
│                                           │
│                                           │
│               GRAPH                       │
│                                           │
│                                           │
│                                           │
│                                           │
├───────────────────────────────────────────┤
│ status / hint                             │
└───────────────────────────────────────────┘
```

Không nên có sidebar lớn.

Graph cần **tối đa diện tích màn hình**.

---

# 24. Toolbar nên sticky

```css
.toolbar {
    position: sticky;
    top: 0;
    z-index: 100;
}
```

Khi graph lớn:

```text
┌─────────────────────────────┐
│ 🔍 車       [N5][N4][N3]    │ ← luôn nhìn thấy
├─────────────────────────────┤
│                             │
│          GRAPH              │
│                             │
```

---

# 25. Nút "Đảo ngược"

Hình của bạn có:

```text
Đảo ngược
[ OFF ]
```

Tính năng này rất hay.

Ví dụ bình thường:

```text
      転
      │
      車
      │
      軍
```

Đảo ngược:

```text
      車
      │
      軍
      │
     揮輝運
```

Thực chất chỉ cần đổi:

```javascript
direction = "parent"
```

thành:

```javascript
direction = "children"
```

hoặc:

```javascript
direction = "reverse";
```

---

# 26. Tôi sẽ thiết kế data theo kiểu graph

Một cấu trúc khá tốt cho 2.136 Kanji:

```json
{
  "nodes": {
    "車": {
      "level": "N5",
      "meaning": ["xe"],
      "on": ["シャ"],
      "kun": ["くるま"]
    },

    "軍": {
      "level": "N3",
      "meaning": ["quân"],
      "on": ["グン"]
    }
  },

  "edges": [
    {
      "source": "車",
      "target": "軍",
      "type": "component"
    },

    {
      "source": "軍",
      "target": "運",
      "type": "component"
    }
  ]
}
```

Ưu điểm:

```text
2136 nodes
      +
~ vài nghìn edges
```

vẫn cực kỳ nhỏ đối với browser.

---

# 27. Render graph

Flow chính:

```text
User nhập 車
       ↓
Search
       ↓
findKanji("車")
       ↓
buildGraph("車", depth=2)
       ↓
calculateLayout()
       ↓
renderSVG()
       ↓
animate()
```

Pseudo-code:

```javascript
async function showKanji(kanji) {

    const graph = buildGraph(
        kanji,
        currentDepth
    );

    const layout =
        calculateLayout(graph);

    await animateExit();

    renderEdges(layout);

    renderNodes(layout);

    animateGraph();
}
```

Đây sẽ là core của toàn bộ application.

---

# 28. `buildGraph()` nên hoạt động thế nào?

Ví dụ:

```javascript
function buildGraph(root, depth = 2) {

    const result = {
        nodes: [],
        edges: []
    };

    const visited = new Set();

    traverse(root, 0);

    return result;


    function traverse(kanji, level) {

        if (level > depth) return;
        if (visited.has(kanji)) return;

        visited.add(kanji);

        result.nodes.push({
            kanji,
            level
        });

        const relations =
            getRelations(kanji);

        for (const relation of relations) {

            result.edges.push(relation);

            traverse(
                relation.target,
                level + 1
            );
        }
    }
}
```

Đây chính là phần biến database thành sơ đồ.

---

# 29. Một vấn đề rất quan trọng: vòng lặp

Graph Kanji chắc chắn có cycle.

Ví dụ:

```text
A → B
↑   ↓
D ← C
```

Nếu không xử lý:

```javascript
visited
```

thì traversal có thể chạy vô hạn.

Do đó bắt buộc:

```javascript
const visited = new Set();
```

---

# 30. Không nên để node chồng lên nhau

Với graph 2 tầng, bạn có thể dùng collision đơn giản.

Ví dụ:

```javascript
function resolveCollision(nodes) {

    for (let i = 0; i < nodes.length; i++) {

        for (let j = i + 1; j < nodes.length; j++) {

            const a = nodes[i];
            const b = nodes[j];

            if (distance(a, b) < MIN_DISTANCE) {

                b.x += 20;
                b.y += 20;
            }
        }
    }
}
```

Không cần force simulation.

---

# 31. Có thể thêm "Focus mode"

Một UX rất hay:

### Normal

```text
       転      軸

           車

       軍      軽
```

### Hover `軍`

```text
       転      軸

           車
            \
             軍
           ╱ │ ╲
          揮 輝 運
```

Các node không liên quan:

```text
opacity: .25
```

Các node liên quan:

```text
opacity: 1
```

Đường đi:

```text
車 → 軍 → 運
```

được highlight.

Điều này rất hữu ích khi graph bắt đầu lớn.

---

# 32. Breadcrumb

Khi khám phá:

```text
車
 ↓
軍
 ↓
運
```

nên có:

```text
History:

車 → 軍 → 運
```

Click:

```text
車
```

→ quay lại graph 車.

Có thể giới hạn:

```text
10 history
```

và lưu:

```javascript
localStorage
```

---

# 33. URL cũng nên thay đổi

Ví dụ:

```text
/kanji/車
```

hoặc:

```text
/?kanji=車
```

Tôi thích:

```text
/?kanji=車
```

vì Express không cần route phức tạp.

Khi click:

```javascript
history.pushState(
    {},
    "",
    `?kanji=${kanji}`
);
```

Sau đó reload trang vẫn mở:

```text
車
```

Đây là một UX nhỏ nhưng rất đáng làm.

---

# 34. Bookmark

Người dùng có thể copy:

```text
https://your-site.com/?kanji=車
```

gửi cho người khác.

Người nhận mở ra:

```text
車
```

ngay lập tức.

---

# 35. Phần Detail

Có thể thêm panel nhỏ bên phải:

```text
┌───────────────────────────┐
│ 車                        │
│                           │
│ くるま                    │
│ シャ                      │
│                           │
│ xe / phương tiện          │
│                           │
│ JLPT N5                   │
│ 7 nét                     │
│                           │
│ Thành phần                │
│ ─────────────             │
│ 車                        │
│                           │
│ Quan hệ                   │
│ 20 Kanji                  │
└───────────────────────────┘
```

Nhưng **panel chỉ xuất hiện khi user yêu cầu**.

Không nên chiếm màn hình ngay từ đầu.

---

# 36. Một UI rất hợp với project của bạn

Tôi hình dung màn hình như:

```text
┌─────────────────────────────────────────────────────────────┐
│  漢字 MAP                              [History] [Settings]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────┐                              │
│  │ 🔍 車                     │ [Tạo sơ đồ]                  │
│  └───────────────────────────┘                              │
│                                                             │
│  [✓ N5] [✓ N4] [✓ N3] [✓ N2] [✓ N1]    − ━━━━●━━ +       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                         転   軸   軽                         │
│                           ╲ │ ╱                             │
│                             車                              │
│                          ╱  │  ╲                            │
│                       連   軍   軌                          │
│                           ╱│╲                               │
│                         揮 輝 運                             │
│                                                             │
│                                                             │
│                                       [↻ Reset]             │
└─────────────────────────────────────────────────────────────┘
```

Rất sạch.

---

# 37. Animation guideline

Tôi đề xuất nguyên tắc:

### Micro animation

```text
100–150ms
```

hover, button.

### Node animation

```text
250–350ms
```

### Graph transition

```text
200–300ms
```

### Initial graph

```text
center
   ↓ 100ms
edges
   ↓ 50ms
nodes stagger
```

Tổng khoảng:

```text
500–800ms
```

là vừa.

Không nên làm animation kiểu:

```text
node bay vòng vòng
```

hoặc force graph tự chạy.

Đối với website học Kanji, animation phải **hỗ trợ nhận thức**, không được trở thành distraction.

---

# 38. Phần màu sắc

Có thể dùng CSS variables:

```css
:root {

    --bg: #f5f9fd;

    --text: #243447;

    --n5: #22b573;
    --n4: #2778d8;
    --n3: #7c4dcc;
    --n2: #e5a817;
    --n1: #d94b4b;

    --edge: #8bb8e8;

    --node-size: 54px;
    --center-size: 78px;
}
```

Sau này đổi theme cực dễ.

---

# 39. Dark mode

Có thể thêm:

```text
☀ / 🌙
```

Dark:

```text
background: #111827
```

graph:

```text
edge: #4b6685
```

Node vẫn giữ màu JLPT.

Đây là feature nên làm sau MVP.

---

# 40. Express cực kỳ đơn giản

`server.js`:

```javascript
const express = require("express");
const path = require("path");

const app = express();

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

app.listen(3000, () => {
    console.log(
        "Kanji Map running at http://localhost:3000"
    );
});
```

Thế là đủ cho phiên bản đầu.

---

# 41. Có cần API không?

Ban đầu:

**Không cần.**

Browser:

```javascript
fetch("/data/kanji.json")
fetch("/data/relations.json")
```

là đủ.

Sau này nếu muốn:

```text
GET /api/kanji/車
GET /api/graph/車
```

mới thêm API.

Không nên xây backend trước khi cần.

---

# 42. Lộ trình implementation

Tôi sẽ chia thành **6 phase**.

## Phase 1 — Data

Mục tiêu:

```text
2136 Kanji
↓
kanji.json
↓
relations.json
```

Hoàn thành:

* 2.136 Kanji
* JLPT
* meaning
* readings
* stroke count
* relation

**Đây là phase quan trọng nhất.**

---

# 43. Phase 2 — Graph engine

Làm:

```text
buildGraph()
calculateLayout()
renderNodes()
renderEdges()
```

Chưa cần animation.

Kết quả:

```text
車
 ↓
graph
```

render đúng.

---

# 44. Phase 3 — Interaction

Thêm:

```text
search
click node
zoom
pan
JLPT filter
reverse
reset
```

Lúc này đã có thể dùng được.

---

# 45. Phase 4 — Animation

Thêm:

```text
node entrance
edge drawing
hover
graph transition
highlight path
```

Đây là phase làm website "đẹp".

---

# 46. Phase 5 — UX

Thêm:

```text
URL state
history
keyboard shortcut
mobile
dark mode
tooltip
detail panel
```

Keyboard:

```text
/
```

→ focus search.

```text
Esc
```

→ đóng panel.

```text
+ -
```

→ zoom.

```text
R
```

→ reset.

---

# 47. Phase 6 — Learning features

Đây mới là phần rất thú vị đối với mục tiêu học Kanji của bạn.

Có thể thêm:

```text
☐ Hide meaning
☐ Hide reading
☐ Quiz
☐ Random Kanji
☐ Mark as learned
```

Ví dụ:

```text
                 車

             JLPT N5

             [Hiện nghĩa]

        ┌─────────────────┐
        │ くるま           │
        │ シャ             │
        └─────────────────┘
```

Sau đó:

```text
[Đã nhớ]
[Chưa nhớ]
```

Lưu bằng:

```javascript
localStorage
```

Không cần database.

---

# 48. Có thể biến graph thành hệ thống học

Đây là hướng tôi nghĩ rất phù hợp với project Kanji của bạn.

Ví dụ:

```text
車
│
├── 軍
│    ├── 揮
│    ├── 輝
│    └── 運
│
├── 転
├── 軸
├── 軽
└── 輪
```

User học:

```text
車
 ↓
軍
 ↓
運
```

thì website tự tạo:

```text
Learning path

車 → 軍 → 運
```

Sau này có thể:

```text
Learned: 438 / 2136
```

và graph:

```text
✓ 車
✓ 軍
○ 運
○ 揮
```

Đây sẽ biến nó từ một **Kanji graph viewer** thành một **Kanji learning system**.

---

# 49. Một điểm tôi đặc biệt khuyến nghị

Với dữ liệu 2.136 Kanji, **đừng để JavaScript tự suy luận quan hệ Kanji bằng cách nhìn vào hình dạng Unicode**.

Ví dụ:

```text
車
軍
運
```

không nên:

```javascript
if (kanji.includes("車")) {
   ...
}
```

Quan hệ phải nằm trong dataset:

```text
Kanji data
        +
Relation data
        ↓
Graph engine
```

Tức là:

```text
DATA
 ↓
GRAPH
 ↓
UI
```

không phải:

```text
UI
 ↓
tự đoán DATA
```

Điều này sẽ giúp hệ thống của bạn kiểm soát được độ chính xác.

---

# 50. Kiến trúc cuối cùng tôi đề xuất

```text
                    ┌──────────────┐
                    │  2136 KANJI  │
                    └──────┬───────┘
                           │
                  ┌────────▼────────┐
                  │    JSON DATA    │
                  │                 │
                  │ kanji.json      │
                  │ relations.json  │
                  └────────┬────────┘
                           │
                           ▼
                 ┌──────────────────┐
                 │   GRAPH ENGINE   │
                 │                  │
                 │ buildGraph()     │
                 │ traverse()       │
                 │ calculateLayout()│
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │    SVG ENGINE    │
                 │                  │
                 │ Nodes            │
                 │ Edges            │
                 │ Curves           │
                 │ Zoom             │
                 │ Pan              │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │   INTERACTION    │
                 │                  │
                 │ Search           │
                 │ Click            │
                 │ Hover            │
                 │ Filter           │
                 │ Reverse          │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │   ANIMATION      │
                 │                  │
                 │ Enter            │
                 │ Exit             │
                 │ Transition       │
                 │ Highlight        │
                 └──────────────────┘
```

## Thứ tự tôi khuyên bạn implement

```text
01. Chuẩn hóa 2136 Kanji
        ↓
02. Chuẩn hóa relation
        ↓
03. Tạo JSON
        ↓
04. SVG renderer
        ↓
05. Layout algorithm
        ↓
06. Search
        ↓
07. Click → đổi center
        ↓
08. Zoom + Pan
        ↓
09. JLPT filter
        ↓
10. Reverse
        ↓
11. Animation
        ↓
12. Tooltip / Detail
        ↓
13. History + URL
        ↓
14. Learning progress
```

**Đừng làm animation trước graph engine.** Với project này, thứ tự quan trọng nhất là:

> **Data → Graph → Layout → Interaction → Animation → Learning**

Nếu graph/data model tốt thì toàn bộ 2.136 Kanji sau này chỉ là **data**, không phải sửa code.

### MVP tôi sẽ nhắm tới

Chỉ cần đạt 7 thứ này trước:

```text
✓ Search Kanji
✓ 2136 Kanji
✓ Hiển thị quan hệ
✓ Graph 2 tầng
✓ Click node để chuyển center
✓ Zoom / Pan
✓ JLPT filter
```

Sau đó mới làm:

```text
✨ animation
✨ history
✨ detail
✨ learning progress
```

Đây là cách giữ project đúng tinh thần **HTML + CSS + JavaScript + Express đơn giản**, nhưng vẫn đủ nền tảng để sau này phát triển thành một hệ thống học **2.136 Jōyō Kanji** khá mạnh.

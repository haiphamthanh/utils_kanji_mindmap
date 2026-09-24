#!/usr/bin/env python3
# scripts/generate-kanji-list.py
# Sinh data/kanji-list.json cho đủ 2.136 Jōyō kanji.
#
# Trường xuất ra: id, character, character_name_vi, meanings_vi, components, biggest_component.
#
# Nguồn dữ liệu (tải về cache, mặc định .cache/):
#   - KANJIDIC2 (EDRDG)                -> danh sách 2.136 Jōyō + bộ thủ chính (classical radical)
#   - KanjiDictVN (KANJIDIC_vietnamese)-> Hán Việt + nghĩa tiếng Việt cho chữ thiếu
#   - KanjiVG                          -> cây phân rã thành phần (kèm thuộc tính original để chuẩn hóa)
#   - Unihan                           -> số nét (kTotalStrokes) để chọn biggest_component
#   - CJKRadicals.txt (Unicode)        -> 214 bộ Kangxi gốc (chuẩn hóa dạng bộ)
#
# Thuật toán components: đi theo cây KanjiVG, chuẩn hóa theo thuộc tính `original`
#   (氵->水, 艹->艸, 亻->人, ...). Một thành phần dừng lại nếu là bộ Kangxi.
#   Thành phần không phải bộ (吾, 寺, 化, 交...) được bóc thêm 1 tầng nữa
#   -> ví dụ 語 = 言,五,口;  時 = 日,土,寸.

import argparse
import io
import json
import os
import re
import sys
import urllib.request
import zipfile
import xml.etree.ElementTree as ET

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "data", "kanji-list.json")

URLS = {
    "kanjidic2.xml.gz": "http://www.edrdg.org/kanjidic/kanjidic2.xml.gz",
    "kdv.zip": "https://github.com/trungnt2910/KanjiDictVN/releases/download/"
               "trungnt2910.hannom.20251225-154650.kanjidic2.2025-345/KANJIDIC_vietnamese.zip",
    "kanjivg.xml.gz": "https://github.com/KanjiVG/kanjivg/releases/download/"
                      "r20250816/kanjivg-20250816.xml.gz",
    "Unihan.zip": "https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip",
    "CJKRadicals.txt": "https://www.unicode.org/Public/17.0.0/ucd/CJKRadicals.txt",
}

# Chuẩn hóa các dạng bộ/viết tắt không nằm trong bảng tự động.
MANUAL_NORM = {
    "氵": "水", "亻": "人", "扌": "手", "忄": "心", "刂": "刀", "犭": "犬",
    "礻": "示", "衤": "衣", "灬": "火", "罒": "网", "辶": "辵", "𧘇": "衣",
    "爫": "爪", "⺤": "爪", "㔾": "卩", "丷": "八", "丬": "爿", "龵": "手",
    "龰": "止", "⺌": "小", "⺊": "卜", "⺆": "冂", "⺄": "乙", "⺈": "刀",
    "彑": "彐", "戸": "戶", "母": "毋", "乡": "彡", "巳": "己", "マ": "龴",
    "つ": "小",
    # Biến thể bộ trong khối CJK Radicals Supplement mà KanjiVG dùng.
    "⺨": "犬", "⻖": "阜", "⻏": "邑", "⺍": "小", "⺗": "心", "⻌": "辵",
    "⺷": "羊", "⺕": "彐", "⻞": "食", "⺤": "爪",
}

# Nghĩa tiếng Việt bổ sung cho các chữ KANJIDIC/KanjiDictVN không có nghĩa.
FALLBACK_MEANINGS = {
    "戦": ["chiến tranh", "trận chiến", "đánh nhau"],
    "栃": ["cây tochi (họ hoa hồng)"],
    "縄": ["dây thừng", "dây"],
    "匂": ["mùi hương", "tỏa mùi"],
    "喩": ["ví von", "tỉ dụ"],
    "壌": ["đất", "thổ nhưỡng"],
    "弐": ["hai (dạng viết khác của 二)"],
    "戯": ["đùa", "vui chơi", "trò diễn"],
    "挿": ["cắm", "chèn", "đút vào"],
    "捗": ["tiến triển", "xúc tiến"],
    "曽": ["đã từng", "trước đây"],
    "枠": ["khung", "giới hạn"],
    "桟": ["bệ gỗ", "giàn gỗ", "cầu tàu"],
    "痩": ["gầy", "ốm"],
    "粛": ["nghiêm túc", "chỉnh tề", "yên lặng"],
    "舗": ["cửa hàng", "hiệu", "sửa sang"],
    "醸": ["ủ", "lên men", "gây ra"],
    "𠮟": ["quát", "mắng", "rầy"],
}


def download(url, dest):
    if os.path.exists(dest):
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print(f"[download] {url}")
    urllib.request.urlretrieve(url, dest)
    return dest


def cache_paths(cache):
    p = {}
    for name in URLS:
        p[name] = os.path.join(cache, name)
    return p


def ensure_sources(cache):
    paths = cache_paths(cache)
    for name, url in URLS.items():
        download(url, paths[name])

    files = {}
    # kanjidic2.xml
    kd = os.path.join(cache, "kanjidic2.xml")
    if not os.path.exists(kd):
        import gzip
        with gzip.open(paths["kanjidic2.xml.gz"], "rb") as f, open(kd, "wb") as o:
            o.write(f.read())
    files["kanjidic2"] = kd

    # kanjivg.xml
    kv = os.path.join(cache, "kanjivg.xml")
    if not os.path.exists(kv):
        import gzip
        with gzip.open(paths["kanjivg.xml.gz"], "rb") as f, open(kv, "wb") as o:
            o.write(f.read())
    files["kanjivg"] = kv

    # kdv banks
    kdv_dir = os.path.join(cache, "kdv")
    if not os.path.exists(os.path.join(kdv_dir, "kanji_bank_1.json")):
        with zipfile.ZipFile(paths["kdv.zip"]) as z:
            z.extractall(kdv_dir)
    files["kdv_dir"] = kdv_dir

    # unihan
    unihan_dir = os.path.join(cache, "unihan")
    if not os.path.exists(os.path.join(unihan_dir, "Unihan_IRGSources.txt")):
        with zipfile.ZipFile(paths["Unihan.zip"]) as z:
            z.extractall(unihan_dir)
    files["unihan"] = os.path.join(unihan_dir, "Unihan_IRGSources.txt")

    files["cjkradicals"] = paths["CJKRadicals.txt"]
    return files


def cv(hexstr):
    return chr(int(hexstr, 16)) if hexstr else None


def load_radicals(path):
    """Trả về: danh sách 214 bộ gốc (unified) + bảng chuẩn hóa từ CJKRadicals."""
    canon = {}
    norm = {}
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        num, rad, uni = [x.strip() for x in line.split(";")]
        base = num.rstrip("'")
        r, u = cv(rad), cv(uni)
        if "'" not in num:
            canon[base] = u
        c = canon.get(base)
        if r and c:
            norm.setdefault(r, c)
        if u and c and u != c:
            norm.setdefault(u, c)
    return canon, norm


def load_strokes(path):
    strokes = {}
    for line in open(path, encoding="utf-8"):
        if line.startswith("#") or "kTotalStrokes" not in line:
            continue
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 3:
            continue
        ch = chr(int(parts[0][2:], 16))
        val = parts[2].split(" ")[0]
        if ch not in strokes and val.isdigit():
            strokes[ch] = int(val)
    return strokes


def build_kanjivg(path):
    def local(tag):
        return tag.split("}", 1)[1] if "}" in tag else tag

    trees = {}
    variant = {}
    stack = []
    root_nodes = []

    def count_strokes(el):
        return sum(1 for d in el.iter() if local(d.tag) == "path")

    for event, elem in ET.iterparse(path, events=("start", "end")):
        tag = local(elem.tag)
        if event == "start" and tag == "kanji":
            stack.clear()
            root_nodes.clear()
        elif event == "start" and tag == "g":
            attrs = {local(k): v for k, v in elem.attrib.items()}
            node = {
                "element": attrs.get("element"),
                "original": attrs.get("original"),
                "strokes": count_strokes(elem),
                "children": [],
            }
            stack.append(node)
            el, orig = attrs.get("element"), attrs.get("original")
            if el and orig and el != orig:
                variant.setdefault(el, set()).add(orig)
        elif event == "end" and tag == "g":
            node = stack.pop()
            if stack:
                stack[-1]["children"].append(node)
            else:
                root_nodes.append(node)
        elif event == "end" and tag == "kanji":
            if root_nodes and root_nodes[0]["element"] and root_nodes[0]["element"] not in trees:
                trees[root_nodes[0]["element"]] = root_nodes[0]
            elem.clear()
    return trees, {k: sorted(v) for k, v in variant.items()}


def load_joyo(path):
    """Trả về list (char, grade, radical_number) cho grade 1..8 = Jōyō."""
    root = ET.parse(path).getroot()
    out = []
    for ch in root.findall("character"):
        grade = ch.findtext("misc/grade")
        if not (grade and grade.isdigit() and 1 <= int(grade) <= 8):
            continue
        lit = ch.findtext("literal")
        rnum = ch.findtext("radical/rad_value[@rad_type='classical']")
        out.append((lit, int(grade), int(rnum) if rnum else None))
    return out


def load_kdv(path_dir):
    bank = []
    for name in ("kanji_bank_1.json", "kanji_bank_2.json"):
        p = os.path.join(path_dir, name)
        if os.path.exists(p):
            bank += json.load(open(p, encoding="utf-8"))
    data = {}
    for e in bank:
        if not e:
            continue
        char, han, _on, _kun, meanings, misc = (list(e) + [None] * 6)[:6]
        data[char] = {
            "han_viet": (han or "").strip(),
            "meanings": [m for m in (meanings or []) if isinstance(m, str)],
            "strokes": int(misc["Strokes"]) if misc and str(misc.get("Strokes", "")).isdigit() else None,
        }
    return data


def title_vi(s):
    return " ".join(w[:1].upper() + w[1:] for w in s.split()) if s else s


def clean_meanings(meanings):
    out = []
    for m in meanings:
        m = re.sub(r"^\[[^\]]*\]\s*", "", m).strip()
        if m and m not in out:
            out.append(m)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join(ROOT, ".cache"))
    ap.add_argument("--limit", type=int, default=0, help="chỉ sinh N chữ đầu (debug)")
    args = ap.parse_args()

    src = ensure_sources(args.cache)

    canon, norm_rad = load_radicals(src["cjkradicals"])
    RAD = set(v for v in canon.values() if v)
    NORM = dict(MANUAL_NORM)
    for k, v in norm_rad.items():
        NORM.setdefault(k, v)

    strokes = load_strokes(src["unihan"])
    trees, variant = build_kanjivg(src["kanjivg"])

    # Chuẩn hóa tự động từ KanjiVG: chỉ áp dụng nếu dạng đó KHÔNG bao giờ dùng như chính nó.
    self_used = set()
    for t in trees.values():
        st = [t]
        while st:
            n = st.pop()
            if not n.get("original"):
                self_used.add(n.get("element"))
            st.extend(n["children"])
    for k, vs in variant.items():
        if len(vs) == 1 and k not in self_used:
            NORM.setdefault(k, vs[0])

    def norm(c):
        return NORM.get(c, c)

    def node_strokes(node):
        return node.get("strokes") or 0

    def named_leaves(node):
        """Bỏ các node trung gian không tên (element=None / CDP-*), trả về tên gần nhất."""
        el = node.get("original") or node.get("element")
        if el and not el.startswith("CDP-"):
            return [norm(el)]
        out = []
        for ch in node["children"]:
            out += named_leaves(ch)
        return out

    def decompose(char):
        """Trả về (components, contained).

        - components: các bộ thành phần cuối cùng của chữ.
        - contained : các kanji trong list được tạo thành từ chính các bộ này
                      (nút trung gian như 軍, 寺, 化, 交 + các bộ là kanji).
        """
        if char in RAD:
            return [char], []
        t = trees.get(char)
        if not t:
            return None, []

        raw = []
        inter = []

        def add(x):
            if x:
                raw.append(x)

        def addi(x):
            if x and x != char and x in charset and x not in inter:
                inter.append(x)

        for n in t["children"]:
            name = n["original"] or n["element"]
            el = None if (not name or name.startswith("CDP-")) else norm(name)
            if el and (el in RAD or not n["children"]):
                add(el)
                addi(el)
            elif el is None:
                for x in named_leaves(n):
                    add(x)
                    addi(x)
            else:
                # node không phải bộ -> đây là 1 chữ ghép (vd 軍, 寺, 化, 交)
                addi(el)
                for m in n["children"]:
                    for x in named_leaves(m):
                        add(x)
                        addi(x)

        # KanjiVG chỉ gom 1 mảnh -> không đủ cơ sở tách, giữ nguyên chữ.
        if len(raw) <= 1:
            return [char], []

        out = []
        for x in raw:
            if x not in out:
                out.append(x)
        return (out or [char]), inter

    joyo = load_joyo(src["kanjidic2"])
    kdv = load_kdv(src["kdv_dir"])

    existing = {}
    old_path = os.path.join(ROOT, "data", "kanji-source.json")
    if os.path.exists(old_path):
        for c, v in json.load(open(old_path, encoding="utf-8"))["characters"].items():
            existing[c] = v

    charset = set(c for c, _, _ in joyo)
    decomp = {c: decompose(c) for c in charset}
    comps_of = {c: (decomp[c][0] or [c]) for c in charset}
    contains = {c: decomp[c][1] for c in charset}

    def sc(x):
        if x in strokes:
            return strokes[x]
        fe = existing.get(x)
        if fe and fe.get("radical_stroke_count"):
            return fe["radical_stroke_count"]
        if x in kdv and kdv[x]["strokes"]:
            return kdv[x]["strokes"]
        return 0

    records = []
    missing_strokes = []
    for i, (char, grade, rnum) in enumerate(sorted(joyo, key=lambda x: (x[1], ord(x[0])))):
        if args.limit and i >= args.limit:
            break

        old = existing.get(char)
        e = kdv.get(char)

        if old and old.get("han_viet"):
            name_vi = old["han_viet"]
        elif e and e["han_viet"]:
            name_vi = title_vi(e["han_viet"])
        else:
            name_vi = None

        if old and old.get("meanings_vi"):
            meanings = list(old["meanings_vi"])
        else:
            meanings = clean_meanings(e["meanings"]) if e else []
            if not meanings and e:
                meanings = list(e["meanings"])
        if not meanings and char in FALLBACK_MEANINGS:
            meanings = list(FALLBACK_MEANINGS[char])

        comps = comps_of[char]
        main_rad = canon.get(str(rnum)) if rnum else None

        # biggest_component = kanji lớn nhất (nhiều nét nhất) ghép được từ các bộ của chữ.
        cands = contains[char]
        if cands:
            best = max(cands, key=lambda x: (sc(x), len(comps_of.get(x, [])), 1 if x == main_rad else 0))
        else:
            # không ghép ra kanji nào -> lấy bộ lớn nhất (có thể ngoài list)
            best = max(comps, key=lambda x: (sc(x), 1 if x == main_rad else 0)) if comps else char
        if best is None or sc(best) == 0:
            missing_strokes.append((char, comps))

        records.append({
            "id": i + 1,
            "character": char,
            "character_name_vi": name_vi,
            "meanings_vi": meanings,
            "components": comps,
            "biggest_component": best,
        })

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(records, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    # Quan hệ "chứa" (chữ được ghép từ các bộ) để build-kanji-levels.py dùng lại.
    contains_path = os.path.join(args.cache, "kanji-contains.json")
    os.makedirs(args.cache, exist_ok=True)
    json.dump(contains, open(contains_path, "w", encoding="utf-8"), ensure_ascii=False)

    print(f"[generate] {len(records)} chữ -> {os.path.relpath(OUT, ROOT)}")
    if missing_strokes:
        print(f"[generate] {len(missing_strokes)} chữ có component thiếu số nét:")
        for c, comps in missing_strokes[:20]:
            print("   ", c, comps)


if __name__ == "__main__":
    main()

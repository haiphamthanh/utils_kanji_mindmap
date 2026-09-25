#!/usr/bin/env python3
# scripts/build-kanji-multi-name.py
# Liệt kê các kanji có character_name_vi gồm NHIỀU cách đọc + ĐỀ XUẤT chosen_name.
# Kết quả: data/kanji_multi_name.json
#
# Format mỗi entry:
#   { "id", "character", "character_name_vi", "readings": [...], "chosen_name": "..." }
#
# Nguồn âm chính:
#   - phienam.txt    : 1 âm Hán-Việt chuẩn / chữ  (ryanphung/chinese-hanviet-cognates)
#   - thieuchuu.txt  : Thiều Chửu Hán-Việt tự điển (âm chính đứng trước)
#   - kanji.json     : map shinjitai -> kyūjitai (new-village/joyo-kanji) để tra chữ Nhật
# Nếu âm nguồn khớp 1 reading trong KDV (bỏ qua vị trí dấu thanh) thì giữ đúng
# chính tả của KDV; nếu không thì dùng âm nguồn.

import json
import os
import unicodedata
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "data", "kanji-list.json")
OUT = os.path.join(ROOT, "data", "kanji_multi_name.json")
CACHE = os.path.join(ROOT, ".cache")

URLS = {
    "phienam.txt": "https://raw.githubusercontent.com/ryanphung/chinese-hanviet-cognates/master/inputs/phienam.txt",
    "thieuchuu.txt": "https://raw.githubusercontent.com/ryanphung/chinese-hanviet-cognates/master/inputs/thieuchuu.txt",
    "joyo-kanji.json": "https://raw.githubusercontent.com/new-village/joyo-kanji/main/joyokanji/config/kanji.json",
}


def ensure(name):
    dest = os.path.join(CACHE, name)
    if not os.path.exists(dest):
        os.makedirs(CACHE, exist_ok=True)
        print(f"[download] {URLS[name]}")
        urllib.request.urlretrieve(URLS[name], dest)
    return dest


def load_phienam(path):
    m = {}
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if "=" not in line:
            continue
        ch, r = line.split("=", 1)
        if len(ch) == 1 and ch not in m:
            m[ch] = r.strip()
    return m


def load_thieuchuu(path):
    m = {}
    for line in open(path, encoding="utf-8"):
        line = line.strip("\ufeff\n")
        if "=" not in line:
            continue
        ch, rest = line.split("=", 1)
        if len(ch) != 1:
            continue
        rest = rest.split("[")[0].strip()
        if rest and ch not in m:
            m[ch] = rest.split(",")[0].strip()
    return m


def load_shin_to_trad(path):
    trad_to_shin = json.load(open(path, encoding="utf-8"))
    rev = {}
    for trad, shin in trad_to_shin.items():
        rev.setdefault(shin, trad)
    return rev


def tone_key(s):
    """Bỏ vị trí dấu thanh: 'hóa' và 'hoá' cho cùng key."""
    base, marks = [], []
    for c in unicodedata.normalize("NFD", s.lower()):
        (marks if unicodedata.combining(c) else base).append(c)
    return "".join(base), tuple(sorted(marks))


def cap(s):
    return s[:1].upper() + s[1:] if s else s


def main():
    records = json.load(open(SRC, encoding="utf-8"))
    ph = load_phienam(ensure("phienam.txt"))
    th = load_thieuchuu(ensure("thieuchuu.txt"))
    shin2trad = load_shin_to_trad(ensure("joyo-kanji.json"))

    def source_reading(ch):
        trad = shin2trad.get(ch)
        for table in (ph, th):
            if ch in table:
                return table[ch]
            if trad and trad in table:
                return table[trad]
        return None

    out = []
    stats = {"matched": 0, "source_only": 0, "fallback": 0, "by_trad": 0}
    fallback_chars = []
    for r in records:
        name = r["character_name_vi"]
        # vài chữ kokuji có tên dạng ghi chú "Hatake (chữ Nhật, không có âm...)"
        readings = [name.split("(")[0].strip()] if "(" in name else name.split()
        if len(readings) <= 1:
            continue
        ch = r["character"]
        src = source_reading(ch)
        chosen = None
        if src:
            trad = shin2trad.get(ch)
            if trad and ch not in ph and ch not in th:
                stats["by_trad"] += 1
            key = tone_key(src)
            match = next((x for x in readings if tone_key(x) == key), None)
            if match:
                chosen = cap(match)
                stats["matched"] += 1
            else:
                chosen = cap(src)
                stats["source_only"] += 1
        else:
            chosen = cap(readings[0])
            stats["fallback"] += 1
            fallback_chars.append(ch)
        out.append({
            "id": r["id"],
            "character": ch,
            "character_name_vi": r["character_name_vi"],
            "readings": readings,
            "chosen_name": chosen,
        })

    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"[multi-name] {len(out)} chữ -> {os.path.relpath(OUT, ROOT)}")
    print(f"   khớp reading KDV: {stats['matched']} | chỉ có nguồn: {stats['source_only']} "
          f"| fallback reading đầu: {stats['fallback']} (qua kyūjitai: {stats['by_trad']})")
    print("   fallback:", "".join(fallback_chars))


if __name__ == "__main__":
    main()

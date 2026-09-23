#!/usr/bin/env python3
# scripts/build-kanji-levels.py
# Chia 2136 kanji thành 3 cấp độ dựa trên quan hệ "chứa trong chữ khác".
#
#   Bước 1: chữ KHÔNG xuất hiện trong components của bất kỳ chữ nào khác -> cấp 3
#   Bước 2: bỏ cấp 3, lặp lại với phần còn lại                          -> cấp 2
#   Bước 3: phần còn lại                                                -> cấp 1
#   Bước 4: thêm biggest_component_id (tra id của biggest_component) vào mỗi chữ.
#
# Kết quả: data/kanji_level3.json, data/kanji_level2.json, data/kanji_level1.json

import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "data", "kanji-list.json")
OUT = {
    3: os.path.join(ROOT, "data", "kanji_level3.json"),
    2: os.path.join(ROOT, "data", "kanji_level2.json"),
    1: os.path.join(ROOT, "data", "kanji_level1.json"),
}


def main():
    records = json.load(open(SRC, encoding="utf-8"))
    order = [r["character"] for r in records]
    charset = set(order)
    id_of = {r["character"]: r["id"] for r in records}
    contains = {r["character"]: [c for c in r["components"] if c in charset] for r in records}

    def not_contained(pool):
        """Chữ trong pool không xuất hiện trong components của chữ khác cùng pool."""
        used = set()
        for ch in pool:
            for c in contains[ch]:
                if c != ch:
                    used.add(c)
        return {ch for ch in pool if ch not in used}

    pool = set(order)
    level3 = not_contained(pool)
    pool -= level3
    level2 = not_contained(pool)
    pool -= level2
    level1 = pool

    levels = {3: level3, 2: level2, 1: level1}
    for lv, members in levels.items():
        out = []
        for r in records:
            if r["character"] not in members:
                continue
            entry = dict(r)
            bc = r["biggest_component"]
            if bc in id_of:
                entry["biggest_component_id"] = id_of[bc]
            out.append(entry)
        json.dump(out, open(OUT[lv], "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        missing = [e["character"] for e in out if "biggest_component_id" not in e]
        print(f"[level {lv}] {len(out):>4} chữ -> {os.path.relpath(OUT[lv], ROOT)} "
              f"(thiếu biggest_component_id: {len(missing)})")

    # Kiểm tra theo yêu cầu: level 3 và level 2 có chữ nào thiếu biggest_component_id?
    print()
    for lv in (3, 2):
        out = json.load(open(OUT[lv], encoding="utf-8"))
        missing = [e["character"] for e in out if "biggest_component_id" not in e]
        print(f"[check] level {lv}: {len(missing)} chữ thiếu biggest_component_id"
              + (": " + " ".join(missing) if missing else ""))


if __name__ == "__main__":
    main()

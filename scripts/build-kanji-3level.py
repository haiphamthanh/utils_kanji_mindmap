#!/usr/bin/env python3
# scripts/build-kanji-3level.py
# Sinh data/kanji_3level.json — object keyed đủ 2136 kanji, để tra cứu nhanh.
#
# Quy tắc:
#   - level 1: lồng phân cấp  level1 -> level2 -> level3
#   - level 2: level1 = TOÀN BỘ bộ thành phần (components) là level 1
#              level3 = các level 3 chứa nó
#   - level 3: level2 = các chữ ghép level 2 mà nó chứa,
#              mỗi level2 kèm TOÀN BỘ bộ thành phần (components) level 1
#
# Phụ thuộc: data/kanji-list.json, data/kanji_level{1,2,3}.json,
#            .cache/kanji-contains.json

import argparse
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC_LIST = os.path.join(ROOT, "data", "kanji-list.json")
OUT = os.path.join(ROOT, "data", "kanji_3level.json")


def ref(char, id_of):
    return {"character": char, "id": id_of[char]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join(ROOT, ".cache"))
    args = ap.parse_args()

    records = json.load(open(SRC_LIST, encoding="utf-8"))
    id_of = {r["character"]: r["id"] for r in records}
    components = {r["character"]: r["components"] for r in records}
    order = [r["character"] for r in records]

    level = {}
    for lv in (1, 2, 3):
        for e in json.load(open(os.path.join(ROOT, "data", f"kanji_level{lv}.json"), encoding="utf-8")):
            level[e["character"]] = lv

    contains_path = os.path.join(args.cache, "kanji-contains.json")
    if not os.path.exists(contains_path):
        raise SystemExit(f"Thiếu {contains_path} — chạy scripts/generate-kanji-list.py trước.")
    contains = json.load(open(contains_path, encoding="utf-8"))
    contains = {c: [y for y in contains.get(c, []) if y in level] for c in order}

    # reverse theo "contains" (chữ ghép trung gian) -> level 3 chứa level 2
    rev_contains = {c: [] for c in order}
    for c in order:
        for y in contains[c]:
            rev_contains[y].append(c)

    # reverse theo "components" -> level 2 chứa level 1
    rev_comp = {c: [] for c in order}
    for c in order:
        for y in components[c]:
            if y in rev_comp and c not in rev_comp[y]:
                rev_comp[y].append(c)

    def only(chars, lv):
        return [c for c in chars if level.get(c) == lv]

    out = {}
    for c in order:
        lv = level[c]
        entry = {"id": id_of[c], "character": c, "level": lv}
        if lv == 1:
            entry["level2"] = [
                {
                    **ref(x, id_of),
                    "level3": [ref(z, id_of) for z in only(rev_contains[x], 3)],
                }
                for x in only(rev_comp[c], 2)
            ]
        elif lv == 2:
            entry["level1"] = [ref(x, id_of) for x in only(components[c], 1)]
            entry["level3"] = [ref(x, id_of) for x in only(rev_contains[c], 3)]
        elif lv == 3:
            entry["level2"] = [
                {**ref(x, id_of), "level1": [ref(y, id_of) for y in only(components[x], 1)]}
                for x in only(contains[c], 2)
            ]
        out[c] = entry

    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    n1 = sum(1 for v in out.values() if v["level"] == 1)
    n2 = sum(1 for v in out.values() if v["level"] == 2)
    n3 = sum(1 for v in out.values() if v["level"] == 3)
    print(f"[3level] {len(out)} chữ (level1 {n1}, level2 {n2}, level3 {n3}) -> "
          f"{os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()

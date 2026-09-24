#!/usr/bin/env python3
# scripts/build-kanji-levels.py
# Chia 2136 kanji thành 3 cấp độ dựa trên quan hệ "chứa" (một chữ được ghép
# từ các bộ thành phần của chữ khác).
#
#   contains(X) = các kanji trong list được tạo thành từ chính các bộ của X
#                 (vd: contains(運) = [軍, 車] vì 運 = 辵 + 軍, 軍 = 冖 + 車)
#
#   Cấp 1 (đơn giản nhất): chữ KHÔNG chứa chữ nào khác
#   Cấp 2: bỏ cấp 1, chữ không chứa chữ nào còn lại
#   Cấp 3 (phức tạp nhất): phần còn lại (chứa cấp 2/1)  -> không xử lý tiếp
#
# Thêm biggest_component_id (id của biggest_component trong kanji-list.json).
# Kết quả: data/kanji_level3.json, data/kanji_level2.json, data/kanji_level1.json
#
# Yêu cầu: chạy `scripts/generate-kanji-list.py` trước (sinh .cache/kanji-contains.json).

import argparse
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
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join(ROOT, ".cache"))
    args = ap.parse_args()

    records = json.load(open(SRC, encoding="utf-8"))
    order = [r["character"] for r in records]
    charset = set(order)
    id_of = {r["character"]: r["id"] for r in records}

    contains_path = os.path.join(args.cache, "kanji-contains.json")
    if not os.path.exists(contains_path):
        raise SystemExit(
            f"Thiếu {contains_path} — hãy chạy scripts/generate-kanji-list.py trước."
        )
    contains = json.load(open(contains_path, encoding="utf-8"))
    contains = {c: [y for y in contains.get(c, []) if y in charset] for c in order}

    def not_contained(pool):
        return {c for c in pool if not (set(contains[c]) & pool)}

    # Cấp 1 = đơn giản nhất (không chứa chữ nào khác), cấp 3 = phức tạp nhất.
    pool = set(order)
    level1 = not_contained(pool)
    pool -= level1
    level2 = not_contained(pool)
    pool -= level2
    level3 = pool

    levels = {1: level1, 2: level2, 3: level3}
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

    print()
    for lv in (1, 2, 3):
        out = json.load(open(OUT[lv], encoding="utf-8"))
        missing = [e["character"] for e in out if "biggest_component_id" not in e]
        print(f"[check] level {lv}: {len(missing)} chữ thiếu biggest_component_id"
              + (": " + " ".join(missing) if missing else ""))


if __name__ == "__main__":
    main()

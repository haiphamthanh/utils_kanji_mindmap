#!/usr/bin/env python3
# scripts/build-final.py
# Sinh thư mục data/final/ cho ứng dụng:
#   - kanji.json : kanji-list.json + field `chosen_name`
#                  (1 âm -> lấy âm đó; nhiều âm -> lấy từ kanji_multi_name.json)
#   - level.json : bản sao kanji_3level.json (cây 3 cấp để tra cứu)
#
# Chạy sau: generate-kanji-list.py, build-kanji-levels.py, build-kanji-3level.py,
#           build-kanji-multi-name.py

import json
import os
import shutil

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FINAL = os.path.join(ROOT, "data", "final")
SRC_LIST = os.path.join(ROOT, "data", "kanji-list.json")
SRC_MULTI = os.path.join(ROOT, "data", "kanji_multi_name.json")
SRC_LEVEL = os.path.join(ROOT, "data", "kanji_3level.json")
OUT_KANJI = os.path.join(FINAL, "kanji.json")
OUT_LEVEL = os.path.join(FINAL, "level.json")


def main():
    records = json.load(open(SRC_LIST, encoding="utf-8"))
    multi = {}
    if os.path.exists(SRC_MULTI):
        for e in json.load(open(SRC_MULTI, encoding="utf-8")):
            multi[e["id"]] = e["chosen_name"]

    out = []
    for r in records:
        name = r["character_name_vi"]
        readings = [name.split("(")[0].strip()] if "(" in name else name.split()
        if len(readings) == 1:
            chosen = readings[0]
        else:
            chosen = multi.get(r["id"]) or readings[0]
        entry = {
            "id": r["id"],
            "character": r["character"],
            "character_name_vi": name,
            "chosen_name": chosen,
            "meanings_vi": r["meanings_vi"],
            "components": r["components"],
            "biggest_component": r["biggest_component"],
        }
        out.append(entry)

    os.makedirs(FINAL, exist_ok=True)
    json.dump(out, open(OUT_KANJI, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    shutil.copyfile(SRC_LEVEL, OUT_LEVEL)

    print(f"[final] {len(out)} chữ -> {os.path.relpath(OUT_KANJI, ROOT)}")
    print(f"[final] level -> {os.path.relpath(OUT_LEVEL, ROOT)}")
    miss = [e["character"] for e in out if not e["chosen_name"]]
    print(f"[final] thiếu chosen_name: {len(miss)}" + (" " + "".join(miss) if miss else ""))


if __name__ == "__main__":
    main()

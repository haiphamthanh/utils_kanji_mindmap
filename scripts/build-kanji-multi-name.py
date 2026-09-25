#!/usr/bin/env python3
# scripts/build-kanji-multi-name.py
# Liệt kê các kanji có character_name_vi gồm NHIỀU cách đọc, để chọn tên chính.
# Kết quả: data/kanji_multi_name.json
#
# Format mỗi entry:
#   { "id", "character", "character_name_vi", "readings": [...], "chosen_name": null }
#   - readings    : tách sẵn từ character_name_vi
#   - chosen_name : để trống, bạn điền tên chính muốn dùng

import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "data", "kanji-list.json")
OUT = os.path.join(ROOT, "data", "kanji_multi_name.json")


def main():
    records = json.load(open(SRC, encoding="utf-8"))
    out = []
    for r in records:
        readings = r["character_name_vi"].split()
        if len(readings) <= 1:
            continue
        out.append({
            "id": r["id"],
            "character": r["character"],
            "character_name_vi": r["character_name_vi"],
            "readings": readings,
            "chosen_name": None,
        })
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"[multi-name] {len(out)} chữ nhiều cách đọc -> {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()

#!/bin/bash
# Chạy Kanji Map bằng cách double-click (macOS).
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Chưa cài Node.js."
  echo "Tải bản LTS tại: https://nodejs.org"
  read -n 1 -s -r -p "Nhấn phím bất kỳ để đóng..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Đang cài thư viện lần đầu (chỉ 1 lần)..."
  npm install || {
    echo "Cài thư viện thất bại."
    read -n 1 -s -r -p "Nhấn phím bất kỳ để đóng..."
    exit 1
  }
fi

echo "Đang mở Kanji Map tại http://localhost:5188 ..."
KANJI_OPEN=1 npm start

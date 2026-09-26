#!/bin/bash
# Chạy Kanji Map (macOS/Linux): ./start.sh
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Chưa cài Node.js. Tải bản LTS tại: https://nodejs.org"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Đang cài thư viện lần đầu..."
  npm install || exit 1
fi

KANJI_OPEN=1 npm start

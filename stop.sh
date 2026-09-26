#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$ROOT_DIR/.server.pid"
PORT_FILE="$ROOT_DIR/.server.port"

if [[ ! -f "$PID_FILE" ]]; then
  echo "Kanji Mindmap is already stopped"
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  for _ in {1..5}; do kill -0 "$PID" 2>/dev/null || break; sleep 1; done
  kill -0 "$PID" 2>/dev/null && kill -9 "$PID"
fi
rm -f "$PID_FILE" "$PORT_FILE"
echo "Kanji Mindmap stopped"

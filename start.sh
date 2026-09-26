#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$ROOT_DIR/.server.pid"
PORT_FILE="$ROOT_DIR/.server.port"
LOG_FILE="$ROOT_DIR/.server.log"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-5188}"

cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but was not found in PATH"
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies..."
  npm install
fi

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Kanji Mindmap is already running (PID $(cat "$PID_FILE"))"
  exit 0
fi
rm -f "$PID_FILE"

if [[ -n "$(lsof -tiTCP:"$PORT" -sTCP:LISTEN || true)" ]]; then
  echo "Port $PORT is already in use"
  exit 1
fi

nohup env HOST="$HOST" PORT="$PORT" node server.js >"$LOG_FILE" 2>&1 &
PID=$!
echo "$PID" >"$PID_FILE"
echo "$PORT" >"$PORT_FILE"

for _ in {1..10}; do
  if curl -fsS "http://$HOST:$PORT/api/health" >/dev/null 2>&1; then
    echo "Kanji Mindmap started: http://$HOST:$PORT (PID $PID)"
    exit 0
  fi
  sleep 1
done

echo "Kanji Mindmap failed to start"
sed -n '1,40p' "$LOG_FILE"
rm -f "$PID_FILE" "$PORT_FILE"
exit 1

#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
port="${SIGNOVA_API_PORT:-8000}"

if curl --silent --fail "http://127.0.0.1:${port}/health" >/dev/null; then
  echo "Signova API is already running on port ${port}."
  exit 0
fi

nohup python -m uvicorn Signova_Frontend_DarkAI.app:app \
  --app-dir . \
  --host 0.0.0.0 \
  --port "${port}" \
  >/tmp/signova-api.log 2>&1 </dev/null &
echo $! >/tmp/signova-api.pid
echo "Started Signova API on port ${port}; check /tmp/signova-api.log if it does not become ready."

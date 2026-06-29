#!/usr/bin/env bash
# Deploy hook for the infra control plane.
# Invoked by infra's generic runner with cwd = deploy_path, code already at the
# pinned ref. Contract env: DEPLOY_REF, SERVICE_NAME, PORT.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3099}"
HEALTH="${HEALTH:-/health}"
MAX_WAIT="${MAX_WAIT:-90}"

cd "$REPO_DIR"

echo "[engram] Building API image..."
sudo docker compose build api

echo "[engram] Stopping current container..."
sudo docker compose stop api 2>/dev/null || true

echo "[engram] Starting new container on :$PORT..."
sudo docker compose up --no-deps -d api

echo "[engram] Waiting for health on :$PORT..."
ELAPSED=0
while [ "$ELAPSED" -lt "$MAX_WAIT" ]; do
  status=$(curl -o /dev/null -s -w "%{http_code}" --max-time 3 "http://localhost:${PORT}${HEALTH}" || echo "000")
  if [ "$status" = "200" ]; then
    echo "[engram] Healthy ✓ (port $PORT)"
    exit 0
  fi
  echo "[engram] Attempt $((ELAPSED/3 + 1)): HTTP $status, retrying..."
  sleep 3
  ELAPSED=$((ELAPSED + 3))
done

echo "[engram] Health check failed after ${MAX_WAIT}s" >&2
exit 1

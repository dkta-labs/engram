#!/usr/bin/env bash
# Deploy hook for the infra control plane.
# Invoked by infra's generic runner with cwd = deploy_path, code already at the
# pinned ref. Contract env: DEPLOY_REF, SERVICE_NAME, PORT.
#
# Engram is a hybrid service: a Dockerised Fastify API (port $PORT) plus a static
# Astro web frontend served by Caddy from $WEB_ROOT. This hook deploys both.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3099}"
HEALTH="${HEALTH:-/health}"
MAX_WAIT="${MAX_WAIT:-90}"
WEB_ROOT="${WEB_ROOT:-/opt/engram-web}"
cd "$REPO_DIR"

# 1. Build everything before mutating prod, so a build failure aborts cleanly.
echo "[engram] Installing deps..."
npm ci
echo "[engram] Building web (Astro)..."
npm run build --workspace=packages/web
echo "[engram] Building API image..."
sudo docker compose build api

# 2. Publish the static web to $WEB_ROOT (Caddy serves it).
echo "[engram] Publishing web to $WEB_ROOT..."
mkdir -p "$WEB_ROOT"
rm -rf "${WEB_ROOT:?}"/*
cp -r packages/web/dist/* "$WEB_ROOT"/
echo "[engram] Published $(find "$WEB_ROOT" -type f | wc -l) web files"

# 3. Roll the API container.
echo "[engram] Restarting API container on :$PORT..."
sudo docker compose stop api 2>/dev/null || true
sudo docker compose up --no-deps -d api

# 4. Gate on API health.
echo "[engram] Waiting for health on :$PORT$HEALTH..."
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

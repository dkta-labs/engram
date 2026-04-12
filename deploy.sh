#!/usr/bin/env bash
# Blue/green zero-downtime deploy for Engram API
# Usage: ./deploy.sh [--rollback]
# Called by GitHub Actions via SSH, or manually

set -euo pipefail

REPO_DIR="/home/hermes/engram"
COMPOSE_FILE="$REPO_DIR/docker-compose.yml"
HEALTH_ENDPOINT="/v1/health"
MAX_WAIT=60
CADDY_API="http://localhost:2019"

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
die() { echo "[ERROR] $*" >&2; exit 1; }

health_check() {
  local port=$1
  local url="http://127.0.0.1:${port}${HEALTH_ENDPOINT}"
  curl -sf --max-time 5 "$url" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('status')=='ok' else 1)" 2>/dev/null
}

# Discover the Caddy API path to the reverse_proxy upstreams dynamically.
# This avoids hardcoding deeply nested JSON paths that break when Caddyfile changes.
find_upstream_path() {
  python3 -c "
import json, urllib.request
config = json.loads(urllib.request.urlopen('$CADDY_API/config/').read())
def find(obj, path=''):
    if isinstance(obj, dict):
        if obj.get('handler') == 'reverse_proxy' and 'upstreams' in obj:
            print(path + '/upstreams')
            return True
        for k, v in obj.items():
            if find(v, path + '/' + k):
                return True
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            if find(v, path + '/' + str(i)):
                return True
    return False
find(config, '/config')
" 2>/dev/null
}

switch_caddy() {
  local new_port=$1
  local upstream_path
  upstream_path=$(find_upstream_path)
  if [[ -z "$upstream_path" ]]; then
    die "Could not find reverse_proxy upstream path in Caddy config"
  fi
  log "Switching Caddy upstream to port $new_port (path: $upstream_path)..."
  curl -sf -4 -X PATCH \
    "${CADDY_API}${upstream_path}" \
    -H "Content-Type: application/json" \
    -d "[{\"dial\": \"127.0.0.1:${new_port}\"}]" || die "Failed to switch Caddy upstream"
  log "Caddy now pointing to :$new_port"

  # Keep /etc/caddy/Caddyfile in sync so disk matches live config.
  # Without this, a caddy reload/restart would revert to the old port.
  if [[ -f /etc/caddy/Caddyfile ]]; then
    sudo sed -i "s|reverse_proxy 127\.0\.0\.1:[0-9]\+|reverse_proxy 127.0.0.1:${new_port}|g" /etc/caddy/Caddyfile
    log "Updated /etc/caddy/Caddyfile → reverse_proxy 127.0.0.1:${new_port}"
  fi
}

active_port() {
  local upstream_path
  upstream_path=$(find_upstream_path)
  if [[ -n "$upstream_path" ]]; then
    curl -sf -4 "${CADDY_API}${upstream_path}/0/dial" 2>/dev/null | tr -d '"' | cut -d: -f2 || echo "3000"
  else
    echo "3000"
  fi
}

rollback() {
  local active=$1
  local failed=$2
  log "Rolling back — keeping :$active, stopping :$failed"
  sudo docker rm -f "engram-api-${failed}" 2>/dev/null || true
  die "Deploy failed — rolled back to :$active"
}

# ── Sync infrastructure ───────────────────────────────────────────
sync_infra() {
  if [[ -f "$REPO_DIR/infra/Caddyfile" ]]; then
    if ! diff -q "$REPO_DIR/infra/Caddyfile" /etc/caddy/Caddyfile &>/dev/null; then
      log "Caddyfile changed — updating and reloading Caddy..."
      sudo cp "$REPO_DIR/infra/Caddyfile" /etc/caddy/Caddyfile
      sudo caddy reload --config /etc/caddy/Caddyfile 2>&1 | grep -v "^{" || true
      log "Caddy reloaded"
    fi
  fi
}

# ── Rollback mode ─────────────────────────────────────────────────
if [[ "${1:-}" == "--rollback" ]]; then
  CURR=$(active_port)
  if [[ "$CURR" == "3000" ]]; then
    PREV=3001; else PREV=3000
  fi
  log "Manual rollback: switching from :$CURR to :$PREV"
  health_check "$PREV" || die "Previous slot :$PREV is not healthy — cannot rollback"
  switch_caddy "$PREV"
  sudo docker stop "engram-api-${CURR}" 2>/dev/null || true
  log "Rollback complete"
  exit 0
fi

# ── Deploy ────────────────────────────────────────────────────────
log "=== Engram Deploy ==="

# 1. Pull latest code
log "Pulling latest code..."
cd "$REPO_DIR"
GH_CONFIG_DIR=/home/hermes/.hermes/gh-config git fetch origin main
GH_CONFIG_DIR=/home/hermes/.hermes/gh-config git reset --hard origin/main

# 2. Sync infrastructure (Caddyfile)
sync_infra

# 3. Determine slots
CURR_PORT=$(active_port)
if [[ "$CURR_PORT" == "3000" ]]; then
  NEW_PORT=3001
  NEW_SLOT="green"
  CURR_SLOT="blue"
else
  NEW_PORT=3000
  NEW_SLOT="blue"
  CURR_SLOT="green"
fi
log "Active slot: $CURR_SLOT (:$CURR_PORT) → deploying to $NEW_SLOT (:$NEW_PORT)"

# 4. Build new image
log "Building new Docker image..."
sudo docker build -t engram-api:candidate ./packages/api \
  || die "Docker build failed"

# 5. Stop any previous candidate container on this slot
sudo docker rm -f "engram-api-${NEW_PORT}" 2>/dev/null || true
sudo docker rm -f "engram-api-1" 2>/dev/null || true

# 6. Start new container on new port
log "Starting $NEW_SLOT container on :$NEW_PORT..."
sudo docker run -d \
  --name "engram-api-${NEW_PORT}" \
  --network engram_default \
  --env-file "$REPO_DIR/.env" \
  -p "127.0.0.1:${NEW_PORT}:3000" \
  --dns 8.8.8.8 --dns 1.1.1.1 \
  -v engram_blobdata:/data/blobs \
  --restart unless-stopped \
  engram-api:candidate \
  || die "Failed to start new container"

# 7. Wait for health
log "Waiting for :$NEW_PORT to be healthy (max ${MAX_WAIT}s)..."
ELAPSED=0
until health_check "$NEW_PORT"; do
  sleep 2; ELAPSED=$((ELAPSED + 2))
  [[ $ELAPSED -ge $MAX_WAIT ]] && rollback "$CURR_PORT" "$NEW_PORT"
  log "  waiting... (${ELAPSED}s)"
done
log ":$NEW_PORT is healthy"

# 8. Switch Caddy
switch_caddy "$NEW_PORT"

# 9. Drain old container (give in-flight requests 10s)
log "Draining old container :$CURR_PORT (10s)..."
sleep 10

# 10. Stop old container
log "Stopping old $CURR_SLOT container..."
sudo docker stop "engram-api-${CURR_PORT}" 2>/dev/null || true
sudo docker rm "engram-api-${CURR_PORT}" 2>/dev/null || true
sudo docker rm -f "engram-api-1" 2>/dev/null || true

# 11. Tag candidate as latest
sudo docker tag engram-api:candidate engram-api:latest

log "=== Deploy complete: $NEW_SLOT (:$NEW_PORT) is live ==="

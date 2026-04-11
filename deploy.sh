#!/usr/bin/env bash
# /opt/engram/deploy.sh
# Blue/green zero-downtime deploy for Engram API
# Usage: ./deploy.sh [--rollback]
# Called by GitHub Actions via SSH, or manually

set -euo pipefail

REPO_DIR="/home/hermes/engram"
COMPOSE_FILE="$REPO_DIR/docker-compose.yml"
HEALTH_URL="http://localhost"
HEALTH_ENDPOINT="/v1/health"
MAX_WAIT=60   # seconds to wait for new container to be healthy
CADDY_API="http://localhost:2019"

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
die() { echo "[ERROR] $*" >&2; exit 1; }

# Determine which slot is currently active (blue=3000, green=3001)


health_check() {
  local port=$1
  local url="http://127.0.0.1:${port}${HEALTH_ENDPOINT}"
  curl -sf --max-time 5 "$url" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('status')=='ok' else 1)" 2>/dev/null
}

switch_caddy() {
  local new_port=$1
  log "Switching Caddy upstream to port $new_port..."
  # Path: routes[0] > handle[0](subroute) > routes[0] > handle[2](reverse_proxy) > upstreams
  curl -sf -X PATCH \
    "$CADDY_API/config/apps/http/servers/srv0/routes/0/handle/0/routes/0/handle/2/upstreams" \
    -H "Content-Type: application/json" \
    -d "[{\"dial\": \"localhost:${new_port}\"}]" || die "Failed to switch Caddy upstream"
  log "Caddy now pointing to :$new_port"
}

active_port() {
  curl -sf \
    "$CADDY_API/config/apps/http/servers/srv0/routes/0/handle/0/routes/0/handle/2/upstreams/0/dial" \
    2>/dev/null | tr -d '"' | cut -d: -f2 || echo "3000"
}

rollback() {
  local active=$1
  local failed=$2
  log "Rolling back — keeping :$active, stopping :$failed"
  sudo docker compose -f "$COMPOSE_FILE" stop "api-${failed}" 2>/dev/null || true
  sudo docker rm -f "engram-api-${failed}" 2>/dev/null || true
  die "Deploy failed — rolled back to :$active"
}

# ── Rollback mode ──────────────────────────────────────────────────
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

# ── Deploy ─────────────────────────────────────────────────────────
log "=== Engram Deploy ==="

# 1. Pull latest code — reset hard to avoid divergence from squash merges
log "Pulling latest code..."
cd "$REPO_DIR"
GH_CONFIG_DIR=/home/hermes/.hermes/gh-config git fetch origin main
GH_CONFIG_DIR=/home/hermes/.hermes/gh-config git reset --hard origin/main

# 2. Determine slots
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

# 3. Build new image
log "Building new Docker image..."
sudo docker build -t engram-api:candidate ./packages/api \
  || die "Docker build failed"

# 4. Stop any previous candidate container on this slot
sudo docker rm -f "engram-api-${NEW_PORT}" 2>/dev/null || true
# Also clean up any compose-managed container that may be on this port
sudo docker rm -f "engram-api-1" 2>/dev/null || true

# 5. Start new container on new port
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

# 6. Wait for health
log "Waiting for :$NEW_PORT to be healthy (max ${MAX_WAIT}s)..."
ELAPSED=0
until health_check "$NEW_PORT"; do
  sleep 2; ELAPSED=$((ELAPSED + 2))
  [[ $ELAPSED -ge $MAX_WAIT ]] && rollback "$CURR_PORT" "$NEW_PORT"
  log "  waiting... (${ELAPSED}s)"
done
log ":$NEW_PORT is healthy"

# 7. Switch Caddy
switch_caddy "$NEW_PORT"

# 8. Drain old container (give in-flight requests 10s)
log "Draining old container :$CURR_PORT (10s)..."
sleep 10

# 9. Stop old container
log "Stopping old $CURR_SLOT container..."
sudo docker stop "engram-api-${CURR_PORT}" 2>/dev/null || true
sudo docker rm "engram-api-${CURR_PORT}" 2>/dev/null || true
# Also stop the compose-managed container if it was the active one
sudo docker rm -f "engram-api-1" 2>/dev/null || true

# 10. Tag candidate as latest
sudo docker tag engram-api:candidate engram-api:latest

log "=== Deploy complete: $NEW_SLOT (:$NEW_PORT) is live ==="

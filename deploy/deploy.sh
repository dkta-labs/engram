#!/usr/bin/env bash
# Deploy hook for the infra control plane.
# Invoked by infra's generic runner with cwd = deploy_path, code already at the
# pinned ref. Contract env: DEPLOY_REF, SERVICE_NAME, PORT.
set -euo pipefail

sudo docker compose build api
sudo docker compose stop api
sudo docker compose up --no-deps -d api

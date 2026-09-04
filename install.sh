#!/bin/bash
# Quick installer for AriaHub using prebuilt Docker Hub images
# (no source code, no local build required).
#
# Works two ways:
#   1. Already cloned this repo? Just run: ./install.sh
#   2. Don't want to clone anything? Run:
#        mkdir ariahub && cd ariahub
#        curl -O https://raw.githubusercontent.com/YogeshxSaini/ariahub-docker/main/install.sh
#        chmod +x install.sh && ./install.sh
set -euo pipefail

REPO_RAW_URL="https://raw.githubusercontent.com/YogeshxSaini/ariahub-docker/main"

cd "$(dirname "$0")"

echo "==> AriaHub installer (prebuilt images)"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. Install it first, e.g.:"
  echo "  sudo apt update && sudo apt install -y docker.io docker-compose-plugin openssl curl"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "The 'docker compose' plugin is not available. Install docker-compose-plugin."
  exit 1
fi

# --- 1. Fetch docker-compose.yml and .env.example if not already present ---
if [ ! -f docker-compose.yml ]; then
  echo "==> Downloading docker-compose.yml..."
  curl -fsSLO "${REPO_RAW_URL}/docker-compose.yml"
fi

if [ ! -f .env.example ]; then
  echo "==> Downloading .env.example..."
  curl -fsSLO "${REPO_RAW_URL}/.env.example"
fi

# --- 2. Create .env with real secrets (only if it doesn't exist yet) ---
if [ -f .env ]; then
  echo "==> .env already exists, leaving it untouched."
else
  echo "==> Generating .env with fresh secrets..."
  cp .env.example .env

  RPC_SECRET=$(openssl rand -hex 32)
  API_KEY=$(openssl rand -hex 32)

  sed_i() { sed -i.bak "$1" .env && rm -f .env.bak; }
  sed_i "s|^ARIA2_RPC_SECRET=.*|ARIA2_RPC_SECRET=${RPC_SECRET}|"
  sed_i "s|^API_KEY=.*|API_KEY=${API_KEY}|"

  echo "==> Generated ARIA2_RPC_SECRET and API_KEY in .env"
fi

DOWNLOAD_PATH=$(grep -E '^DOWNLOAD_PATH=' .env | cut -d= -f2)
DOWNLOAD_PATH=${DOWNLOAD_PATH:-./downloads}

# --- 3. Create data directories with correct ownership ---
# The aria2 and backend containers run as UID 1000 (non-root, by design).
echo "==> Creating data directories..."
mkdir -p aria2-data backend-data "${DOWNLOAD_PATH}"

echo "==> Setting ownership on data directories (UID 1000, matches containers)..."
if [ "$(id -u)" -eq 0 ]; then
  chown -R 1000:1000 aria2-data backend-data "${DOWNLOAD_PATH}"
elif command -v sudo >/dev/null 2>&1; then
  sudo chown -R 1000:1000 aria2-data backend-data "${DOWNLOAD_PATH}"
else
  echo "WARNING: not root and no sudo available - could not chown data dirs."
  echo "Run manually: chown -R 1000:1000 aria2-data backend-data ${DOWNLOAD_PATH}"
fi

# --- 4. Pull prebuilt images instead of building ---
echo "==> Pulling prebuilt images from Docker Hub..."
docker compose pull

# --- 5. Start everything ---
echo "==> Starting AriaHub..."
docker compose up -d

# --- 6. Wait for health, then verify ---
echo
echo "==> Waiting for services to become healthy..."
for i in $(seq 1 30); do
  STATUS=$(docker compose ps --format json 2>/dev/null | grep -c '"Health":"healthy"' || true)
  if [ "${STATUS:-0}" -ge 3 ]; then
    break
  fi
  sleep 2
done

docker compose ps

PORT=$(grep -E '^FRONTEND_PORT=' .env | cut -d= -f2)
PORT=${PORT:-8088}

echo
echo "AriaHub should now be running at: http://localhost:${PORT}/"
echo "Your API key is stored in .env (API_KEY) - keep it secret."
echo "If you're deploying to a remote server, replace 'localhost' with"
echo "the server's public IP or domain, and open the firewall port for ${PORT} only."

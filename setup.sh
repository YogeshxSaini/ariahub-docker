#!/bin/bash
# One-command setup for AriaHub: generates secrets, creates data
# directories, builds/pulls images, and starts the stack.
set -euo pipefail

cd "$(dirname "$0")"

echo "==> AriaHub setup"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. Install it first, e.g.:"
  echo "  sudo apt update && sudo apt install -y docker.io docker-compose-plugin"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "The 'docker compose' plugin is not available. Install docker-compose-plugin."
  exit 1
fi

if [ -f .env ]; then
  echo "==> .env already exists, leaving it untouched."
else
  echo "==> Generating .env with fresh secrets..."
  cp .env.example .env

  RPC_SECRET=$(openssl rand -hex 32)
  API_KEY=$(openssl rand -hex 32)

  # Portable in-place sed for both GNU and BSD/macOS sed.
  sed_i() { sed -i.bak "$1" .env && rm -f .env.bak; }

  sed_i "s|^ARIA2_RPC_SECRET=.*|ARIA2_RPC_SECRET=${RPC_SECRET}|"
  sed_i "s|^API_KEY=.*|API_KEY=${API_KEY}|"

  echo "==> Generated ARIA2_RPC_SECRET and API_KEY in .env"
fi

DOWNLOAD_PATH=$(grep -E '^DOWNLOAD_PATH=' .env | cut -d= -f2)
DOWNLOAD_PATH=${DOWNLOAD_PATH:-./downloads}

echo "==> Creating data directories..."
mkdir -p aria2-data backend-data "${DOWNLOAD_PATH}"

# The aria2 and backend containers run as UID 1000 (non-root, by design).
# Bind-mounted host directories default to root ownership, which blocks
# those containers from writing to /config, /data, and the downloads dir.
# Fix ownership up front so the first run doesn't fail with "unhealthy".
echo "==> Setting ownership on data directories (UID 1000, matches containers)..."
if [ "$(id -u)" -eq 0 ]; then
  chown -R 1000:1000 aria2-data backend-data "${DOWNLOAD_PATH}"
elif command -v sudo >/dev/null 2>&1; then
  sudo chown -R 1000:1000 aria2-data backend-data "${DOWNLOAD_PATH}"
else
  echo "WARNING: not root and no sudo available - could not chown data dirs."
  echo "Run manually: chown -R 1000:1000 aria2-data backend-data ${DOWNLOAD_PATH}"
fi

echo "==> Building images locally..."
docker compose build

echo "==> Starting AriaHub..."
docker compose up -d

echo
echo "==> Waiting for services to become healthy..."
for i in $(seq 1 30); do
  STATUS=$(docker compose ps --format json 2>/dev/null | grep -c '"Health":"healthy"' || true)
  if [ "${STATUS:-0}" -ge 2 ]; then
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

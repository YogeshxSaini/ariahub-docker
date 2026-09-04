# AriaHub

AriaHub is a web-based interface for managing `aria2` downloads through a
React frontend and FastAPI backend.

---

## 🚀 Never used Docker before? Start here.

This section assumes zero experience. If you already know Docker, skip to
[Quick Start](#quick-start-recommended) below.

**What you need first:**
- A Linux server or computer (Ubuntu is easiest). This can be a cheap cloud
  VM (AWS, DigitalOcean, Hetzner, etc.) or your own machine.
- The ability to open a terminal and connect to that server (e.g. via SSH,
  or directly if it's your own computer).

**Step 1 — Install Docker.** Copy-paste this whole block into your
terminal and press Enter:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin openssl curl
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

This installs everything AriaHub needs to run. You only do this once per
server.

**Step 2 — Install AriaHub.** Copy-paste this whole block:

```bash
mkdir ariahub && cd ariahub
curl -O https://raw.githubusercontent.com/YogeshxSaini/ariahub-docker/main/install.sh
chmod +x install.sh
./install.sh
```

Wait for it to finish — it downloads everything, sets up passwords for you
automatically, and starts the app. This takes a minute or two.

**Step 3 — Open it in your browser.** The script will print a line like:

```
AriaHub should now be running at: http://localhost:8088/
```

If your server is remote (a cloud VM), replace `localhost` with your
server's public IP address, e.g. `http://203.0.113.5:8088/`. You should
see the AriaHub download manager.

**That's it.** You don't need to touch `.env`, Docker Compose, or any
config file by hand — `install.sh` handled it.

### If something looks wrong

Run this and send the output to whoever is helping you troubleshoot
(or paste it back if you're asking an AI assistant for help):

```bash
docker compose ps
docker compose logs
```

The most common issue on a fresh server is a firewall blocking the port —
see [Network Ports & Security](#network-ports--security) below, or just
ask for help with the exact error you see.

---

## Architecture

```text
Internet
   |
   v
React + Nginx :8088  (API key required on /api/*)
   |
   v
FastAPI / Uvicorn :8000
   |
   v
aria2 JSON-RPC :6800
   |
   v
downloads/ (or your configured DOWNLOAD_PATH)
```

## Requirements

- Linux server (or any Docker host)
- Docker Engine
- Docker Compose plugin
- `openssl` (used to generate secrets)

Install Docker on Ubuntu:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin openssl
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

## Quick Start (recommended)

```bash
git clone <this-repo-url> ariahub
cd ariahub
./setup.sh
```

`setup.sh` will:

1. Create `.env` from `.env.example` with a freshly generated
   `ARIA2_RPC_SECRET` and `API_KEY` (if `.env` doesn't already exist).
2. Create the `aria2-data`, `backend-data`, and `downloads` directories.
3. Build the three images locally.
4. Start the stack with `docker compose up -d`.
5. Print the URL and confirm the containers are healthy.

That's it — open `http://SERVER_IP:8088/` in a browser.

## Even Quicker: Install Without Cloning (prebuilt images)

If you don't want to build locally, `install.sh` pulls the prebuilt images
from Docker Hub instead. No git clone needed — it downloads only
`docker-compose.yml` and `.env.example`:

```bash
mkdir ariahub && cd ariahub
curl -O https://raw.githubusercontent.com/YogeshxSaini/ariahub-docker/main/install.sh
chmod +x install.sh
./install.sh
```

This does the same setup as `setup.sh` (secrets, directories, ownership)
but runs `docker compose pull` instead of `docker compose build`, so it
never needs the Python/React source code — just Docker.

## Manual Setup

If you'd rather do it by hand:

```bash
cp .env.example .env
```

Generate secrets and put them in `.env`:

```bash
openssl rand -hex 32   # -> ARIA2_RPC_SECRET
openssl rand -hex 32   # -> API_KEY
```

Edit `.env` and set `ARIA2_RPC_SECRET` and `API_KEY` to the values above.
**Never commit `.env` to source control** (it's already git-ignored).

Create data directories and set ownership (the containers run as UID 1000,
not root — skipping this causes the `aria2` container to fail with
"unhealthy" because it can't write to `/config`):

```bash
mkdir -p aria2-data backend-data downloads
sudo chown -R 1000:1000 aria2-data backend-data downloads
```

Build and start:

```bash
docker compose build
docker compose up -d
```

Or, to use published images instead of building locally, remove/comment out
the `build:` blocks in `docker-compose.yml` and run `docker compose pull`
first.

## Configuration (`.env`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ARIA2_RPC_SECRET` | Yes | — | Secret aria2 requires on its RPC interface. |
| `API_KEY` | Strongly recommended | — (auth disabled if empty) | Required in the `X-API-Key` header on every `/api/*` call except `/api/health`. Injected by nginx into its proxy config at container start (not baked into the frontend build), so changing it only needs `docker compose up -d` to take effect, not a rebuild. Leave empty only for local/dev use. |
| `DOWNLOAD_PATH` | No | `./downloads` | Host path where downloaded files land. Point this at a dedicated volume/disk in production. |
| `FRONTEND_PORT` | No | `8088` | Host port the web UI is published on. |
| `CORS_ALLOW_ORIGINS` | No | (none) | Comma-separated origins allowed to call the API. Only needed if you serve the frontend from a different origin than the API — the default same-origin nginx proxy doesn't need this. |
| `ARIA2_MAX_CONCURRENT_DOWNLOADS`, `ARIA2_SPLIT`, `ARIA2_MIN_SPLIT_SIZE`, `ARIA2_MAX_CONNECTION_PER_SERVER` | No | 5 / 8 / 10M / 8 | aria2 download tuning. |
| `*_CPU_LIMIT`, `*_MEM_LIMIT` | No | see `.env.example` | Per-service resource caps. |

## Using a Dedicated Storage Volume

By default, downloads land in `./downloads` next to the compose file. To use
a separate disk instead, set `DOWNLOAD_PATH` in `.env`, e.g.:

```env
DOWNLOAD_PATH=/mnt/data/downloads
```

To attach a fresh block volume on Ubuntu:

```bash
lsblk                                   # identify the new disk, e.g. /dev/sdb
sudo mkfs.ext4 /dev/sdb                 # ONLY on an empty disk — this wipes it
sudo mkdir -p /mnt/data
sudo mount /dev/sdb /mnt/data
sudo mkdir -p /mnt/data/downloads
sudo chown -R 1000:1000 /mnt/data/downloads   # matches the aria2 container's UID
```

Make the mount persistent:

```bash
sudo blkid /dev/sdb
sudo nano /etc/fstab
# add: UUID=YOUR_UUID /mnt/data ext4 defaults,nofail 0 2
sudo mount -a && findmnt /mnt/data
```

> Never run `mkfs` on a disk that already has data on it.

## Verify

```bash
docker compose ps
```

Expected:

```text
ariahub-aria2       Up (healthy)
ariahub-backend     Up (healthy)
ariahub-frontend    Up (healthy)
```

Health check (no API key needed):

```bash
curl -i http://127.0.0.1:8088/api/health
```

Authenticated call (replace `<key>` with your `API_KEY`):

```bash
curl -i -H "X-API-Key: <key>" http://127.0.0.1:8088/api/downloads
```

## Persistent Data

Containers are disposable — data lives outside them via bind mounts:

| Data | Host path | Container path |
|---|---|---|
| Downloads | `DOWNLOAD_PATH` (default `./downloads`) | `/downloads` |
| aria2 session/config | `./aria2-data` | `/config` |
| Backend database | `./backend-data` | `/data` |

Recreating containers does not remove these files.

## Updating

```bash
docker compose build   # or: docker compose pull, if using published images
docker compose up -d
docker compose ps
```

## Operations

```bash
docker compose down          # stop
docker compose up -d         # start
docker compose restart       # restart
docker compose logs -f       # all logs
docker logs -f ariahub-aria2
docker logs -f ariahub-backend
docker logs -f ariahub-frontend
```

## Network Ports & Security

| Port | Service | Public? |
|---|---|---|
| `FRONTEND_PORT` (default `8088`) | Frontend/Nginx | Yes |
| `8000` | FastAPI | No — not published to the host |
| `6800` | aria2 RPC | No — not published to the host |

Only the frontend port needs to be reachable from the internet; the backend
and aria2 talk to each other over the internal `ariahub` Docker network.

Security notes:

- **Set `API_KEY`.** Without it, anyone who can reach port 8088 can add,
  pause, resume, or delete downloads through `/api/*` — there's no other
  authentication layer in front of it. It's injected by nginx at container
  start, so changing it later only needs `docker compose up -d` — no
  rebuild required.
- Keep `.env` out of source control (already handled by `.gitignore`).
- Use a strong, random `ARIA2_RPC_SECRET` and `API_KEY` — `setup.sh`
  generates both for you.
- Don't publish ports `8000` or `6800` to the host/internet.
- Put a reverse proxy with TLS (e.g. Caddy, Traefik, or nginx +
  Let's Encrypt) in front of the frontend for any public deployment —
  this repo serves plain HTTP on `FRONTEND_PORT` by default.
- Back up `aria2-data`, `backend-data`, and your downloads.

Firewall example (UFW):

```bash
sudo ufw allow 22/tcp
sudo ufw allow 8088/tcp
sudo ufw enable
```

For cloud servers, also allow the frontend port in the provider's
security group / NSG / firewall rules.

## Moving AriaHub to Another Server

Fresh deployment:

1. Install Docker.
2. Clone this repo.
3. Run `./setup.sh` (generates a new `.env` with new secrets).
4. Optionally point `DOWNLOAD_PATH` at attached storage.

Existing installation — copy these to the new host before starting:

```text
.env
downloads/ (or your DOWNLOAD_PATH)
aria2-data/
backend-data/
```

## Building the Images Yourself

`docker-compose.yml` already builds from the local `Dockerfile`s by default
(via each service's `build:` block), so `docker compose build` /
`docker compose up -d --build` works out of the box without any extra
tagging or pushing.

If you want to publish your own images instead:

```bash
docker compose build
docker tag ariahub-aria2 <your-registry>/ariahub:aria2
docker tag ariahub-backend <your-registry>/ariahub:backend
docker tag ariahub-frontend <your-registry>/ariahub:frontend
docker push <your-registry>/ariahub:aria2
docker push <your-registry>/ariahub:backend
docker push <your-registry>/ariahub:frontend
```

Then update the `image:` lines in `docker-compose.yml` and remove the
`build:` blocks if you want `docker compose pull` to fetch prebuilt images
instead of building locally.

## License

Add the project's chosen license here.

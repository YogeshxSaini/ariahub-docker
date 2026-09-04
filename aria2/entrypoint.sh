#!/bin/sh
set -eu

# Write the RPC secret (and other static options) into a config file instead
# of passing --rpc-secret on the command line, so it doesn't show up in
# `docker top` / `ps aux` inside the container.
CONF_FILE="/config/aria2.conf"

cat > "$CONF_FILE" <<CONF
enable-rpc=true
rpc-listen-all=true
rpc-listen-port=6800
rpc-secret=${ARIA2_RPC_SECRET:-}
dir=/downloads
continue=true
file-allocation=none
max-concurrent-downloads=${ARIA2_MAX_CONCURRENT_DOWNLOADS:-5}
split=${ARIA2_SPLIT:-8}
min-split-size=${ARIA2_MIN_SPLIT_SIZE:-10M}
max-connection-per-server=${ARIA2_MAX_CONNECTION_PER_SERVER:-8}
retry-wait=5
timeout=60
save-session=/config/aria2.session
input-file=/config/aria2.session
save-session-interval=30
console-log-level=warn
CONF

chmod 600 "$CONF_FILE"

# Make sure a session file exists so --input-file doesn't fail on first boot.
touch /config/aria2.session

exec aria2c --conf-path="$CONF_FILE" "$@"

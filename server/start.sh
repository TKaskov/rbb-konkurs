#!/bin/bash
# Keeps the contest backend online: numbering server + Cloudflare quick tunnel.
# Publishes the tunnel URL to the live page (config.js → GitHub Pages) and restarts anything that dies.
set -uo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_DIR="$APP_DIR/../.konkurs-run"
PORT=8787
CHECK_EVERY=15
MAX_FAILED_CHECKS=3

mkdir -p "$RUN_DIR"
PID_FILE="$RUN_DIR/supervisor.pid"
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Already running (pid $(cat "$PID_FILE"))."
  exit 0
fi
echo $$ > "$PID_FILE"
[ -f "$RUN_DIR/supervisor.log" ] && mv "$RUN_DIR/supervisor.log" "$RUN_DIR/supervisor.prev.log"

SERVER_PID=""
TUNNEL_PID=""
TUNNEL_URL=""
HEALTHY_URL=""
FAILED_CHECKS=0

log() { echo "$(date '+%F %T') $*" >> "$RUN_DIR/supervisor.log"; }

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null
  rm -f "$PID_FILE"
  log "stopped"
}
trap cleanup EXIT
trap 'exit 0' INT TERM

start_server() {
  node "$APP_DIR/server/index.js" >> "$RUN_DIR/server.log" 2>&1 &
  SERVER_PID=$!
  log "server started (pid $SERVER_PID)"
  sleep 1
}

publish_url() {
  local url="$1"
  sed -i '' -E "s#apiUrl: '[^']*'#apiUrl: '$url'#" "$APP_DIR/config.js"
  if git -C "$APP_DIR" diff --quiet -- config.js; then
    log "config.js already points to $url"
    return
  fi
  git -C "$APP_DIR" commit -q -m "chore: point contest page to live server" -- config.js \
    && git -C "$APP_DIR" push -q origin main \
    && log "published $url" \
    || log "ERROR: could not publish $url"
}

start_tunnel() {
  local tunnel_log="$RUN_DIR/tunnel.log"
  : > "$tunnel_log"
  # --config /dev/null: ignore ~/.cloudflared/config.yml of other projects (its ingress would 404 us)
  cloudflared tunnel --config /dev/null --no-autoupdate --url "http://127.0.0.1:$PORT" >> "$tunnel_log" 2>&1 &
  TUNNEL_PID=$!
  TUNNEL_URL=""
  for _ in $(seq 1 60); do
    TUNNEL_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$tunnel_log" | head -1)"
    [ -n "$TUNNEL_URL" ] && break
    sleep 1
  done
  if [ -z "$TUNNEL_URL" ]; then
    log "ERROR: tunnel gave no URL, retrying"
    kill "$TUNNEL_PID" 2>/dev/null
    TUNNEL_PID=""
    return
  fi
  log "tunnel $TUNNEL_URL (pid $TUNNEL_PID)"
  FAILED_CHECKS=0
  publish_url "$TUNNEL_URL"
}

tunnel_healthy() {
  curl -fsS -m 10 "$TUNNEL_URL" > /dev/null 2>&1
}

# не даємо Mac заснути, поки працює цей скрипт (на живленні від мережі)
caffeinate -ims -w $$ &

log "starting"
while true; do
  if [ -z "$SERVER_PID" ] || ! kill -0 "$SERVER_PID" 2>/dev/null; then
    start_server
  fi
  if [ -z "$TUNNEL_PID" ] || ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    start_tunnel
  elif tunnel_healthy; then
    FAILED_CHECKS=0
    if [ "$HEALTHY_URL" != "$TUNNEL_URL" ]; then
      HEALTHY_URL="$TUNNEL_URL"
      log "healthy $TUNNEL_URL"
    fi
  else
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
    log "tunnel check failed ($FAILED_CHECKS/$MAX_FAILED_CHECKS)"
    if [ "$FAILED_CHECKS" -ge "$MAX_FAILED_CHECKS" ]; then
      kill "$TUNNEL_PID" 2>/dev/null
      TUNNEL_PID=""
    fi
  fi
  sleep "$CHECK_EVERY"
done

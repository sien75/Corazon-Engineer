#!/bin/sh
# dev launcher — builds sources and starts all four services, choosing free ports.
#
# Run from the project root (the directory holding engineer.yaml):
#   how-to/deploy/dev/launch.sh
# Stop with how-to/deploy/dev/stop.sh
#
# Ports have defaults (8500 web / 8501 ai / 8502 static / 8503 log); if a
# default is already in use the launcher advances to the next free port. The
# chosen ports are handed to each service as arguments and printed at the end,
# so there is no port config file to keep in sync.
#
# Services listen on loopback by default. Set ENGINEER_BIND to open the stack
# up — 0.0.0.0 for the whole network, or this machine's IP for one interface
# (the latter is what makes the printed addresses usable from another machine).
set -e
ROOT="$PWD"
[ -f "$ROOT/engineer.yaml" ] || {
  echo "run from the project root (no engineer.yaml in $ROOT)" >&2
  exit 1
}

D="$ROOT/.engineer/dev"
BIN="$D/bin"
mkdir -p "$BIN"

# --- reclaim our own previous instance ------------------------------------
# A leftover run still holds our default ports. Stop what THIS launcher started
# (recorded pids, then strays started from our own bin dir) — matching just
# "root $ROOT" would also kill a prod instance of the same project, which uses
# its own ports (750x) and has every right to keep running.
for s in web ai static log; do
  if [ -f "$D/$s.pid" ]; then
    kill "$(cat "$D/$s.pid")" 2>/dev/null || true
    rm -f "$D/$s.pid"
  fi
done
pkill -f "$BIN/engineer" 2>/dev/null || true
sleep 1

# --- port selection -------------------------------------------------------
port_free() {
  if command -v lsof >/dev/null 2>&1; then
    ! lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v ss >/dev/null 2>&1; then
    ! ss -ltn 2>/dev/null | awk '{print $4}' | grep -q "[:.]$1\$"
  elif command -v netstat >/dev/null 2>&1; then
    ! netstat -an 2>/dev/null | awk '{print $4}' | grep -q "[:.]$1\$"
  else
    return 0
  fi
}
# $1 = desired port, remaining args = already-chosen ports to avoid
pick_port() {
  p="$1"; shift
  while :; do
    busy=0
    for r in "$@"; do [ "$r" = "$p" ] && busy=1; done
    if [ "$busy" = 0 ] && port_free "$p"; then
      echo "$p"
      return
    fi
    p=$((p + 1))
  done
}
PORT_WEB=$(pick_port 8500)
PORT_AI=$(pick_port 8501 "$PORT_WEB")
PORT_STATIC=$(pick_port 8502 "$PORT_WEB" "$PORT_AI")
PORT_LOG=$(pick_port 8503 "$PORT_WEB" "$PORT_AI" "$PORT_STATIC")

# bind host: loopback unless ENGINEER_BIND opens the stack up
BIND=${ENGINEER_BIND:-127.0.0.1}
case "$BIND" in
  "" | 0.0.0.0 | "::") URLHOST=localhost ;;
  127.0.0.1 | localhost | "::1") URLHOST=localhost ;;
  *) URLHOST=$BIND ;;
esac
BASE=http://$URLHOST

# --- build ----------------------------------------------------------------
# One multi-call binary: log / static / web are this same file re-run with a
# subcommand (see how-to/deploy/prod/launch.go), so the local stack has a single
# executable path instead of one file per service.
( cd "$ROOT/how-to/deploy/prod" && go build -o "$BIN/engineer" . )
rm -f "$BIN/engineer-log" "$BIN/engineer-static" "$BIN/engineer-web"

# --- start (order: log → static → ai → web) -------------------------------
nohup "$BIN/engineer" serve-log --root "$ROOT" --addr "$BIND:$PORT_LOG" >"$D/log.log" 2>&1 </dev/null &
echo $! >"$D/log.pid"
nohup "$BIN/engineer" serve-static --root "$ROOT" --addr "$BIND:$PORT_STATIC" >"$D/static.log" 2>&1 </dev/null &
echo $! >"$D/static.pid"
# exec so the recorded pid IS the server process (not a wrapper that outlives kill)
( cd "$ROOT/workspace/ai" && exec nohup bun src/main.ts \
    --root "$ROOT" --addr "$BIND:$PORT_AI" \
    --agents "$ROOT/agents/AGENTS.md" \
    --log "$BASE:$PORT_LOG" --static "$BASE:$PORT_STATIC" >"$D/ai.log" 2>&1 </dev/null ) &
echo $! >"$D/ai.pid"
nohup "$BIN/engineer" serve-web "$PORT_WEB" --bind "$BIND" \
    --root "$ROOT/workspace/web" \
    --static "$BASE:$PORT_STATIC" --ai "$BASE:$PORT_AI" --log "$BASE:$PORT_LOG" >"$D/web.log" 2>&1 </dev/null &
echo $! >"$D/web.pid"

echo "engineer dev up — project: $ROOT"
printf '  web     %s\n' "$BASE:$PORT_WEB"
printf '  ai      %s\n' "$BASE:$PORT_AI"
printf '  static  %s\n' "$BASE:$PORT_STATIC"
printf '  log     %s\n' "$BASE:$PORT_LOG"
printf '  bind    %s\n' "$BIND"
echo "logs: $D/*.log    stop: how-to/deploy/dev/stop.sh"

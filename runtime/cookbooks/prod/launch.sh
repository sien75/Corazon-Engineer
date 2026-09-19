#!/bin/sh
# prod launcher (shipped as start.sh) — starts all four packaged binaries in the
# foreground, on free ports, and holds the terminal. Ctrl-C tears the whole
# stack down. There is no stop command: the foreground process group is the
# lifecycle.
#
# The project being processed is the current working directory (where `corazon`
# was invoked); it may be empty. All per-project state — the log db, traces,
# pids and service logs — lives under that directory's own .corazon/, so two
# projects launched from different directories never share processes or ports.
#
# Ports have defaults (7500 web / 7501 ai / 7502 static / 7503 log); if a
# default is already in use (e.g. another project's stack) the launcher
# advances to the next free port. The chosen ports are handed to each service
# as arguments and printed, so there is no port config file to maintain.
set -e
# name the terminal/window/tab "corazon" instead of the shell's process name
if [ -t 1 ]; then printf '\033]0;corazon\007'; fi
ROOT="$PWD"
cd "$(dirname "$0")"
PKG="$PWD"   # absolute install dir (binaries live in $PKG/bin)

D="$ROOT/.corazon"
RUN="$D/run"
mkdir -p "$RUN" "$D/logs"

# --- reclaim our own previous instance (this project only) ----------------
# A leftover run of THIS project still holds our default ports. Stop it first
# (recorded pids, then any stray process started with --root pointing here) so
# we reuse the ports instead of advancing past them. Another project's stack is
# never touched — it just pushes us to the next free port.
for s in web ai static log; do
  if [ -f "$RUN/$s.pid" ]; then
    kill "$(cat "$RUN/$s.pid")" 2>/dev/null || true
    rm -f "$RUN/$s.pid"
  fi
done
pkill -f "root $ROOT" 2>/dev/null || true
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
PORT_WEB=$(pick_port 7500)
PORT_AI=$(pick_port 7501 "$PORT_WEB")
PORT_STATIC=$(pick_port 7502 "$PORT_WEB" "$PORT_AI")
PORT_LOG=$(pick_port 7503 "$PORT_WEB" "$PORT_AI" "$PORT_STATIC")
BASE=http://localhost

# --- start (order: log → static → ai → web) -------------------------------
# Children stay in this process group, so Ctrl-C reaches them directly too.
PIDS=""
"$PKG/bin/corazon-log"    serve-log    --root "$ROOT" --addr ":$PORT_LOG" \
    >"$D/logs/log.log" 2>&1 &
PIDS="$PIDS $!"; echo $! >"$RUN/log.pid"
"$PKG/bin/corazon-static" serve-static --root "$ROOT" --addr ":$PORT_STATIC" \
    >"$D/logs/static.log" 2>&1 &
PIDS="$PIDS $!"; echo $! >"$RUN/static.pid"
"$PKG/bin/corazon-ai"     --root "$ROOT" --addr ":$PORT_AI" \
    --log "$BASE:$PORT_LOG" --static "$BASE:$PORT_STATIC" \
    >"$D/logs/ai.log" 2>&1 &
PIDS="$PIDS $!"; echo $! >"$RUN/ai.pid"
"$PKG/bin/corazon-web"    "$PORT_WEB" --root "$PKG/web" \
    --static "$BASE:$PORT_STATIC" --ai "$BASE:$PORT_AI" --log "$BASE:$PORT_LOG" \
    >"$D/logs/web.log" 2>&1 &
PIDS="$PIDS $!"; echo $! >"$RUN/web.pid"

cleanup() {
  trap - INT TERM EXIT
  for p in $PIDS; do kill "$p" 2>/dev/null || true; done
  wait 2>/dev/null || true
  rm -f "$RUN"/*.pid
}
trap cleanup INT TERM EXIT

echo "corazon up — project: $ROOT"
printf '  web     %s\n' "$BASE:$PORT_WEB"
printf '  ai      %s\n' "$BASE:$PORT_AI"
printf '  static  %s\n' "$BASE:$PORT_STATIC"
printf '  log     %s\n' "$BASE:$PORT_LOG"
echo "logs: $D/logs/    stop: Ctrl-C"

# Hold the foreground until Ctrl-C (or until every service has exited).
wait

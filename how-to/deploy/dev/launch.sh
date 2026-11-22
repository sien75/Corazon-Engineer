#!/bin/sh
# dev launcher — builds sources and starts all three services, choosing free ports.
#
# Run it from anywhere; it works from the checkout it lives in, not from the
# current directory:
#   <checkout>/how-to/deploy/dev/launch.sh
# Stop with how-to/deploy/dev/stop.sh
#
# A dev run has its own home, apart from a real install's ~/.engineer: by default
# <checkout>/.engineer/dev-home, data in <checkout>/.engineer/dev-home/data (the
# checkout's .engineer/ is git-ignored). It starts empty — models.yaml gets its
# defaults, projects are imported on the page — and never touches the user's real
# conversations. ENGINEER_HOME moves the home, ENGINEER_DATA moves just the data
# (the tests use it to keep their data apart). ENGINEER_INSTANCE names a second
# instance from the same checkout: different ports, its own pids/logs, no
# interference; both instances share the dev home unless one gets its own
# ENGINEER_DATA.
#
# Ports have defaults (8500 web / 8501 ai / 8502 storage); if a default is
# already in use the launcher advances to the next free port. The chosen ports
# are handed to each service as arguments and printed at the end, so there is no
# port config file to keep in sync.
#
# Services listen on loopback by default. Set ENGINEER_BIND to open the stack
# up — 0.0.0.0 for the whole network, or this machine's IP for one interface
# (the latter is what makes the printed addresses usable from another machine).
set -e
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
[ -f "$ROOT/how-to/deploy/dev/launch.sh" ] || {
  echo "cannot locate the checkout from $0" >&2
  exit 1
}

# Engineer's own folder for this dev run, and the data inside it: engineer.db,
# config.yaml, models.yaml, uploads, projects/. Not a project.
HOME_ROOT=${ENGINEER_HOME:-$ROOT/.engineer/dev-home}
DATA=${ENGINEER_DATA:-$HOME_ROOT/data}
# One instance per suffix; the binary path is per instance too, so the reclaim
# below only ever kills this instance's services.
D="$ROOT/.engineer/dev${ENGINEER_INSTANCE:+-$ENGINEER_INSTANCE}"
BIN="$D/bin"
mkdir -p "$BIN"

# --- reclaim our own previous instance ------------------------------------
# A leftover run still holds our default ports. Stop what THIS launcher started
# (recorded pids, then strays started from our own bin dir) — matching just
# "root $ROOT" would also kill a prod instance of the same project, which uses
# its own ports (750x) and has every right to keep running.
for s in web blueprint ai storage; do
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
PORT_STORAGE=$(pick_port 8502 "$PORT_WEB" "$PORT_AI")
PORT_BLUEPRINT=$(pick_port 8503 "$PORT_WEB" "$PORT_AI" "$PORT_STORAGE")

# bind host: loopback unless ENGINEER_BIND opens the stack up
BIND=${ENGINEER_BIND:-127.0.0.1}
case "$BIND" in
  "" | 0.0.0.0 | "::") URLHOST=localhost ;;
  127.0.0.1 | localhost | "::1") URLHOST=localhost ;;
  *) URLHOST=$BIND ;;
esac
BASE=http://$URLHOST

# --- build ----------------------------------------------------------------
# One multi-call binary: storage / web are this same file re-run with a
# subcommand (see how-to/deploy/prod/launch.go), so the local stack has a single
# executable path instead of one file per service.
( cd "$ROOT/how-to/deploy/prod" && go build -o "$BIN/engineer" . )
rm -f "$BIN/engineer-storage" "$BIN/engineer-blueprint" "$BIN/engineer-web"

# --- proxy ----------------------------------------------------------------
# Two calls leave this stack: its own, which are loopback (storage ↔ ai ↔ web),
# and the provider calls ai makes out (zenmux, deepseek, …). Loopback must
# bypass whatever proxy the user runs — Clash and friends 502 it, which breaks
# history reads and record writes — while a provider reached through a gateway
# may only be reachable *through* it. So NO_PROXY='*' is folded back to just
# loopback instead of being inherited as "bypass everything".
np=$(printf '%s,%s' "$no_proxy" "${NO_PROXY:-}" | tr ',' '\n' | grep -v -e '^\*$' -e '^$' | tr '\n' ',' | sed 's/,$//')
no_proxy="localhost,127.0.0.1,::1${np:+,$np}"
export no_proxy
NO_PROXY=$no_proxy
export NO_PROXY

# --- start (order: storage → ai → web) ------------------------------------
# Nothing is migrated here: the data home is the only database this program
# reads. A leftover `<checkout>/.engineer/engineer.db` from before the home
# existed is not consulted at all — the migration code that would have moved it
# is gone, and that file is no longer part of the program.
mkdir -p "$DATA"

# The interface docs (structure/docs) are a project convention, not something the
# agent is handed: they are regenerated here so the checkout stays honest (what
# changed is printed). The README is kept by hand, and a mismatch is only a
# warning in dev — packing refuses it.
bun "$ROOT/how-to/deploy/gen-docs.ts" "$ROOT" "$ROOT/structure/docs" ||
  echo "gen-docs: see above — structure/docs/README.md needs updating before a pack" >&2

# One service holds both the records and the project files: /log/* and /static/*
# are two prefixes on this one address.
nohup "$BIN/engineer" serve-storage --home "$DATA" --bind "$BIND" --port "$PORT_STORAGE" >"$D/storage.log" 2>&1 </dev/null &
echo $! >"$D/storage.pid"
# exec so the recorded pid IS the server process (not a wrapper that outlives kill)
( cd "$ROOT/workspace/ai" && exec nohup bun src/main.ts \
    --home "$DATA" \
    --bind "$BIND" --port "$PORT_AI" \
    --storage "$BASE:$PORT_STORAGE" >"$D/ai.log" 2>&1 </dev/null ) &
echo $! >"$D/ai.pid"
nohup "$BIN/engineer" serve-blueprint --bind "$BIND" --port "$PORT_BLUEPRINT" \
    --home "$DATA" \
    --engineer-home "$HOME_ROOT" \
    --cwd "$ROOT" \
    --storage "$BASE:$PORT_STORAGE" --ai "$BASE:$PORT_AI" >"$D/blueprint.log" 2>&1 </dev/null &
echo $! >"$D/blueprint.pid"
nohup "$BIN/engineer" serve-web --bind "$BIND" --port "$PORT_WEB" \
    --home "$DATA" \
    --shell "$ROOT/workspace/web/shell" \
    --blueprint "$BASE:$PORT_BLUEPRINT" \
    --storage "$BASE:$PORT_STORAGE" --ai "$BASE:$PORT_AI" \
    --cwd "$ROOT" >"$D/web.log" 2>&1 </dev/null &
echo $! >"$D/web.pid"

echo "engineer dev up — checkout: $ROOT"
printf '  home    %s\n' "$HOME_ROOT"
printf '  data    %s\n' "$DATA"
printf '  web     %s\n' "$BASE:$PORT_WEB"
printf '  blueprint %s\n' "$BASE:$PORT_BLUEPRINT"
printf '  ai      %s\n' "$BASE:$PORT_AI"
printf '  storage %s\n' "$BASE:$PORT_STORAGE"
printf '  bind    %s\n' "$BIND"
echo "logs: $D/*.log    stop: how-to/deploy/dev/stop.sh"

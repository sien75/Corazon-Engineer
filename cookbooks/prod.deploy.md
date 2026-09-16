# prod deploy cookbook

Package Corazon as a one-click tarball and deploy it on a fresh machine. No runtime dependencies on the target (no Go / Bun / Node) — the two Go services compile to static binaries, the ai service and the web server compile to self-contained Bun binaries. Docker is optional, not required: one-click comes from the generated `start.sh`, not from a container.

What ships — the four binaries (built from `workspace/`) plus the published tool content (`agents/`, `docs/`). The package is the **tool**, not a project:

```
corazon-<version>-<os>-<arch>/
├── bin/          corazon-log  corazon-static  corazon-ai  corazon-web
├── web/          index.html  app.js  style.css  vendor/
├── agents/       the AI capability description shipped with the tool
├── docs/         published documentation
├── start.sh      one-click start (log → static → ai → web)
├── stop.sh
└── install.sh    install / upgrade (see the Install section)
```

The installed layout (under `~/.corazon/`) is software plus tool-level credentials — **upgrades only ever touch `apps/`**:

```
~/.corazon/
├── apps/
│   ├── versions/corazon-<ver>-<os>-<arch>/   # unpacked software, one dir per version
│   └── current -> versions/corazon-<ver>-... # flipped on upgrade
├── credentials/   # tool-level credentials (e.g. the AI provider key)
└── bin/corazon    # the `corazon` command: start / stop / restart / status / version / uninstall
```

**Which project gets served**: `corazon start` serves the directory it was invoked from — the current working directory **is** the project being processed, and it may be empty (the agent initializes it). All data lives in that directory's own `.corazon/`; the tool ships no project and keeps no project data.

## Prerequisites (build machine only)

- Go 1.22+ and Bun, on any macOS/Linux machine (cross-compile flags below cover other targets)
- Target machine: same OS/arch as the build output, an LLM provider key for the ai service (env var, or `~/.corazon/credentials/pi.md`)

## Build & pack

Run from the repo root:

```bash
VER=$(git describe --tags --always 2>/dev/null || echo dev)
OS=$(go env GOOS); ARCH=$(go env GOARCH)   # override for cross-compile, e.g. OS=linux ARCH=x64
OUT=dist/corazon-$VER-$OS-$ARCH
mkdir -p "$OUT"/{bin,web}

# 1. Go services — CGO off, fully static (log's sqlite driver is pure Go)
(cd workspace/log    && CGO_ENABLED=0 go build -o "$OLDPWD/$OUT/bin/corazon-log" .)
(cd workspace/static && CGO_ENABLED=0 go build -o "$OLDPWD/$OUT/bin/corazon-static" .)

# 2. ai service — Bun single-file binary (needs node_modules installed)
(cd workspace/ai && bun install && bun build --compile src/main.ts --outfile "$OLDPWD/$OUT/bin/corazon-ai")

# 3. web — compile the static file server, ship the assets next to it
(cd workspace/web && bun build --compile serve.js --outfile "$OLDPWD/$OUT/bin/corazon-web")
cp workspace/web/{index.html,app.js,style.css} "$OUT/web/"
cp -R workspace/web/vendor "$OUT/web/"

# 4. tool content — the published parts only: agents/ (the AI capability
#    description) and docs/. Everything else (schema, runtime, devtime, tests, ...)
#    is dev-time internal and never ships.
for d in agents docs; do
  [ -d "$d" ] && cp -R "$d" "$OUT/"
done
```

Cross-compile: Go honors `GOOS`/`GOARCH`; Bun honors `--target` (e.g. `bun build --compile --target=bun-linux-x64 ...`). Build both parts for the same target platform.

## start.sh / stop.sh

Write these into `$OUT/` before tarring:

```bash
cat > "$OUT/start.sh" <<'EOF'
#!/bin/sh
# corazon one-click start — same order as cookbooks/dev.run.md: log → static → ai → web
#
# The project being processed is the current working directory (where `corazon
# start` was invoked); it may be empty. Data lives in that directory's own
# .corazon/. The tool itself ships no project and keeps no project data.
set -e
ROOT="$PWD"
cd "$(dirname "$0")"

mkdir -p logs run

nohup ./bin/corazon-log    serve-log    --root "$ROOT" >logs/log.log    2>&1 & echo $! >run/log.pid
nohup ./bin/corazon-static serve-static --root "$ROOT" >logs/static.log 2>&1 & echo $! >run/static.pid
nohup ./bin/corazon-ai     --root "$ROOT"              >logs/ai.log     2>&1 & echo $! >run/ai.pid
nohup ./bin/corazon-web    --root ./web                  >logs/web.log    2>&1 & echo $! >run/web.pid

echo "corazon up — project: $ROOT"
echo "web: http://localhost:7500 (ai :7501, static :7502, log :7503)"
EOF

cat > "$OUT/stop.sh" <<'EOF'
#!/bin/sh
cd "$(dirname "$0")"
for s in web ai static log; do
  [ -f run/$s.pid ] && kill "$(cat run/$s.pid)" 2>/dev/null && rm -f run/$s.pid
done
echo "corazon stopped"
EOF

chmod +x "$OUT/start.sh" "$OUT/stop.sh"
```

## install.sh (and the `corazon` command)

Write `install.sh` into `$OUT/` before tarring. It is idempotent: first run = install, every later run = upgrade. It stops the running instance, swaps in the new software, and flips `current`. `credentials/` is created on first install and **never modified again**.

```bash
cat > "$OUT/install.sh" <<'EOF'
#!/bin/sh
# corazon install / upgrade — replaces software only, never touches credentials.
set -e
CORAZON_HOME="${CORAZON_HOME:-$HOME/.corazon}"
SRC="$(cd "$(dirname "$0")" && pwd)"
NAME="$(basename "$SRC")"          # corazon-<ver>-<os>-<arch>
APPS="$CORAZON_HOME/apps"

# 1. tool dirs — credentials are tool-level; upgrades never write here
mkdir -p "$CORAZON_HOME/credentials" "$APPS/versions" "$CORAZON_HOME/bin"

# 2. stop the running instance, if any
[ -L "$APPS/current" ] && "$APPS/current/stop.sh" 2>/dev/null || true

# 3. install this version (re-install of the same version replaces its own dir)
rm -rf "$APPS/versions/$NAME"
cp -R "$SRC" "$APPS/versions/$NAME"

# 4. flip current — the upgrade switch
ln -sfn "$APPS/versions/$NAME" "$APPS/current"

# 5. the corazon command
cat > "$CORAZON_HOME/bin/corazon" <<'SHIM'
#!/bin/sh
CORAZON_HOME="${CORAZON_HOME:-$HOME/.corazon}"
CUR="$CORAZON_HOME/apps/current"
need() { [ -L "$CUR" ] || { echo "corazon: not installed"; exit 1; }; }
case "${1:-}" in
  start)   need; exec "$CUR/start.sh" ;;
  stop)    need; exec "$CUR/stop.sh" ;;
  restart) need; "$CUR/stop.sh" || true; exec "$CUR/start.sh" ;;
  status)
    need
    for s in log static ai web; do
      if [ -f "$CUR/run/$s.pid" ] && kill -0 "$(cat "$CUR/run/$s.pid")" 2>/dev/null; then
        echo "$s: running (pid $(cat "$CUR/run/$s.pid"))"
      else
        echo "$s: stopped"
      fi
    done ;;
  version) need; basename "$(readlink "$CUR")" ;;
  uninstall)
    need; "$CUR/stop.sh" 2>/dev/null || true
    rm -rf "$CORAZON_HOME/apps" "$CORAZON_HOME/bin"
    rm -f /usr/local/bin/corazon 2>/dev/null || true
    if [ "${2:-}" = "--purge" ]; then
      rm -rf "$CORAZON_HOME"
      echo "corazon uninstalled (credentials purged)"
    else
      echo "corazon uninstalled (credentials kept at $CORAZON_HOME/credentials — use --purge to remove)"
    fi ;;
  *) echo "usage: corazon start|stop|restart|status|version|uninstall [--purge]"; exit 1 ;;
esac
SHIM
chmod +x "$CORAZON_HOME/bin/corazon"

# 6. put corazon on PATH when possible, otherwise tell the user how
if [ -w /usr/local/bin ]; then
  ln -sfn "$CORAZON_HOME/bin/corazon" /usr/local/bin/corazon
else
  echo "add to your shell profile:  export PATH=\"$CORAZON_HOME/bin:\$PATH\""
fi

echo "corazon installed: $NAME"
echo "run: corazon start"
EOF

# runtime state (logs/, run/) is created when the package is run — never ship it
rm -rf "$OUT/logs" "$OUT/run"
chmod +x "$OUT/install.sh"
tar czf "$OUT.tar.gz" -C dist "$(basename "$OUT")"
```

## Install / Upgrade / Uninstall

```bash
# install (first time) or upgrade (any later time) — same command
tar xzf corazon-*.tar.gz && ./corazon-*/install.sh

corazon start       # one command: all four services up
corazon status      # per-service state
corazon version     # which version is current
```

- **Upgrade** replaces only `~/.corazon/apps/` (new version dir + `current` flip). Project data is never touched — the project being processed keeps its own `.corazon/` in place. Old version dirs stay until you delete them manually (`rm -rf ~/.corazon/apps/versions/<old>`).
- **Uninstall**: `corazon uninstall` removes the software and the command, keeps `~/.corazon/credentials/`; `corazon uninstall --purge` removes all of `~/.corazon/`. Project `.corazon/` directories always stay with their projects — uninstalling never deletes project data.
- LLM provider key: the tool reads `~/.corazon/credentials/pi.md` (env vars also work).
- The tarball still works portable-style too: unpack anywhere and `./start.sh` directly, no install.

Ports must match the `endpoints` in `runtime/dev.yaml` (web :7500, ai :7501, static :7502, log :7503) — the deployed processes realize that env. The Go services and ai accept `--addr <addr>` to override the listen port; web takes the port as a positional argument (e.g. `corazon-web 7500 --root ./web`). ai additionally has `--log <url>` (default `http://localhost:7503`) and `--model <provider/model>`.

## Verify

```bash
curl -s -X POST http://localhost:7502/static/query -d '{}'
```

A YAML response listing atoms / edges / runtime entries means the stack is up; browse the web UI at http://localhost:7500. Logs are under `logs/`, `./stop.sh` tears everything down.

## Notes

- **Why not Docker**: not needed for one-click — the tarball has zero runtime dependencies and `start.sh` is the single entry point. If you want container isolation anyway, build one all-in-one image: `COPY` the unpacked tarball, `CMD ["./start.sh"]` (use a `tail -f logs/*.log` or exec-wrapper to keep the container in foreground).
- **If `bun build --compile` misbehaves for ai** (the pi SDK is the most dynamic dependency): fall back to installing Bun on the target, ship `workspace/ai/` (src + package.json + bun.lock, then `bun install --production`), and change the ai line in start.sh to `bun run ai/src/main.ts --root "$ROOT"`.
- **Where the data lives**: everything mutable (the log service's sqlite db) goes under `<cwd project>/.corazon/` — the project being processed; back it up with the project. Tool-level credentials live at `~/.corazon/credentials/`. Runtime logs/pids (`logs/`, `run/`) live under the install's `apps/current/` and are per-version operational files — the records that matter are in the sqlite db.

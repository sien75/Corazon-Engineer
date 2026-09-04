# prod deploy cookbook

Package Corazon as a one-click tarball and deploy it on a fresh machine. No runtime dependencies on the target (no Go / Bun / Node) — the two Go services compile to static binaries, the ai service and the web server compile to self-contained Bun binaries. Docker is optional, not required: one-click comes from the generated `start.sh`, not from a container.

What ships (the four atoms of `runtime/dev.yaml`, plus the project content they serve — every service takes `--root` pointing at it):

```
corazon-<version>-<os>-<arch>/
├── bin/          corazon-log  corazon-static  corazon-ai  corazon-web
├── web/          index.html  app.js  style.css  vendor/
├── project/      corazon.yaml  atoms/  edges/  contracts/  runtime/  devtime/  tests/  docs/  notes/  cookbooks/
├── start.sh      one-click start (log → static → ai → web)
└── stop.sh
```

## Prerequisites (build machine only)

- Go 1.22+ and Bun, on any macOS/Linux machine (cross-compile flags below cover other targets)
- Target machine: same OS/arch as the build output, an LLM provider key for the ai service (env var, or `<deploy>/project/.corazon/credentials/pi.md` — git-ignored, so ship it separately)

## Build & pack

Run from the repo root:

```bash
VER=$(git describe --tags --always 2>/dev/null || echo dev)
OS=$(go env GOOS); ARCH=$(go env GOARCH)   # override for cross-compile, e.g. OS=linux ARCH=x64
OUT=dist/corazon-$VER-$OS-$ARCH
mkdir -p "$OUT"/{bin,web,project}

# 1. Go services — CGO off, fully static (log's sqlite driver is pure Go)
(cd workspace/log    && CGO_ENABLED=0 go build -o "$OLDPWD/$OUT/bin/corazon-log" .)
(cd workspace/static && CGO_ENABLED=0 go build -o "$OLDPWD/$OUT/bin/corazon-static" .)

# 2. ai service — Bun single-file binary (needs node_modules installed)
(cd workspace/ai && bun install && bun build --compile src/main.ts --outfile "$OLDPWD/$OUT/bin/corazon-ai")

# 3. web — compile the static file server, ship the assets next to it
(cd workspace/web && bun build --compile serve.js --outfile "$OLDPWD/$OUT/bin/corazon-web")
cp workspace/web/{index.html,app.js,style.css} "$OUT/web/"
cp -R workspace/web/vendor "$OUT/web/"

# 4. project content — what the services serve via --root
cp corazon.yaml "$OUT/project/"
for d in atoms edges contracts runtime devtime tests docs notes cookbooks; do
  [ -d "$d" ] && cp -R "$d" "$OUT/project/"
done
```

Cross-compile: Go honors `GOOS`/`GOARCH`; Bun honors `--target` (e.g. `bun build --compile --target=bun-linux-x64 ...`). Build both parts for the same target platform.

## start.sh / stop.sh

Write these into `$OUT/` before tarring:

```bash
cat > "$OUT/start.sh" <<'EOF'
#!/bin/sh
# corazon one-click start — same order as cookbooks/dev.run.md: log → static → ai → web
set -e
cd "$(dirname "$0")"
mkdir -p logs run

nohup ./bin/corazon-log    serve-log    --root ./project >logs/log.log    2>&1 & echo $! >run/log.pid
nohup ./bin/corazon-static serve-static --root ./project >logs/static.log 2>&1 & echo $! >run/static.pid
nohup ./bin/corazon-ai     --root ./project              >logs/ai.log     2>&1 & echo $! >run/ai.pid
nohup ./bin/corazon-web    --root ./web                  >logs/web.log    2>&1 & echo $! >run/web.pid

echo "corazon up — web: http://localhost:7500 (ai :7501, static :7502, log :7503)"
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
tar czf "$OUT.tar.gz" -C dist "$(basename "$OUT")"
```

## Deploy

```bash
scp "$OUT.tar.gz" user@host:
ssh user@host
tar xzf corazon-*.tar.gz && cd corazon-*
export DEEPSEEK_API_KEY=...   # or any pi-supported provider key; skip if using project/.corazon/credentials/pi.md
./start.sh                    # one-click: all four services up
```

Ports must match the `endpoints` in `runtime/dev.yaml` (web :7500, ai :7501, static :7502, log :7503) — the deployed processes realize that env. Each binary accepts `--addr <addr>` to override its listen port; ai additionally has `--log <url>` (default `http://localhost:7503`) and `--model <provider/model>`.

## Verify

```bash
curl -s -X POST http://localhost:7502/static/query -d '{}'
```

A YAML response listing atoms / edges / runtime entries means the stack is up; browse the web UI at http://localhost:7500. Logs are under `logs/`, `./stop.sh` tears everything down.

## Notes

- **Why not Docker**: not needed for one-click — the tarball has zero runtime dependencies and `start.sh` is the single entry point. If you want container isolation anyway, build one all-in-one image: `COPY` the unpacked tarball, `CMD ["./start.sh"]` (use a `tail -f logs/*.log` or exec-wrapper to keep the container in foreground).
- **If `bun build --compile` misbehaves for ai** (the pi SDK is the most dynamic dependency): fall back to installing Bun on the target, ship `workspace/ai/` (src + package.json + bun.lock, then `bun install --production`), and change the ai line in start.sh to `bun run ai/src/main.ts --root ./project`.
- SQLite data written by the log service lives under the deployed `project/` root — back it up with the project content if records matter.

# prod deploy cookbook

Package Corazon as a one-click tarball and deploy it on a fresh machine. No runtime dependencies on the target (no Go / Bun / Node) — the three Go programs (`corazon` launcher, log, static) compile to static binaries, the ai service and the web server compile to self-contained Bun binaries. Docker is optional, not required: one-click comes from the `corazon` launcher, not from a container.

What ships — the five binaries (built from `workspace/`) plus the published tool content (`agents/`, `docs/`). The package is the **tool**, not a project:

```
corazon-<version>-<os>-<arch>/
├── bin/          corazon  corazon-log  corazon-static  corazon-ai  corazon-web
├── web/          index.html  app.js  style.css  vendor/
├── agents/       the AI capability description shipped with the tool
├── docs/         published documentation
└── install.sh    install / upgrade (see the Install section)
```

The installed layout (under `~/.corazon/`) is software only — **upgrades only ever touch `apps/`**:

```
~/.corazon/
├── apps/
│   ├── versions/corazon-<ver>-<os>-<arch>/   # unpacked software, one dir per version
│   └── current -> versions/corazon-<ver>-... # flipped on upgrade
└── bin/corazon -> apps/current/bin/corazon   # the `corazon` command (symlink)
```

The `bin/corazon` symlink is the whole command: a native Go launcher that serves
`start` (default) / `status` / `version` / `uninstall [--purge]`.

**Which project gets served**: `corazon` serves the directory it was invoked from — the current working directory **is** the project being processed, and it may be empty (the agent initializes it). All data lives in that directory's own `.corazon/`; the tool ships no project and keeps no project data. Logs and pids live in that project's `.corazon/logs/` and `.corazon/run/`, so two projects started from different directories never share processes or ports.

**Lifecycle**: `corazon` starts the four services and holds the foreground. Ctrl-C stops them all — there is no `stop` command.

## Prerequisites (build machine only)

- Go 1.22+ and Bun, on any macOS/Linux machine (cross-compile flags below cover other targets)
- Target machine: same OS/arch as the build output, an LLM provider key for the ai service (pi's own config: env var or `~/.pi/agent/auth.json`)

## Build & pack

Run from the repo root:

```bash
VER=$(git describe --tags --always 2>/dev/null || echo dev)
OS=$(go env GOOS); ARCH=$(go env GOARCH)   # override for cross-compile, e.g. OS=linux ARCH=x64
OUT=dist/corazon-$VER-$OS-$ARCH
mkdir -p "$OUT"/{bin,web}

# 1. Go programs — CGO off, fully static (log's sqlite driver is pure Go)
#    launcher (the `corazon` command) first — one file, built straight from the
#    runtime tree — then the two services
CGO_ENABLED=0 go build -o "$OUT/bin/corazon" runtime/cookbooks/prod/launch.go
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

# 5. installer — copied in as a real file, never generated from this BOOK
cp runtime/cookbooks/prod/install.sh "$OUT/install.sh"
chmod +x "$OUT/install.sh"
```

Cross-compile: Go honors `GOOS`/`GOARCH`; Bun honors `--target` (e.g. `bun build --compile --target=bun-linux-x64 ...`). Build every part for the same target platform.

## the `corazon` launcher

`bin/corazon` is built from `runtime/cookbooks/prod/launch.go` (a single-file Go program, compiled at pack time) — a native binary, shipped as the package's entry point:

- picks free ports (defaults 7500 web / 7501 ai / 7502 static / 7503 log, advancing to the next free port on conflict), hands each address to the services (ai gets `--log` + `--static`, web gets `--static` / `--ai` / `--log`), starts log → static → ai → web as children, prints the chosen ports, then **holds the foreground**. Ctrl-C tears the whole stack down. There is **no port config file** and no stop script.
- also serves the `corazon` subcommands: `start` (default) / `status` / `version` / `uninstall [--purge]`.
- native on purpose: the terminal's foreground process is named `corazon` (a shell script would show as `bash`/`zsh` there), so terminals that title tabs from the process name — VS Code, notably — show `corazon` with no configuration.

`install.sh` is the other shipped script: install / upgrade (next section).

## install.sh

`install.sh` (copied from `runtime/cookbooks/prod/`) is idempotent: first run = install, every later run = upgrade. It stops any running instance of the currently-installed version, swaps in the new software, and flips `current`. It only touches `~/.corazon/apps/` and `~/.corazon/bin/`, and points the `corazon` command (`~/.corazon/bin/corazon`) at `apps/current/bin/corazon` — so an upgrade is just the `current` flip.

```bash
# runtime state (logs/, run/) is created when the package is run — never ship it
rm -rf "$OUT/logs" "$OUT/run"
tar czf "$OUT.tar.gz" -C dist "$(basename "$OUT")"
```

## Install / Upgrade / Uninstall

```bash
# install (first time) or upgrade (any later time) — same command
tar xzf corazon-*.tar.gz && ./corazon-*/install.sh

corazon             # one command: all four services up, foreground (Ctrl-C to stop)
corazon status      # per-service state for the current project
corazon version     # which version is current
```

- **Upgrade** replaces only `~/.corazon/apps/` (new version dir + `current` flip). Project data is never touched — the project being processed keeps its own `.corazon/` in place. Old version dirs stay until you delete them manually (`rm -rf ~/.corazon/apps/versions/<old>`).
- **Uninstall**: `corazon uninstall` removes the software and the command; `corazon uninstall --purge` removes all of `~/.corazon/`. Project `.corazon/` directories always stay with their projects — uninstalling never deletes project data.
- LLM provider key: read from pi's own config (env vars or `~/.pi/agent/auth.json`). External tools keep their own credentials under their own `~/.xxx` locations.
- The tarball still works portable-style too: unpack anywhere and `./bin/corazon` directly, no install.

Ports: the launcher chooses them itself — defaults 7500 web / 7501 ai / 7502 static / 7503 log, advancing to the next free port when a default is taken — and prints the result. There is no config file; the chosen addresses are handed to each service (`--addr` for log/static/ai, positional for web; ai also gets `--log`/`--static`, web gets `--static`/`--ai`/`--log`) and to the frontend via `/config.js`. ai additionally has `--model <provider/model>`.

## Verify

The launcher prints the chosen addresses. Query static on the printed static port:

```bash
curl -s -X POST http://localhost:<static port>/static/query -d '{}'
```

A YAML response listing atoms / edges / runtime entries means the stack is up; browse the web UI at the printed web address. Logs are under the project's `.corazon/logs/`; Ctrl-C tears everything down.

## Notes

- **Why not Docker**: not needed for one-click — the tarball has zero runtime dependencies and `bin/corazon` is the single entry point. If you want container isolation anyway, build one all-in-one image: `COPY` the unpacked tarball, `CMD ["./bin/corazon"]` — the launcher already holds the foreground, so the container stays up until stopped.
- **If `bun build --compile` misbehaves for ai** (the pi SDK is the most dynamic dependency): fall back to installing Bun on the target, ship `workspace/ai/` (src + package.json + bun.lock, then `bun install --production`), and change the ai spec in `runtime/cookbooks/prod/launch.go` to `bun run ai/src/main.ts --root <project>` (rebuild `bin/corazon`).
- **Where the data lives**: everything mutable (the log service's sqlite db, plus per-project `run/` pids and `logs/`) goes under `<cwd project>/.corazon/` — the project being processed; back it up with the project.

# prod deploy cookbook

Package Corazon as a one-click tarball and deploy it on a fresh machine. No runtime dependencies on the target (no Go / Bun / Node) — the four Go programs (`corazon` launcher, log, static, web) compile to static binaries, and the ai service compiles to a self-contained Bun binary. Docker is optional, not required: one-click comes from the `corazon` launcher, not from a container.

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

One build per platform: the same steps, with that platform's variables set. Two platforms ship today —

| platform | `OS` | `ARCH` | `BUN_TARGET` |
| --- | --- | --- | --- |
| apple silicon (macOS) | `darwin` | `arm64` | `bun-darwin-arm64` |
| linux x86-64 (servers) | `linux` | `amd64` | `bun-linux-x64` |

Set all three together. Go reads `GOOS`/`GOARCH` from the environment on its own; Bun needs `--target` spelled out, and Bun names the x86-64 target `x64` where Go says `amd64`. Setting only part of them is the mixed-tarball trap below.

Run from the repo root:

```bash
# target: one row of the table above
OS=darwin; ARCH=arm64; BUN_TARGET=bun-darwin-arm64
# OS=linux;  ARCH=amd64; BUN_TARGET=bun-linux-x64

VER=$(git describe --tags --always 2>/dev/null || echo dev)
OUT=dist/corazon-$VER-$OS-$ARCH
mkdir -p "$OUT"/{bin,web}

# 1. Go programs — CGO off, fully static (log's sqlite driver is pure Go).
#    `-s -w` drops the debug/symbol tables: measured ~1/3 off each binary
#    (static 8.8 → 6.0 MB, log 14.8 → 9.9 MB) with no runtime effect.
#    launcher (the `corazon` command) first — one file, built straight from the
#    runtime tree — then the three services
CGO_ENABLED=0 GOOS=$OS GOARCH=$ARCH go build -ldflags="-s -w" -o "$OUT/bin/corazon" devtime/deploy/prod/launch.go
(cd workspace/log    && CGO_ENABLED=0 GOOS=$OS GOARCH=$ARCH go build -ldflags="-s -w" -o "$OLDPWD/$OUT/bin/corazon-log" .)
(cd workspace/static && CGO_ENABLED=0 GOOS=$OS GOARCH=$ARCH go build -ldflags="-s -w" -o "$OLDPWD/$OUT/bin/corazon-static" .)
(cd workspace/web/server && CGO_ENABLED=0 GOOS=$OS GOARCH=$ARCH go build -ldflags="-s -w" -o "$OLDPWD/$OUT/bin/corazon-web" .)

# 2. ai service — Bun single-file binary (needs node_modules installed).
#    `--target` is not optional: without it Bun builds for the host, so a
#    package named linux-amd64 would still carry a mac binary.
(cd workspace/ai && bun install && bun build --compile --target=$BUN_TARGET src/main.ts --outfile "$OLDPWD/$OUT/bin/corazon-ai")

# 3. web assets — shipped loose next to the binary, which serves them from
#    `--root` (the layout the launcher passes at runtime), so the frontend
#    stays editable without a rebuild
cp workspace/web/{index.html,app.js,style.css} "$OUT/web/"
cp -R workspace/web/vendor "$OUT/web/"

# 4. tool content — the published parts only: agents/ (the AI capability
#    description) and docs/. Everything else (schema, runtime, devtime, ...)
#    is dev-time internal and never ships.
for d in agents docs; do
  [ -d "$d" ] && cp -R "$d" "$OUT/"
done

# 5. installer — copied in as a real file, never generated from this BOOK
cp devtime/deploy/prod/install.sh "$OUT/install.sh"
chmod +x "$OUT/install.sh"
```

**Cross-compiling — both platforms from one machine.** Go honors `GOOS`/`GOARCH` and Bun honors `--target`, in both directions (verified: darwin-arm64 → linux-amd64/arm64 for both toolchains). Run the block above once per row of the table.

**The mixed-tarball trap.** Go picks up `GOOS`/`GOARCH` by itself, while `bun build --compile` defaults to the host. Set `OS`/`ARCH` without `BUN_TARGET` and you get Go ELF binaries next to a Bun Mach-O inside a package named `linux-amd64` — it packs, publishes and installs fine, and fails only when the launcher tries to start `corazon-ai` on Linux. Check before releasing:

```bash
file "$OUT"/bin/*   # every one must match the target: ELF for linux, Mach-O for darwin
```

On macOS both toolchains ad-hoc sign their output, so no separate `codesign` step is needed (verified on this repo's packages).

## the `corazon` launcher

`bin/corazon` is built from `devtime/deploy/prod/launch.go` (a single-file Go program, compiled at pack time) — a native binary, shipped as the package's entry point:

- picks free ports (defaults 7500 web / 7501 ai / 7502 static / 7503 log, advancing to the next free port on conflict), hands each address to the services (ai gets `--log` + `--static`, web gets `--static` / `--ai` / `--log`), starts log → static → ai → web as children, prints the chosen ports, then **holds the foreground**. Ctrl-C tears the whole stack down. There is **no port config file** and no stop script.
- also serves the `corazon` subcommands: `start` (default) / `status` / `version` / `uninstall [--purge]`.
- native on purpose: the terminal's foreground process is named `corazon` (a shell script would show as `bash`/`zsh` there), so terminals that title tabs from the process name — VS Code, notably — show `corazon` with no configuration.

`install.sh` is the other shipped script: install / upgrade (next section).

## install.sh

`install.sh` (copied from `devtime/deploy/prod/`) is idempotent: first run = install, every later run = upgrade. It stops any running instance of the currently-installed version, swaps in the new software, and flips `current`. It only touches `~/.corazon/apps/` and `~/.corazon/bin/`, and points the `corazon` command (`~/.corazon/bin/corazon`) at `apps/current/bin/corazon` — so an upgrade is just the `current` flip.

```bash
# runtime state (logs/, run/) is created when the package is run — never ship it
rm -rf "$OUT/logs" "$OUT/run"
tar czf "$OUT.tar.gz" -C dist "$(basename "$OUT")"
```

## Release

Packing leaves the tarball on the build machine only: `dist/` is git-ignored and binaries never go into git. Users get it from **GitHub Releases** — so a release is *tag the source → pack from that tag → attach the tarball to the release*.

**The tag comes first, packing second.** The pack step derives `VER` from `git describe --tags`, and that string becomes the tarball name, the unpacked directory, and what `corazon version` prints. Tagging after packing would ship a bare commit hash as the version; if you already packed, just re-run Build & pack once the tag exists. No tags exist yet — the first release picks the starting version (`v0.1.0` below).

Preconditions, on the build machine:

- a clean tree on the release commit (`git status --porcelain` prints nothing) — the release must be reproducible from the tag alone.
- the `gh` CLI, authenticated (`gh auth status`). Install with `brew install gh` (macOS) or `sudo apt install gh` / `dnf install gh` (Linux); detect with `command -v gh`. Signing in is the user's job — if it is not authenticated, ask the user.
- the repository is whatever `origin` points at — `gh` reads it from the git remote, so nothing here is hard-coded (`gh repo view` shows the resolved owner/name).

```bash
TAG=v0.1.0                       # the version being released

# 1. tag the release commit and push the tag — source only, dist/ stays out of git
git tag -a "$TAG" -m "Corazon $TAG"
git push origin "$TAG"

# 2. pack from that tag (Build & pack above), then confirm you really are on it:
git describe --tags --exact-match    # must print exactly $TAG (off-tag, it errors)
ls dist/corazon-"$TAG"-*.tar.gz      # nothing to release if this is empty

# 3. publish: create the release and attach the tarball(s)
gh release create "$TAG" dist/corazon-"$TAG"-*.tar.gz --title "Corazon $TAG" --generate-notes
```

- **One release, many platforms**: every tarball built for the same commit attaches to the same release — `dist/corazon-"$TAG"-*.tar.gz` matches them all. A platform is not a separate machine: one host can build them all (Go via `GOOS`/`GOARCH`, Bun via `--target` — verified from darwin-arm64 to linux-amd64 and linux-arm64). What is macOS-specific is *codesigning* (Bun's `codesign` support, ≥ 1.2.4), which avoids Gatekeeper warnings on the mac packages — not the build host. Watch the mixed-tarball trap in the cross-compile note in Build & pack.
- **No `gh`**: the web UI does the same thing — tag and push as above, then draft a release on the repo's Releases page and drag the tarballs in. The API equivalent is `POST https://api.github.com/repos/<owner>/<repo>/releases` with a token; the token belongs to the user/`gh`, and is never echoed into a command line, a log, or an answer.
- **Verify**: `gh release view "$TAG" --web` — the tarball downloads from the Releases page. On a clean machine, `tar xzf corazon-"$TAG"-*.tar.gz && ./corazon-*/install.sh` followed by `corazon version` prints `$TAG`. The published download link is what the root `README.md`, section "How to use it", points users at — it links the Releases page, plus the current version's asset as a concrete example; update that example when the version moves on.

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

For a packaged release, the same check applies after `./corazon-*/install.sh`: see the Release section.

## Notes

- **Why the web server is Go, not Bun**: it is ~100 lines of `net/http` + `os` — serve files, generate one `/config.js` — with no JS in it, so as a Bun binary it cost 61 MB of embedded runtime for nothing. `ai` stays Bun: the pi SDK is TypeScript, so a JS runtime is needed either way, and embedding it (70 MB) beats asking the user to install one.
- **Why not Docker**: not needed for one-click — the tarball has zero runtime dependencies and `bin/corazon` is the single entry point. If you want container isolation anyway, build one all-in-one image: `COPY` the unpacked tarball, `CMD ["./bin/corazon"]` — the launcher already holds the foreground, so the container stays up until stopped.
- **If `bun build --compile` misbehaves for ai** (the pi SDK is the most dynamic dependency): fall back to installing Bun on the target, ship `workspace/ai/` (src + package.json + bun.lock, then `bun install --production`), and change the ai spec in `devtime/deploy/prod/launch.go` to `bun run ai/src/main.ts --root <project>` (rebuild `bin/corazon`).
- **Where the data lives**: everything mutable (the log service's sqlite db, plus per-project `run/` pids and `logs/`) goes under `<cwd project>/.corazon/` — the project being processed; back it up with the project.

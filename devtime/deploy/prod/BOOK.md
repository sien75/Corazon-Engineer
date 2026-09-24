# prod deploy cookbook

Package Corazon Engineer as a one-click tarball and install it on a fresh machine. The target needs no runtime (no Go / Bun / Node): the four Go programs (`engineer` launcher, log, static, web) build to static binaries, and ai to a self-contained Bun binary. Docker is optional — one-click comes from the `engineer` launcher, not a container.

**What ships** — five binaries (from `workspace/`) plus the published tool content (`agents/`, `docs/`). The package is the **tool**, not a project:

```
engineer-<version>-<os>-<arch>/
├── bin/          engineer  engineer-log  engineer-static  engineer-ai  engineer-web
├── web/          index.html  app.js  style.css  vendor/
├── agents/       the AI capability description shipped with the tool
├── docs/         published documentation
└── install.sh    install / upgrade
```

The installed layout (under `~/.engineer/`) is software only — **upgrades only ever touch `apps/`**:

```
~/.engineer/
├── apps/
│   ├── versions/engineer-<ver>-<os>-<arch>/   # unpacked software, one dir per version
│   └── current -> versions/engineer-<ver>-... # flipped on upgrade
└── bin/engineer -> apps/current/bin/engineer   # the `engineer` command (symlink)
```

`bin/engineer` is the whole command: a native Go launcher serving `start` (default) / `status` / `version` / `uninstall [--purge]`.

**Which project gets served**: `engineer` serves the directory it was invoked from — the cwd **is** the project, and may be empty (the agent initializes it). All data lives in that directory's `.engineer/`; the tool ships no project and keeps no project data. Logs and pids live under the project's `.engineer/logs/` and `.engineer/run/`, so two projects started from different directories never share processes or ports.

**Lifecycle**: `engineer` starts the four services and holds the foreground; Ctrl-C stops them all. There is no `stop` command.

## Prerequisites (build machine only)

- Go 1.22+ and Bun, on any macOS/Linux machine (cross-compile flags below cover other targets)
- Target: same OS/arch as the build output, plus an LLM provider key for ai (pi's own config: env var or `~/.pi/agent/auth.json`)

## Build & pack

Packing is standalone — run it any time to produce a tarball; it publishes nothing.

One build per platform: same steps, with that platform's variables set. Two platforms ship today —

| platform | `OS` | `ARCH` | `BUN_TARGET` |
| --- | --- | --- | --- |
| apple silicon (macOS) | `darwin` | `arm64` | `bun-darwin-arm64` |
| linux x86-64 (servers) | `linux` | `amd64` | `bun-linux-x64` |

Set all three together. Go reads `GOOS`/`GOARCH` from the environment; Bun needs `--target` spelled out and names x86-64 `x64` where Go says `amd64`. Setting only part of them is the mixed-tarball trap below.

Run from the repo root:

```bash
# target: one row of the table above
OS=darwin; ARCH=arm64; BUN_TARGET=bun-darwin-arm64
# OS=linux;  ARCH=amd64; BUN_TARGET=bun-linux-x64

VER=$(git describe --tags --always 2>/dev/null || echo dev)
OUT=dist/engineer-$VER-$OS-$ARCH
mkdir -p "$OUT"/{bin,web}

# 1. Go programs — CGO off, fully static (log's sqlite driver is pure Go).
#    `-s -w` drops debug/symbol tables: ~1/3 off each binary (static 8.8 → 6.0 MB,
#    log 14.8 → 9.9 MB) with no runtime effect.
#    launcher (the `engineer` command) first — one file, built straight from the
#    runtime tree — then the three services
CGO_ENABLED=0 GOOS=$OS GOARCH=$ARCH go build -ldflags="-s -w" -o "$OUT/bin/engineer" devtime/deploy/prod/launch.go
(cd workspace/log    && CGO_ENABLED=0 GOOS=$OS GOARCH=$ARCH go build -ldflags="-s -w" -o "$OLDPWD/$OUT/bin/engineer-log" .)
(cd workspace/static && CGO_ENABLED=0 GOOS=$OS GOARCH=$ARCH go build -ldflags="-s -w" -o "$OLDPWD/$OUT/bin/engineer-static" .)
(cd workspace/web/server && CGO_ENABLED=0 GOOS=$OS GOARCH=$ARCH go build -ldflags="-s -w" -o "$OLDPWD/$OUT/bin/engineer-web" .)

# 2. ai service — Bun single-file binary (needs node_modules installed).
#    `--target` is not optional: without it Bun builds for the host, so a package
#    named linux-amd64 would still carry a mac binary.
(cd workspace/ai && bun install && bun build --compile --target=$BUN_TARGET src/main.ts --outfile "$OLDPWD/$OUT/bin/engineer-ai")

# 3. web assets — shipped loose next to the binary, which serves them from `--root`
#    (the layout the launcher passes at runtime), so the frontend stays editable
#    without a rebuild
cp workspace/web/{index.html,app.js,style.css} "$OUT/web/"
cp -R workspace/web/vendor "$OUT/web/"

# 4. tool content — published parts only: agents/ (AI capability description) and
#    docs/. Everything else (schema, runtime, devtime, ...) is dev-time internal
#    and never ships.
for d in agents docs; do
  [ -d "$d" ] && cp -R "$d" "$OUT/"
done

# 5. installer — copied in as a real file, never generated from this BOOK
cp devtime/deploy/prod/install.sh "$OUT/install.sh"
chmod +x "$OUT/install.sh"

# 6. pack the tarball — runtime state (logs/, run/) is created when the package
#    is first run, so it is never in the tarball. The tarball is the only artifact
#    that ships: drop the unpacked tree so dist/ ends up holding just the .tar.gz.
rm -rf "$OUT/logs" "$OUT/run"
tar czf "$OUT.tar.gz" -C dist "$(basename "$OUT")"
rm -rf "$OUT"
```

**Cross-compiling — both platforms from one machine.** Go honors `GOOS`/`GOARCH` and Bun honors `--target`, in both directions (verified: darwin-arm64 → linux-amd64/arm64). Run the block above once per row.

**The mixed-tarball trap.** Go picks up `GOOS`/`GOARCH` itself, while `bun build --compile` defaults to the host. Set `OS`/`ARCH` without `BUN_TARGET` and you get Go ELF binaries next to a Bun Mach-O in a package named `linux-amd64` — it packs, publishes and installs fine, then fails only when the launcher starts `engineer-ai` on Linux. Check before releasing:

```bash
file "$OUT"/bin/*   # every one must match the target: ELF for linux, Mach-O for darwin
```

On macOS both toolchains ad-hoc sign their output, so no separate `codesign` step is needed (verified on this repo's packages).

## the `engineer` launcher

`bin/engineer` is built from `devtime/deploy/prod/launch.go` (a single-file Go program compiled at pack time) — a native binary, shipped as the package's entry point:

- picks free ports (defaults 7500 web / 7501 ai / 7502 static / 7503 log, advancing to the next free one on conflict), hands each address to its service (`--addr` for log/static/ai, positional for web; ai also gets `--log` + `--static`, web gets `--static` / `--ai` / `--log`), starts log → static → ai → web as children, prints the chosen ports, then **holds the foreground**. Ctrl-C tears the whole stack down. There is **no port config file and no stop script**.
- also serves the `engineer` subcommands: `start` (default) / `status` / `version` / `uninstall [--purge]`.
- native on purpose: the terminal's foreground process is named `engineer` (a shell script would show as `bash`/`zsh`), so terminals that title tabs from the process name — VS Code, notably — show `engineer` with no configuration.

`install.sh` is the other shipped script: it installs (first run) or upgrades
(later runs) from a tarball.

## Release

A release happens only when the user explicitly asks for one.

Packing leaves the tarball on the build machine only: `dist/` is git-ignored and binaries never go into git. Users get it from **GitHub Releases**. Two machines take part, and they are not interchangeable:

- the **build machine** (this repo, with Go + Bun) — packs the tarballs and uploads them;
- the **release server** (`my-server`) — holds the repo, pushes the tag, and publishes the release with `gh`.

**The publish step runs only on the release server. Never run `gh release create` on the build machine.**

**Confirm the tag with the user first.** The tag *is* the version; never invent it. Ask which tag to release (e.g. `v0.1.0`) before touching anything.

**The tag comes first, packing second.** The pack step derives `VER` from `git describe --tags`, and that string becomes the tarball name, the unpacked directory, and what `engineer version` prints. Tagging after packing ships a bare commit hash; if you already packed, re-run Build & pack once the tag exists.

```bash
SRV=my-server                                        # ssh alias of the release server
TAG=v0.1.0                                            # confirmed with the user

# 1. tag the release commit ON THE SERVER and push — source only, dist/ stays out of git.
#    The server's tree must be clean and on the release commit.
ssh "$SRV" "cd ~/workspace/1/GithubCode/Corazon-Engineer && git status --porcelain && git tag -a '$TAG' -m 'Corazon Engineer $TAG' && git push origin '$TAG'"

# 2. pack ON THE BUILD MACHINE, from that tag (Build & pack above) — fetch it first
git fetch --tags
git describe --tags --exact-match    # must print exactly $TAG (off-tag it errors)
ls dist/engineer-"$TAG"-*.tar.gz      # nothing to release if this is empty
```

**Upload to the release server, clearing its previous packages first.** `dist/` is git-ignored, so the tarballs travel by `scp`, not git. Wipe the server's `dist/` so a stale tarball can never be attached to the new release.

```bash
ssh "$SRV" "rm -rf ~/workspace/1/GithubCode/Corazon-Engineer/dist && mkdir -p ~/workspace/1/GithubCode/Corazon-Engineer/dist"
scp dist/engineer-"$TAG"-*.tar.gz "$SRV:~/workspace/1/GithubCode/Corazon-Engineer/dist/"

# verify integrity end to end before publishing
shasum -a 256 dist/engineer-"$TAG"-*.tar.gz
ssh "$SRV" "cd ~/workspace/1/GithubCode/Corazon-Engineer/dist && sha256sum engineer-$TAG-*.tar.gz"
```

**Publish from the release server** — the build machine never does this:

```bash
ssh "$SRV" "cd ~/workspace/1/GithubCode/Corazon-Engineer && gh release create '$TAG' dist/engineer-$TAG-*.tar.gz --title 'Corazon Engineer $TAG' --generate-notes"
```

- **One release, many platforms**: every tarball built for the same commit attaches to the same release — `dist/engineer-"$TAG"-*.tar.gz` matches them all. A platform is not a separate machine: one host can build them all (Go via `GOOS`/`GOARCH`, Bun via `--target` — verified from darwin-arm64 to linux-amd64 and linux-arm64). What is macOS-specific is *codesigning* (Bun's `codesign`, ≥ 1.2.4), which avoids Gatekeeper warnings on the mac packages — not the build host. Watch the mixed-tarball trap in Build & pack.
- **The release server's prerequisites**: `git` with the repo (clean tree on the release commit), the `gh` CLI authenticated (`gh auth status`), and network reach to `api.github.com` and `uploads.github.com`. Install `gh` with `brew install gh` (macOS) or `dnf install gh` / `sudo apt install gh` (Linux). Signing in is the user's job — if not authenticated, ask the user.
- **When `github.com` is blocked but the API hosts are not** (common on locked-down servers): the browser device flow fails with `Post "https://github.com/login/device/code": EOF`, yet `gh release create` still works because it uses `api.github.com` + `uploads.github.com`. Authenticate with a token instead — `gh auth login --with-token` reads the token from stdin, so it never lands in a command line or a log. The token belongs to the user (`repo` scope, or fine-grained `Contents: Read and write` on this repo) and is never echoed into a command line, a log, or an answer.
- **No `gh` and no way to install it**: the web UI does the same — the tag is already pushed from the server, so draft a release on the repo's Releases page and drag the tarballs in. The API equivalent is `POST https://api.github.com/repos/<owner>/<repo>/releases` with a token (never echoed).
- **Verify**: on the server, `gh release view "$TAG"` lists the assets; then fetch the exact download link from `README.md` and confirm it returns `HTTP 200`. On a clean machine, `tar xzf engineer-"$TAG"-*.tar.gz && ./engineer-*/install.sh` followed by `engineer version` prints the package directory name, `engineer-$TAG-<os>-<arch>`. The Releases page is what the root `README.md`, section "How to use it", points users at.

## Notes

- **Why the web server is Go, not Bun**: it is ~100 lines of `net/http` + `os` — serve files, generate one `/config.js` — with no JS in it, so as a Bun binary it cost 61 MB of embedded runtime for nothing. `ai` stays Bun: the pi SDK is TypeScript, so a JS runtime is needed either way, and embedding it (70 MB) beats asking the user to install one.
- **Why not Docker**: not needed for one-click — the tarball has zero runtime dependencies and `bin/engineer` is the single entry point. If you want container isolation anyway, build one all-in-one image: `COPY` the unpacked tarball, `CMD ["./bin/engineer"]` — the launcher already holds the foreground, so the container stays up until stopped.
- **If `bun build --compile` misbehaves for ai** (the pi SDK is the most dynamic dependency): fall back to installing Bun on the target, ship `workspace/ai/` (src + package.json + bun.lock, then `bun install --production`), and change the ai spec in `devtime/deploy/prod/launch.go` to `bun run ai/src/main.ts --root <project>` (rebuild `bin/engineer`).
- **Where the data lives**: everything mutable (the log service's sqlite db, plus per-project `run/` pids and `logs/`) goes under `<cwd project>/.engineer/` — the project being processed; back it up with the project.

# Test: core-web-serve

The web service is the frontend's file server. It is **multi-root**: the app
itself (`index.html`, `app.js`, …) comes from `--assets`, while `/agent/<sessionId>/`
serves a **blueprint directory** from `--blueprints`
(`<project>/.agents/blueprints`) — the session is resolved to its slug through log,
so the URL carries the conversation while the page is shared by every agent of
that blueprint. `--agents` (`<project>/.engineer/agents`) is the optional legacy
root: per-agent copies made before blueprints stopped being copied.
It also generates `/config.js` with the addresses the launcher chose. This case covers it from the
user's point of view — the browser gets the app, the pages get their files, and
the app gets working addresses to call.

Source of truth for behaviour and CLI: `workspace/web/server` (Go), started as the
`serve-web` subcommand of the merged `engineer` binary.
`atoms/web.yaml` declares the frontend; the server is its runtime part, same atom.

## Setup

```bash
# Reclaim a previous run of this case. A leftover service keeps serving its
# old database (or silently stops this run's from binding, so the frontend
# talks to the other case's services) — and the failure that causes looks
# like a wrong answer, not a dead service. This happens before, not after.
for p in 8960 8961; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

(cd how-to/deploy/prod && go build -o /tmp/engineer .)

# a scratch project: one blueprint page, one legacy per-agent copy, and the log
# row that maps the session to the blueprint
SCRATCH=/tmp/web-serve-root
rm -rf "$SCRATCH"
mkdir -p "$SCRATCH/.agents/blueprints/demo" "$SCRATCH/.engineer/agents/s_legacy"
printf '<!doctype html>\n<html><head><title>Demo</title></head><body>demo</body></html>\n' \
  > "$SCRATCH/.agents/blueprints/demo/index.html"
printf '# demo\n' > "$SCRATCH/.agents/blueprints/demo/README.md"
printf '<!doctype html>\n<html><head><title>Legacy</title></head><body>legacy</body></html>\n' \
  > "$SCRATCH/.engineer/agents/s_legacy/index.html"

/tmp/engineer serve-log --root "$SCRATCH" --bind 127.0.0.1 --port 8961 &
sleep 1
curl -s -o /dev/null -X POST http://localhost:8961/log/session/upsert \
  -H 'Content-Type: application/yaml' --data-binary $'sessionId: s_demo\nkind: sub\nblueprint: demo'

/tmp/engineer serve-web --bind 127.0.0.1 --port 8960 \
  --assets "$(cd workspace/web && pwd)" \
  --blueprints "$SCRATCH/.agents/blueprints" --agents "$SCRATCH/.engineer/agents" \
  --static http://localhost:8502 --ai http://localhost:8501 --log http://localhost:8961 &
```

Expected on startup: a log line `engineer web: http://localhost:8960`.

## 1. the app shell is served

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8960/
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8960/index.html
```

Expected: both `200 text/html; charset=utf-8`, and both bodies are byte-identical
(`/` resolves to `index.html`).

## 2. assets are served with their own content types

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8960/app.js
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8960/style.css
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8960/theme.css
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8960/vendor/dompurify.js
```

Expected: `200 text/javascript; charset=utf-8`, `200 text/css; charset=utf-8`,
`200 text/css; charset=utf-8` (the shared palette a blueprint links too),
`200 text/javascript; charset=utf-8` — the files on disk, unmodified.

## 3. /config.js carries the addresses it was started with

```bash
curl -s http://localhost:8960/config.js
```

Expected: `200 text/javascript; charset=utf-8`, body exactly

```js
export const ENGINEER = {"static":"http://localhost:8502","ai":"http://localhost:8501","log":"http://localhost:8503"};
export default ENGINEER;
```

i.e. the three `--static` / `--ai` / `--log` values, in that key order, exported as
an ES module (nothing is written to `window`). The frontend and every blueprint page
get them with `import { ENGINEER } from "/config.js"`, which is also the check that
the file is a module and not a classic script: a `<script src="/config.js">` would
fail to parse it.

## 4. /agent/ is the second root: a session id resolves to a blueprint

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8960/agent/s_demo/
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8960/agent/s_demo/README.md
curl -s http://localhost:8960/agent/s_demo/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8960/agent/s_legacy/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8960/agent/s_nobody/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8960/agent/demo/
```

Expected: `200 text/html; charset=utf-8` for the session (the trailing slash
resolves to the blueprint's `index.html`), `200 text/markdown; charset=utf-8` for
its README, and the body is the blueprint's html — `<!doctype html>` … `demo` —
not the app shell. `s_legacy` is `200` from the legacy root (it has a copy but no
log row); `s_nobody` is `404` (no row, no copy); `/agent/demo/` is `404` — a slug
is not an address.

## 5. a tab's route is the shell; an agent's blueprint is the page

A tab lives at `/tab/<tabId>` in the address bar; its pane's iframe asks for
`/agent/<sessionId>/`. The shell answers anything it does not have on disk, which
is what keeps the tab bar on screen when a tab url is reloaded.

```bash
curl -s http://localhost:8960/tab/t_demo > /tmp/tab-noslash
curl -s http://localhost:8960/ > /tmp/tab-shell
cmp -s /tmp/tab-noslash /tmp/tab-shell && echo "same as the shell" || echo "DIFFERENT"
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8960/tab/t_demo
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8960/agent/s_demo
```

Expected: `same as the shell` and `404` — `/tab/<id>` is an SPA route, so the
frontend gets the shell; `/agent/...` is not: the blueprint either has the file or
it does not, and falling back to the shell would draw the shell inside the page's
own frame.

## 6. unknown paths fall back to the app shell (SPA routing) — except /agent/

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8960/nope
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8960/agent/not-an-agent/
```

Expected: `200 text/html; charset=utf-8` for `/nope` (the shell), `404` for an
unknown session — there is no page to draw there.

## 7. traversal and favicon

```bash
curl -s --path-as-is -o /dev/null -w '%{http_code}\n' 'http://localhost:8960/../etc/passwd'
curl -s --path-as-is -o /dev/null -w '%{http_code}\n' 'http://localhost:8960/..%2f..%2fetc%2fpasswd'
curl -s --path-as-is -o /dev/null -w '%{http_code}\n' 'http://localhost:8960/agent/../etc/passwd'
curl -s --path-as-is -o /dev/null -w '%{http_code}\n' 'http://localhost:8960/agent/..%2f..%2fetc%2fpasswd'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8960/favicon.ico
```

Expected: `403`, `403`, `403`, `403`, `404` — nothing outside the root in play is
ever served, and both the blueprint root and the legacy root are guarded exactly
like the assets root.

## 8. teardown

```bash
pkill -f 'serve-.*--port 8960'
pkill -f 'serve-.*--port 8961'
rm -rf /tmp/web-serve-root /tmp/tab-noslash /tmp/tab-shell
```

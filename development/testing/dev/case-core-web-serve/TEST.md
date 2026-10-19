# Test: core-web-serve

The web service is the frontend's file server. It is **multi-root**: the app
itself (`index.html`, `app.js`, …) comes from `--assets`, while `/agent/…` serves
the **agents' own copies of their blueprints** from `--agents`
(`<project>/.engineer/agents`) — each copy is that agent's `index.html`, keyed by
session id, so the prototype directory in `.agents/blueprints/` is never exposed.
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
for p in 8960; do pkill -f "serve-web.*--port $p" 2>/dev/null || true; done
sleep 1

(cd how-to/deploy/prod && go build -o /tmp/engineer .)

# a scratch agents root: one agent's copy of its blueprint
AGENTS=/tmp/web-serve-agents
rm -rf "$AGENTS" && mkdir -p "$AGENTS/s_demo"
printf '<!doctype html>\n<html><head><title>Demo</title></head><body>demo</body></html>\n' \
  > "$AGENTS/s_demo/index.html"
printf '# demo\n' > "$AGENTS/s_demo/README.md"

/tmp/engineer serve-web --bind 127.0.0.1 --port 8960 \
  --assets "$(cd workspace/web && pwd)" --agents "$AGENTS" \
  --static http://localhost:8502 --ai http://localhost:8501 --log http://localhost:8503 &
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
window.ENGINEER = {"static":"http://localhost:8502","ai":"http://localhost:8501","log":"http://localhost:8503"};
```

i.e. the three `--static` / `--ai` / `--log` values, in that key order. The frontend
reads `window.ENGINEER` to reach the other services.

## 4. /agent/ is the second root: an agent's copy is served from --agents

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8960/agent/s_demo/
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8960/agent/s_demo/README.md
curl -s http://localhost:8960/agent/s_demo/
```

Expected: `200 text/html; charset=utf-8` for the directory (the trailing slash
resolves to `index.html`), `200 text/markdown; charset=utf-8` for the README, and
the body of the third is the agent's own html — `<!doctype html>` … `demo` — not
the app shell. The prototype directory is not reachable at all: there is no
`/pages/` root and `/agent/` only names agent copies.

## 5. a tab's route is the shell; an agent's copy is the page

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
frontend gets the shell; `/agent/...` is not: a copy either has the file or it
does not, and falling back to the shell would draw the shell inside the page's
own frame.

## 6. unknown paths fall back to the app shell (SPA routing) — except /agent/

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8960/nope
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8960/agent/not-an-agent/
```

Expected: `200 text/html; charset=utf-8` for `/nope` (the shell), `404` for a
missing agent copy — there is no page to draw there.

## 7. traversal and favicon

```bash
curl -s --path-as-is -o /dev/null -w '%{http_code}\n' 'http://localhost:8960/../etc/passwd'
curl -s --path-as-is -o /dev/null -w '%{http_code}\n' 'http://localhost:8960/..%2f..%2fetc%2fpasswd'
curl -s --path-as-is -o /dev/null -w '%{http_code}\n' 'http://localhost:8960/agent/../etc/passwd'
curl -s --path-as-is -o /dev/null -w '%{http_code}\n' 'http://localhost:8960/agent/..%2f..%2fetc%2fpasswd'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8960/favicon.ico
```

Expected: `403`, `403`, `403`, `403`, `404` — nothing outside the root in play is
ever served, and the agents root is guarded exactly like the assets root.

## 8. teardown

```bash
pkill -f 'serve-web.*--port 8960'
rm -rf /tmp/web-serve-agents /tmp/tab-noslash /tmp/tab-shell
```

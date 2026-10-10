# Test: core-web-serve

The web service is the frontend's file server. It is **multi-root**: the app
itself (`index.html`, `app.js`, …) comes from `--assets`, while `/pages/…` serves
the project's blueprints from `--pages` — a blueprint being a frontend resource,
one `index.html` entry plus whatever assets sit beside it. It also generates
`/config.js` with the addresses the launcher chose. This case covers it from the
user's point of view — the browser gets the app, the pages get their files, and
the app gets working addresses to call.

Source of truth for behaviour and CLI: `workspace/web/server` (Go), started as the
`serve-web` subcommand of the merged `engineer` binary.
`atoms/web.yaml` declares the frontend; the server is its runtime part, same atom.

## Setup

```bash
(cd how-to/deploy/prod && go build -o /tmp/engineer .)

# a scratch blueprint root: one blueprint with an entry and an asset
PAGES=/tmp/web-serve-pages
rm -rf "$PAGES" && mkdir -p "$PAGES/demo"
printf '<!doctype html>\n<html><head><title>Demo</title></head><body>demo</body></html>\n' \
  > "$PAGES/demo/index.html"
printf 'body { margin: 0 }\n' > "$PAGES/demo/app.css"

/tmp/engineer serve-web --bind 127.0.0.1 --port 8600 \
  --assets "$(cd workspace/web && pwd)" --pages "$PAGES" \
  --static http://localhost:8502 --ai http://localhost:8501 --log http://localhost:8503 &
```

Expected on startup: a log line `engineer web: http://localhost:8600`.

## 1. the app shell is served

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8600/
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8600/index.html
```

Expected: both `200 text/html; charset=utf-8`, and both bodies are byte-identical
(`/` resolves to `index.html`).

## 2. assets are served with their own content types

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8600/app.js
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8600/style.css
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8600/theme.css
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8600/vendor/dompurify.js
```

Expected: `200 text/javascript; charset=utf-8`, `200 text/css; charset=utf-8`,
`200 text/css; charset=utf-8` (the shared palette a blueprint links too),
`200 text/javascript; charset=utf-8` — the files on disk, unmodified.

## 3. /config.js carries the addresses it was started with

```bash
curl -s http://localhost:8600/config.js
```

Expected: `200 text/javascript; charset=utf-8`, body exactly

```js
window.ENGINEER = {"static":"http://localhost:8502","ai":"http://localhost:8501","log":"http://localhost:8503"};
```

i.e. the three `--static` / `--ai` / `--log` values, in that key order. The frontend
reads `window.ENGINEER` to reach the other services.

## 4. /pages/ is the second root: blueprints are served from --pages

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8600/pages/demo/
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8600/pages/demo/app.css
curl -s http://localhost:8600/pages/demo/
```

Expected: `200 text/html; charset=utf-8` for the directory (the trailing slash
resolves to `index.html`), `200 text/css; charset=utf-8` for the asset, and the
body of the third is the blueprint's own html — `<!doctype html>` … `demo` — not
the app shell.

## 5. a page's route is the shell; a page's files are the blueprint

The page tab lives at `/pages/<id>` in the address bar; the iframe it holds asks
for `/pages/<id>/`. The slash is the whole difference, and it is what keeps the
tab bar on screen when a page url is reloaded.

```bash
curl -s http://localhost:8600/pages/demo > /tmp/pages-demo-noslash
curl -s http://localhost:8600/ > /tmp/pages-shell
cmp -s /tmp/pages-demo-noslash /tmp/pages-shell && echo "same as the shell" || echo "DIFFERENT"
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8600/pages/demo
```

Expected: `same as the shell` and `200 text/html; charset=utf-8` — `/pages/demo`
(no slash) is the SPA route, so the frontend gets the shell and can render the
tab; `/pages/demo/` is the blueprint itself.

## 6. unknown paths fall back to the app shell (SPA routing)

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8600/nope
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8600/pages/not-a-blueprint/
```

Expected: both `200 text/html; charset=utf-8` — the shell, not a 404.

## 7. traversal and favicon

```bash
curl -s --path-as-is -o /dev/null -w '%{http_code}\n' 'http://localhost:8600/../etc/passwd'
curl -s --path-as-is -o /dev/null -w '%{http_code}\n' 'http://localhost:8600/..%2f..%2fetc%2fpasswd'
curl -s --path-as-is -o /dev/null -w '%{http_code}\n' 'http://localhost:8600/pages/../etc/passwd'
curl -s --path-as-is -o /dev/null -w '%{http_code}\n' 'http://localhost:8600/pages/..%2f..%2fetc%2fpasswd'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8600/favicon.ico
```

Expected: `403`, `403`, `403`, `403`, `404` — nothing outside the root in play is
ever served, and the pages root is guarded exactly like the assets root.

## 8. teardown

```bash
pkill -f 'serve-web.*--port 8600'
rm -rf /tmp/web-serve-pages /tmp/pages-demo-noslash /tmp/pages-shell
```

# Test: core-web-serve

The web service is the frontend's file server: it serves the assets in `workspace/web/`
and generates `/config.js` with the addresses the launcher chose. This case covers it
from the user's point of view — the browser gets the app, and the app gets working
addresses to call.

Source of truth for behaviour and CLI: `workspace/web/server/main.go` (Go).
`atoms/web.yaml` declares the frontend; the server is its runtime part, same atom.

## Setup

```bash
cd workspace/web/server && go build -o /tmp/engineer-web . && /tmp/engineer-web 8600 \
  --root "$(cd .. && pwd)" \
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
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8600/vendor/dompurify.js
```

Expected: `200 text/javascript; charset=utf-8`, `200 text/css; charset=utf-8`,
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

## 4. unknown paths fall back to the app shell (SPA routing)

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8600/nope
```

Expected: `200 text/html; charset=utf-8` — the shell, not a 404.

## 5. traversal and favicon

```bash
curl -s --path-as-is -o /dev/null -w '%{http_code}\n' 'http://localhost:8600/../etc/passwd'
curl -s --path-as-is -o /dev/null -w '%{http_code}\n' 'http://localhost:8600/..%2f..%2fetc%2fpasswd'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8600/favicon.ico
```

Expected: `403`, `403`, `404` — nothing outside `--root` is ever served.

## 6. teardown

```bash
pkill -f 'engineer-web 8600'
```

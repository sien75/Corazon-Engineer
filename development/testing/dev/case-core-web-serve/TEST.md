# Test: core-web-serve

The web service is the frontend's file server **and the one door a folder comes in
by**. It serves the app itself (`index.html`, `app.js`, …) from `--assets`, and
`/agent/<sessionId>/` from the blueprint directory of the project that session
belongs to — the session is resolved to its project and slug through log, and the
project to a folder through log — so the URL carries the conversation while the
page is shared by every agent of that blueprint. It has no project root of its own
any more: `POST /project/add` is where a folder becomes a project (it checks for
`engineer.yaml` and hands it to log).
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

# a scratch project: one blueprint page, and the log rows that map the session to
# it. The data home is the program's, not the project's.
SCRATCH=/tmp/web-serve-root
HOME_DIR=/tmp/web-serve-home
rm -rf "$SCRATCH" "$HOME_DIR"
mkdir -p "$SCRATCH/.agents/blueprints/demo" "$HOME_DIR"
printf 'project: demo-project\n' > "$SCRATCH/engineer.yaml"
printf '<!doctype html>\n<html><head><title>Demo</title></head><body>demo</body></html>\n' \
  > "$SCRATCH/.agents/blueprints/demo/index.html"
printf '# demo\n' > "$SCRATCH/.agents/blueprints/demo/README.md"

/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 8961 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8961/log/project/list -d '{}' && break
  sleep 1
done
curl -s -o /dev/null -X POST http://localhost:8961/log/project/add \
  -H 'Content-Type: application/yaml' --data-binary "path: $SCRATCH"
PROJECT=$(curl -s -X POST http://localhost:8961/log/project/list \
  | awk '$1=="projectId:" {print $2}' | head -1)
curl -s -o /dev/null -X POST http://localhost:8961/log/session/upsert \
  -H 'Content-Type: application/yaml' \
  --data-binary "$(printf 'sessionId: s_demo\nkind: sub\nprojectId: %s\nblueprint: demo' "$PROJECT")"
# a session with no blueprint: no page at all
curl -s -o /dev/null -X POST http://localhost:8961/log/session/upsert \
  -H 'Content-Type: application/yaml' --data-binary $'sessionId: s_noblueprint\nkind: sub'

/tmp/engineer serve-web --bind 127.0.0.1 --port 8960 \
  --assets "$(cd workspace/web && pwd)" \
  --static http://localhost:8962 --ai http://localhost:8963 --log http://localhost:8961 &
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
export const ENGINEER = {"static":"http://localhost:8962","ai":"http://localhost:8963","log":"http://localhost:8961"};
export default ENGINEER;
```

i.e. the three `--static` / `--ai` / `--log` values, in that key order, exported as
an ES module (nothing is written to `window`). The frontend and every blueprint page
get them with `import { ENGINEER } from "/config.js"`, which is also the check that
the file is a module and not a classic script: a `<script src="/config.js">` would
fail to parse it.

## 4. /agent/ is the second root: a session id resolves to its project's blueprint

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8960/agent/s_demo/
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8960/agent/s_demo/README.md
curl -s http://localhost:8960/agent/s_demo/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8960/agent/s_noblueprint/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8960/agent/s_nobody/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8960/agent/demo/
```

Expected: `200 text/html; charset=utf-8` for the session (the trailing slash
resolves to the blueprint's `index.html`), `200 text/markdown; charset=utf-8` for
its README, and the body is the blueprint's html — `<!doctype html>` … `demo` —
not the app shell. `s_noblueprint` is `404` (a session with no page), `s_nobody`
is `404` (no row), `/agent/demo/` is `404` — a slug is not an address.

## 5. routes are the shell; an agent's blueprint is the page

The shell has routes of its own — `/`, `/new`, `/project/<id>/new`,
`/session/<id>` — and none of them is on disk. The shell answers anything it does
not have on disk, which is what keeps the tab bar on screen when a route is
reloaded.

```bash
curl -s http://localhost:8960/session/s_demo > /tmp/route-shell
curl -s http://localhost:8960/ > /tmp/root-shell
cmp -s /tmp/route-shell /tmp/root-shell && echo "same as the shell" || echo "DIFFERENT"
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8960/project/p_0123456789ab/new
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8960/agent/s_demo
```

Expected: `same as the shell`, `200 text/html; charset=utf-8` for the project
route, and `404` for the slashless `/agent/...` — `/agent/...` is not an SPA
route: the blueprint either has the file or it does not, and falling back to the
shell would draw the shell inside the page's own frame.

## 6. /project/add is the one door a folder comes in by

```bash
curl -s -o /dev/null -w 'GET %{http_code}\n' http://localhost:8960/project/add
curl -s -o /tmp/add-notdir.out -w 'POST dir %{http_code}\n' -X POST http://localhost:8960/project/add \
  -H 'Content-Type: application/yaml' --data-binary 'path: /tmp'
grep -o 'not an engineer project' /tmp/add-notdir.out
curl -s -o /tmp/add-nofolder.out -w 'POST missing %{http_code}\n' -X POST http://localhost:8960/project/add \
  -H 'Content-Type: application/yaml' --data-binary 'path: /tmp/there-is-no-such-folder'
grep -o 'no such folder' /tmp/add-nofolder.out
curl -s -X POST http://localhost:8960/project/add \
  -H 'Content-Type: application/yaml' --data-binary "path: $SCRATCH"
```

Expected: `GET 405` (the route is a write, not a page — it must not fall through
to the shell); `POST dir 400` with `not an engineer project` (a folder without
`engineer.yaml` is refused where the disk is read); `POST missing 400` with
`no such folder`; and the last call returns the project row — `projectId`,
`path: /tmp/web-serve-root`, `name: demo-project`, `visible: true`.

## 7. unknown paths fall back to the app shell (SPA routing) — except /agent/

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8960/nope
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8960/agent/not-an-agent/
```

Expected: `200 text/html; charset=utf-8` for `/nope` (the shell), `404` for an
unknown session — there is no page to draw there.

## 8. traversal and favicon

```bash
curl -s --path-as-is -o /dev/null -w '%{http_code}\n' 'http://localhost:8960/../etc/passwd'
curl -s --path-as-is -o /dev/null -w '%{http_code}\n' 'http://localhost:8960/..%2f..%2fetc%2fpasswd'
curl -s --path-as-is -o /dev/null -w '%{http_code}\n' 'http://localhost:8960/agent/../etc/passwd'
curl -s --path-as-is -o /dev/null -w '%{http_code}\n' 'http://localhost:8960/agent/..%2f..%2fetc%2fpasswd'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8960/favicon.ico
```

Expected: `403`, `403`, `404`, `404`, `404` — nothing outside the root in play is
ever served. The assets root rejects the escape with a 403; under `/agent/` the
first segment is read as a session id, and `..` is no session, so those two are a
404 (no page) rather than a 403 — the escape is still refused, and no file is
served.

## 9. teardown

```bash
pkill -f 'serve-.*--port 8960'
pkill -f 'serve-.*--port 8961'
rm -rf /tmp/web-serve-root /tmp/web-serve-home /tmp/route-shell /tmp/root-shell
rm -f /tmp/add-notdir.out /tmp/add-nofolder.out
```

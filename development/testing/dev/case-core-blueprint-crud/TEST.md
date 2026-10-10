# Test: core-blueprint-crud

Blueprint CRUD on the ai service. A blueprint is a **frontend resource**: a
directory `<project>/.agents/blueprints/<slug>/` with an `index.html` entry and
whatever files sit beside it. There is no discovery and no sqlite — the
directory listing is the whole truth, and the agent writes blueprints through the
same `save_blueprint` tool the API exposes. log and static are not involved.

## Setup

```bash
ROOTDIR="$PWD"
# Isolated scratch project root: the test must never touch the real .agents/blueprints
ROOT="$ROOTDIR/.engineer/.blueprint-test"
rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: blueprint-test\n' > "$ROOT/engineer.yaml"

# A scratch log service (the ai service refuses to start without a --log address;
# nothing here reads it back).
(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --root "$ROOT" --bind 127.0.0.1 --port 8554 \
  >/tmp/bp-log.log 2>&1 &

(cd workspace/ai && bun install && bun run src/main.ts \
  --bind 127.0.0.1 --port 8553 --root "$ROOT" --stub \
  --log http://localhost:8554 --static http://localhost:8502 \
  --agents "$ROOTDIR/agents/AGENTS.md" \
  >/tmp/bp-ai.log 2>&1 &)

AI=http://localhost:8553
BPS="$ROOT/.agents/blueprints"

for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $AI/ai/blueprint/list -d '{}' && break
  sleep 1
done
```

`--stub` disables model calls; the blueprint API never needs a model, so the
whole case runs offline.

## 1. save creates a blueprint — a directory with an html entry

```bash
curl -s -X POST $AI/ai/blueprint/save -d 'name: Payment Logs
files:
  - path: index.html
    content: |
      <!doctype html>
      <html lang="zh"><head><meta charset="utf-8"><title>Payment logs</title></head>
      <body><div id="app"></div><script src="./app.js"></script></body></html>
  - path: app.js
    content: |
      document.getElementById("app").textContent = "hello";
'
ls "$BPS" "$BPS/payment-logs"
```

Expected: 200; `blueprint.id: payment-logs` (the slug of the name is the
directory name), `blueprint.name: Payment logs` (read back from the
`index.html` `<title>`, not echoed from the request), `blueprint.entry:
index.html`, `blueprint.files` **sorted** — `[app.js, index.html]` — and both
files exist on disk with the content that was sent.

## 2. list returns it; a directory without index.html is not a blueprint

```bash
mkdir -p "$BPS/notes-only" && printf 'just notes\n' > "$BPS/notes-only/readme.txt"
curl -s -X POST $AI/ai/blueprint/list -d '{}'
mkdir -p "$BPS/no-title"
printf '<!doctype html><body>bare</body>' > "$BPS/no-title/index.html"
curl -s -X POST $AI/ai/blueprint/list -d '{}'
```

Expected: the first list holds only `payment-logs` (`notes-only` has no
`index.html`, so it is skipped); the second holds `no-title` as well, with
`blueprint.name: no-title` — a missing `<title>` falls back to the id.

## 3. save with an id writes into the existing directory

```bash
curl -s -X POST $AI/ai/blueprint/save -d 'id: payment-logs
name: Payment logs
files:
  - path: style.css
    content: |
      body { margin: 0; }
'
ls "$BPS/payment-logs"
```

Expected: 200; the response still says `blueprint.id: payment-logs` and its
`files` now lists all three (`app.js`, `index.html`, `style.css`) — a save
**writes, it does not delete**: files not mentioned in the request stay.

## 4. error branches

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/blueprint/save -d 'files: []'
curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/blueprint/save -d 'name: x
files: []'
curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/blueprint/save -d 'name: x
files:
  - path: style.css
    content: "body{}"'
curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/blueprint/save -d 'name: x
files:
  - path: ../evil.html
    content: x'
curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/blueprint/save -d 'name: x
files:
  - path: /etc/passwd
    content: x'
curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/blueprint/save -d 'id: nope
name: x
files:
  - path: index.html
    content: x'
curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/blueprint/delete -d 'id: ""'
curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/blueprint/delete -d 'id: nope'
ls "$BPS"
```

Expected, in order: 400 (no name), 400 (no files), 400 (files without
`index.html`), 400 (`..` escapes the directory), 400 (absolute path), 404
(save into an id that does not exist), 400, 404 — each body carrying
`error.code` `bad_request` / `not_found` to match. `ls` shows `payment-logs` still
there and **no** directory was created by the failed saves.

## 5. delete removes the directory, assets included

```bash
curl -s -X POST $AI/ai/blueprint/delete -d 'id: payment-logs'
ls "$BPS"
curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/blueprint/delete -d 'id: payment-logs'
```

Expected: 200 `blueprintId: payment-logs`; `$BPS` no longer holds
`payment-logs` (the whole directory, `app.js` and `style.css` included, is gone);
a second delete is 404.

## 6. files survive a restart, and no sqlite is involved

```bash
pkill -f 'main.ts.*--port 8553'

(cd workspace/ai && bun run src/main.ts \
  --bind 127.0.0.1 --port 8553 --root "$ROOT" --stub \
  --log http://localhost:8554 --static http://localhost:8502 \
  --agents "$ROOTDIR/agents/AGENTS.md" \
  >/tmp/bp-ai.log 2>&1 &)
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $AI/ai/blueprint/list -d '{}' && break
  sleep 1
done

curl -s -X POST $AI/ai/blueprint/list -d '{}'
ls "$ROOT/.engineer" 2>/dev/null || echo "(no .engineer data written)"
```

Expected: `no-title` is still listed after the restart — blueprints live in the
project, not in memory — and the ai service wrote **no blueprint table**: the
`.engineer` directory may hold the skill sqlite (created for skills) but nothing
about blueprints.

## Teardown

```bash
pkill -f 'main.ts.*--port 8553'
pkill -f '/tmp/engineer serve-log --root .*blueprint-test'
rm -rf "$ROOTDIR/.engineer/.blueprint-test"
```

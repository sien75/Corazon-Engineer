# Test: core-agent-instantiate

A **blueprint** is the class and an **agent** is the instance. Instantiating means
`POST /ai/new` with a `blueprint` slug: the service checks the two required files,
records the session's role **and its blueprint** in log, and appends the
prototype's README plus the path of its directory last in that session's system
prompt. `README.md` and `index.html` are required; every other file — css, js,
images, subdirectories — is served from the same directory by relative URL.

Nothing is copied. The web server serves `.agents/blueprints/<slug>/` itself at
`/agent/<sessionId>/`, resolving the session to its slug through log, so the URL
carries the conversation and every agent made from one blueprint shares one page.

This case is HTTP-level: no browser is needed to see the mapping, the two
required files, or the serving path. What the pane shows is covered by
`case-core-web-serve` (`/agent/` root) and by the shell's own routing.

Note: every API speaks YAML (`application/yaml`) — request and response bodies
below are YAML. Run with proxies off (`NO_PROXY='*' no_proxy='*'`).

## Setup

```bash
# Reclaim a previous run of this case (a leftover service is what makes a wrong
# answer look like a dead one).
HOME_DIR="$PWD/.engineer/.agent-test/home"
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 8970 8971 8972; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

# A scratch project: one blueprint with its own assets, one missing index.html.
ROOT="$PWD/.engineer/.agent-test"
# The engineer home (log's database, the project board). Not a project.
HOME_DIR="$ROOT/home"
rm -rf "$ROOT" && mkdir -p "$HOME_DIR" "$ROOT/.agents/blueprints/demo/assets" "$ROOT/.agents/blueprints/broken"
printf 'project: agent-test\n' > "$ROOT/engineer.yaml"
cat > "$ROOT/.agents/blueprints/demo/README.md" <<'MD'
# Demo agent

You drive a tiny page. Its one button asks you to say hello.
MD
cat > "$ROOT/.agents/blueprints/demo/index.html" <<'HTML'
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Demo Agent</title>
<link rel="stylesheet" href="./style.css"></head>
<body><h1>demo</h1><engineer-chat></engineer-chat></body></html>
HTML
# the page's own files: served from the same directory, by relative URL
printf 'h1 { color: rebeccapurple; }\n' > "$ROOT/.agents/blueprints/demo/style.css"
printf '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>\n' \
  > "$ROOT/.agents/blueprints/demo/assets/logo.svg"
# missing index.html: instantiation still refuses it
cp "$ROOT/.agents/blueprints/demo/README.md" "$ROOT/.agents/blueprints/broken/README.md"
# exactly one <engineer-chat>: zero and two are both refused
mkdir -p "$ROOT/.agents/blueprints/nochat" "$ROOT/.agents/blueprints/twochats"
cp "$ROOT/.agents/blueprints/demo/README.md" "$ROOT/.agents/blueprints/nochat/README.md"
cp "$ROOT/.agents/blueprints/demo/README.md" "$ROOT/.agents/blueprints/twochats/README.md"
printf '<!doctype html><h1>no chat</h1>\n' > "$ROOT/.agents/blueprints/nochat/index.html"
printf '<!doctype html><h1>two</h1><engineer-chat></engineer-chat><engineer-chat></engineer-chat>\n' \
  > "$ROOT/.agents/blueprints/twochats/index.html"

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 8970 &
# The scratch project goes on the board, and every ai/new below names it.
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8970/log/project/list -d '{}' && break
  sleep 1
done
curl -s -X POST http://localhost:8970/log/project/add -H 'Content-Type: application/yaml' \
  --data-binary "path: $ROOT" | awk '$1=="projectId:" {print $2}' > "$ROOT/.project"
PROJECT=$(cat "$ROOT/.project")
# ai is the Bun service, not a subcommand of the Go binary (--stub: no model calls)
(cd workspace/ai && bun run src/main.ts --bind 127.0.0.1 --port 8971 --home "$HOME_DIR" \
  --log http://localhost:8970 --static http://localhost:8972 --agents "$(cd ../../agents && pwd)" --stub &)
/tmp/engineer serve-web --bind 127.0.0.1 --port 8972 \
  --assets "$(cd workspace/web && pwd)" \
  --static http://localhost:8972 --ai http://localhost:8971 --log http://localhost:8970 &

for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8971/ai/new \
    -H 'Content-Type: application/yaml' --data-binary "$(printf 'projectId: %s\nblueprint: demo' "$PROJECT")" && break
  sleep 1
done
```

Expected: three startup lines (`engineer log: …`, `engineer ai: serving on …`,
`engineer web: http://localhost:8972`).

## 1. instantiation records the mapping and copies nothing

```bash
SESSION=$(curl -s -X POST http://localhost:8971/ai/new \
  -H 'Content-Type: application/yaml' --data-binary "$(printf 'projectId: %s\nblueprint: demo' "$PROJECT")" | sed -n 's/^sessionId: //p')
echo "session=$SESSION"
curl -s -X POST http://localhost:8970/log/session/detail \
  -H 'Content-Type: application/yaml' --data-binary $"sessionId: $SESSION"
ls "$ROOT/.engineer/agents" 2>/dev/null || echo "no per-agent copies"
```

Expected: `session=s_<hex>`; the session row carries `kind: sub`, `blueprint: demo`
and the scratch project's `projectId`; `no per-agent copies` — the page is never
copied.

## 2. /agent/<sessionId>/ serves the blueprint directory

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "http://localhost:8972/agent/$SESSION/"
curl -s "http://localhost:8972/agent/$SESSION/" | head -3
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8972/agent/$SESSION/README.md"
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8972/agent/demo/"
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8972/agent/$SESSION"
```

Expected: `200 text/html; charset=utf-8` and the blueprint's own
`<!doctype html>` … `<h1>demo</h1>`; `200` for the README; **404** for
`/agent/demo/` (a slug is not an address — the URL carries the session) and **404**
for the slashless form. The page's own files come from the same directory:

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "http://localhost:8972/agent/$SESSION/style.css"
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "http://localhost:8972/agent/$SESSION/assets/logo.svg"
```

Expected: `200 text/css; charset=utf-8` and `200 image/svg+xml`.

## 3. the blueprint is the page: an edit is live

```bash
sed -i.bak 's/<h1>demo<\/h1>/<h1>demo edited<\/h1>/' "$ROOT/.agents/blueprints/demo/index.html"
curl -s "http://localhost:8972/agent/$SESSION/" | grep -c 'demo edited'
mv "$ROOT/.agents/blueprints/demo/index.html.bak" "$ROOT/.agents/blueprints/demo/index.html"
```

Expected: `1`, with no reload of anything but the URL — there is no copy to keep
in step.

## 4. a second agent of one blueprint is the same page

```bash
SESSION2=$(curl -s -X POST http://localhost:8971/ai/new \
  -H 'Content-Type: application/yaml' --data-binary "$(printf 'projectId: %s\nblueprint: demo' "$PROJECT")" | sed -n 's/^sessionId: //p')
curl -s "http://localhost:8972/agent/$SESSION2/" | grep -c '<h1>demo</h1>'
ls "$ROOT/.engineer/agents" 2>/dev/null || echo "still no copies"
```

Expected: `1` and `still no copies` — two sessions, one page, two URLs.

## 5. the two required files and the one chat are enforced (400, not a page)

```bash
curl -s -o /tmp/broken.out -w '%{http_code}\n' -X POST http://localhost:8971/ai/new \
  -H 'Content-Type: application/yaml' --data-binary "$(printf 'projectId: %s\nblueprint: broken' "$PROJECT")"
cat /tmp/broken.out
curl -s -o /tmp/nochat.out -w '%{http_code}\n' -X POST http://localhost:8971/ai/new \
  -H 'Content-Type: application/yaml' --data-binary "$(printf 'projectId: %s\nblueprint: nochat' "$PROJECT")"
grep -o 'exactly one <engineer-chat>, found 0' /tmp/nochat.out
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8971/ai/new \
  -H 'Content-Type: application/yaml' --data-binary "$(printf 'projectId: %s\nblueprint: twochats' "$PROJECT")"
```

Expected: `400`, `error.code: bad_request`, a message naming `index.html`; then
`400` + `exactly one <engineer-chat>, found 0`; then `400` for the two-chat page.
Nothing is created in any case: no session row, no page.

## 6. unknown / malformed / missing blueprint

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8971/ai/new \
  -H 'Content-Type: application/yaml' --data-binary "$(printf 'projectId: %s\nblueprint: nope' "$PROJECT")"
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8971/ai/new \
  -H 'Content-Type: application/yaml' --data-binary "$(printf 'projectId: %s\nblueprint: ../etc' "$PROJECT")"
```

Expected: `400` and `400` — a bad slug never reaches the filesystem.

## 7. deleting an agent leaves the page alone

```bash
curl -s -X POST http://localhost:8971/ai/delete \
  -H 'Content-Type: application/yaml' --data-binary $"id: $SESSION" > /dev/null
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8972/agent/$SESSION/"
test -f "$ROOT/.agents/blueprints/demo/index.html" && echo "blueprint untouched"
```

Expected: `200` and `blueprint untouched` — the page belongs to the blueprint and
is shared, so deleting one conversation does not delete it. (Deleting the
conversation's records — `session-delete` — is what removes the session row; then
the URL is a 404. That is `case-core-session-delete`.)

## 8. teardown

```bash
for p in 8970 8971 8972; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
rm -rf "$ROOT" /tmp/broken.out
```

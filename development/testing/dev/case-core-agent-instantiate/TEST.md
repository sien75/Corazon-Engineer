# Test: core-agent-instantiate

A **blueprint** is the class and an **agent** is the instance. Instantiating means
`POST /ai/new` with a `blueprint` slug: the service copies the prototype's two
files (`.agents/blueprints/<slug>/{README.md,index.html}`) into
`.engineer/agents/<sessionId>/` and appends the copy's README last in that
session's system prompt. The web server serves that copy at
`/agent/<sessionId>/` — the prototype directory is never exposed — so the URL
carries no slug and two agents of one blueprint never collide.

This case is HTTP-level: no browser is needed to see the copy, the enforcement of
the two-file rule, or the serving path. What the pane shows is covered by
`case-core-web-serve` (`/agent/` root) and by the shell's own routing.

Note: every API speaks YAML (`application/yaml`) — request and response bodies
below are YAML. Run with proxies off (`NO_PROXY='*' no_proxy='*'`).

## Setup

```bash
# Reclaim a previous run of this case (a leftover service is what makes a wrong
# answer look like a dead one).
for p in 8970 8971 8972; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

# A scratch project: two blueprints, one of them breaking the two-file rule.
ROOT="$PWD/.engineer/.agent-test"
rm -rf "$ROOT" && mkdir -p "$ROOT/.agents/blueprints/demo" "$ROOT/.agents/blueprints/stray"
printf 'project: agent-test\n' > "$ROOT/engineer.yaml"
cat > "$ROOT/.agents/blueprints/demo/README.md" <<'MD'
# Demo agent

You drive a tiny page. Its one button asks you to say hello.
MD
cat > "$ROOT/.agents/blueprints/demo/index.html" <<'HTML'
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Demo Agent</title></head>
<body><h1>demo</h1></body></html>
HTML
cp "$ROOT/.agents/blueprints/demo/README.md" "$ROOT/.agents/blueprints/stray/README.md"
cp "$ROOT/.agents/blueprints/demo/index.html" "$ROOT/.agents/blueprints/stray/index.html"
printf 'body{}\n' > "$ROOT/.agents/blueprints/stray/style.css"   # the third file that must be refused

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log    --root "$ROOT" --bind 127.0.0.1 --port 8970 &
/tmp/engineer serve-ai     --root "$ROOT" --bind 127.0.0.1 --port 8971 \
  --log http://localhost:8970 --static http://localhost:8972 --agents "$PWD/agents/AGENTS.md" --stub &
/tmp/engineer serve-web    --bind 127.0.0.1 --port 8972 \
  --assets "$(cd workspace/web && pwd)" --agents "$ROOT/.engineer/agents" \
  --static http://localhost:8972 --ai http://localhost:8971 --log http://localhost:8970 &

for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8971/ai/new -d 'blueprint: demo' && break
  sleep 1
done
```

Expected: three startup lines (`engineer log: …`, `engineer ai: serving on …`,
`engineer web: http://localhost:8972`).

## 1. instantiation copies the prototype's two files

```bash
SESSION=$(curl -s -X POST http://localhost:8971/ai/new \
  -H 'Content-Type: application/yaml' --data-binary $'blueprint: demo' | sed -n 's/^sessionId: //p')
echo "session=$SESSION"
ls "$ROOT/.engineer/agents/$SESSION"
cmp -s "$ROOT/.agents/blueprints/demo/README.md" "$ROOT/.engineer/agents/$SESSION/README.md" && echo "readme copied"
cmp -s "$ROOT/.agents/blueprints/demo/index.html" "$ROOT/.engineer/agents/$SESSION/index.html" && echo "html copied"
```

Expected: `session=s_<hex>`; the directory holds exactly `README.md` and
`index.html`; both `cmp` lines print their message.

## 2. the copy is what the web server serves, keyed by session id

```bash
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "http://localhost:8972/agent/$SESSION/"
curl -s "http://localhost:8972/agent/$SESSION/" | head -3
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8972/agent/$SESSION/README.md"
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8972/agent/demo/"
```

Expected: `200 text/html; charset=utf-8` and the agent's own
`<!doctype html>` … `<h1>demo</h1>`; `200` for the README; **404 or the app
shell** for `/agent/demo/` — a slug is not an address, and the prototype
directory is not served at all.

## 3. the agent keeps its copy: editing the prototype changes nothing

```bash
printf '\n# edited after the fact\n' >> "$ROOT/.agents/blueprints/demo/README.md"
grep -c 'edited after the fact' "$ROOT/.engineer/agents/$SESSION/README.md" || echo "agent copy unchanged"
curl -s "http://localhost:8972/agent/$SESSION/" | grep -c demo
```

Expected: `0` (the copy is untouched) and `1` — the served page is still the
agent's own.

## 4. a second agent of the same blueprint is a second copy

```bash
SESSION2=$(curl -s -X POST http://localhost:8971/ai/new \
  -H 'Content-Type: application/yaml' --data-binary $'blueprint: demo' | sed -n 's/^sessionId: //p')
ls "$ROOT/.engineer/agents" | sort
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8972/agent/$SESSION2/"
```

Expected: two `s_<hex>` directories, and `200` for the second one — two agents
never share a URL.

## 5. the two-file rule is enforced (400, not a copy)

```bash
curl -s -o /tmp/stray.out -w '%{http_code}\n' -X POST http://localhost:8971/ai/new \
  -H 'Content-Type: application/yaml' --data-binary $'blueprint: stray'
cat /tmp/stray.out
```

Expected: `400`, `error.code: bad_request`, and a message naming `style.css` —
nothing is copied.

## 6. unknown / malformed / missing blueprint

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8971/ai/new \
  -H 'Content-Type: application/yaml' --data-binary $'blueprint: nope'
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8971/ai/new \
  -H 'Content-Type: application/yaml' --data-binary $'blueprint: ../etc'
```

Expected: `400` and `400` — a bad slug never reaches the filesystem.

## 7. deleting the agent deletes its copy

```bash
curl -s -X POST http://localhost:8971/ai/delete \
  -H 'Content-Type: application/yaml' --data-binary $"id: $SESSION" > /dev/null
ls "$ROOT/.engineer/agents"
curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:8972/agent/$SESSION/"
```

Expected: only `$SESSION2` is left, and the deleted agent's URL no longer serves
its page (the shell's fallback, i.e. `200 text/html` of the app — not the agent's
`<h1>demo</h1>`).

## 8. teardown

```bash
for p in 8970 8971 8972; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
rm -rf "$ROOT" /tmp/stray.out
```

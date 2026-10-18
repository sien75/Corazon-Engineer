# Test: core-blueprint-crud

A blueprint is a **directory** `<project>/.agents/blueprints/<slug>/` holding
**exactly two files and nothing else**: `README.md` (what the agent instantiated
from it is, and what its UI is for — this becomes that agent's opening context)
and `index.html` (the UI itself, which must be self-contained). There is no
discovery and no database — the directory listing is the whole truth, and static
lists and reads it. The agent creates, updates and deletes blueprints with its own
file tools; the ai service has no CRUD interface, its only blueprint involvement is
**instantiation** (covered by `case-core-agent-instantiate`).

## Setup

```bash
ROOTDIR="$PWD"
# Isolated scratch project root: the test must never touch the real .agents/blueprints
ROOT="$ROOTDIR/.engineer/.blueprint-test"
rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: blueprint-test\n' > "$ROOT/engineer.yaml"

# A scratch static service rooted at $ROOT — the read side.
# Guard first: with an empty $ROOT the pattern below degrades to
# "serve-log --root " and kills every service on the machine —
# including the one running the agent. Fail loudly instead.
: "${ROOT:?this case must set ROOT before reclaiming}"
# Reclaim a previous run of this case. A leftover service keeps serving its
# old database (or silently stops this run's from binding, so the frontend
# talks to the other case's services) — and the failure that causes looks
# like a wrong answer, not a dead service. This happens before, not after.
pkill -f "serve-log --root $ROOT" 2>/dev/null || true
pkill -f "serve-static --root $ROOT" 2>/dev/null || true
pkill -f "main.ts.*--root $ROOT" 2>/dev/null || true
for p in 8820; do pkill -f "serve-web.*--port $p" 2>/dev/null || true; done
sleep 1

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-static --root "$ROOT" --bind 127.0.0.1 --port 8820 \
  >/tmp/bp-static.log 2>&1 &

STATIC=http://localhost:8820
BPS="$ROOT/.agents/blueprints"

for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $STATIC/static/query -d '{}' && break
  sleep 1
done
```

## 1. a blueprint is those two files

```bash
mkdir -p "$BPS/payment-logs"
printf '# Payment logs\n\nYou drive a page that lists payment logs.\n' \
  > "$BPS/payment-logs/README.md"
printf '<!doctype html>\n<html lang="zh"><head><meta charset="utf-8"><title>Payment logs</title></head>\n<body><div id="app"></div><script>document.getElementById("app").textContent = "hello";</script></body></html>\n' \
  > "$BPS/payment-logs/index.html"

curl -s -X POST $STATIC/static/query -d '{}' | grep -A3 '^blueprints:'
curl -s -X POST $STATIC/static/query-detail -d 'type: blueprint
id: .agents/blueprints/payment-logs/index.html' | head -3
curl -s -X POST $STATIC/static/query-detail -d 'type: blueprint
id: .agents/blueprints/payment-logs/README.md'
```

Expected: `blueprints` holds exactly the two files of that directory —
`.agents/blueprints/payment-logs/README.md` and `.../index.html`; the detail call
returns each of them verbatim under `blueprint`, the README as markdown. The
`<title>` is the display name; the README's first line is the description. There
is no manifest and no metadata beyond those two files.

## 2. the two-file rule is decided at instantiation, not by static

```bash
printf 'body { margin: 0; }\n' > "$BPS/payment-logs/style.css"
curl -s -X POST $STATIC/static/query -d '{}' | grep -A4 '^blueprints:'
```

Expected: static lists all three files — it lists the tree and does not judge what
a blueprint is. The rule is enforced where the copy is made: `POST /ai/new` with
`blueprint: payment-logs` answers **400 `bad_request`** naming `style.css` and
copies nothing (see `case-core-agent-instantiate` step 5). Delete the extra file
before going on:

```bash
rm "$BPS/payment-logs/style.css"
```

## 3. an html-only directory still instantiates? no — it is refused

```bash
mkdir -p "$BPS/notes-only" && printf 'just notes\n' > "$BPS/notes-only/readme.txt"; touch "$BPS/notes-only/index.html"
curl -s -o /dev/null -w '%{http_code}\n' -X POST $STATIC/static/query-detail -d 'type: blueprint
id: .agents/blueprints/notes-only/README.md'
```

Expected: `404` — there is no `README.md`, and the instantiation path refuses the
directory for the same reason (`blueprint notes-only: README.md missing`). The
launcher still shows a row for it (it keys off `index.html`), with an empty
description; clicking it reports the 400 and nothing is created.

## 4. a save is a write, not a replace

```bash
printf '\n# more detail\n' >> "$BPS/payment-logs/README.md"
curl -s -X POST $STATIC/static/query-detail -d 'type: blueprint
id: .agents/blueprints/payment-logs/README.md' | grep -c 'more detail'
curl -s -X POST $STATIC/static/query-detail -d 'type: blueprint
id: .agents/blueprints/payment-logs/index.html' | head -2
```

Expected: `1`, and the html still comes back — writing one file beside the other
never removes it.

## 5. an instantiated agent keeps its own copy

```bash
mkdir -p "$ROOT/.engineer/agents/s_test"
cp "$BPS/payment-logs/README.md" "$BPS/payment-logs/index.html" "$ROOT/.engineer/agents/s_test/"
printf '\n# edited after instantiation\n' >> "$BPS/payment-logs/README.md"
grep -c 'edited after instantiation' "$ROOT/.engineer/agents/s_test/README.md" || echo "copy unchanged"
```

Expected: `copy unchanged` — the copy is the agent's, and editing the prototype
afterwards never reaches it. (`case-core-agent-instantiate` covers the copy being
made by the service; here it only has to stay put.)

## 6. delete is rm

```bash
rm -rf "$BPS/payment-logs" "$ROOT/.engineer/agents/s_test"
curl -s -X POST $STATIC/static/query -d '{}' | grep -A3 '^blueprints:'
```

Expected: `payment-logs` is gone, directory and files together; `notes-only`
remains.

## 7. there is no blueprint CRUD API

```bash
ls contracts/ai-blueprint* contracts/ai-skill-list* contracts/ai-skill-save* 2>/dev/null \
  || echo "(no blueprint / skill-crud contracts — the interfaces are gone)"
grep -l 'blueprint' contracts/ai-new.yaml >/dev/null && echo "(instantiation is ai-new's only blueprint involvement)"
```

Expected: no CRUD contract files; `ai-new` is the one place the ai service touches
a blueprint, and it only reads it to copy it.

## 8. static serves only what is registered

```bash
mkdir -p "$BPS/../skills/x" && printf -- '---\nname: x\n---\nbody\n' > "$BPS/../skills/x/SKILL.md"
curl -s -o /dev/null -w '%{http_code}\n' -X POST $STATIC/static/query-detail -d 'type: blueprint
id: .agents/blueprints/../skills/x/SKILL.md'
curl -s -X POST $STATIC/static/query-detail -d 'type: blueprint
id: .agents/blueprints/../skills/x/SKILL.md'
rm -rf "$BPS/../skills"
```

Expected: 400, and `error.message` says the id is a **skill** file, not a
blueprint: the path is cleaned before the type is judged, so a traversal cannot
be served under the wrong type. Reading the same file as `type: skill` is `200`.

## Teardown

```bash
pkill -f '/tmp/engineer serve-static --root .*blueprint-test'
rm -rf "$ROOTDIR/.engineer/.blueprint-test"
```

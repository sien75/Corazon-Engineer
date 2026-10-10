# Test: core-blueprint-crud

A blueprint is a **frontend resource**: a directory
`<project>/.agents/blueprints/<slug>/` with an `index.html` entry and whatever
files sit beside it. There is no discovery and no database — the directory
listing is the whole truth. static lists and reads them; the agent creates,
updates and deletes them with its own file tools. The ai service has no blueprint
interface at all.

## Setup

```bash
ROOTDIR="$PWD"
# Isolated scratch project root: the test must never touch the real .agents/blueprints
ROOT="$ROOTDIR/.engineer/.blueprint-test"
rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: blueprint-test\n' > "$ROOT/engineer.yaml"

# A scratch static service rooted at $ROOT — the read side.
(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-static --root "$ROOT" --bind 127.0.0.1 --port 8555 \
  >/tmp/bp-static.log 2>&1 &

STATIC=http://localhost:8555
BPS="$ROOT/.agents/blueprints"

for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $STATIC/static/query -d '{}' && break
  sleep 1
done
```

## 1. a blueprint is a directory with an html entry

```bash
mkdir -p "$BPS/payment-logs"
printf '<!doctype html>\n<html lang="zh"><head><meta charset="utf-8"><title>Payment logs</title></head>\n<body><div id="app"></div><script src="./app.js"></script></body></html>\n' \
  > "$BPS/payment-logs/index.html"
printf 'document.getElementById("app").textContent = "hello";\n' \
  > "$BPS/payment-logs/app.js"

curl -s -X POST $STATIC/static/query -d '{}' | grep -A3 '^blueprints:'
curl -s -X POST $STATIC/static/query-detail -d 'type: blueprint
id: .agents/blueprints/payment-logs/index.html'
```

Expected: `blueprints` holds both files of the directory (recursive listing) —
`.agents/blueprints/payment-logs/app.js` and `.../index.html`; the detail call
returns the `index.html` verbatim under `blueprint`. The `<title>` is the display
name; there is no manifest and no metadata beyond the document itself.

## 2. a directory without index.html is not a blueprint

```bash
mkdir -p "$BPS/notes-only" && printf 'just notes\n' > "$BPS/notes-only/readme.txt"
curl -s -X POST $STATIC/static/query -d '{}' | grep -A4 '^blueprints:'
```

Expected: `notes-only/readme.txt` is listed as a file (static lists the tree, it
does not judge what a page is), but the frontend only keeps directories that hold
an `index.html` — so the launcher shows `payment-logs` and not `notes-only`.

## 3. a save is a write, not a replace

```bash
printf 'body { margin: 0; }\n' > "$BPS/payment-logs/style.css"
curl -s -X POST $STATIC/static/query -d '{}' | grep -A5 '^blueprints:'
```

Expected: the listing now holds all three files. Writing one file beside the
others never removes them — that is the point of a directory, and the agent
edits files the same way it would in any project.

## 4. delete is rm

```bash
rm -rf "$BPS/payment-logs"
curl -s -X POST $STATIC/static/query -d '{}' | grep -A3 '^blueprints:'
```

Expected: `payment-logs` is gone, directory and assets together; `notes-only`
remains.

## 5. there is no blueprint API and no database

```bash
ls contracts/ai-blueprint* contracts/ai-skill-list* contracts/ai-skill-save* 2>/dev/null \
  || echo "(no blueprint / skill-crud contracts — the interfaces are gone)"
ls "$ROOT/.engineer" 2>/dev/null || echo "(no .engineer data written)"
```

Expected: no contract files (the interfaces were removed from the schema, which
`static/validate` enforces); `$ROOT/.engineer` holds nothing — blueprints are
files, and the ai service is not involved at all.

## 6. static serves only what is registered

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST $STATIC/static/query-detail -d 'type: blueprint
id: .agents/blueprints/../skills/x/SKILL.md'
```

Expected: 400 `bad_request` — the path cleans out of the registered type
directory.

## Teardown

```bash
pkill -f '/tmp/engineer serve-static --root .*blueprint-test'
rm -rf "$ROOTDIR/.engineer/.blueprint-test"
```

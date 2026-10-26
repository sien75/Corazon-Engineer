# Test: core-blueprint-crud

A blueprint is a **directory** `<project>/.agents/blueprints/<slug>/` with **two
required files**: `README.md` (what the agent instantiated from it is, and what its
UI is for — this becomes that agent's opening context) and `index.html` (the UI's
entry). Anything else in the directory belongs to the page and is served with it —
the directory *is* the page every agent made from it drives (see
`case-core-agent-instantiate`). There is no
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

# A scratch static service reading $ROOT's tree — the read side. static has no root
# any more: it takes a projectId per request and resolves the folder through log,
# so the case starts a small log too and registers the scratch project.
# Guard first: with an empty $HOME_DIR the pattern below degrades to
# "serve-log --home " and kills every service on the machine —
# including the one running the agent. Fail loudly instead.
HOME_DIR="$ROOT/home"
: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
# Reclaim a previous run of this case. A leftover service keeps serving its
# old database (or silently stops this run's from binding, so the frontend
# talks to the other case's services) — and the failure that causes looks
# like a wrong answer, not a dead service. This happens before, not after.
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 8820 8821; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 8821 \
  >/tmp/bp-log.log 2>&1 &
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8821/log/project/list -d '{}' && break
  sleep 1
done
curl -s -X POST http://localhost:8821/log/project/add -H 'Content-Type: application/yaml' \
  --data-binary "path: $ROOT" | awk '$1=="projectId:" {print $2}' > "$ROOT/.project"
PROJECT=$(cat "$ROOT/.project")
/tmp/engineer serve-static --log http://localhost:8821 --bind 127.0.0.1 --port 8820 \
  >/tmp/bp-static.log 2>&1 &

STATIC=http://localhost:8820
BPS="$ROOT/.agents/blueprints"

for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $STATIC/static/query \
    -H 'Content-Type: application/yaml' --data-binary "projectId: $PROJECT" && break
  sleep 1
done
```

## 1. a blueprint is its directory

```bash
mkdir -p "$BPS/payment-logs"
printf '# Payment logs\n\nYou drive a page that lists payment logs.\n' \
  > "$BPS/payment-logs/README.md"
printf '<!doctype html>\n<html lang="zh"><head><meta charset="utf-8"><title>Payment logs</title></head>\n<body><div id="app"></div><script>document.getElementById("app").textContent = "hello";</script></body></html>\n' \
  > "$BPS/payment-logs/index.html"

curl -s -X POST $STATIC/static/query -H 'Content-Type: application/yaml' --data-binary "projectId: $PROJECT" | grep -A3 '^blueprints:'
curl -s -X POST $STATIC/static/query-detail -H 'Content-Type: application/yaml' --data-binary @- <<YAML | head -3
projectId: $PROJECT
type: blueprint
id: .agents/blueprints/payment-logs/index.html
YAML
curl -s -X POST $STATIC/static/query-detail -H 'Content-Type: application/yaml' --data-binary @- <<YAML
projectId: $PROJECT
type: blueprint
id: .agents/blueprints/payment-logs/README.md
YAML
```

Expected: `blueprints` holds the files of that directory —
`.agents/blueprints/payment-logs/README.md` and `.../index.html`; the detail call
returns each of them verbatim under `blueprint`, the README as markdown. The
`<title>` is the display name; the README's first line is the description. There
is no manifest and no metadata beyond the files themselves.

## 2. the page's own files are part of the blueprint

```bash
printf 'body { margin: 0; }\n' > "$BPS/payment-logs/style.css"
curl -s -X POST $STATIC/static/query -H 'Content-Type: application/yaml' --data-binary "projectId: $PROJECT" | grep -A4 '^blueprints:'
```

Expected: static lists all three files — it lists the tree and does not judge what
a blueprint is. Extra files are not an error: instantiation copies the whole
directory, so `style.css` ships with the page and `index.html` can link
`./style.css` (see `case-core-agent-instantiate` step 1–2).

## 3. an html-only directory still instantiates? no — it is refused

```bash
mkdir -p "$BPS/notes-only" && printf 'just notes\n' > "$BPS/notes-only/readme.txt"; touch "$BPS/notes-only/index.html"
curl -s -o /dev/null -w '%{http_code}\n' -X POST $STATIC/static/query-detail -H 'Content-Type: application/yaml' --data-binary @- <<YAML
projectId: $PROJECT
type: blueprint
id: .agents/blueprints/notes-only/README.md
YAML
```

Expected: `404` — there is no `README.md`, and the instantiation path refuses the
directory for the same reason (`blueprint notes-only: README.md missing`). The
launcher still shows a row for it (it keys off `index.html`), with an empty
description; clicking it reports the 400 and nothing is created.

## 4. a save is a write, not a replace

```bash
printf '\n# more detail\n' >> "$BPS/payment-logs/README.md"
curl -s -X POST $STATIC/static/query-detail -H 'Content-Type: application/yaml' --data-binary @- <<YAML | grep -c 'more detail'
projectId: $PROJECT
type: blueprint
id: .agents/blueprints/payment-logs/README.md
YAML
curl -s -X POST $STATIC/static/query-detail -H 'Content-Type: application/yaml' --data-binary @- <<YAML | head -2
projectId: $PROJECT
type: blueprint
id: .agents/blueprints/payment-logs/index.html
YAML
```

Expected: `1`, and the html still comes back — writing one file beside the other
never removes it.

## 5. the prototype is the page — an edit is what agents see

```bash
printf '\n# edited after instantiation\n' >> "$BPS/payment-logs/README.md"
curl -s -X POST $STATIC/static/query-detail -H 'Content-Type: application/yaml' --data-binary @- <<YAML | grep -c 'edited after instantiation'
projectId: $PROJECT
type: blueprint
id: .agents/blueprints/payment-logs/README.md
YAML
ls "$ROOT/.engineer/agents" 2>/dev/null || echo "no per-agent copies at all"
```

Expected: `1`, and `no per-agent copies at all` — writing a blueprint is writing
the page every agent made from it serves; there is no second copy to keep in
step. (`case-core-agent-instantiate` covers the serving side.)

## 6. delete is rm

```bash
rm -rf "$BPS/payment-logs"
curl -s -X POST $STATIC/static/query -H 'Content-Type: application/yaml' --data-binary "projectId: $PROJECT" | grep -A3 '^blueprints:'
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
a blueprint, and it only reads it and records its slug — the page is never copied.

## 8. static serves only what is registered

```bash
mkdir -p "$BPS/../skills/x" && printf -- '---\nname: x\n---\nbody\n' > "$BPS/../skills/x/SKILL.md"
curl -s -o /dev/null -w '%{http_code}\n' -X POST $STATIC/static/query-detail -H 'Content-Type: application/yaml' --data-binary @- <<YAML
projectId: $PROJECT
type: blueprint
id: .agents/blueprints/../skills/x/SKILL.md
YAML
curl -s -X POST $STATIC/static/query-detail -H 'Content-Type: application/yaml' --data-binary @- <<YAML
projectId: $PROJECT
type: blueprint
id: .agents/blueprints/../skills/x/SKILL.md
YAML
rm -rf "$BPS/../skills"
```

Expected: 400, and `error.message` says the id is a **skill** file, not a
blueprint: the path is cleaned before the type is judged, so a traversal cannot
be served under the wrong type. Reading the same file as `type: skill` is `200`.

## Teardown

```bash
pkill -f 'serve-static --log http://localhost:8821'
rm -rf "$ROOTDIR/.engineer/.blueprint-test"
```
projectId: $PROJECT
type: blueprint
id: .agents/blueprints/payment-logs/index.html
YAML

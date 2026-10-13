# Test: core-skill-crud

Skills are plain files. A **kept** skill is `<project>/.agents/skills/<slug>/SKILL.md`;
a **candidate** is `<project>/.engineer/suggested-skills/<slug>.md`. There is no
skill database and no CRUD API: static lists and reads the files, and the agent
changes them with its file tools. This case exercises the read side (static) and
the file side directly. Running a skill is not an interface: the shell opens a
session and the skill's text goes in as the first message, so there is nothing
here to call either.

## Setup

```bash
ROOTDIR="$PWD"
# Isolated scratch project root: the test must never touch the real .agents/skills
# or .engineer.
ROOT="$ROOTDIR/.engineer/.skill-crud"
rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: skill-crud\n' > "$ROOT/engineer.yaml"

# A scratch log service (ai refuses to start without --log) and a scratch static
# service rooted at $ROOT, so the read side reads this scratch tree and not the
# real project.
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
for p in 8850 8851 8852; do pkill -f "serve-web.*--port $p" 2>/dev/null || true; done
sleep 1

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --root "$ROOT" --bind 127.0.0.1 --port 8851 \
  >/tmp/skill-crud-log.log 2>&1 &
/tmp/engineer serve-static --root "$ROOT" --bind 127.0.0.1 --port 8852 \
  >/tmp/skill-crud-static.log 2>&1 &

(cd workspace/ai && bun install && bun run src/main.ts \
  --bind 127.0.0.1 --port 8850 --root "$ROOT" --stub \
  --log http://localhost:8851 --static http://localhost:8852 \
  --agents "$ROOTDIR/agents/AGENTS.md" \
  >/tmp/skill-crud-ai.log 2>&1 &)

AI=http://localhost:8850
STATIC=http://localhost:8852
SKILLS="$ROOT/.agents/skills"
SUGGESTED="$ROOT/.engineer/suggested-skills"

# wait for static and ai before asking: the blocks below run back to back
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $STATIC/static/query -d '{}' &&
    curl -s -o /dev/null -m 2 -X POST $AI/ai/new -d '{}' && break
  sleep 1
done
```

`--stub` disables model calls (the echo stub); nothing here needs a model.

## 1. a kept skill is a directory with one file

```bash
mkdir -p "$SKILLS/payment-logs"
printf -- '---\nname: Payment logs\ndescription: check payment-service logs in dev for the last 30 minutes\n---\ncheck payment-service logs in dev for the last 30 minutes\n' \
  > "$SKILLS/payment-logs/SKILL.md"

curl -s -X POST $STATIC/static/query -d '{}' | grep -A3 '^skills:'
curl -s -X POST $STATIC/static/query-detail -d 'type: skill
id: .agents/skills/payment-logs/SKILL.md'
```

Expected: `skills` holds `.agents/skills/payment-logs/SKILL.md`; the detail call
echoes the type and id and returns the file body verbatim under `skill` —
frontmatter (`name`, `description`) then the text. The id is the directory name,
`name` is the display name, `description` is the first line of the text.

## 2. a candidate is one file; promoting it is a move

```bash
mkdir -p "$SUGGESTED"
printf -- '---\nname: Payment logs\ndescription: check payment-service logs in dev\n---\ncheck payment-service logs in dev\n' \
  > "$SUGGESTED/payment-logs.md"

curl -s -X POST $STATIC/static/query -d '{}' | grep -A3 '^suggested-skills:'
curl -s -X POST $STATIC/static/query-detail -d 'type: suggested-skill
id: .engineer/suggested-skills/payment-logs.md'
```

Expected: the candidate is listed under `suggested-skills` (and not under
`skills`); the detail call returns it under `suggested-skill`.

Promotion is the mv the agent runs when the user says to keep it:

```bash
mkdir -p "$SKILLS/dev-logs"
mv "$SUGGESTED/payment-logs.md" "$SKILLS/dev-logs/SKILL.md"

curl -s -X POST $STATIC/static/query -d '{}' | grep -A3 '^skills:'
curl -s -X POST $STATIC/static/query -d '{}' | grep -A2 '^suggested-skills:'
```

Expected: `skills` now holds both `payment-logs/SKILL.md` and
`dev-logs/SKILL.md`; `suggested-skills` is empty.

## 3. delete is rm

```bash
rm -rf "$SKILLS/payment-logs"
curl -s -X POST $STATIC/static/query -d '{}' | grep -A3 '^skills:'
```

Expected: `payment-logs` is gone from the listing; `dev-logs` remains.

## 4. static is read-only and does not read private data

```bash
# no delete interface exists at all
curl -s -o /dev/null -w '%{http_code}\n' -X POST $STATIC/static/delete -d '{}'
# the whole .engineer dir is private: only the registered type dir is readable
curl -s -X POST $STATIC/static/query-detail -d 'type: suggested-skill
id: .engineer/engineer.db'
# an escape inside the registered dir cleans out of it and is refused
curl -s -X POST $STATIC/static/query-detail -d 'type: suggested-skill
id: .engineer/suggested-skills/../engineer.db'
```

Expected: 404 `unknown endpoint`; then 400 `bad_request` twice (the id is not
under the registered type dir). The ai service's private data is never served.

## 5. the ai service has no skill CRUD and no database

```bash
for p in list save delete ignore refresh run; do
  printf "%-8s " "$p"
  curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/skill/$p -d '{}'
done
ls "$ROOT/.engineer" 2>/dev/null
```

Expected: every one of `/ai/skill/save|delete|ignore|list|refresh|run` is 404
`unknown endpoint` — running a skill is not an interface at all (the shell opens a
session and sends the text). `$ROOT/.engineer` holds no `skill.db` — the ai
service keeps no skill database.

## 6. files survive a restart

```bash
pkill -f 'main.ts.*--port 8850'

(cd workspace/ai && bun run src/main.ts \
  --bind 127.0.0.1 --port 8850 --root "$ROOT" --stub \
  --log http://localhost:8851 --static http://localhost:8852 \
  --agents "$ROOTDIR/agents/AGENTS.md" \
  >/tmp/skill-crud-ai.log 2>&1 &)
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $AI/ai/new -d '{}' && break
  sleep 1
done

curl -s -X POST $STATIC/static/query -d '{}' | grep -A3 '^skills:'
```

Expected: `dev-logs/SKILL.md` is still listed — skills live in the project files,
not in process memory.

## Teardown

```bash
pkill -f 'main.ts.*--port 8850'
pkill -f '/tmp/engineer serve-log --root .*skill-crud'
pkill -f '/tmp/engineer serve-static --root .*skill-crud'
```

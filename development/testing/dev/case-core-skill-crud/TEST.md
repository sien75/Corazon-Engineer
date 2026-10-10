# Test: core-skill-crud

Skills are plain files. A **kept** skill is `<project>/.agents/skills/<slug>/SKILL.md`;
a **candidate** is `<project>/.engineer/suggested-skills/<slug>.md`. There is no
skill database and no CRUD API: static lists and reads the files, and the agent
changes them with its file tools. This case exercises the read side (static) and
the file side directly; `/ai/skill/run` still opens a session from a skill.

## Setup

```bash
ROOTDIR="$PWD"
# Isolated scratch project root: the test must never touch the real .agents/skills
# or .engineer.
ROOT="$ROOTDIR/.engineer/.skill-test"
rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: skill-test\n' > "$ROOT/engineer.yaml"

# A scratch log service (ai refuses to start without --log) and a scratch static
# service rooted at $ROOT, so the read side reads this scratch tree and not the
# real project.
(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --root "$ROOT" --bind 127.0.0.1 --port 8544 \
  >/tmp/skill-crud-log.log 2>&1 &
/tmp/engineer serve-static --root "$ROOT" --bind 127.0.0.1 --port 8545 \
  >/tmp/skill-crud-static.log 2>&1 &

(cd workspace/ai && bun install && bun run src/main.ts \
  --bind 127.0.0.1 --port 8543 --root "$ROOT" --stub \
  --log http://localhost:8544 --static http://localhost:8545 \
  --agents "$ROOTDIR/agents/AGENTS.md" \
  >/tmp/skill-crud-ai.log 2>&1 &)

AI=http://localhost:8543
STATIC=http://localhost:8545
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
for p in list save delete ignore refresh; do
  printf "%-8s " "$p"
  curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/skill/$p -d '{}'
done
ls "$ROOT/.engineer" 2>/dev/null
```

Expected: `/ai/skill/save|delete|ignore|list` are 404 `unknown endpoint`;
`refresh` is **kept** (200, the manual scan trigger). `$ROOT/.engineer` holds no
`skill.db` — the ai service keeps no skill database.

## 6. /ai/skill/run still instantiates a skill

```bash
curl -s -X POST $AI/ai/skill/run -d 'skillId: dev-logs'
curl -s -X POST $AI/ai/skill/run -d 'skillId: nope' -o /dev/null -w '%{http_code}\n'
curl -s -X POST $AI/ai/skill/run -d 'text: an ad-hoc skill'
```

Expected: 200 with a fresh `sessionId` and the echoed `skillId`; a missing skill
is 404; an ad-hoc text runs without a `skillId`.

## 7. files survive a restart

```bash
pkill -f 'main.ts.*--port 8543'

(cd workspace/ai && bun run src/main.ts \
  --bind 127.0.0.1 --port 8543 --root "$ROOT" --stub \
  --log http://localhost:8544 --static http://localhost:8545 \
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
pkill -f 'main.ts.*--port 8543'
pkill -f '/tmp/engineer serve-log --root .*skill-test'
pkill -f '/tmp/engineer serve-static --root .*skill-test'
```

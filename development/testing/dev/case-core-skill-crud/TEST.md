# Test: core-skill-crud

Skill CRUD on the ai service. A skill is one piece of text. A **custom** skill — a
skill the user keeps — is a **file**: `<project>/.agents/skills/<slug>/SKILL.md`.
The ai service's own sqlite (`.engineer/skill.db`) holds only the suggested
candidates and the scan bookkeeping. log and static are not involved.

## Setup

```bash
ROOTDIR="$PWD"
# Isolated scratch project root: the test must never touch the real .agents/skills
# or .engineer/skill.db
ROOT="$ROOTDIR/.engineer/.skill-test"
rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: skill-test\n' > "$ROOT/engineer.yaml"

# A scratch log service. The ai service refuses to start without a --log address,
# so it must be given one — and it must not be the real one. Nothing reads it back.
(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --root "$ROOT" --bind 127.0.0.1 --port 8544 \
  >/tmp/skill-crud-log.log 2>&1 &

(cd workspace/ai && bun install && bun run src/main.ts \
  --bind 127.0.0.1 --port 8543 --root "$ROOT" --stub \
  --log http://localhost:8544 --static http://localhost:8502 \
  --agents "$ROOTDIR/agents/AGENTS.md" \
  >/tmp/skill-crud-ai.log 2>&1 &)

AI=http://localhost:8543
SKILLS="$ROOT/.agents/skills"

# wait for it before asking: the blocks below run back to back
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $AI/ai/skill/list -d '{}' && break
  sleep 1
done
```

`--stub` disables model calls (the echo stub); the skill API never needs a model,
so the whole case runs offline. `--static` is only a line in the system prompt —
the service itself never calls it, and under `--stub` it is not used at all.

## 1. save creates a custom skill — a file in the project

```bash
curl -s -X POST $AI/ai/skill/save -d 'name: Payment logs
text: check payment-service logs in dev for the last 30 minutes'
cat "$SKILLS/payment-logs/SKILL.md"
```

Expected: 200; `skill.id: payment-logs`, `skill.source: custom`,
`skill.status: active`, `createdAt` == `updatedAt`. The `cat` prints exactly

```
---
name: Payment logs
description: check payment-service logs in dev for the last 30 minutes
---
check payment-service logs in dev for the last 30 minutes
```

— the id is the directory name, `name` is the display name, `description` is the
first line of the text, and the body is the skill text itself.

## 2. list returns it, filters are honored

```bash
curl -s -X POST $AI/ai/skill/list -d ''
curl -s -X POST $AI/ai/skill/list -d 'source: custom'
curl -s -X POST $AI/ai/skill/list -d 'source: suggested'
curl -s -X POST $AI/ai/skill/list -d 'status: ignored'
```

Expected: 200; the skill appears in the unfiltered list and in `source: custom`;
`source: suggested` and `status: ignored` are empty.

## 3. save with an id updates in place

```bash
TID=$(curl -s -X POST $AI/ai/skill/list -d 'source: custom' \
  | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["skills"][0]["id"])')
curl -s -X POST $AI/ai/skill/save -d "id: $TID
name: Payment logs (dev)
text: check payment-service logs in dev"
ls "$SKILLS"
cat "$SKILLS/$TID/SKILL.md"
```

Expected: 200; same `id`, new `name` / `text`, `source` still `custom`,
`createdAt` unchanged, `updatedAt` newer. `ls` shows **one** directory — a rename
rewrites the file in place, the directory (the id) does not move — and the file
carries the new name and the shorter text (its derived `description` shrinks too).

## 4. error branches

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/skill/save -d 'text: no name'
curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/skill/save -d 'name: x
text: "   "'
curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/skill/save -d 'id: t_nope
name: x
text: y'
curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/skill/delete -d 'id: ""'
curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/skill/delete -d 'id: t_nope'
curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/skill/ignore -d 'id: t_nope'
# a custom skill is a file: it has no ignored state, so ignore must not touch it
curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/skill/ignore -d "id: $TID"
curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/skill/list -d 'source: bogus'
curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/skill/list -d 'status: bogus'
```

Expected, in order: 400, 400, 404, 400, 404, 404, 404, 400, 400 — each with body
`error.code` `bad_request` / `not_found` matching the status.

## 5. a suggested candidate: ignore, restore, accept

Suggested candidates are the only thing the sqlite still holds, so seed one there
directly (a scan needs a model; this case runs under `--stub`):

```bash
SKILLDB="$ROOT/.engineer/skill.db" bun -e '
import { Database } from "bun:sqlite";
const db = new Database(process.env.SKILLDB);
db.query(`INSERT INTO skill (id, name, text, source, status, evidence, created_at, updated_at)
  VALUES (?, ?, ?, "suggested", "active", ?, ?, ?)`)
  .run("t_seeded", "Payment logs", "check payment-service logs in dev",
       "{}", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z");'

curl -s -X POST $AI/ai/skill/list -d 'source: suggested'
curl -s -X POST $AI/ai/skill/ignore -d 'id: t_seeded'
curl -s -X POST $AI/ai/skill/list -d 'status: ignored'
curl -s -X POST $AI/ai/skill/ignore -d 'id: t_seeded
ignored: false'
curl -s -X POST $AI/ai/skill/list -d 'source: suggested
status: active'
```

Expected: it is listed as `source: suggested`; after the first ignore
`skill.status: ignored` and it shows up under `status: ignored` instead of
`status: active`; after `ignored: false` it is an active suggestion again.

Accepting it copies the candidate into the project as a file:

```bash
curl -s -X POST $AI/ai/skill/save -d 'id: t_seeded
name: Seeded suggestion
text: check payment-service logs in dev'
curl -s -X POST $AI/ai/skill/list -d 'source: suggested'
curl -s -X POST $AI/ai/skill/list -d 'source: custom'
cat "$SKILLS/seeded-suggestion/SKILL.md"
SKILLDB="$ROOT/.engineer/skill.db" bun -e '
import { Database } from "bun:sqlite";
const db = new Database(process.env.SKILLDB);
console.log("candidate rows:", db.query("SELECT count(*) AS n FROM skill WHERE id = ?").get("t_seeded").n);'
```

Expected: the save answers 200 with `skill.id: seeded-suggestion` (the id became
the directory name — a suggested candidate id is not a path), the file exists with
that name and text, the suggested filter is now empty, the custom filter holds it,
and the candidate row is gone from sqlite (accepted, not duplicated).

## 6. delete removes the directory

```bash
curl -s -X POST $AI/ai/skill/delete -d "id: $TID"
ls "$SKILLS"
curl -s -o /dev/null -w '%{http_code}\n' -X POST $AI/ai/skill/delete -d "id: $TID"
```

Expected: 200 `skillId: $TID`; `$SKILLS` no longer holds `$TID` (the directory is
gone, not just the id forgotten); a second delete of the same id is 404.

## 7. files survive a restart

```bash
pkill -f 'main.ts.*--port 8543'

# relaunch the ai service exactly as in Setup, wait for it the same way
(cd workspace/ai && bun run src/main.ts \
  --bind 127.0.0.1 --port 8543 --root "$ROOT" --stub \
  --log http://localhost:8544 --static http://localhost:8502 \
  --agents "$ROOTDIR/agents/AGENTS.md" \
  >/tmp/skill-crud-ai.log 2>&1 &)
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $AI/ai/skill/list -d '{}' && break
  sleep 1
done

curl -s -X POST $AI/ai/skill/list -d 'source: custom'
SKILLDB="$ROOT/.engineer/skill.db" bun -e '
import { Database } from "bun:sqlite";
const db = new Database(process.env.SKILLDB);
console.log("rows in the skill table:", db.query("SELECT count(*) AS n FROM skill").get().n);'
```

Expected: the skill saved before the restart (`seeded-suggestion`) is still listed
— custom skills live in the project, not in memory — and the sqlite holds no
skill rows at all (the accepted candidate was dropped, and nothing was saved
back).

## Teardown

```bash
pkill -f 'main.ts.*--port 8543'
pkill -f '/tmp/engineer serve-log --root .*skill-test'
```

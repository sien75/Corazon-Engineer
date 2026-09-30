# Test: core-skill-crud

Skill CRUD on the ai service. A skill is one piece of text; the ai service owns it
in its own sqlite (`.engineer/skill.db`) — log and static are not involved.

## Setup

```bash
# Isolated scratch project root: the test must never touch the real .engineer/skill.db
rm -rf .engineer/.skill-test && mkdir -p .engineer/.skill-test
printf 'project: skill-test\n' > .engineer/.skill-test/engineer.yaml
cd workspace/ai && bun install && bun run src/main.ts --addr :7501 --root ../../.engineer/.skill-test --stub --agents ../../agents/AGENTS.md &
```

`--stub` disables model calls (the echo stub); the skill API never needs a model,
so the whole case runs offline.

## 1. save creates a custom skill

```bash
curl -s -X POST http://localhost:7501/ai/skill/save -d 'name: Payment logs
text: check payment-service logs in dev for the last 30 minutes'
```

Expected: 200; `skill.id` non-empty, `skill.source: custom`, `skill.status: active`,
`createdAt` == `updatedAt`.

## 2. list returns it, filters are honored

```bash
curl -s -X POST http://localhost:7501/ai/skill/list -d ''
curl -s -X POST http://localhost:7501/ai/skill/list -d 'source: custom'
curl -s -X POST http://localhost:7501/ai/skill/list -d 'source: suggested'
curl -s -X POST http://localhost:7501/ai/skill/list -d 'status: ignored'
```

Expected: 200; the skill appears in the unfiltered list and in `source: custom`;
`source: suggested` and `status: ignored` are empty.

## 3. save with an id updates in place

```bash
TID=$(curl -s -X POST http://localhost:7501/ai/skill/list -d 'source: custom' \
  | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["skills"][0]["id"])')
curl -s -X POST http://localhost:7501/ai/skill/save -d "id: $TID
name: Payment logs (dev)
text: check payment-service logs in dev"
```

Expected: 200; same `id`, new `name` / `text`, `source` still `custom`,
`createdAt` unchanged, `updatedAt` newer. `/ai/skill/list` shows one skill, not two.

## 4. error branches

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:7501/ai/skill/save -d 'text: no name'
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:7501/ai/skill/save -d 'name: x
text: "   "'
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:7501/ai/skill/save -d 'id: t_nope
name: x
text: y'
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:7501/ai/skill/delete -d 'id: ""'
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:7501/ai/skill/delete -d 'id: t_nope'
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:7501/ai/skill/ignore -d 'id: t_nope'
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:7501/ai/skill/list -d 'source: bogus'
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:7501/ai/skill/list -d 'status: bogus'
```

Expected, in order: 400, 400, 404, 400, 404, 404, 400, 400 — each with body
`error.code` `bad_request` / `not_found` matching the status.

## 5. ignore and restore

`ignored` is the suggested-skill reject flag; on a custom skill it is just a flag.

```bash
curl -s -X POST http://localhost:7501/ai/skill/ignore -d "id: $TID"
curl -s -X POST http://localhost:7501/ai/skill/list -d 'status: ignored'
curl -s -X POST http://localhost:7501/ai/skill/ignore -d "id: $TID
ignored: false"
curl -s -X POST http://localhost:7501/ai/skill/list -d 'status: active'
```

Expected: after the first call `skill.status: ignored`, and the skill is listed
under `status: ignored` (not under `status: active`); after `ignored: false` it
is `active` again.

## 6. delete

```bash
curl -s -X POST http://localhost:7501/ai/skill/delete -d "id: $TID"
curl -s -X POST http://localhost:7501/ai/skill/list -d ''
```

Expected: 200 `skillId: $TID`; afterwards the skill is gone and a second delete of
the same id is 404.

## 7. the store survives a restart

```bash
# kill and relaunch the ai service exactly as in Setup, then:
curl -s -X POST http://localhost:7501/ai/skill/save -d 'name: Keep me
text: keep me across a restart' > /dev/null
# restart again, then:
curl -s -X POST http://localhost:7501/ai/skill/list -d 'source: custom'
```

Expected: the skill saved before the restart is still listed — skills live in
`.engineer/skill.db`, not in memory.

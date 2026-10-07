# Test: core-skill-run

Instantiating a skill: it opens a session and hands the skill text to the model as
the first prompt. The client then subscribes to `ai-stream` with the returned
session id.

## Setup

```bash
rm -rf .engineer/.skill-test && mkdir -p .engineer/.skill-test
printf 'project: skill-test\n' > .engineer/.skill-test/engineer.yaml

# A scratch log service: the ai service refuses to start without a --log address.
(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --root .engineer/.skill-test --bind 127.0.0.1 --port 8546 \
  >/tmp/skill-run-log.log 2>&1 &

cd workspace/ai && bun install && bun run src/main.ts \
  --bind 127.0.0.1 --port 8545 --root ../../.engineer/.skill-test --stub \
  --log http://localhost:8546 --static http://localhost:8502 \
  --agents ../../agents/AGENTS.md &

# wait for it before asking: the blocks below run back to back
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8545/ai/skill/list -d '{}' && break
  sleep 1
done
```

`--stub` makes the model reply deterministic (echo stub), so the first prompt is
directly observable in the stream.

## 1. run a saved skill

```bash
TID=$(curl -s -X POST http://localhost:8545/ai/skill/save -d 'name: Payment logs
text: check payment-service logs in dev' \
  | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["skill"]["id"])')
RESP=$(curl -s -X POST http://localhost:8545/ai/skill/run -d "skillId: $TID")
echo "$RESP"
SID=$(echo "$RESP" | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])')
```

Expected: 200, a fresh non-empty `sessionId`, and `skillId` echoed back.

## 2. the skill text is the first prompt of that session

```bash
curl -s -N -X POST http://localhost:8545/ai/stream -d "id: $SID"
```

Expected: `agent_start`; a `message_update` whose `assistantMessageEvent.delta`
contains the skill text (`check payment-service logs in dev`) — the echo stub
quotes the prompt it received; then `agent_settled`, after which the stream
closes. The first user record of the session is exactly the skill text:

```bash
curl -s -X POST http://localhost:8546/log/session-detail -d "sessionId: $SID" \
  | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["messages"][0])'
```

Expected: `seq: 1`, `role: user`, `content` equal to the skill text. (Requires the
log service; skip this check when running without it.)

## 3. an ad-hoc skill (no saved skill)

```bash
RESP=$(curl -s -X POST http://localhost:8545/ai/skill/run -d 'name: ad hoc
text: summarize the open issues')
echo "$RESP"
```

Expected: 200, a `sessionId`, and **no** `skillId` — nothing was saved.

## 4. error branches

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8545/ai/skill/run -d 'name: no text'
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8545/ai/skill/run -d 'skillId: t_nope'
```

Expected: 400 (neither skillId nor text) and 404 (unknown skill) respectively.

## 5. each run is its own session

```bash
A=$(curl -s -X POST http://localhost:8545/ai/skill/run -d "skillId: $TID" | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])')
B=$(curl -s -X POST http://localhost:8545/ai/skill/run -d "skillId: $TID" | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])')
echo "$A $B"
```

Expected: two different session ids — running a skill always opens a new
conversation; the skill itself carries no state.

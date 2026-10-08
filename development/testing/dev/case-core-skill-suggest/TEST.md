# Test: core-skill-suggest

The suggested-skill scan. Every settled run (`agent_settled`) is queued; once 10
runs are waiting a scan fires as an independent async skill, mines the oldest 10,
and marks exactly the runs it consumed.

Run this case in `--stub` mode: the scan then derives a deterministic candidate
from the oldest run of the batch, so the mechanics (threshold, marking, ignore,
de-duplication) are all observable without a model.

**Run every block below in one shell**: `$AI` / `$SID` are set in one block and
used by the next.

## Setup

This case picks its own ports, in the 85xx range the dev stack uses — every
service must be told its address, so nothing falls back to a default nobody
chose. The tool's own services sit on `7501` / `7502` / `7503`, so test cases stay
out of that range. Override these to run two stacks side by side:

```bash
PORT="${AI_PORT:-8547}"   # e.g. AI_PORT=8557 for a second stack
LOG_PORT="${LOG_PORT:-8548}"
AI="http://localhost:$PORT"
rm -rf .engineer/.skill-test && mkdir -p .engineer/.skill-test
printf 'project: skill-test\n' > .engineer/.skill-test/engineer.yaml

# A log service of its own: the ai service refuses to start without a --log
# address, and the real one must not be handed to it — that is how this case once
# wrote its scratch data into the real record store.
(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --root .engineer/.skill-test --bind 127.0.0.1 --port "$LOG_PORT" \
  >/tmp/skill-suggest-log.log 2>&1 &

cd workspace/ai && bun install && bun run src/main.ts \
  --bind 127.0.0.1 --port "$PORT" --root ../../.engineer/.skill-test --stub \
  --log "http://localhost:$LOG_PORT" --static http://localhost:8502 \
  --agents ../../agents/AGENTS.md &

# wait for it before asking: the blocks below run back to back
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $AI/ai/skill/list -d '{}' && break
  sleep 1
done
```

## 1. ten settled runs produce exactly one suggestion

```bash
for i in $(seq 1 10); do
  if [ "$i" = "1" ]; then T="check the payment logs"; else T="run $i something else"; fi
  curl -s -X POST $AI/ai/skill/run -d "text: $T" > /dev/null
done
sleep 1
curl -s -X POST $AI/ai/skill/list -d 'source: suggested'
```

Expected: exactly one skill, `source: suggested`, `status: active`, `text:
check the payment logs` (the oldest run of the batch), and an `evidence` object
listing `runs` / `sessionIds` / `scannedAt`. Nothing is suggested before the
tenth run:

```bash
# with a fresh .skill-test root, after only 9 runs:
curl -s -X POST $AI/ai/skill/list -d 'source: suggested'
```

Expected: empty — the threshold has not been reached.

## 2. the consumed runs are marked, so they never come back

```bash
# drains any run left over from a scan that was still in flight
for i in $(seq 1 40); do
  OUT=$(curl -s -X POST $AI/ai/skill/refresh)
  echo "$OUT" | grep -q 'triggered: false' && break
  sleep 0.25
done
curl -s -X POST $AI/ai/skill/refresh
curl -s -X POST $AI/ai/skill/list -d 'source: suggested'
```

Expected: `refresh` reports `triggered: false, scanned: 0` — nothing is pending,
because the 10 runs were marked as summarized. The suggested list still holds
exactly one skill: scanning the same runs twice would otherwise duplicate it.

## 3. ignore removes it from the active suggestions

```bash
SID=$(curl -s -X POST $AI/ai/skill/list -d 'source: suggested' \
  | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["skills"][0]["id"])')
curl -s -X POST $AI/ai/skill/ignore -d "id: $SID"
curl -s -X POST $AI/ai/skill/list -d 'source: suggested
status: active'
curl -s -X POST $AI/ai/skill/list -d 'source: suggested'
```

Expected: the skill becomes `status: ignored`; the active filter is now empty,
while the unfiltered list still returns it (ignored skills are kept, not deleted).

## 4. an ignored skill is never suggested again

```bash
for i in $(seq 1 10); do
  if [ "$i" = "1" ]; then T="check the payment logs"; else T="later $i other work"; fi
  curl -s -X POST $AI/ai/skill/run -d "text: $T" > /dev/null
done
sleep 1
for i in $(seq 1 40); do
  OUT=$(curl -s -X POST $AI/ai/skill/refresh)
  echo "$OUT" | grep -q 'triggered: false' && break
  sleep 0.25
done
curl -s -X POST $AI/ai/skill/list -d 'source: suggested'
```

Expected: still exactly one suggested skill, the ignored one. The second batch
would produce the same candidate text (`check the payment logs`), but known skills
— including ignored ones — are sent to the scan as "do not propose again", and
the code side drops an exact name/text match. No new active suggestion appears.

## 5. saving a suggested skill accepts it

```bash
read -r SID TEXT <<<"$(curl -s -X POST $AI/ai/skill/list -d 'source: suggested' \
  | python3 -c 'import sys,yaml;s=yaml.safe_load(sys.stdin)["skills"][0];print(s["id"],s["text"])')"
curl -s -X POST $AI/ai/skill/ignore -d "id: $SID
ignored: false" > /dev/null
# text is required by the contract: id + name alone is rejected
curl -s -X POST $AI/ai/skill/save -d "id: $SID
name: Payment logs"
# repeat the candidate's text to accept it as-is
curl -s -X POST $AI/ai/skill/save -d "id: $SID
name: Payment logs
text: $TEXT"
curl -s -X POST $AI/ai/skill/list -d 'source: suggested'
curl -s -X POST $AI/ai/skill/list -d 'source: custom'
ls .engineer/.skill-test/.agents/skills
```

Expected: un-ignoring makes it active again; the save without `text` answers 400
`bad_request` `name and text required`; the save with `id` + `name` + `text` moves
the skill out of `source: suggested` into `source: custom` (status `active`) —
that is how the user says "keep this one". The unfiltered suggested list no longer
holds it, and the suggested filter is empty. Accepting writes the skill into the
project: `.agents/skills/payment-logs/SKILL.md` appears (the id becomes the
directory name), with the candidate's text as its body.

## 6. a scan never blocks a conversation

```bash
curl -s -X POST $AI/ai/skill/run -d 'text: hello while scanning' > /dev/null
curl -s -N -X POST $AI/ai/stream -d "id: $(curl -s -X POST $AI/ai/skill/run -d 'text: stream me' | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])')"
```

Expected: normal `agent_start` → `message_update` → `agent_settled` while scans
happen; the scan runs in its own async skill and never touches a user session.

## Notes

- The queue holds runs, not messages: one `agent_settled` = one entry. A steered
  prompt stays inside the same run.
- The run text a scan sees is user turns plus assistant prose only — tool calls
  and tool results are excluded (they are also what would blow the context up).
- When a batch does not fit the model context, the scan drops the newest run and
  retries (10 → 9 → …); the dropped run stays pending for the next scan.

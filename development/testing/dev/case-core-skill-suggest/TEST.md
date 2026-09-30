# Test: core-skill-suggest

The suggested-skill scan. Every settled run (`agent_settled`) is queued; once 10
runs are waiting a scan fires as an independent async skill, mines the oldest 10,
and marks exactly the runs it consumed.

Run this case in `--stub` mode: the scan then derives a deterministic candidate
from the oldest run of the batch, so the mechanics (threshold, marking, ignore,
de-duplication) are all observable without a model.

## Setup

```bash
rm -rf .engineer/.skill-test && mkdir -p .engineer/.skill-test
printf 'project: skill-test\n' > .engineer/.skill-test/engineer.yaml
cd workspace/ai && bun install && bun run src/main.ts --addr :7501 --root ../../.engineer/.skill-test --stub --agents ../../agents/AGENTS.md &
```

## 1. ten settled runs produce exactly one suggestion

```bash
for i in $(seq 1 10); do
  if [ "$i" = "1" ]; then T="check the payment logs"; else T="run $i something else"; fi
  curl -s -X POST http://localhost:7501/ai/skill/run -d "text: $T" > /dev/null
done
sleep 1
curl -s -X POST http://localhost:7501/ai/skill/list -d 'source: suggested'
```

Expected: exactly one skill, `source: suggested`, `status: active`, `text:
check the payment logs` (the oldest run of the batch), and an `evidence` object
listing `runs` / `sessionIds` / `scannedAt`. Nothing is suggested before the
tenth run:

```bash
# with a fresh .skill-test root, after only 9 runs:
curl -s -X POST http://localhost:7501/ai/skill/list -d 'source: suggested'
```

Expected: empty — the threshold has not been reached.

## 2. the consumed runs are marked, so they never come back

```bash
# drains any run left over from a scan that was still in flight
for i in $(seq 1 40); do
  OUT=$(curl -s -X POST http://localhost:7501/ai/skill/refresh)
  echo "$OUT" | grep -q 'triggered: false' && break
  sleep 0.25
done
curl -s -X POST http://localhost:7501/ai/skill/refresh
curl -s -X POST http://localhost:7501/ai/skill/list -d 'source: suggested'
```

Expected: `refresh` reports `triggered: false, scanned: 0` — nothing is pending,
because the 10 runs were marked as summarized. The suggested list still holds
exactly one skill: scanning the same runs twice would otherwise duplicate it.

## 3. ignore removes it from the active suggestions

```bash
SID=$(curl -s -X POST http://localhost:7501/ai/skill/list -d 'source: suggested' \
  | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["skills"][0]["id"])')
curl -s -X POST http://localhost:7501/ai/skill/ignore -d "id: $SID"
curl -s -X POST http://localhost:7501/ai/skill/list -d 'source: suggested
status: active'
curl -s -X POST http://localhost:7501/ai/skill/list -d 'source: suggested'
```

Expected: the skill becomes `status: ignored`; the active filter is now empty,
while the unfiltered list still returns it (ignored skills are kept, not deleted).

## 4. an ignored skill is never suggested again

```bash
for i in $(seq 1 10); do
  if [ "$i" = "1" ]; then T="check the payment logs"; else T="later $i other work"; fi
  curl -s -X POST http://localhost:7501/ai/skill/run -d "text: $T" > /dev/null
done
sleep 1
for i in $(seq 1 40); do
  OUT=$(curl -s -X POST http://localhost:7501/ai/skill/refresh)
  echo "$OUT" | grep -q 'triggered: false' && break
  sleep 0.25
done
curl -s -X POST http://localhost:7501/ai/skill/list -d 'source: suggested'
```

Expected: still exactly one suggested skill, the ignored one. The second batch
would produce the same candidate text (`check the payment logs`), but known skills
— including ignored ones — are sent to the scan as "do not propose again", and
the code side drops an exact name/text match. No new active suggestion appears.

## 5. saving a suggested skill accepts it

```bash
curl -s -X POST http://localhost:7501/ai/skill/ignore -d "id: $SID
ignored: false" > /dev/null
curl -s -X POST http://localhost:7501/ai/skill/save -d "id: $SID
name: Payment logs"
# text is required by the contract; repeat it to accept as-is:
curl -s -X POST http://localhost:7501/ai/skill/list -d 'source: suggested'
curl -s -X POST http://localhost:7501/ai/skill/list -d 'source: custom'
```

Expected: saving a suggested skill by id moves it out of `source: suggested` into
`source: custom` (status `active`) — that is how the user says "keep this one".
(A save without `text` is 400; repeat the candidate's text to accept it as-is.)

## 6. a scan never blocks a conversation

```bash
curl -s -X POST http://localhost:7501/ai/skill/run -d 'text: hello while scanning' > /dev/null
curl -s -N -X POST http://localhost:7501/ai/stream -d "id: $(curl -s -X POST http://localhost:7501/ai/skill/run -d 'text: stream me' | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])')"
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

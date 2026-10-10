# Test: core-skill-suggest

The suggested-skill scan. Every settled run (`agent_settled`) is queued in
`.engineer/skill-scan.json`; once **30** runs are waiting a scan fires as an
independent async task, mines the **oldest 10**, and drops exactly the runs it
consumed. Candidates are written as files under `.engineer/suggested-skills/`.

Discovery is deliberately restrained: 30 runs is about a working day of real
use, and the scan prompt still asks for a capable the same kind of work appearing
in **three different runs** — a one-off specific operation must never become a
skill.

Run this case in `--stub` mode: the scan then derives a deterministic candidate
from the oldest run of the batch, so the mechanics (threshold, marking,
de-duplication) are all observable without a model.

**Run every block below in one shell**: `$AI` is set in one block and used by the
next.

## Setup

This case picks its own ports, in the 85xx range the dev stack uses — every
service must be told its address, so nothing falls back to a default nobody
chose. The tool's own services sit on `7501` / `7502` / `7503`, so test cases stay
out of that range. Override these to run two stacks side by side:

```bash
PORT="${AI_PORT:-8547}"   # e.g. AI_PORT=8557 for a second stack
LOG_PORT="${LOG_PORT:-8548}"
AI="http://localhost:$PORT"
ROOT="$(pwd)/.engineer/.skill-test"
rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: skill-test\n' > "$ROOT/engineer.yaml"

# A log service of its own: the ai service refuses to start without a --log
# address, and the real one must not be handed to it.
(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --root "$ROOT" --bind 127.0.0.1 --port "$LOG_PORT" \
  >/tmp/skill-suggest-log.log 2>&1 &

(cd workspace/ai && bun install && bun run src/main.ts \
  --bind 127.0.0.1 --port "$PORT" --root "$ROOT" --stub \
  --log "http://localhost:$LOG_PORT" --static http://localhost:8502 \
  --agents ../../agents/AGENTS.md &)

SUGGESTED="$ROOT/.engineer/suggested-skills"
SCAN="$ROOT/.engineer/skill-scan.json"

for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $AI/ai/new -d '{}' && break
  sleep 1
done
```

## 1. twenty-nine runs are not enough; the thirtieth fires the scan

```bash
for i in $(seq 1 29); do
  curl -s -X POST $AI/ai/skill/run -d "text: run $i something else" > /dev/null
done
sleep 1
python3 -c 'import json;print("pending:", len(json.load(open("'"$SCAN"'"))["pending"]))'
ls "$SUGGESTED" 2>/dev/null || echo "(no candidates yet)"
```

Expected: `pending: 29` and no candidate files — the threshold (30) has not been
reached.

```bash
curl -s -X POST $AI/ai/skill/run -d 'text: check the payment logs' > /dev/null
sleep 2
ls "$SUGGESTED"
cat "$SUGGESTED"/*.md
python3 -c 'import json;print("pending:", len(json.load(open("'"$SCAN"'"))["pending"]))'
```

Expected: exactly one file, whose body is `run 1 something else` — the oldest run
of the batch (the stub derives the candidate from run 1). It is `source:
suggested` by virtue of where it lives. One scan reads at most the oldest 10, so
`pending: 20` remain queued for the next scan, not zero.

## 2. the consumed runs are dropped, so they never come back

```bash
# drain any scan still in flight
for i in $(seq 1 40); do
  OUT=$(curl -s -X POST $AI/ai/skill/refresh)
  echo "$OUT" | grep -q 'triggered: false' && break
  sleep 0.25
done
curl -s -X POST $AI/ai/skill/refresh
python3 -c 'import json;print("pending:", len(json.load(open("'"$SCAN"'"))["pending"]))'
ls "$SUGGESTED"
```

Expected: `refresh` reports `triggered: false, scanned: 0` — nothing is pending,
because every queued run was dropped as summarized (refresh forces a scan
regardless of the threshold, one 10-run batch at a time). The candidate directory
still holds exactly one file: scanning the same runs twice would otherwise
duplicate it.

## 3. a known candidate is never proposed again

```bash
for i in $(seq 1 10); do
  if [ "$i" = "1" ]; then T="run 1 something else"; else T="later $i other work"; fi
  curl -s -X POST $AI/ai/skill/run -d "text: $T" > /dev/null
done
sleep 1
for i in $(seq 1 40); do
  OUT=$(curl -s -X POST $AI/ai/skill/refresh)
  echo "$OUT" | grep -q 'triggered: false' && break
  sleep 0.25
done
ls "$SUGGESTED"
```

Expected: still exactly one candidate file. The second batch would propose
the same text (`run 1 something else`), but every known skill (kept or already
proposed) is sent to the scan as "do not propose again", and the code side drops
an exact name/text match.

## 4. promoting a candidate is a move

```bash
SLUG=$(basename "$SUGGESTED"/*.md .md)
mkdir -p "$ROOT/.agents/skills/$SLUG"
mv "$SUGGESTED"/*.md "$ROOT/.agents/skills/$SLUG/SKILL.md"
ls "$ROOT/.agents/skills/$SLUG"
ls "$SUGGESTED" 2>/dev/null || echo "(candidates empty)"
```

Expected: the file now lives at `.agents/skills/<slug>/SKILL.md` — the
kept-skill shape (a directory with one `SKILL.md`) — and the candidates directory
is empty. That is the whole of "keep this one"; there is no accept endpoint.

## 5. a scan never blocks a conversation, and there is no database

```bash
SID=$(curl -s -X POST $AI/ai/skill/run -d 'text: stream me' \
  | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])')
curl -s -N -X POST $AI/ai/stream -d "id: $SID" | head -c 400; echo
ls "$ROOT/.engineer"
```

Expected: normal `agent_start` → `message_update` → `agent_settled` while scans
happen; the scan runs in its own async task and never touches a user session.
`$ROOT/.engineer` holds `skill-scan.json` and `suggested-skills/` — **no
`skill.db`**.

## Notes

- The queue holds runs, not messages: one `agent_settled` = one entry. A steered
  prompt stays inside the same run.
- The run text a scan sees is user turns plus assistant prose only — tool calls
  and tool results are excluded (they are also what would blow the context up).
- When a batch does not fit the model context, the scan drops the newest run and
  retries (10 → 9 → …); the dropped run stays pending for the next scan.
- The scan reads its input from the queue file, not from log: the run text is
  captured at settle time, so a scan never races log writes.

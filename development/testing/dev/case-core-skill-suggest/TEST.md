# Test: core-skill-suggest

The suggested-skill scan. Every settled run (`agent_settled`) is queued in
`.engineer/skill-scan.json`; once **30** runs are waiting a scan fires as an
independent async task, mines the **oldest 10**, and drops exactly the runs it
consumed. Candidates are written as files under `.engineer/suggested-skills/`.

Discovery is deliberately restrained: 30 runs is about a working day of real
use, and the scan prompt still asks for a capable the same kind of work appearing
in **three different runs** — a one-off specific operation must never become a
skill.

There is **no manual trigger**: the pile of runs itself is the trigger, which is
what this case exercises. One scan consumes 10 runs, so after the first 30 runs
every further 10 runs fires the next scan.

Run this case in `--stub` mode: the scan then derives a deterministic candidate
from the oldest run of the batch, so the mechanics (threshold, batching, marking,
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

# run <text>: one settled run — the unit the queue counts. A run is just a
# session plus a prompt; in --stub mode it settles synchronously, so the queue
# is already updated when the call returns.
run() {
  SID=$(curl -s -X POST $AI/ai/new -d '{}' \
    | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])')
  curl -s -o /dev/null -X POST $AI/ai/ask -d "id: $SID
blocks:
  - type: text
    text: $1"
}

pending() { python3 -c 'import json;print(len(json.load(open("'"$SCAN"'"))["pending"]))'; }

# wait_pending <n>: the scan is its own async task, so poll until the queue settles
wait_pending() {
  for i in $(seq 1 40); do
    [ "$(pending)" = "$1" ] && return 0
    sleep 0.25
  done
  echo "queue stuck at $(pending), wanted $1"
  return 1
}
```

## 1. twenty-nine runs are not enough; the thirtieth fires the scan

```bash
for i in $(seq 1 29); do run "check payment-service logs in dev"; done
pending
ls "$SUGGESTED" 2>/dev/null || echo "(no candidates yet)"
```

Expected: `29` and no candidate files — the threshold (30) has not been reached.

```bash
run "check payment-service logs in dev"
wait_pending 20
ls "$SUGGESTED"
cat "$SUGGESTED"/*.md
pending
```

Expected: exactly one file, whose body is `check payment-service logs in dev` —
the oldest run of the batch (the stub derives the candidate from run 1), and whose
name is that first line cut to 24 characters (`check-payment-service-lo`). It is
`source: suggested` by virtue of where it lives. One scan reads at most the
oldest 10, so `20` remain queued for the next scan, not zero.

## 2. the consumed runs are dropped, and a known candidate is never proposed again

```bash
for i in $(seq 1 10); do run "check payment-service logs in dev"; done
wait_pending 20
ls "$SUGGESTED"
```

Expected: still exactly one candidate file, and the queue is back to `20`. The
ten consumed runs are gone (thirty minus the batch of ten), and the second batch
proposes the same text as the candidate that is already there — an existing
candidate is known, so it is dropped instead of written again. Scanning the same
runs twice can never duplicate a file.

## 3. promoting a candidate is a move

```bash
SLUG=$(basename "$SUGGESTED"/*.md .md)
mkdir -p "$ROOT/.agents/skills/$SLUG"
mv "$SUGGESTED"/*.md "$ROOT/.agents/skills/$SLUG/SKILL.md"
ls "$ROOT/.agents/skills/$SLUG"
ls "$SUGGESTED"
```

Expected: the file now lives at `.agents/skills/<slug>/SKILL.md` — the
kept-skill shape (a directory with one `SKILL.md`) — and the candidates directory
prints nothing: it is empty. That is the whole of "keep this one"; there is no
accept endpoint.

A kept skill is known too:

```bash
for i in $(seq 1 10); do run "check payment-service logs in dev"; done
wait_pending 20
ls "$SUGGESTED"
```

Expected: still nothing — the scan proposes the same text again, and it is
recognised as the skill the user just kept.

## 4. a scan never blocks a conversation, and there is no database

```bash
SID=$(curl -s -X POST $AI/ai/new -d '{}' \
  | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])')
curl -s -o /dev/null -X POST $AI/ai/ask -d "id: $SID
blocks:
  - type: text
    text: stream me"
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
- Runs pile up across sessions and across restarts; only a scan clears the queue.

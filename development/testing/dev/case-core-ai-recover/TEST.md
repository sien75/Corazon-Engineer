# Test: core-ai-recover

Recovering a conversation whose stored history is damaged.

Two defects are covered, both about the record stream between ai and log:

- **reading side** — `resume` replays history to the model verbatim. A record that
  never got written leaves either a tool result without the assistant that asked for
  it (an *orphan* result) or a tool call without its result; either way the provider
  rejects the whole request (`400 Messages with role 'tool' must be a response to a
  preceding message with 'tool_calls'`) and the session is wedged **forever**,
  because every prompt replays the same history. Resume must repair the history (in
  memory) before replaying it.
- **writing side** — `record()` was fire-and-forget with `.catch(() => {})`: no
  status check, no retry, no report. A transient log outage silently turned into a
  permanent, silent hole in the conversation. It must check the status, retry
  transient failures and report the ones that survive.

Source of truth: `workspace/ai/src/registry.ts` (`resume` / `build` /
`sanitizeHistory`) and `workspace/ai/src/recorder.ts` (`record`).

## Setup

The case runs against an isolated scratch project root — it must never touch the
real `.engineer/engineer.db`.

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.recover-test"
rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: recover-test\n' > "$ROOT/engineer.yaml"

(cd how-to/deploy/prod && go build -o /tmp/engineer .)

# the log service the crafted history is written to
/tmp/engineer serve-log --root "$ROOT" --addr :8521 >/tmp/recover-log.log 2>&1 &

# ai A — the real thing, against the real log service. Not --stub: the provider
# rejection this case is about can only happen with a real provider. Without one
# the service falls back to the echo stub, and section 2's provider check is
# reported as skipped instead (see the note at the end of Run).
ENGINEER_AI_DEBUG=/tmp/recover-ai-debug.log \
  bun run workspace/ai/src/main.ts --addr :8522 --root "$ROOT" \
  --log http://localhost:8521 --agents "$ROOTDIR/agents/AGENTS.md" \
  >/tmp/recover-ai.log 2>&1 &

# two fake log endpoints, so the writer can be driven off the happy path
cat > /tmp/recover-fake-log.py <<'EOF'
import sys, http.server
port, countfile, mode = int(sys.argv[1]), sys.argv[2], sys.argv[3]
n = 0
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        global n
        n += 1
        open(countfile, "w").write(str(n))
        self.rfile.read(int(self.headers.get("Content-Length") or 0))
        if mode == "flaky" and n <= 2:
            code, body = 500, b'error:\n  code: internal\n  message: boom\n'
        elif mode == "reject":
            code, body = 400, b'error:\n  code: bad_request\n  message: nope\n'
        else:
            code, body = 200, b'id: r%d\ncreatedAt: "2026-01-01T00:00:00Z"\n' % n
        self.send_response(code)
        self.send_header("Content-Type", "application/yaml")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *a): pass
http.server.HTTPServer(("127.0.0.1", port), H).serve_forever()
EOF
python3 /tmp/recover-fake-log.py 8599 /tmp/recover-flaky-count.txt flaky &
python3 /tmp/recover-fake-log.py 8597 /tmp/recover-reject-count.txt reject &

# ai B — writes through the flaky endpoint (first two requests 500, then 200)
bun run workspace/ai/src/main.ts --addr :8523 --root "$ROOT" --stub \
  --log http://localhost:8599 --agents "$ROOTDIR/agents/AGENTS.md" \
  >/tmp/recover-retry.log 2>&1 &

# ai C — writes through an endpoint that answers 400 to everything
bun run workspace/ai/src/main.ts --addr :8524 --root "$ROOT" --stub \
  --log http://localhost:8597 --agents "$ROOTDIR/agents/AGENTS.md" \
  >/tmp/recover-reject.log 2>&1 &

sleep 2
curl -s -o /dev/null -w 'log %{http_code}\n' -X POST http://localhost:8521/log/list -d ''
curl -s -o /dev/null -w 'ai A %{http_code}\n' -X POST http://localhost:8522/ai/new
curl -s -o /dev/null -w 'ai B %{http_code}\n' -X POST http://localhost:8523/ai/new
curl -s -o /dev/null -w 'ai C %{http_code}\n' -X POST http://localhost:8524/ai/new
```

Expected on startup: all four print `200`, `/tmp/recover-flaky-count.txt` does not
exist yet, and `/tmp/recover-ai.log` ends with `engineer ai: log=http://localhost:8521`.

## 1. craft a damaged conversation

Nine rows are written straight into the log service — this is the exact shape a
lost write leaves behind. Row order is insertion order (`seq` 8 appears twice):

| seq | role | shape | expected treatment |
|---|---|---|---|
| 1 | user | `hello` | kept |
| 2 | assistant | text + `toolCall tc_2` | **placeholder result filled** |
| 3 | toolResult | `tc_ghost` — nobody asked for it | **dropped (orphan)** |
| 4 | assistant | `toolCall tc_4` | kept |
| 5 | toolResult | `tc_4` | kept (healthy pair) |
| 6 | assistant | text `done` | kept |
| 7 | toolResult | `tc_4b` — nobody asked for it | **dropped (orphan)** |
| 8 | user | `again` | kept |
| 8 | user | `again` (byte-identical repeat) | **dropped (duplicate seq)** |

```bash
B=http://localhost:8521/log/mutation
row() { curl -s -o /dev/null -X POST "$B" -d "$1"; }

row 'op: add
kind: conversation
sessionId: s_recover_bad
payload:
  seq: 1
  role: user
  content: hello
  raw:
    role: user
    content: [{ type: text, text: hello }]
    timestamp: 1759200000000'

row 'op: add
kind: conversation
sessionId: s_recover_bad
payload:
  seq: 2
  role: assistant
  content: "let me run it"
  raw:
    role: assistant
    content:
      - { type: text, text: "let me run it" }
      - { type: toolCall, id: tc_2, name: bash, arguments: { command: date } }
    api: openai-completions
    provider: deepseek
    model: deepseek-chat
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
    stopReason: toolUse
    timestamp: 1759200000001'

row 'op: add
kind: conversation
sessionId: s_recover_bad
payload:
  seq: 3
  role: toolResult
  content: ""
  raw:
    role: toolResult
    toolCallId: tc_ghost
    toolName: bash
    content: [{ type: text, text: "ghost output" }]
    isError: false
    timestamp: 1759200000002'

row 'op: add
kind: conversation
sessionId: s_recover_bad
payload:
  seq: 4
  role: assistant
  content: ""
  raw:
    role: assistant
    content:
      - { type: toolCall, id: tc_4, name: bash, arguments: { command: uname } }
    api: openai-completions
    provider: deepseek
    model: deepseek-chat
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
    stopReason: toolUse
    timestamp: 1759200000003'

row 'op: add
kind: conversation
sessionId: s_recover_bad
payload:
  seq: 5
  role: toolResult
  content: ""
  raw:
    role: toolResult
    toolCallId: tc_4
    toolName: bash
    content: [{ type: text, text: Linux }]
    isError: false
    timestamp: 1759200000004'

row 'op: add
kind: conversation
sessionId: s_recover_bad
payload:
  seq: 6
  role: assistant
  content: done
  raw:
    role: assistant
    content: [{ type: text, text: done }]
    api: openai-completions
    provider: deepseek
    model: deepseek-chat
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
    stopReason: stop
    timestamp: 1759200000005'

row 'op: add
kind: conversation
sessionId: s_recover_bad
payload:
  seq: 7
  role: toolResult
  content: ""
  raw:
    role: toolResult
    toolCallId: tc_4b
    toolName: bash
    content: [{ type: text, text: "stray output" }]
    isError: false
    timestamp: 1759200000006'

for i in 1 2; do
row 'op: add
kind: conversation
sessionId: s_recover_bad
payload:
  seq: 8
  role: user
  content: again
  raw:
    role: user
    content: [{ type: text, text: again }]
    timestamp: 1759200000007'
done

curl -s -X POST http://localhost:8521/log/session-detail -d 'sessionId: s_recover_bad' \
  | grep -c '^    seq:'
```

Expected: 200 on every mutation; the last command prints `9`.

## 2. the damaged session resumes and answers

```bash
curl -s -X POST http://localhost:8522/ai/resume -d 'id: s_recover_bad'
curl -s -X POST http://localhost:8522/ai/ask -d 'id: s_recover_bad
blocks:
  - type: text
    text: reply with the single word ok'
sleep 20
curl -s -N -X POST http://localhost:8522/ai/stream -d 'id: s_recover_bad
since: 0' > /tmp/recover-stream.txt
grep -c 'type: text_delta' /tmp/recover-stream.txt
grep -c 'stopReason: error' /tmp/recover-stream.txt
grep -c 'did not have response messages' /tmp/recover-stream.txt
```

Expected: `/ai/resume` is 200 with `active: false`; `/ai/ask` is 200; the stream holds
`agent_start`, at least one `text_delta` (inside an `assistantMessageEvent`), and
`agent_settled`. The three counts print `>0`, `0`, `0` — the model answers.

**Before the fix the same three commands print `0`, `1`, `1`**, which is the bug
exactly as reported. The provider rejects the replay, and pi does not raise it as an
error event: it produces an assistant message with an empty `content` and
`stopReason: error` carrying the provider's `errorMessage`, so nothing is streamed
and the reply never arrives. Because the next prompt replays the same history, the
session stays wedged for good. Replaying these identical rows with the pre-change
`engineer-ai` binary gives:

```
400: {"message":"An assistant message with 'tool_calls' must be followed by tool
messages responding to each 'tool_call_id', The following tool_call_ids did not have
response messages: tc_ghost ...","type":"invalid_request_error"}
```

that empty assistant message is then persisted like any other, so a session that hit
the bug keeps a record with `content: []` and `stopReason: error` in its history.
Section 2 covers rebuilding over one of those too — the repaired replay carries it
without trouble (`1` text_delta, `0` `stopReason: error`).

## 3. the repair is reported (provider-independent)

```bash
grep 'history repair s_recover_bad' /tmp/recover-ai.log
grep -o 'repair [a-z-]*' /tmp/recover-ai-debug.log
```

Expected: exactly one summary line, and it counts exactly what section 1 crafted:

```
engineer ai: history repair s_recover_bad: filled=1 orphans=2 duplicates=1 holes=0
```

(`holes` counts `seq` numbers missing from the stored set *before* anything is
dropped — `seq 3` and `seq 7` are present as rows even though their content is
discarded, so this session has no hole. A missing **row** is covered in section 6.)

The debug trace lists every action it took:

```
<sid> repair drop-duplicate seq=8
<sid> repair fill seq=2 toolCallId=tc_2
<sid> repair drop-orphan seq=3 toolCallId=tc_ghost
<sid> repair drop-orphan seq=7 toolCallId=tc_4b
```

De-duplication is a pass of its own over the whole history, so it is reported
first; the pairing actions then follow in record order. The `fill` line for
`seq=2` is what puts the placeholder result back, and because the replayed
conversation is built in that same order, the placeholder sits immediately after
the `seq=2` assistant and before the `seq=4` assistant — the order the provider
demands.

## 4. a healthy session is left alone

```bash
SID=$(curl -s -X POST http://localhost:8522/ai/new | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])')
curl -s -X POST http://localhost:8522/ai/ask -d "id: $SID
blocks:
  - type: text
    text: reply with the single word ok"
sleep 15
curl -s -X POST http://localhost:8522/ai/resume -d "id: $SID"
grep -c "history repair $SID" /tmp/recover-ai.log
```

Expected: `/ai/resume` is 200; the `grep -c` prints `0` — an undamaged history is
replayed byte-for-byte, with no repair and no dropped message. (With the stub the
count is `0` as well; that half is not stub-dependent.)

## 5. a transient write failure is retried, not swallowed

ai B writes through an endpoint that answers `500` to the first two requests and
`200` afterwards.

```bash
RID=$(curl -s -X POST http://localhost:8523/ai/new | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])')
curl -s -X POST http://localhost:8523/ai/ask -d "id: $RID
blocks:
  - type: text
    text: hello"
sleep 3
cat /tmp/recover-flaky-count.txt
grep -c 'record write failed' /tmp/recover-retry.log
```

Expected: `4` and `0`. The arithmetic: one `/ai/ask` on the stub records two rows
(the user prompt, then the stub reply), and `writeTail` keeps them in order — the
user row's first two attempts are answered `500`, its third succeeds; the reply row
succeeds first try. `4` means the writer **did** retry (a writer without retries
sends exactly `2` requests), and `0` means it never had to report a failure.

## 6. a rejected write is reported, and a hole does not wedge the session

ai C writes through an endpoint that answers `400` to everything. A 4xx is the
client's fault, so it is not retried — but it is no longer silent.

```bash
CID=$(curl -s -X POST http://localhost:8524/ai/new | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])')
curl -s -X POST http://localhost:8524/ai/ask -d "id: $CID
blocks:
  - type: text
    text: hello"
sleep 3
cat /tmp/recover-reject-count.txt
grep 'record write failed' /tmp/recover-reject.log
```

Expected: `2` — one attempt per row, **no retry on 4xx** (the same arithmetic as
section 5: two rows, one attempt each). And the log holds a report naming the
session, the `seq`, the number of attempts and the reason, e.g.

```
engineer ai: conversation record write failed sessionId=<sid> seq=1 attempts=1: log http 400: error: code: bad_request message: nope
```

Now the other half of the damage: a session whose stored rows simply skip numbers
(the `seq` was handed out before the write, so a lost write leaves a gap). Craft
one with `seq` 1, 2, 5:

```bash
row 'op: add
kind: conversation
sessionId: s_recover_hole
payload:
  seq: 1
  role: user
  content: hello
  raw:
    role: user
    content: [{ type: text, text: hello }]
    timestamp: 1759200000000'

row 'op: add
kind: conversation
sessionId: s_recover_hole
payload:
  seq: 2
  role: assistant
  content: hi
  raw:
    role: assistant
    content: [{ type: text, text: hi }]
    api: openai-completions
    provider: deepseek
    model: deepseek-chat
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
    stopReason: stop
    timestamp: 1759200000001'

row 'op: add
kind: conversation
sessionId: s_recover_hole
payload:
  seq: 5
  role: user
  content: again
  raw:
    role: user
    content: [{ type: text, text: again }]
    timestamp: 1759200000002'

curl -s -X POST http://localhost:8522/ai/resume -d 'id: s_recover_hole'
grep 'history repair s_recover_hole' /tmp/recover-ai.log
```

Expected: `/ai/resume` is 200 (a hole is not damage to repair — the messages that
did survive replay fine), and the summary reports it once:

```
engineer ai: history repair s_recover_hole: filled=0 orphans=0 duplicates=0 holes=2
```

`holes=2` is the honest trace of the two lost records (`seq 3`, `seq 4`).

## 7. a compacted history is not mistaken for damage

`resume` starts the replay at the latest compaction record, so the messages before
the cut are summarized away rather than skipped by accident. That cut must not
look like damage: the rows after it are a self-contained, well-formed
conversation, and repairing a healthy `assistant(tc_9)` + `toolResult(tc_9)` pair
would be a bug of its own.

```bash
row 'op: add
kind: conversation
sessionId: s_recover_compact
payload:
  seq: 1
  role: user
  content: old question
  raw:
    role: user
    content: [{ type: text, text: old question }]
    timestamp: 1759200000000'

row 'op: add
kind: conversation
sessionId: s_recover_compact
payload:
  seq: 2
  role: assistant
  content: old answer
  raw:
    role: assistant
    content: [{ type: text, text: old answer }]
    api: openai-completions
    provider: deepseek
    model: deepseek-chat
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
    stopReason: stop
    timestamp: 1759200000001'

row 'op: add
kind: conversation
sessionId: s_recover_compact
payload:
  seq: 3
  role: compaction
  content: ""
  raw:
    role: compaction
    summary: the earlier conversation was summarized
    tokensBefore: 1234
    timestamp: 1759200000002'

row 'op: add
kind: conversation
sessionId: s_recover_compact
payload:
  seq: 4
  role: user
  content: new question
  raw:
    role: user
    content: [{ type: text, text: new question }]
    timestamp: 1759200000003'

row 'op: add
kind: conversation
sessionId: s_recover_compact
payload:
  seq: 5
  role: assistant
  content: ""
  raw:
    role: assistant
    content:
      - { type: toolCall, id: tc_9, name: bash, arguments: { command: date } }
    api: openai-completions
    provider: deepseek
    model: deepseek-chat
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
    stopReason: toolUse
    timestamp: 1759200000004'

row 'op: add
kind: conversation
sessionId: s_recover_compact
payload:
  seq: 6
  role: toolResult
  content: ""
  raw:
    role: toolResult
    toolCallId: tc_9
    toolName: bash
    content: [{ type: text, text: "Thu Sep 30" }]
    isError: false
    timestamp: 1759200000005'

curl -s -X POST http://localhost:8522/ai/resume -d 'id: s_recover_compact'
grep -c 'history repair s_recover_compact' /tmp/recover-ai.log

curl -s -X POST http://localhost:8522/ai/ask -d 'id: s_recover_compact
blocks:
  - type: text
    text: reply with the single word ok'
sleep 20
curl -s -N -X POST http://localhost:8522/ai/stream -d 'id: s_recover_compact
since: 0' > /tmp/recover-compact-stream.txt
grep -c 'data: type: error' /tmp/recover-compact-stream.txt
grep -c 'type: agent_settled' /tmp/recover-compact-stream.txt
```

Expected: `/ai/resume` is 200, the repair count is `0`, and the asked turn streams a
clean reply — `0` errors, `1` `agent_settled`. The summarized pair before the cut is
never re-sent, and the intact pair after it is left untouched.

## Teardown

```bash
pkill -f '/tmp/engineer serve-log --root .*recover-test'
pkill -f 'main.ts --addr :8522'
pkill -f 'main.ts --addr :8523'
pkill -f 'main.ts --addr :8524'
pkill -f 'recover-fake-log.py'
rm -rf .engineer/.recover-test
```

## Notes

- Section 2 is the only part that needs an authenticated LLM provider, because the
  provider error it guards against can only come from a provider. Run the whole
  case with a configured provider for the full check; on the echo stub, record
  section 2's provider half as **not exercised** rather than as a pass. Under the
  stub the same commands print `0` for the first count — no provider is called at
  all, so that number proves nothing there. Section 3 is the provider-independent
  half.
- Section 2's "before" numbers were not assumed: they were measured by replaying the
  very same rows with the pre-change `engineer-ai` binary (the installed one under
  `~/.engineer/apps/current/bin/`). If that binary is on `PATH`, the same A/B can be
  run against the crafted session at any time.
- The damaged rows are written through `log/mutation` rather than by killing the
  ai service mid-write: the case must be deterministic, and to the reader of the
  records the two are indistinguishable. As a sanity check the damage found in this
  project's own real log was the same shape — 7 sessions carrying
  `filled`/`orphans`/`holes`, reported identically by `sanitizeHistory` and by an
  independent scan over the same `engineer.db`.

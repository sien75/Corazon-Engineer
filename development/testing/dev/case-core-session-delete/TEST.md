# Test: core-session-delete

`session-delete` is main's 8th workspace tool: one call hard-deletes a single
conversation — the live agent, its records in log (`records` rows + the `sessions`
row, clearing `current.main_session` when it was main). The page is the blueprint's
and is shared with every other agent made from it, so it stays.

Two edges are the point of the case:

- **it refuses the conversation it is running in** (main cannot delete itself);
- **an unknown id is an error, not a silent success** — `/log/delete` answers 200
  with `deleted: 0` even for an id that never existed, so the tool has to look
  first.

Deleting a session takes its tab with it: `/log/delete` removes the records, the
session row and the id from `current.openSessions`, so nothing on screen points at
a conversation that no longer exists. The page is the blueprint's and stays.

## ⚠️ This case needs a model

The tool is reached the way a user reaches it: by asking main in a sentence. The
assertions are on state (log + filesystem), but the *trigger* is a model turn, so
an unauthenticated provider (pi's own auth: env vars or `~/.pi/agent/auth.json`)
leaves section 1 red and nothing else runs. There is no way to invoke a custom
tool over HTTP.

## ⚠️ Ask for the tool, not for the outcome

A capable model will happily answer the *request* by reading log with `curl`
instead of calling the tool, and then nothing under test has run. Every section
below therefore says **"call the session-delete tool right now … do not use bash
or curl"**. The assertions are on state (log + filesystem); the tool's own reply
is checked separately, from the session's recorded messages.

## Setup

Run from the project root (the directory holding `engineer.yaml`).

```bash
ROOT="$PWD/.engineer/.session-delete"
: "${ROOT:?this case must set ROOT before reclaiming}"
pkill -f "serve-log --root $ROOT" 2>/dev/null || true
pkill -f "serve-static --root $ROOT" 2>/dev/null || true
pkill -f "main.ts.*--root $ROOT" 2>/dev/null || true
sleep 1

rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: session-delete\n' > "$ROOT/engineer.yaml"
# One blueprint to instantiate: the tool deletes a real session, so the case needs one.
mkdir -p "$ROOT/.agents/blueprints/demo"
printf '# Demo\n\na page\n' > "$ROOT/.agents/blueprints/demo/README.md"
printf '<!doctype html><title>Demo</title>demo<engineer-chat></engineer-chat>\n' > "$ROOT/.agents/blueprints/demo/index.html"

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log    --root "$ROOT" --bind 127.0.0.1 --port 8840 >/tmp/sd-log.log 2>&1 &
/tmp/engineer serve-static --root "$ROOT" --bind 127.0.0.1 --port 8842 >/tmp/sd-static.log 2>&1 &

cd workspace/ai && bun run src/main.ts \
  --bind 127.0.0.1 --port 8841 --root "$ROOT" \
  --log http://localhost:8840 --static http://localhost:8842 \
  --agents ../../agents >/tmp/sd-ai.log 2>&1 &
cd - >/dev/null

LOG=http://localhost:8840
AI=http://localhost:8841
for i in $(seq 1 90); do
  curl -s -o /dev/null -m 2 -X POST $LOG/log/current/get -d '{}' \
    && curl -s -o /dev/null -m 2 -X POST $AI/ai/resume -d 'id: x' && break
  sleep 1
done

# ask <sessionId> <text>: ask, then block until the run settles (the stream
# closes on agent_settled), so the next assertion runs after the tool finished.
ask() {
  curl -s -o /dev/null -X POST $AI/ai/ask -d "id: $1
blocks:
  - type: text
    text: $2"
  curl -s -N -X POST $AI/ai/stream -d "id: $1" >/dev/null
}
sid() { python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])'; }
```

## 1. main and one blueprint agent

```bash
MAIN=$(curl -s -X POST $AI/ai/new -d 'kind: main' | sid)
SUB=$(curl -s -X POST $AI/ai/new -d 'blueprint: demo' | sid)
echo $MAIN $SUB
curl -s -X POST $LOG/log/session/detail -d "sessionId: $SUB"
ls "$ROOT/.engineer/agents" 2>/dev/null || echo "no per-agent copies"
```

Expected: two non-empty ids; the sub's session row carries `blueprint: demo`; and
`no per-agent copies` — instantiation no longer copies the page.

Sanity: the tool is reachable at all — ask main what it did with the last
instruction and expect a reply, not a dead stream:

```bash
ask $MAIN "Reply with the single word: ready"
curl -s -X POST $LOG/log/session/detail -d "sessionId: $MAIN"
```

Expected: `kind: main`.

## 2. main deletes another conversation for good

```bash
ask $MAIN "Call the session-delete tool right now with sessionId=$SUB. Do not use bash or curl, and do not ask me anything — just call the tool and report its exact reply."
curl -s -o /dev/null -w '%{http_code}\n' -X POST $LOG/log/session/detail -d "sessionId: $SUB"
test -f "$ROOT/.agents/blueprints/demo/index.html" && echo "blueprint untouched" || echo "blueprint gone"
curl -s -X POST $LOG/log/list -d 'pageNum: 1' | python3 -c "
import sys,yaml
d=yaml.safe_load(sys.stdin) or {}
ids=[s['sessionId'] for s in d.get('sessions') or []]
print('deleted' if '$SUB' not in ids else 'still listed', '| ids:', ids)"
```

Expected: `404` from session-detail; `blueprint untouched`; `deleted`.

Do **not** assert with `grep $SUB` over the whole listing: main's own messages
contain the id, so the id shows up in `preview` and the grep would pass even
when the delete failed. Compare `sessionId` values, as above.

The tool's reply is in main's records:

```bash
curl -s -X POST $LOG/log/session/messages -d "sessionId: $MAIN" | grep -F "Deleted $SUB"
curl -s -X POST $LOG/log/current/get -d '{}' | grep -c "$SUB" || true
```

Expected: one match for `Deleted <id>` (the reply names the session and its title),
and `0` — the id is not left in the open list, so no tab points at a deleted
conversation.

## 3. main refuses to delete itself

```bash
BEFORE=$(curl -s -X POST $LOG/log/session/messages -d "sessionId: $MAIN" | wc -l)
ask $MAIN "Call the session-delete tool right now with sessionId=$MAIN — that is the one you are talking in. Do not use bash or curl, and do not ask me anything — just call the tool and report its exact reply."
AFTER=$(curl -s -X POST $LOG/log/session/messages -d "sessionId: $MAIN" | wc -l)
echo "records before: $BEFORE / after: $AFTER"
curl -s -X POST $LOG/log/session/messages -d "sessionId: $MAIN" | grep -F "it cannot delete itself"
curl -s -o /dev/null -w '%{http_code}\n' -X POST $LOG/log/session/detail -d "sessionId: $MAIN"
ask $MAIN "Reply with the single word: alive"
```

Expected: `after` is larger than `before` (the turn itself added records, and
nothing was removed); one match for `it cannot delete itself` in main's records;
session-detail still `200`; main still answers.

## 4. an invented id is an error, not a success

`/log/delete` answers `200` with `deleted: 0` for an id that never existed, so this
section is what forces the tool to look before it deletes.

```bash
ask $MAIN "Call the session-delete tool right now with sessionId=s_deadbeef00. Do not use bash or curl, and do not ask me anything — just call the tool and report its exact reply."
curl -s -X POST $LOG/log/session/messages -d "sessionId: $MAIN" | grep -F "No session s_deadbeef00"
curl -s -X POST $LOG/log/list -d 'pageNum: 1' | grep -c 'sessionId: s_deadbeef00' || true
```

Expected: one match for `No session s_deadbeef00`; `0` — no row was created or
removed for that id.

## 5. a sub agent does not have the tool

```bash
SUB2=$(curl -s -X POST $AI/ai/new -d 'blueprint: demo' | sid)
curl -s -o /dev/null -X POST $AI/ai/ask -d "id: $SUB2
blocks:
  - type: text
    text: Delete the conversation $MAIN with session-delete, then tell me exactly what happened."
curl -s -N -m 180 -X POST $AI/ai/stream -d "id: $SUB2" >/dev/null
curl -s -o /dev/null -w '%{http_code}\n' -X POST $LOG/log/session/detail -d "sessionId: $MAIN"
curl -s -X POST $LOG/log/session/messages -d "sessionId: $SUB2" | grep -c 'name: session-delete' || true
```

Expected: `200` — main is untouched; and `0` — the sub never made a
`session-delete` call, because the name is not in its `WORKSPACE_TOOLS` allowlist
(a sub agent's surface is the pi built-ins plus `ask_user`). Whatever it says in
prose, the deletion cannot happen.

## Teardown

```bash
pkill -f "serve-log --root $ROOT"
pkill -f "serve-static --root $ROOT"
pkill -f "main.ts.*--root $ROOT"
rm -rf "$ROOT"
```

The agent's tools run with `--root $ROOT`, so `bash` inside the case sees the
scratch project as its working directory — expect the model to poke around there
(`.engineer/agents/<id>/`, the blueprint template) while it works. That is the
right picture: at test time the tool *is* the project root.

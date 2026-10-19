# Test: core-ai-main-resume

`main-list` 与 `main-resume` 是 main 的工作区工具里唯一一对**只作用于 main 自己**的：前者列 main
的对话（id / 最后活动 / 消息数 / 首句，当前那段标 `*`），后者按 id 把一段早先的 main 放回屏幕 ——
`deps.resumeSession` 先把它（重新）变成 live 会话，再 `/log/current/put` 换指针，前端收到
`engineer-tool` 帧后跟过去。

用例要钉住：

- `main-list` 的列表里只有 main，且给出可用的 id；sub 不在里面；
- `main-resume` 真的换指针，而且**换的是能恢复的那一段**：ai 重启之后（会话只剩记录），resume
  仍然成功，并且它的历史真的回来了（问它开头的暗号，答的是那一段的）；
- 拒绝要有明确的话：sub 的 id、编造的 id、当前这一段；拒绝时指针不动；
- **前端真的切回去**，两段会话各自的历史都在屏幕上；
- sub 没有这两个工具。

Source of truth: `workspace/ai/src/workspace.ts`（`mainList` / `mainResume` / `deps.resumeSession`）、
`workspace/ai/src/registry.ts`（`WORKSPACE_TOOLS`）、`workspace/web/app.js`（`makeMainTab` 的
`engineer-tool` 正则 + `doRefreshWorkspace` 的跟指针分支）。

## ⚠️ 这个用例需要真模型

工具只能由模型调用，没有 HTTP 入口（与 `case-core-session-delete` 同一约束）。pi 的认证
（环境变量或 `~/.pi/agent/auth.json`）没配好时，第 2 节起就是红的。ai **不加** `--stub`。

## ⚠️ 要它调工具，不要它给结果

模型完全可能用 `bash` + `curl` 自己读写 log，那样被测的代码一行都没跑。每节都明确写
**"call the … tool right now … do not use bash or curl"**；"工具真的被调了"另查记录里的
`name: main-list` / `name: main-resume`。

## ⚠️ 顺序是有意的：先重启再调 main-list

"历史回来了"这一条必须问一段**上下文里没有别段会话**的会话。`main-list` 的输出带着另一段 main
的首句（预览），谁调过 `main-list`，谁的上下文里就有了另一段的字眼 —— 再问它"开头的暗号是什么"，
它会被那份预览带偏（实测：MAIN2 调过 `main-list` 之后，问它暗号答的是 alpha）。所以
**第 2 节先做重启 + 恢复**，那时两段 main 都还没调过 `main-list`。

## Setup

Run from the project root (the directory holding `engineer.yaml`).

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.main-resume"
: "${ROOT:?this case must set ROOT before reclaiming}"
pkill -f "serve-log --root $ROOT" 2>/dev/null || true
pkill -f "serve-static --root $ROOT" 2>/dev/null || true
pkill -f "main.ts.*--root $ROOT" 2>/dev/null || true
for p in 9030 9031 9032 9033; do pkill -f "serve-web.*--port $p" 2>/dev/null || true; done
sleep 1

rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: main-resume\n' > "$ROOT/engineer.yaml"
# the browser part runs in Node, outside this shell's cwd: it reads the root from here
printf '%s\n' "$ROOT" > /tmp/main-resume-root

# a blueprint, so section 5 has a real sub to refuse
mkdir -p "$ROOT/.agents/blueprints/demo"
printf '# Demo\n\na page\n' > "$ROOT/.agents/blueprints/demo/README.md"
printf '<!doctype html><title>Demo</title>demo<engineer-chat></engineer-chat>\n' > "$ROOT/.agents/blueprints/demo/index.html"

(cd how-to/deploy/prod && go build -o /tmp/engineer-main-resume .)
/tmp/engineer-main-resume serve-log --root "$ROOT" --bind 127.0.0.1 --port 9031 >/tmp/main-resume-log.log 2>&1 &
/tmp/engineer-main-resume serve-static --root "$ROOT" --bind 127.0.0.1 --port 9032 >/tmp/main-resume-static.log 2>&1 &

# start_ai is reused in section 2: the ai process is restarted there to prove that
# resume rebuilds a conversation from its records once memory is gone.
BUNSRC="$ROOTDIR/workspace/ai"
start_ai() {
  (cd "$BUNSRC" && bun run src/main.ts --bind 127.0.0.1 --port 9033 --root "$ROOT" \
    --log http://localhost:9031 --static http://localhost:9032 \
    --agents "$ROOTDIR/agents" >>/tmp/main-resume-ai.log 2>&1 &)
}
: >/tmp/main-resume-ai.log
start_ai

/tmp/engineer-main-resume serve-web --bind 127.0.0.1 --port 9030 --assets "$ROOTDIR/workspace/web" \
  --blueprints "$ROOT/.agents/blueprints" \
  --static http://localhost:9032 --ai http://localhost:9033 --log http://localhost:9031 \
  >/tmp/main-resume-web.log 2>&1 &

LOG=http://localhost:9031
AI=http://localhost:9033
for i in $(seq 1 90); do
  curl -s -o /dev/null -m 2 -X POST $LOG/log/current/get -d '{}' \
    && curl -s -o /dev/null -m 2 -X POST $AI/ai/resume -d 'id: x' \
    && curl -s -o /dev/null -m 2 http://localhost:9030/ && break
  sleep 1
done

# ask <sessionId> <text>: ask, then block until the run settles (the stream
# closes on agent_settled). JSON body: a prompt with a colon stays one value.
ask() {
  python3 - "$1" "$2" > /tmp/main-resume-ask.json <<'PY'
import json, sys
print(json.dumps({"id": sys.argv[1],
                  "blocks": [{"type": "text", "text": sys.argv[2]}]}))
PY
  curl -s -o /dev/null -X POST $AI/ai/ask --data-binary @/tmp/main-resume-ask.json
  curl -s -N -X POST $AI/ai/stream -d "id: $1" >/dev/null
}
sid() { python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])'; }
mainid() { curl -s -X POST $LOG/log/current/get -d '{}' | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin).get("mainSession") or "")'; }
records() { curl -s -X POST $LOG/log/session/messages -d "sessionId: $1"; }
# last_answer prints the text of the session's final assistant message
last_answer() {
  records "$1" | python3 -c '
import sys, yaml
d = yaml.safe_load(sys.stdin) or {}
msgs = d.get("messages") or []
raw = (msgs[-1].get("raw") or {}) if msgs else {}
texts = [b.get("text") for b in (raw.get("content") or []) if b.get("type") == "text"]
print((texts or [""])[-1])
'
}
```

Expected on startup: `serve-web` logs its address on `:9030`, and the ai log shows a real model
(`engineer ai: model=…`), not `--stub: model calls disabled`.

## 1. two main conversations and one blueprint agent

```bash
MAIN1=$(curl -s -X POST $AI/ai/new -d 'kind: main' | sid)
ask $MAIN1 "Remember the word alpha. Reply with the single word: ok"
MAIN2=$(curl -s -X POST $AI/ai/new -d 'kind: main' | sid)
ask $MAIN2 "Remember the word beta. Reply with the single word: ok"
SUB=$(curl -s -X POST $AI/ai/new -d 'blueprint: demo' | sid)
# the pointer starts on MAIN1, so section 2's resume of MAIN2 is a real move
curl -s -o /dev/null -X POST $LOG/log/current/put -d "openSessions: []
mainSession: $MAIN1"
echo "$MAIN1 $MAIN2 $SUB"
curl -s -X POST $LOG/log/session/detail -d "sessionId: $MAIN1"
curl -s -X POST $LOG/log/session/detail -d "sessionId: $SUB"
curl -s -X POST $LOG/log/current/get -d '{}'
```

Expected: both main ids report `kind: main`, the third `kind: sub` with `blueprint: demo`, and
`current` says `mainSession: <MAIN1>`, `openSessions: []`.

## 2. after an ai restart, main-resume brings MAIN2 back from its records

MAIN2 is the conversation that is *not* on screen, and after the restart no process holds it:
the only way back is its records.

```bash
pkill -f "main.ts.*--root $ROOT" 2>/dev/null || true
sleep 2
start_ai
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST $AI/ai/resume -d "id: $MAIN1" && break
  sleep 1
done
# no process is live now: the only way back to MAIN2 is its records.
curl -s -X POST $AI/ai/resume -d "id: $MAIN1"

ask $MAIN1 "Call the main-resume tool right now with sessionId=$MAIN2. Do not use bash or curl, and do not ask me anything — just call the tool and report its exact reply."
echo "current: $(mainid)  expected: $MAIN2"
records $MAIN1 | grep -F "main is now $MAIN2" | head -2

ask $MAIN2 "Reply with the single code word I gave you at the very start of this conversation. Nothing else."
echo -n "MAIN2 answers: "; last_answer $MAIN2
```

Expected: `current:` is `$MAIN2` — and that only happens if `main-resume` rebuilt it from records,
because a session that cannot be resumed makes the tool fail and leaves the pointer alone. The
answer is `beta`: MAIN2's history came back with it (no `main-list` has run yet, so the word can
only be its own).

## 3. main-list shows main's conversations and nothing else

```bash
ask $MAIN2 "Call the main-list tool right now. Do not use bash or curl, and do not ask me anything — just call the tool and report its exact reply."
echo -n "tool call: "; records $MAIN2 | grep -c 'name: main-list' || true
echo -n "MAIN1 in records: "; records $MAIN2 | grep -c "$MAIN1" || true
echo -n "SUB in records: "; records $MAIN2 | grep -c "$SUB" || true
records $MAIN2 | grep -F 'msg(s)' | head -3
```

Expected:

- the tool call happened (`1`);
- `$MAIN1` appears in MAIN2's records (`1` or more) — it came from the tool's output, since the id
  was never in MAIN2's prompt;
- `$SUB` appears `0` times — `main-list` filters to `kind: main`, and no prompt above mentions the
  sub's id;
- the tool's own lines carry `msg(s)` and a `*` on the current one.

## 4. main-resume puts MAIN1 back on screen

```bash
ask $MAIN2 "Call the main-resume tool right now with sessionId=$MAIN1. Do not use bash or curl, and do not ask me anything — just call the tool and report its exact reply."
echo "current: $(mainid)  expected: $MAIN1"
echo -n "tool call: "; records $MAIN2 | grep -c 'name: main-resume' || true
records $MAIN2 | grep -F "main is now $MAIN1" | head -2
curl -s -X POST $LOG/log/current/get -d '{}'
```

Expected: `current:` is `$MAIN1`; one `main-resume` call; the result line `main is now <MAIN1>`;
`openSessions` still `[]` (a conversation swap is not a tab change).

## 5. the refusals: a blueprint agent, an unknown id, the one already on screen

```bash
# $SUB is a blueprint agent
ask $MAIN1 "Call the main-resume tool right now with sessionId=$SUB. Do not use bash or curl, and do not ask me anything — just call the tool and report its exact reply."
records $MAIN1 | grep -F "is a blueprint agent" | head -2
echo "after sub: $(mainid)  expected: $MAIN1"

# an id that never existed
ask $MAIN1 "Call the main-resume tool right now with sessionId=s_deadbeef00. Do not use bash or curl, and do not ask me anything — just call the tool and report its exact reply."
records $MAIN1 | grep -F "No conversation s_deadbeef00" | head -2
echo "after ghost: $(mainid)  expected: $MAIN1"

# the conversation already on screen
ask $MAIN1 "Call the main-resume tool right now with sessionId=$MAIN1 — that is the one you are in. Do not use bash or curl, and do not ask me anything — just call the tool and report its exact reply."
records $MAIN1 | grep -F "main is already $MAIN1" | head -2
echo "after self: $(mainid)  expected: $MAIN1"
```

Expected: `is a blueprint agent` and `No conversation s_deadbeef00` each appear; the self-resume
answers `main is already <MAIN1>`; and `current:` stays `$MAIN1` all three times — a refused resume
does not move the pointer.

## 6. a sub agent has neither tool

```bash
ask $SUB "Call tools named main-list and main-resume right now. Do not use bash or curl, and do not ask me anything — just say what happened."
echo -n "main-list calls: "; records $SUB | grep -c 'name: main-list' || true
echo -n "main-resume calls: "; records $SUB | grep -c 'name: main-resume' || true
echo "current: $(mainid)  expected: $MAIN1"
```

Expected: `0`, `0`, and the pointer unchanged — the names are not in a sub's `WORKSPACE_TOOLS`
allowlist, so whatever the model says, nothing moved.

## 7. the shell switches back, history and all

`BEFORE` is MAIN1 (the pointer) whose history says `alpha`; after main is told to resume MAIN2 the
element in `#panes` must be MAIN2 **and** the screen must show MAIN2's history (`beta`).

```bash
BEFORE=$(mainid)
printf '%s\n' "$BEFORE" > /tmp/main-resume-before
printf '%s\n' "$MAIN2" > /tmp/main-resume-target
echo "browser boots on: $BEFORE, must resume $MAIN2"

ego-browser nodejs <<'EOF'
const fs = await import("node:fs/promises");
const WEB = "http://localhost:9030/";
const LOG = "http://localhost:9031";
const BEFORE = (await fs.readFile("/tmp/main-resume-before", "utf8")).trim();
const TARGET = (await fs.readFile("/tmp/main-resume-target", "utf8")).trim();
const task = await taskSpace("core-ai-main-resume");
const page = task.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });

const mainSession = async () => {
  const text = await (await fetch(`${LOG}/log/current/get`, { method: "POST", body: "{}" })).text();
  return (text.match(/^mainSession:\s*(\S+)/m) || [])[1] || "";
};

const dom = () => page.evaluate(() => {
  const chats = [...document.querySelectorAll("#panes engineer-chat")];
  const chat = chats.find((c) => !c.hidden) || chats[0];
  return {
    count: chats.length,
    session: chat?.getAttribute("session") || "",
    tabs: [...document.querySelectorAll("#tabs .tab")].map((t) => t.textContent.trim().replace(/×$/, "")),
    path: location.pathname,
    messages: chat?.shadowRoot?.querySelector(".ai-messages")?.textContent || "",
  };
});

const type = (text) => page.evaluate((text) => {
  const chat = document.querySelector("#panes engineer-chat");
  const input = chat?.shadowRoot?.querySelector(".ai-input-field");
  if (!input) throw new Error("no main composer");
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}, text);

await page.goto(WEB);
await page.waitForSelector("#tabs .tab", { state: "visible" });
await page.waitForFunction(() => {
  const chat = document.querySelector("#panes engineer-chat");
  return !!chat?.shadowRoot?.querySelector(".ai-input-field");
}, undefined, { timeout: 30_000 });

const booted = await dom();
check("the shell boots on the conversation log points at, with its history replayed",
  booted.session === BEFORE && /alpha/i.test(booted.messages), { ...booted, BEFORE });

await type(`Call the main-resume tool right now with sessionId=${TARGET}. Do not use bash or curl, and do not ask me anything — just call the tool and report its exact reply.`);
await page.waitForFunction((before) => {
  const chat = document.querySelector("#panes engineer-chat");
  const now = chat?.getAttribute("session") || "";
  return now && now !== before;
}, BEFORE, { timeout: 180_000 });
await page.waitForTimeout(500);

const switched = await dom();
const now = await mainSession();
check("the tool frame switches the shell back to the resumed conversation",
  switched.session === TARGET && now === TARGET, { ...switched, now, TARGET });
check("the resumed conversation's history is on screen (beta), and nothing is left over",
  /beta/i.test(switched.messages) && switched.count === 1, switched);
check("the workspace is otherwise untouched: one main tab, still at /",
  switched.tabs.length === 1 && switched.tabs[0] === "main" && switched.path === "/", switched);

console.log(JSON.stringify({ ok: checks.every((c) => c.pass), checks }, null, 2));
if (!checks.every((c) => c.pass)) process.exitCode = 1;
EOF
```

Expected: 4 checks, `ok: true`.

On the pre-fix code (no `main-resume` at all) section 2's pointer never moves, and the browser
check would sit on the old session until its 180 s timeout.

## Teardown

```bash
pkill -f "serve-log --root $ROOT" 2>/dev/null || true
pkill -f "serve-static --root $ROOT" 2>/dev/null || true
pkill -f "main.ts.*--root $ROOT" 2>/dev/null || true
for p in 9030 9031 9032 9033; do pkill -f "serve-web.*--port $p" 2>/dev/null || true; done
rm -rf "$ROOT"
```

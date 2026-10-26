# Test: core-ai-main-new

`main-new` 是 main 的第 6 个工作区工具：**把 main 换成一段新对话**。工具做两件事 ——
`/ai/new {kind: main}` 造会话，`/log/current/put` 把 `mainSession` 指针指过去；前端收到
`engineer-tool` 帧后 `refreshWorkspace()`，`doRefreshWorkspace()` 里既有的"main 换了 session
就跟过去"分支把屏幕换成新会话。

用例要钉住四件事：

- 工具真的换了指针：`current.mainSession` 变成新 id，新会话在 `sessions` 里是 `kind: main`，
  老的 main 记录还在（用户选的是 *replace*：留档、界面上没有回去的路）；
- 新的 main 是真的 main：还能问、还是 `kind: main`；
- **sub 没有这个工具**（名字不在 `WORKSPACE_TOOLS` 里）；
- **前端真的切过去**：`#panes engineer-chat` 的 `session` 变成新 id，旧元素从 DOM 摘掉，
  tab bar 仍是 main、地址仍是 `/`。

Source of truth: `workspace/ai/src/workspace.ts`（`mainNew`）、`workspace/ai/src/registry.ts`
（`WORKSPACE_TOOLS` / `newMainSession`）、`workspace/web/app.js`（`makeMainTab` 的
`engineer-tool` 正则 + `doRefreshWorkspace` 的跟指针分支）。

## ⚠️ 这个用例需要真模型

工具只能由模型调用，没有 HTTP 入口（与 `case-core-session-delete` 同一约束）。pi 自己的认证
（环境变量或 `~/.pi/agent/auth.json`）没配好时，第 1 节就是红的。ai 用真模型启动（**不加** `--stub`）。

## ⚠️ 要它调工具，不要它给结果

模型很可能用 `bash` + `curl` 自己去读写 log，那样被测的代码一行都没跑。所以每节都明确写
**"call the main-new tool right now … do not use bash or curl"**；断言看状态（log），
"工具真的被调了"另查这一段会话的记录里有没有 `name: main-new`。

## Setup

Run from the project root (the directory holding `engineer.yaml`).

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.main-new"
# log's database and the project board live in the engineer home, not in a project.
HOME_DIR="$ROOT/home"
: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 9020 9021 9022 9023; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

rm -rf "$ROOT" && mkdir -p "$HOME_DIR"
printf 'project: main-new\n' > "$ROOT/engineer.yaml"
# the browser part runs in Node, outside this shell's cwd: it reads the root from here
printf '%s\n' "$ROOT" > /tmp/main-new-root

# one blueprint: section 3 needs a real sub agent to show it has no such tool
mkdir -p "$ROOT/.agents/blueprints/demo"
printf '# Demo\n\na page\n' > "$ROOT/.agents/blueprints/demo/README.md"
printf '<!doctype html><title>Demo</title>demo<engineer-chat></engineer-chat>\n' > "$ROOT/.agents/blueprints/demo/index.html"

(cd how-to/deploy/prod && go build -o /tmp/engineer-main-new .)
/tmp/engineer-main-new serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 9021 >/tmp/main-new-log.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:9021/log/project/list -d '{}' && break
  sleep 1
done
curl -s -X POST http://localhost:9021/log/project/add -H 'Content-Type: application/yaml' \
  --data-binary "path: $ROOT" | awk '$1=="projectId:" {print $2}' > /tmp/main-new-project
PROJECT=$(cat /tmp/main-new-project)
/tmp/engineer-main-new serve-static --log http://localhost:9021 --bind 127.0.0.1 --port 9022 >/tmp/main-new-static.log 2>&1 &

(cd workspace/ai && bun run src/main.ts --bind 127.0.0.1 --port 9023 --home "$HOME_DIR" \
  --log http://localhost:9021 --static http://localhost:9022 \
  --agents "$ROOTDIR/agents" >/tmp/main-new-ai.log 2>&1 &)

/tmp/engineer-main-new serve-web --bind 127.0.0.1 --port 9020 --assets "$ROOTDIR/workspace/web" \
  --static http://localhost:9022 --ai http://localhost:9023 --log http://localhost:9021 \
  >/tmp/main-new-web.log 2>&1 &

LOG=http://localhost:9021
AI=http://localhost:9023
for i in $(seq 1 90); do
  curl -s -o /dev/null -m 2 -X POST $LOG/log/current/get -d '{}' \
    && curl -s -o /dev/null -m 2 -X POST $AI/ai/resume -d 'id: x' \
    && curl -s -o /dev/null -m 2 http://localhost:9020/ && break
  sleep 1
done

# ask <sessionId> <text>: ask, then block until the run settles (the stream
# closes on agent_settled), so the next assertion runs after the tool finished.
# The body is JSON (valid YAML): a prompt with a colon in it stays one mapping
# value instead of turning into a parse error.
ask() {
  python3 - "$1" "$2" > /tmp/main-new-ask.json <<'PY'
import json, sys
print(json.dumps({"id": sys.argv[1],
                  "blocks": [{"type": "text", "text": sys.argv[2]}]}))
PY
  curl -s -o /dev/null -X POST $AI/ai/ask --data-binary @/tmp/main-new-ask.json
  curl -s -N -X POST $AI/ai/stream -d "id: $1" >/dev/null
}
sid() { python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin)["sessionId"])'; }
mainid() { curl -s -X POST $LOG/log/current/get -d '{}' | python3 -c 'import sys,yaml;print(yaml.safe_load(sys.stdin).get("mainSession") or "")'; }
```

Expected on startup: `serve-web` logs its address on `:9020`, and the ai service does **not** say
`--stub: model calls disabled` (a stub here makes every section below vacuous).

## 1. the tool moves main to a fresh conversation

```bash
MAIN1=$(curl -s -X POST $AI/ai/new -d 'kind: main' | sid)
curl -s -o /dev/null -X POST $LOG/log/current/put -d "openSessions: []
mainSession: $MAIN1"
echo "before: $MAIN1"

ask $MAIN1 "Call the main-new tool right now. Do not use bash or curl, and do not ask me anything — just call the tool and report its exact reply."

MAIN2=$(mainid)
echo "after:  $MAIN2"
curl -s -X POST $LOG/log/current/get -d '{}'
curl -s -X POST $LOG/log/session/detail -d "sessionId: $MAIN2"
curl -s -o /dev/null -w 'old main: %{http_code}\n' -X POST $LOG/log/session/detail -d "sessionId: $MAIN1"
curl -s -X POST $LOG/log/session/messages -d "sessionId: $MAIN1" | grep -c 'name: main-new' || true
```

Expected:

- `after:` is a different, non-empty `s_…` id — the pointer moved;
- `log/current/get` still shows `openSessions: []` — the tool writes the open list back untouched,
  it does not close tabs;
- the new id's `session/detail` says `kind: main` (it is main, not a blueprint agent);
- `old main: 200` — the previous conversation is still on record (replace, not delete);
- the `grep` finds **1** — the call really was the tool, not a `curl` from `bash`.

## 2. the new main is a working main

```bash
ask $MAIN2 "Reply with the single word: alive"
curl -s -X POST $LOG/log/session/messages -d "sessionId: $MAIN2" | grep -c 'alive' || true
echo "still: $(mainid)"
```

Expected: the stream comes back (no dead session), the records contain `alive`, and `still:` is
still `$MAIN2` — the new main did not quietly switch again.

## 3. a sub agent does not have the tool

```bash
PROJECT=$(cat /tmp/main-new-project)
SUB=$(curl -s -X POST $AI/ai/new \
  -H 'Content-Type: application/yaml' \
  --data-binary "$(printf 'projectId: %s\nblueprint: demo' "$PROJECT")" | sid)
ask $SUB "Call the main-new tool right now. Do not use bash or curl, and do not ask me anything — just call the tool and report its exact reply."
echo "current: $(mainid)  expected: $MAIN2"
curl -s -X POST $LOG/log/session/messages -d "sessionId: $SUB" | grep -c 'name: main-new' || true
```

Expected: `current:` is still `$MAIN2`, and `grep` prints `0` — the name is not in a sub's
allowlist, so no `main-new` call exists in its records. Whatever it says in prose, nothing moved.

## 4. the shell really switches to the new session

`BEFORE` is whatever `current.mainSession` says when the browser boots; the page must land on it,
and after main is told to call the tool the element in `#panes` must be a **different** session —
the one log now points at — with the old element gone.

Prerequisite: `ego-browser` on `PATH`.

```bash
BEFORE=$(mainid)
printf '%s\n' "$BEFORE" > /tmp/main-new-before
echo "browser boots on: $BEFORE"

ego-browser nodejs <<'EOF'
const fs = await import("node:fs/promises");
const WEB = "http://localhost:9020/";
const LOG = "http://localhost:9021";
const BEFORE = (await fs.readFile("/tmp/main-new-before", "utf8")).trim();
const task = await taskSpace("core-ai-main-new");
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
    active: (document.querySelector("#tabs .tab.active")?.textContent || "").trim().replace(/×$/, ""),
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
check("the shell boots on the main session log points at", booted.session === BEFORE, { ...booted, BEFORE });

await type("Call the main-new tool right now. Do not use bash or curl, and do not ask me anything — just call the tool and report its exact reply.");
await page.waitForFunction((before) => {
  const chat = document.querySelector("#panes engineer-chat");
  const now = chat?.getAttribute("session") || "";
  return now && now !== before;
}, BEFORE, { timeout: 180_000 });
await page.waitForTimeout(500);

const switched = await dom();
const now = await mainSession();
check("the tool frame makes the shell switch to the session log now points at",
  switched.session === now && now !== BEFORE, { ...switched, now, BEFORE });
check("the old main element is gone and main is still the first tab at /",
  switched.count === 1 && switched.tabs.length === 1 && switched.tabs[0] === "main" &&
  switched.active === "main" && switched.path === "/", switched);

// the new main is live: it answers, on the same session
await page.waitForFunction(() => {
  const chat = document.querySelector("#panes engineer-chat");
  return !!chat?.shadowRoot?.querySelector(".ai-input-field");
}, undefined, { timeout: 30_000 });
await type("Reply with the single word: alive");
await page.waitForFunction(() => {
  const chat = document.querySelector("#panes engineer-chat");
  return /alive/i.test(chat?.shadowRoot?.querySelector(".ai-messages")?.textContent || "");
}, undefined, { timeout: 180_000 });
const after = await dom();
const still = await mainSession();
check("the new main works and stayed the one on screen",
  after.session === switched.session && /alive/i.test(after.messages) && still === switched.session,
  { session: after.session, still });

console.log(JSON.stringify({ ok: checks.every((c) => c.pass), checks }, null, 2));
if (!checks.every((c) => c.pass)) process.exitCode = 1;
EOF
```

Expected: 4 checks, `ok: true`.

On the pre-fix code (the `engineer-tool` listener matching only `^(tab-|session-)`) the second
check is the one that fails: the tool still moves log's pointer, but no refresh runs, so
`#panes engineer-chat` keeps the old session id — measured on the unfixed file: `dom_after`
unchanged, `log_now` a new id (the `waitForFunction` then waits out its 180 s). That divergence
between log and the screen is the reproduction, not a flaky check.

## Teardown

```bash
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "serve-static --log http://localhost:9021" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 9020 9021 9022 9023; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
rm -rf "$ROOT"
```

# Test: core-web-input-history
The chat composer behaves like a CLI prompt line: ArrowUp walks back through the
conversation's prompts (newest first), and ArrowDown walks forward again, giving
the unsent draft back at the end. The list belongs to the *conversation*, not to
the tab or to the page: closing a tab and reopening it, switching away and back,
reloading, or arriving by deep link all find it again — because the conversation's
own stored turns are read back on every replay (`aiLoadSession` walks
`/log/session/messages` anyway, so the recall list costs no extra request).

Source of truth: `workspace/web/app.js` (`aiPromptHistory` / `aiHistorySeed` /
`aiHistoryUp` / `aiHistoryDown` / `aiHistoryRecord` / `aiCaretVisualLine` plus the
`keydown` on `#ai-input-field`). The behaviour *is* keystrokes over a live
textarea, so it is driven through a real browser (`ego-browser`) instead of curl:
"is the caret on the first rendered line" cannot be observed without a layout
engine.

## Setup

Prerequisite: `ego-browser` on `PATH` (`ego-browser --version`).

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.input-history-test"
HOME_DIR="$ROOT/home"
rm -rf "$ROOT" && mkdir -p "$HOME_DIR"
printf 'project: input-history-test\n' > "$ROOT/engineer.yaml"

# Guard first: with an empty $HOME_DIR the pattern below degrades to
# "serve-storage --home " and kills every service on the machine —
# including the one running the agent. Fail loudly instead.
: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
# Reclaim a previous run of this case. A leftover service keeps serving its
# old database (or silently stops this run's from binding, so the frontend
# talks to the other case's services) — and the failure that causes looks
# like a wrong answer, not a dead service. This happens before, not after.
pkill -f "serve-storage --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 8930 8932 8933; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-storage --home "$HOME_DIR" --bind 127.0.0.1 --port 8930 >/tmp/input-history-log.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8930/log/project/list -d '{}' && break
  sleep 1
done
curl -s -o /dev/null -X POST http://localhost:8930/log/project/add \
  -H 'Content-Type: application/yaml' --data-binary "path: $ROOT"
# its own static: the launcher reads the project's tree through it, by projectId

(cd workspace/ai && bun run src/main.ts --home "$HOME_DIR" --bind 127.0.0.1 --port 8932 --stub \
  --storage http://localhost:8930 \
  --agents "$ROOTDIR/agents" --docs "$ROOTDIR/.engineer/docs" >/tmp/input-history-ai.log 2>&1 &)
sleep 2
# wait for ai: the first /ai/new must not race the boot
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8932/ai/new -d 'kind: main' && break
  sleep 1
done

/tmp/engineer serve-web --bind 127.0.0.1 --port 8933 --assets "$ROOTDIR/workspace/web" \
  --storage http://localhost:8930 --ai http://localhost:8932 \
  >/tmp/input-history-web.log 2>&1 &
```

Expected on startup: `engineer ai: --stub: model calls disabled (echo stub)`,
`engineer web: http://localhost:8933`.

## Run

```bash
WEB_URL=http://localhost:8933 ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:8933";
const space = await taskSpace("core-web-input-history");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });

const path = () => page.evaluate(() => location.pathname);
// 输入框在可见 tab 的 <engineer-chat> 的 shadow root 里，读与按键都要穿过它。
const FIND = `(() => { const h = document.querySelector("#panes .view:not([hidden])");
  return h && h.tagName === "ENGINEER-CHAT" && h.shadowRoot && h.shadowRoot.querySelector(".ai-input-field"); })()`;
const field = () =>
  page.evaluate((f) => {
    const el = eval(f);
    return el ? { value: el.value, start: el.selectionStart, end: el.selectionEnd } : { value: null };
  }, FIND);
const fill = (text) =>
  page.evaluate(([t, f]) => {
    const el = eval(f);
    el.focus();
    el.value = t;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, [text, FIND]);
const key = (k) =>
  page.evaluate(([k, f]) => {
    const el = eval(f);
    el.focus();
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  }, [k, FIND]);
const up = () => key("ArrowUp");
const down = () => key("ArrowDown");
const enter = () =>
  page.evaluate((f) => {
    const el = eval(f);
    el.focus();
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  }, FIND);
// The replay is what seeds the list, so nothing may be pressed before it landed.
const MESSAGES = `(() => { const h = document.querySelector("#panes .view:not([hidden])");
  return h && h.shadowRoot && h.shadowRoot.querySelector(".ai-messages"); })()`;
const messagesText = () => page.evaluate((f) => (eval(f)?.textContent || ""), MESSAGES);
const replayed = (text) =>
  page.waitForFunction(
    (t) => (eval(`(() => { const h = document.querySelector("#panes .view:not([hidden])"); return h && h.shadowRoot && h.shadowRoot.querySelector(".ai-messages"); })()`)?.textContent || "").includes(t),
    text, { timeout: 15_000 });
// The stub answers with "<prompt>" echoed, so n "dev stub" strings mean n runs.
const settled = (n) =>
  page.waitForFunction(
    (c) => ((eval(`(() => { const h = document.querySelector("#panes .view:not([hidden])"); return h && h.shadowRoot && h.shadowRoot.querySelector(".ai-messages"); })()`)?.textContent || "").match(/dev stub/g) || []).length >= c,
    n, { timeout: 30_000 });
// main 就是外壳自己的那条对话，一直在屏幕上：它的 composer 拿来当空白输入框。
const newChat = async () => {
  await page.click("loc=css:#tabs .tab.main");
  await page.waitForFunction(() => {
    const h = document.querySelector("#panes .view:not([hidden])");
    return !!h && h.tagName === "ENGINEER-CHAT" && !!h.shadowRoot?.querySelector(".ai-input-field");
  });
};

await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs", { state: "visible" });
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector("#tabs", { state: "visible" });

// a blank chat from the launcher: no skill needed, the composer is what matters
await newChat();
const send = async (text, n) => {
  await fill(text);
  await enter();
  await settled(n);
};
await send("prompt one", 1);
await send("prompt two", 2);
await send("prompt three", 3);
check("sent prompts land in the message area", (await field()).value === "" &&
  await page.evaluate((f) => (eval(f)?.querySelectorAll(".ai-msg.ai-user").length || 0) === 3, MESSAGES));

// 1. ArrowUp walks back, newest first
await up();
check("ArrowUp recalls the newest prompt", (await field()).value === "prompt three", await field());
await up();
check("ArrowUp again walks back", (await field()).value === "prompt two", await field());
await up();
check("ArrowUp reaches the oldest prompt", (await field()).value === "prompt one", await field());
await up();
check("ArrowUp at the oldest stops there", (await field()).value === "prompt one", await field());
const recalled = await field();
check("a recalled prompt puts the caret at the end",
  recalled.start === "prompt one".length && recalled.end === "prompt one".length, recalled);

// 2. ArrowDown walks forward, then gives the draft back (it was empty)
await down();
check("ArrowDown walks forward", (await field()).value === "prompt two", await field());
await down();
await down();
check("ArrowDown past the newest returns the (empty) draft",
  (await field()).value === "", await field());

// 3. an unsent draft comes back
await fill("an unsent draft");
await up();
check("ArrowUp replaces the draft with the newest prompt",
  (await field()).value === "prompt three", await field());
await down();
check("ArrowDown restores the unsent draft",
  (await field()).value === "an unsent draft", await field());
await fill("");

// 4. editing a recalled prompt leaves browsing (the edit is kept, not overwritten)
await up();
await page.evaluate((f) => { const el = eval(f); el.focus(); }, FIND);
await page.keyboard.type(" edited");
const edited = await field();
await down();
check("editing a recalled prompt leaves history browsing",
  edited.value === "prompt three edited" && (await field()).value === "prompt three edited",
  { edited: edited.value, afterDown: (await field()).value });
await fill("");

// 5. a multi-line draft: ArrowUp does not recall while there is a line above.
// 光标上移是 textarea 的原生行为，合成的 KeyboardEvent 不会触发它，所以这里只钉
// 组件自己的那半：值不被替换成历史里的 prompt。
await fill("line one\nline two");
const multiBefore = await field();
await up();
check("on a multi-line draft ArrowUp does not recall",
  (await field()).value === "line one\nline two",
  { before: multiBefore.value, after: (await field()).value });

// 6. the same holds for a soft-wrapped long line: the check is the rendered line
await fill("the quick brown fox jumps over the lazy dog ".repeat(8));
const wrapped = await page.evaluate((f) => {
  const el = eval(f);
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 18;
  return { value: el.value, lines: Math.round(el.scrollHeight / lh) };
}, FIND);
await up();
check("a soft-wrapped draft counts as multi-line (ArrowUp does not recall)",
  wrapped.lines >= 2 && (await field()).value === wrapped.value,
  { renderedLines: wrapped.lines, after: (await field()).value.slice(0, 24) });
await fill("");

// 7. a reload reseeds the list: the conversation is replayed from storage, and
// its prompts are browsable again
await page.reload();
await replayed("prompt three");
await newChat();
await up();
check("a reload keeps the conversation's history",
  (await field()).value === "prompt three", await field());
await fill("");

const ok = checks.every((c) => c.pass);
console.log(JSON.stringify({ ok, checks }, null, 2));
await space.finish({ keep: [] });
if (!ok) process.exitCode = 1;
EOF
```

Expected: `"ok": true` and every check `"pass": true` — ArrowUp walks back
through the three prompts sent in this conversation and stops at the oldest;
ArrowDown walks forward and returns the empty draft; an unsent draft comes back
after browsing; editing a recalled prompt leaves browsing with the edit kept;
ArrowUp on a multi-line or soft-wrapped draft does not recall (the caret move itself
is the textarea's native action, which a synthetic key event does not perform); a reload
keeps the conversation's history (it is replayed from storage and reseeds the
list). Exit code `0`.

删掉的断言（对应当前已经不存在的东西）: 斜杠命令抽屉（`/resume`、`/new`）、旧
launcher 的 `#newtab` 行、`/chat/<id>` 路由、`data-tab-id` 的关 tab 流程。同一条
"每条对话有自己的历史"的保证，在别处由 `case-core-log-workspace` 的会话记录覆盖。

Not covered here (checked by hand): a prompt sent with a pasted image is not
recorded, and the arrows do not recall while an image is staged in the composer
— both need a real clipboard image, which this case does not paste.

## Teardown

```bash
pkill -f 'serve-web.*--port 8933'
pkill -f 'main.ts.*--port 8932'
pkill -f 'serve-storage.*--port 8930'
```

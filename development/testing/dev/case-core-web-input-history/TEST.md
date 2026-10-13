# Test: core-web-input-history

The chat composer behaves like a CLI prompt line: ArrowUp walks back through the
conversation's prompts (newest first), and ArrowDown walks forward again, giving
the unsent draft back at the end. The list belongs to the *conversation*, not to
the tab or to the page: closing a tab and reopening it, switching away and back,
reloading, or arriving by deep link all find it again — because the conversation's
own stored turns are read back on every replay (`aiLoadSession` walks
`/log/session-detail` anyway, so the recall list costs no extra request).

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
rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: input-history-test\n' > "$ROOT/engineer.yaml"

# Guard first: with an empty $ROOT the pattern below degrades to
# "serve-log --root " and kills every service on the machine —
# including the one running the agent. Fail loudly instead.
: "${ROOT:?this case must set ROOT before reclaiming}"
# Reclaim a previous run of this case. A leftover service keeps serving its
# old database (or silently stops this run's from binding, so the frontend
# talks to the other case's services) — and the failure that causes looks
# like a wrong answer, not a dead service. This happens before, not after.
pkill -f "serve-log --root $ROOT" 2>/dev/null || true
pkill -f "serve-static --root $ROOT" 2>/dev/null || true
pkill -f "main.ts.*--root $ROOT" 2>/dev/null || true
for p in 8930 8931 8932 8933; do pkill -f "serve-web.*--port $p" 2>/dev/null || true; done
sleep 1

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --root "$ROOT" --bind 127.0.0.1 --port 8930 >/tmp/input-history-log.log 2>&1 &
# its own static, rooted at $ROOT: the launcher reads skills from static
/tmp/engineer serve-static --root "$ROOT" --bind 127.0.0.1 --port 8931 >/tmp/input-history-static.log 2>&1 &

(cd workspace/ai && bun run src/main.ts --root "$ROOT" --bind 127.0.0.1 --port 8932 --stub \
  --log http://localhost:8930 --static http://localhost:8931 \
  --agents "$ROOTDIR/agents/AGENTS.md" >/tmp/input-history-ai.log 2>&1 &)
sleep 2
# wait for ai: the first /ai/new must not race the boot
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8932/ai/new -d '{}' && break
  sleep 1
done

/tmp/engineer serve-web --bind 127.0.0.1 --port 8933 --assets "$ROOTDIR/workspace/web" \
  --pages /tmp/engineer-pages-unused \
  --static http://localhost:8931 --ai http://localhost:8932 --log http://localhost:8930 \
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
const field = () => page.evaluate(() => {
  const el = document.getElementById("ai-input-field");
  return { value: el.value, start: el.selectionStart, end: el.selectionEnd };
});
const up = () => page.press("#ai-input-field", "ArrowUp");
const down = () => page.press("#ai-input-field", "ArrowDown");
// The replay is what seeds the list, so nothing may be pressed before it landed.
const replayed = (text) =>
  page.waitForFunction(
    (t) => (document.querySelector("#ai-messages")?.textContent || "").includes(t),
    text, { timeout: 15_000 });
// The stub answers with "<prompt>" echoed, so n "dev stub" strings mean n runs.
const settled = (n) =>
  page.waitForFunction(
    (c) => ((document.getElementById("ai-messages")?.textContent || "").match(/dev stub/g) || []).length >= c,
    n, { timeout: 30_000 });
const openLauncher = async () => {
  await page.click("#tab-add");
  await page.waitForSelector('#newtab [data-action="newchat"]', { state: "visible" });
};
const newChat = async () => {
  await openLauncher();
  await page.click('#newtab [data-action="newchat"]');
  await page.waitForSelector("#ai-input-field", { state: "visible" });
  await page.waitForFunction(() => !document.getElementById("panes").hidden);
};

await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs", { state: "visible" });
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector("#tabs", { state: "visible" });

// a blank chat from the launcher: no skill needed, the composer is what matters
await newChat();
const tabA = (await path()).split("/")[2];
const send = async (text, n) => {
  await page.fill("#ai-input-field", text);
  await page.press("#ai-input-field", "Enter");
  await settled(n);
};
await send("prompt one", 1);
await send("prompt two", 2);
await send("prompt three", 3);
check("sent prompts land in the message area", (await field()).value === "" &&
  await page.evaluate(() => document.querySelectorAll("#ai-messages .ai-msg.ai-user").length === 3));

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
await page.fill("#ai-input-field", "an unsent draft");
await up();
check("ArrowUp replaces the draft with the newest prompt",
  (await field()).value === "prompt three", await field());
await down();
check("ArrowDown restores the unsent draft",
  (await field()).value === "an unsent draft", await field());
await page.fill("#ai-input-field", "");

// 4. editing a recalled prompt leaves browsing (the edit is kept, not overwritten)
await up();
await page.keyboard.type(" edited");
const edited = await field();
await down();
check("editing a recalled prompt leaves history browsing",
  edited.value === "prompt three edited" && (await field()).value === "prompt three edited",
  { edited: edited.value, afterDown: (await field()).value });
await page.fill("#ai-input-field", "");

// 5. a multi-line draft: ArrowUp on the last line moves the caret, it does not recall
await page.fill("#ai-input-field", "line one\nline two");
const multiBefore = await field();
await up();
check("on a multi-line draft ArrowUp only moves the caret",
  (await field()).value === "line one\nline two" && (await field()).start < multiBefore.start,
  { before: multiBefore, after: await field() });

// 6. the same holds for a soft-wrapped long line: the check is the rendered line
await page.fill("#ai-input-field", "the quick brown fox jumps over the lazy dog ".repeat(8));
const wrapped = await page.evaluate(() => {
  const el = document.getElementById("ai-input-field");
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 18;
  return { value: el.value, lines: Math.round(el.scrollHeight / lh) };
});
await up();
check("a soft-wrapped draft counts as multi-line (ArrowUp does not recall)",
  wrapped.lines >= 2 && (await field()).value === wrapped.value,
  { renderedLines: wrapped.lines, after: (await field()).value.slice(0, 24) });
await page.fill("#ai-input-field", "");

// 7. the command drawer keeps the arrow keys while it is open
await page.fill("#ai-input-field", "/");
await page.waitForSelector("#ai-cmd:not([hidden])", { state: "visible", timeout: 5_000 });
const activeBefore = await page.evaluate(
  () => document.querySelector("#ai-cmd .ai-cmd-item.active")?.textContent.trim());
await down();
const activeAfter = await page.evaluate(
  () => document.querySelector("#ai-cmd .ai-cmd-item.active")?.textContent.trim());
check("the open command drawer owns the arrow keys",
  !!activeBefore && !!activeAfter && activeBefore !== activeAfter && (await field()).value === "/",
  { activeBefore, activeAfter });
await page.keyboard.press("Escape");
await page.fill("#ai-input-field", "");

// 8. a second tab is a second conversation: its history is its own
await newChat();
const tabB = (await path()).split("/")[2];
await send("second conversation", 1);
await up();
check("a second conversation recalls its own prompt",
  tabB && tabB !== tabA && (await field()).value === "second conversation", { tabA, tabB, value: (await field()).value });
await page.click("loc=css:#tabs .tab[data-tab-id] >> nth=0");
await page.waitForFunction((id) => location.pathname === `/chat/${id}`, tabA, { timeout: 10_000 });
await up();
check("the first tab still recalls its own, not the other conversation's",
  (await field()).value === "prompt three", await field());
await page.fill("#ai-input-field", "");

// 9. closing the tab and reopening it from the launcher keeps the history: it is
// read back from the conversation's stored turns
await page.click("loc=css:#tabs .tab[data-tab-id].active .tab-close");
await page.waitForFunction((id) => location.pathname !== `/chat/${id}`, tabA, { timeout: 5_000 });
await openLauncher();
// recent lists *tab records* (the key is a tabId, not the session id): the one
// just closed is the only one there, so the row is taken by position.
await page.waitForSelector('#newtab [data-section="recent"] .launch-item[data-action="opentab"]',
  { state: "visible", timeout: 15_000 });
await page.click('#newtab [data-section="recent"] .launch-item[data-action="opentab"] >> nth=0');
await replayed("prompt three");
await page.waitForSelector("#ai-input-field", { state: "visible" });
await up();
check("reopening a closed conversation keeps its history",
  (await field()).value === "prompt three", await field());
await page.fill("#ai-input-field", "");

// 10. so does a reload — the tab comes back and the replay reseeds the list
await page.reload();
await page.waitForFunction(() => !document.getElementById("panes").hidden,
  undefined, { timeout: 10_000 });
await replayed("prompt three");
await page.waitForSelector("#ai-input-field", { state: "visible" });
await up();
check("a reload keeps the conversation's history",
  (await field()).value === "prompt three", await field());
await page.fill("#ai-input-field", "");

// 11. /resume loads another conversation into this tab: the list follows the
// conversation, so it is that one's prompts and not the ones just browsed
await page.fill("#ai-input-field", "/resume");
await page.waitForSelector("#ai-cmd:not([hidden])", { state: "visible", timeout: 5_000 });
await page.press("#ai-input-field", "Enter");
await page.waitForSelector("#ai-cmd .ai-cmd-item.session", { state: "visible", timeout: 10_000 });
const pick = await page.evaluate(() => ({
  rows: document.querySelectorAll("#ai-cmd .ai-cmd-item.session").length,
  // pick a conversation other than this one, whatever the picker's order is
  index: [...document.querySelectorAll("#ai-cmd .ai-cmd-item.session")]
    .findIndex((el) => el.textContent.includes("second conversation")),
}));
for (let i = 0; i < Math.max(0, pick.index); i++) await page.press("#ai-cmd", "ArrowDown");
await page.press("#ai-cmd", "Enter");
await page.waitForFunction((id) => location.pathname !== `/chat/${id}`, tabA, { timeout: 10_000 });
await replayed("second conversation");
await up();
const resumed = await field();
await up();
check("a resumed conversation recalls its own prompts, not the previous one's",
  pick.rows >= 2 && pick.index >= 0 && resumed.value === "second conversation" &&
  (await field()).value === "second conversation",
  { resumeRows: pick.rows, picked: pick.index, first: resumed.value, second: (await field()).value });
await page.fill("#ai-input-field", "");

// 12. /new is a fresh conversation with nothing stored yet
const beforeNew = await path();
await page.fill("#ai-input-field", "/new");
await page.waitForSelector("#ai-cmd:not([hidden])", { state: "visible", timeout: 5_000 });
await page.press("#ai-input-field", "Enter");
await page.waitForFunction((p) => location.pathname !== p, beforeNew, { timeout: 10_000 });
await up();
check("/new starts with no history", (await field()).value === "", await field());

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
ArrowUp on a multi-line or soft-wrapped draft only moves the caret; the open
command drawer keeps the arrow keys; two tabs are two conversations and each
recalls its own; **closing a tab and reopening it from the launcher, and a
reload, both keep the conversation's history**; `/resume` brings the resumed
conversation's own prompts (not the previous one's); `/new` starts empty. Exit
code `0`.

Not covered here (checked by hand): a prompt sent with a pasted image is not
recorded, and the arrows do not recall while an image is staged in the composer
— both need a real clipboard image, which this case does not paste.

## Teardown

```bash
pkill -f 'serve-web.*--port 8933'
pkill -f 'main.ts.*--port 8932'
pkill -f 'serve-log.*--port 8930'
pkill -f 'serve-static.*--port 8931'
```

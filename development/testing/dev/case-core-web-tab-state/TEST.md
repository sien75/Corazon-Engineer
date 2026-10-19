# Test: core-web-tab-state

切换 tab **保住现场**。每个 tab 的树挂进 `#panes` 之后就一直留在文档里，切 tab 只切
`hidden`——因为浏览器会把"被摘出文档"的滚动元素的位置清零，也会让被摘除的 iframe
重新加载。本用例钉住四件事：

- 聊天 pane 切走再切回，滚动位置还在原处（不是顶部）；
- 离开时正在追底的 pane，回来时仍然在底（流在后台继续画）；
- page pane 的 iframe 切走再切回**没有重载**，页内位置也在；
- 借出去的 `#ai-*` id 始终唯一（失活 tab 的树也在文档里，收 id 得跨 tab）。

Source of truth: `workspace/web/app.js`（`showPanes` / `focusPane` / `renderPanes` /
`closeTab`）、`workspace/web/style.css`（`.pane-tree[hidden]`）。滚动位置与 iframe
是否重载都是浏览器行为，所以本用例跑真实浏览器（`ego-browser`）。

## Setup

Prerequisite: `ego-browser` on `PATH`（`ego-browser --version`）。

```bash
# A scratch project root: the case must not touch the real .agents/ or .engineer/
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.tab-state"
rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: tab-state\n' > "$ROOT/engineer.yaml"

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
for p in 8840 8841 8842 8843; do pkill -f "serve-web.*--port $p" 2>/dev/null || true; done
sleep 1

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --root "$ROOT" --bind 127.0.0.1 --port 8841 >/tmp/tab-state-log.log 2>&1 &
/tmp/engineer serve-static --root "$ROOT" --bind 127.0.0.1 --port 8842 >/tmp/tab-state-static.log 2>&1 &

(cd workspace/ai && bun run src/main.ts --root "$ROOT" --bind 127.0.0.1 --port 8843 --stub \
  --log http://localhost:8841 --static http://localhost:8842 \
  --agents "$ROOTDIR/agents" \
  >/tmp/tab-state-ai.log 2>&1 &)

# wait for ai first: the deep links below must not race the boot
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8843/ai/new -d '{}' && break
  sleep 1
done

# the fixture blueprint: a page tall enough to scroll that counts its own loads,
# so "was the iframe reloaded?" is a number and not a guess
mkdir -p "$ROOT/.agents/blueprints/state-probe"
cat > "$ROOT/.agents/blueprints/state-probe/index.html" <<'HTML'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>state-probe</title>
  <style>body { margin: 0; font: 13px system-ui } #tall { height: 4000px }</style>
</head>
<body>
<div id="tall"><p id="loads">loads: ?</p></div>
<script>
  const n = (Number(localStorage.getItem("probe.loads")) || 0) + 1;
  localStorage.setItem("probe.loads", String(n));
  document.getElementById("loads").textContent = "loads: " + n;
</script>
</body>
</html>
HTML

/tmp/engineer serve-web --bind 127.0.0.1 --port 8840 --assets "$ROOTDIR/workspace/web" \
  --pages "$ROOT/.agents/blueprints" \
  --static http://localhost:8842 --ai http://localhost:8843 --log http://localhost:8841 \
  >/tmp/tab-state-web.log 2>&1 &
```

Expected on startup: the ai service logs `--stub: model calls disabled`, the log
server logs its address on `:8841`, the static server on `:8842`, and the web
server logs `engineer web: http://localhost:8840`.

## Run

Three tabs, in bar order: chat **A**, chat **B**, page **state-probe**. The two
conversations are seeded through the same APIs the page uses (a long prompt the
dev stub echoes back, so each one is far taller than the window).

```bash
WEB_URL=http://localhost:8840 ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:8840";
const space = await taskSpace("core-web-tab-state");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });

const post = async (url, body) =>
  (await page.fetch(url, { method: "POST", headers: { "Content-Type": "application/yaml" }, body })).body;

await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs", { state: "visible" });
const ai = await page.evaluate(async () => (await import("/config.js")).ENGINEER.ai);
const log = await page.evaluate(async () => (await import("/config.js")).ENGINEER.log);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector("#tabs", { state: "visible" });

// 1. two conversations much taller than the window; the stub echoes the prompt.
const seed = async (tag) => {
  const created = await post(`${ai}/ai/new`, "{}");
  const sid = (created.match(/sessionId:\s*(\S+)/) || [])[1];
  const filler = Array.from({ length: 140 }, (_, i) =>
    `      session ${tag} filler line ${String(i + 1).padStart(3, "0")}\n`).join("");
  await post(`${ai}/ai/ask`, `id: ${sid}\nblocks:\n  - type: text\n    text: |\n${filler}`);
  return sid;
};
const sidA = await seed("A");
const sidB = await seed("B");
check("the two seed sessions were created", !!sidA && !!sidB, { sidA, sidB });
// The reply is written when the run settles: a deep link opened before that would
// replay only the user's own message, so wait for it in the log first.
for (const sid of [sidA, sidB]) {
  let seen = 0;
  for (let i = 0; i < 60; i++) {
    const detail = await post(`${log}/log/session-detail`, `sessionId: ${sid}`);
    seen = (String(detail).match(/role: assistant/g) || []).length;
    if (seen > 0) break;
    await page.waitForTimeout(500);
  }
  check(`session ${sid} recorded its reply`, seen > 0, { assistantRecords: seen });
}

// 2. one tab per conversation, then the page tab: three trees in the bar
await page.goto(`${WEB}/chat/${sidA}`);
await page.waitForFunction(() => document.querySelectorAll("#ai-messages .ai-msg").length >= 2,
  undefined, { timeout: 30_000 });
await page.goto(`${WEB}/chat/${sidB}`);
await page.waitForFunction(() => document.querySelectorAll("#tabs .tab[data-tab-id]").length === 2,
  undefined, { timeout: 15_000 });
await page.goto(`${WEB}/pages/state-probe`);
await page.waitForFunction(() => document.querySelectorAll("#tabs .tab[data-tab-id]").length === 3,
  undefined, { timeout: 15_000 });
const bar = await page.evaluate(() =>
  [...document.querySelectorAll("#tabs .tab[data-tab-id]")].map((t) => t.textContent.trim()));
check("the bar holds the two chats and the page, in that order",
  bar.length === 3 && bar[2].startsWith("state-probe"), { bar });

const state = () => page.evaluate(() => {
  const tree = document.querySelector("#panes .pane-tree:not([hidden])");
  const scroll = tree?.querySelector(".pane-scroll");
  const msgs = tree?.querySelector(".pane-messages");
  const frame = tree?.querySelector(".pane-frame");
  const win = frame?.contentWindow;
  return {
    trees: document.querySelectorAll("#panes .pane-tree").length,
    visibleTrees: document.querySelectorAll("#panes .pane-tree:not([hidden])").length,
    chats: tree?.querySelectorAll(".pane-chat").length || 0,
    text: (msgs?.textContent || "").slice(0, 40),
    messages: msgs?.querySelectorAll(".ai-msg").length || 0,
    scrollTop: scroll ? Math.round(scroll.scrollTop) : null,
    scrollHeight: scroll?.scrollHeight || 0,
    clientHeight: scroll?.clientHeight || 0,
    gap: scroll ? Math.round(scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight) : null,
    frameLoads: win ? win.localStorage.getItem("probe.loads") : null,
    frameScroll: win ? Math.round(win.scrollY) : null,
    idScrollers: document.querySelectorAll("#ai-scroll").length,
    idInputs: document.querySelectorAll("#ai-input").length,
    idFields: document.querySelectorAll("#ai-input-field").length,
    idLists: document.querySelectorAll("#ai-messages").length,
  };
});

// open a chat tab by index and wait until *its* conversation is the visible tree
const openChat = async (index, needle) => {
  await page.click(`loc=css:#tabs .tab[data-tab-id] >> nth=${index}`);
  await page.waitForFunction((n) => {
    const tree = document.querySelector("#panes .pane-tree:not([hidden])");
    return (tree?.querySelector(".pane-messages")?.textContent || "").includes(n);
  }, needle, { timeout: 30_000 });
  await page.waitForFunction(() => {
    const tree = document.querySelector("#panes .pane-tree:not([hidden])");
    return (tree?.querySelector(".pane-scroll")?.scrollHeight || 0) > 4000;
  }, undefined, { timeout: 30_000 });
};

// 3. the regression: read in the middle of A, leave, come back
await openChat(0, "session A filler");
const opened = await state();
// A tree is built the first time its tab is shown, so the bar can hold tabs that
// have no tree yet (the page tab, in this load, waits for step 6).
check("a chat tab opens as the only visible tree",
  opened.trees >= 2 && opened.visibleTrees === 1 && opened.chats === 1, opened);
const placed = await page.evaluate(() => {
  const s = document.querySelector("#panes .pane-tree:not([hidden]) .pane-scroll");
  s.scrollTop = 1500;
  return { scrollTop: Math.round(s.scrollTop), scrollHeight: s.scrollHeight };
});
check("the conversation is long enough to sit in the middle",
  placed.scrollTop > 1000 && placed.scrollHeight > 4000, placed);

await openChat(1, "session B filler");
await openChat(0, "session A filler");
const back = await state();
check("coming back to a tab keeps the scroll position it was left at",
  back.scrollTop !== null && Math.abs(back.scrollTop - placed.scrollTop) <= 2,
  { leftAt: placed.scrollTop, backAt: back.scrollTop });
check("the conversation itself did not come back empty",
  back.messages === opened.messages && back.messages >= 2, { messages: back.messages });

// 4. a pane that was following the bottom is still following after the switch
await page.evaluate(() => {
  const s = document.querySelector("#panes .pane-tree:not([hidden]) .pane-scroll");
  s.scrollTop = s.scrollHeight;
});
await openChat(1, "session B filler");
await openChat(0, "session A filler");
const followed = await state();
check("a pane that was at the bottom comes back at the bottom",
  followed.gap !== null && followed.gap <= 2, { gap: followed.gap });

// 5. the run keeps streaming into the tab you left, and it is still followed
await page.fill("#ai-input-field", "follow the run while I am away");
await page.click("#ai-send");
await openChat(1, "session B filler");
let answered = 0;
for (let i = 0; i < 60; i++) {
  const detail = await post(`${log}/log/session-detail`, `sessionId: ${sidA}`);
  answered = (String(detail).match(/role: assistant/g) || []).length;
  if (answered >= 2) break;
  await page.waitForTimeout(500);
}
check("the run in the background tab finished", answered >= 2, { assistantRecords: answered });
await openChat(0, "session A filler");
const streamed = await state();
check("the background run did reach the tab it belongs to",
  streamed.text.includes("session A filler") && streamed.messages >= 4, { messages: streamed.messages });
check("and the pane came back at the bottom, still following",
  streamed.gap !== null && streamed.gap <= 2, { gap: streamed.gap });

// 6. the page pane: leave and come back — the iframe must not reload
await page.click("loc=css:#tabs .tab[data-tab-id] >> nth=2");
await page.waitForFunction(() => !!document.querySelector("#panes .pane-tree:not([hidden]) .pane-frame"),
  undefined, { timeout: 15_000 });
await page.waitForTimeout(1500);
const pageOpened = await state();
const innerPlaced = await page.evaluate(() => {
  const w = document.querySelector("#panes .pane-tree:not([hidden]) .pane-frame").contentWindow;
  w.scrollTo(0, 900);
  return Math.round(w.scrollY);
});
check("the blueprint's own counter starts at one load",
  pageOpened.frameLoads === "1" && innerPlaced >= 890, pageOpened);

await openChat(0, "session A filler");
await page.click("loc=css:#tabs .tab[data-tab-id] >> nth=2");
await page.waitForFunction(() => !!document.querySelector("#panes .pane-tree:not([hidden]) .pane-frame"),
  undefined, { timeout: 15_000 });
await page.waitForTimeout(1500);
const pageBack = await state();
check("the page pane's iframe was not reloaded", pageBack.frameLoads === pageOpened.frameLoads,
  { before: pageOpened.frameLoads, after: pageBack.frameLoads });
check("and the page kept the position it was left at",
  pageBack.frameScroll !== null && Math.abs(pageBack.frameScroll - innerPlaced) <= 2,
  { leftAt: innerPlaced, backAt: pageBack.frameScroll });

// 7. three trees in the document, and the borrowed ids are still unique
await openChat(0, "session A filler");
const ids = await state();
check("every open tab's tree is in the document, one of them visible",
  ids.trees === 3 && ids.visibleTrees === 1, { trees: ids.trees, visible: ids.visibleTrees });
check("the borrowed ids belong to exactly one pane",
  ids.idScrollers === 1 && ids.idInputs === 1 && ids.idFields === 1 && ids.idLists === 1,
  { scrollers: ids.idScrollers, inputs: ids.idInputs, fields: ids.idFields, lists: ids.idLists });

const ok = checks.every((c) => c.pass);
console.log(JSON.stringify({ ok, checks }, null, 2));
await space.finish({ keep: [] });
if (!ok) process.exitCode = 1;
EOF
```

Expected: `"ok": true` 且每条 check 都 `"pass": true` —— 两个远超窗口高度的会话各自
成一个 tab，加上 page tab 共三棵树立在 `#panes` 里、同一时刻只有一棵可见；在 A 里把
对话滚到中间（`scrollTop` 1500）→ 切到 B → 切回 A，位置仍是 1500（修复前是 0），消息
条数不变；在 A 里贴到底 → 切走切回，仍在底（`gap ≤ 2`）；在 A 里发一句就切到 B，
后台那一跑照旧画进 A，切回 A 时回复已在、且仍停在底部；page pane 自己的加载计数切走
切回都是 `1`（没重载），页内 `scrollY` 仍是 900；三棵树同时在文档里时
`#ai-scroll` / `#ai-input` / `#ai-input-field` / `#ai-messages` 各自只有一个。退出码 `0`。

## Teardown

```bash
pkill -f 'serve-web.*--port 8840'
pkill -f '/tmp/engineer serve-log --root .*tab-state'
pkill -f 'main.ts.*--port 8843'
```

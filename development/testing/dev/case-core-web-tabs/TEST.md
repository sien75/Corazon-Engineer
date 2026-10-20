# Test: core-web-tabs

tab 条与 launcher。**一个 tab 就是一条开着的 session**：`current.openSessions` 里的每个
session id 画成一格，main 单独一格且不可关。所以本用例钉住的是"打开/关闭一条 session 等于
开/关一格 tab"，不是 tab 记录：

- boot 之后只有 `main`，`openSessions` 为空；
- `+` 打开 launcher，两个分区（Blueprints / Recent）；
- 点一个 blueprint → 造出一条新 session，它立刻成为一格活动 tab，标题是那个 blueprint 页面
  的 `<title>`，内容是 `/agent/<sessionId>/` 的 iframe；
- 点 `×` → tab 消失，`current.openSessions` 变空，但 session 行和它的记录还在；
- 从 launcher 的 Recent 再打开 → 同一条 session（同一个 id、同一格 tab），不是复制，
  而且页面把这段对话从 log 回放出来（历史不是空白）；
- 地址栏：tab 是 `/session/<sessionId>`，main 是 `/`；
- 重载回到 main，开着的 tab 按 `openSessions` 原样恢复，点它照样能看到回放的历史。

Source of truth: `workspace/web/app.js`（tab 条 / launcher / `activateTab` /
`doRefreshWorkspace` / `syncTabUrl`）、`workspace/web/components/chat.js`（`replayHistory`：
`/ai/resume` + `/log/session/messages`）、`workspace/web/style.css`（`#tabs .tab`、`.view`）、
`workspace/log`（`current` + `sessions` + `session/messages`）。不需要模型，ai 用 `--stub`：
历史用 `/log/mutation`（`kind: conversation`）直接写进 log。

## Setup

Prerequisite: `ego-browser` on `PATH`（`ego-browser --version`）。

```bash
# A scratch project root: the case must not touch the real .agents/ or .engineer/
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.tabs"
rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: tabs\n' > "$ROOT/engineer.yaml"

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
for p in 8980 8981 8982 8983; do pkill -f "serve-web.*--port $p" 2>/dev/null || true; done
sleep 1

# one blueprint, with a title the tab bar can show and a page that says who it is
mkdir -p "$ROOT/.agents/blueprints/probe"
cat > "$ROOT/.agents/blueprints/probe/index.html" <<'HTML'
<!doctype html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>Probe Page</title>
  <link rel="stylesheet" href="/theme.css">
</head>
<body>
  <h1 id="probe-page">probe page</h1>
  <engineer-chat autofocus></engineer-chat>
  <script type="module" src="/components/chat.js"></script>
</body>
</html>
HTML
printf '# Probe\n\nthe probe blueprint\n' > "$ROOT/.agents/blueprints/probe/README.md"

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --root "$ROOT" --bind 127.0.0.1 --port 8981 >/tmp/tabs-log.log 2>&1 &
/tmp/engineer serve-static --root "$ROOT" --bind 127.0.0.1 --port 8982 >/tmp/tabs-static.log 2>&1 &

(cd workspace/ai && bun run src/main.ts --root "$ROOT" --bind 127.0.0.1 --port 8980 --stub \
  --log http://localhost:8981 --static http://localhost:8982 \
  --agents "$ROOTDIR/agents" \
  >/tmp/tabs-ai.log 2>&1 &)

# wait for ai first: the boot below must not race it
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8980/ai/new -d '{}' && break
  sleep 1
done

/tmp/engineer serve-web --bind 127.0.0.1 --port 8983 --assets "$ROOTDIR/workspace/web" \
  --blueprints "$ROOT/.agents/blueprints" \
  --static http://localhost:8982 --ai http://localhost:8980 --log http://localhost:8981 \
  >/tmp/tabs-web.log 2>&1 &
sleep 1
```

Expected on startup: the ai service logs `--stub: model calls disabled`, the log
server logs its address on `:8981`, the static server on `:8982`, and the web server
logs `engineer web: http://localhost:8983`.

## Run

```bash
WEB_URL=http://localhost:8983 ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:8983";
const space = await taskSpace("core-web-tabs");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });

const post = async (url, body) =>
  (await page.fetch(url, { method: "POST", headers: { "Content-Type": "application/yaml" }, body })).body;
const current = async () => {
  const cfg = await page.evaluate(async () => (await import("/config.js")).ENGINEER);
  return post(`${cfg.log}/log/current/get`, "{}");
};
// openSessions comes back as yaml: a flow list when empty, a block list otherwise.
const openIds = async () => {
  const body = await current();
  const flow = body.match(/openSessions:\s*\[([^\]]*)\]/);
  if (flow) return flow[1].split(",").map((s) => s.trim()).filter(Boolean);
  const start = body.indexOf("openSessions:");
  if (start < 0) return [];
  const ids = [];
  for (const line of body.slice(start).split("\n").slice(1)) {
    const m = line.match(/^\s*-\s*(\S+)\s*$/);
    if (!m) break;
    ids.push(m[1]);
  }
  return ids;
};
const bar = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("#tabs .tab")].map((t) => ({
      label: t.querySelector(".tab-label")?.textContent.trim(),
      active: t.classList.contains("active"),
      main: t.classList.contains("main"),
      closable: !!t.querySelector(".tab-close"),
    })),
  );

await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs .tab.main", { state: "visible" });

// 1. boot: main alone, nothing open, and main is not closable
let b = await bar();
// A clean run starts with nothing open; the count is captured rather than assumed
// so the case also reads correctly when it is re-run against a used database.
const base = await openIds();
check("the bar is main plus one tab per open session",
  b.length === 1 + base.length && b[0].main && b[0].label === "main", { bar: b, base });
check("main is active and has no close button", b[0].active && !b[0].closable, { bar: b });
check("boot lands on main at /", new URL(await page.url()).pathname === "/", { url: await page.url() });

// 2. the launcher lists blueprints and recents
await page.click("#tab-add");
await page.waitForSelector("#launcher .launcher-sec", { state: "visible" });
const sections = await page.evaluate(() =>
  [...document.querySelectorAll("#launcher .launcher-sec h3")].map((h) => h.textContent.trim()));
check("the launcher has Blueprints and Recent, in that order",
  sections.length === 2 && sections[0].startsWith("Blueprints · 1") && sections[1].startsWith("Recent"),
  { sections });
const bpRow = await page.evaluate(() =>
  [...document.querySelectorAll("#launcher .launcher-sec")][0]
    ?.querySelector(".launcher-item .name")?.textContent.trim());
check("the blueprint row is named after its page title", bpRow === "Probe Page", { bpRow });

// 3. picking a blueprint makes a session and a tab
await page.click("loc=css:#launcher .launcher-sec:nth-of-type(1) .launcher-item:nth-of-type(1)");
// Wait for the open list to grow — a re-run may already have tabs from last time.
await page.waitForFunction((n) => document.querySelectorAll("#tabs .tab:not(.main)").length === n,
  base.length + 1, { timeout: 30_000 });
const opened = (await openIds()).find((id) => !base.includes(id));
b = await bar();
const newest = b[b.length - 1];
check("a new tab appeared, named after the page", !!opened && newest.label === "Probe Page", { bar: b, opened });
check("the new tab is active and closable", newest.active && newest.closable, { bar: b, newest });
check("the tab's address is its session", new URL(await page.url()).pathname === `/session/${opened}`,
  { path: new URL(await page.url()).pathname, opened });
await page.waitForFunction(
  (id) => {
    const f = document.querySelector("#panes iframe.view-page:not([hidden])");
    return !!f && f.src.includes(`/agent/${id}/`);
  },
  opened, { timeout: 30_000 });
const pageBody = await page.evaluate(() => {
  const f = document.querySelector("#panes iframe.view-page:not([hidden])");
  return { src: f?.src, probe: f?.contentDocument?.getElementById("probe-page")?.textContent };
});
check("the tab is an iframe onto /agent/<sessionId>/ and its page loaded",
  !!pageBody.src?.includes(`/agent/${opened}/`) && pageBody.probe === "probe page", pageBody);

// 3b. seed two recorded messages: replay reads records, not the model (--stub)
const LOG_URL = await page.evaluate(async () => (await import("/config.js")).ENGINEER.log);
const seed = (seq, role, raw, content) =>
  post(`${LOG_URL}/log/mutation`,
    `op: add\nkind: conversation\nsessionId: ${opened}\npayload:\n  seq: ${seq}\n  role: ${role}\n  content: ${JSON.stringify(content)}\n  raw: ${JSON.stringify(raw)}`);
await seed(1, "user", { role: "user", content: "seed question" }, "seed question");
await seed(2, "assistant", { role: "assistant", content: [{ type: "text", text: "seed answer" }] },
  "seed answer");
const seen = await post(`${LOG_URL}/log/session/messages`, `sessionId: ${opened}`);
check("the seeded messages are in log",
  String(seen).includes("seed question") && String(seen).includes("seed answer"), { seen });
// The conversation view is a shadow root inside the tab's iframe.
const chatText = () =>
  page.evaluate(() => {
    const f = document.querySelector("#panes iframe.view-page:not([hidden])");
    const shadow = f?.contentDocument?.querySelector("engineer-chat")?.shadowRoot;
    return shadow ? shadow.textContent.replace(/\s+/g, " ").trim() : "";
  });

// 4. closing a tab keeps the conversation
await page.click("loc=css:#tabs .tab:not(.main):last-of-type .tab-close");
await page.waitForFunction((n) => document.querySelectorAll("#tabs .tab:not(.main)").length === n,
  base.length, { timeout: 15_000 });
b = await bar();
check("the tab is gone and main is active again",
  b.filter((x) => !x.main).length === base.length && b[0].main, { bar: b });
check("closing took it out of the open list", (await openIds()).length === base.length,
  { open: await openIds() });
const stillThere = await post(
  await page.evaluate(async () => (await import("/config.js")).ENGINEER.log) + "/log/session/detail",
  `sessionId: ${opened}`);
check("the session row survived the close", String(stillThere).includes("Probe Page"), { stillThere });

// 5. the launcher's Recent reopens the same session
await page.click("#tab-add");
await page.waitForSelector("#launcher .launcher-sec", { state: "visible" });
const recentName = await page.evaluate(() =>
  [...document.querySelectorAll("#launcher .launcher-sec")][1]
    ?.querySelector(".launcher-item .name")?.textContent.trim());
check("Recent lists the closed session by its title", recentName === "Probe Page", { recentName });
await page.click("loc=css:#launcher .launcher-sec:nth-of-type(2) .launcher-item:nth-of-type(1)");
await page.waitForFunction((n) => document.querySelectorAll("#tabs .tab:not(.main)").length === n,
  base.length + 1, { timeout: 15_000 });
check("reopening puts the same session back in the open list", (await openIds()).includes(opened),
  { open: await openIds(), opened });
// 5b. the reopened page replays the conversation from log instead of a blank screen
await page.waitForFunction(
  () => {
    const f = document.querySelector("#panes iframe.view-page:not([hidden])");
    const shadow = f?.contentDocument?.querySelector("engineer-chat")?.shadowRoot;
    return !!shadow && shadow.textContent.includes("seed question");
  }, undefined, { timeout: 30_000 });
const replayed = await chatText();
check("the reopened tab replays its history from log",
  replayed.includes("seed question") && replayed.includes("seed answer"), { replayed });

// 6. switching tabs keeps both views in the document
await page.click("loc=css:#tabs .tab.main");
const views = await page.evaluate(() => ({
  views: document.querySelectorAll("#panes > .view").length,
  shown: document.querySelectorAll("#panes > .view:not([hidden])").length,
  mainShown: !document.querySelector("#panes > .view-main").hidden,
}));
// A tab's view is built the first time it is shown and then kept: main plus the
// tab this run opened is what has ever been on stage.
check("every shown tab keeps its view; only one is on stage",
  views.views === 2 && views.shown === 1 && views.mainShown, views);
check("main's address is /", new URL(await page.url()).pathname === "/", { path: new URL(await page.url()).pathname });

// 7. a reload comes back to main with the open list intact
await page.reload();
await page.waitForSelector("#tabs .tab.main", { state: "visible" });
await page.waitForFunction((n) => document.querySelectorAll("#tabs .tab:not(.main)").length === n,
  base.length + 1, { timeout: 30_000 });
b = await bar();
const afterReload = await page.evaluate(() => ({
  active: document.querySelector("#tabs .tab.active .tab-label")?.textContent.trim(),
  mainShown: !document.querySelector("#panes > .view-main").hidden,
}));
check("the tab bar came back from log",
  b.filter((x) => !x.main).length === base.length + 1 && b[b.length - 1].label === "Probe Page",
  { bar: b });
check("a reload lands on main, not on the tab you were on",
  afterReload.active === "main" && afterReload.mainShown, afterReload);

// 8. a reloaded shell still shows a restored tab's history
await page.click("loc=css:#tabs .tab:not(.main):last-of-type");
await page.waitForFunction(
  () => {
    const f = document.querySelector("#panes iframe.view-page:not([hidden])");
    const shadow = f?.contentDocument?.querySelector("engineer-chat")?.shadowRoot;
    return !!shadow && shadow.textContent.includes("seed question");
  }, undefined, { timeout: 30_000 });
const afterReloadChat = await chatText();
check("a tab restored after a reload replays its history too",
  afterReloadChat.includes("seed answer"), { afterReloadChat });
check("a restored tab is addressed by its session",
  new URL(await page.url()).pathname === `/session/${opened}`, { path: new URL(await page.url()).pathname });

console.log(JSON.stringify({ ok: checks.every((c) => c.pass), checks }, null, 2));
EOF
```

Expected: nine groups of checks pass and the script prints `"ok": true` — main alone at boot,
a launcher with Blueprints/Recent, a blueprint pick that turns into a tab named after its page and
addressed by `/session/<sessionId>`, two seeded messages in log, a close that keeps the conversation,
a reopen that returns the *same* session and replays its history into the page, views kept in the
document across a switch, and a reload that comes back to main with the open list restored — the
restored tab still addressed by its session, and still showing its replay.

## Teardown

```bash
pkill -f 'serve-web.*--port 8983'
pkill -f '/tmp/engineer serve-log --root .*tabs'
pkill -f '/tmp/engineer serve-static --root .*tabs'
pkill -f 'main.ts.*--port 8980'
rm -rf "$PWD/.engineer/.tabs"
```

# Test: core-web-tabs

tab 条、分组与 launcher。**一个 tab 就是一条开着的 session**（launcher tab 除外）：`current.openSessions`
里的每个 session id 画成一格，按 session 的 `projectId` 归到项目分组里；main 全局，不属任何分组。
本用例钉住的是：

- boot 之后只有 `main`，`openSessions` 为空；
- `+` 打开 **Engineer launcher**：项目棋盘（项目名 + `edit` / `eye` / `remove` + 添加输入）；
- launcher 图标挂在**分组里最后一个 tab 位**（不在 chip 上）：没打开时只是那枚图标，点开之后它变成
  **launcher tab**（图标当标签、激活时带下划线、**没有 ×、不可关闭**），地址
  `/project/<projectId>/new`，页面是该项目的 Blueprints / Recent；
- 点一个 blueprint → 造出一条新 session，它成为该项目分组里的一格活动 tab，标题是页面
  `<title>`，内容是 `/agent/<sessionId>/` 的 iframe；
- 点 `×` → session tab 消失、`openSessions` 变空，但 session 行和记录还在，**分组仍在**；
- 从 launcher tab 的 Recent 再打开 → 同一条 session，页面把历史从 log 回放出来；
- 地址栏：session tab 是 `/session/<sessionId>`，main 是 `/`，launcher tab 是 `/project/<id>/new`；
- `eye` 隐藏分组：chip 与它的 tab 都不画，但 `openSessions` 不变；再 `eye` 回来还是那些 tab；
- 重载 `/` 回到 main，开着的 session 按 `openSessions` 原样恢复。

Source of truth: `workspace/web/app.js`（分组 tab 条 / launcher / `activateTab` /
`doRefreshWorkspace` / `syncTabUrl`）、`workspace/web/components/chat.js`（`replayHistory`：
`/ai/resume` + `/log/session/messages`）、`workspace/web/style.css`（`#tabs .tab`、`.tab-group`、`.view`）、
`workspace/log`（`current` + `sessions` + `projects`）。不需要模型，ai 用 `--stub`：
历史用 `/log/mutation`（`kind: conversation`）直接写进 log。

## Setup

Prerequisite: `ego-browser` on `PATH`（`ego-browser --version`）。

```bash
# A scratch project root: the case must not touch the real .agents/ or .engineer/.
# log's database and the project board live in the engineer home, not in the project.
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.tabs"
HOME_DIR="$ROOT/home"
rm -rf "$ROOT" && mkdir -p "$HOME_DIR"
printf 'project: tabs\n' > "$ROOT/engineer.yaml"

# Guard first: with an empty $HOME_DIR the pattern below degrades to
# "serve-log --home " and kills every service on the machine —
# including the one running the agent. Fail loudly instead.
: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
# Reclaim a previous run of this case. A leftover service keeps serving its
# old database (or silently stops this run's from binding, so the frontend
# talks to the other case's services) — and the failure that causes looks
# like a wrong answer, not a dead service. This happens before, not after.
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 8980 8981 8982 8983; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
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
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 8981 >/tmp/tabs-log.log 2>&1 &
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8981/log/project/list -d '{}' && break
  sleep 1
done
# the scratch project is the one group this case works in
curl -s -o /dev/null -X POST http://localhost:8981/log/project/add \
  -H 'Content-Type: application/yaml' --data-binary "$(printf 'path: %s\nname: tabs' "$ROOT")"
/tmp/engineer serve-static --log http://localhost:8981 --bind 127.0.0.1 --port 8982 >/tmp/tabs-static.log 2>&1 &

(cd workspace/ai && bun run src/main.ts --home "$HOME_DIR" --bind 127.0.0.1 --port 8980 --stub \
  --log http://localhost:8981 --static http://localhost:8982 \
  --agents "$ROOTDIR/agents" \
  >/tmp/tabs-ai.log 2>&1 &)

# wait for ai first: the boot below must not race it
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8980/ai/new -d 'kind: main' && break
  sleep 1
done

/tmp/engineer serve-web --bind 127.0.0.1 --port 8983 --assets "$ROOTDIR/workspace/web" \
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

// The page has to be the shell before /config.js can be imported from it.
await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs .tab.main", { state: "visible" });
await page.waitForSelector("#tabs .tab-group", { state: "visible" });

const post = async (url, body) =>
  (await page.fetch(url, { method: "POST", headers: { "Content-Type": "application/yaml" }, body })).body;
const ENGINEER = await page.evaluate(async () => (await import("/config.js")).ENGINEER);
const projectList = async () => String(await post(`${ENGINEER.log}/log/project/list`, "{}"));
const PROJECT = (await projectList()).match(/projectId:\s*(\S+)/)[1];
const current = async () => post(`${ENGINEER.log}/log/current/get`, "{}");
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
// The bar is main plus one group per project; a group holds the launcher tab and
// the session tabs of that project.
const bar = () =>
  page.evaluate(() => ({
    tabs: [...document.querySelectorAll("#tabs .tab")].map((t) => ({
      label: t.querySelector(".tab-label")?.textContent.trim(),
      icon: !!t.querySelector("svg"),
      active: t.classList.contains("active"),
      main: t.classList.contains("main"),
      launcher: t.classList.contains("launcher"),
      entry: t.classList.contains("launcher-entry"),
      closable: !!t.querySelector(".tab-close"),
    })),
    groups: [...document.querySelectorAll("#tabs .tab-group")].map((g) => ({
      chip: g.querySelector(".group-label")?.textContent.trim(),
      expanded: g.classList.contains("expanded"),
      tabs: [...g.querySelectorAll(".tab")].map((t) => t.querySelector(".tab-label")?.textContent.trim()),
    })),
  }));
const sessionTabs = (b) => b.tabs.filter((t) => !t.main && !t.launcher);
const groupOf = (b, chip) => b.groups.find((g) => g.chip === chip);
// A tab's own padding, which is what its underline (border-bottom, the width of the
// box) shows: equal on both sides unless the tab carries a × — then the close button
// brings its own padding and the label sits closer to it.
const pads = (sel) => page.evaluate((s) => {
  const cs = getComputedStyle(document.querySelector(s));
  return { left: parseFloat(cs.paddingLeft), right: parseFloat(cs.paddingRight) };
}, sel);

// 1. boot: main alone, nothing open, main is not closable, the project has a group
let b = await bar();
// A clean run starts with nothing open; the count is captured rather than assumed
// so the case also reads correctly when it is re-run against a used database.
const base = await openIds();
check("the bar is main plus one tab per open session",
  sessionTabs(b).length === base.length && b.tabs[0].main && b.tabs[0].label === "main", { bar: b, base });
check("main is active and has no close button", b.tabs[0].active && !b.tabs[0].closable, { bar: b });
// 下划线是 tab 盒子上的 border-bottom，所以它会照出这个盒子左右的内边距：
// 没有 × 的 tab 两边一样宽，选中时那条线才不会一边长一边短。
check("main's label is padded equally on both sides (the underline is not lopsided)",
  JSON.stringify(await pads("#tabs .tab.main")) === JSON.stringify({ left: 10, right: 10 }),
  { pads: await pads("#tabs .tab.main") });
check("boot lands on main at /", new URL(await page.url()).pathname === "/", { url: await page.url() });
check("every project on the board has a group chip, collapsed",
  b.groups.length === 1 && b.groups[0].chip === "tabs" && !b.groups[0].expanded, { groups: b.groups });

// 2. + is the Engineer launcher: the project board, not a blueprint list
await page.click("#tab-add");
await page.waitForSelector("#launcher .launcher-sec", { state: "visible" });
const board = await page.evaluate(() => ({
  sections: [...document.querySelectorAll("#launcher .launcher-sec h3")].map((h) => h.textContent.trim()),
  rows: [...document.querySelectorAll("#launcher .project-row")].map((r) => ({
    name: r.querySelector(".name")?.textContent.trim(),
    edit: !!r.querySelector(".row-btn.edit svg"),
    eye: !!r.querySelector(".row-btn.eye svg"),
    remove: r.querySelector(".row-btn:last-of-type")?.textContent.trim(),
  })),
  hasForm: !!document.querySelector("#launcher .launcher-form input"),
  path: location.pathname,
}));
check("the Engineer launcher lists the board with an add field",
  board.sections[0].startsWith("Projects · 1") && board.hasForm && board.path === "/new", board);
check("a project row carries edit / eye / remove, the icons drawn not typed",
  board.rows.length === 1 && board.rows[0].name === "tabs" &&
    board.rows[0].edit && board.rows[0].eye && board.rows[0].remove === "remove", board);

// 3. edit opens the project's launcher in a tab of its group
await page.click("#launcher .project-row .edit");
await page.waitForSelector("#panes .view-launcher .launcher-sec", { state: "visible" });
// The page fills in as its two lists arrive; read it once a row is on it.
await page.waitForSelector(".view-launcher .launcher-sec:first-of-type .launcher-item", { state: "visible" });
b = await bar();
const launcherTab = b.tabs.find((t) => t.launcher);
check("edit put a launcher tab in the project's group and activated it",
  !!launcherTab && !launcherTab.entry && launcherTab.icon && launcherTab.active &&
    groupOf(b, "tabs")?.expanded, { bar: b });
check("the launcher tab is addressed by the project",
  new URL(await page.url()).pathname === `/project/${PROJECT}/new`, { path: new URL(await page.url()).pathname });
// 它也没有 ×，所以两边一样宽（和 main 同一条规则）。
check("the launcher icon tab is padded equally too",
  JSON.stringify(await pads("#tabs .tab.launcher")) === JSON.stringify({ left: 10, right: 10 }),
  { pads: await pads("#tabs .tab.launcher") });
const launcherView = await page.evaluate(() => ({
  head: document.querySelector(".view-launcher .launcher-title")?.textContent.trim(),
  sections: [...document.querySelectorAll(".view-launcher .launcher-sec h3")].map((h) => h.textContent.trim()),
  blueprints: [...document.querySelectorAll(".view-launcher .launcher-sec:first-of-type .launcher-item .name")]
    .map((n) => n.textContent.trim()),
}));
check("the project launcher shows Blueprints and Recent for that project",
  launcherView.head === "tabs" && launcherView.sections[0].startsWith("Blueprints") &&
    launcherView.sections[1].startsWith("Recent") && launcherView.blueprints[0] === "Probe Page", launcherView);

// 3b. picking a blueprint makes a session and a tab in the same group
await page.click(".view-launcher .launcher-sec:first-of-type .launcher-item");
await page.waitForFunction((n) => document.querySelectorAll("#tabs .tab:not(.main):not(.launcher)").length === n,
  base.length + 1, { timeout: 30_000 });
const opened = (await openIds()).find((id) => !base.includes(id));
b = await bar();
const newest = sessionTabs(b).find((t) => t.label === "Probe Page");
check("a new session tab appeared, named after the page", !!opened && !!newest, { bar: b, opened });
check("the new tab is active, closable and inside the project's group",
  newest?.active && newest?.closable && groupOf(b, "tabs")?.tabs.includes("Probe Page"), { bar: b, newest });
// 带 × 的那一格右边只留 4px（× 自己带内边距），左边仍是 10px。
check("a closable tab keeps its label close to the ×",
  JSON.stringify(await pads("#tabs .tab.closable")) === JSON.stringify({ left: 10, right: 4 }),
  { pads: await pads("#tabs .tab.closable") });
check("the project launcher has no close button — it cannot be closed",
  await page.evaluate(() => {
    const t = document.querySelector("#tabs .tab.launcher");
    return !!t && !t.querySelector(".tab-close");
  }), {});
check("the launcher sits after the session tabs, not on the group chip",
  JSON.stringify(groupOf(b, "tabs")?.tabs) === JSON.stringify(["Probe Page", ""]) &&
    await page.evaluate(() => {
      const tabs = [...document.querySelectorAll("#tabs .tab-group > *")];
      const last = tabs[tabs.length - 1];
      return last.classList.contains("launcher") && !last.classList.contains("launcher-entry") && !!last.querySelector("svg");
    }), { group: groupOf(b, "tabs") });
check("the tab's address is its session", new URL(await page.url()).pathname === `/session/${opened}`,
  { path: new URL(await page.url()).pathname });
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

// 3c. seed two recorded messages: replay reads records, not the model (--stub)
const seed = (seq, role, raw, content) =>
  post(`${ENGINEER.log}/log/mutation`,
    `op: add\nkind: conversation\nsessionId: ${opened}\npayload:\n  seq: ${seq}\n  role: ${role}\n  content: ${JSON.stringify(content)}\n  raw: ${JSON.stringify(raw)}`);
await seed(1, "user", { role: "user", content: "seed question" }, "seed question");
await seed(2, "assistant", { role: "assistant", content: [{ type: "text", text: "seed answer" }] },
  "seed answer");
const seen = await post(`${ENGINEER.log}/log/session/messages`, `sessionId: ${opened}`);
check("the seeded messages are in log",
  String(seen).includes("seed question") && String(seen).includes("seed answer"), { seen });
// The conversation view is a shadow root inside the tab's iframe.
const chatText = () =>
  page.evaluate(() => {
    const f = document.querySelector("#panes iframe.view-page:not([hidden])");
    const shadow = f?.contentDocument?.querySelector("engineer-chat")?.shadowRoot;
    return shadow ? shadow.textContent.replace(/\s+/g, " ").trim() : "";
  });

// 4. closing a session tab keeps the conversation, the launcher tab and the group
await page.click("loc=css:#tabs .tab:not(.main):not(.launcher) .tab-close");
await page.waitForFunction((n) => document.querySelectorAll("#tabs .tab:not(.main):not(.launcher)").length === n,
  base.length, { timeout: 15_000 });
b = await bar();
check("the session tab is gone and main is active again",
  sessionTabs(b).length === base.length && b.tabs[0].active, { bar: b });
check("closing took it out of the open list", (await openIds()).length === base.length,
  { open: await openIds() });
const stillThere = await post(`${ENGINEER.log}/log/session/detail`, `sessionId: ${opened}`);
check("the session row survived the close", String(stillThere).includes("Probe Page"), { stillThere });
check("the group is still there after its last session tab closed",
  b.groups.length === 1 && b.groups[0].chip === "tabs", { groups: b.groups });

// 5. the launcher tab's Recent reopens the same session
await page.click("#tabs .tab.launcher");
await page.waitForSelector(".view-launcher .launcher-sec", { state: "visible" });
const recentName = await page.evaluate(() =>
  [...document.querySelectorAll(".view-launcher .launcher-sec")][1]
    ?.querySelector(".launcher-item .name")?.textContent.trim());
check("Recent lists the closed session by its title", recentName === "Probe Page", { recentName });
await page.click("loc=css:.view-launcher .launcher-sec:nth-of-type(2) .launcher-item:nth-of-type(1)");
await page.waitForFunction((n) => document.querySelectorAll("#tabs .tab:not(.main):not(.launcher)").length === n,
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

// 6. the eye hides the group and touches nothing else
const hiddenBefore = (await openIds()).length;
await page.click("#tab-add");
await page.waitForSelector("#launcher .project-row .eye", { state: "visible" });
await page.click("#launcher .project-row .eye");
await page.waitForTimeout(300);
const whileHidden = await page.evaluate(() => ({
  chips: [...document.querySelectorAll("#tabs .tab-group .group-label")].map((n) => n.textContent.trim()),
  eye: document.querySelector("#launcher .project-row .eye")?.getAttribute("aria-pressed"),
  path: location.pathname,
}));
b = await bar();
check("hiding takes the group (and its tabs) out of the bar",
  b.groups.length === 0 && b.tabs.length === 1 && whileHidden.chips.length === 0, { bar: b, whileHidden });
check("hiding keeps every session open",
  (await openIds()).length === hiddenBefore, { open: await openIds() });
check("the hidden project stays on the board, marked hidden",
  whileHidden.eye === "false" && whileHidden.path === "/new", whileHidden);

// 6b. showing it again brings back exactly the tabs it had
await page.click("#launcher .project-row .eye");
await page.waitForSelector("#tabs .tab-group", { state: "visible" });
b = await bar();
check("showing the group again brings its tab back",
  b.groups.length === 1 && groupOf(b, "tabs")?.tabs.includes("Probe Page"), { bar: b });
// the screen went back to main while hidden; closing the launcher leaves it there
await page.mouse.click(5, 400);
await page.waitForTimeout(300);

// 7. switching to main keeps both views in the document
await page.click("#tabs .tab.main");
const views = await page.evaluate(() => ({
  views: document.querySelectorAll("#panes > .view").length,
  shown: document.querySelectorAll("#panes > .view:not([hidden])").length,
  mainShown: !document.querySelector("#panes > .view-main").hidden,
}));
// Every view that has been on stage stays built: main, the launcher page, the tab's page.
check("every shown tab keeps its view; only one is on stage",
  views.views === 3 && views.shown === 1 && views.mainShown, views);
check("main's address is /", new URL(await page.url()).pathname === "/", { path: new URL(await page.url()).pathname });

// 8. reloading / keeps main visible with the open list intact
await page.reload();
await page.waitForSelector("#tabs .tab.main", { state: "visible" });
await page.waitForFunction((n) => document.querySelectorAll("#tabs .tab:not(.main):not(.launcher)").length === n,
  base.length + 1, { timeout: 30_000 });
b = await bar();
const afterReload = await page.evaluate(() => ({
  active: document.querySelector("#tabs .tab.active .tab-label")?.textContent.trim(),
  mainShown: !document.querySelector("#panes > .view-main").hidden,
}));
check("the session tab came back from log, inside its group",
  sessionTabs(b).some((t) => t.label === "Probe Page") && groupOf(b, "tabs")?.tabs.includes("Probe Page"),
  { bar: b });
check("the browser-only launcher tab does not survive a reload of /",
  !b.tabs.some((t) => t.launcher && !t.entry), { bar: b });
check("what is left at the end of the group after the reload is the bare icon",
  !!b.tabs.find((t) => t.launcher)?.entry && !!b.tabs.find((t) => t.launcher)?.icon, { bar: b });
check("a reload of / keeps main visible",
  afterReload.active === "main" && afterReload.mainShown, afterReload);

// 9. a reloaded shell still shows a restored tab's history
await page.click("loc=css:#tabs .tab-group .tab:not(.launcher)");
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

// 9b. the launcher at the end of the group: clicking it brings its page back, and
// there is no way to close it
await page.click("#tabs .tab.launcher");
await page.waitForSelector(".view-launcher .launcher-sec .launcher-item", { state: "visible" });
const launcherHere = await page.evaluate(() => {
  const t = document.querySelector("#tabs .tab.launcher");
  return { active: t?.classList.contains("active"), closable: !!t?.querySelector(".tab-close") };
});
check("clicking the launcher brings its page back and marks it active",
  launcherHere.active && new URL(await page.url()).pathname === `/project/${PROJECT}/new`, launcherHere);
check("the launcher still has no close button", !launcherHere.closable, launcherHere);

// 10. a project route restores its launcher tab after a reload
await page.goto(`${WEB}/project/${PROJECT}/new`);
await page.waitForSelector(".view-launcher .launcher-sec", { state: "visible" });
b = await bar();
check("reloading the project route restores its launcher tab, expanded",
  b.tabs.some((t) => t.launcher && t.active) && groupOf(b, "tabs")?.expanded, { bar: b });

console.log(JSON.stringify({ ok: checks.every((c) => c.pass), checks }, null, 2));
EOF
```

Expected: all checks pass and the script prints `"ok": true` — main alone at boot plus a collapsed
group chip per project, **main（和 launcher 图标 tab）左右内边距相等——选中时下划线不偏向一边**， the Engineer launcher's board (`edit` / `eye` / `remove` + add field), an
`edit` that opens a launcher tab inside the group at `/project/<id>/new`, a blueprint pick that
becomes a session tab named after its page and addressed by `/session/<sessionId>`, two seeded
messages in log, a close that keeps the conversation *and the group*, a reopen from the launcher
tab's Recent that returns the same session and replays its history, an `eye` that hides the group
without closing anything and a second `eye` that brings back exactly its tab, views kept in the
document across a switch, and a reload of `/` that keeps main with the open list restored (the
launcher tab is browser-only and expected not to survive) — while the project route does restore
its launcher tab.

## Teardown

```bash
pkill -f 'serve-web.*--port 8983'
pkill -f 'serve-log --home .*\.tabs'
pkill -f 'serve-static --log http://localhost:8981'
pkill -f 'main.ts.*--home .*\.tabs'
rm -rf "$PWD/.engineer/.tabs"
```

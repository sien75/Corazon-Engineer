# Test: core-web-home-recents

项目主页（分组末尾 `+` 打开的 draft tab）上点 **Recents** 里的一行，会话要在**当前这一格**里打开：
那一格不再是 draft，变成这条会话的 tab，地址变成 `/session/<id>`，`openSessions` 里多的是它 —— 而不是
在旁边又开一格、把主页留在后面。Blueprint 行本来就是这个规矩（`browseBlueprint`），Recents 行跟它一致。

本用例钉住的是：

- `+` 造出**一格** draft tab，主页第二段的标题是 `Recents`；
- 点 Recents 的一行：**tab 数不变**（那一格从 draft 变成 session）、它是活动格、地址是
  `/session/<id>`、`openSessions` 里有它，视口里就是这条会话自己的对话（历史从 log 回放）；
- 已经开着 tab 的会话再点一次：**切过去**，不复制成第二格，draft 原地不动（一个 tab 就是一条会话）；
- 带 blueprint 的会话：同一格里换成 `/agent/<sessionId>/` 的 iframe，页面真的画出来。

Source of truth: `workspace/web/app.js`（`openSessionFromLauncher` / `adoptRecentSession` /
`openIndexBefore` / `fillHomeLists` / `activateTab` / `viewOf`）、`workspace/web/components/chat.js`
（`replayHistory`）、`workspace/log`（`session/current/*` + `session/on|off|detail` + `session/list`）。不需要模型：
ai 用 `--stub`，历史用 `/log/session/record/add` 直接写进 log（会话记录，bucket 由端点决定）。

## Setup

Prerequisite: `ego-browser` on `PATH`（`ego-browser --version`）。

```bash
# A scratch project root: the case must not touch the real .agents/ or .engineer/.
# log's database and the project board live in the engineer home, not in the project.
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.recents"
HOME_DIR="$ROOT/home"
rm -rf "$ROOT" && mkdir -p "$HOME_DIR"
printf 'project: recents\n' > "$ROOT/engineer.yaml"

# Guard first: with an empty $HOME_DIR the pattern below degrades to
# "serve-log --home " and kills every service on the machine — including the one
# running the agent. Fail loudly instead.
: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 8990 8991 8992 8993; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

# one blueprint, so a session can have a page to open in the taken-over tab
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
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 8991 >/tmp/recents-log.log 2>&1 &
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8991/log/project/list -d '{}' && break
  sleep 1
done
curl -s -o /dev/null -X POST http://localhost:8991/log/project/add \
  -H 'Content-Type: application/yaml' --data-binary "$(printf 'path: %s\nname: recents' "$ROOT")"
/tmp/engineer serve-static --log http://localhost:8991 --bind 127.0.0.1 --port 8992 >/tmp/recents-static.log 2>&1 &

(cd workspace/ai && bun run src/main.ts --home "$HOME_DIR" --bind 127.0.0.1 --port 8990 --stub \
  --log http://localhost:8991 --static http://localhost:8992 \
  --agents "$ROOTDIR/agents" \
  >/tmp/recents-ai.log 2>&1 &)

# wait for ai first: the boot below must not race it
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8990/ai/new -d 'kind: main' && break
  sleep 1
done

/tmp/engineer serve-web --bind 127.0.0.1 --port 8993 --assets "$ROOTDIR/workspace/web" \
  --static http://localhost:8992 --ai http://localhost:8990 --log http://localhost:8991 \
  >/tmp/recents-web.log 2>&1 &
sleep 1
```

## Run

```bash
WEB_URL=http://localhost:8993 ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:8993";
const space = await taskSpace("core-web-home-recents");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });

await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs .tab.main", { state: "visible" });
await page.waitForSelector("#tabs .tab-group", { state: "visible" });

const post = async (url, body) =>
  (await page.fetch(url, { method: "POST", headers: { "Content-Type": "application/yaml" }, body })).body;
const ENGINEER = await page.evaluate(async () => (await import("/config.js")).ENGINEER);
const PROJECT = (await post(`${ENGINEER.log}/log/project/list`, "{}")).match(/projectId:\s*(\S+)/)[1];
const openIds = async () => String(await post(`${ENGINEER.log}/log/session/current/get`, "{}"));

// A clean bar to start from: whatever an earlier run left open is closed (main is
// the shell's own conversation and is never closed).
const before = await openIds();
const mainSession = before.match(/mainSession:\s*(s_[0-9a-f]+)/)?.[1];
const others = (before.match(/s_[0-9a-f]+/g) || []).filter((id) => id !== mainSession);
if (others.length) {
  await post(`${ENGINEER.log}/log/session/off`, `sessionIds:\n${others.map((i) => `  - ${i}`).join("\n")}`);
}

// One conversation of the project's own chat, recorded and taken off the open list:
// it is only a Recents row now, which is what the row has to reopen.
const made = await post(`${ENGINEER.ai}/ai/new`, `projectId: ${PROJECT}\nkind: sub`);
const SESSION = String(made).match(/sessionId:\s*(\S+)/)[1];
await post(`${ENGINEER.log}/log/session/record/add`,
  `sessionId: ${SESSION}\npayload:\n  seq: 1\n  role: user\n  content: ${JSON.stringify("probe question")}\n  raw: ${JSON.stringify({ role: "user", content: "probe question" })}`);
await post(`${ENGINEER.log}/log/session/off`, `sessionIds:\n  - ${SESSION}`);
await page.reload();
await page.waitForSelector("#tabs .tab.main", { state: "visible" });

const bar = () =>
  page.evaluate(() => ({
    tabs: [...document.querySelectorAll("#tabs .tab")].map((t) => ({
      label: t.querySelector(".tab-label")?.textContent.trim(),
      active: t.classList.contains("active"),
      main: t.classList.contains("main"),
      entry: t.classList.contains("launcher-entry"),
      draft: t.classList.contains("draft"),
    })),
    path: location.pathname,
  }));
// Only the pane on screen counts: a home that was left behind stays in the document,
// hidden, and it is the tab bar — not the DOM — that says which one is showing.
const shownHome = "#panes > .view-home:not([hidden])";
const shownPane = () =>
  page.evaluate(() => {
    const v = document.querySelector("#panes > .view:not([hidden])");
    return { tag: v?.tagName, session: v?.getAttribute?.("session") ?? null,
      text: (v?.shadowRoot?.textContent || "").replace(/\s+/g, " ").trim() };
  });
const recentRow = `${shownHome} .home-sec:nth-of-type(2) .launcher-item:nth-of-type(1)`;

// 1. the + at the end of the group makes one draft tab on the project home
if (!(await page.evaluate(() => !!document.querySelector("#tabs .tab-group.expanded")))) {
  await page.click("#tabs .group-label");
}
await page.waitForSelector("#tabs .tab.launcher.launcher-entry", { state: "visible" });
await page.click("#tabs .tab.launcher.launcher-entry");
await page.waitForSelector(`${shownHome} .home-sec .launcher-item`, { state: "visible" });
const draft = await bar();
check("+ makes one draft tab on the project home",
  draft.tabs.filter((t) => t.draft).length === 1 && draft.path.startsWith("/project/"), draft);
const heads = await page.evaluate((sel) =>
  [...document.querySelectorAll(`${sel} .home-sec h3`)].map((h) => h.textContent.trim()), shownHome);
check("the second section is called Recents", !!heads[1] && heads[1].startsWith("Recents"), { heads });

// 2. the row opens in this tab: no second tab, the draft becomes the session's tab
await page.click(`loc=css:${recentRow}`);
await page.waitForFunction((id) => location.pathname === `/session/${id}`, SESSION, { timeout: 20_000 })
  .catch(() => {});
const after = await bar();
const tabs = after.tabs.filter((t) => !t.main && !t.entry);
check("Recents opened in the tab that was showing the home, not in a new one",
  tabs.length === 1 && !tabs[0].draft, { tabs });
check("that tab is now the session's tab and is active", tabs[0]?.active && tabs[0]?.label === "chat", { tabs });
check("its address is the session", after.path === `/session/${SESSION}`, { path: after.path });
check("the session is on the open list", (await openIds()).includes(SESSION), { open: await openIds() });
await page.waitForFunction((id) => {
  const v = document.querySelector("#panes > .view:not([hidden])");
  return v?.getAttribute("session") === id && (v.shadowRoot?.textContent || "").includes("probe question");
}, SESSION, { timeout: 20_000 }).catch(() => {});
const shown = await shownPane();
check("the pane is that session's conversation, its history replayed",
  shown.session === SESSION && shown.text.includes("probe question"), shown);

// 3. a session that already has a tab is brought up, not copied into the draft
await page.click("#tabs .tab.launcher.launcher-entry");
await page.waitForSelector(`${shownHome} .home-sec .launcher-item`, { state: "visible" });
await page.click(`loc=css:${recentRow}`);
await page.waitForTimeout(2000);
const third = await bar();
const thirdTabs = third.tabs.filter((t) => !t.main && !t.entry);
check("a session already open is brought up, the draft left alone",
  thirdTabs.length === 2 && thirdTabs.filter((t) => t.draft).length === 1 &&
    thirdTabs.some((t) => t.active && !t.draft) && third.path === `/session/${SESSION}`,
  { tabs: thirdTabs, path: third.path });

// 4. a session with a blueprint: the taken-over tab shows that page in a frame
const withPage = await post(`${ENGINEER.ai}/ai/new`, `projectId: ${PROJECT}\nkind: sub\nblueprint: probe`);
const PAGED = String(withPage).match(/sessionId:\s*(\S+)/)[1];
await post(`${ENGINEER.log}/log/session/off`, `sessionIds:\n  - ${PAGED}`);
await page.click("#tabs .tab.launcher.launcher-entry");
await page.waitForSelector(`${shownHome} .home-sec .launcher-item`, { state: "visible" });
await page.click(`loc=css:${recentRow}`);
await page.waitForFunction((id) => location.pathname === `/session/${id}`, PAGED, { timeout: 20_000 })
  .catch(() => {});
await page.waitForFunction((id) => {
  const f = document.querySelector("#panes iframe.view-page:not([hidden])");
  return !!f && f.src.includes(`/agent/${id}/`);
}, PAGED, { timeout: 20_000 }).catch(() => {});
const paged = await page.evaluate(() => {
  const f = document.querySelector("#panes iframe.view-page:not([hidden])");
  return { path: location.pathname, src: f?.src || "",
    probe: f?.contentDocument?.getElementById("probe-page")?.textContent || "" };
});
check("a session with a blueprint opens its page in the same tab",
  paged.path === `/session/${PAGED}` && paged.src.includes(`/agent/${PAGED}/`) && paged.probe === "probe page",
  paged);

console.log(JSON.stringify({ ok: checks.every((c) => c.pass), checks }, null, 2));
EOF
```

Expected: `"ok": true` — a `+` that makes one draft tab on a home whose second section is `Recents`, a
row that turns **that** tab into the conversation (one tab, active, `/session/<id>`, on the open list, its
history replayed from log), a second click on the same row that brings the existing tab up instead of
copying it into the draft, and a blueprint session that lands in the same tab as its
`/agent/<sessionId>/` page.

## Teardown

```bash
pkill -f 'serve-web.*--port 8993'
pkill -f 'serve-log --home .*\.recents'
pkill -f 'serve-static --log http://localhost:8991'
pkill -f 'main.ts.*--home .*\.recents'
rm -rf "$PWD/.engineer/.recents"
```

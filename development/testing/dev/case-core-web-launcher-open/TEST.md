# Test: core-web-launcher-open

launcher 里点一行（Blueprint 或 Recent），**在它打开的东西画出来之前，工作区不被揭开**。

从点下到新页面出现之间有好几次往返：`ai/new`（造 agent）、`log/tab/new`（写 tab）、
`log/tab/on`（重开旧 tab）、`refreshWorkspace`（读回工作区并激活新 tab）、iframe 加载。
这中间挡在用户和工作区之间的只有 launcher 自己。它一旦先关掉，露出来的就是**当时
还活着的 tab——main**，于是现象是"点 blueprint，先闪一下 main，才出现新 tab"。
本用例钉住四件事：

- 打开成功时，launcher 保持到**新 tab 的 iframe 已经加载完**才关（顺序：树挂上 →
  iframe load → launcher 关），main 一刻也没有被露出来；
- 一次点击只造一个 agent、只开一个 tab（按住期间列表不吃点击）；
- Recent 里重开一个关掉的 tab 走同一条路：tab 回来了、页面画出来了，launcher 才走；
- 打开失败（blueprint 在列表出来后没了）时 launcher 留着、还能再点、并说明原因。

Source of truth: `workspace/web/app.js`（`launcherHold` / `launcherClose` /
`openBlueprintFromLauncher` / `openRecentTab` / `waitForTabPaint`）、
`workspace/web/style.css`（`#launcher.busy`）。"谁先谁后"是浏览器的 DOM 事件顺序，
所以本用例跑真实浏览器（`ego-browser`），用一个 MutationObserver 记时间线，不靠肉眼。

## Setup

Prerequisite: `ego-browser` on `PATH`（`ego-browser --version`）。

```bash
# A scratch project root: the case must not touch the real .agents/ or .engineer/
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.launcher-open"
rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: launcher-open\n' > "$ROOT/engineer.yaml"
# the Run script runs in Node, outside this shell's cwd: it reads the root from here
printf '%s\n' "$ROOT" > /tmp/launcher-open-root

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
for p in 8860 8861 8862 8863; do pkill -f "serve-web.*--port $p" 2>/dev/null || true; done
sleep 1

(cd how-to/deploy/prod && go build -o /tmp/engineer-launcher-open .)
/tmp/engineer-launcher-open serve-log --root "$ROOT" --bind 127.0.0.1 --port 8861 >/tmp/launcher-open-log.log 2>&1 &
/tmp/engineer-launcher-open serve-static --root "$ROOT" --bind 127.0.0.1 --port 8862 >/tmp/launcher-open-static.log 2>&1 &

(cd workspace/ai && bun run src/main.ts --root "$ROOT" --bind 127.0.0.1 --port 8863 --stub \
  --log http://localhost:8861 --static http://localhost:8862 \
  --agents "$ROOTDIR/agents" \
  >/tmp/launcher-open-ai.log 2>&1 &)

# wait for ai first: the launcher's first `ai/new` must not race the boot
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8863/ai/new -d '{}' && break
  sleep 1
done

# the fixture blueprint: a title (the launcher's row takes it) and a marker the
# check can read back out of the loaded page
mkdir -p "$ROOT/.agents/blueprints/probe"
cat > "$ROOT/.agents/blueprints/probe/README.md" <<'MD'
# probe

The page the launcher opens in this case.
MD
cat > "$ROOT/.agents/blueprints/probe/index.html" <<'HTML'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>probe</title>
  <style>body { margin: 0; font: 13px system-ui } #mark { padding: 24px }</style>
</head>
<body>
  <div id="mark">probe page</div>
  <script type="module" src="/components/chat.js"></script>
  <engineer-chat></engineer-chat>
</body>
</html>
HTML

# the blueprint `doomed` exists only so the launcher lists it; the Run script
# deletes it before clicking, to make one row fail deterministically
mkdir -p "$ROOT/.agents/blueprints/doomed"
printf '# doomed\n\nGone before it is opened.\n' > "$ROOT/.agents/blueprints/doomed/README.md"
cat > "$ROOT/.agents/blueprints/doomed/index.html" <<'HTML'
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>doomed</title></head>
<body><script type="module" src="/components/chat.js"></script><engineer-chat></engineer-chat></body></html>
HTML

/tmp/engineer-launcher-open serve-web --bind 127.0.0.1 --port 8860 --assets "$ROOTDIR/workspace/web" \
  --blueprints "$ROOT/.agents/blueprints" \
  --static http://localhost:8862 --ai http://localhost:8863 --log http://localhost:8861 \
  >/tmp/launcher-open-web.log 2>&1 &
```

Expected on startup: the ai service logs `--stub: model calls disabled`, the log
server logs its address on `:8861`, the static server on `:8862`, and the web
server logs `engineer web: http://localhost:8860`.

## Run

The page records the order of the three moments that decide the flash — the tab's
tree going into `#panes`, the new iframe finishing its load, and the launcher
being hidden — and each check compares that order, not a screenshot.

```bash
ego-browser nodejs <<'EOF'
const fs = await import("node:fs/promises");
const path = await import("node:path");
const WEB = "http://localhost:8860/";
// the scratch root, written by Setup: the script does not run in the shell's cwd
const ROOT = (await fs.readFile("/tmp/launcher-open-root", "utf8")).trim();
const task = await taskSpace("core-web-launcher-open");
const page = task.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });

await page.goto(WEB);
await page.waitForSelector("#tabs .tab", { state: "visible" });
await page.cdp("Emulation.setDeviceMetricsOverride",
  { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

// start from a clean workspace: every tab but main closed through the UI
for (let i = 0; i < 8; i++) {
  if (!(await page.evaluate(() => document.querySelectorAll("#tabs .tab .tab-close").length))) break;
  await page.evaluate(() => document.querySelector("#tabs .tab .tab-close").click());
  await page.waitForTimeout(250);
}

// the recorder: arm() clears the timeline, the observers stay installed
await page.evaluate(() => {
  const events = [];
  window.__rec = { events, arm: () => (events.length = 0) };
  const now = () => Math.round(performance.now());
  const push = (k, extra) => events.push({ t: now(), k, ...(extra || {}) });
  const launcher = document.getElementById("launcher");
  new MutationObserver(() => push("launcher.hidden", { hidden: launcher.hidden }))
    .observe(launcher, { attributes: true, attributeFilter: ["hidden"] });
  const panes = document.getElementById("panes");
  new MutationObserver((ms) => {
    for (const m of ms) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.classList?.contains("pane-tree")) push("tree.added", { shown: !n.hidden });
        for (const f of [...(n.tagName === "IFRAME" ? [n] : []), ...(n.querySelectorAll?.("iframe") || [])]) {
          f.addEventListener("load", () => push("frame.load", { src: f.getAttribute("src") }));
        }
      }
    }
  }).observe(panes, { childList: true, subtree: true });
});

const state = () => page.evaluate(() => ({
  tabs: document.querySelectorAll("#tabs .tab").length,
  active: document.querySelector("#tabs .tab.active")?.textContent.trim().replace(/×$/, ""),
  path: location.pathname,
  hidden: document.getElementById("launcher").hidden,
  busy: document.getElementById("launcher").classList.contains("busy"),
  shown: [...document.querySelectorAll("#panes .pane-tree")]
    .filter((e) => !e.hidden).map((e) => e.querySelector("iframe")?.contentDocument?.title),
  toast: document.getElementById("toast").hidden ? "" : document.getElementById("toast").textContent,
}));

// order reduces the timeline to the three moments, in the order they happened.
const order = () => page.evaluate(() => window.__rec.events
  .filter((e) => e.k === "tree.added" || e.k === "frame.load" ||
    (e.k === "launcher.hidden" && e.hidden))
  .map((e) => e.k));

// The launcher's two sections are named on screen ("Blueprints · n" / "Recent ·
// n"); a row is addressed by its label inside one of them, so the case never
// depends on the order the sections come in.
const openRow = async (section, name) => {
  await page.click("#tab-add", { label: "open launcher" });
  await page.waitForSelector("#launcher .launcher-item", { state: "visible" });
  await page.evaluate(({ section, name }) => {
    const sec = [...document.querySelectorAll("#launcher .launcher-sec")]
      .find((s) => s.querySelector("h3")?.textContent.trim().startsWith(section));
    const row = sec && [...sec.querySelectorAll(".launcher-item")]
      .find((e) => e.querySelector(".name")?.textContent.trim() === name);
    if (!row) throw new Error(`launcher row not found: ${section}/${name}`);
    row.click();
  }, { section, name });
};

const waitClosed = () => page.waitForFunction(
  () => document.getElementById("launcher").hidden === true, undefined, { timeout: 15_000 });

// 1. one click on the probe blueprint: one tab, and the launcher goes only after
// the page inside it has loaded
await page.evaluate(() => window.__rec.arm());
const before = await state();
await openRow("Blueprints", "probe");
await waitClosed();
await page.waitForTimeout(200);
let s = await state();
let o = await order();
check("the blueprint row opens exactly one tab, and it is the active one",
  s.tabs === before.tabs + 1 && s.active === "probe" && /^\/tab\//.test(s.path) &&
  s.shown.join(",") === "probe", s);
check("the tab's tree is in the workspace before the launcher goes (nothing else can show)",
  o.indexOf("tree.added") === 0 && o.indexOf("launcher.hidden") > o.indexOf("tree.added"), o);
check("the launcher goes only after the new page has loaded (main is never revealed)",
  o.indexOf("frame.load") > -1 && o.indexOf("launcher.hidden") > o.indexOf("frame.load"), o);
check("the launcher ends closed, not busy", s.hidden === true && s.busy === false);

// 2. two clicks inside one task (a double click that never reaches the list):
// one agent, one tab — the hold takes the list out of the click path
const n0 = (await state()).tabs;
await page.evaluate(() => window.__rec.arm());
await page.click("#tab-add", { label: "open launcher" });
await page.waitForSelector("#launcher .launcher-item", { state: "visible" });
await page.evaluate(() => {
  const row = [...document.querySelectorAll("#launcher .launcher-item")]
    .find((e) => e.querySelector(".name")?.textContent.trim() === "probe");
  row.click();
  row.click();
});
await waitClosed();
await page.waitForTimeout(400);
check("a second click while opening makes no second agent",
  (await state()).tabs === n0 + 1, await state());

// 3. Recent: the same road back. A closed tab is reopened by its record, and the
// launcher stays until that page is on screen again.
const openTabId = await page.evaluate(() => document.querySelector("#tabs .tab.active").dataset.tabId);
await page.evaluate(() => document.querySelector("#tabs .tab.active .tab-close").click());
await page.waitForTimeout(400);
await page.evaluate(() => window.__rec.arm());
await openRow("Recent", "probe");
await waitClosed();
await page.waitForTimeout(200);
s = await state();
o = await order();
check("Recent brings the same tab back (not a copy) and shows it",
  s.active === "probe" && s.path === `/tab/${openTabId}` && s.shown.join(",") === "probe" &&
  s.tabs === n0 + 1, { ...s, openTabId });
check("the reopened tab's page is loaded before the launcher goes",
  o.indexOf("frame.load") > -1 && o.indexOf("launcher.hidden") > o.indexOf("frame.load"), o);

// 4. a row that fails: the launcher stays, still clickable, and says why. The
// blueprint disappears from disk after the launcher listed it, so `ai/new` is
// what rejects it — the same failure a bad slug or a broken page gives.
const tabsBeforeFail = (await state()).tabs;
await page.click("#tab-add", { label: "open launcher" });
await page.waitForSelector("#launcher .launcher-item", { state: "visible" });
const listed = await page.evaluate(() =>
  [...document.querySelectorAll("#launcher .launcher-item .name")].map((e) => e.textContent.trim()));
await fs.rm(path.join(ROOT, ".agents/blueprints/doomed"), { recursive: true, force: true });
await page.evaluate(() => {
  const row = [...document.querySelectorAll("#launcher .launcher-item")]
    .find((e) => e.querySelector(".name")?.textContent.trim() === "doomed");
  if (!row) throw new Error("doomed row missing");
  row.click();
});
await page.waitForTimeout(1500);
s = await state();
check("a failed open leaves the launcher up, clickable, and says why",
  s.hidden === false && s.busy === false && s.tabs === tabsBeforeFail &&
  /could not open/.test(s.toast), s);
check("the failing row was the one the launcher listed", listed.includes("doomed"), listed);

console.log(JSON.stringify({ ok: checks.every((c) => c.pass), checks }, null, 2));
if (!checks.every((c) => c.pass)) process.exitCode = 1;
EOF
```

Expected: 9 checks, `ok: true`. On the pre-fix code the second check fails — the
launcher goes first (`launcher.hidden` at the head of the timeline, `tree.added`
behind it), which is the flash this case exists for.

Check 4 deletes the `doomed` blueprint out of the scratch root, so **Run starts
after Setup**: running the Run block a second time needs Setup again.

## Teardown

```bash
pkill -f "serve-log --root $ROOT" 2>/dev/null || true
pkill -f "serve-static --root $ROOT" 2>/dev/null || true
pkill -f "main.ts.*--root $ROOT" 2>/dev/null || true
for p in 8860 8861 8862 8863; do pkill -f "serve-web.*--port $p" 2>/dev/null || true; done
rm -rf "$ROOT"
```

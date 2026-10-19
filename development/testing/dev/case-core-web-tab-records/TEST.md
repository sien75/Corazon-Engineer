# Test: core-web-tab-records

The frontend moved onto the tab level. A tab now has a **tabId assigned by log**
and a record holding its pane tree (`/log/tab/*`), and the launcher's **recent**
section lists tab records instead of sessions — reopening a *workspace* is a
different move from pulling a *session* into a tab, which is what `/resume`
still does.

The frontend is the one writer that *creates* a record (a tab the model has
never touched still needs a default single-pane layout, and a page tab never
talks to ai); everything after that is the model's layout tool. This case covers
the creation side only — splits are not rendered yet, so one pane fills the tab
exactly as before.

Source of truth: `workspace/web/app.js` (`ensureTabRecord` / `primaryPane` /
`recentTabs` / the launcher) and `atoms/web.yaml`'s three `log-tab-*` consumers.
The behaviour is DOM + localStorage + a service call, so this case runs through
a real browser (`ego-browser`).

## Setup

Prerequisite: `ego-browser` on `PATH` (`ego-browser --version`).

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.tab-records"
rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: tab-records\n' > "$ROOT/engineer.yaml"

# one blueprint: enough for the launcher's Blueprints section and a page tab
mkdir -p "$ROOT/.agents/blueprints/demo-page"
cat > "$ROOT/.agents/blueprints/demo-page/index.html" <<'HTML'
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Demo Page</title></head>
<body><p>demo</p></body></html>
HTML

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
for p in 8970 8971 8972 8973; do pkill -f "serve-web.*--port $p" 2>/dev/null || true; done
sleep 1

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --root "$ROOT" --bind 127.0.0.1 --port 8971 >/tmp/tabrec-log.log 2>&1 &
/tmp/engineer serve-static --root "$ROOT" --bind 127.0.0.1 --port 8972 >/tmp/tabrec-static.log 2>&1 &

(cd workspace/ai && bun run src/main.ts --root "$ROOT" --bind 127.0.0.1 --port 8970 --stub \
  --log http://localhost:8971 --static http://localhost:8972 \
  --agents "$ROOTDIR/agents" \
  >/tmp/tabrec-ai.log 2>&1 &)

for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8970/ai/new -d '{}' && break
  sleep 1
done

/tmp/engineer serve-web --bind 127.0.0.1 --port 8973 --assets "$ROOTDIR/workspace/web" \
  --pages "$ROOT/.agents/blueprints" \
  --static http://localhost:8972 --ai http://localhost:8970 --log http://localhost:8971 \
  >/tmp/tabrec-web.log 2>&1 &
```

Expected on startup: ai logs `--stub: model calls disabled`, log listens on
`:8971`, static on `:8972`, web logs `engineer web: http://localhost:8973`, and
`/log/tab/list` on `:8971` answers with an empty `tabs`.

## Run

```bash
WEB_URL=http://localhost:8973 LOG_URL=http://localhost:8971 ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:8973";
const LOG = process.env.LOG_URL || "http://localhost:8971";
const space = await taskSpace("core-web-tab-records");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });

check("log starts with no tab records",
  (await (await fetch(`${LOG}/log/tab/list`, {
    method: "POST", headers: { "Content-Type": "application/yaml" }, body: "pageNum: 1",
  })).text()).includes("tabs: []"));

// ask the page for the records, reusing the frontend's own yaml parser
const records = () => page.evaluate(async () => {
  const yaml = (await import("/vendor/js-yaml.js")).default;
  
  const { ENGINEER } = await import("/config.js");
  const res = await fetch(`${ENGINEER.log}/log/tab/list`, {
    method: "POST", headers: { "Content-Type": "application/yaml" }, body: "pageNum: 1",
  });
  return (yaml.load(await res.text()) || {}).tabs || [];
});
const tabs = () => page.evaluate(() =>
  JSON.parse(localStorage.getItem("engineer.tabs") || "[]"));

await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs", { state: "visible" });
await page.evaluate(() => localStorage.removeItem("engineer.tabs"));
await page.reload();
await page.waitForSelector("#tabs", { state: "visible" });
await page.cdp("Emulation.setDeviceMetricsOverride",
  { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });

// 1. a new chat tab gets a tabId and a record
await page.click("#tab-add");
await page.waitForSelector("#newtab .newtab-sec", { state: "visible" });
await page.click('.launch-item[data-action="newchat"]');
await page.waitForSelector("#tabs .tab[data-tab-id]", { state: "visible" });
await page.waitForTimeout(1000);

let saved = await tabs();
const chatTabId = saved[0]?.tabId;
const chatFrontId = saved[0]?.id;
check("a new chat tab stores a server-assigned tabId",
  /^t_[0-9a-f]+$/.test(chatTabId || ""), { tabId: chatTabId, saved });

let recs = await records();
check("log holds one tab record", recs.length === 1, { recs });
check("the record is a single chat pane pointed at the session",
  recs[0]?.layout?.pane?.contentType === "chat" &&
    recs[0]?.layout?.pane?.contentId === saved[0]?.sessionId &&
    !!recs[0]?.layout?.pane?.paneId,
  { layout: recs[0]?.layout, sessionId: saved[0]?.sessionId });

// 2. a reload keeps the same record — creation happens once, not per load
await page.reload();
await page.waitForSelector("#tabs .tab[data-tab-id]", { state: "visible" });
await page.waitForTimeout(1000);
saved = await tabs();
check("the reloaded tab keeps its tabId", saved[0]?.tabId === chatTabId,
  { before: chatTabId, after: saved[0]?.tabId });
recs = await records();
check("the reload did not create a second record", recs.length === 1, { recs });

// 3. a page tab gets a record too (it used to be pure frontend, touching nothing)
await page.click("#tab-add");
await page.waitForSelector('.launch-item[data-action="page"]', { state: "visible" });
await page.click('.launch-item[data-action="page"][data-id="demo-page"]');
await page.waitForTimeout(1000);
recs = await records();
const pageRec = recs.find((r) => r.layout?.pane?.contentType === "page");
check("opening a blueprint writes a page-pane record",
  pageRec?.layout?.pane?.contentId === "demo-page", { recs });
check("there are now two records", recs.length === 2, { recs });

// 4. the launcher's recent section lists tabs, and a closed one comes back
// The chat tab is first on the bar (tabs render in creation order); closing it
// leaves the page tab active, so recent must be the chat tab we just closed.
// The chat tab carries its own frontend tab id, so the close button is addressed
// by that rather than by position on the bar.
await page.click(`.tab[data-tab-id="${chatFrontId}"] .tab-close`);
await page.waitForTimeout(500);
const openIds = (await tabs()).map((t) => t.tabId);
check("the closed tab is the chat one", !openIds.includes(chatTabId), { chatTabId, openIds });
await page.click("#tab-add");
await page.waitForSelector('.newtab-sec[data-section="recent"]', { state: "visible" });
const recent = await page.evaluate(() =>
  [...document.querySelectorAll('.newtab-sec[data-section="recent"] .launch-item')]
    .map((e) => ({ action: e.dataset.action, id: e.dataset.id })));
check("recent lists tab records, not sessions",
  recent.length > 0 && recent.every((r) => r.action === "opentab" && /^t_/.test(r.id || "")),
  { recent });
check("the closed tab is the one listed",
  recent.length === 1 && recent[0].id === chatTabId, { recent, chatTabId });
check("an open tab is not listed as recent",
  recent.every((r) => !openIds.includes(r.id)), { recent, openIds });

// 5. reopening a recent record activates the same tab (no duplicate, no new record)
const reopen = recent[0];
const before = (await records()).length;
await page.click(`.newtab-sec[data-section="recent"] .launch-item[data-id="${reopen.id}"]`);
await page.waitForTimeout(1200);
saved = await tabs();
check("reopening a record brings back the same tabId",
  saved.some((t) => t.tabId === reopen.id), { reopen, saved });
check("reopening did not create another record", (await records()).length === before,
  { before, after: (await records()).length });

// 6. /resume still lists sessions: the other list, in the other place
await page.fill("#ai-input-field", "");
await page.fill("#ai-input-field", "hello there");
await page.click("#ai-send");
await page.waitForTimeout(2500);
const sessionCount = await page.evaluate(async () => {
  const yaml = (await import("/vendor/js-yaml.js")).default;
  const { ENGINEER } = await import("/config.js");
  const res = await fetch(`${ENGINEER.log}/log/list`, {
    method: "POST", headers: { "Content-Type": "application/yaml" }, body: "pageNum: 1",
  });
  return ((yaml.load(await res.text()) || {}).sessions || []).length;
});
check("a sent message still records a conversation session", sessionCount >= 1, { sessionCount });

await page.fill("#ai-input-field", "/resume");
await page.waitForSelector("#ai-cmd .ai-cmd-item", { state: "visible" });
await page.press("#ai-input-field", "Enter");
await page.waitForTimeout(1500);
const picker = await page.evaluate(() =>
  [...document.querySelectorAll("#ai-cmd .ai-cmd-item.session")].length);
check("/resume still opens the session picker", picker >= 1, { picker });

console.log(JSON.stringify({ checks }, null, 2));
await space.finish({ keep: [] });
EOF
```

Expected: every check passes — a new chat tab stores a server-assigned `tabId`
and gets exactly one chat-pane record; a reload keeps both the id and the record
count; opening a blueprint adds a page-pane record; the launcher's `recent`
section lists `opentab` rows carrying `t_…` ids and hides tabs that are already
open; reopening one activates that tab without writing another record; and
`/resume` still lists sessions.

## Teardown

```bash
pkill -f 'serve-log --root .*/.tab-records'
pkill -f 'serve-static --root .*/.tab-records'
pkill -f 'serve-web --bind 127.0.0.1 --port 8973'
pkill -f 'main.ts.*--root .*/.tab-records'
```

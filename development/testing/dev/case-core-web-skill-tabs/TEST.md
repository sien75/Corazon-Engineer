# Test: core-web-skill-tabs

The tab bar and the new tab page. A skill is one piece of text; opening it runs
it (the ai service creates a session and hands the text to the model) and shows
that conversation in a closable tab. The fixed views (graph / how-to /
development / contracts / docs / notes) are tabs too, but they can never be
closed. `/new` cancels the active instance and opens a fresh generic chat, and
each instance keeps its own unsent composer draft.

Source of truth: `workspace/web/index.html` (`#tabs`), `workspace/web/app.js`
(`openSkillTab` / `activateSkillTab` / `closeSkillTab` / the new tab page) and
`workspace/web/style.css` (`#ai.skill-mode`). Tab switching, layout and the
page are DOM behaviour, so this case runs through a real browser
(`ego-browser`) rather than curl.

## Setup

Prerequisite: `ego-browser` on `PATH` (`ego-browser --version`).

```bash
# A scratch project root: the case must not touch the real .engineer/skill.db or log
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.skill-test"
rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: skill-test\n' > "$ROOT/engineer.yaml"

# log + ai on their own ports; ai in stub mode, so skill runs are deterministic and offline
(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --root "$ROOT" --bind 127.0.0.1 --port 8513 >/tmp/skill-tabs-log.log 2>&1 &

(cd workspace/ai && bun run src/main.ts --root "$ROOT" --bind 127.0.0.1 --port 8511 --stub \
  --log http://localhost:8513 --static http://localhost:8502 \
  --agents "$ROOTDIR/agents/AGENTS.md" \
  >/tmp/skill-tabs-ai.log 2>&1 &)

# one saved skill, so the new tab page's "my skills" section is not empty
# wait for ai first: the save must not race the boot
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8511/ai/skill/list -d '{}' && break
  sleep 1
done
curl -s -X POST http://localhost:8511/ai/skill/save \
  -d 'name: Seeded skill
text: seeded instruction'

# web assets
/tmp/engineer serve-web --bind 127.0.0.1 --port 8610 --assets "$ROOTDIR/workspace/web" \
  --static http://localhost:8502 --ai http://localhost:8511 --log http://localhost:8513 \
  >/tmp/skill-tabs-web.log 2>&1 &
```

Expected on startup: the ai service logs `--stub: model calls disabled`, the
log server logs its address on `:8513`, and the web server logs
`engineer web: http://localhost:8610`. (`--static` is only referenced by the
frontend, never called here, so any address — or none — is fine.)

## Run

```bash
WEB_URL=http://localhost:8610 ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:8610";
const space = await taskSpace("core-web-skill-tabs");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });

await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs", { state: "visible" });
// start from a clean browser state (tabs *and* the ad-hoc chat panel)
await page.evaluate(() => {
  localStorage.removeItem("engineer.skill.tabs");
  localStorage.removeItem("engineer.skill.active");
});
await page.reload();
await page.waitForSelector("#tabs", { state: "visible" });

// 1. the fixed views are tabs and cannot be closed
const fixed = await page.evaluate(() =>
  [...document.querySelectorAll("#tabs .tab.fixed")].map((e) => e.textContent.trim()));
check("fixed views are tabs", fixed.join(",") === "graph,how-to,development,contracts,docs,notes", { fixed });
check("fixed tabs have no close button",
  await page.evaluate(() => document.querySelectorAll("#tabs .tab.fixed .tab-close").length === 0));
check("there is no ai toggle in the topbar",
  await page.evaluate(() => document.getElementById("ai-toggle") === null));

// 2. + opens the new tab page (a page, not a dialog), which lists saved skills
await page.click("#tab-add");
await page.waitForSelector("#newtab .skill-item", { state: "visible" });
check("the page shows the four parts in order",
  await page.evaluate(() => [...document.querySelectorAll("#newtab h3")]
    .map((e) => e.textContent.trim().split(" ")[0]).join(",") === "built-in,my,suggested,recent"));
// The suggested section is a plain heading: discovery is automatic (the ai
// service scans once 10 runs pile up), so the page offers no manual trigger.
check("the suggested section has no refresh button",
  await page.evaluate(() => {
    const h3 = [...document.querySelectorAll("#newtab h3")]
      .find((e) => e.textContent.trim().startsWith("suggested"));
    return h3?.textContent.trim() === "suggested" &&
      document.querySelectorAll("#newtab .skill-refresh, #newtab [data-action=refresh]").length === 0;
  }));
check("built-in offers a blank Chat",
  await page.evaluate(() => [...document.querySelectorAll("#newtab .skill-name")].some((e) => e.textContent === "Chat")));
check("the new tab page lists saved skills",
  await page.evaluate(() =>
    [...document.querySelectorAll("#newtab .skill-name")].some((e) => e.textContent === "Seeded skill")));
check("empty sections say so in English",
  await page.evaluate(() =>
    [...document.querySelectorAll("#newtab .empty-hint")].some((e) => e.textContent === "nothing here yet")));
check("there is no create-skill form on the page",
  await page.evaluate(() => document.querySelector("#newtab form") === null));
check("the page content is centred",
  await page.evaluate(() => {
    const body = document.querySelector("#newtab .newtab-body");
    const box = body.getBoundingClientRect();
    const host = document.getElementById("newtab").getBoundingClientRect();
    const dx = Math.abs((box.left - host.left) - (host.right - box.right));
    const dy = Math.abs((box.top - host.top) - (host.bottom - box.bottom));
    return dx <= 2 && dy <= 2;
  }));

check("+ is the active tab while the new tab page shows",
  await page.evaluate(() => document.getElementById("newtab").hidden === false &&
    document.getElementById("left").hidden === true &&
    document.getElementById("tab-add").classList.contains("active") &&
    document.querySelectorAll("#tabs .tab.active").length === 0));

// 3. the page can start a blank conversation (no skill behind it)
await page.click("loc=css:#newtab [data-action=newchat]");
await page.waitForSelector(".tab.skill.active", { state: "visible" });
await page.waitForFunction(() => document.getElementById("ai").classList.contains("skill-mode"),
  undefined, { timeout: 10_000 });
const blank = await page.evaluate(() => ({
  tab: document.querySelector("#tabs .tab.skill.active")?.textContent.trim(),
  messages: document.querySelectorAll("#ai-messages .ai-msg").length,
  inputVisible: !document.getElementById("ai-input").hidden,
  newTabHidden: document.getElementById("newtab").hidden,
}));
check("built-in Chat opens a blank conversation tab",
  !!blank.tab && blank.tab.startsWith("new chat"), { tab: blank.tab });
check("a blank chat starts empty and ready for input",
  blank.messages === 0 && blank.inputVisible === true && blank.newTabHidden === true, blank);
await page.click("loc=css:.tab.skill .tab-close");
await page.waitForFunction(() => document.querySelectorAll("#tabs .tab.skill").length === 0,
  undefined, { timeout: 5_000 });

// 4. running a saved skill opens a skill tab and streams the run into it
await page.click("#tab-add");
await page.waitForSelector("#newtab .skill-item", { state: "visible" });
await page.click("loc=css:#newtab .skill-item:has-text('Seeded skill') >> nth=0");
await page.waitForSelector(".tab.skill.active", { state: "visible" });
await page.waitForFunction(() => document.getElementById("ai").classList.contains("skill-mode"),
  undefined, { timeout: 10_000 });
await page.waitForFunction(
  () => (document.querySelector("#ai-messages")?.textContent || "").includes("dev stub"),
  undefined, { timeout: 30_000 });
const run = await page.evaluate(() => ({
  tab: document.querySelector("#tabs .tab.skill.active")?.textContent.trim(),
  user: document.querySelector("#ai-messages .ai-user")?.textContent.trim(),
  assistant: document.querySelector("#ai-messages .ai-assistant")?.textContent.trim().slice(0, 40),
  leftHidden: document.getElementById("left").hidden,
  width: document.getElementById("ai").getBoundingClientRect().width,
  viewport: window.innerWidth,
  newTabHidden: document.getElementById("newtab").hidden,
}));
check("running a skill opens a skill tab", !!run.tab && run.tab.startsWith("Seeded skill"), { tab: run.tab });
check("running leaves the new tab page", run.newTabHidden === true);
check("the skill text is the first message", run.user === "seeded instruction", { user: run.user });
check("the run streams into the tab", (run.assistant || "").includes("dev stub"), { assistant: run.assistant });
check("a skill tab takes the whole page",
  run.leftHidden === true && run.width > run.viewport * 0.9,
  { leftHidden: run.leftHidden, width: run.width, viewport: run.viewport });
// The conversation is a column inside that page: capped and centred, messages
// and composer aligned.
check("the conversation column is capped at 1000px and centred",
  await page.evaluate(() => {
    const host = document.getElementById("ai").getBoundingClientRect();
    return ["ai-messages", "ai-input"].every((id) => {
      const b = document.getElementById(id).getBoundingClientRect();
      return b.width <= 1001 &&
        Math.abs(b.left - host.left - (host.right - b.right)) <= 2;
    });
  }));

// 5. a fixed tab leaves skill mode but keeps the skill tab
await page.click("loc=css:#tabs button[data-view='graph']");
await page.waitForFunction(() => !document.getElementById("ai").classList.contains("skill-mode"),
  undefined, { timeout: 5_000 });
await page.screenshot({ path: "/tmp/skill-tabs-graph.png" });
const back = await page.evaluate(() => ({
  leftHidden: document.getElementById("left").hidden,
  skillTabs: document.querySelectorAll("#tabs .tab.skill").length,
  active: document.querySelector("#tabs .tab.active")?.textContent.trim(),
}));
check("a fixed tab leaves skill mode and keeps the skill tab",
  back.leftHidden === false && back.skillTabs === 1 && back.active === "graph", back);

// 6. reopening the tab re-renders the conversation (from /ai/resume + log)
await page.click("loc=css:.tab.skill");
await page.waitForFunction(() => document.getElementById("ai").classList.contains("skill-mode"),
  undefined, { timeout: 10_000 });
await page.waitForFunction(
  () => (document.querySelector("#ai-messages")?.textContent || "").includes("dev stub"),
  undefined, { timeout: 30_000 });
await page.screenshot({ path: "/tmp/skill-tabs-skill.png" });
check("reopening the tab re-renders the conversation", true);

// 7. closing the last skill tab falls back to the graph
await page.click("loc=css:.tab.skill .tab-close");
await page.waitForFunction(() => document.querySelectorAll("#tabs .tab.skill").length === 0,
  undefined, { timeout: 5_000 });
const closed = await page.evaluate(() => ({
  skillTabs: document.querySelectorAll("#tabs .tab.skill").length,
  active: document.querySelector("#tabs .tab.active")?.textContent.trim(),
  skillMode: document.getElementById("ai").classList.contains("skill-mode"),
}));
check("closing the last skill tab falls back to the graph",
  closed.skillTabs === 0 && closed.skillMode === false && closed.active === "graph", closed);

// 8. a closed conversation is reachable again from the recent list
await page.click("#tab-add");
await page.waitForSelector("#newtab [data-action=resume]", { state: "visible" });
await page.click("loc=css:#newtab [data-action=resume]:has-text('seeded instruction') >> nth=0");
await page.waitForSelector(".tab.skill.active", { state: "visible" });
await page.waitForFunction(() => document.getElementById("ai").classList.contains("skill-mode"),
  undefined, { timeout: 10_000 });
await page.waitForFunction(
  () => (document.querySelector("#ai-messages")?.textContent || "").includes("dev stub"),
  undefined, { timeout: 30_000 });
check("a closed conversation reopens from the recent list", true);
await page.click("loc=css:.tab.skill .tab-close");
await page.waitForFunction(() => document.querySelectorAll("#tabs .tab.skill").length === 0,
  undefined, { timeout: 5_000 });

// 9. open tabs survive a reload
await page.click("#tab-add");
await page.waitForSelector("#newtab .skill-item", { state: "visible" });
await page.click("loc=css:#newtab .skill-item:has-text('Seeded skill') >> nth=0");
await page.waitForSelector(".tab.skill.active", { state: "visible" });
await page.reload();
await page.waitForSelector("#tabs", { state: "visible" });
await page.waitForFunction(() => document.querySelectorAll("#tabs .tab.skill").length === 1,
  undefined, { timeout: 10_000 });
await page.waitForFunction(() => document.getElementById("ai").classList.contains("skill-mode"),
  undefined, { timeout: 10_000 });
check("open tabs and the active tab survive a reload", true);

// 10. Nothing hugs the edge: the conversation scrolls over the whole pane
// (`#ai-scroll`), so the bubbles inside the capped column never reach the
// scrollbar, which now rides the pane's edge. (The chip shapes themselves —
// 120px, icons, per-row details — have their own case,
// `case-core-web-tool-chips`; the scroll area itself has `case-core-web-chat-scroll`.)
check("bubbles keep clear of the pane's scrollbar",
  await page.evaluate(() => {
    const scroller = document.getElementById("ai-scroll");
    const box = scroller.getBoundingClientRect();
    const bubbles = [...document.querySelectorAll("#ai-messages .ai-msg")];
    if (!bubbles.length) return false;
    const right = Math.max(...bubbles.map((b) => b.getBoundingClientRect().right));
    return Math.round(box.right - right) >= 12 &&
      getComputedStyle(scroller).scrollbarGutter.includes("stable");
  }));

// 11. /new cancels the instance: the active tab becomes a fresh generic chat,
// and reopening it must not bring the old conversation back. Before the fix
// the tab kept its old sessionId, so switching away and back replayed it.
const beforeNew = await page.evaluate(() => ({
  label: document.querySelector("#tabs .tab.skill.active")?.textContent.trim(),
  messages: document.querySelectorAll("#ai-messages .ai-msg").length,
}));
check("the tab has a conversation before /new",
  !!beforeNew.label && beforeNew.label.startsWith("Seeded skill") && beforeNew.messages > 0,
  beforeNew);
await page.fill("#ai-input-field", "/new");
await page.waitForSelector("#ai-cmd:not([hidden])", { state: "visible", timeout: 5_000 });
await page.press("#ai-input-field", "Enter");
await page.waitForFunction(
  () => document.querySelector("#tabs .tab.skill.active")?.textContent.trim().startsWith("new chat"),
  undefined, { timeout: 10_000 });
await page.waitForFunction(
  () => document.querySelectorAll("#ai-messages .ai-msg").length === 0,
  undefined, { timeout: 10_000 });
const afterNew = await page.evaluate(() => ({
  label: document.querySelector("#tabs .tab.skill.active")?.textContent.trim(),
  messages: document.querySelectorAll("#ai-messages .ai-msg").length,
  input: document.getElementById("ai-input-field").value,
  tabs: document.querySelectorAll("#tabs .tab.skill").length,
}));
check("/new replaces the tab with a fresh generic chat",
  afterNew.label.startsWith("new chat") && afterNew.messages === 0 &&
  afterNew.input === "" && afterNew.tabs === 1, afterNew);

// Open a second tab, then reopen the replaced one: the old conversation must
// not reappear.
await page.click("#tab-add");
await page.waitForSelector("#newtab .skill-item", { state: "visible" });
await page.click("loc=css:#newtab [data-action=newchat]");
await page.waitForFunction(() => document.getElementById("ai").classList.contains("skill-mode"),
  undefined, { timeout: 10_000 });
await page.click("loc=css:#tabs .tab.skill >> nth=0");
await page.waitForFunction(() => document.getElementById("ai").classList.contains("skill-mode"),
  undefined, { timeout: 10_000 });
await page.waitForFunction(
  () => document.querySelectorAll("#ai-messages .ai-msg").length === 0,
  undefined, { timeout: 10_000 });
const reopened = await page.evaluate(() => ({
  label: document.querySelector("#tabs .tab.skill.active")?.textContent.trim(),
  messages: document.querySelectorAll("#ai-messages .ai-msg").length,
}));
check("the /new'd tab stays empty when reopened",
  reopened.label.startsWith("new chat") && reopened.messages === 0, reopened);

// 12. the unsent draft is per instance: switching tabs swaps the composer.
await page.fill("#ai-input-field", "draft-A");
await page.click("loc=css:#tabs .tab.skill >> nth=1");
await page.waitForFunction(() => document.getElementById("ai-input-field").value === "",
  undefined, { timeout: 5_000 });
const otherDraft = await page.evaluate(() => document.getElementById("ai-input-field").value);
check("another instance starts with an empty composer", otherDraft === "", { draft: otherDraft });
await page.fill("#ai-input-field", "draft-B");
await page.click("loc=css:#tabs .tab.skill >> nth=0");
await page.waitForFunction(() => document.getElementById("ai-input-field").value === "draft-A",
  undefined, { timeout: 5_000 });
const draftA = await page.evaluate(() => document.getElementById("ai-input-field").value);
check("switching back restores the first instance's draft", draftA === "draft-A", { draft: draftA });
await page.click("loc=css:#tabs .tab.skill >> nth=1");
await page.waitForFunction(() => document.getElementById("ai-input-field").value === "draft-B",
  undefined, { timeout: 5_000 });
const draftB = await page.evaluate(() => document.getElementById("ai-input-field").value);
check("the second instance's draft is intact", draftB === "draft-B", { draft: draftB });

const ok = checks.every((c) => c.pass);
console.log(JSON.stringify({ ok, checks }, null, 2));
await space.finish({ keep: [] });
if (!ok) process.exitCode = 1;
EOF
```

Expected: `"ok": true` and every check `"pass": true` — six fixed, unclosable
tabs and no `ai` toggle in the topbar; `+` opens an inline, centred page (not a
dialog) with `+` itself as the only active tab, showing the four parts
(`built-in` / `my skills` / `suggested` / `recent`, the first offering `Chat`; the
`suggested` heading carrying no refresh button — discovery is automatic),
an
English
`nothing here yet` for empty sections and no create form; the page can start a
blank conversation (a tab with no messages, ready for input) and run a
saved skill (a closable tab that fills the page — with the conversation itself
capped at 1000px and centred, tool / thinking blocks being 300px chips that
widen when opened, and the scrolling spanning the whole pane with no bubble
touching its scrollbar — shows
the skill text as the first message and streams the reply); a fixed tab leaves skill mode without losing the
skill tab; reopening the tab re-renders the conversation; closing the last tab
falls back to the graph and the conversation can be reopened from `recent`; open
tabs survive a reload; `/new` replaces the active tab with a fresh generic chat
and the old conversation never returns when the tab is reopened; and the unsent
draft is per instance, so typing in one tab never shows up in another. Exit
code `0`.

## Teardown

```bash
pkill -f 'serve-web.*--port 8610'
pkill -f '/tmp/engineer serve-log --root .*skill-test'
pkill -f 'main.ts.*--port 8511'
```

# Test: core-web-tabs

The tab bar and the launcher. A tab carries one piece of content: a **chat**
(a skill is the class behind it — opening it runs the skill's text as the first
message — and a blank chat needs no skill) or a **page** (a blueprint rendered in
an iframe, covered by `case-core-web-page`). The fixed views (graph / how-to /
development / contracts / docs / notes) are tabs too, but they can never be
closed. `+` opens the launcher: Chat, then the Skills and Blueprints sections
(three each, with a heading to open the full list), then `recent`. `/new`
cancels the active instance and opens a fresh generic chat, and each instance
keeps its own unsent composer draft.

Source of truth: `workspace/web/index.html` (`#tabs`), `workspace/web/app.js`
(`openTab` / `activateTab` / `closeTab` / the launcher) and
`workspace/web/style.css` (`.newtab-*`, `#ai.tab-mode`). Tab switching, layout
and the page are DOM behaviour, so this case runs through a real browser
(`ego-browser`) rather than curl.

## Setup

Prerequisite: `ego-browser` on `PATH` (`ego-browser --version`).

```bash
# A scratch project root: the case must not touch the real .agents/ or .engineer/
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.skill-test"
rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: skill-test\n' > "$ROOT/engineer.yaml"
mkdir -p "$ROOT/.agents/blueprints"

# log + ai on their own ports; ai in stub mode, so skill runs are deterministic and offline
(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --root "$ROOT" --bind 127.0.0.1 --port 8513 >/tmp/tabs-log.log 2>&1 &
# its own static, rooted at $ROOT: the launcher reads skills from static now
/tmp/engineer serve-static --root "$ROOT" --bind 127.0.0.1 --port 8514 >/tmp/tabs-static.log 2>&1 &

(cd workspace/ai && bun run src/main.ts --root "$ROOT" --bind 127.0.0.1 --port 8511 --stub \
  --log http://localhost:8513 --static http://localhost:8514 \
  --agents "$ROOTDIR/agents/AGENTS.md" \
  >/tmp/tabs-ai.log 2>&1 &)

# wait for ai first: the writes below must not race the boot
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8511/ai/new -d '{}' && break
  sleep 1
done
# four saved skills, so the launcher's three-at-a-time preview is exercised —
# each is a directory with one SKILL.md, exactly what the agent would write
for n in "seeded-skill:Seeded skill:seeded instruction" "skill-b:Skill B:b instruction" "skill-c:Skill C:c instruction" "skill-d:Skill D:d instruction"; do
  slug=$(echo "$n" | cut -d: -f1); name=$(echo "$n" | cut -d: -f2); text=$(echo "$n" | cut -d: -f3)
  mkdir -p "$ROOT/.agents/skills/$slug"
  printf -- "---\nname: %s\ndescription: %s\n---\n%s\n" "$name" "$text" "$text" \
    > "$ROOT/.agents/skills/$slug/SKILL.md"
done

# 12 candidate files — one more than the skills page is allowed to show
for i in $(seq 1 12); do
  mkdir -p "$ROOT/.engineer/suggested-skills"
  printf -- "---\nname: Seed suggestion %s\ndescription: seeded candidate %s\n---\nseeded candidate %s\n" \
    "$i" "$i" "$i" > "$ROOT/.engineer/suggested-skills/seed-$i.md"
done

# web assets + the blueprint root (empty here; pages have their own case)
/tmp/engineer serve-web --bind 127.0.0.1 --port 8610 --assets "$ROOTDIR/workspace/web" \
  --pages "$ROOT/.agents/blueprints" \
  --static http://localhost:8514 --ai http://localhost:8511 --log http://localhost:8513 \
  >/tmp/tabs-web.log 2>&1 &
```

Expected on startup: the ai service logs `--stub: model calls disabled`, the
log server logs its address on `:8513`, the static server on `:8514`, and the web
server logs `engineer web: http://localhost:8610`.

## Run

```bash
WEB_URL=http://localhost:8610 ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:8610";
const space = await taskSpace("core-web-tabs");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });

await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs", { state: "visible" });
// start from a clean browser state (tabs *and* the ad-hoc chat panel)
await page.evaluate(() => {
  localStorage.removeItem("engineer.tabs");
});
await page.reload();
await page.waitForSelector("#tabs", { state: "visible" });
// A fixed viewport for this case: the launcher is checked by comparing boxes,
// and its centring only holds while the content fits the page.
await page.cdp("Emulation.setDeviceMetricsOverride",
  { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });

// 1. the fixed views are tabs and cannot be closed
const fixed = await page.evaluate(() =>
  [...document.querySelectorAll("#tabs .tab.fixed")].map((e) => e.textContent.trim()));
check("fixed views are tabs", fixed.join(",") === "graph,how-to,development,contracts,docs,notes", { fixed });
check("fixed tabs have no close button",
  await page.evaluate(() => document.querySelectorAll("#tabs .tab.fixed .tab-close").length === 0));
check("there is no ai toggle in the topbar",
  await page.evaluate(() => document.getElementById("ai-toggle") === null));

// 2. + opens the launcher (a page, not a dialog): Chat on top, then the Skills
// and Blueprints sections, then recent — one column, sections ruled apart.
await page.click("#tab-add");
await page.waitForSelector("#newtab .newtab-sec", { state: "visible" });
check("the launcher's four sections are in order",
  await page.evaluate(() => [...document.querySelectorAll("#newtab .newtab-sec")]
    .map((e) => e.dataset.section).join(",") === "chat,skills,blueprints,recent"));
check("the top of the launcher is the blank Chat button",
  await page.evaluate(() =>
    document.querySelector("#newtab [data-section=chat] [data-action=newchat] .launch-name")
      ?.textContent === "Chat"));
// Skills and Blueprints are previews: three rows, and a heading that opens the
// full list. Four skills exist, so exactly three are shown.
check("skills previews three of the four, under a heading",
  await page.evaluate(() =>
    document.querySelectorAll("#newtab [data-section=skills] .launch-item").length === 3 &&
    document.querySelector("#newtab [data-section=skills] .newtab-sec-head h3")?.textContent.trim() === "Skills" &&
    document.querySelectorAll("#newtab [data-section=skills] .launch-item[data-action=run]").length === 3));
check("an empty Blueprints section says so",
  await page.evaluate(() =>
    document.querySelector("#newtab [data-section=blueprints] .newtab-sec-head h3")?.textContent.trim() === "Blueprints" &&
    document.querySelector("#newtab [data-section=blueprints] .empty-hint")?.textContent === "nothing here yet"));
// The sections are ruled apart, and the whole column sits centred — not spread
// to the window's sides.
check("the sections are ruled apart and the column is centred",
  await page.evaluate(() => {
    const secs = [...document.querySelectorAll("#newtab .newtab-sec")];
    const host = document.getElementById("newtab").getBoundingClientRect();
    const body = document.querySelector("#newtab .newtab-body").getBoundingClientRect();
    const ruled = secs.slice(1).every((s) => getComputedStyle(s).borderTopWidth !== "0px");
    const stacked = secs.every((s, i) => i === 0 ||
      secs[i - 1].getBoundingClientRect().bottom <= s.getBoundingClientRect().top + 1);
    const dx = Math.abs((body.left - host.left) - (host.right - body.right));
    const dy = Math.abs((body.top - host.top) - (host.bottom - body.bottom));
    return ruled && stacked && dx <= 2 && dy <= 2;
  }));
check("+ is the active tab while the launcher shows",
  await page.evaluate(() => document.getElementById("newtab").hidden === false &&
    document.getElementById("left").hidden === true &&
    document.getElementById("tab-add").classList.contains("active") &&
    document.querySelectorAll("#tabs .tab.active").length === 0));

// 3. the Skills heading opens the skills page: back button top-left of the
// content column, my skills in full, suggested below a rule.
await page.click("loc=css:#newtab [data-section=skills] .newtab-sec-open");
await page.waitForFunction(() => location.pathname === "/new/skills", undefined, { timeout: 5_000 });
await page.waitForSelector("#newtab .newtab-back", { state: "visible" });
const skillsPage = await page.evaluate(() => {
  const back = document.querySelector("#newtab .newtab-back").getBoundingClientRect();
  const body = document.querySelector("#newtab .newtab-body").getBoundingClientRect();
  const suggestedHead = document.querySelector("#newtab [data-section=skills-suggested]");
  const host = document.getElementById("newtab").getBoundingClientRect();
  return {
    path: location.pathname,
    mine: document.querySelectorAll("#newtab [data-section=skills-mine] .launch-item").length,
    suggested: document.querySelectorAll("#newtab [data-section=skills-suggested] .launch-item").length,
    backAtTopLeft: back.left - body.left <= 24 && back.top - body.top <= 40,
    dl: Math.round(back.left - body.left),
    dt: Math.round(back.top - body.top),
    dtHost: Math.round(back.top - host.top),
    backBorder: getComputedStyle(document.querySelector("#newtab .newtab-back")).borderTopWidth,
    apart: suggestedHead ? getComputedStyle(suggestedHead).borderTopWidth : "",
  };
});
check("the skills page lists every saved skill, with a plain back button at the top",
  skillsPage.path === "/new/skills" && skillsPage.mine === 4 && skillsPage.backAtTopLeft &&
  skillsPage.backBorder === "0px" && skillsPage.dtHost <= 40, skillsPage);
check("suggested sits below my skills, apart, capped at 10",
  skillsPage.suggested === 10 && skillsPage.apart !== "0px", skillsPage);
// Each row is exactly one action, and carries no button of its own: a saved
// skill runs, a suggested candidate only points at the agent.
check("every skill row is one action and carries no button",
  await page.evaluate(() => {
    const mine = [...document.querySelectorAll("#newtab [data-section=skills-mine] .launch-item")];
    const suggested = [...document.querySelectorAll("#newtab [data-section=skills-suggested] .launch-item")];
    return mine.length === 4 && suggested.length === 10 &&
      mine.every((r) => r.dataset.action === "run") &&
      suggested.every((r) => r.dataset.action === "suggest") &&
      document.querySelectorAll("#newtab .launch-actions button").length === 0;
  }));
// The suggested section is a plain heading: discovery is automatic (the ai
// service scans once 30 runs pile up), so the page offers no manual trigger.
check("the suggested section has no refresh button",
  await page.evaluate(() =>
    document.querySelectorAll("#newtab .skill-refresh, #newtab [data-action=refresh]").length === 0));
check("there is no create-skill form on the page",
  await page.evaluate(() => document.querySelector("#newtab form") === null));
check("+ stays the active tab on the skills page",
  await page.evaluate(() => document.getElementById("tab-add").classList.contains("active") &&
    document.querySelectorAll("#tabs .tab.active").length === 0));
await page.click("loc=css:#newtab .newtab-back");
await page.waitForFunction(() => location.pathname === "/new", undefined, { timeout: 5_000 });
check("the back button returns to the launcher",
  await page.evaluate(() => document.getElementById("newtab").hidden === false &&
    document.querySelectorAll("#newtab .newtab-sec").length === 4));

// 2b. a row is one action, and nothing more: a kept skill runs, a blueprint
// opens, a suggested candidate only points at the agent. No row carries a
// delete / save / ignore button.
const rowActions = await page.evaluate(() =>
  [...document.querySelectorAll("#newtab .launch-item")].map((e) => e.dataset.action));
check("every launcher row is exactly one action (run / page / suggest / resume / newchat)",
  rowActions.length > 0 && rowActions.every((a) =>
    ["run", "page", "suggest", "resume", "newchat"].includes(a)),
  { actions: [...new Set(rowActions)] });
check("no row carries a delete / save / ignore button",
  await page.evaluate(() =>
    document.querySelectorAll("#newtab .launch-actions button, #newtab button[data-action=delete]").length === 0));
check("no delete affordance and no popover code path",
  await page.evaluate(() => document.querySelector(".skill-confirm") === null));

// 3. the launcher can start a blank conversation (no skill behind it)
await page.cdp("Emulation.clearDeviceMetricsOverride", {});
await page.click("loc=css:#newtab .newtab-back");
await page.waitForSelector("#newtab .newtab-sec", { state: "visible" });
await page.click("loc=css:#newtab [data-action=newchat]");
await page.waitForSelector(".tab[data-tab-id].active", { state: "visible" });
await page.waitForFunction(() => document.getElementById("ai").classList.contains("tab-mode"),
  undefined, { timeout: 10_000 });
const blank = await page.evaluate(() => ({
  tab: document.querySelector("#tabs .tab[data-tab-id].active")?.textContent.trim(),
  messages: document.querySelectorAll("#ai-messages .ai-msg").length,
  inputVisible: !document.getElementById("ai-input").hidden,
  newTabHidden: document.getElementById("newtab").hidden,
}));
check("the blank Chat button opens a blank conversation tab",
  !!blank.tab && blank.tab.startsWith("new chat"), { tab: blank.tab });
check("a blank chat starts empty and ready for input",
  blank.messages === 0 && blank.inputVisible === true && blank.newTabHidden === true, blank);
await page.click("loc=css:.tab[data-tab-id] .tab-close");
await page.waitForFunction(() => document.querySelectorAll("#tabs .tab[data-tab-id]").length === 0,
  undefined, { timeout: 5_000 });

// 4. a skill row opens a new conversation with the skill's text already in the
// composer. Nothing is sent on the click: the run starts when the user sends.
await page.click("#tab-add");
await page.waitForSelector("#newtab .newtab-sec", { state: "visible" });
await page.click("loc=css:#newtab [data-section=skills] .newtab-sec-open");
await page.waitForSelector("#newtab .newtab-back", { state: "visible" });
await page.click("loc=css:#newtab [data-section=skills-mine] .launch-item[data-id='seeded-skill']");
await page.waitForSelector(".tab[data-tab-id].active", { state: "visible" });
await page.waitForFunction(() => document.getElementById("ai").classList.contains("tab-mode"),
  undefined, { timeout: 10_000 });
await page.waitForFunction(
  () => (document.getElementById("ai-input-field")?.value || "").includes("seeded instruction"),
  undefined, { timeout: 10_000 });
const run = await page.evaluate(() => ({
  tab: document.querySelector("#tabs .tab[data-tab-id].active")?.textContent.trim(),
  input: document.getElementById("ai-input-field").value,
  messages: (document.querySelector("#ai-messages")?.textContent || "").trim(),
  leftHidden: document.getElementById("left").hidden,
  width: document.getElementById("ai").getBoundingClientRect().width,
  viewport: window.innerWidth,
  newTabHidden: document.getElementById("newtab").hidden,
}));
check("a skill row opens a tab named after the skill", !!run.tab && run.tab.startsWith("Seeded skill"), { tab: run.tab });
check("opening the skill leaves the launcher", run.newTabHidden === true);
check("the skill text waits in the composer and nothing is sent",
  run.input === "seeded instruction" && run.messages === "",
  { input: run.input, messages: run.messages.slice(0, 60) });
check("a tab takes the whole page",
  run.leftHidden === true && run.width > run.viewport * 0.9,
  { leftHidden: run.leftHidden, width: run.width, viewport: run.viewport });
// Sending is the user's decision — the prefilled text runs on that click.
await page.click("#ai-send");
await page.waitForFunction(
  () => (document.querySelector("#ai-messages")?.textContent || "").includes("dev stub"),
  undefined, { timeout: 30_000 });
const sent = await page.evaluate(() => ({
  user: document.querySelector("#ai-messages .ai-user")?.textContent.trim(),
  assistant: (document.querySelector("#ai-messages .ai-assistant")?.textContent || "").slice(0, 40),
  input: document.getElementById("ai-input-field").value,
}));
check("sending runs the prefilled skill text",
  sent.user === "seeded instruction" && sent.assistant.includes("dev stub") && sent.input === "",
  sent);
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

// 4b. recent is the way back to a *closed* conversation: the one that is open
// as a tab right now is filtered out of it.
await page.click("#tab-add");
await page.waitForSelector("#newtab .newtab-sec", { state: "visible" });
check("recent does not list the conversation that is open as a tab",
  await page.evaluate(() =>
    document.querySelectorAll("#newtab [data-section=recent] .launch-item").length === 0 &&
    document.querySelector("#newtab [data-action=resume]") === null));
await page.click("loc=css:#tabs .tab[data-tab-id]");
await page.waitForFunction(() => document.getElementById("newtab").hidden === true,
  undefined, { timeout: 5_000 });

// 5. a fixed tab leaves tab mode but keeps the tab
await page.click("loc=css:#tabs button[data-view='graph']");
await page.waitForFunction(() => !document.getElementById("ai").classList.contains("tab-mode"),
  undefined, { timeout: 5_000 });
await page.screenshot({ path: "/tmp/tabs-graph.png" });
const back = await page.evaluate(() => ({
  leftHidden: document.getElementById("left").hidden,
  tabs: document.querySelectorAll("#tabs .tab[data-tab-id]").length,
  active: document.querySelector("#tabs .tab.active")?.textContent.trim(),
}));
check("a fixed tab leaves tab mode and keeps the tab",
  back.leftHidden === false && back.tabs === 1 && back.active === "graph", back);

// 6. reopening the tab re-renders the conversation (from /ai/resume + log)
await page.click("loc=css:.tab[data-tab-id]");
await page.waitForFunction(() => document.getElementById("ai").classList.contains("tab-mode"),
  undefined, { timeout: 10_000 });
await page.waitForFunction(
  () => (document.querySelector("#ai-messages")?.textContent || "").includes("dev stub"),
  undefined, { timeout: 30_000 });
await page.screenshot({ path: "/tmp/tabs-skill.png" });
check("reopening the tab re-renders the conversation", true);

// 7. closing the last tab falls back to the graph
await page.click("loc=css:.tab[data-tab-id] .tab-close");
await page.waitForFunction(() => document.querySelectorAll("#tabs .tab[data-tab-id]").length === 0,
  undefined, { timeout: 5_000 });
const closed = await page.evaluate(() => ({
  tabs: document.querySelectorAll("#tabs .tab[data-tab-id]").length,
  active: document.querySelector("#tabs .tab.active")?.textContent.trim(),
  tabMode: document.getElementById("ai").classList.contains("tab-mode"),
}));
check("closing the last tab falls back to the graph",
  closed.tabs === 0 && closed.tabMode === false && closed.active === "graph", closed);

// 8. a closed conversation is reachable again from the recent list
await page.click("#tab-add");
await page.waitForSelector("#newtab [data-action=resume]", { state: "visible" });
await page.click("loc=css:#newtab [data-action=resume]:has-text('seeded instruction') >> nth=0");
await page.waitForSelector(".tab[data-tab-id].active", { state: "visible" });
await page.waitForFunction(() => document.getElementById("ai").classList.contains("tab-mode"),
  undefined, { timeout: 10_000 });
await page.waitForFunction(
  () => (document.querySelector("#ai-messages")?.textContent || "").includes("dev stub"),
  undefined, { timeout: 30_000 });
check("a closed conversation reopens from the recent list", true);
await page.click("loc=css:.tab[data-tab-id] .tab-close");
await page.waitForFunction(() => document.querySelectorAll("#tabs .tab[data-tab-id]").length === 0,
  undefined, { timeout: 5_000 });

// 9. open tabs survive a reload
await page.click("#tab-add");
await page.waitForSelector("#newtab .newtab-sec", { state: "visible" });
await page.click("loc=css:#newtab [data-section=skills] .newtab-sec-open");
await page.waitForSelector("#newtab .newtab-back", { state: "visible" });
await page.click("loc=css:#newtab .launch-item:has-text('Seeded skill') >> nth=0");
await page.waitForSelector(".tab[data-tab-id].active", { state: "visible" });
await page.reload();
await page.waitForSelector("#tabs", { state: "visible" });
await page.waitForFunction(() => document.querySelectorAll("#tabs .tab[data-tab-id]").length === 1,
  undefined, { timeout: 10_000 });
await page.waitForFunction(() => document.getElementById("ai").classList.contains("tab-mode"),
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
  label: document.querySelector("#tabs .tab[data-tab-id].active")?.textContent.trim(),
  messages: document.querySelectorAll("#ai-messages .ai-msg").length,
}));
check("the tab has a conversation before /new",
  !!beforeNew.label && beforeNew.label.startsWith("Seeded skill") && beforeNew.messages > 0,
  beforeNew);
await page.fill("#ai-input-field", "/new");
await page.waitForSelector("#ai-cmd:not([hidden])", { state: "visible", timeout: 5_000 });
await page.press("#ai-input-field", "Enter");
await page.waitForFunction(
  () => document.querySelector("#tabs .tab[data-tab-id].active")?.textContent.trim().startsWith("new chat"),
  undefined, { timeout: 10_000 });
await page.waitForFunction(
  () => document.querySelectorAll("#ai-messages .ai-msg").length === 0,
  undefined, { timeout: 10_000 });
const afterNew = await page.evaluate(() => ({
  label: document.querySelector("#tabs .tab[data-tab-id].active")?.textContent.trim(),
  messages: document.querySelectorAll("#ai-messages .ai-msg").length,
  input: document.getElementById("ai-input-field").value,
  tabs: document.querySelectorAll("#tabs .tab[data-tab-id]").length,
}));
check("/new replaces the tab with a fresh generic chat",
  afterNew.label.startsWith("new chat") && afterNew.messages === 0 &&
  afterNew.input === "" && afterNew.tabs === 1, afterNew);

// Open a second tab, then reopen the replaced one: the old conversation must
// not reappear.
await page.click("#tab-add");
await page.waitForSelector("#newtab .newtab-sec", { state: "visible" });
await page.click("loc=css:#newtab [data-action=newchat]");
await page.waitForFunction(() => document.getElementById("ai").classList.contains("tab-mode"),
  undefined, { timeout: 10_000 });
await page.click("loc=css:#tabs .tab[data-tab-id] >> nth=0");
await page.waitForFunction(() => document.getElementById("ai").classList.contains("tab-mode"),
  undefined, { timeout: 10_000 });
await page.waitForFunction(
  () => document.querySelectorAll("#ai-messages .ai-msg").length === 0,
  undefined, { timeout: 10_000 });
const reopened = await page.evaluate(() => ({
  label: document.querySelector("#tabs .tab[data-tab-id].active")?.textContent.trim(),
  messages: document.querySelectorAll("#ai-messages .ai-msg").length,
}));
check("the /new'd tab stays empty when reopened",
  reopened.label.startsWith("new chat") && reopened.messages === 0, reopened);

// 12. the unsent draft is per instance: switching tabs swaps the composer.
await page.fill("#ai-input-field", "draft-A");
await page.click("loc=css:#tabs .tab[data-tab-id] >> nth=1");
await page.waitForFunction(() => document.getElementById("ai-input-field").value === "",
  undefined, { timeout: 5_000 });
const otherDraft = await page.evaluate(() => document.getElementById("ai-input-field").value);
check("another instance starts with an empty composer", otherDraft === "", { draft: otherDraft });
await page.fill("#ai-input-field", "draft-B");
await page.click("loc=css:#tabs .tab[data-tab-id] >> nth=0");
await page.waitForFunction(() => document.getElementById("ai-input-field").value === "draft-A",
  undefined, { timeout: 5_000 });
const draftA = await page.evaluate(() => document.getElementById("ai-input-field").value);
check("switching back restores the first instance's draft", draftA === "draft-A", { draft: draftA });
await page.click("loc=css:#tabs .tab[data-tab-id] >> nth=1");
await page.waitForFunction(() => document.getElementById("ai-input-field").value === "draft-B",
  undefined, { timeout: 5_000 });
const draftB = await page.evaluate(() => document.getElementById("ai-input-field").value);
check("the second instance's draft is intact", draftB === "draft-B", { draft: draftB });

// 13. every row is read-only: changing a skill or a blueprint is a conversation
// away (the agent edits the file), so the page has no delete action at all.
await page.click("#tab-add");
await page.waitForSelector("#newtab .newtab-sec", { state: "visible" });
check("the launcher has no delete action anywhere",
  await page.evaluate(() =>
    [...document.querySelectorAll("#newtab button")].every((b) => b.dataset.action !== "delete")));

const ok = checks.every((c) => c.pass);
console.log(JSON.stringify({ ok, checks }, null, 2));
await space.finish({ keep: [] });
if (!ok) process.exitCode = 1;
EOF
```

Expected: `"ok": true` and every check `"pass": true` — six fixed, unclosable
tabs and no `ai` toggle in the topbar; `+` opens an inline, centred launcher (not
a dialog) with `+` itself as the only active tab, four sections in order
(`chat` / `skills` / `blueprints` / `recent`, ruled apart, the first offering
`Chat`; the skills section previewing three of four saved skills under a
`Skills` heading, the empty blueprints section saying `nothing here yet`); the
Skills heading opens `/new/skills` with a back button on the left of the centred
column, the four saved skills (each `chat,delete`) and ten suggested candidates
below a rule (each `chat,save,ignore`, no refresh button, no create form), the
back button returning to the launcher; `delete` asking first in a popover
anchored to its button (cancelling changes nothing, confirming removes the skill
and leaves three); the blank Chat button opening a tab with no messages ready for
input, and a saved skill's `chat` button opening a closable tab that fills the
page (the conversation itself capped at 1000px and centred, tool / thinking
blocks being 300px chips that widen when opened, the scrolling spanning the whole
pane with no bubble touching its scrollbar) showing the skill text as the first
message and streaming the reply; `recent` leaving out the conversation that is
open as a tab; a fixed tab leaving tab mode without losing the tab; reopening the
tab re-rendering the conversation; closing the last tab falling back to the graph
and the conversation being reopenable from `recent`; open tabs surviving a
reload; `/new` replacing the active tab with a fresh generic chat that never
comes back; and the unsent draft being per instance. Exit code `0`.

## Teardown

```bash
pkill -f 'serve-web.*--port 8610'
pkill -f '/tmp/engineer serve-log --root .*skill-test'
pkill -f 'main.ts.*--port 8511'
```

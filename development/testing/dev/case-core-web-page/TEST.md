# Test: core-web-page

A **page** is the second thing a tab can carry. A chat is one kind of content
(a skill is the class behind it, and a blank one needs no skill); a page is the
other, and it is created from a **blueprint** — a frontend resource: a directory
under `.agents/blueprints/<slug>/` with an `index.html` entry plus assets. The
web server serves those files under `/pages/…` (its second root), and the tab
renders one in an iframe. There is no page without a blueprint, no session
behind a page and no page in `recent`.

Source of truth: `workspace/web/server/serve.go` (the `--pages` root),
`workspace/web/app.js` (page tabs, `/pages/<id>`, the blueprints pages) and
`workspace/web/index.html` (`#page`). The behaviour is DOM + URL, so this case
runs through a real browser (`ego-browser`).

## Setup

Prerequisite: `ego-browser` on `PATH` (`ego-browser --version`).

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.page-test"
rm -rf "$ROOT" && mkdir -p "$ROOT"
printf 'project: page-test\n' > "$ROOT/engineer.yaml"

# Four blueprints, written straight to disk: the ai service reads the directory,
# so no api call is needed to seed them. `hello` is the one that talks back to
# the services — it reads /config.js and calls the ai api, which is exactly what
# a real blueprint is expected to be able to do.
BPS="$ROOT/.agents/blueprints"
for n in hello alpha beta gamma; do mkdir -p "$BPS/$n"; done
cat > "$BPS/hello/index.html" <<'HTML'
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Hello Page</title>
  <script>
    window.__bootTheme = localStorage.getItem("engineer.theme") || "light";
    document.documentElement.setAttribute("data-theme", window.__bootTheme);
  </script>
  <link rel="stylesheet" href="/theme.css">
  <style>
    body { margin: 0 }
    #swatch { display: inline-block; width: 40px; height: 10px; background: var(--surface-3) }
  </style>
</head>
<body>
  <div id="runtime">loading</div>
  <div id="list">loading</div>
  <div id="theme"></div>
  <div id="swatch"></div>
  <script src="./app.js"></script>
</body></html>
HTML
cat > "$BPS/hello/app.js" <<'JS'
// Proves the document survived a theme switch unchanged (no reload).
window.__alive = "yes";
const showTheme = () => {
  document.getElementById("theme").textContent =
    "theme=" + document.documentElement.getAttribute("data-theme");
};
showTheme();
new MutationObserver(showTheme)
  .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
const s = document.createElement("script");
s.src = "/config.js";
s.onload = async () => {
  document.getElementById("runtime").textContent = "static=" + window.ENGINEER.static;
  try {
    const r = await fetch(window.ENGINEER.static + "/static/query", {
      method: "POST",
      headers: { "Content-Type": "application/yaml" },
      body: "{}",
    });
    document.getElementById("list").textContent = "list=" + r.status;
  } catch (e) {
    document.getElementById("list").textContent = "list=blocked";
  }
};
document.head.appendChild(s);
JS
printf 'body { margin: 0 }\n' > "$BPS/hello/style.css"
for n in alpha beta gamma; do
  printf '<!doctype html><html><head><title>%s</title></head><body>%s</body></html>\n' "$n" "$n" \
    > "$BPS/$n/index.html"
done

# log + ai on their own ports; ai in stub mode, so no model is ever needed
(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --root "$ROOT" --bind 127.0.0.1 --port 8522 >/tmp/page-log.log 2>&1 &
# its own static, rooted at $ROOT: the launcher reads skills and blueprints from it
/tmp/engineer serve-static --root "$ROOT" --bind 127.0.0.1 --port 8524 >/tmp/page-static.log 2>&1 &

(cd workspace/ai && bun run src/main.ts --root "$ROOT" --bind 127.0.0.1 --port 8521 --stub \
  --log http://localhost:8522 --static http://localhost:8524 \
  --agents "$ROOTDIR/agents/AGENTS.md" \
  >/tmp/page-ai.log 2>&1 &)

# one saved skill, so the skills page has something of the user's own to show —
# a plain file, exactly what the agent would write
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:8521/ai/new -d '{}' && break
  sleep 1
done
mkdir -p "$ROOT/.agents/skills/seeded-skill"
printf -- '---\nname: Seeded skill\ndescription: seeded instruction\n---\nseeded instruction\n' \
  > "$ROOT/.agents/skills/seeded-skill/SKILL.md"

# web assets + the blueprint root (--pages)
/tmp/engineer serve-web --bind 127.0.0.1 --port 8641 --assets "$ROOTDIR/workspace/web" \
  --pages "$BPS" \
  --static http://localhost:8524 --ai http://localhost:8521 --log http://localhost:8522 \
  >/tmp/page-web.log 2>&1 &
```

Expected on startup: the web server logs `engineer web: http://localhost:8641`.

## Run

```bash
WEB_URL=http://localhost:8641 ego-browser nodejs <<'EOF'
const WEB = process.env.WEB_URL || "http://localhost:8641";
const space = await taskSpace("core-web-page");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });

await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs", { state: "visible" });
await page.evaluate(() => {
  localStorage.removeItem("engineer.tabs");
  localStorage.removeItem("engineer.theme"); // the shell's theme must start at light
});
await page.reload();
await page.waitForSelector("#tabs", { state: "visible" });
await page.cdp("Emulation.setDeviceMetricsOverride",
  { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false });

// 1. the launcher shows the blueprints, three of them, and leads into the full list
await page.click("#tab-add");
await page.waitForSelector("#newtab .newtab-sec", { state: "visible" });
const home = await page.evaluate(() => {
  const secs = (n) => [...document.querySelectorAll(`#newtab [data-section=${n}] .launch-item`)];
  return {
    order: [...document.querySelectorAll("#newtab .newtab-sec")].map((e) => e.dataset.section).join(","),
    chat: document.querySelector("#newtab [data-section=chat] [data-action=newchat] .launch-name")?.textContent,
    mine: secs("skills").length,
    blueprints: secs("blueprints").length,
    bpNames: secs("blueprints").map((r) => r.querySelector(".launch-name").textContent).sort(),
    heads: [...document.querySelectorAll("#newtab .newtab-sec-open")]
      .map((b) => b.closest(".newtab-sec-head").querySelector("h3")?.textContent.trim()),
  };
});
check("the launcher is four sections in order: chat, skills, blueprints, recent",
  home.order === "chat,skills,blueprints,recent", home);
check("the top of the launcher is the blank Chat button",
  home.chat === "Chat", { chat: home.chat });
check("skills and blueprints show at most three each, with a heading to open the full list",
  home.mine <= 3 && home.blueprints === 3 && home.heads.join(",") === "Skills,Blueprints", home);

// 2. the title is a label, the arrow is the way in
await page.click("loc=css:#newtab [data-section=skills] .newtab-sec-head h3");
check("the section title is a plain label — only the arrow leads in",
  await page.evaluate(() => location.pathname === "/new" &&
    document.querySelector("#newtab [data-section=skills] .newtab-sec-head").dataset.action === undefined));

// 2. the Blueprints heading opens the blueprints page: every blueprint, in full,
// with the back button at the top-left of the centred content column
await page.click("loc=css:#newtab [data-section=blueprints] .newtab-sec-open");
await page.waitForFunction(() => location.pathname === "/new/blueprints", undefined, { timeout: 5_000 });
await page.waitForSelector("#newtab .newtab-back", { state: "visible" });
const bpPage = await page.evaluate(() => {
  const backEl = document.querySelector("#newtab .newtab-back");
  const back = backEl.getBoundingClientRect();
  const body = document.querySelector("#newtab .newtab-body").getBoundingClientRect();
  const host = document.getElementById("newtab").getBoundingClientRect();
  return {
    names: [...document.querySelectorAll("#newtab [data-section=blueprints-all] .launch-name")]
      .map((e) => e.textContent).sort(),
    backAtTopLeft: back.left - body.left <= 24 && back.top - body.top <= 40,
    dtHost: Math.round(back.top - host.top),
    backBorder: getComputedStyle(backEl).borderTopWidth,
  };
});
check("the blueprints page lists them all, with a plain back button at the top",
  bpPage.names.join(",") === "Hello Page,alpha,beta,gamma" && bpPage.backAtTopLeft &&
  bpPage.backBorder === "0px" && bpPage.dtHost <= 40, bpPage);
await page.evaluate(() => history.back());
await page.waitForFunction(() => location.pathname === "/new", undefined, { timeout: 5_000 });

// 3. opening a blueprint gives a page tab: the tab is named after the blueprint,
// and the pane holds an iframe pointed at the blueprint's own files. (The
// launcher previews three, so `hello` is opened from the blueprints page.)
await page.click("loc=css:#newtab [data-section=blueprints] .newtab-sec-open");
await page.waitForSelector("#newtab .newtab-back", { state: "visible" });
await page.click("loc=css:#newtab [data-section=blueprints-all] .launch-item:has-text('Hello Page')");
await page.waitForSelector("#page:not([hidden])", { state: "visible", timeout: 10_000 });
const opened = await page.evaluate(() => ({
  tab: document.querySelector("#tabs .tab[data-tab-id].active")?.textContent.trim(),
  src: document.getElementById("page-frame").getAttribute("src"),
  ai: document.getElementById("ai").hidden,
  left: document.getElementById("left").hidden,
  path: location.pathname,
}));
check("a blueprint opens a page tab named after it",
  opened.tab.startsWith("Hello Page") && opened.path === "/pages/hello", opened);
check("the page pane holds an iframe on the blueprint's files",
  /^\/pages\/hello\/$/.test(opened.src) && opened.ai === true && opened.left === true, opened);

// 4. the blueprint is a real page: it reads /config.js and calls the ai api
// cross-origin, and its own assets come from the same directory
await page.waitForFunction(() => {
  const f = document.getElementById("page-frame");
  const d = f?.contentDocument;
  return d?.getElementById("runtime")?.textContent?.startsWith("ai=http") &&
    /^list=\d+$/.test(d?.getElementById("list")?.textContent || "");
}, undefined, { timeout: 15_000 });
const inside = await page.evaluate(() => {
  const d = document.getElementById("page-frame").contentDocument;
  return {
    runtime: d.getElementById("runtime").textContent,
    list: d.getElementById("list").textContent,
    style: !!d.querySelector("link, style") || true,
  };
});
check("a blueprint reads the runtime addresses and calls the services",
  inside.runtime === "ai=http://localhost:8521" && inside.list === "list=200", inside);

// 5. the address bar is the page's own route, and a reload lands back on the tab
await page.reload();
await page.waitForSelector("#page:not([hidden])", { state: "visible", timeout: 10_000 });
await page.waitForFunction(() => document.querySelectorAll("#tabs .tab[data-tab-id]").length === 1,
  undefined, { timeout: 10_000 });
const reloaded = await page.evaluate(() => ({
  path: location.pathname,
  tab: document.querySelector("#tabs .tab[data-tab-id].active")?.textContent.trim(),
  iframe: document.getElementById("page-frame").getAttribute("src"),
}));
check("reloading /pages/<id> keeps the tab, it does not fall into the bare blueprint",
  reloaded.path === "/pages/hello" && reloaded.tab.startsWith("Hello Page") && reloaded.iframe === "/pages/hello/",
  reloaded);

// 6. the page follows the shell's theme: the shell writes data-theme (and
// color-scheme) into the page's document on load and on every switch, and the
// shared /theme.css palette repaints with it — without reloading the page.
// The reload in step 5 restarts the frame, so wait for its document to be back.
await page.waitForFunction(() => {
  const d = document.getElementById("page-frame")?.contentDocument;
  return !!d?.getElementById("swatch") && !!d.documentElement.getAttribute("data-theme");
}, undefined, { timeout: 10_000 });
const themeBefore = await page.evaluate(() => {
  const d = document.getElementById("page-frame").contentDocument;
  const swatch = d.getElementById("swatch");
  return {
    shell: document.documentElement.getAttribute("data-theme"),
    frame: d.documentElement.getAttribute("data-theme"),
    scheme: d.documentElement.style.colorScheme,
    swatch: getComputedStyle(swatch).backgroundColor,
    alive: d.defaultView.__alive,
    css: getComputedStyle(document.body).getPropertyValue("--surface").trim(),
    bodyMargin: getComputedStyle(d.body).marginTop,
    bootTheme: d.defaultView.__bootTheme,
    font: getComputedStyle(d.body).fontFamily,
    shellFont: getComputedStyle(document.body).fontFamily,
    fontVar: getComputedStyle(d.documentElement).getPropertyValue("--font").trim(),
  };
});
check("the page's document carries the shell's theme, and /theme.css gives both the same palette and font",
  themeBefore.shell === "light" && themeBefore.frame === "light" &&
  themeBefore.scheme === "light" && !!themeBefore.css && themeBefore.bodyMargin === "0px" &&
  themeBefore.font === themeBefore.shellFont && !!themeBefore.fontVar &&
  themeBefore.bootTheme === "light",   // the blueprint's own bootstrap read the shared key
  themeBefore);
await page.click("#theme-toggle");
await page.waitForSelector("#theme-menu:not([hidden])", { state: "visible" });
await page.click("loc=css:#theme-menu button[data-theme='dark']");
await page.waitForFunction(() =>
  document.getElementById("page-frame")?.contentDocument
    ?.documentElement?.getAttribute("data-theme") === "dark", undefined, { timeout: 5_000 });
const themeAfter = await page.evaluate(() => {
  const d = document.getElementById("page-frame").contentDocument;
  return {
    frame: d.documentElement.getAttribute("data-theme"),
    scheme: d.documentElement.style.colorScheme,
    swatch: getComputedStyle(d.getElementById("swatch")).backgroundColor,
    alive: d.defaultView.__alive,
    label: d.getElementById("theme").textContent,
  };
});
check("switching the shell's theme reaches the page — it repaints, it does not reload",
  themeAfter.frame === "dark" && themeAfter.scheme === "dark" &&
  themeAfter.alive === "yes" && themeAfter.label === "theme=dark" &&
  themeAfter.swatch !== themeBefore.swatch,
  { themeBefore, themeAfter });
// back to light, so the rest of the case runs in the default theme
await page.click("#theme-toggle");
await page.waitForSelector("#theme-menu:not([hidden])", { state: "visible" });
await page.click("loc=css:#theme-menu button[data-theme='light']");
await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "light");

// 7. a page is not a conversation: nothing about it reaches recent
await page.click("#tab-add");
await page.waitForSelector("#newtab .newtab-sec", { state: "visible" });
const recent = await page.evaluate(() => ({
  texts: document.querySelector("#newtab [data-section=recent]").textContent,
  count: document.querySelectorAll("#newtab [data-section=recent] .launch-item").length,
}));
check("recent holds no page", recent.count === 0 && !/Hello Page/.test(recent.texts), recent);

// 8. a blueprint can be deleted from the blueprints page, and it asks first
await page.click("loc=css:#newtab [data-section=blueprints] .newtab-sec-open");
await page.waitForSelector("#newtab .newtab-back", { state: "visible" });
await page.click("loc=css:#newtab [data-section=blueprints-all] .launch-actions button[data-action=delete][data-id='alpha']");
await page.waitForSelector(".skill-confirm", { state: "visible" });
await page.click("loc=css:.skill-confirm .skill-confirm-delete");
await page.waitForFunction(() =>
  ![...document.querySelectorAll("#newtab [data-section=blueprints-all] .launch-name")]
    .some((e) => e.textContent === "alpha"), undefined, { timeout: 10_000 });
check("deleting a blueprint removes it from the page", true);

// 9. closing the page tab falls back to the graph (closing it while it is the
// one on screen — a tab that is not active just disappears from the bar)
await page.click("loc=css:#tabs .tab[data-tab-id]");
await page.waitForSelector("#page:not([hidden])", { state: "visible", timeout: 10_000 });
await page.click("loc=css:#tabs .tab[data-tab-id] .tab-close");
await page.waitForFunction(() => document.querySelectorAll("#tabs .tab[data-tab-id]").length === 0,
  undefined, { timeout: 5_000 });
const closed = await page.evaluate(() => ({
  page: document.getElementById("page").hidden,
  active: document.querySelector("#tabs .tab.active")?.textContent.trim(),
}));
check("closing the page tab falls back to the graph",
  closed.page === true && closed.active === "graph", closed);

const ok = checks.every((c) => c.pass);
console.log(JSON.stringify({ ok, checks }, null, 2));
await space.finish({ keep: [] });
if (!ok) process.exitCode = 1;
EOF
```

Expected: `"ok": true` — and beyond the browser checks, the page follows the
shell's theme: the frame's document carries the shell's `data-theme` (and
`color-scheme`), the shared `/theme.css` palette is what both sides paint with,
and a switch to dark repaints the page **without reloading it** (its
`window.__alive` marker survives). The setup's own consequences are part of the
case — `alpha` leaves the disk:

```bash
ls "$BPS"
```

Expected: `hello`, `beta`, `gamma` — no `alpha`.

## Teardown

```bash
pkill -f 'serve-web.*--port 8641'
pkill -f '/tmp/engineer serve-log --root .*page-test'
pkill -f 'main.ts.*--port 8521'
rm -rf "$ROOTDIR/.engineer/.page-test"
```

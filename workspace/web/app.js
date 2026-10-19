import yaml from "./vendor/js-yaml.js";
import MarkdownIt from "./vendor/markdown-it.js";
import DOMPurify from "./vendor/dompurify.js";
import hljs from "./vendor/highlight.js";

// Runtime addresses are injected by serve-web and served as an ES module.
// There is no fallback: guessing a port would point the page at whatever happens
// to be listening there. Without the config the page cannot reach any service,
// so say so rather than pretending to work.
import { ENGINEER as RUNTIME } from "/config.js";
if (!RUNTIME?.ai || !RUNTIME?.log) {
  const message = "engineer web: /config.js did not provide ai / log";
  document.body.innerHTML = `<div class="empty-hint">${message}</div>`;
  throw new Error(message);
}
const STATIC_BASE = RUNTIME.static; // static: the project tree (blueprints)
const AI_BASE = RUNTIME.ai;         // ai: conversation
const LOG_BASE = RUNTIME.log;       // log: records, tabs, sessions, current

const tabsEl = document.getElementById("tabs");
const panesEl = document.getElementById("panes");
const themeToggleEl = document.getElementById("theme-toggle");
const themeMenuEl = document.getElementById("theme-menu");

// The composer grows with its content up to this many lines, then scrolls.
const AI_INPUT_MAX_LINES = 10;


const THEME_ORDER = ["light", "dark", "solarized"];
const THEME_KEY = "engineer.theme";

function currentTheme() {
  const t = document.documentElement.getAttribute("data-theme");
  return THEME_ORDER.includes(t) ? t : "light";
}

function applyTheme(name) {
  if (!THEME_ORDER.includes(name)) name = "light";
  document.documentElement.setAttribute("data-theme", name);
  try {
    localStorage.setItem(THEME_KEY, name);
  } catch (e) {}
  if (themeToggleEl) themeToggleEl.title = `theme: ${name}`;
  if (themeMenuEl) syncThemeMenu();
  pushPageTheme();
}

// A page is a document of its own (an iframe), so the shell's variables and its
// `data-theme` attribute do not reach it on their own. Same origin, though, means
// the shell can write them straight in: the blueprint then follows the theme by
// styling `html[data-theme]` / using /theme.css, with no listening of its own.
function pushPageTheme() {
  const theme = currentTheme();
  for (const tab of openTabs) {
    for (const pane of tab.panes?.values() ?? []) {
      const doc = pane.frameEl?.contentDocument;
      if (!doc) continue;
      doc.documentElement.setAttribute("data-theme", theme);
      // Native widgets and the scrollbar follow color-scheme, not our variables.
      doc.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light";
    }
  }
}



// ---------- the workspace ----------
//
// The shell is main's conversation plus the tabs main opens. Both are state in
// log, not in this browser: `current` says which tabs are open and which session
// is main, `tabs` holds each tab's pane tree, `sessions` says what each
// conversation is. This file only mirrors that — a reload reads it back and
// nothing is restored from local storage.
//
// There is no way for the user to open or close a tab here: main's tools do that,
// and the tool frame is what makes the shell redraw (see aiHandleEvent).

const openTabs = []; // main first, then the open tabs in display order
let activeTabId = null; // "main" or a tabId
let mainTab = null;

async function logCall(path, body = {}) {
  const res = await fetch(`${LOG_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: yaml.dump(body),
  });
  const text = await res.text();
  if (!res.ok) {
    const data = yaml.load(text) || {};
    const err = new Error(data.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return text ? yaml.load(text) || {} : {};
}

const logCurrent = () => logCall("/log/current/get");
const logCurrentPut = (openTabs, mainSession) =>
  logCall("/log/current/put", { openTabs, mainSession });
const logTabDetail = (tabId) => logCall("/log/tab/detail", { tabId });
const logTabOn = (tabIds, index) =>
  logCall("/log/tab/on", typeof index === "number" ? { tabIds, index } : { tabIds });
const logTabOff = (tabId) => logCall("/log/tab/off", { tabIds: [tabId] });
const logTabNew = (body) => logCall("/log/tab/new", body);
const logTabList = (pageNum = 1) => logCall("/log/tab/list", { pageNum });
const logSessionKind = (sessionId) => logCall("/log/session/detail", { sessionId });

async function aiResume(id) {
  const res = await fetch(`${AI_BASE}/ai/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: yaml.dump({ id }),
  });
  return res.ok;
}

async function sessionExists(id) {
  try {
    await logSessionKind(id);
    return true;
  } catch {
    return false;
  }
}

// primaryPane returns the first pane leaf of a tree, or null.
function primaryPane(layout) {
  let node = normalizeTree(layout);
  while (node && node.split) node = node.split.children[0];
  return node && node.pane ? node.pane : null;
}

function agentFrameSrc(sessionId) {
  return `/agent/${encodeURIComponent(sessionId)}/`;
}

// tabFromRecord rebuilds one tab's shell object from its log record. Its panes are
// built lazily (showPanes → renderPanes), so a tab that is never shown costs
// nothing.
function tabFromRecord(rec) {
  return {
    id: rec.tabId,
    tabId: rec.tabId,
    // The tab's name is stored with its record, so a reload draws the tab bar
    // without loading a single page. hydrateTabNames fills in the records that
    // predate the field.
    name: rec.title || "",
    sessionId: "",
    panes: new Map(),
    layout: normalizeTree(rec.layout) || null,
    paneEl: null,
  };
}

function sessionsOf(tabs) {
  const ids = new Set();
  for (const tab of tabs) {
    const walk = (node) => {
      if (!node) return;
      if (node.pane) {
        const id = node.pane.contentId ?? node.pane.id ?? node.pane.content;
        if (id) ids.add(String(id));
        return;
      }
      for (const child of node.split?.children ?? []) walk(child);
    };
    walk(tab.layout);
  }
  return [...ids];
}

// makeMainTab builds main: one chat pane, hosted by the shell itself. main has no
// tab record — it is always there — so its pane element is what showPanes shows.
function makeMainTab(sessionId) {
  const tab = {
    id: "main",
    tabId: "",
    name: "main",
    sessionId,
    panes: new Map(),
    layout: null,
    paneEl: null,
    main: true,
  };
  // main is the shell's own conversation: one <engineer-chat>, the same element
  // a blueprint page mounts. It shows its history (its records are in log).
  const chat = document.createElement("engineer-chat");
  chat.setAttribute("session", sessionId);
  chat.setAttribute("history", "");
  chat.className = "pane pane-main";
  // main's tools change the workspace; the element only reports them.
  chat.addEventListener("engineer-tool", (event) => {
    const d = event.detail || {};
    if (!d.isError && /^(tab-|session-)/.test(String(d.name ?? ""))) {
      void refreshWorkspace();
    }
  });
  tab.paneEl = chat;
  return tab;
}

function dropMainTab() {
  if (!mainTab) return;
  mainTab.paneEl?.remove();
  mainTab.paneEl = null;
}

// ---------- the tab bar ----------

function renderTabs() {
  tabsEl.innerHTML = "";
  for (const tab of openTabs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab" + (tab.main ? " main" : "");
    btn.dataset.tabId = tab.id;
    const label = document.createElement("span");
    label.className = "tab-label";
    label.textContent = tab.main ? "main" : tab.name || "…";
    btn.appendChild(label);
    if (!tab.main) {
      const close = document.createElement("button");
      close.type = "button";
      close.className = "tab-close";
      close.title = "close this tab (its record is kept)";
      close.textContent = "×";
      close.addEventListener("click", (event) => {
        event.stopPropagation();
        void closeWorkspaceTab(tab);
      });
      btn.appendChild(close);
    }
    btn.addEventListener("click", () => void activateTab(tab.id));
    tabsEl.appendChild(btn);
  }
  syncTabActive();
}

function syncTabActive() {
  for (const btn of tabsEl.querySelectorAll(".tab")) {
    btn.classList.toggle("active", btn.dataset.tabId === activeTabId);
  }
}

// syncTabUrl keeps the address bar naming the tab. A reload always lands on main
// (the workspace is read from log, not from the URL), so this is a within-session
// address, not a restore point.
function syncTabUrl(tab, mode) {
  if (!mode) return;
  const path = tab.main ? "/" : `/tab/${tab.tabId}`;
  if (location.pathname === path) return;
  if (mode === "push") history.pushState({ tab: tab.id }, "", path);
  else history.replaceState({ tab: tab.id }, "", path);
}

async function activateTab(id, mode = "push") {
  const tab = openTabs.find((t) => t.id === id);
  if (!tab) return;
  launcherClose();
  activeTabId = tab.id;
  showPanes(tab);
  if (tab.main) tab.paneEl?.focus?.();
  syncTabActive();
  syncTabUrl(tab, mode);
  installTitleWatchers();
}

// closeWorkspaceTab closes a tab: log takes it out of the open list, the record
// stays (main's tab-delete is what removes things for good).
async function closeWorkspaceTab(tab) {
  if (tab.main) return;
  try {
    await logTabOff(tab.tabId);
  } catch {
    // Even if log says no, take it off screen; the next refresh will reconcile.
  }
  removeTab(tab);
  if (activeTabId === tab.id) await activateTab("main", "replace");
  else if (activeTabId === "main") syncTabUrl(mainTab, "replace");
}

function removeTab(tab) {
  const i = openTabs.indexOf(tab);
  if (i >= 0) openTabs.splice(i, 1);
  dropTabPanes(tab);
  renderTabs();
}

// ---------- the workspace, re-read after main's tools change it ----------

// One refresh at a time: a run can finish several tab-* tools in a row, and each
// frame asks for the same picture. Two overlapping passes would both see a tab as
// missing and both add it — the tab bar then shows the workspace N times.
let refreshChain = Promise.resolve();

function refreshWorkspace() {
  const run = refreshChain.then(doRefreshWorkspace, doRefreshWorkspace);
  refreshChain = run.catch(() => {});
  return run;
}

async function doRefreshWorkspace() {
  let cur;
  try {
    cur = await logCurrent();
  } catch (err) {
    toast(`could not read the workspace: ${err.message}`);
    return;
  }
  const want = cur.openTabs ?? [];
  // A tab the workspace no longer holds goes off screen (a tab-delete closes it
  // too, but a tab-off or another window can drop it as well).
  for (const tab of [...openTabs]) {
    if (tab.main) continue;
    if (!want.includes(tab.tabId)) removeTab(tab);
  }
  // A tab the workspace gained: build it, resume its conversations, put it up.
  // `opened` is what tab-on means — the new tab is the thing to look at.
  let opened = null;
  for (const tabId of want) {
    if (openTabs.some((t) => t.tabId === tabId)) continue;
    let rec;
    try {
      rec = await logTabDetail(tabId);
    } catch {
      continue; // a stale id in the list: the next write will drop it
    }
    // Re-check after the await: a refresh that ran while this one was waiting may
    // have added it already.
    if (openTabs.some((t) => t.tabId === tabId)) continue;
    const tab = tabFromRecord(rec);
    openTabs.push(tab);
    opened = tab;
    for (const sessionId of sessionsOf([tab])) await aiResume(sessionId);
  }
  // A tab whose tree main rewrote is rebuilt from the record.
  for (const tab of openTabs) {
    if (tab.main) continue;
    try {
      const rec = await logTabDetail(tab.tabId);
      const next = normalizeTree(rec.layout) || null;
      if (rec.title && rec.title !== tab.name) {
        tab.name = rec.title;
      }
      if (JSON.stringify(next) !== JSON.stringify(tab.layout)) {
        tab.layout = next;
        dropTabPanes(tab);
      }
    } catch {
      // gone; the next refresh removes it
    }
  }
  // main got a new session (clear from another window): follow it.
  if (cur.mainSession && mainTab && cur.mainSession !== mainTab.sessionId) {
    const wasActive = activeTabId === "main";
    dropMainTab();
    mainTab = makeMainTab(cur.mainSession);
    openTabs[0] = mainTab;
    if (wasActive) await activateTab("main", "replace");
  }
  renderTabs();
  installTitleWatchers();
  void hydrateTabNames();
  if (opened) await activateTab(opened.id);
  const active = openTabs.find((t) => t.id === activeTabId);
  if (active) showPanes(active);
  else await activateTab("main", "replace");
}

// A tab is named after the page it shows — its first pane's <title>. The pane is
// only built when the tab is activated, so a tab that was never opened has no
// iframe to read: fetch its page once and take the title from there.
const tabNames = new Map(); // sessionId -> title, so a restored tab costs one fetch

async function fetchTabName(sessionId) {
  if (!sessionId) return "";
  if (tabNames.has(sessionId)) return tabNames.get(sessionId);
  let title = "";
  try {
    const res = await fetch(agentFrameSrc(sessionId), { cache: "no-store" });
    if (res.ok) {
      // DOMParser decodes entities: a title written as "A &amp; B" reads as "A & B".
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      title = doc.title.trim();
    }
  } catch {
    // an unreachable page keeps the placeholder
  }
  tabNames.set(sessionId, title);
  return title;
}

async function hydrateTabNames() {
  let changed = false;
  for (const tab of openTabs) {
    if (tab.main || tab.name) continue;
    const first = primaryPane(tab.layout);
    if (!first) continue;
    const title = await fetchTabName(first.contentId);
    if (title) {
      tab.name = title;
      changed = true;
    }
  }
  if (changed) renderTabs();
}

// The pane, once it exists, is the authority (its document is loaded): keep the
// title in step with what the iframe actually shows.
function installTitleWatchers() {
  for (const tab of openTabs) {
    if (tab.main) continue;
    for (const pane of tab.panes.values()) {
      if (!pane.frameEl || pane.frameEl.dataset.watch) continue;
      pane.frameEl.dataset.watch = "1";
      const read = () => {
        // The stored title is the tab's name; the page is only consulted for a
        // record that has none (one written before titles existed).
        if (tab.name) return;
        const title = pane.frameEl.contentDocument?.title;
        if (title && tab.name !== title) {
          tab.name = title;
          renderTabs();
        }
      };
      pane.frameEl.addEventListener("load", read);
      read();
    }
  }
}

// ---------- the launcher (the +) ----------
//
// A popover, not a view: blueprints (static) and recent conversations (log).
// Picking one opens a tab; picking a recent session reopens it in a new tab.
// main itself is not a tab, so "new main conversation" lives here too.

const tabAddEl = document.getElementById("tab-add");
const launcherEl = document.getElementById("launcher");

// Opening a row takes several round trips (make the agent, write the tab, resume
// the session, load its page), and until the last one the workspace under the
// launcher still shows the tab that was active — main. So the launcher is not the
// thing that reveals what a row opened: `launcherHold` keeps it up (and takes no
// clicks, so one click cannot start two agents) until the new page has painted,
// and only then is it closed. Releasing the hold is what lets it close at all.
let launcherHold = false;

function launcherClose() {
  if (launcherHold) return;
  launcherEl.hidden = true;
}

function launcherHoldOn() {
  launcherHold = true;
  launcherEl.classList.add("busy");
}

// launcherRelease ends a hold and leaves the launcher on screen: a failed open
// should show the list again, not an empty workspace.
function launcherRelease() {
  launcherHold = false;
  launcherEl.classList.remove("busy");
}

async function staticCall(path, body = {}) {
  const res = await fetch(`${STATIC_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: yaml.dump(body),
  });
  if (!res.ok) throw new Error(`static${path}: HTTP ${res.status}`);
  return yaml.load(await res.text()) || {};
}

function titleOf(html) {
  return new DOMParser().parseFromString(html, "text/html").title.trim();
}

function firstLine(markdown) {
  return String(markdown || "").split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "").trim() || "";
}

async function blueprintEntries() {
  const data = await staticCall("/static/query", {});
  const slugs = [...new Set(
    (data.blueprints || [])
      .map((p) => String(p))
      .filter((p) => p.endsWith("/index.html"))
      .map((p) => p.split("/")[2])
      .filter(Boolean),
  )].sort();
  const out = [];
  for (const slug of slugs) {
    let name = slug;
    let desc = "";
    try {
      const index = await staticCall("/static/query-detail", {
        type: "blueprint",
        id: `.agents/blueprints/${slug}/index.html`,
      });
      name = titleOf(index.blueprint) || slug;
    } catch {}
    try {
      const readme = await staticCall("/static/query-detail", {
        type: "blueprint",
        id: `.agents/blueprints/${slug}/README.md`,
      });
      desc = firstLine(readme.blueprint);
    } catch {}
    // The README's first line is often just the name again; don't repeat it.
    out.push({ slug, name, desc: desc && desc !== name ? desc : "" });
  }
  return out;
}

// recentEntries is the tabs that exist, most recently active first — a tab with
// none of its panes on screen is still a thing you can bring back, and bringing it
// back is the same tab, not a copy of it. A conversation reaches the screen only
// through the tab that holds it, so there is nothing else to list here.
async function recentEntries() {
  const data = await logTabList(1);
  return (data.tabs || []).map((t) => ({
    tabId: t.tabId,
    title: t.title || "",
    panes: sessionsOf([{ layout: normalizeTree(t.layout) }]).length,
    lastAt: t.lastAt || t.updatedAt || "",
  }));
}

// A row opens on a single click — the list is a list of things to open, not one
// to browse and then confirm.
function launcherRow({ name, desc, onOpen }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "launcher-item";
  const n = document.createElement("span");
  n.className = "name";
  n.textContent = name;
  btn.appendChild(n);
  if (desc) {
    const d = document.createElement("span");
    d.className = "desc";
    d.textContent = desc;
    btn.appendChild(d);
  }
  btn.addEventListener("click", onOpen);
  return btn;
}

async function openLauncher() {
  if (launcherHold) return;
  launcherEl.hidden = false;
  launcherEl.innerHTML = `<div class="launcher-empty">…</div>`;
  const [blueprints, recents] = await Promise.all([
    blueprintEntries().catch(() => []),
    recentEntries().catch(() => []),
  ]);
  launcherEl.innerHTML = "";

  const bp = document.createElement("section");
  bp.className = "launcher-sec";
  const h = document.createElement("h3");
  h.textContent = `Blueprints · ${blueprints.length}`;
  bp.appendChild(h);
  if (!blueprints.length) {
    const empty = document.createElement("div");
    empty.className = "launcher-empty";
    empty.textContent = "no blueprints in this project";
    bp.appendChild(empty);
  }
  for (const b of blueprints) {
    bp.appendChild(
      launcherRow({
        name: b.name,
        desc: b.desc,
        onOpen: () => void openBlueprintFromLauncher(b),
      }),
    );
  }
  launcherEl.appendChild(bp);

  const recent = document.createElement("section");
  recent.className = "launcher-sec";
  const h2 = document.createElement("h3");
  h2.textContent = `Recent · ${recents.length}`;
  recent.appendChild(h2);
  if (!recents.length) {
    const empty = document.createElement("div");
    empty.className = "launcher-empty";
    empty.textContent = "nothing yet";
    recent.appendChild(empty);
  }
  for (const r of recents) {
    recent.appendChild(
      launcherRow({
        name: r.title || "(untitled)",
        desc: `${r.panes} pane(s) · ${r.lastAt}`,
        onOpen: () => void openRecentTab(r.tabId),
      }),
    );
  }
  launcherEl.appendChild(recent);
}

// openBlueprintFromLauncher makes a new agent from a blueprint and puts it in a
// tab of its own — the same two writes main's tab-new does, from the UI.
async function openBlueprintFromLauncher(b) {
  if (launcherHold) return;
  launcherHoldOn();
  try {
    const res = await fetch(`${AI_BASE}/ai/new`, {
      method: "POST",
      headers: { "Content-Type": "application/yaml" },
      body: yaml.dump({ blueprint: b.slug }),
    });
    const data = yaml.load(await res.text()) || {};
    if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
    const id = data.sessionId;
    const layout = { pane: { paneId: mintPaneId(), contentId: id } };
    await logTabNew({
      title: b.name || b.slug,
      layout,
      sessionIds: [id],
      open: true,
    });
    // refreshWorkspace puts the tab up; the page inside it loads a moment later.
    await refreshWorkspace();
    await waitForTabPaint(
      openTabs.find((t) => !t.main && primaryPane(t.layout)?.contentId === id),
    );
    launcherRelease();
    launcherClose();
  } catch (err) {
    launcherRelease();
    toast(`could not open: ${err.message}`);
  }
}

// openRecentTab brings an existing tab back. A closed tab is reopened, never
// re-created: a conversation belongs to the tab that made it, so a second copy of
// it is not something the workspace can represent.
async function openRecentTab(tabId) {
  if (launcherHold) return;
  launcherHoldOn();
  try {
    if (!openTabs.some((t) => t.tabId === tabId)) {
      await logTabOn([tabId]);
      await refreshWorkspace();
    }
    const tab = openTabs.find((t) => t.tabId === tabId);
    if (tab) {
      // refreshWorkspace already activated a tab it just added; one that was
      // open but in the background is brought up here.
      if (activeTabId !== tab.id) await activateTab(tab.id);
      await waitForTabPaint(tab);
    }
    launcherRelease();
    launcherClose();
  } catch (err) {
    launcherRelease();
    toast(`could not open: ${err.message}`);
  }
}

tabAddEl.addEventListener("click", (event) => {
  event.stopPropagation();
  void openLauncher();
});

window.addEventListener("mousedown", (event) => {
  if (launcherEl.hidden || launcherHold) return;
  if (launcherEl.contains(event.target) || event.target === tabAddEl) return;
  launcherClose();
});

// ---------- boot ----------
//
// Always main. A reload reads the workspace back from log and puts main on
// screen; it never restores "the tab you were on".

async function boot() {
  let cur;
  try {
    cur = await logCurrent();
  } catch (err) {
    panesEl.innerHTML = `<div class="empty-hint">cannot read the workspace: ${err.message}</div>`;
    return;
  }
  let mainSession = cur.mainSession || "";
  if (mainSession && !(await sessionExists(mainSession))) mainSession = "";
  if (!mainSession) {
    try {
      const res = await fetch(`${AI_BASE}/ai/new`, {
        method: "POST",
        headers: { "Content-Type": "application/yaml" },
        body: yaml.dump({ kind: "main" }),
      });
      const data = yaml.load(await res.text()) || {};
      if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
      mainSession = data.sessionId;
      await logCurrentPut(cur.openTabs ?? [], mainSession);
    } catch (err) {
      panesEl.innerHTML = `<div class="empty-hint">cannot start main: ${err.message}</div>`;
      return;
    }
  }
  mainTab = makeMainTab(mainSession);
  openTabs.push(mainTab);

  const kept = [];
  for (const tabId of cur.openTabs ?? []) {
    try {
      kept.push(tabFromRecord(await logTabDetail(tabId)));
    } catch {
      // A tab id whose record is gone: repair the list rather than show a ghost.
    }
  }
  if (kept.length !== (cur.openTabs ?? []).length) {
    await logCurrentPut(kept.map((t) => t.tabId), mainSession).catch(() => {});
  }
  openTabs.push(...kept);

  // Every conversation this workspace shows is resumed before anything is drawn:
  // a page must be able to be asked the moment it appears, and main's history is
  // read from the same live session.
  await Promise.all(
    [mainSession, ...sessionsOf(kept)].map((id) => aiResume(id).catch(() => false)),
  );

  renderTabs();
  await activateTab("main", null);
  installTitleWatchers();
  void hydrateTabNames();
}

window.addEventListener("popstate", () => {
  const m = location.pathname.match(/^\/tab\/([^/]+)$/);
  const tab = m ? openTabs.find((t) => t.tabId === decodeURIComponent(m[1])) : mainTab;
  if (tab) void activateTab(tab.id, null);
});

// ---------- theme (palette, see theme.css) ----------

// ---------- panes: what a tab shows ----------

let paneIdSeq = 0;

function mintPaneId() {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  paneIdSeq += 1;
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `p_${hex}${paneIdSeq.toString(16)}`;
}

// normalizeTree reads a stored tree into the shape the renderer wants, filling in
// what an older record does not have. A leaf written before paneId existed gets
// one here — identity only has to hold for as long as the pane lives, and a reload
// rebuilds every pane from the record anyway — and the names an older record used
// (content / id / split: "col" / weight / size: brief) are read as their current
// equivalents.
function normalizeTree(node) {
  if (!node || typeof node !== "object") return null;
  if (node.pane && typeof node.pane === "object") {
    const p = node.pane;
    // A leaf names one agent. Older records carry contentType ("chat" / "page")
    // and its content in `content` / `id`: read for what they meant, written
    // without them — there is only one kind of pane now.
    const leaf = {
      paneId: typeof p.paneId === "string" && p.paneId ? p.paneId : mintPaneId(),
      contentId: p.contentId ?? p.id ?? p.content ?? "",
    };
    if (p.flex) leaf.flex = String(p.flex);
    else if (p.size === "brief") leaf.flex = "0 0 132px";
    return { pane: leaf };
  }
  const raw = node.split;
  const dir = typeof raw === "string" ? raw : (raw && raw.flexDirection) || "row";
  const children = (node.children || (raw && raw.children) || [])
    .map(normalizeTree)
    .filter(Boolean);
  if (!children.length) return null;
  const split = {
    flexDirection: dir === "col" || dir === "column" ? "column" : "row",
    children,
  };
  const flex = (raw && raw.flex) || node.flex || (node.weight ? `${node.weight} 1 0` : "");
  if (flex) split.flex = String(flex);
  return { split };
}

// tabLayoutOf is the single-pane layout a tab gets when it is created: the agent
// it was opened for.
function tabLayoutOf(tab) {
  return { pane: { paneId: mintPaneId(), contentId: tab.sessionId } };
}

// tabLayout returns the tab's tree, minting the fallback for a tab whose record
// could not be read. Memoized: a fresh paneId on every call would look like a new
// pane on every render.
function tabLayout(tab) {
  if (tab.layout) return tab.layout;
  return (tab.localLayout ||= tabLayoutOf(tab));
}

function makePagePane(key, contentId) {
  const el = document.createElement("div");
  el.className = "pane pane-page";
  const frameEl = document.createElement("iframe");
  frameEl.className = "pane-frame";
  frameEl.title = contentId;
  // Listen before pointing it anywhere: a blueprint served from cache can load
  // before a listener attached afterwards would ever see it, and the theme is
  // only pushed on load (see pushPageTheme).
  frameEl.addEventListener("load", pushPageTheme);
  frameEl.src = agentFrameSrc(contentId);
  el.appendChild(frameEl);
  return { key, kind: "page", contentId, el, frameEl };
}

// ensurePane returns the pane for one leaf, reusing the live one when its place
// and its content are unchanged. The key is the pane's paneId, so a pane that
// moved is found again; the same key with different content is the same pane
// showing something else, and the old one is taken down first.
function ensurePane(tab, key, contentId) {
  const existing = tab.panes.get(key);
  if (existing && existing.contentId === contentId) return existing;
  if (existing) dropPane(tab, existing);
  // Every pane shows one agent, and an agent's UI is its blueprint: the pane is
  // an iframe onto that agent's own copy. Two panes on the same agent are two
  // iframes on one session — the agent keeps one context either way.
  const pane = makePagePane(key, contentId);
  tab.panes.set(key, pane);
  return pane;
}

// splitEl builds a split container. Its geometry is the flex value the tree gives
// it, in the same CSS shorthand a pane uses (see the layout tool).
function splitEl(dir, flex) {
  const el = document.createElement("div");
  el.className = `pane-split ${dir === "column" ? "column" : "row"}`;
  if (flex) el.style.flex = flex;
  return el;
}

// buildPaneNode builds one node, registering every leaf it keeps in `seen` — which
// is how renderPanes learns what the tree still holds.
function buildPaneNode(tab, node, seen) {
  if (node.pane) {
    const pane = ensurePane(tab, node.pane.paneId, node.pane.contentId);
    seen.add(pane.key);
    if (node.pane.flex) pane.el.style.flex = node.pane.flex;
    else pane.el.style.removeProperty("flex");
    return pane.el;
  }
  const el = splitEl(node.split.flexDirection, node.split.flex);
  for (const child of node.split.children) {
    const built = buildPaneNode(tab, child, seen);
    if (built) el.appendChild(built);
  }
  return el;
}

// renderPanes builds (or rebuilds) a tab's content area from its tree, and loads
// every chat pane that has nothing on screen yet. A chat pane without a session of
// its own was just created by a layout change, so it starts a fresh one.
//
// The tree is the only authority on what exists: a pane it no longer holds is
// taken down here, which is what keeps a pane the model dropped from carrying on
// in the background.
function renderPanes(tab) {
  const layout = normalizeTree(tabLayout(tab)) || tabLayoutOf(tab);
  tab.layout = layout;
  const seen = new Set();
  const tree = document.createElement("div");
  tree.className = "pane-tree";
  tree.appendChild(buildPaneNode(tab, layout, seen));
  for (const [key, pane] of [...tab.panes]) {
    if (!seen.has(key)) dropPane(tab, pane);
  }
  // The tree this one replaces goes whole: a tab keeps exactly one of them.
  tab.paneEl?.remove();
  tab.paneEl = tree;
  // A rebuild of a background tab must not become visible by accident.
  tree.hidden = tab.id !== activeTabId;
}

// dropPane takes one pane down. It leaves its conversation first: a pane that kept
// drawing into a detached element would look like the run had stalled, and would
// hold the subscription open for a view nobody has.
function dropPane(tab, pane) {
  if (tab.panes.get(pane.key) === pane) tab.panes.delete(pane.key);
  pane.el.remove();
}

// dropTabPanes takes every pane of a tab down. Called when the tab itself goes —
// closing it, or replacing its instance with a fresh one — so its panes are not
// left behind holding subscriptions to conversations nothing shows any more.
function dropTabPanes(tab) {
  for (const pane of [...(tab.panes?.values() ?? [])]) dropPane(tab, pane);
  // The tree itself goes with them: it sits in the document (hidden or not), and
  // a tab that is gone must not leave one behind.
  tab.paneEl?.remove();
  tab.paneEl = null;
}

// A pane has something on screen once its iframe has a page of its own loaded;
// before that it is a blank surface (its background, not a page).
function paneFramePainted(frameEl) {
  const doc = frameEl.contentDocument;
  if (!doc) return false;
  return doc.readyState === "complete" && !/^about:/.test(doc.URL);
}

// waitForTabPaint resolves when the tab's first pane shows its page, or after
// `ms` — a page that never loads must not keep the launcher up for good.
function waitForTabPaint(tab, ms = 4000) {
  const first = tab && primaryPane(tab.layout);
  const pane = first && [...tab.panes.values()].find((p) => p.contentId === first.contentId);
  const frameEl = pane?.frameEl;
  if (!frameEl || paneFramePainted(frameEl)) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      frameEl.removeEventListener("load", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    frameEl.addEventListener("load", done);
  });
}

function showPanes(tab) {
  if (!tab.paneEl) renderPanes(tab);
  if (tab.paneEl.parentNode !== panesEl) panesEl.appendChild(tab.paneEl);
  for (const t of openTabs) {
    if (!t.paneEl) continue;
    t.paneEl.hidden = t.id !== tab.id;
  }
}

function paneKeyOf(tab, contentId) {
  for (const [key, p] of tab.panes) {
    if (p.contentId === contentId) return key;
  }
  return "";
}

// A short, visible message at the bottom of the workspace.
let toastTimer = 0;
function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

void boot();

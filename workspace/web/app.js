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
const LOG_BASE = RUNTIME.log;       // log: records, sessions, current

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
    const doc = tab.frameEl?.contentDocument;
    if (!doc) continue;
    doc.documentElement.setAttribute("data-theme", theme);
    // Native widgets and the scrollbar follow color-scheme, not our variables.
    doc.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light";
  }
}

// ---------- the workspace ----------
//
// The shell is main's conversation plus the tabs main opens. Both are state in
// log, not in this browser: `current` says which sessions are open and which
// session is main, `sessions` names them. There is no tab table — a tab is one
// open session, so an id in the open list is the whole of a tab.
//
// There is no way for the user to open or close a tab here either: main's tools
// do that, and a tool frame makes the shell re-read the workspace below.
const openTabs = []; // main first, then the open sessions in display order
let activeTabId = null; // "main" or a session id
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
const logCurrentPut = (openSessions, mainSession) =>
  logCall("/log/current/put", { openSessions, mainSession });
const logSessionOn = (sessionIds, index) =>
  logCall("/log/session/on", typeof index === "number" ? { sessionIds, index } : { sessionIds });
const logSessionOff = (sessionId) => logCall("/log/session/off", { sessionIds: [sessionId] });
const logSessionList = (pageNum = 1) => logCall("/log/list", { pageNum });
const logSessionMeta = (sessionId) => logCall("/log/session/detail", { sessionId });

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
    await logSessionMeta(id);
    return true;
  } catch {
    return false;
  }
}

function agentFrameSrc(sessionId) {
  return `/agent/${encodeURIComponent(sessionId)}/`;
}

// tabFromSession rebuilds a tab's shell object from the session list. The view is
// built lazily (showTab → viewOf), so a tab that is never shown costs nothing.
function tabFromSession(rec) {
  return {
    id: rec.sessionId,
    sessionId: rec.sessionId,
    kind: rec.kind || "sub",
    // The name is stored with the session, so a reload draws the tab bar without
    // loading a single page. hydrateNames fills in rows that predate the field.
    name: rec.title || "",
    blueprint: rec.blueprint || "",
    el: null,
    frameEl: null,
    main: false,
  };
}

// makeMainTab builds main: the shell's own conversation, always there and never
// in the open list.
function makeMainTab(sessionId) {
  const tab = {
    id: "main",
    sessionId,
    kind: "main",
    name: "main",
    blueprint: "",
    el: null,
    frameEl: null,
    main: true,
  };
  // main is the shell's own conversation: one <engineer-chat>, the same element
  // a blueprint page mounts. It shows its history (its records are in log).
  const chat = document.createElement("engineer-chat");
  chat.setAttribute("session", sessionId);
  chat.setAttribute("history", "");
  chat.className = "view view-main";
  // main's tools change the workspace; the element only reports them.
  chat.addEventListener("engineer-tool", (event) => {
    const d = event.detail || {};
    // main-new replaces this very conversation: the refresh below is what makes
    // the shell follow log's pointer to the new session.
    if (!d.isError && /^(session-|main-)/.test(String(d.name ?? ""))) {
      void refreshWorkspace();
    }
  });
  tab.el = chat;
  return tab;
}

// viewOf builds the one element a tab shows: main's chat, or the agent's own page
// in an iframe (its blueprint's index.html, served at /agent/<sessionId>/).
function viewOf(tab) {
  if (tab.el) return tab.el;
  if (tab.main) return null; // built by makeMainTab
  const frame = document.createElement("iframe");
  frame.className = "view view-page";
  frame.title = tab.sessionId;
  // Listen before pointing it anywhere: a blueprint served from cache can load
  // before a listener attached afterwards would ever see it, and the theme is
  // only pushed on load.
  frame.addEventListener("load", () => {
    pushPageTheme();
    const title = frame.contentDocument?.title;
    if (title && !tab.name) {
      tab.name = title;
      renderTabs();
    }
  });
  frame.src = agentFrameSrc(tab.sessionId);
  tab.frameEl = frame;
  tab.el = frame;
  return frame;
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
      close.title = "close this tab (the conversation is kept)";
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
// address, not a restore point. A tab's address is its session's.
function syncTabUrl(tab, mode) {
  if (!mode) return;
  const path = tab.main ? "/" : `/s/${encodeURIComponent(tab.sessionId)}`;
  if (location.pathname === path) return;
  if (mode === "push") history.pushState({ tab: tab.id }, "", path);
  else history.replaceState({ tab: tab.id }, "", path);
}

async function activateTab(id, mode = "push") {
  const tab = openTabs.find((t) => t.id === id);
  if (!tab) return;
  launcherClose();
  activeTabId = tab.id;
  showTab(tab);
  if (tab.main) tab.el?.focus?.();
  syncTabActive();
  syncTabUrl(tab, mode);
}

// closeWorkspaceTab closes a tab: log takes the session out of the open list and
// everything the conversation holds stays (main's session-delete is what removes
// things for good).
async function closeWorkspaceTab(tab) {
  if (tab.main) return;
  try {
    await logSessionOff(tab.sessionId);
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
  tab.el?.parentNode?.removeChild(tab.el);
  tab.el = null;
  tab.frameEl = null;
  renderTabs();
}

// ---------- the workspace, re-read after main's tools change it ----------

// One refresh at a time: a run can finish several session-* tools in a row, and
// each frame asks for the same picture. Two overlapping passes would both see a
// tab as missing and both add it — the tab bar then shows the workspace N times.
let refreshChain = Promise.resolve();

function refreshWorkspace() {
  const run = refreshChain.then(doRefreshWorkspace, doRefreshWorkspace);
  refreshChain = run.catch(() => {});
  return run;
}

// sessionsById reads the session list once: it is where a tab's name and page
// come from, and the open list itself only carries ids.
async function sessionsById() {
  const data = await logSessionList(1);
  const byId = new Map();
  for (const rec of data.sessions || []) byId.set(String(rec.sessionId), rec);
  return byId;
}

async function doRefreshWorkspace() {
  let cur;
  try {
    cur = await logCurrent();
  } catch (err) {
    toast(`could not read the workspace: ${err.message}`);
    return;
  }
  let byId;
  try {
    byId = await sessionsById();
  } catch {
    // A list that cannot be read says nothing about which ids exist: keep every
    // tab as it is rather than "repairing" the worker space into an empty one.
    byId = null;
  }
  const want = cur.openSessions ?? [];
  // A tab the workspace no longer holds goes off screen (a session-delete closes
  // it too, but session-off or another window can drop it as well).
  for (const tab of [...openTabs]) {
    if (tab.main) continue;
    if (!want.includes(tab.sessionId)) removeTab(tab);
  }
  // A tab the workspace gained: build it, resume it, put it up. `opened` is what
  // session-open means — the new tab is the thing to look at.
  let opened = null;
  const repaired = [];
  for (const sessionId of want) {
    if (openTabs.some((t) => t.sessionId === sessionId)) continue;
    if (!byId) continue; // no list, no new tabs: they are drawn once it reads
    const rec = byId.get(sessionId);
    if (!rec) {
      repaired.push(sessionId); // a stale id in the list: drop it below
      continue;
    }
    // Re-check after the await: a refresh that ran while this one was waiting may
    // have added it already.
    if (openTabs.some((t) => t.sessionId === sessionId)) continue;
    const tab = tabFromSession(rec);
    openTabs.push(tab);
    opened = tab;
    await aiResume(sessionId);
  }
  // A name that arrived after the tab was drawn (a row with no title, or a page
  // that names itself late).
  for (const tab of openTabs) {
    if (tab.main) continue;
    const rec = byId?.get(tab.sessionId);
    if (rec?.title && rec.title !== tab.name) {
      tab.name = rec.title;
    }
  }
  if (byId && (repaired.length || want.some((id) => !byId.has(id)))) {
    const kept = want.filter((id) => byId.has(id));
    await logCurrentPut(kept, cur.mainSession).catch(() => {});
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
  if (opened) await activateTab(opened.id);
  const active = openTabs.find((t) => t.id === activeTabId);
  if (active) showTab(active);
  else await activateTab("main", "replace");
}

// A tab's name is stored with its session, so this only runs for a row written
// before titles existed. The open list is small; one fetch per unnamed tab is
// cheaper than making every reload guess.
async function hydrateNames() {
  let changed = false;
  for (const tab of openTabs) {
    if (tab.main || tab.name) continue;
    const title = await fetchTabName(tab.sessionId);
    if (title) {
      tab.name = title;
      changed = true;
    }
  }
  if (changed) renderTabs();
}

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

// ---------- the launcher (the +) ----------
//
// A popover, not a view: blueprints (static) and recent sessions (log). Picking a
// blueprint makes a new agent in a new tab; picking a recent session puts that
// session back on screen. main is not a tab, so it is not listed.

const tabAddEl = document.getElementById("tab-add");
const launcherEl = document.getElementById("launcher");

// Opening a row takes several round trips (make the agent, open the session,
// resume it, load its page), and until the last one the workspace under the
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

// recentEntries is every session there is, most recently active first — a session
// whose tab is closed is still a thing you can bring back, and bringing it back is
// the same conversation, not a copy of it.
async function recentEntries() {
  const data = await logSessionList(1);
  return (data.sessions || [])
    .filter((s) => s.kind !== "main")
    .map((s) => ({
      sessionId: String(s.sessionId ?? ""),
      title: String(s.title || ""),
      desc: [s.blueprint || "", s.lastAt || ""].filter(Boolean).join(" · "),
      lastAt: String(s.lastAt || ""),
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
        name: r.title || r.sessionId,
        desc: r.desc,
        onOpen: () => void openSessionFromLauncher(r.sessionId),
      }),
    );
  }
  launcherEl.appendChild(recent);
}

// openBlueprintFromLauncher makes a new agent from a blueprint and puts it on
// screen as a tab of its own — the same two writes main's session-new does, from
// the UI. `ai/new` has already written the session row (kind, blueprint, title).
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
    const sessionId = data.sessionId;
    await logSessionOn([sessionId]);
    // refreshWorkspace puts the tab up; the page inside it loads a moment later.
    await refreshWorkspace();
    await waitForTabPaint(openTabs.find((t) => t.sessionId === sessionId));
    launcherRelease();
    launcherClose();
  } catch (err) {
    launcherRelease();
    toast(`could not open: ${err.message}`);
  }
}

// openSessionFromLauncher brings an existing session back. A closed tab is
// reopened, never re-created: a tab is the session, so a second copy of it is not
// something the workspace can represent.
async function openSessionFromLauncher(sessionId) {
  if (launcherHold) return;
  launcherHoldOn();
  try {
    if (!openTabs.some((t) => t.sessionId === sessionId)) {
      await logSessionOn([sessionId]);
      await refreshWorkspace();
    }
    const tab = openTabs.find((t) => t.sessionId === sessionId);
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
      await logCurrentPut(cur.openSessions ?? [], mainSession);
    } catch (err) {
      panesEl.innerHTML = `<div class="empty-hint">cannot start main: ${err.message}</div>`;
      return;
    }
  }
  mainTab = makeMainTab(mainSession);
  openTabs.push(mainTab);

  let byId = null;
  try {
    byId = await sessionsById();
  } catch {
    // a list that cannot be read still leaves main usable, and must not make the
    // open list look empty
  }
  const kept = [];
  for (const sessionId of cur.openSessions ?? []) {
    if (byId && !byId.has(sessionId)) continue; // row gone: repair, don't show a ghost
    kept.push(tabFromSession(byId?.get(sessionId) ?? { sessionId }));
  }
  if (byId && kept.length !== (cur.openSessions ?? []).length) {
    await logCurrentPut(kept.map((t) => t.sessionId), mainSession).catch(() => {});
  }
  openTabs.push(...kept);

  // Every conversation this workspace shows is resumed before anything is drawn:
  // a page must be able to be asked the moment it appears, and main's history is
  // read from the same live session.
  await Promise.all(
    [mainSession, ...kept.map((t) => t.sessionId)].map((id) => aiResume(id).catch(() => false)),
  );

  renderTabs();
  await activateTab("main", null);
  void hydrateNames();
}

window.addEventListener("popstate", () => {
  const m = location.pathname.match(/^\/s\/([^/]+)$/);
  const tab = m
    ? openTabs.find((t) => t.sessionId === decodeURIComponent(m[1]))
    : mainTab;
  if (tab) void activateTab(tab.id, null);
});

// ---------- the stage: what a tab shows ----------

// showTab puts one tab's view on stage and hides the others. Every open tab keeps
// its element (a chat, or a page that has already loaded), so switching back is
// instant and nothing reloads.
function showTab(tab) {
  const el = viewOf(tab);
  if (!el) return;
  if (el.parentNode !== panesEl) panesEl.appendChild(el);
  for (const t of openTabs) {
    if (!t.el) continue;
    t.el.hidden = t.id !== tab.id;
  }
}

// A page has something on screen once its iframe has a page of its own loaded;
// before that it is a blank surface (its background, not a page).
function framePainted(frameEl) {
  const doc = frameEl?.contentDocument;
  if (!doc) return false;
  return doc.readyState === "complete" && !/^about:/.test(doc.URL);
}

// waitForTabPaint resolves when the tab's page shows, or after `ms` — a page that
// never loads must not keep the launcher up for good.
function waitForTabPaint(tab, ms = 4000) {
  const frameEl = tab?.frameEl;
  if (!frameEl || framePainted(frameEl)) return Promise.resolve();
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

function dropMainTab() {
  if (!mainTab) return;
  mainTab.el?.parentNode?.removeChild(mainTab.el);
  mainTab.el = null;
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

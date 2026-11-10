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


const THEME_ORDER = ["light", "warm", "cold", "dark", "slate"];
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
    doc.documentElement.style.colorScheme = (theme === "dark" || theme === "slate") ? "dark" : "light";
  }
}

// The topbar's theme menu: a quiet button that opens five choices. The block
// below is the only thing that binds it — without it the markup in index.html is
// inert (the button renders and does nothing).
function syncThemeMenu() {
  const cur = currentTheme();
  for (const btn of themeMenuEl.querySelectorAll("button[data-theme]")) {
    const selected = btn.dataset.theme === cur;
    btn.classList.toggle("active", selected);
    btn.setAttribute("aria-pressed", String(selected));
  }
}

function themeMenuHide() {
  themeMenuEl.hidden = true;
  themeToggleEl.classList.remove("active");
}

themeToggleEl.title = `theme: ${currentTheme()}`;
themeToggleEl.addEventListener("click", (event) => {
  event.stopPropagation();
  if (themeMenuEl.hidden) {
    syncThemeMenu();
    themeMenuEl.hidden = false;
    themeToggleEl.classList.add("active");
  } else {
    themeMenuHide();
  }
});

themeMenuEl.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-theme]");
  if (!btn) return;
  applyTheme(btn.dataset.theme);
  themeMenuHide();
});

window.addEventListener("click", (event) => {
  if (themeMenuEl.hidden) return;
  if (!themeMenuEl.contains(event.target) && event.target !== themeToggleEl) {
    themeMenuHide();
  }
});

// Esc closes the menu, and stops there: the conversation under it keeps its own
// Esc (chat.js binds it per pane).
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || themeMenuEl.hidden) return;
  event.stopPropagation();
  themeMenuHide();
});

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
let activeTabId = null; // "main", a session id, or "launcher:<projectId>"
let mainTab = null;
// The project board, exactly as log remembers it: the titlebar's groups, and what
// the Engineer launcher lists. Filled by loadProjects.
let projectList = [];

// loadProjects re-reads the board. It is the only place projectList changes.
async function loadProjects() {
  const data = await logCall("/log/project/list");
  projectList = (data.projects || []).map((p) => ({
    projectId: String(p.projectId ?? ""),
    name: String(p.name || ""),
    path: String(p.path || ""),
    visible: p.visible !== false,
  }));
  return projectList;
}

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

// blueprintFrameSrc is the same page with no session behind it: the project and the
// slug are in the URL, because there is no session row to resolve them through.
function blueprintFrameSrc(projectId, slug) {
  return `/agent/p/${encodeURIComponent(projectId)}/${encodeURIComponent(slug)}/`;
}

// tabFromSession rebuilds a tab's shell object from the session list. The view is
// built lazily (showTab → viewOf), so a tab that is never shown costs nothing.
function tabFromSession(rec) {
  return {
    id: rec.sessionId,
    sessionId: rec.sessionId,
    kind: rec.kind || "sub",
    // The project this session belongs to: what its page resolves through, and
    // which project's tabs go away when the project leaves the board.
    projectId: rec.projectId || "",
    // The name is stored with the session, so a reload draws the tab bar without
    // loading a single page. hydrateNames fills in rows that predate the field.
    name: rec.title || "",
    blueprint: rec.blueprint || "",
    el: null,
    frameEl: null,
    main: false,
  };
}

// makeChatView is one inline conversation: the shell's own <engineer-chat>, bound
// to a session. main is this view; so is a project's own chat, which has no
// blueprint page to load.
function makeChatView(tab) {
  const chat = document.createElement("engineer-chat");
  chat.setAttribute("session", tab.sessionId);
  chat.className = "view view-main";
  // A conversation with no page has nothing to name it: the first turn's summary
  // arrives as this event — the same one an iframe page forwards — and it is the
  // tab bar's name to change, not the pane's.
  if (!tab.main) {
    chat.addEventListener("engineer-title", (event) => {
      const title = String(event.detail?.title ?? "").trim();
      if (!title || title === tab.name) return;
      tab.name = title;
      renderTabs();
    });
  }
  return chat;
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
  // a blueprint page mounts. Every element replays its records from log on mount,
  // so a rebuilt main tab shows the conversation again.
  const chat = makeChatView(tab);
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

// viewOf builds the one element a tab shows: main's chat, a blueprint's page in an
// iframe, or — for a draft tab — the project's home page.
function viewOf(tab) {
  if (tab.el) return tab.el;
  if (tab.main) return null; // built by makeMainTab
  // A draft that is still on its project's home: the blueprints, the recents, and
  // an empty conversation. Nothing exists yet; the home is the tab's content.
  if (tab.kind === "new" && !tab.blueprint) {
    tab.el = buildProjectHomeView(tab);
    return tab.el;
  }
  // A conversation with no blueprint has no page to put in a frame: this is the
  // project's own chat (its home page created it), so the shell's element is the
  // whole view — exactly what main is.
  if (!tab.blueprint) {
    tab.el = makeChatView(tab);
    return tab.el;
  }
  // The same page either way; only the address differs, and it says whether a
  // conversation exists yet (see agentFrameSrc / blueprintFrameSrc).
  tab.el = makePageFrame(tab, tab.kind === "new" && !tab.sessionId
    ? blueprintFrameSrc(tab.projectId, tab.blueprint)
    : agentFrameSrc(tab.sessionId));
  return tab.el;
}

// makePageFrame is a blueprint's page in an iframe. The frame is same-origin, so
// what the page says reaches the shell as events on its document: the name its
// conversation took, and the session its first message created.
function makePageFrame(tab, src) {
  const frame = document.createElement("iframe");
  frame.className = "view view-page";
  frame.title = tab.sessionId || `${tab.projectId}/${tab.blueprint}`;
  // Listen before pointing it anywhere: a blueprint served from cache can load
  // before a listener attached afterwards would ever see it, and the theme is
  // only pushed on load.
  frame.addEventListener("load", () => {
    pushPageTheme();
    const doc = frame.contentDocument;
    const title = doc?.title;
    if (title && !tab.name) {
      tab.name = title;
      renderTabs();
    }
    // The page tells us when ai renames its conversation (the first turn):
    // <engineer-chat> forwards the `session_title` event on its own
    // document, and the frame is same-origin, so this is the whole channel. It
    // is a push, not a poll — the name lands in the same second it is made.
    doc?.addEventListener("engineer-title", (event) => {
      const renamed = String(event.detail?.title ?? "").trim();
      if (!renamed || renamed === tab.name) return;
      tab.name = renamed;
      renderTabs();
    });
    // A page browsed before any conversation existed: this is the message that
    // makes the tab a session. The page keeps running where it is; only the tab
    // changes what it is.
    doc?.addEventListener("engineer-session", (event) => {
      void adoptSession(tab, String(event.detail?.sessionId ?? ""));
    });
  });
  frame.src = src;
  tab.frameEl = frame;
  return frame;
}

// ---------- the tab bar: main, then one group per project ----------
//
// The titlebar is grouped the way Chrome groups tabs — by project, not by the
// user's choice: every project on the board has one chip, the chip expands to
// that project's open session tabs, and the group stays after its last tab is
// closed (a group is the project, not its tabs). main is global and sits outside
// every group.
//
// A launcher tab is a tab of a group that is not a session: it shows that
// project's launcher page (blueprints + recents). Its id is `launcher:<projectId>`,
// it exists only in this browser — the page has no conversation to keep — and the
// route puts it back after a reload.
//
// Expansion is this window's state, not stored: a chip click expands or collapses a
// group, and a group that has open tabs starts expanded — so a reload comes back to
// the tabs you had, and a project with nothing open is just its chip. Opening or
// activating one of its tabs expands the group; hiding it forgets both, so showing
// it again derives the state from its tabs.

// Icons are inline SVG, drawn with the text colour: a project is a `+` (its launcher
// is opened — in the tab bar and on its row in the Engineer launcher alike), the eye is
// a plain outline eye (and a crossed one when the group is hidden). No font, no CDN,
// no emoji.
const ICON_LAUNCHER = `
<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor"
     stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M8 3.2v9.6" />
  <path d="M3.2 8h9.6" />
</svg>`;
const ICON_EYE = `
<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
     stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M1.4 8S3.9 4.1 8 4.1 14.6 8 14.6 8 12.1 11.9 8 11.9 1.4 8 1.4 8Z" />
  <circle cx="8" cy="8" r="1.9" />
</svg>`;
const ICON_EYE_OFF = `
<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
     stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M1.4 8S3.9 4.1 8 4.1 14.6 8 14.6 8 12.1 11.9 8 11.9 1.4 8 1.4 8Z" />
  <circle cx="8" cy="8" r="1.9" />
  <path d="M2.6 2.6 13.4 13.4" />
</svg>`;

const expandedGroups = new Set(); // explicitly expanded by the user
const collapsedGroups = new Set(); // explicitly collapsed by the user

function groupHasTabs(projectId) {
  return openTabs.some((t) => !t.main && t.projectId === projectId);
}

function groupExpanded(projectId) {
  if (collapsedGroups.has(projectId)) return false;
  if (expandedGroups.has(projectId)) return true;
  return groupHasTabs(projectId);
}

function expandGroup(projectId) {
  if (!projectId) return;
  collapsedGroups.delete(projectId);
  expandedGroups.add(projectId);
}

function projectOf(tab) {
  return tab.projectId ? projectList.find((p) => p.projectId === tab.projectId) : undefined;
}

// A **draft** tab is a tab that is not a session (yet): what the `+` in a group
// makes, the way a browser's `+` makes an empty tab. It has no row in log — there
// is no conversation to keep, nothing to resume and nothing to name — and it lives
// only in this window. The first message sent from it creates the session
// (`POST /ai/new`, from inside the page) and the tab becomes that session's tab
// (see adoptSession): from then on it is an ordinary session tab, in log and on
// screen. Reloading the window does not bring drafts back, because nothing was
// written down to bring back.
let draftSeq = 0;

function draftTab(projectId, blueprint = "") {
  return {
    id: `new:${++draftSeq}`,
    kind: "new",
    projectId,
    blueprint,
    sessionId: "",
    name: blueprint || "new tab",
    el: null,
    frameEl: null,
    main: false,
  };
}

// openNewTab is the `+` of a group: a fresh draft tab, on the project's home (or,
// when a slug is given, on that blueprint's page). A hidden group is shown first —
// a group that is not drawn cannot be worked in.
async function openNewTab(projectId, mode = "push", blueprint = "") {
  const project = projectList.find((p) => p.projectId === projectId);
  if (!project) throw new Error(`project ${projectId} is not on the board`);
  if (project.visible === false) await setProjectVisible(project, true);
  expandGroup(projectId);
  const tab = draftTab(projectId, blueprint);
  openTabs.push(tab);
  await activateTab(tab.id, mode);
  return tab;
}

// adoptSession is where a draft stops being a draft. The page made the session (it
// is the page's own conversation, so it keeps running where it is); the tab only
// learns what it now is — an id that log knows, and therefore a place in the open
// list, which is what makes the conversation survive a reload.
async function adoptSession(tab, sessionId) {
  if (!tab || !sessionId || tab.kind !== "new") return;
  const wasActive = activeTabId === tab.id;
  tab.kind = "sub";
  tab.sessionId = sessionId;
  tab.id = sessionId;
  if (tab.name === "new tab") tab.name = tab.blueprint || "…";
  if (wasActive) activeTabId = sessionId;
  try {
    await logSessionOn([sessionId]);
  } catch {
    // The conversation exists either way; the open list is repaired on refresh.
  }
  renderTabs();
  if (wasActive) syncTabUrl(tab, "replace");
}

// tabButton is one tab in the bar: a label, and a close that takes the tab off
// screen without losing anything behind it.
function tabButton(tab) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tab" + (tab.main ? " main" : "") + (tab.kind === "new" ? " draft" : "");
  btn.dataset.tabId = tab.id;
  // A tab is only narrower on the right when it carries a ×: the close button has
  // its own padding, so the label must not be pushed away from it. Without it
  // (main) both sides are the same, and so is the underline.
  const label = document.createElement("span");
  label.className = "tab-label";
  if (tab.main) label.textContent = "main";
  else label.textContent = tab.name || "…";
  btn.appendChild(label);
  // Every tab of a group has a × — a draft included: it holds nothing in log, so
  // closing it loses nothing but itself.
  if (!tab.main) {
    btn.classList.add("closable");
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
  return btn;
}

// newTabEntry is the `+` at the end of a group — a button, not a tab: clicking it
// makes a tab (see openNewTab) and the button stays where it is, the way a
// browser's `+` behaves.
function newTabEntry(project) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tab launcher launcher-entry";
  btn.dataset.newTabFor = project.projectId;
  btn.innerHTML = ICON_LAUNCHER;
  const what = project.name || project.path || "this project";
  btn.title = `new tab in ${what}`;
  btn.setAttribute("aria-label", "open a new tab in this project");
  btn.addEventListener("click", () => void openNewTab(project.projectId).catch((err) => toast(String(err.message || err))));
  return btn;
}

function renderTabs() {
  tabsEl.innerHTML = "";
  if (mainTab) tabsEl.appendChild(tabButton(mainTab));
  for (const project of projectList) {
    // Hidden is not closed: the group is not drawn, and every tab it had is still
    // open in log — showing it again draws the same ones.
    if (project.visible === false) continue;
    const expanded = groupExpanded(project.projectId);
    const group = document.createElement("div");
    group.className = "tab-group" + (expanded ? " expanded" : "");
    group.dataset.projectId = project.projectId;

    const chip = document.createElement("div");
    chip.className = "group-chip";
    // The chip is the group's name and nothing else: it expands and collapses the
    // group. The project launcher is not part of it — it is the last tab in the
    // group (see launcherEntry), the way a browser puts "+" at the end of the tabs.
    const name = document.createElement("button");
    name.type = "button";
    name.className = "group-label";
    name.textContent = project.name || project.path || project.projectId;
    name.title = `${project.name || project.path} — click to ${expanded ? "collapse" : "expand"} its tabs`;
    name.setAttribute("aria-expanded", String(expanded));
    name.addEventListener("click", () => {
      const pid = project.projectId;
      if (groupExpanded(pid)) {
        expandedGroups.delete(pid);
        collapsedGroups.add(pid);
      } else {
        expandGroup(pid);
      }
      renderTabs();
    });
    chip.appendChild(name);
    group.appendChild(chip);

    if (expanded) {
      // The project's tabs (sessions and drafts alike), then its `+` — last, the
      // way a browser puts the new-tab button after the tabs it opens.
      const tabs = openTabs.filter((t) => !t.main && t.projectId === project.projectId);
      for (const tab of tabs) group.appendChild(tabButton(tab));
      group.appendChild(newTabEntry(project));
    }
    tabsEl.appendChild(group);
  }
  syncTabActive();
}

function syncTabActive() {
  tabAddEl.classList.toggle("active", !launcherEl.hidden);
  tabAddEl.setAttribute("aria-expanded", String(!launcherEl.hidden));
  for (const btn of tabsEl.querySelectorAll(".tab")) {
    btn.classList.toggle("active", launcherEl.hidden && btn.dataset.tabId === activeTabId);
  }
}

// tabPath is the URL of the page a tab shows: the reload and history restore
// point. main, a session, or a project's launcher.
function tabPath(tab) {
  if (tab.main) return "/";
  if (!tab.sessionId) {
    // A draft is a page of its project: the home, or the blueprint it is browsing.
    const pid = encodeURIComponent(tab.projectId);
    return tab.blueprint
      ? `/project/${pid}/blueprint/${encodeURIComponent(tab.blueprint)}`
      : `/project/${pid}/new`;
  }
  return `/session/${encodeURIComponent(tab.sessionId)}`;
}

function syncTabUrl(tab, mode) {
  if (!mode) return;
  const path = tabPath(tab);
  if (location.pathname === path) return;
  if (mode === "push") history.pushState({ tab: tab.id }, "", path);
  else history.replaceState({ tab: tab.id }, "", path);
}

async function activateTab(id, mode = "push") {
  const tab = openTabs.find((t) => t.id === id);
  if (!tab) return;
  // A tab you are looking at must be visible: activating one of a hidden group
  // shows the group (the eye is a view toggle, not a close).
  const project = projectOf(tab);
  if (project && project.visible === false) await setProjectVisible(project, true);
  expandGroup(tab.projectId);
  launcherClose();
  // A draft's home is a live list (blueprints + that project's recents), not a
  // document: its lists are re-read each time it comes back on stage, so a session
  // created while it was in the background shows up in Recent. The conversation
  // below them is kept — coming back to it must not throw away a draft.
  if (!tab.sessionId && tab.el?.homeListsEl) {
    void fillHomeLists(tab.el.homeListsEl, tab.projectId);
  }
  activeTabId = tab.id;
  showTab(tab);
  if (tab.main) tab.el?.focus?.();
  renderTabs();
  syncTabUrl(tab, mode);
}

// closeWorkspaceTab closes a tab: log takes the session out of the open list and
// everything the conversation holds stays (main's session-delete is what removes
// things for good). A launcher tab has nothing in log to close; its group stays.
async function closeWorkspaceTab(tab) {
  if (tab.main) return;
  if (tab.sessionId) {
    try {
      await logSessionOff(tab.sessionId);
    } catch {
      // Even if log says no, take it off screen; the next refresh will reconcile.
    }
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

// A name can change without the shell being told. The conversation's own rename
// is pushed (see the frame's `engineer-title` listener in viewOf); what is left
// for this tick is the case that has no push — an agent that edits its own page's
// <title> — so it is slow, read-only, and only runs while there is a tab whose
// name can change (main's is fixed).
const NAME_TICK_MS = 60000;
let nameTick = 0;
function startNameTick() {
  if (nameTick) return;
  nameTick = setInterval(() => {
    const watches = openTabs.some((t) => !t.main && t.sessionId);
    if (!watches) return;
    void sessionsById()
      .then((byId) => {
        let changed = false;
        for (const tab of openTabs) {
          if (tab.main || !tab.sessionId) continue;
          const rec = byId.get(tab.sessionId);
          if (rec?.title && rec.title !== tab.name) {
            tab.name = rec.title;
            changed = true;
          }
        }
        if (changed) renderTabs();
      })
      .catch(() => {}); // a list that cannot be read changes nothing
  }, NAME_TICK_MS);
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
  // The board first: every group in the titlebar comes from it, so a tab cannot
  // be drawn before the projects are known.
  let projectsKnown = true;
  try {
    await loadProjects();
  } catch {
    projectsKnown = false; // keep the board we had rather than emptying the bar
  }
  const onBoard = new Set(projectList.map((p) => p.projectId));
  const want = cur.openSessions ?? [];
  // A tab the workspace no longer holds goes off screen (a session-delete closes
  // it too, but session-off or another window can drop it as well). A launcher tab
  // goes with its project: a project off the board has no group to live in.
  for (const tab of [...openTabs]) {
    if (tab.main) continue;
    // A draft has no session to look for in the open list: it stays until its
    // project leaves the board, or the user closes it.
    if (!tab.sessionId) {
      if (projectsKnown && !onBoard.has(tab.projectId)) removeTab(tab);
      continue;
    }
    // A session whose project is not on the board has no group to be drawn in;
    // taking it off screen is the only honest thing left (it keeps its records).
    if (projectsKnown && tab.projectId && !onBoard.has(tab.projectId)) {
      removeTab(tab);
      continue;
    }
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
  if (byId && projectsKnown && (repaired.length || want.some((id) => !byId.has(id)))) {
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
  let active = openTabs.find((t) => t.id === activeTabId);
  // The active tab's group was hidden (the eye, here or in another window): the
  // tab is still open, it is just not drawn — so the screen goes back to main
  // instead of showing a page the bar does not account for.
  const activeProject = active && active.projectId ? projectList.find((p) => p.projectId === active.projectId) : undefined;
  if (active && !active.main && activeProject && activeProject.visible === false) {
    await activateTab("main", "replace");
    return;
  }
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

// ---------- the launcher: two pages ----------
//
// `+` opens the Engineer launcher: the board of projects, where a folder is
// added or taken off. A project opens its own launcher: that project's
// blueprints (static) and its recent conversations (log). Neither page is a tab
// — both are routes, so a reload comes back to the same page.
//
// The program is not tied to a folder any more: a project is a folder the user
// added here, remembered in the program's own home database, and the page is the
// only place the board changes.

const tabAddEl = document.getElementById("tab-add");
const launcherEl = document.getElementById("launcher");

// Opening a row takes several round trips (make the agent, open the session,
// resume it, load its page), and until the last one the workspace under the
// launcher still shows the tab that was active — main. So the launcher is not the
// thing that reveals what a row opened: `launcherHold` keeps it up (and takes no
// clicks, so one click cannot start two agents) until the new page has painted,
// and only then is it closed. Releasing the hold is what lets it close at all.
let launcherHold = false;

function launcherClose(mode = null) {
  if (launcherHold) return;
  launcherEl.hidden = true;
  syncTabActive();
  const tab = openTabs.find((t) => t.id === activeTabId);
  if (mode && tab) syncTabUrl(tab, mode);
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

// A launcher page is a route. Writing it here (rather than in the caller) keeps
// every launcher entry point — +, a project row, the back link, a reload — on the
// same URL.
function launcherRoute(path, state, mode) {
  if (location.pathname === path) return;
  // The overlay page is a route too: while it is up the address must say so, even
  // when it was reached without a navigation (a redraw after adding a project, or
  // a redraw after hiding a group sent the screen back to main).
  if (mode === "push") history.pushState(state, "", path);
  else history.replaceState(state, "", path);
}

async function staticCall(path, body = {}) {
  const res = await fetch(`${STATIC_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: yaml.dump(body),
  });
  if (!res.ok) {
    // static says why in the body (`error.message`) — a schema file that does not
    // parse is the usual reason, and the body is the only place that says so.
    const text = await res.text().catch(() => "");
    let why = "";
    try {
      why = yaml.load(text)?.error?.message || "";
    } catch {}
    throw new Error(`static${path}: HTTP ${res.status}${why ? ` — ${why}` : ""}`);
  }
  return yaml.load(await res.text()) || {};
}

function titleOf(html) {
  return new DOMParser().parseFromString(html, "text/html").title.trim();
}

function firstLine(markdown) {
  return String(markdown || "").split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "").trim() || "";
}

// ---------- projects ----------

// addProject hands a path to the web server. web is the service that may read
// the disk, so it is the one that decides what an engineer project is (a folder
// holding engineer.yaml) and log is only what remembers the answer.
async function addProject(path) {
  const res = await fetch("/project/add", {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: yaml.dump({ path }),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? yaml.load(text) || {} : {};
  } catch {}
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data;
}

// removeProject takes a project off the board. The folder and the conversations
// stay — a tab of that project is closed first, because a tab is a session and a
// session of a project nobody opened has nowhere to go.
async function removeProject(project) {
  const ids = openTabs.filter((t) => !t.main && t.projectId === project.projectId).map((t) => t.sessionId);
  for (const id of ids) await logSessionOff(id).catch(() => {});
  await logCall("/log/project/remove", { projectId: project.projectId });
  await refreshWorkspace();
}

// ---------- a project's blueprints and recents ----------

async function blueprintEntries(projectId) {
  const data = await staticCall("/static/query", { projectId });
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
        projectId,
      });
      name = titleOf(index.blueprint) || slug;
    } catch {}
    try {
      const readme = await staticCall("/static/query-detail", {
        type: "blueprint",
        id: `.agents/blueprints/${slug}/README.md`,
        projectId,
      });
      desc = firstLine(readme.blueprint);
    } catch {}
    // The README's first line is often just the name again; don't repeat it.
    out.push({ slug, name, desc: desc && desc !== name ? desc : "" });
  }
  return out;
}

// recentEntries is the project's sessions, most recently active first — a session
// whose tab is closed is still a thing you can bring back, and bringing it back
// is the same conversation, not a copy of it.
async function recentEntries(projectId) {
  const data = await logCall("/log/list", { pageNum: 1, projectId });
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

// launcherSection draws one list, or the reason it could not be read. "no
// blueprints in this project" is a claim about the project; a call that failed
// must not make it — that is how a broken schema file looked like an empty
// project (`/static/query` 500, with the error swallowed here).
function launcherSection(title, { rows, err }, emptyText, rowOf) {
  const sec = document.createElement("section");
  sec.className = "launcher-sec";
  const h = document.createElement("h3");
  h.textContent = err ? title : `${title} · ${rows.length}`;
  sec.appendChild(h);
  if (err) {
    const e = document.createElement("div");
    e.className = "launcher-error";
    e.textContent = err.message;
    sec.appendChild(e);
    return sec;
  }
  if (!rows.length) {
    const e = document.createElement("div");
    e.className = "launcher-empty";
    e.textContent = emptyText;
    sec.appendChild(e);
    return sec;
  }
  for (const row of rows) sec.appendChild(rowOf(row));
  return sec;
}

function launcherSectionOf(title, promise, emptyText, rowOf) {
  const sec = document.createElement("section");
  sec.className = "launcher-sec";
  const h = document.createElement("h3");
  h.textContent = title;
  sec.appendChild(h);
  const pending = document.createElement("div");
  pending.className = "launcher-empty";
  pending.textContent = "…";
  sec.appendChild(pending);
  promise.then(
    (rows) => {
      const filled = launcherSection(title, { rows, err: null }, emptyText, rowOf);
      sec.replaceWith(filled);
    },
    (err) => {
      const failed = launcherSection(title, { rows: [], err }, emptyText, rowOf);
      sec.replaceWith(failed);
    },
  );
  return sec;
}

// ---------- engineer launcher (the +) ----------
//
// The board: every folder this engineer works on, with the two things the user
// does to one — open it, or take it off the board — and a field to add another.
// Nothing about the folder the program was started in appears here that was not
// added on purpose.

async function openEngineerLauncher(mode = "push") {
  if (launcherHold) return;
  launcherRoute("/new", { launcher: "engineer" }, mode);
  launcherEl.hidden = false;
  syncTabActive();
  launcherEl.innerHTML = `<div class="launcher-empty">…</div>`;

  let rows = [];
  let err = null;
  try {
    rows = await loadProjects();
    // The board is what the titlebar draws, so a project added (or removed) here
    // shows up in the bar behind the overlay without a reload.
    renderTabs();
  } catch (e) {
    err = e;
  }
  launcherEl.innerHTML = "";

  const sec = document.createElement("section");
  sec.className = "launcher-sec";
  const h = document.createElement("h3");
  h.textContent = err ? "Projects" : `Projects · ${rows.length}`;
  sec.appendChild(h);
  sec.appendChild(projectForm());
  if (err) {
    const e = document.createElement("div");
    e.className = "launcher-error";
    e.textContent = err.message;
    sec.appendChild(e);
  } else if (!rows.length) {
    const e = document.createElement("div");
    e.className = "launcher-empty";
    e.textContent = "no projects yet — add a folder above";
    sec.appendChild(e);
  } else {
    for (const p of rows) sec.appendChild(projectRow(p));
  }
  launcherEl.appendChild(sec);
}

// projectForm is how a folder becomes a project. It stays on screen after a
// failure: the reason (no engineer.yaml there, no such folder) is the whole
// answer, and the field the user typed in should still hold it.
function projectForm() {
  const form = document.createElement("form");
  form.className = "launcher-form";
  const input = document.createElement("input");
  input.type = "text";
  input.name = "path";
  input.placeholder = "/absolute/path/to/project (or ~/…)";
  input.spellcheck = false;
  input.autocomplete = "off";
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "add project";
  const err = document.createElement("div");
  err.className = "launcher-error";
  err.hidden = true;
  form.append(input, submit, err);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const path = input.value.trim();
    if (!path) return;
    submit.disabled = true;
    err.hidden = true;
    try {
      await addProject(path);
      input.value = "";
      // Redraw from log: the board is log's, and a project added twice comes
      // back as the same row.
      await openEngineerLauncher(null);
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });
  return form;
}

// projectRow is one project on the board: the name opens its launcher tab, `edit`
// does the same thing explicitly, the eye hides or shows its group in the
// titlebar, and `remove` takes the project off the board.
function projectRow(p) {
  const row = document.createElement("div");
  row.className = "project-row" + (p.visible === false ? " hidden-group" : "");
  const open = launcherRow({
    name: p.name || p.path || p.projectId,
    desc: [p.path, p.visible === false ? "hidden from the titlebar" : ""].filter(Boolean).join(" · "),
    onOpen: () => void openProjectLauncher(p.projectId),
  });
  open.dataset.projectId = p.projectId;
  const actions = document.createElement("div");
  actions.className = "project-actions";

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "row-btn edit";
  edit.innerHTML = ICON_LAUNCHER;
  edit.title = "open this project's launcher in a new tab";
  edit.setAttribute("aria-label", "open this project's launcher");
  edit.addEventListener("click", (event) => {
    event.stopPropagation();
    void openProjectLauncher(p.projectId);
  });

  const eye = document.createElement("button");
  eye.type = "button";
  eye.className = "row-btn eye" + (p.visible === false ? " off" : "");
  eye.innerHTML = p.visible === false ? ICON_EYE_OFF : ICON_EYE;
  eye.title =
    p.visible === false
      ? "show this project's group in the titlebar (its tabs are still open)"
      : "hide this project's group from the titlebar (its tabs stay open)";
  eye.setAttribute("aria-label", p.visible === false ? "show group" : "hide group");
  eye.setAttribute("aria-pressed", String(p.visible !== false));
  eye.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (launcherHold) return;
    launcherHoldOn();
    try {
      await setProjectVisible(p, p.visible === false);
      launcherRelease();
      await openEngineerLauncher(null);
    } catch (e) {
      launcherRelease();
      toast(`could not change the group: ${e.message}`);
    }
  });

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "row-btn";
  remove.textContent = "remove";
  remove.title = "take this project off the board — its folder and conversations stay";
  remove.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (launcherHold) return;
    launcherHoldOn();
    try {
      await removeProject(p);
      launcherRelease();
      await openEngineerLauncher(null);
    } catch (e) {
      launcherRelease();
      toast(`could not remove: ${e.message}`);
    }
  });
  actions.append(edit, eye, remove);
  row.append(open, actions);
  return row;
}

// setProjectVisible is the eye: it stores the group's visibility and redraws the
// bar. Its tabs are not touched — a hidden group keeps them open, and showing it
// again draws exactly those. Hiding the group of the tab on screen sends the
// screen back to main.
async function setProjectVisible(project, visible) {
  const row = await logCall("/log/project/visible", { projectId: project.projectId, visible });
  const known = projectList.find((p) => p.projectId === project.projectId);
  if (known) known.visible = row.visible !== false;
  else await loadProjects().catch(() => {});
  if (!visible) {
    expandedGroups.delete(project.projectId);
    collapsedGroups.delete(project.projectId);
    const active = openTabs.find((t) => t.id === activeTabId);
    if (active && !active.main && active.projectId === project.projectId) {
      await activateTab("main", "replace");
    }
  }
  renderTabs();
  return known || project;
}

// ---------- project launcher ----------

// Opening a project means making one of its tabs: a draft on its home page — what
// it can be asked to open (its blueprints) and what was opened before (its
// recents). The group is shown first, then the tab is added and brought up.
async function openProjectLauncher(projectId, mode = "push") {
  if (launcherHold) return;
  const project = projectList.find((p) => p.projectId === projectId);
  if (!project) {
    toast(`project ${projectId} is not on the board`);
    await openEngineerLauncher();
    return;
  }
  launcherHoldOn();
  try {
    await openNewTab(projectId, mode ?? "push");
  } catch (err) {
    launcherRelease();
    toast(`could not open the project: ${err.message}`);
    return;
  }
  launcherRelease();
  launcherClose();
}

// buildProjectHomeView draws a project's home page — the `+` in its group. It is
// everything that project can open (its blueprints) and everything it had open
// before (its recents), above the shell's own conversation. Arriving here creates
// nothing: no session exists until the user sends a message or picks a row.
function buildProjectHomeView(tab) {
  const projectId = tab.projectId;
  const view = document.createElement("div");
  view.className = "view view-home";
  // The handwritten wordmark, huge and faint, behind the whole page — the shell's
  // mark in the theme's text colour (a mask, so it needs no second, inverted copy
  // for the dark themes).
  const mark = document.createElement("div");
  mark.className = "home-mark";
  mark.setAttribute("aria-hidden", "true");
  view.appendChild(mark);

  // The lists ride inside the conversation's own scroll area (`slot="before"`), in
  // the message column: they scroll with the messages instead of occupying a pane
  // of their own, and the composer stays where a composer is. They are one element
  // the page keeps, so a new conversation on this page carries them over.
  const lists = document.createElement("div");
  lists.className = "home-lists";
  lists.setAttribute("slot", "before");
  view.homeListsEl = lists;

  mountHomeChat(view, tab, lists);
  void fillHomeLists(lists, projectId, tab);
  return view;
}

// mountHomeChat puts an empty conversation on a draft's home page: no session, so
// nothing is created until the user sends. The first message creates the session
// and *this* tab becomes it (adoptSession) — the conversation does not move to a
// second tab, and the home lists are not part of a conversation, so they go.
function mountHomeChat(view, tab, lists) {
  const projectId = tab.projectId;
  const chat = document.createElement("engineer-chat");
  chat.className = "home-chat";
  chat.setAttribute("project", projectId);
  chat.setAttribute("autofocus", "");
  chat.appendChild(lists);
  chat.addEventListener("engineer-session", (event) => {
    const sessionId = String(event.detail?.sessionId ?? "");
    if (!sessionId) return;
    // The conversation stays in this element and in this tab: what goes is the
    // home around it — the lists are a place to start from, not part of a
    // conversation — and the tab stops being a draft.
    lists.remove();
    view.querySelector(".home-mark")?.remove();
    view.classList.remove("view-home");
    void adoptSession(tab, sessionId);
  });
  // The first turn's summary is the tab bar's name, same as on a page.
  chat.addEventListener("engineer-title", (event) => {
    const title = String(event.detail?.title ?? "").trim();
    if (!title || title === tab.name) return;
    tab.name = title;
    renderTabs();
  });
  view.appendChild(chat);
  return chat;
}

// HOME_LIMIT is how many rows a home section shows before asking whether to show
// the rest: a project's home is for the recent and the useful, not for scrolling
// through everything that ever ran.
const HOME_LIMIT = 20;

// homeSection is one section of the project home — two columns of rows, the first
// HOME_LIMIT of them, and a button that reveals the remainder. The board overlay
// keeps launcherSectionOf (one column, everything): this one sits in the
// conversation's column, where a 100-row list would push the composer out of
// sight.
function homeSection(title, promise, emptyText, rowOf) {
  const sec = document.createElement("section");
  sec.className = "launcher-sec home-sec";
  const pending = document.createElement("div");
  pending.className = "launcher-empty";
  pending.textContent = "…";
  sec.appendChild(pending);

  const build = (rows, err) => {
    sec.replaceChildren();
    const h = document.createElement("h3");
    h.textContent = err ? title : `${title} · ${rows.length}`;
    sec.appendChild(h);
    if (err) {
      const e = document.createElement("div");
      e.className = "launcher-error";
      e.textContent = err.message;
      sec.appendChild(e);
      return;
    }
    if (!rows.length) {
      const e = document.createElement("div");
      e.className = "launcher-empty";
      e.textContent = emptyText;
      sec.appendChild(e);
      return;
    }
    const grid = document.createElement("div");
    grid.className = "home-grid";
    const show = (count) => {
      grid.replaceChildren(...rows.slice(0, count).map(rowOf));
    };
    show(Math.min(rows.length, HOME_LIMIT));
    sec.appendChild(grid);
    if (rows.length > HOME_LIMIT) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "home-more";
      more.textContent = `展开 (+${rows.length - HOME_LIMIT})`;
      more.addEventListener("click", () => {
        show(rows.length);
        more.remove();
      });
      sec.appendChild(more);
    }
  };

  promise.then(
    (rows) => build(rows, null),
    (err) => build([], err),
  );
  return sec;
}

// fillHomeLists (re)reads the two sections. Everything on them is that project's:
// the query carries its id, and log answers for that project alone. A section
// that cannot be read says why instead of pretending the project is empty.
async function fillHomeLists(lists, projectId, tab = null) {
  const project = projectList.find((p) => p.projectId === projectId);
  const name = project?.name || project?.path || projectId;
  const path = project?.path || "";
  lists.innerHTML = "";
  lists.appendChild(launcherHead(name, path));
  lists.appendChild(
    homeSection(
      "Blueprints",
      blueprintEntries(projectId),
      "no blueprints in this project",
      (b) =>
        launcherRow({
          name: b.name,
          desc: b.desc,
          onOpen: () => void browseBlueprint(b, projectId, tab),
        }),
    ),
  );
  lists.appendChild(
    homeSection(
      "Recents",
      recentEntries(projectId),
      "nothing yet",
      (r) =>
        launcherRow({
          name: r.title || r.sessionId,
          desc: r.desc,
          onOpen: () => void openSessionFromLauncher(r.sessionId, tab),
        }),
    ),
  );
}

// launcherHead is the project home's title: the project's name and the folder it
// lives in. There is no way back — the `+` is a tab of this project's group, and
// the board is the shell's own `+` at the end of the bar.
function launcherHead(title, path) {
  const head = document.createElement("div");
  head.className = "launcher-head";
  const name = document.createElement("span");
  name.className = "launcher-title";
  name.textContent = title;
  const dir = document.createElement("span");
  dir.className = "launcher-path";
  dir.textContent = path;
  head.append(name, dir);
  return head;
}

// browseBlueprint opens a blueprint's page — it does not make a session. Clicking a
// row is looking, not asking: nothing is written until the page's conversation
// sends its first message, and then that tab becomes the session.
//
// From a draft's home page it opens in that same tab (a new page in the browser
// sense, the way a link replaces what the tab shows); from anywhere else it takes a
// new draft tab of that project.
async function browseBlueprint(b, projectId, fromTab = null) {
  if (launcherHold) return;
  const active = openTabs.find((t) => t.id === activeTabId);
  const host = [fromTab, active].find((t) => t && t.kind === "new" && !t.blueprint);
  launcherHoldOn();
  try {
    let tab = host;
    if (!tab) {
      tab = draftTab(projectId, b.slug);
      openTabs.push(tab);
    } else {
      tab.blueprint = b.slug;
      tab.name = b.slug;
      // The home page it was showing is gone with the navigation.
      tab.el?.parentNode?.removeChild(tab.el);
      tab.el = null;
      tab.frameEl = null;
    }
    expandGroup(projectId);
    await activateTab(tab.id, "push");
    await waitForTabPaint(tab);
    launcherRelease();
    launcherClose("replace");
  } catch (err) {
    launcherRelease();
    toast(`could not open: ${err.message}`);
  }
}

// openSessionFromLauncher brings an existing session back. A closed tab is
// reopened, never re-created: a tab is the session, so a second copy of it is not
// something the workspace can represent.
//
// Clicking the row from a draft's home replaces what *that* tab shows, the way a
// blueprint row does: the home was a place to start from, not a document to keep,
// so the draft becomes the session's tab instead of a second tab being added
// beside it. A session that already has a tab is brought up instead — taking the
// draft would leave two tabs of one conversation.
async function openSessionFromLauncher(sessionId, fromTab = null) {
  if (launcherHold) return;
  const active = openTabs.find((t) => t.id === activeTabId);
  const host = [fromTab, active].find((t) => t && t.kind === "new" && !t.sessionId);
  launcherHoldOn();
  try {
    let tab = openTabs.find((t) => t.sessionId === sessionId);
    if (!tab && host) {
      // The row names a session that no tab holds: this draft takes it on. The id
      // goes into the open list where the draft stands, so the tab bar keeps its
      // order, and ai resumes the conversation before the tab shows it.
      const rec = await logSessionMeta(sessionId);
      await logSessionOn([sessionId], openIndexBefore(host));
      await aiResume(sessionId);
      tab = adoptRecentSession(host, sessionId, rec);
    } else if (!tab) {
      await logSessionOn([sessionId]);
      await refreshWorkspace();
      tab = openTabs.find((t) => t.sessionId === sessionId);
    }
    if (tab) {
      // refreshWorkspace already activated a tab it just added; one that was open
      // but in the background is brought up here. A draft that took the session on
      // has a new id, so it is activated too — that is what builds its view.
      if (activeTabId !== tab.id) await activateTab(tab.id, tab === host ? "replace" : "push");
      await waitForTabPaint(tab);
    }
    launcherRelease();
    launcherClose("replace");
  } catch (err) {
    launcherRelease();
    toast(`could not open: ${err.message}`);
  }
}

// openIndexBefore is where a session goes in log's open list so that it lands
// where its tab already stands. The list holds sessions only — main is not in it,
// and a draft is not either — so what is counted is the session tabs above it.
function openIndexBefore(tab) {
  const at = openTabs.indexOf(tab);
  if (at < 0) return -1;
  return openTabs.slice(0, at).filter((t) => t.sessionId && !t.main).length;
}

// adoptRecentSession is the take-over for a session that already exists: the draft
// stops being a draft and becomes that session's tab. Nothing about the
// conversation changes — no second copy, no new record — the way adoptSession
// leaves the page it was made in running where it is. It does not bring the tab up:
// the id has changed, so activating it is the caller's next step (and that is what
// builds the view, the draft having thrown its own away).
function adoptRecentSession(tab, sessionId, rec) {
  tab.kind = rec.kind || "sub";
  tab.sessionId = sessionId;
  tab.id = sessionId;
  tab.projectId = rec.projectId || tab.projectId;
  tab.blueprint = rec.blueprint || tab.blueprint || "";
  tab.name = rec.title || tab.name || sessionId;
  // The home page goes with the navigation: a conversation has no lists above it,
  // and the empty conversation on it was never a session.
  tab.el?.parentNode?.removeChild(tab.el);
  tab.el = null;
  tab.frameEl = null;
  renderTabs();
  return tab;
}

tabAddEl.addEventListener("click", (event) => {
  event.stopPropagation();
  void openEngineerLauncher();
});

window.addEventListener("mousedown", (event) => {
  if (launcherEl.hidden || launcherHold) return;
  // A tab switches views on click. Keep the launcher up during mousedown so
  // the previous view cannot flash before that click activates the new one.
  if (launcherEl.contains(event.target) || tabAddEl.contains(event.target) || tabsEl.contains(event.target)) return;
  launcherClose("push");
});

// ---------- boot ----------
//
// Rebuild the workspace from log, then restore the visible page from the URL.

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
  startNameTick();

  // The bar is drawn group by group, so the board has to be known first. A board
  // that cannot be read still leaves main usable — the groups are simply absent,
  // and nothing is repaired: a board we could not read says nothing about which
  // sessions belong where, and writing that guess back would close them.
  let boardKnown = true;
  try {
    await loadProjects();
  } catch {
    boardKnown = false;
  }

  let byId = null;
  try {
    byId = await sessionsById();
  } catch {
    // a list that cannot be read still leaves main usable, and must not make the
    // open list look empty
  }
  const onBoard = new Set(projectList.map((p) => p.projectId));
  const kept = [];
  for (const sessionId of cur.openSessions ?? []) {
    if (byId && !byId.has(sessionId)) continue; // row gone: repair, don't show a ghost
    const tab = tabFromSession(byId?.get(sessionId) ?? { sessionId });
    // A tab lives in a group, and a group is a project on the board: a session
    // left open by a project that was taken off has nowhere to be drawn.
    if (boardKnown && tab.projectId && !onBoard.has(tab.projectId)) continue;
    kept.push(tab);
  }
  if (byId && boardKnown && kept.length !== (cur.openSessions ?? []).length) {
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
  await restoreRoute();
  void hydrateNames();
}

// Boot and browser history share the same route resolution. A closed sub
// session may still have a valid bookmark: reopen it instead of showing main.
async function restoreRoute() {
  const path = location.pathname;
  if (path === "/new") {
    const tab = openTabs.find((t) => t.id === activeTabId) || mainTab;
    activeTabId = tab.id;
    showTab(tab);
    await openEngineerLauncher(null);
    return;
  }
  const projectPage = path.match(/^\/project\/([^/]+)\/(?:new|blueprint\/([^/]+))$/);
  if (projectPage) {
    const tab = openTabs.find((t) => t.id === activeTabId) || mainTab;
    activeTabId = tab.id;
    showTab(tab);
    const projectId = decodeURIComponent(projectPage[1]);
    const slug = projectPage[2] ? decodeURIComponent(projectPage[2]) : "";
    try {
      await openNewTab(projectId, null, slug);
    } catch (err) {
      toast(`could not open page: ${err.message}`);
    }
    return;
  }
  if (path === "/") {
    await activateTab("main", null);
    return;
  }
  try {
    const match = path.match(/^\/session\/([^/]+)$/);
    if (!match) throw new Error("unknown page");
    const id = decodeURIComponent(match[1]);
    let tab = openTabs.find((t) => t.sessionId === id);
    if (!tab) {
      const rec = await logSessionMeta(id);
      if (rec.kind !== "sub") throw new Error("this is not an open workspace session");
      if (rec.projectId && !projectList.some((p) => p.projectId === rec.projectId)) {
        throw new Error("that project is not on the board");
      }
      // Do not let a late response replace a page the user navigated to meanwhile.
      if (location.pathname !== path) return;
      await aiResume(id);
      await logSessionOn([id]);
      tab = openTabs.find((t) => t.sessionId === id);
      if (!tab) {
        tab = tabFromSession(rec);
        openTabs.push(tab);
        renderTabs();
      }
    }
    if (location.pathname !== path) return;
    await activateTab(tab.id, "replace");
  } catch (err) {
    if (location.pathname !== path) return;
    toast(`could not open page: ${err.message}`);
    await activateTab("main", "replace");
  }
}

window.addEventListener("popstate", () => { void restoreRoute(); });

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

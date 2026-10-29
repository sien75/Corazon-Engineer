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
  const chat = document.createElement("engineer-chat");
  chat.setAttribute("session", sessionId);
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

// viewOf builds the one element a tab shows: main's chat, an agent's own page in
// an iframe (its blueprint's index.html, served at /agent/<sessionId>/), or a
// project's launcher page.
function viewOf(tab) {
  if (tab.el) return tab.el;
  if (tab.main) return null; // built by makeMainTab
  if (tab.kind === "launcher") {
    tab.el = buildProjectLauncherView(tab.projectId);
    return tab.el;
  }
  const frame = document.createElement("iframe");
  frame.className = "view view-page";
  frame.title = tab.sessionId;
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
  });
  frame.src = agentFrameSrc(tab.sessionId);
  tab.frameEl = frame;
  tab.el = frame;
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

// Icons are inline SVG, drawn with the text colour: a tab group's edit is a pen on
// a sheet (the "edit in a box" shape), the eye is a plain outline eye (and a
// crossed one when the group is hidden). No font, no CDN, no emoji.
const ICON_EDIT = `
<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor"
     stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M13.5 8.7V12.5A1.5 1.5 0 0 1 12 14H3.5A1.5 1.5 0 0 1 2 12.5V4A1.5 1.5 0 0 1 3.5 2.5H7.3" />
  <path d="M11.7 2.3a1.45 1.45 0 0 1 2.05 2.05L8.1 10 5.3 10.7 6 7.9Z" />
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

function launcherTabId(projectId) {
  return `launcher:${projectId}`;
}

function launcherTab(projectId) {
  return openTabs.find((t) => t.id === launcherTabId(projectId));
}

// ensureLauncherTab puts a project's launcher on screen as a tab of its group. A
// hidden group is made visible first: a group that is not drawn cannot be worked
// in (`edit` on a hidden project means "show it, then open this").
async function ensureLauncherTab(projectId) {
  const project = projectList.find((p) => p.projectId === projectId);
  if (!project) throw new Error(`project ${projectId} is not on the board`);
  if (project.visible === false) await setProjectVisible(project, true);
  expandGroup(projectId);
  let tab = launcherTab(projectId);
  if (!tab) {
    tab = {
      id: launcherTabId(projectId),
      kind: "launcher",
      projectId,
      sessionId: "",
      name: "launcher",
      blueprint: "",
      el: null,
      frameEl: null,
      main: false,
    };
    openTabs.push(tab);
  }
  return tab;
}

// tabButton is one tab in the bar: a label, and a close that takes the tab off
// screen without losing anything behind it.
function tabButton(tab) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    "tab" + (tab.main ? " main" : "") + (tab.kind === "launcher" ? " launcher" : "");
  btn.dataset.tabId = tab.id;
  // A tab is only narrower on the right when it carries a ×: the close button has
  // its own padding, so the label must not be pushed away from it. Without it
  // (main, the launcher icon) both sides are the same, and so is the underline.
  const label = document.createElement("span");
  label.className = "tab-label";
  if (tab.main) label.textContent = "main";
  else if (tab.kind === "launcher") label.innerHTML = ICON_EDIT; // the project launcher, drawn
  else label.textContent = tab.name || "…";
  btn.appendChild(label);
  // The project launcher is not closable: it is the group's own page, the place
  // that group's tabs are opened from. Only a conversation tab has a ×.
  if (!tab.main && tab.kind !== "launcher") {
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

// launcherEntry is the project's launcher at the end of its group: always the same
// icon, never a ×. Before its page is opened it opens it; once opened, that same
// icon is the tab (it carries the tab id and the active underline), and clicking it
// brings the page back.
function launcherEntry(project) {
  const tab = launcherTab(project.projectId);
  if (tab) return tabButton(tab);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tab launcher launcher-entry";
  btn.dataset.launcherFor = project.projectId;
  btn.innerHTML = ICON_EDIT;
  const what = project.name || project.path || "this project";
  btn.title = `open ${what}'s launcher`;
  btn.setAttribute("aria-label", "open this project's launcher");
  btn.addEventListener("click", () => void openProjectLauncher(project.projectId));
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
      // The project's session tabs, then its launcher — last, like a browser's
      // new-tab button. The launcher is a real tab once it is open (icon label,
      // close button, underline when active); closed, it is the same icon with
      // nothing around it, and clicking it opens that tab.
      const tabs = openTabs.filter(
        (t) => !t.main && t.kind !== "launcher" && t.projectId === project.projectId,
      );
      for (const tab of tabs) group.appendChild(tabButton(tab));
      group.appendChild(launcherEntry(project));
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
  if (tab.kind === "launcher") return `/project/${encodeURIComponent(tab.projectId)}/new`;
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
  // A launcher tab is a live list (blueprints + that project's recents), not a
  // document: rebuild it each time it comes back on stage, so a session created
  // while it was in the background shows up in Recent.
  if (tab.kind === "launcher") {
    tab.el?.parentNode?.removeChild(tab.el);
    tab.el = null;
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
  if (tab.kind !== "launcher") {
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
    const watches = openTabs.some((t) => !t.main && t.kind !== "launcher");
    if (!watches) return;
    void sessionsById()
      .then((byId) => {
        let changed = false;
        for (const tab of openTabs) {
          if (tab.main || tab.kind === "launcher") continue;
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
    if (tab.kind === "launcher") {
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
  edit.innerHTML = ICON_EDIT;
  edit.title = "edit — open this project's launcher in a new tab";
  edit.setAttribute("aria-label", "edit this project");
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

// A project's launcher is a tab of that project's group: what it can be asked to
// open (its blueprints) and what was opened before (its recents). It belongs to
// the group, so opening it means showing the group, adding the tab and bringing
// it up.
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
    await ensureLauncherTab(projectId);
    await activateTab(launcherTabId(projectId), mode);
  } catch (err) {
    launcherRelease();
    toast(`could not open the launcher: ${err.message}`);
    return;
  }
  launcherRelease();
  launcherClose();
}

// buildProjectLauncherView draws the page a launcher tab shows. Everything on it
// is that project's: the query carries its id, and log answers for that project
// alone. The sections fill in as they arrive; a section that cannot be read says
// why instead of pretending the project is empty.
function buildProjectLauncherView(projectId) {
  const view = document.createElement("div");
  view.className = "view view-launcher";
  const project = projectList.find((p) => p.projectId === projectId);
  const name = project?.name || project?.path || projectId;
  const path = project?.path || "";
  view.appendChild(
    launcherHead(name, path, () => void openEngineerLauncher()),
  );
  view.appendChild(
    launcherSectionOf(
      "Blueprints",
      blueprintEntries(projectId),
      "no blueprints in this project",
      (b) =>
        launcherRow({
          name: b.name,
          desc: b.desc,
          onOpen: () => void openBlueprintFromLauncher(b, projectId),
        }),
    ),
  );
  view.appendChild(
    launcherSectionOf(
      "Recent",
      recentEntries(projectId),
      "nothing yet",
      (r) =>
        launcherRow({
          name: r.title || r.sessionId,
          desc: r.desc,
          onOpen: () => void openSessionFromLauncher(r.sessionId),
        }),
    ),
  );
  return view;
}

// launcherHead is the project launcher's title: the project's name, the folder it
// lives in, and the way back to the board.
function launcherHead(title, path, onBack) {
  const head = document.createElement("div");
  head.className = "launcher-head";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "row-btn";
  back.textContent = "← projects";
  back.addEventListener("click", onBack);
  const name = document.createElement("span");
  name.className = "launcher-title";
  name.textContent = title;
  const dir = document.createElement("span");
  dir.className = "launcher-path";
  dir.textContent = path;
  head.append(back, name, dir);
  return head;
}

// openBlueprintFromLauncher makes a new agent from a blueprint inside a project
// and puts it on screen as a tab of its own — the same two writes main's
// session-new does, from the UI. `ai/new` has already written the session row
// (kind, project, blueprint, title).
async function openBlueprintFromLauncher(b, projectId) {
  if (launcherHold) return;
  launcherHoldOn();
  try {
    const res = await fetch(`${AI_BASE}/ai/new`, {
      method: "POST",
      headers: { "Content-Type": "application/yaml" },
      body: yaml.dump({ blueprint: b.slug, projectId }),
    });
    const data = yaml.load(await res.text()) || {};
    if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
    const sessionId = data.sessionId;
    await logSessionOn([sessionId]);
    // refreshWorkspace puts the tab up; the page inside it loads a moment later.
    await refreshWorkspace();
    await waitForTabPaint(openTabs.find((t) => t.sessionId === sessionId));
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
    launcherClose("replace");
  } catch (err) {
    launcherRelease();
    toast(`could not open: ${err.message}`);
  }
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
  const projectPage = path.match(/^\/project\/([^/]+)\/new$/);
  if (projectPage) {
    const tab = openTabs.find((t) => t.id === activeTabId) || mainTab;
    activeTabId = tab.id;
    showTab(tab);
    await openProjectLauncher(decodeURIComponent(projectPage[1]), null);
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

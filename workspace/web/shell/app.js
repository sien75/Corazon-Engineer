import yaml from "./vendor/js-yaml.js";

// Runtime addresses are injected by serve-web and served as an ES module. There is
// no fallback: guessing a port would point the page at whatever happens to be
// listening there.
import { ENGINEER as RUNTIME } from "/config.js";
if (!RUNTIME) {
  const message = "engineer web: /config.js did not provide the runtime configuration";
  document.body.innerHTML = `<div class="empty-hint">${message}</div>`;
  throw new Error(message);
}

// The shell is two jobs: pick a blueprints folder (the corner), and keep the pages
// that are open (the strip). Overview comes first and lists the front folder's
// blueprints; every blueprint it opens is one more tab. The page draws no
// conversation of its own — a blueprint's page is its own document, framed below.
// Everything a blueprint needs to talk to its runtime it gets from the page itself
// (bp.addr).
const panesEl = document.getElementById("panes");
const tabsEl = document.getElementById("tabs");
const themeToggleEl = document.getElementById("theme-toggle");
const themeMenuEl = document.getElementById("theme-menu");

const THEME_ORDER = ["light", "warm", "cold", "dark", "slate"];
const THEME_KEY = "engineer.theme";
// Which tabs are open, and which one is in front, survive a reload. They are kept
// per folder, because a slug only means something inside its own folder.
const TABS_KEY = "engineer.tabs";
const ACTIVE_KEY = "engineer.active-tab";

// ---------- theme ----------

function currentTheme() {
  const t = document.documentElement.getAttribute("data-theme");
  return THEME_ORDER.includes(t) ? t : "light";
}

function syncThemeMenu() {
  const cur = currentTheme();
  for (const btn of themeMenuEl.querySelectorAll("button[data-theme]")) {
    const selected = btn.dataset.theme === cur;
    btn.classList.toggle("active", selected);
    btn.setAttribute("aria-pressed", String(selected));
  }
}

function applyTheme(name) {
  if (!THEME_ORDER.includes(name)) name = "light";
  document.documentElement.setAttribute("data-theme", name);
  // Native widgets and the scrollbar follow color-scheme, not our variables.
  document.documentElement.style.colorScheme = (name === "dark" || name === "slate") ? "dark" : "light";
  try {
    localStorage.setItem(THEME_KEY, name);
  } catch (e) {}
  // A blueprint's page is its own document: the attribute does not reach it on its
  // own, so every open frame is dressed again.
  dressFrames();
  themeToggleEl.title = `theme: ${name}`;
  syncThemeMenu();
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
  if (!themeMenuEl.contains(event.target) && event.target !== themeToggleEl) themeMenuHide();
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || themeMenuEl.hidden) return;
  event.stopPropagation();
  themeMenuHide();
});

// ---------- the tabs ----------
//
// The strip is the pages that are open. Overview comes first and never closes: it
// is the front folder's blueprint list, and it is where a blueprint is opened
// from. A blueprint has at most one tab — opening one that is open already comes
// back to it — and a blueprint tab closes, which takes its page away.

const OVERVIEW = "overview";

let BLUEPRINTS = []; // the front folder's blueprints, as blueprint lists them
let OPEN_TABS = []; // the blueprints with a tab, in the order they were opened
let ACTIVE = OVERVIEW; // "overview", or the slug of the blueprint in front

// One frame per open blueprint. A frame rather than injected markup: a blueprint is
// its own document with its own scripts, styles and `bp` channel, and a frame keeps
// all of that out of the shell. A frame of a tab that is not in front is hidden, not
// thrown away, so a tab keeps its conversation and its scroll while it waits.
const FRAMES = new Map();

function scope(kind) {
  return FOREGROUND ? `${kind}.${FOREGROUND}` : kind;
}

function storedTabs() {
  try {
    const raw = JSON.parse(localStorage.getItem(scope(TABS_KEY)) || "[]");
    return Array.isArray(raw) ? raw.filter((s) => typeof s === "string" && s) : [];
  } catch (e) {
    return [];
  }
}

function saveTabs() {
  try {
    localStorage.setItem(scope(TABS_KEY), JSON.stringify(OPEN_TABS));
    localStorage.setItem(scope(ACTIVE_KEY), ACTIVE);
  } catch (e) {}
}

// restoreTabs reads this folder's open tabs back. A slug only means something in
// its own folder, so a blueprint the folder no longer has takes its tab with it.
function restoreTabs() {
  OPEN_TABS = storedTabs().filter((slug) => BLUEPRINTS.some((b) => b.slug === slug));
  let active = OVERVIEW;
  try {
    active = localStorage.getItem(scope(ACTIVE_KEY)) || OVERVIEW;
  } catch (e) {}
  ACTIVE = active === OVERVIEW || OPEN_TABS.includes(active) ? active : OVERVIEW;
  // A blueprint that needs a folder and has none is not opened behind the user's
  // back: it waits on Overview until the folder is given (see ensureFolder).
  if (ACTIVE !== OVERVIEW && folderMissing(ACTIVE)) ACTIVE = OVERVIEW;
  if (ACTIVE !== OVERVIEW) frameFor(ACTIVE);
}

function dropFrames() {
  for (const frame of FRAMES.values()) frame.remove();
  FRAMES.clear();
}

function overviewPane() {
  let pane = document.getElementById("overview-pane");
  if (!pane) {
    pane = document.createElement("div");
    pane.id = "overview-pane";
    pane.className = "view overview";
    panesEl.append(pane);
  }
  return pane;
}

function frameFor(slug) {
  let frame = FRAMES.get(slug);
  if (!frame) {
    frame = document.createElement("iframe");
    frame.className = "blueprint-frame";
    frame.setAttribute("title", slug);
    // Same origin as this page: /bp/… is forwarded to blueprint by serve-web, so the
    // frame's own scripts, its event stream and its images all keep working.
    frame.src = `/bp/${encodeURIComponent(FOREGROUND)}/${encodeURIComponent(slug)}`;
    // The palette is the shell's, and a frame is a document of its own: hand it over
    // when it has loaded, and again on every theme change (see dressFrames).
    frame.addEventListener("load", () => dressFrame(frame));
    panesEl.append(frame);
    FRAMES.set(slug, frame);
  }
  return frame;
}

// dressFrame hands the current theme to a blueprint's page: same origin, so the
// shell may write into the frame's document. Two things go in — the attribute the
// palette is selected by, and the stylesheet that defines the variables — because
// a blueprint should not have to know that a theme exists. A page that already
// links theme.css keeps its own copy: the second link is the same file.
function dressFrame(frame) {
  let doc;
  try {
    doc = frame.contentDocument;
  } catch (e) {
    return; // another origin: nothing the shell may touch
  }
  if (!doc || !doc.documentElement) return;
  doc.documentElement.setAttribute("data-theme", currentTheme());
  if (doc.querySelector("link[data-engineer-theme]")) return;
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = "/theme.css";
  // First in the head, so a page's own styles (and a blueprint's own palette, if it
  // has one) still come after it and win.
  link.setAttribute("data-engineer-theme", "");
  const head = doc.head || doc.documentElement;
  head.insertBefore(link, head.firstChild);
}

function dressFrames() {
  for (const frame of FRAMES.values()) dressFrame(frame);
}

// drawOverview is the list a blueprint is opened from: the front folder's path, and
// one row per blueprint.
function drawOverview() {
  const pane = overviewPane();
  pane.textContent = "";
  const body = document.createElement("div");
  body.className = "overview-body";

  const project = PROJECTS.find((p) => p.id === FOREGROUND);
  const head = document.createElement("div");
  head.className = "launcher-head";
  const title = document.createElement("span");
  title.className = "launcher-title";
  title.textContent = "Overview";
  const path = document.createElement("span");
  path.className = "launcher-path";
  path.textContent = project ? project.path : "";
  head.append(title, path);
  body.append(head);

  const sec = document.createElement("div");
  sec.className = "launcher-sec";
  const heading = document.createElement("h3");
  heading.textContent = "blueprints";
  sec.append(heading);

  if (!BLUEPRINTS.length) {
    const empty = document.createElement("div");
    empty.className = "launcher-empty";
    empty.textContent = "this folder has no blueprints yet";
    sec.append(empty);
  }
  for (const bp of BLUEPRINTS) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "launcher-item";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = bp.title || bp.slug;
    const desc = document.createElement("span");
    desc.className = "desc";
    desc.textContent = bp.slug;
    item.append(name, desc);
    item.title = `open ${bp.slug}`;
    item.addEventListener("click", () => openBlueprint(bp.slug));
    sec.append(item);
  }
  body.append(sec);
  pane.append(body);
}

function tabButton(id, label, closable) {
  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = "tab" + (closable ? " closable" : "") + (id === ACTIVE ? " active" : "");
  tab.dataset.tabId = id;
  tab.title = label;
  const text = document.createElement("span");
  text.className = "tab-label";
  text.textContent = label;
  tab.append(text);
  tab.addEventListener("click", () => activate(id));
  if (closable) {
    const close = document.createElement("span");
    close.className = "tab-close";
    close.setAttribute("role", "button");
    close.setAttribute("aria-label", `close ${label}`);
    close.title = `close ${label}`;
    close.textContent = "×";
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      closeTab(id);
    });
    tab.append(close);
  }
  return tab;
}

function drawTabs() {
  tabsEl.textContent = "";
  tabsEl.append(tabButton(OVERVIEW, "Overview", false));
  for (const slug of OPEN_TABS) {
    const bp = BLUEPRINTS.find((b) => b.slug === slug);
    tabsEl.append(tabButton(slug, bp ? bp.title || bp.slug : slug, true));
  }
}

async function showPane() {
  // Overview reads the folder again whenever it comes to the front: a blueprint is
  // a file the user (or an agent) may add at any time. It is also the list the tabs
  // are named from, so a stale one would keep a tab the folder no longer has.
  if (ACTIVE === OVERVIEW) {
    await loadBlueprints().catch(() => {});
    OPEN_TABS = OPEN_TABS.filter((slug) => BLUEPRINTS.some((b) => b.slug === slug));
  }
  const overview = overviewPane();
  overview.hidden = ACTIVE !== OVERVIEW;
  if (ACTIVE === OVERVIEW) drawOverview();
  for (const [slug, frame] of FRAMES) frame.hidden = slug !== ACTIVE;
  drawTabs();
  saveTabs();
}

// A blueprint with an ai node (the list says `needsFolder`) has an agent, and the
// agent works in a folder that is a fact about this machine: the user gives it the
// first time the blueprint is opened, and blueprint keeps it. Without it the
// blueprint does not open.
function folderMissing(slug) {
  const bp = BLUEPRINTS.find((b) => b.slug === slug);
  return !!(bp && bp.needsFolder && !bp.folder);
}

// askFolder writes its heading and hint as markup; what comes from a file or from an
// error is escaped first.
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function ensureFolder(slug) {
  if (!folderMissing(slug)) return true;
  const bp = BLUEPRINTS.find((b) => b.slug === slug);
  const name = esc(bp.title || bp.slug);
  let hint = `${name} has an agent, and the agent needs a folder to work in. Give an absolute path.`;
  for (;;) {
    const path = await askFolder({
      heading: `Working folder for ${name}`,
      hint,
      cancellable: true,
      placeholder: "~/work",
    });
    if (!path) return false;
    const res = await fetch("/config/blueprints/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: FOREGROUND, slug, path }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.folder) {
      bp.folder = body.folder;
      return true;
    }
    hint = `${esc(body.error || `HTTP ${res.status}`)} — give an absolute path to a folder that exists.`;
  }
}

async function activate(id) {
  if (id !== OVERVIEW && !(await ensureFolder(id))) {
    // No folder, no blueprint: the tab it would have opened is not kept.
    OPEN_TABS = OPEN_TABS.filter((slug) => slug !== id);
    id = OVERVIEW;
  }
  ACTIVE = id;
  if (id !== OVERVIEW) frameFor(id);
  await showPane();
}

function openBlueprint(slug) {
  // One tab per blueprint: opening one that is already open comes back to it.
  if (!OPEN_TABS.includes(slug)) OPEN_TABS.push(slug);
  activate(slug);
}

function closeTab(slug) {
  const index = OPEN_TABS.indexOf(slug);
  if (index < 0) return;
  OPEN_TABS.splice(index, 1);
  const frame = FRAMES.get(slug);
  if (frame) {
    frame.remove();
    FRAMES.delete(slug);
  }
  // The tab that was to its left takes the stage; the last one falls back to the
  // overview, which is always there.
  if (ACTIVE === slug) ACTIVE = OPEN_TABS[index - 1] || OVERVIEW;
  if (ACTIVE !== OVERVIEW) frameFor(ACTIVE);
  showPane();
}

async function loadBlueprints() {
  const res = await fetch("/config/blueprints");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(body?.error || `HTTP ${res.status}`));
  BLUEPRINTS = Array.isArray(body.blueprints) ? body.blueprints : [];
  return BLUEPRINTS;
}

// ---------- projects ----------
//
// A project is one blueprints folder. Several are imported and each one keeps
// running; this corner only decides which is in front. Two rules hold it together:
// importing starts a project, removing it stops it, and switching the front starts
// and stops nothing.

const projectsEl = document.getElementById("projects-wrap");
const projectsToggleEl = document.getElementById("projects-toggle");
const projectsNameEl = document.getElementById("projects-name");
const projectsMenuEl = document.getElementById("projects-menu");

let PROJECTS = Array.isArray(RUNTIME.projects) ? RUNTIME.projects.slice() : [];
let FOREGROUND = RUNTIME.foreground || "";

// askFolder is the one dialog both paths use: the blocking one on a fresh install,
// and "add folder…" from the menu. It answers the chosen path, or "" when the user
// gives up (only possible in the non-blocking case).
function askFolder({ heading, hint, cancellable, placeholder = "~/blueprints" }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;" +
      "background:rgba(0,0,0,.42);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)";
    overlay.innerHTML = `
      <form style="background:var(--panel,#fff);color:var(--text,#222);border-radius:12px;
        box-shadow:0 12px 40px rgba(0,0,0,.28);padding:26px 28px;width:min(460px,90vw);
        font:14px/1.6 -apple-system,system-ui,sans-serif">
        <h2 style="margin:0 0 6px;font-size:16px;font-weight:600">${heading}</h2>
        <p style="margin:0 0 16px;color:#777;font-size:13px">${hint}</p>
        <input name="path" autofocus spellcheck="false" placeholder="${placeholder}"
          style="width:100%;box-sizing:border-box;font:13px ui-monospace,SFMono-Regular,Menlo,monospace;
          padding:9px 11px;border-radius:8px;border:1px solid #ccc;background:#fff;color:#222">
        <div style="display:flex;align-items:center;gap:12px;margin-top:14px">
          <button type="submit" style="font:inherit;padding:7px 16px;border-radius:8px;
            border:1px solid #ccc;background:#fafafa;cursor:pointer">use this folder</button>
          ${cancellable ? '<button type="button" data-role="cancel" style="font:inherit;padding:7px 12px;border-radius:8px;border:none;background:none;color:#777;cursor:pointer">cancel</button>' : ""}
          <span data-role="error" style="color:#b00;font-size:13px"></span>
        </div>
      </form>`;
    document.body.append(overlay);
    const form = overlay.querySelector("form");
    const input = overlay.querySelector("input");
    const errorEl = overlay.querySelector('[data-role="error"]');
    const done = (value) => { overlay.remove(); resolve(value); };

    if (cancellable) overlay.querySelector('[data-role="cancel"]').addEventListener("click", () => done(""));

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorEl.textContent = "";
      const button = form.querySelector("button");
      button.disabled = true;
      const path = input.value;
      try {
        if (/^\s*$/.test(path)) throw new Error("a folder path is required");
        if (!/^\/|^~\//.test(path.trim())) throw new Error(`the folder must be an absolute path, got "${path.trim()}"`);
        if (!overlay.isConnected) return;
        done(path.trim());
      } catch (err) {
        button.disabled = false;
        errorEl.textContent = String(err?.message || err);
        input.focus();
      }
    });
    input.focus();
  });
}

async function addProject(path) {
  const res = await fetch("/config/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

async function loadProjects() {
  const res = await fetch("/config/projects");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  PROJECTS = Array.isArray(body.projects) ? body.projects : [];
  FOREGROUND = body.foreground || "";
  return PROJECTS;
}

function drawProjects() {
  const current = PROJECTS.find((p) => p.id === FOREGROUND);
  projectsNameEl.textContent = current ? current.id : "projects";
  projectsToggleEl.title = current ? `front project: ${current.id} — ${current.path}` : "projects";

  projectsMenuEl.textContent = "";
  for (const p of PROJECTS) {
    const row = document.createElement("div");
    row.className = "project-row" + (p.id === FOREGROUND ? " active" : "");
    row.title = p.path;
    row.innerHTML = '<span class="project-id"></span><span class="project-check" aria-hidden="true">✓</span>';
    row.querySelector(".project-id").textContent = p.id;
    row.addEventListener("click", async () => {
      hideProjects();
      if (p.id === FOREGROUND) return;
      await fetch("/config/projects/foreground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id }),
      }).catch(() => {});
      // The tabs belong to the folder in front: the frames go with the old one,
      // and the new one's are read back from the browser.
      dropFrames();
      await loadProjects().catch(() => {});
      drawProjects();
      await loadBlueprints().catch(() => { BLUEPRINTS = []; });
      restoreTabs();
      await showPane();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "project-remove";
    remove.textContent = "×";
    remove.title = `remove ${p.id} — stops it; its folder and data stay`;
    remove.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!confirm(`remove the project ${p.id}?\n\nIt stops running. The folder ${p.path} and its databases stay where they are.`)) return;
      await fetch(`/config/projects?id=${encodeURIComponent(p.id)}`, { method: "DELETE" }).catch(() => {});
      await loadProjects().catch(() => {});
      drawProjects();
      if (!PROJECTS.length) location.reload();
    });
    row.append(remove);
    projectsMenuEl.append(row);
  }

  if (PROJECTS.length) {
    const sep = document.createElement("div");
    sep.className = "project-sep";
    projectsMenuEl.append(sep);
  }
  const add = document.createElement("div");
  add.className = "project-add";
  add.textContent = "add folder…";
  add.addEventListener("click", async () => {
    hideProjects();
    const path = await askFolder({
      heading: "add a blueprints folder",
      hint: "Every imported folder keeps running. Switching the front only changes which one the strip above lists. It is created if it does not exist yet.",
      cancellable: true,
    });
    if (!path) return;
    try {
      await addProject(path);
    } catch (err) {
      alert(String(err?.message || err));
      return;
    }
    location.reload();
  });
  projectsMenuEl.append(add);
}

function hideProjects() {
  projectsMenuEl.hidden = true;
  projectsToggleEl.classList.remove("active");
  projectsToggleEl.setAttribute("aria-expanded", "false");
}

projectsToggleEl.addEventListener("click", (event) => {
  event.stopPropagation();
  if (projectsMenuEl.hidden) {
    drawProjects();
    projectsMenuEl.hidden = false;
    projectsToggleEl.classList.add("active");
    projectsToggleEl.setAttribute("aria-expanded", "true");
  } else {
    hideProjects();
  }
});

window.addEventListener("click", (event) => {
  if (projectsMenuEl.hidden) return;
  if (!projectsEl.contains(event.target)) hideProjects();
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || projectsMenuEl.hidden) return;
  event.stopPropagation();
  hideProjects();
});

drawProjects();

// A fresh install has no project, and then nothing else happens: there is no
// default (a guessed folder would import someone's files from a place they never
// picked) and no launcher flag (a folder a script chose is not a choice).
if (!PROJECTS.length) {
  const path = await askFolder({
    heading: "where do your blueprints live?",
    hint: "One blueprints folder to start with. It is created if it does not exist yet, and more folders can be added later from the corner.",
    cancellable: false,
  });
  try {
    await addProject(path);
  } catch (err) {
    projectsMenuEl.innerHTML = "";
    alert(String(err?.message || err));
  }
  // A reload is what makes the rest of the shell see the project: /config.js is
  // read once, at the top of this module.
  location.reload();
}

// The tabs this folder had open, with Overview in front of an empty folder — not
// an error, just a list with nothing in it until blueprints are put there.
try {
  await loadBlueprints();
  restoreTabs();
  await showPane();
} catch (err) {
  panesEl.innerHTML = `<div class="empty-hint">engineer web: ${String(err?.message || err)}</div>`;
}

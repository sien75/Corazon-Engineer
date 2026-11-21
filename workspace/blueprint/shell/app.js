import yaml from "./vendor/js-yaml.js";

// Runtime addresses are injected by serve-web and served as an ES module. There is
// no fallback: guessing a port would point the page at whatever happens to be
// listening there.
import { ENGINEER as RUNTIME } from "/config.js";
if (!RUNTIME?.ai || !RUNTIME?.storage || !RUNTIME?.cwd) {
  const message = "engineer web: /config.js did not provide ai / storage / cwd";
  document.body.innerHTML = `<div class="empty-hint">${message}</div>`;
  throw new Error(message);
}
// storage is one service behind two prefixes: /log/* for records and sessions,
// /static/* for a folder's files.
const STORAGE_BASE = RUNTIME.storage;
const AI_BASE = RUNTIME.ai; // the conversation
// The folder this conversation's agent works in. The shell names it; the agent
// learns nothing else about the world from ai.
const CWD = RUNTIME.cwd;

const panesEl = document.getElementById("panes");
const themeToggleEl = document.getElementById("theme-toggle");
const themeMenuEl = document.getElementById("theme-menu");

const THEME_ORDER = ["light", "warm", "cold", "dark", "slate"];
const THEME_KEY = "engineer.theme";

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

// ---------- the one conversation ----------
//
// Which conversation the page draws comes from storage: the most recently active
// session, or — when there is none — a new one, created here with the folder the
// shell was told to work in. A session row exists before the first word is said,
// so a reload finds the same conversation instead of starting a second one.

async function storagePost(path, body) {
  const res = await fetch(`${STORAGE_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: yaml.dump(body),
  });
  return { ok: res.ok, status: res.status, data: yaml.load(await res.text()) || {} };
}

// newestSession is the conversation to draw: the first entry of the list, which
// storage orders by last activity.
async function newestSession() {
  const { ok, data } = await storagePost("/log/session/list", { pageNum: 1 });
  if (!ok) throw new Error(`log/session/list → HTTP ${data?.error?.message || "failed"}`);
  const first = Array.isArray(data.sessions) ? data.sessions[0] : undefined;
  return first ? String(first.sessionId ?? "") : "";
}

async function createSession() {
  const res = await fetch(`${AI_BASE}/ai/new`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: yaml.dump({ cwd: CWD }),
  });
  const data = yaml.load(await res.text()) || {};
  if (!res.ok) throw new Error(data?.error?.message || `ai/new → HTTP ${res.status}`);
  const id = String(data.sessionId ?? "");
  if (!id) throw new Error("ai/new returned no sessionId");
  return id;
}

// mount draws the conversation for one session. The element resumes it itself
// (ai) and replays its messages (storage), so the shell only says which one.
function mount(sessionId) {
  panesEl.textContent = "";
  const chat = document.createElement("engineer-chat");
  chat.setAttribute("session", sessionId);
  chat.setAttribute("autofocus", "");
  panesEl.append(chat);
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
function askFolder({ heading, hint, cancellable }) {
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
        <input name="path" autofocus spellcheck="false" placeholder="~/blueprints"
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
      await loadProjects().catch(() => {});
      drawProjects();
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
      hint: "Every imported folder keeps running. Switching the front only changes which one the launcher and /bp show. It is created if it does not exist yet.",
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
    hint: "One blueprints folder to start with. Blueprints are not part of a project, so this is the only place they come from — put it under git if you like. It is created if it does not exist yet. More folders can be added later from the corner.",
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

try {
  const sessionId = (await newestSession()) || (await createSession());
  mount(sessionId);
} catch (err) {
  panesEl.innerHTML = `<div class="empty-hint">engineer web: ${String(err?.message || err)}</div>`;
}
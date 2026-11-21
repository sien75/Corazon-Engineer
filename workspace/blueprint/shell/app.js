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

try {
  const sessionId = (await newestSession()) || (await createSession());
  mount(sessionId);
} catch (err) {
  panesEl.innerHTML = `<div class="empty-hint">engineer web: ${String(err?.message || err)}</div>`;
}
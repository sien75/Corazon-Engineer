import { Graph, CanvasBlock } from "./vendor/graph.js";
import yaml from "./vendor/js-yaml.js";
import MarkdownIt from "./vendor/markdown-it.js";
import DOMPurify from "./vendor/dompurify.js";
import hljs from "./vendor/highlight.js";

// Runtime addresses are injected by serve-web and served as /config.js. There is
// no fallback: guessing a port would point the page at whatever happens to be
// listening there. Without the config the page cannot reach any service, so say
// so rather than pretending to work.
const RUNTIME = window.ENGINEER;
if (!RUNTIME?.static || !RUNTIME?.ai || !RUNTIME?.log) {
  const message = "engineer web: /config.js did not provide static / ai / log";
  document.body.innerHTML = `<div class="empty-hint">${message}</div>`;
  throw new Error(message);
}
const STATIC_BASE = RUNTIME.static; // static: schema
const AI_BASE = RUNTIME.ai;         // ai: conversation
const LOG_BASE = RUNTIME.log;       // log: records

const panelEl = document.getElementById("panel");
const panelTitleEl = document.getElementById("panel-title");
const panelBodyEl = document.getElementById("panel-body");

const BLOCK_WIDTH = 300;
const PAD = 14;
const LINE = 18;

const schema = { atoms: new Map(), edges: new Map() };
let graph = null;
let lastData = null;
let currentView = "graph";

class AtomBlock extends CanvasBlock {
  renderDetailedView(ctx) {
    this.renderBody(ctx);
    const atom = this.state.meta.atom;
    const x = this.state.x + PAD;
    let y = this.state.y + PAD;
    const maxWidth = this.state.width - PAD * 2;
    const colors = this.context.colors;

    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    ctx.fillStyle = colors.block.text;
    ctx.font = `bold ${15 * this.context.graph.rootStore.settings.$settings.value.scaleFontSize}px sans-serif`;
    ctx.fillText(atom.name, x, y, maxWidth);
    y += LINE + 4;

    ctx.font = "11px sans-serif";
    ctx.fillStyle = colors.block.text;
    ctx.globalAlpha = 0.6;
    ctx.fillText(metaLine(atom), x, y, maxWidth);
    ctx.globalAlpha = 1;
    y += LINE;

    ctx.font = "12px sans-serif";
    ctx.fillText(truncate(atom.description || "", 60), x, y, maxWidth);
    y += LINE + 6;

    for (const line of interfaceLines(atom)) {
      ctx.font = line.header ? "bold 11px sans-serif" : "11px sans-serif";
      ctx.fillStyle = line.header ? colors.block.text : colors.connectionLabel.text;
      ctx.globalAlpha = line.header ? 0.8 : 0.9;
      ctx.fillText(line.text, x, y, maxWidth);
      ctx.globalAlpha = 1;
      y += LINE;
    }
  }
}

function metaLine(atom) {
  return [atom.role, atom.runtime_type, atom.runtime_version].filter(Boolean).join(" · ");
}

function truncate(text, max) {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function interfaceLines(atom) {
  const lines = [];
  const provides = atom.interfaces?.provides || [];
  const consumes = atom.interfaces?.consumes || [];
  if (provides.length) {
    lines.push({ header: true, text: `provides (${provides.length})` });
    for (const i of provides.slice(0, 5)) lines.push({ text: `· ${i.id} [${i.protocol}]` });
    if (provides.length > 5) lines.push({ text: `· … +${provides.length - 5}` });
  }
  if (consumes.length) {
    lines.push({ header: true, text: `consumes (${consumes.length})` });
    for (const i of consumes.slice(0, 5)) lines.push({ text: `· ${i.id} [${i.protocol}]` });
    if (consumes.length > 5) lines.push({ text: `· … +${consumes.length - 5}` });
  }
  return lines;
}

function blockHeight(atom) {
  return PAD * 2 + LINE * (3 + interfaceLines(atom).length) + 10;
}

function layout(atoms, edges) {
  const layer = new Map();
  const incoming = new Map(atoms.map((a) => [a.name, 0]));
  for (const e of edges) {
    if (incoming.has(e.to)) incoming.set(e.to, incoming.get(e.to) + 1);
  }
  const queue = atoms.filter((a) => incoming.get(a.name) === 0).map((a) => a.name);
  for (const name of queue) layer.set(name, 0);
  const guard = atoms.length * 4;
  let steps = 0;
  while (queue.length && steps < guard) {
    steps++;
    const from = queue.shift();
    for (const e of edges) {
      if (e.from !== from || !incoming.has(e.to)) continue;
      const next = (layer.get(from) || 0) + 1;
      if (next > (layer.get(e.to) ?? -1)) {
        layer.set(e.to, next);
        queue.push(e.to);
      }
    }
  }
  for (const a of atoms) if (!layer.has(a.name)) layer.set(a.name, 0);

  const columns = new Map();
  for (const a of atoms) {
    const l = layer.get(a.name);
    if (!columns.has(l)) columns.set(l, []);
    columns.get(l).push(a);
  }
  const positions = new Map();
  for (const [l, column] of columns) {
    let y = 0;
    for (const a of column) {
      positions.set(a.name, { x: l * (BLOCK_WIDTH + 120), y });
      y += blockHeight(a) + 48;
    }
  }
  return positions;
}

function toBlocks(atoms, edges) {
  const positions = layout(atoms, edges);
  return atoms.map((a) => ({
    id: a.name,
    is: "AtomBlock",
    name: a.name,
    x: positions.get(a.name).x,
    y: positions.get(a.name).y,
    width: BLOCK_WIDTH,
    height: blockHeight(a),
    meta: { atom: a },
  }));
}

function toConnections(edges) {
  return edges.map((e) => ({
    id: e.id,
    sourceBlockId: e.from,
    targetBlockId: e.to,
    label: e.protocol,
  }));
}

// static speaks yaml on the wire (application/yaml)
async function staticCall(path, body) {
  const res = await fetch(`${STATIC_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: yaml.dump(body ?? {}),
  });
  const data = yaml.load(await res.text());
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}

async function loadSchema() {
  return staticCall("/static/query");
}

// subscribe to static schema-change stream; reload schema on mutation events
// events are yaml docs, one "data:" line per yaml line (SSE multi-line data)
function subscribeSchemaStream() {
  fetch(`${STATIC_BASE}/static/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: yaml.dump({ kinds: "schema" }),
  })
    .then(async (res) => {
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop();
        for (const frame of frames) {
          const lines = [];
          for (const line of frame.split("\n")) {
            if (line.startsWith("data:")) lines.push(line.slice(5).replace(/^ /, ""));
          }
          if (!lines.length) continue;
          let ev;
          try {
            ev = yaml.load(lines.join("\n"));
          } catch {
            continue;
          }
          if (ev?.kind === "schema") refresh();
        }
      }
    })
    .catch(() => {});
}

async function refresh() {
  try {
    const data = await loadSchema();
    lastData = data;
    schema.atoms = new Map((data.atoms || []).map((a) => [a.name, a]));
    schema.edges = new Map((data.edges || []).map((e) => [e.id, e]));
    const blocks = toBlocks(data.atoms || [], data.edges || []);
    const connections = toConnections(data.edges || []);
    if (!graph) {
      graph = createGraph(blocks, connections);
      bindGraphEvents();
      graph.runAfterGraphReady(() => {
        graph.zoomTo(blocks.map((b) => b.id));
        if (graph.cameraService.getCameraScale() > 1) graph.zoom({ scale: 1 });
      });
    } else {
      graph.setEntities({ blocks, connections });
    }
    showView(parseRoute());
  } catch (err) {
    contentEl.hidden = false;
    graphEl.hidden = true;
    contentEl.innerHTML = `<div class="empty-hint">load failed: ${escapeHtml(err.message)} (is static running on ${STATIC_BASE}?)</div>`;
  }
}

function createGraph(blocks, connections) {
  const g = new Graph(
    {
      configurationName: "engineer",
      blocks,
      connections,
      settings: {
        canDragCamera: true,
        canZoomCamera: true,
        canCreateNewConnections: false,
        useBlocksAnchors: false,
        showConnectionArrows: true,
        showConnectionLabels: true,
        useBezierConnections: true,
        bezierConnectionDirection: "horizontal",
        blockComponents: { AtomBlock },
      },
    },
    document.getElementById("graph"),
  );
  g.setColors(GRAPH_THEMES[currentTheme()]);
  g.setConstants({ camera: { WHEEL_INPUT_DEVICE: "trackpad" } });
  g.start();
  g.cameraService.set({ scaleMax: 2 });
  bindCameraClamp(g);
  window.__graph = g;
  return g;
}

const PAN_MARGIN = 100;

function bindCameraClamp(g) {
  g.on("camera-change", (event) => {
    const d = event.detail;
    const blocks = g.rootStore.blocksList.$blocks.value;
    if (!blocks.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const b of blocks) {
      const geo = b.$geometry.value;
      minX = Math.min(minX, geo.x);
      minY = Math.min(minY, geo.y);
      maxX = Math.max(maxX, geo.x + geo.width);
      maxY = Math.max(maxY, geo.y + geo.height);
    }
    const s = d.scale;
    let nx = d.x;
    let ny = d.y;
    const loX = PAN_MARGIN - maxX * s;
    const hiX = d.width - PAN_MARGIN - minX * s;
    if (loX <= hiX) nx = Math.min(Math.max(nx, loX), hiX);
    const loY = PAN_MARGIN - maxY * s;
    const hiY = d.height - PAN_MARGIN - minY * s;
    if (loY <= hiY) ny = Math.min(Math.max(ny, loY), hiY);
    if (nx !== d.x || ny !== d.y) {
      event.preventDefault();
      g.cameraService.set({ x: nx, y: ny });
    }
  });
}

const THEME_ORDER = ["light", "dark", "solarized"];
const THEME_KEY = "engineer.theme";

const GRAPH_THEMES = {
  light: {
    canvas: { layerBackground: "#ffffff", belowLayerBackground: "#ffffff", dots: "#e3e6ea", border: "#ffffff" },
    block: { background: "#f6f7f9", border: "#d0d7de", text: "#1f2328", selectedBorder: "#0969da" },
    connection: { background: "#8c959f", selectedBackground: "#0969da" },
    connectionLabel: { background: "#f6f7f9", text: "#57606a", selectedBackground: "#0969da", selectedText: "#ffffff" },
    selection: { background: "rgba(9, 105, 218, 0.1)", border: "#0969da" },
  },
  dark: {
    canvas: { layerBackground: "#141416", belowLayerBackground: "#141416", dots: "#2a2a2e", border: "#141416" },
    block: { background: "#1c1c20", border: "#3f3f46", text: "#e4e4e7", selectedBorder: "#7dd3fc" },
    connection: { background: "#a1a1aa", selectedBackground: "#7dd3fc" },
    connectionLabel: { background: "#1c1c20", text: "#a1a1aa", selectedBackground: "#7dd3fc", selectedText: "#141416" },
    selection: { background: "rgba(125, 211, 252, 0.1)", border: "#7dd3fc" },
  },
  solarized: {
    canvas: { layerBackground: "#fdf6e3", belowLayerBackground: "#fdf6e3", dots: "#ddd6c1", border: "#fdf6e3" },
    block: { background: "#eee8d5", border: "#c9c2ab", text: "#073642", selectedBorder: "#268bd2" },
    connection: { background: "#93a1a1", selectedBackground: "#268bd2" },
    connectionLabel: { background: "#eee8d5", text: "#586e75", selectedBackground: "#268bd2", selectedText: "#fdf6e3" },
    selection: { background: "rgba(38, 139, 210, 0.1)", border: "#268bd2" },
  },
};

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
  if (graph) graph.setColors(GRAPH_THEMES[name]);
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

function bindGraphEvents() {
  graph.on("click", (event) => {
    const target = event.detail.target;
    if (!target) {
      hidePanel();
      return;
    }
    const state = target.connectedState;
    if (!state || state.id === undefined) {
      hidePanel();
      return;
    }
    if (target.isBlock && schema.atoms.has(state.id)) {
      showAtomPanel(schema.atoms.get(state.id));
    } else if (schema.edges.has(state.id)) {
      showEdgePanel(schema.edges.get(state.id));
    }
  });
}

function kv(k, v) {
  if (v === undefined || v === null || v === "") return "";
  return `<div class="kv"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(String(v))}</span></div>`;
}

function ifaceHtml(i) {
  const extra = [
    i.contract ? `contract: ${i.contract}` : "",
    i.extend ? `extend:\n${yaml.dump(i.extend).trimEnd()}` : "",
  ].filter(Boolean).join("\n");
  return `<div class="iface">
    <div><span class="iface-id">${escapeHtml(i.id)}</span> <span class="tag">${escapeHtml(i.channel)}</span><span class="tag">${escapeHtml(i.protocol)}</span></div>
    ${extra ? `<div class="iface-extra">${escapeHtml(extra)}</div>` : ""}
  </div>`;
}

function showAtomPanel(atom) {
  const provides = atom.interfaces?.provides || [];
  const consumes = atom.interfaces?.consumes || [];
  panelTitleEl.textContent = `atom: ${atom.name}`;
  panelBodyEl.innerHTML = [
    kv("description", atom.description),
    kv("role", atom.role),
    kv("runtime", metaLine(atom)),
    kv("repo", atom.repo),
    kv("path", atom.path),
    `<div class="section"><h3>provides (${provides.length})</h3>${provides.map(ifaceHtml).join("") || "—"}</div>`,
    `<div class="section"><h3>consumes (${consumes.length})</h3>${consumes.map(ifaceHtml).join("") || "—"}</div>`,
  ].join("");
  panelEl.hidden = false;
}

function showEdgePanel(edge) {
  panelTitleEl.textContent = `edge: ${edge.id}`;
  panelBodyEl.innerHTML = [
    kv("description", edge.description),
    kv("from", `${edge.from} → ${edge.from_interface}`),
    kv("to", `${edge.to} → ${edge.to_interface}`),
    kv("channel", edge.channel),
    kv("protocol", edge.protocol),
  ].join("");
  panelEl.hidden = false;
}

function hidePanel() {
  panelEl.hidden = true;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

document.getElementById("panel-close").addEventListener("click", hidePanel);

// ---------- section views & routing ----------

const contentEl = document.getElementById("content");
const graphEl = document.getElementById("graph");
const SECTIONS = ["how-to", "development", "contracts", "docs", "notes"];
const SECTION_DETAIL_TYPE = {
  "how-to": "how-to",
  contracts: "contract",
  development: "development",
  docs: "docs",
  notes: "notes",
};

// The route table: `/` graph, `/new[/skills|/blueprints]` the launcher,
// `/chat/<sessionId>` the tab holding that conversation, `/pages/<id>` the tab
// rendering that blueprint, `/<section>[/<id>]` a fixed view. Anything else
// falls back to the graph. The web server already answers an unknown path with
// index.html, so a chat or page URL survives a reload and can be shared.
const CHAT_PREFIX = "chat";
const PAGES_PREFIX = "pages";
const NEW_TAB_PATH = "/new";
const NEW_TAB_SUBS = ["skills", "blueprints"];

function parseRoute() {
  const parts = location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return { view: "graph" };
  const [section, ...rest] = parts;
  if (section === CHAT_PREFIX && rest.length) return { view: "chat", sessionId: rest.join("/") };
  if (section === PAGES_PREFIX && rest.length) return { view: "page", pageId: rest.join("/") };
  if (section === "new") {
    if (!rest.length) return { view: "newtab" };
    if (rest.length === 1 && NEW_TAB_SUBS.includes(rest[0])) {
      return { view: "newtab", sub: rest[0] };
    }
    return { view: "newtab" };
  }
  if (!SECTIONS.includes(section)) return { view: "graph" };
  if (!rest.length) return { view: section };
  return { view: section, id: `${section}/${rest.join("/")}` };
}

// navigate writes a path and renders it. "push" is an explicit move to a view
// (a tab click, a link); "replace" rewrites the current entry when the view
// changes in place — a tab closing onto its neighbour, /new replacing an
// instance, Esc leaving the new tab page.
function navigate(path, mode = "push") {
  if (mode === "replace") history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  route();
}

function entryHref(id) {
  return "/" + id.split("/").map(encodeURIComponent).join("/");
}

function route() {
  const r = parseRoute();
  // A conversation, a page and the launcher own the layout themselves;
  // currentView (the fixed view to fall back to) stays as it was.
  if (r.view === "chat") {
    routeChat(r.sessionId);
    return;
  }
  if (r.view === "page") {
    routePage(r.pageId);
    return;
  }
  if (r.view === "newtab") {
    openNewTab({ push: false, sub: r.sub || "home" });
    return;
  }
  currentView = r.view;
  // A fixed view leaves tab mode and the new tab page; the conversation's
  // session stays in its tab, so the user can come back to it.
  activeTabId = null;
  newTabOpen = false;
  applyLayout();
  syncTabActive();
  showView(r);
}

// showView renders one fixed view into the left area. It is separate from
// route() because a data refresh re-renders the view without touching which tab
// is active — a schema push must not kick the user out of a conversation tab.
function showView(r) {
  hidePanel();
  if (r.view === "chat" || r.view === "newtab" || r.view === "page") return;
  if (r.view === "graph") {
    contentEl.hidden = true;
    graphEl.hidden = false;
    graph?.updateSize();
  } else {
    graphEl.hidden = true;
    contentEl.hidden = false;
    if (r.id) {
      renderDetail(r.view, r.id);
    } else {
      renderList(r.view);
    }
  }
}

async function fetchDetail(type, id) {
  return staticCall("/static/query-detail", { type, id });
}

function renderList(view) {
  const paths = lastData?.[view] || [];
  if (!paths.length) {
    contentEl.innerHTML = `<div class="empty-hint">${lastData ? `no entries in ${view}/` : "loading…"}</div>`;
    return;
  }
  contentEl.innerHTML = paths
    .map((p) => `<a class="entry-link" href="${entryHref(p)}" data-path="${escapeHtml(p)}">${escapeHtml(p)}</a>`)
    .join("");
}

async function renderDetail(view, id) {
  const type = SECTION_DETAIL_TYPE[view];
  contentEl.innerHTML = `
    <div class="detail-head">
      <a class="back-link" href="/${view}">← ${view}</a>
      <span class="entry-title">${escapeHtml(id)}</span>
    </div>
    <div class="entry"><pre>loading…</pre></div>`;
  const pre = contentEl.querySelector("pre");
  try {
    const data = await fetchDetail(type, id);
    const body = data[type];
    pre.textContent = typeof body === "string" ? body : yaml.dump(body);
  } catch (err) {
    pre.textContent = `load failed: ${err.message}`;
  }
}

// Tab clicks: a fixed view navigates, a tab shows its conversation, and a tab's
// × closes it (fixed views have no ×).
document.getElementById("tabs").addEventListener("click", (event) => {
  const close = event.target.closest(".tab-close");
  if (close) {
    event.stopPropagation();
    closeTab(close.dataset.close);
    return;
  }
  const tab = event.target.closest(".tab[data-tab-id]");
  if (tab) {
    activateTab(tab.dataset.tabId);
    return;
  }
  const view = event.target.closest("button[data-view]");
  if (view) {
    navigate(view.dataset.view === "graph" ? "/" : `/${view.dataset.view}`);
  }
});

contentEl.addEventListener("click", (event) => {
  const link = event.target.closest("a");
  if (!link) return;
  event.preventDefault();
  navigate(link.getAttribute("href"));
});

// ---------- ai panel ----------

const themeToggleEl = document.getElementById("theme-toggle");
const themeMenuEl = document.getElementById("theme-menu");
// The input grows with its content — soft-wrapped lines included — from the
// 2-row minimum (the rows attribute) up to this many rendered lines, then it
// scrolls inside. The pixel ceiling is derived from the computed style, so
// changing font / line-height / this number needs no other edit.
const AI_INPUT_MAX_LINES = 10;
const leftEl = document.getElementById("left");
const panesEl = document.getElementById("panes");

// ---------- panes ----------
//
// A tab's content is a tree of panes, one content cell each (a conversation or a
// blueprint). A chat pane is the conversation view — message list above, its own
// composer below — built per pane, so every conversation on screen is one you
// can type into. Nothing about a conversation lives in the shell.
//
// `aiPane` is the pane the user is working in; the composer helpers read and
// write through it. `aiRenderPane` is the pane a stream or a replay is filling
// — the render helpers write there and fall back to `aiPane` for the composer's
// own echoes, which is what lets a background pane's stream land in its own list
// while another pane is on screen.
let aiRenderPane = null;
let aiPane = null; // the chat pane in use
let aiLastSend = null; // { pane, text } — retry for a failed send

const aiInputEl = () => aiPane?.inputEl;
const aiInputWrapEl = () => aiPane?.composerEl;
const aiSendEl = () => aiPane?.sendEl;
const aiStopEl = () => aiPane?.stopEl;
const aiCmdEl = () => aiPane?.cmdEl;
const aiMirrorEl = () => aiPane?.mirrorEl;

function aiMsgEl() {
  return (aiRenderPane ?? aiPane)?.messagesEl ?? null;
}

function aiScroll() {
  return (aiRenderPane ?? aiPane)?.scrollEl ?? null;
}

// ---------- the pane tree ----------
//
// tab.layout is the stored tree (see the layout tool); tab.panes holds the live
// pane objects by tree path, so a re-render of the same tree reuses them and a
// chat pane keeps its conversation. A layout change rebuilds the containers and
// moves the panes into them: their DOM keeps its state, but a page iframe is
// loaded again.

function defaultLayout(tab) {
  return tab.kind === "page"
    ? { pane: { content: "page", id: tab.pageId } }
    : { pane: { content: "chat", id: tab.sessionId } };
}

function tabLayout(tab) {
  return tab.layout || defaultLayout(tab);
}

// makeChatPane builds one conversation: the message list, and *its own*
// composer under it. Every pane having a composer is the point — a conversation
// you cannot type into is not one you can have — and it is also what keeps the
// two panes from sharing state: the draft, the pasted images, the command
// drawer and the prompt history all belong to the pane.
function makeChatPane(key, contentId) {
  const el = document.createElement("div");
  el.className = "pane pane-chat";
  const scrollEl = document.createElement("div");
  scrollEl.className = "pane-scroll";
  const messagesEl = document.createElement("div");
  messagesEl.className = "pane-messages ai-messages";
  scrollEl.appendChild(messagesEl);

  const composerEl = document.createElement("div");
  composerEl.className = "ai-input";
  composerEl.innerHTML =
    '<div class="ai-cmd" tabindex="-1" hidden></div>' +
    '<textarea class="ai-input-field" rows="2" ' +
    'placeholder="ask… (Enter send, Shift+Enter newline; paste image)" ' +
    'autocomplete="off"></textarea>' +
    '<button type="button" class="ai-stop" hidden>stop</button>' +
    '<button type="button" class="ai-send">send</button>';

  const mirrorEl = document.createElement("div");
  mirrorEl.className = "ai-input-mirror";
  composerEl.appendChild(mirrorEl);

  el.appendChild(scrollEl);
  el.appendChild(composerEl);

  const pane = {
    key,
    kind: "chat",
    contentId,
    el,
    scrollEl,
    messagesEl,
    composerEl,
    inputEl: composerEl.querySelector(".ai-input-field"),
    cmdEl: composerEl.querySelector(".ai-cmd"),
    sendEl: composerEl.querySelector(".ai-send"),
    stopEl: composerEl.querySelector(".ai-stop"),
    mirrorEl,
    // Per pane, because they are the state of *this* input.
    images: [],
    tasks: [],
    drawer: null,
    confirm: null,
    session: contentId,
    seenSeq: 0,
    streamCtl: null,
    streamGen: 0,
    streaming: false,
  };
  bindComposer(pane);
  return pane;
}

// bindComposer wires one pane's composer. The handlers close over the pane, so
// they act on the conversation they belong to however many are on screen.
function bindComposer(pane) {
  const input = pane.inputEl;
  // Working anywhere in a pane — its list or its composer — makes it the pane
  // the shell is on. That is what moves the plain ids (#ai-input-field and
  // friends) to this pane, so a later bare selector hits *this* conversation.
  const claim = () => {
    const tab = openTabs.find((t) => t.panes?.get(pane.key) === pane);
    if (tab) focusPane(tab, pane.key);
    else aiPane = pane;
  };
  composerOn(input, "mousedown", claim);
  composerOn(input, "focus", claim);
  composerOn(input, "input", claim);
  composerOn(input, "keydown", claim);
  composerOn(pane.el, "mousedown", claim);
  composerOn(pane.composerEl, "mousedown", claim);

  composerOn(pane.sendEl, "click", (e) => { claim(); aiSend(e); });
  composerOn(pane.stopEl, "click", (e) => { claim(); aiStop(e); });
  composerOn(input, "input", () => { claim(); aiSyncCommandDrawer(); });
  composerOn(input, "input", () => { claim(); aiResizeInput(); });
  // Typing during history browsing leaves it, keeping what was typed.
  composerOn(input, "input", () => { claim(); aiHistoryEnd(pane.session); });
  composerOn(input, "paste", aiPaste);
  composerOn(input, "keyup", aiSnapCaretOutOfToken);
  composerOn(input, "click", aiSnapCaretOutOfToken);
  composerOn(input, "select", aiSnapCaretOutOfToken);
  composerOn(input, "beforeinput", aiBeforeInput);
  composerOn(input, "cut", aiCutImageToken);
  composerOn(input, "keydown", aiInputKeydown);
  composerOn(pane.cmdEl, "compositionstart", () => { pane.composing = true; });
  composerOn(pane.cmdEl, "compositionend", () => { pane.composing = false; });
  composerOn(pane.cmdEl, "keydown", (event) => aiCmdKeydown(pane, event));
}

// composerOn is addEventListener with the handler bound to the pane, so every
// composer handler runs with `aiPane` already pointing at its own pane.
function composerOn(el, type, handler) {
  el.addEventListener(type, handler);
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
  frameEl.src = pageFrameSrc(contentId);
  el.appendChild(frameEl);
  return { key, kind: "page", contentId, el, frameEl };
}

// ensurePane returns the pane for one leaf, reusing the live one when the path
// and the content are unchanged.
function ensurePane(tab, key, content, contentId) {
  const existing = tab.panes.get(key);
  if (existing && existing.kind === content && existing.contentId === contentId) {
    return existing;
  }
  // One iframe per page pane: unlike the old single page tab, a pane showing
  // another blueprint is a different document, not the same one re-pointed.
  const pane = content === "page" ? makePagePane(key, contentId) : makeChatPane(key, contentId);
  tab.panes.set(key, pane);
  return pane;
}

// Pane ids carry no meaning beyond the tree: a pane is defined by its content
// and its place in the layout.
function splitEl(dir, weight) {
  const el = document.createElement("div");
  el.className = `pane-split ${dir}`;
  el.style.setProperty("--w", String(weight || 1));
  return el;
}

function buildPaneNode(tab, node, path) {
  if (node.pane) {
    const key = path.join(".");
    const pane = ensurePane(tab, key, node.pane.content, node.pane.id);
    pane.el.classList.toggle("brief", node.pane.size === "brief");
    return pane.el;
  }
  const el = splitEl(node.split, node.weight);
  node.children.forEach((child, i) => {
    el.appendChild(buildPaneNode(tab, child, [...path, String(i)]));
  });
  return el;
}

// renderPanes builds (or rebuilds) a tab's content area from its layout, and
// loads every chat pane that has nothing in it yet. A chat pane without a
// session of its own was just created by a layout change, so it starts a fresh
// one.
function renderPanes(tab) {
  const tree = document.createElement("div");
  tree.className = "pane-tree";
  tree.appendChild(buildPaneNode(tab, tabLayout(tab), []));
  tab.paneEl = tree;
  void loadPaneConversations(tab);
}

async function loadPaneConversations(tab) {
  // Captured before the first await: activateTab clears `fresh` as soon as the
  // panes exist, and this walk must still know the tab was just created.
  const fresh = !!tab.fresh;
  for (const pane of tab.panes.values()) {
    if (pane.kind !== "chat" || pane.loaded) continue;
    pane.loaded = true;
    try {
      if (!pane.session && tab.tabId) {
        pane.session = await aiNewSession();
      }
      if (!pane.session) continue;
      // A session this tab has just created has nothing recorded behind it:
      // asking the server to replay it would only fetch an empty history (and,
      // for a skill, race the run the user is about to send). Its stream is
      // opened by activateTab.
      if (fresh && pane.session === tab.sessionId) continue;
      await aiLoadSession(pane, pane.session);
      if (pane === aiPane) aiScrollToBottom();
    } catch (err) {
      pane.messagesEl.innerHTML = "";
      aiRenderPane = pane;
      aiAppend("assistant", `[error] ${err.message}`);
      aiRenderPane = null;
    }
  }
}

// applyLayoutFrame is the frontend end of the layout tool: the tool stored this
// tree, so this tab shows it. It reads the tree out of the tool's *result* — the
// arguments the model sent are not what was stored (ids get filled in, and a
// rejected write stores nothing at all). Reading it back from the record is the
// other way in (see syncTabRecord / the launcher), and both go through
// applyPaneLayout so they cannot drift.
function applyLayoutFrame(pane, result) {
  const tab = openTabs.find((t) => t.panes?.get(pane.key) === pane);
  const layout = result?.details?.layout;
  if (tab && layout) applyPaneLayout(tab, layout);
}

// showPanes puts the active tab's tree on screen. Only one tab's tree is in the
// document at a time; switching tabs moves the other out whole.
function showPanes(tab) {
  if (!tab.paneEl) renderPanes(tab);
  panesEl.replaceChildren(tab.paneEl);
}

// focusPane points the composer at one chat pane. The focused pane's message
// list borrows the shell's ids so selectors and the composer keep working with
// more than one pane on screen.
// focusPane names the pane the user is working in. Every pane already has its
// own composer, so this moves nothing — it marks the current one (which is also
// the one that answers to the shell's plain ids) and puts the caret in it.
function focusPane(tab, key) {
  const pane = tab?.panes.get(key);
  const next = pane && pane.kind === "chat" ? pane : null;
  if (aiPane === next) return;
  aiPane = next;
  for (const p of tab?.panes.values() ?? []) {
    const on = p === aiPane;
    if (!p.messagesEl) continue;
    p.messagesEl.id = on ? "ai-messages" : "";
    p.scrollEl.id = on ? "ai-scroll" : "";
    p.composerEl.id = on ? "ai-input" : "";
    p.inputEl.id = on ? "ai-input-field" : "";
    p.cmdEl.id = on ? "ai-cmd" : "";
    p.sendEl.id = on ? "ai-send" : "";
    p.stopEl.id = on ? "ai-stop" : "";
    p.el.classList.toggle("focused", on);
  }
  if (aiPane) {
    aiSetStreaming(aiPane, aiPane.streaming);
    aiResizeInput();
    aiInputEl().focus();
  }
}

// applyPaneLayout is the one entry point for a layout change: the model's tool
// frame and the record read on opening a tab both come through here, so the two
// paths cannot drift.
function applyPaneLayout(tab, layout) {
  if (!layout || !layout.pane && !layout.split) return;
  tab.layout = layout;
  renderPanes(tab);
  if (activeTabId === tab.id) showPanes(tab);
  const first = primaryPane(layout);
  const key = first && first.content === "chat" ? paneKeyOf(tab, first.id) : "";
  if (activeTabId === tab.id) focusPane(tab, key);
}

// paneKeyOf finds the tree path of the first pane holding a given content id.
function paneKeyOf(tab, contentId) {
  for (const [key, p] of tab.panes) {
    if (p.contentId === contentId && p.kind === "chat") return key;
  }
  return "";
}

// The chat panel is no longer a side panel the user toggles: it is the content
// of a pane, and nothing else opens it.
// A dropped SSE connection reconnects with capped exponential backoff; the
// server replays only the events after the last seq this client rendered.
const AI_STREAM_MAX_RETRIES = 6;
const AI_STREAM_MAX_BACKOFF = 10000;
// Images pasted into the input live on the pane (see makeChatPane): they belong
// to the conversation being typed into, not to the shell.

// Stick to the bottom only while the user is already at the bottom; if they
// scrolled up to read history, new messages must not yank them back down.
// Callers capture aiAtBottom() *before* mutating the DOM, since appending
// content moves the bottom away and would otherwise read as "not at bottom".
const AI_STICK_THRESHOLD = 40;

function aiAtBottom() {
  return (
    aiScroll().scrollHeight - aiScroll().scrollTop - aiScroll().clientHeight <=
    AI_STICK_THRESHOLD
  );
}

// Same stick idea for an expanded collapse body: only auto-follow appended
// output when the reader is already at its bottom. Opening a block starts at
// the top (see aiCollapse), so a freshly opened block must not be yanked down.
function aiBodyAtBottom(el, threshold = 24) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

function aiScrollToBottom() {
  aiScroll().scrollTop = aiScroll().scrollHeight;
}

// Assistant replies render as markdown; user messages stay plain text. Raw
// HTML in model output is escaped (html:false) and the rendered result is
// sanitized once more with DOMPurify.
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      } catch {
        return "";
      }
    }
    return "";
  },
});

function renderMarkdown(src) {
  return DOMPurify.sanitize(md.render(src));
}

// aiMarkdown builds an assistant bubble that renders accumulated markdown
// incrementally, coalescing writes to one render per animation frame.
function aiMarkdown() {
  aiChipRowEnd(); // text is not a chip: it ends the run's chip row
  const div = document.createElement("div");
  div.className = "ai-msg ai-assistant ai-markdown";
  const stick = aiAtBottom();
  aiMsgEl().appendChild(div);
  if (stick) aiScrollToBottom();
  let raw = "";
  let scheduled = false;
  let rafId = 0;
  const render = () => {
    scheduled = false;
    // The markdown render is deferred to an animation frame, so it lands in the
    // DOM after the caller's append/scroll. Decide stickiness and pin to the
    // bottom around the DOM write — pinning before it leaves the view short of
    // the newest content (the stream then reads as "stuck" above the bottom).
    const stick = aiAtBottom();
    div.innerHTML = renderMarkdown(raw);
    if (stick) aiScrollToBottom();
  };
  return {
    el: div,
    append(delta) {
      raw += delta;
      if (!scheduled) {
        scheduled = true;
        rafId = requestAnimationFrame(render);
      }
    },
    flush() {
      // Force a synchronous final render: a pending frame may be throttled in a
      // background tab and would otherwise leave the last delta unrendered.
      if (scheduled) {
        cancelAnimationFrame(rafId);
        scheduled = false;
      }
      render();
    },
  };
}

// aiStaticMarkdown renders a finished markdown message (history replay) in one shot.
function aiStaticMarkdown(text) {
  const m = aiMarkdown();
  m.append(text);
  m.flush();
  return m.el;
}

function aiSetStreaming(pane, v) {
  if (pane) pane.streaming = v;
  if (pane !== aiPane) return;
  aiStopEl().hidden = !v;
  if (!v) aiStopEl().disabled = false;
}

async function aiStop() {
  const pane = aiPane;
  if (!pane?.session || !pane.streaming) return;
  aiStopEl().disabled = true;
  try {
    await fetch(`${AI_BASE}/ai/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/yaml" },
      body: yaml.dump({ id: pane.session }),
    });
  } catch {
    // The terminal agent_settled closes the stream and resets the UI.
  }
}

function aiAppend(role, text) {
  aiChipRowEnd(); // text is not a chip: it ends the run's chip row
  const div = document.createElement("div");
  div.className = `ai-msg ai-${role}`;
  div.textContent = text;
  const stick = aiAtBottom();
  aiMsgEl().appendChild(div);
  if (role === "user" || stick) aiScrollToBottom(); // own message always reveals
  return div;
}

// ---------- image attachments ----------

// Images are downscaled in the browser before upload so the POST body, the blob
// on disk and the bytes sent to the model all stay small and identical.
const AI_IMG_MAX_DIM = 1568;
const AI_IMG_QUALITY = 0.85;

function aiBlobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

async function aiCompressImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return undefined;
  }
  const scale = Math.min(
    1,
    AI_IMG_MAX_DIM / Math.max(bitmap.width, bitmap.height),
  );
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  // Screenshots stay lossless PNG; everything else becomes compact JPEG.
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, type, AI_IMG_QUALITY),
  );
  if (!blob) return undefined;
  return { data: await aiBlobToBase64(blob), mimeType: blob.type };
}

// The literal [image] token is the position marker inside the text. Pasting an
// image inserts the token at the caret and queues the compressed bytes; on send
// tokens are paired, in order, with the queued images.
const AI_IMAGE_TOKEN = "[image]";

// aiResizeInput makes the textarea track its rendered content: height:auto
// first, so scrollHeight reports the true content height (and falls back to the
// 2-row minimum when the content is shorter). The global box-sizing is
// border-box, so the border has to be added to scrollHeight, which excludes it;
// otherwise a non-overflowing box would still read as overflowing and show a
// scrollbar. Hidden panels have no layout, so this is a no-op there.
function aiResizeInput() {
  if (!aiPane) return;
  const cs = getComputedStyle(aiInputEl());
  const lineHeight =
    parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
  const border =
    parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  const chrome =
    parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + border;
  const maxHeight = Math.ceil(lineHeight * AI_INPUT_MAX_LINES + chrome);

  aiInputEl().style.height = "auto";
  const contentHeight = aiInputEl().scrollHeight + border;
  aiInputEl().style.height = Math.min(contentHeight, maxHeight) + "px";
  aiInputEl().style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
}

function aiInsertImageToken() {
  const start = aiInputEl().selectionStart ?? aiInputEl().value.length;
  const end = aiInputEl().selectionEnd ?? start;
  const v = aiInputEl().value;
  aiInputEl().value = v.slice(0, start) + AI_IMAGE_TOKEN + v.slice(end);
  const caret = start + AI_IMAGE_TOKEN.length;
  aiInputEl().setSelectionRange(caret, caret);
  aiResizeInput();
}

function aiAddPastedImage(file) {
  // Capture the queue: the user may switch tabs before compression finishes, and
  // the module-level aiPane.images then points at the other tab's draft.
  const queue = aiPane.images;
  const idx = queue.length;
  queue.push(undefined); // reserve the slot so order survives async decode
  aiInsertImageToken();
  aiPane.tasks.push(
    aiCompressImage(file)
      .then((img) => {
        queue[idx] = img;
      })
      .catch(() => {}),
  );
}

function aiClearImages() {
  aiPane.images = [];
  aiPane.tasks = [];
}

// aiBuildSendBlocks splits `text` on [image] tokens and interleaves the queued
// images. Each text/image block keeps its position; image blocks carry both the
// upload `data` and a local `url` for immediate rendering.
function aiBuildSendBlocks(text, images) {
  const blocks = [];
  const parts = text.split(AI_IMAGE_TOKEN);
  let n = 0;
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      const img = images[n++];
      if (img) {
        blocks.push({
          type: "image",
          data: img.data,
          mimeType: img.mimeType,
          url: `data:${img.mimeType};base64,${img.data}`,
        });
      }
    }
    if (parts[i]) blocks.push({ type: "text", text: parts[i] });
  }
  return blocks;
}

// --- [image] token is atomic in the textarea: caret can't enter it, and
// Backspace/Delete removes the whole token (and its queued image).

function aiTokenRanges(v) {
  const ranges = [];
  let i = 0;
  for (;;) {
    const at = v.indexOf(AI_IMAGE_TOKEN, i);
    if (at === -1) break;
    ranges.push([at, at + AI_IMAGE_TOKEN.length]);
    i = at + AI_IMAGE_TOKEN.length;
  }
  return ranges;
}

// Token strictly containing the caret (s < pos < e).
function aiTokenInside(v, pos) {
  for (const [s, e] of aiTokenRanges(v)) {
    if (pos > s && pos < e) return [s, e];
  }
  return null;
}

function aiTokenEndingAt(v, pos) {
  const s = pos - AI_IMAGE_TOKEN.length;
  return s >= 0 && v.slice(s, pos) === AI_IMAGE_TOKEN ? [s, pos] : null;
}

function aiTokenStartingAt(v, pos) {
  return v.slice(pos, pos + AI_IMAGE_TOKEN.length) === AI_IMAGE_TOKEN
    ? [pos, pos + AI_IMAGE_TOKEN.length]
    : null;
}

// Grow a selection so it never cuts a token in half; null when already aligned.
function aiExpandTokenRange(v, start, end) {
  let changed = false;
  for (const [s, e] of aiTokenRanges(v)) {
    if (e <= start || s >= end) continue;
    if (s < start) {
      start = s;
      changed = true;
    }
    if (e > end) {
      end = e;
      changed = true;
    }
  }
  return changed ? [start, end] : null;
}

// Drop the queued images whose tokens fall inside [rs, re). Token ordinal ==
// image index, since both are kept in insertion order.
function aiRemoveImagesForRange(v, rs, re) {
  const drops = [];
  aiTokenRanges(v).forEach(([s, e], i) => {
    if (s >= rs && e <= re) drops.push(i);
  });
  for (let k = drops.length - 1; k >= 0; k--) aiPane.images.splice(drops[k], 1);
}

function aiSnapCaretOutOfToken() {
  if (aiInputEl().selectionStart !== aiInputEl().selectionEnd) return;
  const v = aiInputEl().value;
  const inside = aiTokenInside(v, aiInputEl().selectionStart);
  if (!inside) return;
  const p = aiInputEl().selectionStart;
  const [s, e] = inside;
  const to = p - s < e - p ? s : e;
  aiInputEl().setSelectionRange(to, to);
}

// aiAppendUserParts renders a user bubble from ordered parts:
//   { type: "text", text } | { type: "image", src }
function aiAppendUserParts(parts) {
  aiChipRowEnd(); // a message is not a chip: it ends the run's chip row
  const div = document.createElement("div");
  div.className = "ai-msg ai-user";
  for (const p of parts) {
    if (p.type === "text") {
      if (!p.text) continue;
      const t = document.createElement("div");
      t.textContent = p.text;
      div.appendChild(t);
    } else if (p.type === "image" && p.src) {
      const el = document.createElement("img");
      el.className = "ai-user-img";
      el.src = p.src;
      el.alt = "image";
      div.appendChild(el);
    }
  }
  aiMsgEl().appendChild(div);
  aiScrollToBottom(); // own message always reveals
  return div;
}

// aiNewSession creates a fresh ai session on the server and returns its id. The
// caller decides what to bind it to: aiNew() below adopts it as the current
// conversation, /new replaces a tab with it, the launcher opens a new one.
// aiNewSession opens a conversation. It belongs to no tab — a tab references
// conversations (its layout), and several tabs may reference the same one — so
// nothing about a tab goes in this call.
async function aiNewSession() {
  const res = await fetch(`${AI_BASE}/ai/new`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: "{}",
  });
  const data = yaml.load(await res.text());
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data.sessionId;
}

// ensureTabId is for the paths that meet a tab without one (a deep link, a pane
// a layout change added). The tab comes first in every path.
async function ensureTabId(tab) {
  if (tab.tabId) return tab.tabId;
  tab.tabId = await tabNew();
  saveTabs();
  renderTabs();
  return tab.tabId;
}

// tabTalkId is the tab the turn speaks for: what the layout tool acts on. Taken
// from the pane's own tab, since that is the thing that knows it.
function tabTalkId(pane) {
  const tab = openTabs.find((t) => t.panes?.get(pane?.key) === pane);
  return tab?.tabId || "";
}

async function aiNew() {
  if (aiPane) aiCancelStream(aiPane);
  aiPane = null;
  renderedTabId = null;
}

// ---------- chip rows ----------
//
// A chip is a side note about the run (a thought, a tool call), not content:
// chips flow sideways in a 120px box each and wrap, so a run of calls reads as
// one compact block. Anything that is not a chip ends the row, so the next
// chip starts a new one.
let aiChipRowEl = null;

// aiChipRow returns the open chip row, opening one if needed. The row is
// recreated lazily, so clearing #ai-messages needs no separate bookkeeping.
function aiChipRow() {
  if (aiChipRowEl && aiChipRowEl.isConnected) return aiChipRowEl;
  const row = document.createElement("div");
  row.className = "ai-msg ai-chip-row";
  const stick = aiAtBottom();
  aiMsgEl().appendChild(row);
  aiChipRowEl = row;
  if (stick) aiScrollToBottom();
  return row;
}

// aiChipRowEnd closes the current row; the next chip opens a new one.
function aiChipRowEnd() {
  aiChipRowEl = null;
}

// Chip icons: 24×24 line geometry rendered at 12px, stroked in currentColor.
// A tool that is not named here is unknown, and gets the wrench.
const AI_ICONS = {
  thinking:
    '<path d="M12 5v14M5.94 8.5l12.12 7M18.06 8.5 5.94 15.5"/>',
  bash:
    '<rect x="2.5" y="3.5" width="19" height="17" rx="2.5"/><path d="m6.5 9 3 3-3 3"/><path d="M13 15h5"/>',
  read:
    '<path d="M14.5 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z"/><path d="M14 2.5V7h4.5"/>',
  write:
    '<path d="M14.5 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z"/><path d="M14 2.5V7h4.5"/><path d="M12 11.5v6M9 14.5h6"/>',
  edit:
    '<path d="M20 4.6a2.1 2.1 0 0 0-3 0L5.6 16l-1.4 4.2 4.2-1.4L19.8 7.4a2.1 2.1 0 0 0 .2-2.8Z"/><path d="m15.2 6.4 2.6 2.6"/>',
  grep: '<circle cx="11" cy="11" r="7.5"/><path d="m16.6 16.6 4.4 4.4"/>',
  find:
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><circle cx="11" cy="13.5" r="2.6"/><path d="m13 15.5 2.3 2.3"/>',
  ls: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  save_skill: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  unknown:
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
};

function aiIcon(name) {
  const span = document.createElement("span");
  span.className = "ai-chip-icon";
  span.innerHTML =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    `${AI_ICONS[name] || AI_ICONS.unknown}</svg>`;
  return span;
}

// aiBaseName is path.basename without a path module: the browser has none, and
// a chip label only ever needs the last segment.
function aiBaseName(p) {
  const s = String(p ?? "").trim().replace(/[/\\]+$/, "");
  if (!s) return "";
  const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  const base = i >= 0 ? s.slice(i + 1) : s;
  // Every skill file is called SKILL.md, so the name alone identifies nothing:
  // the chip shows the slug above it instead.
  if (base === "SKILL.md" && i > 0) {
    const parent = s.slice(0, i);
    const j = Math.max(parent.lastIndexOf("/"), parent.lastIndexOf("\\"));
    return j >= 0 ? parent.slice(j + 1) : parent;
  }
  return base;
}

// Wrappers that name the harness rather than the command being run.
const AI_CMD_WRAPPERS = new Set(["sudo", "doas", "command", "exec", "env", "nohup", "time"]);

// aiCommandName reduces a shell command to the program it runs, so
// `cd /tmp && bun run src/main.ts` reads as `bun`. Assignments, wrappers and a
// leading `cd …` segment say nothing about what was actually run. Options that
// take a separate value (`sudo -u root cmd`) may still be misread as the
// program; the expanded body and the tooltip keep the full command.
function aiCommandName(command) {
  for (const segment of String(command ?? "").split(/&&|\|\||;|\|/)) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    let i = 0;
    let wrapper = false;
    while (i < tokens.length) {
      const t = tokens[i];
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t) || AI_CMD_WRAPPERS.has(t)) {
        wrapper = true;
        i++;
        continue;
      }
      if (wrapper && t.startsWith("-")) {
        i++;
        continue;
      }
      break;
    }
    const program = tokens[i];
    if (!program || program === "cd") continue;
    return aiBaseName(program) || program;
  }
  return "";
}

// aiToolChip turns one tool call into its chip: the argument that identifies
// the call — a file name, the program, the search pattern, the skill name —
// never the tool's own name, which a 120px box cannot afford next to an icon.
// `tip` carries what the ellipsis cuts off.
// A skill is one file per directory, always called SKILL.md, so a tool call that
// touches one is about the *skill*: it is labelled with the slug and carries the
// skill icon rather than the generic file one.
function aiSkillSlug(p) {
  const m = /\.agents\/skills\/([^/]+)\/SKILL\.md$/.exec(String(p ?? ""));
  return m ? m[1] : "";
}

function aiToolChip(name, args) {
  const a = args && typeof args === "object" ? args : {};
  const base = aiBaseName(a.path);
  const slug = aiSkillSlug(a.path);
  let label = "";
  switch (name) {
    case "read":
    case "write":
    case "edit":
      label = base;
      break;
    case "ls":
      label = base || ".";
      break;
    case "bash":
      label = aiCommandName(a.command);
      break;
    case "grep":
    case "find":
      label = String(a.pattern ?? "").trim();
      break;
    case "save_skill":
      label = String(a.name ?? "").trim();
      break;
    default:
      label = name;
  }
  // The tip carries what the ellipsis cut off: the full path / command /
  // pattern, or the whole argument object for a tool with no known shape.
  const detail =
    a.path ?? a.command ?? a.pattern ?? a.name ?? (Object.keys(a).length ? args : undefined);
  return {
    label: label || name,
    icon: slug ? "save_skill" : name,
    name,
    tip: detail === undefined ? name : `${name}: ${aiStringify(detail)}`,
  };
}

// Details that are showing, so they can be laid out together: an open panel
// spans the row and pushes the lines below it down, which moves the line the
// next panel belongs to.
const aiOpenPanels = new Set();

// aiLayoutPanels puts every open detail under the *last* chip of the line its
// chip sits on, so the chips of that line keep their places and the detail spans
// the row between that line and the next. Measuring with every panel detached
// keeps the line boundaries unaffected by the panels themselves; re-inserting
// them in document order then makes each later chip's line the one it will
// actually sit on.
function aiLayoutPanels() {
  const entries = [...aiOpenPanels].sort((a, b) =>
    a.wrap.compareDocumentPosition(b.wrap) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
  for (const e of entries) {
    if (!e.wrap.isConnected) aiOpenPanels.delete(e); // its row was cleared
    else e.body.remove();
  }
  for (const e of entries) {
    const row = e.wrap.parentElement;
    if (!row) continue;
    const top = Math.round(e.wrap.getBoundingClientRect().top);
    let last = e.wrap;
    for (const el of row.children) {
      if (!el.classList.contains("ai-collapse")) continue;
      if (Math.round(el.getBoundingClientRect().top) === top) last = el;
    }
    last.after(e.body);
  }
}

// aiShowPanel opens or closes one chip's detail. Only one detail is open at a
// time: a panel spans the row and pushes the lines below it down, so keeping
// several open would just stack them.
function aiShowPanel(entry, open) {
  if (open) {
    for (const other of [...aiOpenPanels]) {
      if (other === entry) continue;
      aiOpenPanels.delete(other);
      aiSetPanelState(other, false);
    }
    aiOpenPanels.add(entry);
  } else {
    aiOpenPanels.delete(entry);
  }
  aiSetPanelState(entry, open);
  aiLayoutPanels();
}

// aiSetPanelState shows or hides one panel without re-laying the row out.
function aiSetPanelState(entry, open) {
  entry.wrap.classList.toggle("open", open);
  entry.body.hidden = !open;
  if (open) {
    // Reveal from the top, not the bottom: an expanded block should show the
    // beginning of the thinking / tool output first.
    entry.body.scrollTop = 0;
  } else {
    entry.body.remove();
  }
}

// A resize re-wraps the row, so the lines the open details belong to change.
window.addEventListener("resize", aiLayoutPanels);

// aiCollapse builds a chip that is collapsed by default: a clickable 120px box
// with an icon + title + loading indicator, and — once opened — a detail panel
// that spans the row under the chip's line and scrolls internally.
function aiCollapse(kind, label, opts = {}) {
  const wrap = document.createElement("div");
  wrap.className = `ai-msg ai-collapse ai-${kind}`;
  const head = document.createElement("button");
  head.type = "button";
  head.className = "ai-collapse-head";
  if (opts.tip) head.title = opts.tip;
  head.appendChild(aiIcon(opts.icon || kind));
  const titleEl = document.createElement("span");
  titleEl.className = "ai-collapse-title";
  titleEl.textContent = label;
  const status = document.createElement("span");
  status.className = "ai-collapse-status ai-loading";
  head.appendChild(titleEl);
  head.appendChild(status);
  // The detail panel is not inside the chip: a 120px box cannot hold it, and
  // only the chip's own line is where the panel belongs. It stays detached
  // until opened. Its first line is the tool's own name — the chip had to drop
  // it to show the argument instead, and here there is room for both.
  const body = document.createElement("div");
  body.className = "ai-collapse-body";
  body.hidden = true;
  const bodyName = document.createElement("div");
  bodyName.className = "ai-collapse-body-name";
  bodyName.textContent = opts.name || label;
  body.appendChild(bodyName);
  const entry = { wrap, body };
  head.addEventListener("click", () => aiShowPanel(entry, !wrap.classList.contains("open")));
  const stick = aiAtBottom();
  wrap.appendChild(head);
  aiChipRow().appendChild(wrap);
  if (stick) aiScrollToBottom();
  return { wrap, body, status };
}

function aiSettle(block, state) {
  const status = block?.status;
  if (!status || !status.classList.contains("ai-loading")) return;
  status.classList.remove("ai-loading");
  if (state === "error") {
    status.classList.add("ai-error");
    status.textContent = "!";
  } else {
    status.classList.add("ai-done");
    status.textContent = "✓";
  }
}

function aiThinking() {
  const block = aiCollapse("thinking", "thinking", {
    icon: "thinking",
    name: "thinking",
    tip: "thinking",
  });
  const body = document.createElement("div");
  body.className = "ai-thinking-body";
  block.body.appendChild(body);
  return { block, body };
}

function aiStringify(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function aiTool(toolName, args) {
  const chip = aiToolChip(toolName, args);
  const block = aiCollapse("tool", chip.label, chip);
  const body = document.createElement("pre");
  body.className = "ai-tool-body";
  body.textContent = aiStringify(args);
  block.body.appendChild(body);
  return { block, body };
}

// ask_user renders as a question card; picking an option calls onPick(value).
function aiAskUser(args, onPick) {
  aiChipRowEnd(); // a question is a card, not a chip
  const div = document.createElement("div");
  div.className = "ai-msg ai-question";
  const q = document.createElement("div");
  q.textContent = (args && args.text) || "";
  div.appendChild(q);
  const row = document.createElement("div");
  row.className = "ai-question-options";
  const done = (value) => {
    row.querySelectorAll("button, input").forEach((el) => (el.disabled = true));
    onPick(value);
  };
  const options = (args && args.options) || [];
  if (options.length) {
    for (const o of options) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = o.label;
      b.addEventListener("click", () => done(o.value));
      row.appendChild(b);
    }
  } else {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "输入回答…";
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = "回答";
    const submit = () => {
      const v = input.value.trim();
      if (v) done(v);
    };
    b.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
    row.appendChild(input);
    row.appendChild(b);
  }
  const stick = aiAtBottom();
  div.appendChild(row);
  aiMsgEl().appendChild(div);
  if (stick) aiScrollToBottom();
}

// aiStream subscribes to the session's SSE and keeps it alive across connection
// drops: on failure it reconnects with `since = aiSeenSeq` so the server replays
// only the events this client missed. The render state (assistant / thinking /
// tool blocks) lives here, not in the connection, so replayed deltas append to
// the same bubbles instead of opening new ones.
//
// A mid-run ask is steered into the run already covered by the live stream, so
// for the same session we must not open a second subscription (that would race
// over aiSeenSeq and re-render). Switching sessions aborts the old stream via
// aiCancelStream so it cannot keep writing into the now-current view.
async function aiStream(pane) {
  const id = pane?.session;
  if (!id) return;
  // Already attached to this session (a mid-run ask is steered server-side):
  // do not open a second subscription, which would race over aiSeenSeq.
  if (pane.streamCtl && pane.streamCtl.id === id) return;
  // A stream for another session in the same pane (the user switched it):
  // drop it before attaching, otherwise it would keep rendering into the
  // now-current view and its seq would clobber this session's aiSeenSeq.
  if (pane.streamCtl) aiCancelStream(pane);
  const gen = ++pane.streamGen;
  const ctrl = new AbortController();
  pane.streamCtl = { id, ctrl };
  aiSetStreaming(pane, true);
  // Whatever this stream renders goes into this pane's list, even when another
  // pane is focused.
  const render = () => { aiRenderPane = pane; };
  let assistant = null; // current assistant markdown bubble: { el, append, flush }
  let thinking = null; // current thinking block: { block, body }
  const tools = new Map(); // toolCallId -> { block, body }

  const settleAll = () => {
    if (assistant) {
      assistant.flush();
      assistant = null;
    }
    if (thinking) {
      aiSettle(thinking.block, "done");
      thinking = null;
    }
    for (const t of tools.values()) aiSettle(t.block, "done");
    tools.clear();
  };

  const handle = (ev) => {
    render();
    // Native pi event: message_update carries the assistant message sub-events.
    if (ev.type === "message_update") {
      const ae = ev.assistantMessageEvent || {};
      if (ae.type === "text_start" || ae.type === "text_delta") {
        if (!assistant) assistant = aiMarkdown();
        if (thinking) {
          aiSettle(thinking.block, "done");
          thinking = null;
        }
      }
      if (ae.type === "text_delta") {
        const stick = aiAtBottom();
        assistant.append(ae.delta || "");
        if (stick) aiScrollToBottom();
      } else if (ae.type === "thinking_start" || ae.type === "thinking_delta") {
        if (!thinking) thinking = aiThinking();
        if (ae.type === "thinking_delta") {
          const stick = aiAtBottom();
          const follow = aiBodyAtBottom(thinking.block.body);
          thinking.body.textContent += ae.delta || "";
          if (follow && !thinking.block.body.hidden) {
            thinking.block.body.scrollTop = thinking.block.body.scrollHeight;
          }
          if (stick) aiScrollToBottom();
        }
      } else if (ae.type === "error") {
        aiAppend("assistant", `[error] ${ae.error?.errorMessage || ""}`);
        assistant = null;
      }
      return;
    }
    if (ev.type === "message_end") {
      if (assistant && ev.message?.role === "assistant") assistant.flush();
      return;
    }
    if (ev.type === "turn_start") {
      // A new LLM turn begins (including a prompt steered in mid-run): start a
      // fresh assistant bubble so replies keep their place relative to the user.
      if (assistant) {
        assistant.flush();
        assistant = null;
      }
      if (thinking) {
        aiSettle(thinking.block, "done");
        thinking = null;
      }
      return;
    }
    if (ev.type === "tool_execution_start") {
      if (ev.toolName === "ask_user") {
        aiAskUser(ev.args, aiAnswer);
      } else if (ev.toolName === "layout") {
        // Nothing yet: the tree the model *asked* for is not the tree that was
        // stored. It arrives with the result, and only when the write was
        // accepted (see tool_execution_end).
      } else {
        tools.set(ev.toolCallId, aiTool(ev.toolName, ev.args));
      }
      return;
    }
    if (ev.type === "tool_execution_update") {
      const t = tools.get(ev.toolCallId);
      if (t && ev.partialResult) {
        const stick = aiAtBottom();
        const follow = aiBodyAtBottom(t.block.body);
        t.body.textContent += `\n${aiStringify(ev.partialResult)}`;
        if (follow && !t.block.body.hidden) t.block.body.scrollTop = t.block.body.scrollHeight;
        if (stick) aiScrollToBottom();
      }
      return;
    }
    if (ev.type === "tool_execution_end") {
      if (ev.toolName === "layout") {
        // Draw what was stored, not what was asked for: the tool normalizes the
        // tree (and refuses a write it cannot honour), so the result is the one
        // description of what this tab now is. A rejected write draws nothing.
        if (!ev.isError) applyLayoutFrame(pane, ev.result);
        return;
      }
      const t = tools.get(ev.toolCallId);
      if (t) {
        const stick = aiAtBottom();
        const follow = aiBodyAtBottom(t.block.body);
        t.body.textContent += `\n→ ${ev.isError ? "error" : "done"}: ${aiStringify(ev.result)}`;
        aiSettle(t.block, ev.isError ? "error" : "done");
        if (follow && !t.block.body.hidden) t.block.body.scrollTop = t.block.body.scrollHeight;
        if (stick) aiScrollToBottom();
      }
      return;
    }
    if (ev.type === "agent_settled") {
      // End of a run: next text opens a fresh bubble. Settle anything still loading.
      settleAll();
      return;
    }
    if (ev.type === "error") {
      aiAppend("assistant", `[error] ${ev.error?.message || ""}`);
      assistant = null;
      return;
    }
  };

  let attempt = 0;
  try {
    for (;;) {
      if (pane.streamGen !== gen) break; // superseded
      let sawSettled = false;
      const onEvent = (ev) => {
        if (pane.streamGen !== gen) return; // superseded mid-read
        if (typeof ev.seq === "number") {
          if (ev.seq <= pane.seenSeq) return; // already rendered from an earlier stream
          pane.seenSeq = ev.seq;
        }
        if (ev.type === "agent_settled") sawSettled = true;
        render();
        handle(ev);
      };
      try {
        await aiStreamOnce(id, pane.seenSeq, onEvent, ctrl.signal);
        if (pane.streamGen !== gen) break;
        // Normal close: either the run settled, or we are caught up and idle.
        if (!sawSettled) settleAll();
        break;
      } catch (err) {
        if (pane.streamGen !== gen) break; // superseded or aborted
        if (err && err.name === "AbortError") break;
        if (err && err.fatal) {
          aiAppend("assistant", `[error] ${err.message}`);
          break;
        }
        // Network drop: reattach and let the server replay what we missed.
        attempt++;
        if (attempt > AI_STREAM_MAX_RETRIES) {
          aiAppend("assistant", "[error] 连接中断，重连失败");
          break;
        }
        await aiSleep(Math.min(500 * 2 ** (attempt - 1), AI_STREAM_MAX_BACKOFF));
      }
    }
  } finally {
    // Only the current generation owns the pane's streaming state; a superseded
    // stream must not clear the new session's stop button.
    if (pane.streamGen === gen) {
      pane.streamCtl = null;
      aiSetStreaming(pane, false);
    }
    if (aiRenderPane === pane) aiRenderPane = null;
  }
}

function aiSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// aiCancelStream stops the active SSE stream (if any) and invalidates it so its
// loop stops rendering. Used when switching sessions or starting a new one.
function aiCancelStream(pane) {
  if (!pane) return;
  pane.streamGen++;
  if (pane.streamCtl) {
    pane.streamCtl.ctrl.abort();
    pane.streamCtl = null;
  }
  aiSetStreaming(pane, false);
}

// aiStreamOnce opens one SSE connection and drives `onEvent` until the server
// closes it. A transport/HTTP failure throws so aiStream can reconnect; a
// non-retryable server response carries `fatal`.
async function aiStreamOnce(id, since, onEvent, signal) {
  const res = await fetch(`${AI_BASE}/ai/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: yaml.dump({ id, since: since }),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = yaml.load(await res.text().catch(() => "")) || {};
    const err = new Error(data.error?.message || `HTTP ${res.status}`);
    err.fatal = true; // the server answered; retrying the same request will not help
    throw err;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop();
    for (const frame of frames) {
      // events are yaml docs, one "data:" line per yaml line (SSE multi-line data)
      const lines = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("data:")) lines.push(line.slice(5).replace(/^ /, ""));
      }
      if (!lines.length) continue;
      let ev;
      try {
        ev = yaml.load(lines.join("\n"));
      } catch {
        continue;
      }
      if (!ev || typeof ev !== "object") continue;
      onEvent(ev);
    }
  }
}

async function aiSend() {
  const pane = aiPane;
  const text = aiInputEl().value;
  if (!text.trim() || !pane) return;
  aiDrawerHide();
  aiInputEl().value = "";
  aiResizeInput();
  await Promise.all(aiPane.tasks); // let any in-flight paste finish decoding
  const images = aiPane.images;
  // ArrowUp / ArrowDown walk back through the conversation's prompts (see
  // aiPromptHistory): a prompt that carried a pasted image is not recorded,
  // because its text alone could not be replayed into the composer.
  if (!images.length) aiHistoryRecord(pane.session, text);
  aiClearImages();
  const blocks = aiBuildSendBlocks(text, images);
  // Local bubble: text + real images (the [image] tokens are not shown).
  const parts = blocks.map((b) =>
    b.type === "text"
      ? { type: "text", text: b.text }
      : { type: "image", src: b.url },
  );
  aiRenderPane = pane;
  aiAppendUserParts(parts);
  aiRenderPane = null;
  const wire = blocks.map((b) =>
    b.type === "text"
      ? { type: "text", text: b.text }
      : { type: "image", data: b.data, mimeType: b.mimeType },
  );
  const res = await fetch(`${AI_BASE}/ai/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: yaml.dump({ id: pane.session, tabId: tabTalkId(pane), blocks: wire }),
  });
  const data = yaml.load(await res.text()) || {};
  if (!res.ok) {
    aiRenderPane = pane;
    aiAppend("assistant", `[error] ${data.error?.message || res.status}`);
    aiRenderPane = null;
    return;
  }
  aiLastSend = { pane, text };
  await aiStream(pane);
}

// aiAnswer sends a user's reply to a pending ask_user question as an ordinary
// text turn on /ai/ask, then consumes the new run's stream.
async function aiAnswer(answer) {
  const pane = aiPane;
  if (!pane) return;
  aiRenderPane = pane;
  aiAppend("user", answer);
  aiRenderPane = null;
  const res = await fetch(`${AI_BASE}/ai/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: yaml.dump({
      id: pane.session,
      tabId: tabTalkId(pane),
      blocks: [{ type: "text", text: answer }],
    }),
  });
  const data = yaml.load(await res.text()) || {};
  if (!res.ok) {
    aiRenderPane = pane;
    aiAppend("assistant", `[error] ${data.error?.message || res.status}`);
    aiRenderPane = null;
    return;
  }
  await aiStream(pane);
}

// ---------- tab records ----------
//
// A tab's pane tree lives in log, keyed by a tabId the service assigns
// (/log/tab/*). The frontend keeps the id on its tab object and is the one
// writer that *creates* a record: a tab the model has never touched still needs
// a default single-pane layout, and a page tab never talks to ai at all.
// Everything after creation goes through the model's layout tool — the
// frontend only reads.
//
// The tree is not rendered yet: one pane fills the tab exactly as before, so
// primaryPane() is the whole of what the layout means here.

// primaryPane returns the first pane leaf of a layout tree, or null when the
// tree is unreadable. Until splits are rendered this is the only pane; after
// that it stays the fallback for a malformed tree.
function primaryPane(layout) {
  let node = layout;
  for (let depth = 0; node && depth < 16; depth++) {
    if (node.pane) return node.pane;
    if (!Array.isArray(node.children) || !node.children.length) return null;
    node = node.children[0];
  }
  return null;
}

// tabNew creates a tab and returns its id. A tab is created *before* whatever
// lives in it: the id is what the service that opens its conversation is handed.
async function tabNew() {
  const res = await fetch(`${LOG_BASE}/log/tab/new`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: "{}",
  });
  const data = yaml.load(await res.text()) || {};
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data.tabId;
}

// tabPut overwrites a tab's layout.
async function tabPut(tabId, layout) {
  const res = await fetch(`${LOG_BASE}/log/tab/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: yaml.dump({ tabId, layout }),
  });
  const data = yaml.load(await res.text()) || {};
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data;
}

async function tabDetail(tabId) {
  const res = await fetch(`${LOG_BASE}/log/tab/detail`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: yaml.dump({ tabId }),
  });
  const data = yaml.load(await res.text()) || {};
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data;
}

async function tabList() {
  const res = await fetch(`${LOG_BASE}/log/tab/list`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: yaml.dump({ pageNum: 1 }),
  });
  const data = yaml.load(await res.text()) || {};
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data.tabs || [];
}

// tabLayoutOf is the single-pane layout a tab gets when it is created: the
// chat session or the blueprint it was opened for.
function tabLayoutOf(tab) {
  return tab.kind === "page"
    ? { pane: { content: "page", id: tab.pageId } }
    : { pane: { content: "chat", id: tab.sessionId } };
}

// syncTabRecord gives a tab its record on first activation — new tabs, deep
// links, tabs restored from localStorage after a reload (which have no tabId
// yet), all land here — and reads the layout back the first time an existing
// record is opened, so a split the model made survives a reload.
async function syncTabRecord(tab) {
  try {
    if (tab.layout) return; // already read this session
    if (tab.tabId) {
      try {
        const rec = await tabDetail(tab.tabId);
        // An empty record (a tab log-tab-new has just created) carries no layout
        // yet — and nothing to write either: whoever puts content in the tab
        // writes it (the service via ai-new, or tabPut below for a page).
        if (rec.layout && Object.keys(rec.layout).length) {
          tab.layout = rec.layout;
          return;
        }
      } catch (err) {
        // No record under this id at all: fall through and create one.
      }
    }
    if (!tab.tabId) tab.tabId = await tabNew();
    const rec = await tabPut(tab.tabId, tabLayoutOf(tab));
    if (rec.layout) tab.layout = rec.layout;
    saveTabs();
    renderTabs();
  } catch (err) {
    // A tab with no record still renders: it just cannot be reread, and the
    // next activation tries again.
    logTabRecordError(err);
  }
}

// ---------- tabs ----------
//
// A tab carries one chat instance. Running a skill is how most of them start:
// the skill is one piece of text, and the ai service creates a session and hands
// that text to the model as the first prompt — the tab is the frontend form of
// the instance that comes out of it. The fixed views above are not tabs of this
// kind; they are part of the shell and can never be closed.

const TABS_KEY = "engineer.tabs";
const tabsEl = document.getElementById("tabs");
const tabAddEl = document.getElementById("tab-add");
// The tab whose conversation is currently rendered into #ai-messages. Null when
// something else (an ad-hoc chat) owns the message area.
let renderedTabId = null;
let openTabs = loadTabs(); // [{ id, tabId, kind, name, sessionId, skillId, text, pageId }]
let activeTabId = null; // tab on screen, null while a fixed view is active

// The address bar follows the tabs: while a conversation is on screen the URL is
// /chat/<sessionId>, so a reload, a back step or a shared link lands on the same
// one. The mode names how the URL got there: "push" (an explicit move to the
// tab), "replace" (the tab changed session in place) or null (the URL drove the
// render — popstate, a deep link — so there is nothing to write).
function chatPath(sessionId) {
  return `/${CHAT_PREFIX}/${encodeURIComponent(sessionId)}`;
}

function pagePath(pageId) {
  return `/${PAGES_PREFIX}/${encodeURIComponent(pageId)}`;
}

// pageFrameSrc is where the iframe actually loads: the blueprint's directory,
// with the trailing slash that makes the server hand over its index.html — the
// same path without the slash is the SPA route the tab itself lives on.
function pageFrameSrc(pageId) {
  return `${pagePath(pageId)}/`;
}

// The address bar follows whatever the tab carries: a conversation lives at
// /chat/<sessionId>, a page at /pages/<id>. The mode names how the URL got
// there: "push" (an explicit move to the tab), "replace" (the tab changed its
// content in place) or null (the URL drove the render — popstate, a deep link —
// so there is nothing to write).
function syncTabUrl(tab, mode) {
  if (!mode) return;
  const path = tab.kind === "page" ? pagePath(tab.pageId) : chatPath(tab.sessionId);
  if (location.pathname === path) return;
  if (mode === "replace") history.replaceState(null, "", path);
  else history.pushState(null, "", path);
}

// routeChat renders the conversation a /chat/<sessionId> URL names: the tab that
// already holds it, or a tab opened for it (a deep link or a back/forward step).
// A session that cannot be loaded is left on screen with its error — the address
// is the truth and the tab is the user's to close.
async function routeChat(sessionId) {
  const tab = openTabs.find((t) => t.kind !== "page" && t.sessionId === sessionId);
  if (tab) {
    await activateTab(tab.id, null);
    return;
  }
  await openTab({ skillId: "", sessionId, name: "chat", text: "" }, null);
}

// routePage renders the page a /pages/<id> URL names. A page is stateless — no
// session, no history — so a URL that names a blueprint simply gets a tab for
// it; if there is no such blueprint the iframe shows the server's fallback and
// the tab is the user's to close, exactly like a chat that cannot be loaded.
async function routePage(pageId) {
  const tab = openTabs.find((t) => t.kind === "page" && t.pageId === pageId);
  if (tab) {
    await activateTab(tab.id, null);
    return;
  }
  await openPageTab(pageId, pageId, null);
}

// rebindActiveTab points the tab on screen at the session it now shows. /resume
// loads another conversation into the current tab, so the tab — and the URL that
// names it — has to follow: otherwise switching away and back would replay the
// old conversation, and the address would name a session no longer displayed.
function rebindActiveTab(sessionId, name) {
  const tab = openTabs.find((t) => t.id === renderedTabId);
  if (!tab || tab.sessionId === sessionId) return;
  tab.sessionId = sessionId;
  tab.skillId = "";
  tab.name = name || "chat";
  tab.text = "";
  // The pane is already showing this session — aiLoadSession replayed it — so
  // this only moves the tab (and its record) onto it. Touching the pane's
  // messages here would throw away the replay that just landed.
  if (aiPane) tab.layout = { pane: { content: "chat", id: sessionId } };
  saveTabs();
  renderTabs();
  syncTabUrl(tab, "replace");
  // The tab's pane now holds another session, so its record has to follow.
  if (tab.tabId) tabPut(tab.tabId, tabLayoutOf(tab)).catch(logTabRecordError);
}

function logTabRecordError(err) {
  console.error(`engineer web: tab record failed: ${String(err.message || err)}`);
}

// There is no draft machinery any more: each pane has its own composer, so an
// unsent draft is simply the text still sitting in it. Nothing to snapshot, and
// nothing to swap back — the composer never goes anywhere.

// The composer's prompt history — ArrowUp / ArrowDown, the way a CLI recalls a
// line. Keyed by session, not by tab: closing a tab, reopening it from the
// launcher, switching away and back, reloading, or arriving by deep link must
// all find the same list again — a tab is only one view of a conversation.
//
// Two sources fill it. While the page is open aiSend records what it sends, so
// an entry is there the moment it was sent. For everything else — prompts sent
// before this page loaded, from another client, or before this feature existed
// — aiHistorySeed fills the list from the conversation's own stored messages,
// which aiLoadSession already walks to replay the view: the same pass, no extra
// request. What that means concretely: every user *text* turn of this
// conversation is recallable (a prompt, an ask_user reply, a skill's opening
// text), and a turn that carried an image is skipped, since its text alone
// could not bring the image back.
const aiPromptHistory = new Map(); // session id -> { items, cursor, draft }
const AI_HISTORY_MAX = 100; // prompts kept per session; the rest fall off the front

function aiHistoryOf(sessionId) {
  let h = aiPromptHistory.get(sessionId);
  if (!h) {
    h = { items: [], cursor: null, draft: "" };
    aiPromptHistory.set(sessionId, h);
  }
  return h;
}

// aiHistoryRecord appends a prompt that was actually sent from the composer.
function aiHistoryRecord(sessionId, text) {
  if (!sessionId || !text.trim()) return;
  const h = aiHistoryOf(sessionId);
  h.items.push(text);
  if (h.items.length > AI_HISTORY_MAX) h.items.shift();
  h.cursor = null;
  h.draft = "";
}

// aiHistorySeed fills the list from a conversation's stored messages the first
// time this page sees it. A list this page already built is left alone: it
// cannot be behind the log (a send is recorded before its record is written),
// and overwriting it would drop the prompts of a run still in flight.
function aiHistorySeed(sessionId, prompts) {
  if (!sessionId || !prompts.length) return;
  const h = aiHistoryOf(sessionId);
  if (h.items.length) return;
  h.items = prompts.slice(-AI_HISTORY_MAX);
}

// aiHistoryEnd leaves browsing with the composer as it stands: an edit during
// browsing keeps the edited text rather than the recalled entry.
function aiHistoryEnd(sessionId) {
  const h = aiPromptHistory.get(sessionId);
  if (!h) return;
  h.cursor = null;
  h.draft = "";
}

// aiHistoryClear drops a history when its conversation is deleted: the session
// is gone from the log, so recalling from it would be recalling a ghost.
function aiHistoryClear(sessionId) {
  if (sessionId) aiPromptHistory.delete(sessionId);
}

// aiHistoryShow puts an entry (or the saved draft) back in the composer, caret
// at the end, the way a recalled CLI line arrives.
function aiHistoryShow(text) {
  aiInputEl().value = text;
  aiInputEl().setSelectionRange(text.length, text.length);
  aiResizeInput();
  aiSyncCommandDrawer();
}

// aiHistoryUp walks towards older prompts; the composer's content when browsing
// starts is the draft the last ArrowDown hands back. False means "nothing to
// recall" — the caller lets the caret move.
function aiHistoryUp(sessionId) {
  if (!sessionId) return false;
  const h = aiHistoryOf(sessionId);
  if (!h.items.length) return false;
  if (h.cursor === null) {
    h.draft = aiInputEl().value;
    h.cursor = h.items.length - 1;
  } else if (h.cursor > 0) {
    h.cursor--;
  }
  aiHistoryShow(h.items[h.cursor]);
  return true;
}

// aiHistoryDown walks towards newer prompts, then restores the draft and stops
// browsing. False while not browsing, so ArrowDown keeps moving the caret.
function aiHistoryDown(sessionId) {
  if (!sessionId) return false;
  const h = aiHistoryOf(sessionId);
  if (h.cursor === null) return false;
  if (h.cursor < h.items.length - 1) {
    h.cursor++;
    aiHistoryShow(h.items[h.cursor]);
    return true;
  }
  const draft = h.draft;
  h.cursor = null;
  h.draft = "";
  aiHistoryShow(draft);
  return true;
}

// The mirror behind aiCaretVisualLine: an off-screen copy of the composer. A
// textarea has no API for the caret's box, and counting "\n" would call a long
// soft-wrapped line a single line — exactly the case where ArrowUp must move
// the caret instead of swallowing the draft.
function aiMirrorSync(cs) {
  const st = aiMirrorEl().style;
  // Same content width as the textarea: clientWidth is content + padding, and
  // the mirror carries no padding of its own (and no scrollbar of its own).
  const width =
    aiInputEl().clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  st.width = Math.max(0, width) + "px";
  st.fontFamily = cs.fontFamily;
  st.fontSize = cs.fontSize;
  st.fontWeight = cs.fontWeight;
  st.fontStyle = cs.fontStyle;
  st.lineHeight =
    cs.lineHeight === "normal" ? `${parseFloat(cs.fontSize) * 1.4}px` : cs.lineHeight;
  st.letterSpacing = cs.letterSpacing;
  st.wordSpacing = cs.wordSpacing;
  st.whiteSpace = cs.whiteSpace;
  st.overflowWrap = cs.overflowWrap;
  st.wordBreak = cs.wordBreak;
  st.tabSize = cs.tabSize;
}

// aiCaretVisualLine reports whether the caret sits on the first / last rendered
// line of the composer. Two measurements of the mirror: the text up to the
// caret, and the whole text. The caret is on the last line exactly when the tail
// did not push it onto a line of its own.
function aiCaretVisualLine() {
  const v = aiInputEl().value;
  const caret = aiInputEl().selectionStart ?? v.length;
  const cs = getComputedStyle(aiInputEl());
  const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
  aiMirrorSync(cs);
  const lines = (text) => {
    aiMirrorEl().textContent = text;
    return Math.max(1, Math.ceil(aiMirrorEl().scrollHeight / lineHeight - 0.01));
  };
  const before = lines(v.slice(0, caret));
  const all = lines(v);
  return { first: before <= 1, last: all <= before };
}

function loadTabs() {
  try {
    const raw = JSON.parse(localStorage.getItem(TABS_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    // `fresh` is deliberately never restored: after a reload the session is
    // loaded through /ai/resume like any other history session.
    //
    // A record without a `kind` predates pages and is a conversation; a page tab
    // carries a pageId and no session at all, so each kind is filtered on what
    // it actually needs.
    return raw
      .filter((t) => {
        if (!t || !t.id || !t.name) return false;
        return t.kind === "page" ? !!t.pageId : !!t.sessionId;
      })
      .map((t) => ({
        id: t.id,
        tabId: t.tabId || "", // absent on tabs saved before tab records existed
        // Panes and their layout are runtime state: rebuilt from the record (and
        // for a chat, from its session) on the first activation after a reload.
        panes: new Map(),
        layout: null,
        kind: t.kind === "page" ? "page" : "chat",
        skillId: t.skillId || "",
        sessionId: t.sessionId || "",
        pageId: t.pageId || "",
        name: t.name,
        text: t.text || "",
      }));
  } catch (e) {
    return [];
  }
}

function saveTabs() {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify(openTabs));
  } catch (e) {}
}

function renderTabs() {
  for (const el of tabsEl.querySelectorAll(".tab[data-tab-id]")) el.remove();
  for (const t of openTabs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab";
    btn.dataset.tabId = t.id;
    btn.title = t.name;
    const label = document.createElement("span");
    label.className = "tab-label";
    label.textContent = t.name;
    const close = document.createElement("span");
    close.className = "tab-close";
    close.dataset.close = t.id;
    close.title = "close";
    close.textContent = "×";
    btn.appendChild(label);
    btn.appendChild(close);
    tabsEl.insertBefore(btn, tabAddEl);
  }
  syncTabActive();
}

function syncTabActive() {
  for (const btn of tabsEl.querySelectorAll("button[data-view]")) {
    btn.classList.toggle(
      "active",
      !activeTabId && !newTabOpen && btn.dataset.view === currentView,
    );
  }
  for (const btn of tabsEl.querySelectorAll(".tab[data-tab-id]")) {
    btn.classList.toggle("active", btn.dataset.tabId === activeTabId);
  }
  // The new tab page has no tab of its own; `+` stands in for it.
  tabAddEl.classList.toggle("active", newTabOpen);
}

// applyLayout switches between the page contents: a fixed view (graph or a
// section tree), a tab's pane tree, or the launcher — exactly one at a time.
function applyLayout() {
  const tab = activeTabId ? openTabs.find((t) => t.id === activeTabId) : null;
  const tabMode = !!tab;
  leftEl.hidden = tabMode || newTabOpen;
  newTabEl.hidden = !newTabOpen;
  panesEl.hidden = !tabMode;
  graph?.updateSize();
}

// openTab opens a tab for a chat instance: `fresh` marks a session created just
// now (nothing rendered yet) — `text` is what its composer starts with, drawn
// but not sent — otherwise the session is loaded like a resumed history session.
// openTab opens a tab for a chat instance: `fresh` marks a session created just
// now (nothing rendered yet) — `text` is what its composer starts with, drawn
// but not sent — otherwise the session is loaded like a resumed history session.
// `recordId` is set when the tab comes from an existing tab record (the launcher
// reopening one); a tab made here and now leaves it empty and gets its record on
// first activation.
async function openTab({ skillId, sessionId, name, text, fresh, recordId }, mode = "push") {
  let tab = openTabs.find((t) => t.kind !== "page" && t.sessionId === sessionId);
  if (!tab) {
    tab = {
      id: `tab_${Math.random().toString(36).slice(2, 10)}`,
      tabId: recordId || "",
      kind: "chat",
      skillId: skillId || "",
      sessionId,
      pageId: "",
      name: name || "chat",
      text: text || "",
      panes: new Map(),
      layout: null,
    };
    if (fresh) tab.fresh = true;
    openTabs.push(tab);
  }
  saveTabs();
  renderTabs();
  await activateTab(tab.id, mode);
}

// openPageTab opens a tab for a blueprint. A page is not an instance of a
// session: it carries no sessionId and has no history — the tab is the whole of
// its state, and the pane holds an iframe onto the blueprint's files. Opening
// the same blueprint twice reuses its tab.
async function openPageTab(pageId, name, mode = "push", recordId = "") {
  let tab = openTabs.find((t) => t.kind === "page" && t.pageId === pageId);
  if (!tab) {
    tab = {
      id: `tab_${Math.random().toString(36).slice(2, 10)}`,
      tabId: recordId || "",
      kind: "page",
      pageId,
      skillId: "",
      sessionId: "",
      name: name || pageId,
      text: "",
      panes: new Map(),
      layout: null,
    };
    openTabs.push(tab);
  }
  saveTabs();
  renderTabs();
  await activateTab(tab.id, mode);
}

async function activateTab(id, mode = "push") {
  const tab = openTabs.find((t) => t.id === id);
  if (!tab) return;
  const previous = aiPane && openTabs.find((t) => t.panes?.get(aiPane.key) === aiPane);
  if (previous && previous.id !== id) {
    aiCancelStreamQuiet(previous);
  }
  activeTabId = id;
  newTabOpen = false;
  applyLayout();
  syncTabActive();
  syncTabUrl(tab, mode);
  // First activation of a tab that has no record yet (a new one, a deep link, a
  // tab restored from localStorage) is what creates it; one that has a record
  // gets its layout read back before the panes are built.
  await syncTabRecord(tab);
  showPanes(tab);
  aiDrawerHide();
  // Every composer in this tab is usable again: the picker disables the one it
  // was opened from, and a stale disabled state must not survive the switch.
  for (const p of tab.panes.values()) if (p.inputEl) p.inputEl.disabled = false;
  renderedTabId = id;

  // The pane the composer belongs to: the tab's first chat pane. A page-only
  // tab has none, so there is nothing to type into.
  focusPane(tab, firstChatKey(tab));
  if (tab.fresh) {
    // A brand-new session: nothing has been sent yet. A skill opens with its
    // text sitting in the composer — the user edits it and decides when to
    // send; the run starts on that send, not on the click.
    delete tab.fresh;
    saveTabs();
    if (tab.text) {
      // A skill's text starts in the composer, unsent.
      aiInputEl().value = tab.text;
      aiResizeInput();
    }
  }
  try {
    if (aiPane) await aiStream(aiPane);
  } catch (err) {
    aiAppend("assistant", `[error] ${err.message}`);
  }
  if (aiPane) aiInputEl().focus();
}

// firstChatKey is the tree path of the tab's first chat pane, or "" when the
// tab holds none (a page-only layout).
function firstChatKey(tab) {
  for (const [key, pane] of tab.panes ?? []) {
    if (pane.kind === "chat") return key;
  }
  return "";
}

// Leaving a tab stops the streams the user can no longer see. It is the pane's
// own abort, not a cancellation of the run: /ai/stream replays from the pane's
// seq when the tab comes back.
function aiCancelStreamQuiet(tab) {
  for (const pane of tab.panes?.values() ?? []) {
    if (pane.streamCtl) {
      pane.streamGen++;
      pane.streamCtl.ctrl.abort();
      pane.streamCtl = null;
      pane.streaming = false;
    }
  }
}

function closeTab(id) {
  const idx = openTabs.findIndex((t) => t.id === id);
  if (idx < 0) return;
  const closed = openTabs[idx];
  openTabs.splice(idx, 1);
  saveTabs();
  renderTabs();
  if (activeTabId !== id) return;
  // The closed tab owned the content area: fall back to the neighbour, or to
  // the graph when it was the last one.
  aiCancelStream(aiPane);
  renderedTabId = null;
  activeTabId = null;
  const next = openTabs[Math.max(0, idx - 1)];
  if (next) activateTab(next.id, "replace");
  else navigate("/", "replace");
}

// ---------- the launcher ----------
//
// `+` turns the content area into the launcher — a page, not a dialog (the
// browser new-tab analogy): start a blank chat, or open a skill as a chat or a
// blueprint as a page. Any tab click leaves the page.

let newTabEl = null;
let newTabOpen = false;
let newTabReturn = "/"; // the path Esc leaves the new tab page for
let newTabMode = "home"; // home | skills | blueprints
let newTabSkills = new Map(); // skill id -> { name, text }
let newTabBlueprints = new Map(); // blueprint id -> { name, files }

function newTabInit() {
  newTabEl = document.getElementById("newtab");
  newTabEl.addEventListener("click", newTabClick);
}



// openNewTab shows the launcher at /new (or one of its sub-pages). `push` is
// false when the URL already says so (a back/forward step re-renders the page);
// a second `+` click just refreshes it instead of stacking another entry.
function openNewTab({ push = true, sub = "home" } = {}) {
  const path = sub === "home" ? NEW_TAB_PATH : `${NEW_TAB_PATH}/${sub}`;
  if (push && !newTabOpen) {
    newTabReturn = location.pathname;
    history.pushState(null, "", path);
  }
  newTabOpen = true;
  newTabMode = sub;
  activeTabId = null;
  applyLayout();
  syncTabActive();
  newTabEl.innerHTML = `<div class="newtab-body"><div class="empty-hint">loading…</div></div>`;
  newTabReload();
}

// newTabGo moves within the launcher: the home page, the skills page, the
// blueprints page. The URL follows, so a reload (or a shared link) lands on the
// same one.
function newTabGo(sub, mode = "push") {
  const path = sub === "home" ? NEW_TAB_PATH : `${NEW_TAB_PATH}/${sub}`;
  if (!newTabOpen) {
    openNewTab({ push: mode !== null, sub });
    return;
  }
  if (mode === "push") history.pushState(null, "", path);
  else if (mode === "replace") history.replaceState(null, "", path);
  newTabMode = sub;
  newTabReload();
}

// closeNewTab returns to the view the page was opened from (the page Esc leads
// to). Replacing keeps the page out of history: back must not reopen it.
function closeNewTab() {
  if (!newTabOpen) return;
  newTabOpen = false;
  navigate(newTabReturn, "replace");
}

// One row of the launcher: a **class** you can instantiate. A kept skill and a
// blueprint have exactly one action, so the whole row is that action — the same
// clickable row as a recent conversation. A suggested candidate is not kept yet:
// its row says so and points at the agent instead of running.
function newTabSkillItemHtml(t, suggested) {
  return `<div class="launch-item" data-action="${suggested ? "suggest" : "run"}" data-id="${t.id}">
    <div class="launch-main">
      <div class="launch-name">${escapeHtml(t.name)}</div>
      <div class="launch-desc">${escapeHtml(t.desc || t.text)}</div>
    </div>
  </div>`;
}

function newTabBlueprintItemHtml(b) {
  return `<div class="launch-item" data-action="page" data-id="${b.id}">
    <div class="launch-main">
      <div class="launch-name">${escapeHtml(b.name)}</div>
      <div class="launch-desc">${escapeHtml(b.files.join(" · "))}</div>
    </div>
  </div>`;
}

// The sub-pages carry a way back of their own, at the top of the pane — the
// launcher's own "back" (the browser's back would go further out).
function newTabBackHtml() {
  return `<button type="button" class="newtab-back" data-action="newtab-back">← back</button>`;
}

// A section head: the label, its count, and — when the section leads somewhere —
// an arrow on the right. Only the arrow opens the sub-page: the label is a label,
// clicking it does nothing.
function newTabSecHeadHtml(title, count, action) {
  const note =
    count === "" || count === undefined
      ? ""
      : `<span class="newtab-sec-note">${count}</span>`;
  const open = action
    ? `<button type="button" class="newtab-sec-open" data-action="${action}" title="open ${title}">more →</button>`
    : "";
  return `<div class="newtab-sec-head"><h3>${title}</h3>${note}${open}</div>`;
}

// toast is the launcher's one-line notice (a suggested candidate cannot be
// changed from here — it points at the agent instead).
let toastTimer = null;
function toast(message) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function newTabError(message) {  const body = newTabEl?.querySelector(".newtab-body");
  if (!body) return;
  const note = document.createElement("div");
  note.className = "empty-hint";
  note.textContent = message;
  body.prepend(note);
}

// The launcher is one column of sections — the blank Chat button, then a
// preview of the skills, then a preview of the blueprints, then the past
// conversations. Skills and blueprints are the **classes** you can instantiate
// (both are plain project files, read through static), recent is the
// **instances** you already had (log owns conversations — a page has no history
// at all, so it never appears here).
//
// The previews show three and lead into a page of their own: a class has more to
// say than a row (its full list, its candidates, its files).
const SUGGESTED_SHOWN = 10;
const NEWTAB_PREVIEW = 3;


// Skills and blueprints are plain files, so they are read through static — the
// same generic query / query-detail the other file views use. A skill keeps its
// display name in the file's frontmatter; a blueprint's name is its document's
// <title>. Both need the file's text, hence one detail call each.
async function newTabFiles(schema, prefix, entry, type) {
  const out = [];
  for (const path of schema[prefix] || []) {
    const m = entry.exec(path);
    if (!m) continue;
    const id = m[1];
    let raw = "";
    try {
      const data = await staticCall("/static/query-detail", { type, id: path });
      raw = String(data?.[type] ?? "");
    } catch (err) {
      // A file we cannot read still gets a row; the name falls back to the id.
      raw = "";
    }
    out.push({ id, path, raw });
  }
  return out;
}

function skillFromFile(id, raw, source) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  let name = id;
  let description = "";
  let body = raw;
  if (front) {
    body = raw.slice(front[0].length);
    const field = (key) => {
      const m = new RegExp(`^${key}\\s*:\\s*(.+)$`, "m").exec(front[1]);
      return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
    };
    name = field("name") || id;
    description = field("description");
  }
  const text = body.trim();
  // The one-line preview: the declared description, else the first non-empty
  // line of the skill itself.
  const firstLine = text.split("\n").map((l) => l.trim()).find(Boolean) || "";
  return { id, name: name || id, desc: description || firstLine, source, status: "active", text };
}

// titleFromHtml reads a document's title. Parse it rather than regex the source:
// the source carries entities (`&amp;`) that must be decoded before the name is
// escaped for display, or the user sees the entity itself.
function titleFromHtml(html) {
  try {
    return new DOMParser().parseFromString(html, "text/html").title.replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

async function newTabReload() {
  const body = newTabEl?.querySelector(".newtab-body");
  if (!body) return;
  // A sub-page is a list to work through, so the pane top-aligns it: the back
  // button belongs at the top of the screen, not floating in the middle of it.
  newTabEl.classList.toggle("subpage", newTabMode !== "home");
  let skills = [];
  let blueprints = [];
  const errors = [];
  try {
    const schema = await loadSchema();
    const [custom, suggested] = await Promise.all([
      newTabFiles(schema, "skills", /^\.agents\/skills\/([^/]+)\/SKILL\.md$/, "skill"),
      newTabFiles(schema, "suggested-skills", /^\.engineer\/suggested-skills\/([^/]+)\.md$/, "suggested-skill"),
    ]);
    skills = [
      ...custom.map((f) => skillFromFile(f.id, f.raw, "custom")),
      ...suggested.map((f) => skillFromFile(f.id, f.raw, "suggested")),
    ];
    const files = schema.blueprints || [];
    blueprints = (await newTabFiles(schema, "blueprints", /^\.agents\/blueprints\/([^/]+)\/index\.html$/, "blueprint")).map((f) => {
      const dir = `.agents/blueprints/${f.id}/`;
      return {
        id: f.id,
        name: titleFromHtml(f.raw) || f.id,
        files: files
          .filter((p) => p.startsWith(dir))
          .map((p) => p.slice(dir.length)),
      };
    });
  } catch (err) {
    errors.push(`static: ${String(err.message || err)}`);
  }
  newTabSkills = new Map(skills.map((t) => [t.id, t]));
  newTabBlueprints = new Map(blueprints.map((b) => [b.id, b]));
  const note = errors.length
    ? errors.map((e) => `<div class="empty-hint">${escapeHtml(e)}</div>`).join("")
    : "";

  if (newTabMode === "skills") {
    body.innerHTML = note + newTabSkillsHtml(skills);
    return;
  }
  if (newTabMode === "blueprints") {
    body.innerHTML = note + newTabBlueprintsHtml(blueprints);
    return;
  }
  const records = await recentTabs();
  body.innerHTML = note + newTabHomeHtml(skills, blueprints, records);
}

// my skills are the ones you kept: files in the project. Suggested is a sample,
// not an archive — the newest few, the rest stays for later.
function newTabMySkills(skills) {
  return skills.filter((t) => t.source === "custom" && t.status === "active");
}

function newTabSuggestions(skills) {
  return skills
    .filter((t) => t.source === "suggested" && t.status === "active")
    .slice(0, SUGGESTED_SHOWN);
}

const NEWTAB_NONE = `<div class="empty-hint">nothing here yet</div>`;

function newTabHomeHtml(skills, blueprints, recent) {  const mine = newTabMySkills(skills);
  return `
    <section class="newtab-sec" data-section="chat">
      <div class="launch-item" data-action="newchat">
        <div class="launch-main">
          <div class="launch-name">Chat</div>
          <div class="launch-desc">a blank conversation — no skill behind it</div>
        </div>
      </div>
    </section>
    <section class="newtab-sec" data-section="skills">
      ${newTabSecHeadHtml("Skills", mine.length, "open-skills")}
      ${mine.length ? `<div class="launch-grid">${mine.slice(0, NEWTAB_PREVIEW).map((t) => newTabSkillItemHtml(t, false)).join("")}</div>` : NEWTAB_NONE}
    </section>
    <section class="newtab-sec" data-section="blueprints">
      ${newTabSecHeadHtml("Blueprints", blueprints.length, "open-blueprints")}
      ${blueprints.length ? `<div class="launch-grid">${blueprints.slice(0, NEWTAB_PREVIEW).map(newTabBlueprintItemHtml).join("")}</div>` : NEWTAB_NONE}
    </section>
    <section class="newtab-sec" data-section="recent">
      ${newTabSecHeadHtml("Recent", "")}
      ${recent.length ? recent.map(newTabTabHtml).join("") : NEWTAB_NONE}
    </section>`;
}

function newTabSkillsHtml(skills) {
  const mine = newTabMySkills(skills);
  const suggested = newTabSuggestions(skills);
  return `
    ${newTabBackHtml()}
    <section class="newtab-sec" data-section="skills-mine">
      ${newTabSecHeadHtml("My skills", "")}
      ${mine.length ? mine.map((t) => newTabSkillItemHtml(t, false)).join("") : NEWTAB_NONE}
    </section>
    <section class="newtab-sec" data-section="skills-suggested">
      ${newTabSecHeadHtml("Suggested", "")}
      ${suggested.length ? suggested.map((t) => newTabSkillItemHtml(t, true)).join("") : NEWTAB_NONE}
    </section>`;
}

function newTabBlueprintsHtml(blueprints) {
  return `
    ${newTabBackHtml()}
    <section class="newtab-sec" data-section="blueprints-all">
      ${newTabSecHeadHtml("Blueprints", "")}
      ${blueprints.length ? blueprints.map(newTabBlueprintItemHtml).join("") : NEWTAB_NONE}
    </section>`;
}

// recentTabs lists tab records, most recently updated first: the ones you are
// not already looking at. An open tab is on the tab bar already — this is how a
// *closed* one is found again. One page of log/tab/list is 100 records, and that
// is what the page shows; the log service is not required for the rest of the
// new tab page.
//
// The launcher lists *tabs*, where /resume lists *sessions*: reopening a
// workspace and pulling a conversation into one are different moves.
async function recentTabs() {
  // Both lists on one round trip's worth of latency: the records are what the
  // section shows, the previews only name the rows.
  const [records, previews] = await Promise.all([tabList().catch(() => []), sessionPreviews()]);
  const open = new Set(openTabs.map((t) => t.tabId).filter(Boolean));
  const list = records.filter((r) => r.tabId && !open.has(r.tabId));
  // A tab record carries a layout, not a title: name each row after what its
  // first pane holds — a chat's session preview, or the blueprint.
  return list.map((r) => {
    const pane = primaryPane(r.layout);
    const label = pane?.content === "page"
      ? newTabBlueprints.get(pane.id)?.name || pane.id
      : previews.get(pane?.id) || pane?.id || r.tabId;
    return { ...r, label, kind: pane?.content || "?" };
  });
}

// sessionPreviews maps sessionId -> its first user message, the same preview
// /resume shows, so a reopened workspace reads like the conversation inside it
// rather than as a bare session id. A failure just leaves the ids as labels.
async function sessionPreviews() {
  const previews = new Map();
  try {
    const res = await fetch(`${LOG_BASE}/log/list`, {
      method: "POST",
      headers: { "Content-Type": "application/yaml" },
      body: yaml.dump({ pageNum: 1 }),
    });
    const data = yaml.load(await res.text()) || {};
    if (res.ok) {
      for (const s of data.sessions || []) {
        previews.set(s.sessionId, aiOneLine(s.preview || "").slice(0, 60));
      }
    }
  } catch (e) {
    // no previews: the ids stand in
  }
  return previews;
}

// A tab record carries a layout, not a title: what it holds is its first pane.
function newTabTabHtml(r) {
  return `<div class="launch-item" data-action="opentab" data-id="${r.tabId}">
    <div class="launch-main">
      <div class="launch-name">${escapeHtml(r.label || r.tabId)}</div>
      <div class="launch-desc">${escapeHtml(r.kind || "?")} · ${escapeHtml(String(r.updatedAt || ""))}</div>
    </div>
  </div>`;
}

// newTabRun opens a skill as a new conversation: a fresh session, with the
// skill's text already in the composer. Nothing is sent — the skill is a
// starting point the user edits and sends themselves.
async function newTabRun(skillId) {
  const skill = newTabSkills.get(skillId);
  try {
    const sessionId = await aiNewSession();
    await openTab(
      { skillId, sessionId, name: skill?.name || skillId, text: skill?.text || "", fresh: true },
      "replace",
    );
  } catch (err) {
    newTabError(String(err.message || err));
  }
}

// newTabBlankChat starts a conversation with no skill behind it — a tab whose
// text is empty, so the panel opens ready for input.
async function newBlankChat() {
  try {
    const sessionId = await aiNewSession();
    await openTab(
      { skillId: "", sessionId, name: "new chat", text: "", fresh: true },
      "replace",
    );
  } catch (err) {
    newTabError(String(err.message || err));
  }
}

// newTabOpenTab reopens a tab record: its layout says what the tab holds, and
// for now one pane fills it. A record whose tab is already open just gets that
// tab activated, so nothing is created twice.
async function newTabOpenTab(recordId) {
  const existing = openTabs.find((t) => t.tabId === recordId);
  if (existing) {
    await activateTab(existing.id, "replace");
    return;
  }
  let rec;
  try {
    rec = await tabDetail(recordId);
  } catch (err) {
    newTabError(String(err.message || err));
    return;
  }
  const pane = primaryPane(rec.layout);
  if (!pane) {
    newTabError(`tab ${recordId} has no pane`);
    return;
  }
  if (pane.content === "page") await openPageTab(pane.id, pane.id, "replace", recordId);
  else await openTab({ skillId: "", sessionId: pane.id, name: "chat", text: "", recordId }, "replace");
}

// newTabOpenPage opens a blueprint as a page tab.
async function newTabOpenPage(pageId) {
  const bp = newTabBlueprints.get(pageId);
  await openPageTab(pageId, bp?.name || pageId, "replace");
}

function newTabClick(event) {
  const hit = event.target.closest("[data-action]");
  if (!hit) return;
  const action = hit.dataset.action;
  const id = hit.dataset.id;
  if (action === "newchat") newBlankChat();
  else if (action === "opentab") newTabOpenTab(id);
  else if (action === "run") newTabRun(id);
  else if (action === "page") newTabOpenPage(id);
  else if (action === "suggest")
    toast("Suggested skill — ask the agent in a chat to add it");
  else if (action === "open-skills") newTabGo("skills");
  else if (action === "open-blueprints") newTabGo("blueprints");
  else if (action === "newtab-back") newTabGo("home", "replace");
}

tabAddEl.addEventListener("click", () => {
  // The launcher has no tab of its own; `+` opens it (or its home page when a
  // sub-page is showing).
  if (newTabOpen && newTabMode !== "home") newTabGo("home", "replace");
  else openNewTab();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && newTabOpen) {
    event.preventDefault();
    // Esc backs out one step at a time: a sub-page first, then the launcher.
    if (newTabMode !== "home") newTabGo("home", "replace");
    else closeNewTab();
  }
});

// ---------- command system ----------

// Commands are recommended as the user types after "/", matched by name or
// description (case-insensitive; name prefix ranks first).
const AI_COMMANDS = [
  { name: "/new", description: "clear and create a new session", run: aiCommandNew },
  {
    name: "/resume",
    description: "list history sessions and resume from one",
    run: aiCommandResume,
  },
];

// The command drawer and the delete dialog belong to the pane being typed in:
// `aiPane.drawer` / `aiPane.confirm`.

function aiMatchCommands(value) {
  const full = value.toLowerCase();
  const bare = full.replace(/^\//, "");
  return AI_COMMANDS.map((cmd) => {
    const name = cmd.name.toLowerCase();
    const words = cmd.description.toLowerCase().split(/\s+/);
    let score = -1;
    if (name.startsWith(full)) score = 0;
    else if (name.includes(full)) score = 1;
    // Description matches on word prefixes so "re" hits "resume", not "create".
    else if (bare && words.some((w) => w.startsWith(bare))) score = 2;
    return { cmd, score };
  })
    .filter((m) => m.score >= 0)
    .sort((a, b) => a.score - b.score)
    .map((m) => m.cmd);
}

function aiOneLine(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function aiDrawerRender(items, kind) {
  aiPane.drawer = { items, index: 0, kind };
  aiCmdEl().innerHTML = "";
  if (kind === "session") {
    // The session picker replaces the input, so give it an explicit way back.
    const back = document.createElement("button");
    back.type = "button";
    back.className = "ai-cmd-back";
    back.textContent = "← 返回对话";
    back.addEventListener("mousedown", (e) => {
      e.preventDefault();
      aiCancelResume();
    });
    aiCmdEl().appendChild(back);
  }
  items.forEach((item, i) => {
    // A div (not a button) so session rows can host their own delete button.
    const row = document.createElement("div");
    row.className =
      "ai-cmd-item" +
      (kind === "session" ? " session" : "") +
      (i === 0 ? " active" : "");
    row.setAttribute("role", "button");
    row.tabIndex = -1;
    const name = document.createElement("span");
    name.className = "ai-cmd-name";
    name.textContent = item.label;
    row.appendChild(name);
    if (kind === "session") {
      // title / message count / last activity / delete, left to right.
      const count = document.createElement("span");
      count.className = "ai-cmd-count";
      count.textContent = item.count != null ? `${item.count} 条` : "";
      const time = document.createElement("span");
      time.className = "ai-cmd-time";
      time.textContent = item.time || "";
      const del = document.createElement("button");
      del.type = "button";
      del.className = "ai-cmd-del";
      del.textContent = "删除";
      del.title = "删除此会话";
      // Stop the row's resume handler from firing.
      del.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        aiConfirmDelete(item);
      });
      count.hidden = !count.textContent;
      time.hidden = !time.textContent;
      row.appendChild(count);
      row.appendChild(time);
      row.appendChild(del);
    } else {
      const desc = document.createElement("span");
      desc.className = "ai-cmd-desc";
      desc.textContent = item.description || "";
      row.appendChild(desc);
    }
    // mousedown (not click) so selecting does not blur the input first.
    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      aiDrawerSelect(i);
    });
    aiCmdEl().appendChild(row);
  });
  if (kind === "session") {
    // Key hints sit in one row below the list; the picker owns the keyboard.
    const hint = document.createElement("div");
    hint.className = "ai-cmd-hint";
    const l1 = document.createElement("span");
    l1.textContent = "enter - switch to this session";
    const l2 = document.createElement("span");
    l2.textContent = "d - delete this session";
    hint.appendChild(l1);
    hint.appendChild(l2);
    aiCmdEl().appendChild(hint);
  }
  aiCmdEl().hidden = false;
  if (kind === "session") aiCmdEl().focus();
}

function aiDrawerHide() {
  if (!aiPane) return;
  aiPane.drawer = null;
  aiCmdEl().hidden = true;
  aiCmdEl().innerHTML = "";
}

// aiCancelResume leaves the session picker and returns to the normal chat flow.
function aiCancelResume() {
  aiDrawerHide();
  aiInputEl().disabled = false;
  aiInputEl().focus();
}

// aiConfirmDelete opens a modal over the session picker asking whether to
// delete the highlighted session. Esc (handled globally) cancels it.
function aiConfirmDelete(item) {
  if (!aiPane || aiPane.confirm || !item || !item.sessionId) return;
  if (!aiPane) return;
  aiPane.confirm = { sessionId: item.sessionId, label: item.label };
  const overlay = document.createElement("div");
  overlay.className = "ai-confirm";
  overlay.tabIndex = -1;
  const box = document.createElement("div");
  box.className = "ai-confirm-box";
  const msg = document.createElement("p");
  msg.className = "ai-confirm-msg";
  msg.textContent = `删除会话「${item.label}」？此操作不可撤销。`;
  const actions = document.createElement("div");
  actions.className = "ai-confirm-actions";
  const del = document.createElement("button");
  del.type = "button";
  del.className = "ai-confirm-delete";
  del.textContent = "删除";
  del.addEventListener("click", () => aiConfirmAccept());
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "ai-confirm-cancel";
  cancel.textContent = "取消 (Esc)";
  cancel.addEventListener("click", () => aiConfirmClose());
  actions.appendChild(del);
  actions.appendChild(cancel);
  box.appendChild(msg);
  box.appendChild(actions);
  overlay.appendChild(box);
  // Clicking outside the box cancels; clicks inside must not.
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) {
      e.preventDefault();
      aiConfirmClose();
    }
  });
  // Enter confirms; Esc is handled by the global listener (it unwinds this
  // modal one layer before touching the drawer).
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      aiConfirmAccept();
    }
  });
  document.body.appendChild(overlay);
  del.focus();
}

function aiConfirmClose() {
  if (!aiPane?.confirm) return;
  aiPane.confirm = null;
  const el = document.querySelector(".ai-confirm");
  if (el) el.remove();
  if (aiPane.drawer) aiCmdEl().focus();
}

// aiConfirmAccept purges the session from both the live ai registry and the log
// history, then updates the picker.
async function aiConfirmAccept() {
  if (!aiPane?.confirm) return;
  const sessionId = aiPane.confirm.sessionId;
  aiConfirmClose();
  try {
    // Free the in-memory session if it is live; 404 just means it was idle.
    await fetch(`${AI_BASE}/ai/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/yaml" },
      body: yaml.dump({ id: sessionId }),
    });
    const res = await fetch(`${LOG_BASE}/log/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/yaml" },
      body: yaml.dump({ sessionId }),
    });
    const data = yaml.load(await res.text()) || {};
    if (!res.ok) throw new Error(data.error?.message || res.status);
    if (openTabs.some((t) => [...(t.panes?.values() ?? [])].some((p) => p.session === sessionId))) {
      // A pane on screen was showing it; that pane starts a fresh conversation
      // (leaving it pointed at a deleted session would 404 on the next reopen),
      // and the picker is left.
      const tab = openTabs.find((t) => [...(t.panes?.values() ?? [])].some((p) => p.session === sessionId));
      const pane = [...(tab?.panes?.values() ?? [])].find((p) => p.session === sessionId);
      aiHistoryClear(sessionId);
      if (tab?.tabId) {
        const fresh = await aiNewSession();
        pane.session = fresh;
        pane.seenSeq = 0;
        pane.loaded = false;
        applyPaneLayout(tab, { pane: { content: "chat", id: fresh } });
        tab.sessionId = fresh;
        tab.skillId = "";
        tab.name = "new chat";
        tab.text = "";
        saveTabs();
        renderTabs();
        syncTabUrl(tab, "replace");
      }
      aiCancelResume();
      return;
    }
    aiDrawerRemove(sessionId);
  } catch (err) {
    aiAppend("assistant", `[error] ${err.message}`);
  }
}

// aiDrawerRemove drops a deleted session from the picker, or leaves it when
// none remain.
function aiDrawerRemove(sessionId) {
  if (!aiPane.drawer || aiPane.drawer.kind !== "session") return;
  const items = aiPane.drawer.items.filter((it) => it.sessionId !== sessionId);
  if (!items.length) {
    aiAppend("assistant", "没有可恢复的历史会话。");
    aiCancelResume();
    return;
  }
  const index = Math.min(aiPane.drawer.index, items.length - 1);
  aiDrawerRender(items, "session");
  aiPane.drawer.index = index;
  aiCmdEl().querySelectorAll(".ai-cmd-item").forEach((el, i) => {
    el.classList.toggle("active", i === index);
  });
}

function aiDrawerMove(delta) {
  if (!aiPane.drawer) return;
  const n = aiPane.drawer.items.length;
  aiPane.drawer.index = (aiPane.drawer.index + delta + n) % n;
  aiCmdEl().querySelectorAll(".ai-cmd-item").forEach((el, i) => {
    el.classList.toggle("active", i === aiPane.drawer.index);
    if (i === aiPane.drawer.index) el.scrollIntoView({ block: "nearest" });
  });
}

function aiDrawerSelect(index) {
  if (!aiPane.drawer) return;
  const item = aiPane.drawer.items[index];
  if (!item) return;
  aiDrawerHide();
  aiInputEl().value = "";
  aiResizeInput();
  item.run();
}

// aiSyncCommandDrawer opens/filters the command drawer while the first token
// looks like a command (starts with "/" and has no whitespace yet).
function aiSyncCommandDrawer() {
  if (aiPane.drawer && aiPane.drawer.kind === "session") return;
  const v = aiInputEl().value;
  if (!v.startsWith("/") || /\s/.test(v)) {
    aiDrawerHide();
    return;
  }
  const items = aiMatchCommands(v).map((cmd) => ({
    label: cmd.name,
    description: cmd.description,
    run: cmd.run,
  }));
  if (!items.length) {
    aiDrawerHide();
    return;
  }
  aiDrawerRender(items, "command");
}

// aiCommandNew implements /new: it cancels the current chat instance (its tab)
// and opens a fresh generic chat in the same slot. Clearing the view alone
// would leave the tab bound to the old session, which reappears the next time
// the tab is reopened.
async function aiCommandNew() {
  aiDrawerHide();
  const idx = openTabs.findIndex((t) => t.id === activeTabId);
  try {
    // /new keeps the tab it replaces: same slot, same record, new conversation.
    const tabId = await ensureTabId(openTabs[idx >= 0 ? idx : 0] || {});
    const sessionId = await aiNewSession();
    const tab = {
      id: `tab_${Math.random().toString(36).slice(2, 10)}`,
      tabId,
      skillId: "",
      sessionId,
      name: "new chat",
      text: "",
      fresh: true,
      panes: new Map(),
      layout: null,
    };
    if (idx < 0) {
      openTabs.push(tab);
    } else {
      // The same tab, a fresh instance: it keeps its record (and so its
      // tabId), and the layout's pane is repointed at the new session below.
      tab.tabId = openTabs[idx].tabId || "";
      openTabs[idx] = tab; // the slot now owns the fresh instance
    }
    if (tab.tabId) {
      try {
        const rec = await tabPut(tab.tabId, tabLayoutOf(tab));
        if (rec.layout) tab.layout = rec.layout;
      } catch (err) {
        logTabRecordError(err);
      }
    }
    // The slot's old conversation is gone from the DOM; force a redraw.
    renderedTabId = null;
    saveTabs();
    renderTabs();
    // The instance changed session in place: the URL follows it without leaving
    // the cancelled session behind in history.
    await activateTab(tab.id, "replace");
  } catch (err) {
    aiAppend("assistant", `[error] ${err.message}`);
  }
  aiInputEl().focus();
}

async function aiCommandResume() {
  // Input is disabled while the session picker is open; it is re-enabled once a
  // session is resumed or the picker is dismissed.
  aiInputEl().disabled = true;
  try {
    const res = await fetch(`${LOG_BASE}/log/list`, {
      method: "POST",
      headers: { "Content-Type": "application/yaml" },
      body: yaml.dump({ pageNum: 1 }),
    });
    const data = yaml.load(await res.text()) || {};
    if (!res.ok) throw new Error(data.error?.message || res.status);
    const sessions = data.sessions || [];
    if (!sessions.length) {
      aiAppend("assistant", "没有可恢复的历史会话。");
      aiCancelResume();
      return;
    }
    aiDrawerRender(
      sessions.map((s) => ({
        label: aiOneLine(s.preview).slice(0, 80) || s.sessionId,
        description: `${s.count} 条 · ${s.lastAt}`,
        count: s.count,
        time: s.lastAt,
        sessionId: s.sessionId,
        run: () => aiResumeSession(s.sessionId, aiOneLine(s.preview).slice(0, 80)),
      })),
      "session",
    );
  } catch (err) {
    aiCancelResume();
    aiAppend("assistant", `[error] ${err.message}`);
  }
}

// aiLoadSession resumes an existing session: rebuild the server-side context
// from log, replay the recorded messages, then reattach to the live stream when
// a run is still in flight. Throws on failure so callers can choose a fallback.
// aiImageSrc turns a stored image block into a displayable src: a content-
// addressed blob URL for refs, or an inline data URL for raw base64.
function aiImageSrc(b) {
  if (b && b.sha256) return `${AI_BASE}/blobs/${b.sha256}`;
  if (b && b.data) return `data:${b.mimeType || "image/png"};base64,${b.data}`;
  return "";
}

// aiRenderRaw replays one stored pi message. `tools` carries tool bubbles across
// messages so a toolResult can fill the block opened by its toolCall, and
// `prompts` collects the user's text turns for the composer's history.
function aiRenderRaw(raw, tools, prompts) {
  if (!raw || !raw.role) return;
  if (raw.role === "user") {
    const content =
      typeof raw.content === "string"
        ? [{ type: "text", text: raw.content }]
        : raw.content || [];
    const parts = [];
    for (const b of content) {
      if (b.type === "text" && b.text) parts.push({ type: "text", text: b.text });
      else if (b.type === "image") {
        const src = aiImageSrc(b);
        if (src) parts.push({ type: "image", src });
      }
    }
    if (parts.length) {
      aiAppendUserParts(parts);
      // A turn that carried an image is not recallable: its text alone would
      // come back without the image it named.
      if (prompts && !parts.some((p) => p.type === "image")) {
        prompts.push(parts.map((p) => p.text).join(""));
      }
    }
    return;
  }
  if (raw.role === "assistant") {
    for (const b of raw.content || []) {
      if (b.type === "text" && b.text) aiStaticMarkdown(b.text);
      else if (b.type === "thinking" && b.thinking) {
        const t = aiThinking();
        t.body.textContent = b.thinking;
        aiSettle(t.block, "done");
      } else if (b.type === "toolCall") {
        // A question is a card, not a chip — same as on the live path.
        if (b.name !== "ask_user") tools.set(b.id, aiTool(b.name, b.arguments));
      }
    }
    return;
  }
  if (raw.role === "toolResult") {
    const t = tools.get(raw.toolCallId);
    if (!t) return;
    const out = (Array.isArray(raw.content) ? raw.content : [])
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text)
      .join("\n");
    if (out) t.body.textContent += `\n${out}`;
    aiSettle(t.block, raw.isError ? "error" : "done");
    tools.delete(raw.toolCallId);
    return;
  }
  if (raw.role === "compaction") {
    aiChipRowEnd(); // a note is not a chip: it ends the run's chip row
    const div = document.createElement("div");
    div.className = "ai-msg ai-compaction";
    div.textContent = "上下文已压缩";
    aiMsgEl().appendChild(div);
  }
}

// aiRenderLegacy replays a pre-raw record (msgKind/blocks/content).
function aiRenderLegacy(m, prompts) {
  if (m.role === "assistant" || m.msgKind === "assistant") {
    if (m.content) aiStaticMarkdown(m.content);
    return;
  }
  const blocks =
    Array.isArray(m.blocks) && m.blocks.length
      ? m.blocks
      : m.content
        ? [{ type: "text", text: m.content }]
        : [];
  const parts = [];
  for (const b of blocks) {
    if (b.type === "text" && b.text) parts.push({ type: "text", text: b.text });
    else if (b.type === "image") {
      const src = aiImageSrc(b);
      if (src) parts.push({ type: "image", src });
    }
  }
  if (parts.length) {
    aiAppendUserParts(parts);
    if (prompts && !parts.some((p) => p.type === "image")) {
      prompts.push(parts.map((p) => p.text).join(""));
    }
  }
}

// aiRenderHistory replays a session's stored records into the message area, and
// seeds the composer's prompt history from the same walk — the user turns are
// being read here anyway, so the recall list costs no second request and no
// second parser.
function aiRenderHistory(pane, messages, sessionId) {
  aiRenderPane = pane;
  pane.messagesEl.innerHTML = "";
  const tools = new Map(); // toolCallId -> { block, body }
  const prompts = [];
  for (const m of messages) {
    if (m.raw) aiRenderRaw(m.raw, tools, prompts);
    else aiRenderLegacy(m, prompts);
  }
  aiRenderPane = null;
  aiHistorySeed(sessionId, prompts);
}

// aiLoadSession fills one chat pane with an existing session: it rebuilds the
// server-side context, replays the recorded messages into the pane's own list,
// and reattaches the pane's stream when a run is still in flight.
async function aiLoadSession(pane, id) {
  aiCancelStream(pane);
  const res = await fetch(`${AI_BASE}/ai/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: yaml.dump({ id }),
  });
  const data = yaml.load(await res.text()) || {};
  if (!res.ok) throw new Error(data.error?.message || res.status);
  const detailRes = await fetch(`${LOG_BASE}/log/session-detail`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: yaml.dump({ sessionId: id }),
  });
  const detail = yaml.load(await detailRes.text()) || {};
  aiRenderHistory(pane, detail.messages || [], id);
  // Continue the same session; skip the events already emitted so a resumed
  // in-memory session does not replay old ones.
  pane.session = id;
  pane.seenSeq = Number(data.lastSeq) || 0;
  // The run may still be executing server-side (our stream was cut); reattach so
  // the events emitted while we were away are replayed from lastSeq.
  if (data.active) await aiStream(pane);
}

async function aiResumeSession(id, name) {
  aiInputEl().disabled = true;
  try {
    await aiLoadSession(aiPane, id);
    rebindActiveTab(id, name);
  } catch (err) {
    aiAppend("assistant", `[error] ${err.message}`);
  } finally {
    aiInputEl().disabled = false;
    aiInputEl().focus();
  }
}

function syncThemeMenu() {
  const cur = currentTheme();
  for (const btn of themeMenuEl.querySelectorAll("button[data-theme]")) {
    btn.classList.toggle("active", btn.dataset.theme === cur);
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

// Soft wrapping depends on the input's width, so a resized window changes the
// rendered line count and the box has to be measured again.
window.addEventListener("resize", aiResizeInput);

// ---------- one composer per pane ----------
//
// The handlers below are registered by bindComposer on each pane's own
// composer; each closes over its pane, so it acts on the conversation it
// belongs to. Only the measuring mirror trick is shared — every pane needs it.

// A paste carrying images goes through the same path as the paste button.
function aiPaste(event) {
  const files = [...(event.clipboardData?.items || [])]
    .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
    .map((it) => it.getAsFile())
    .filter(Boolean);
  if (!files.length) return;
  event.preventDefault();
  for (const file of files) aiAddPastedImage(file);
}

// Keep the caret out of [image] tokens and keep image tokens whole on edit.
function aiBeforeInput(event) {
  const input = aiInputEl();
  if (!event.inputType || !event.inputType.startsWith("insert")) return;
  if (input.selectionStart !== input.selectionEnd) return;
  if (aiTokenInside(input.value, input.selectionStart)) {
    event.preventDefault();
    aiSnapCaretOutOfToken();
  }
}

function aiCutImageToken() {
  const input = aiInputEl();
  const v = input.value;
  const s = input.selectionStart;
  const e = input.selectionEnd;
  if (s === e) return;
  const range = aiExpandTokenRange(v, s, e);
  if (!range) return;
  aiRemoveImagesForRange(v, range[0], range[1]);
  input.setSelectionRange(range[0], range[1]);
}

function aiInputKeydown(event) {
  // While the command drawer is open it owns navigation / selection keys.
  if (aiPane.drawer && aiPane.drawer.kind === "command") {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      aiDrawerMove(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      aiDrawerMove(-1);
      return;
    }
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      aiDrawerSelect(aiPane.drawer.index);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const cmd = aiPane.drawer.items[aiPane.drawer.index];
      if (cmd) {
        aiInputEl().value = cmd.label;
        aiDrawerHide();
        aiResizeInput();
      }
      return;
    }
  }
  // ArrowUp / ArrowDown recall the prompts sent from this composer. The command
  // drawer above owns them while it is open, and a staged image blocks the
  // recall: a plain-text entry would strip the [image] token that pairs with it.
  if (
    (event.key === "ArrowUp" || event.key === "ArrowDown") &&
    !event.isComposing &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    !aiPane.images.length
  ) {
    if (event.key === "ArrowUp" && (aiInputEl().value === "" || aiCaretVisualLine().first)) {
      if (aiHistoryUp(aiPane?.session)) {
        event.preventDefault();
        return;
      }
    }
    if (event.key === "ArrowDown" && aiHistoryDown(aiPane?.session)) {
      event.preventDefault();
      return;
    }
  }
  // Atomic [image] tokens: Backspace/Delete removes the whole token.
  if (event.key === "Backspace" || event.key === "Delete") {
    const v = aiInputEl().value;
    const s = aiInputEl().selectionStart;
    const e = aiInputEl().selectionEnd;
    let range = null;
    if (s !== e) {
      range = aiExpandTokenRange(v, s, e);
    } else if (event.key === "Backspace") {
      range = aiTokenEndingAt(v, s) || aiTokenInside(v, s);
    } else {
      range = aiTokenStartingAt(v, s) || aiTokenInside(v, s);
    }
    if (range) {
      event.preventDefault();
      aiRemoveImagesForRange(v, range[0], range[1]);
      aiInputEl().value = v.slice(0, range[0]) + v.slice(range[1]);
      aiInputEl().setSelectionRange(range[0], range[0]);
      aiResizeInput();
      aiSyncCommandDrawer();
      return;
    }
  }
  if (event.key !== "Enter") return;
  if (event.isComposing || event.keyCode === 229) return; // IME 组词确认,不发送
  if (event.shiftKey) return; // Shift+Enter 换行
  event.preventDefault(); // Enter 发送
  aiSend();
}

// The session picker runs with the input disabled, so its keyboard navigation
// lives on the drawer element; bindComposer wires that per pane, and tracks IME
// composition on the pane (pane.composing) because on macOS the keydown that
// begins pinyin composition can arrive with isComposing false.
function aiCmdKeydown(pane, event) {
  if (!pane.drawer) return;
  if (pane.confirm) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    aiDrawerMove(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    aiDrawerMove(-1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    aiDrawerSelect(pane.drawer.index);
  } else if (
    (event.key === "d" || event.key === "D") &&
    pane.drawer.kind === "session"
  ) {
    // Only a genuinely typed "d" deletes; ignore IME composition keystrokes so
    // typing pinyin (or committing a candidate with Enter) never triggers it.
    if (pane.composing || event.isComposing || event.keyCode === 229) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    pane.confirmDelete(pane.drawer.items[pane.drawer.index]);
  }
}

window.addEventListener("popstate", route);

renderTabs();
newTabInit();

// The URL decides which view is on screen — including which conversation tab —
// so nothing here restores an active tab from storage: route() renders
// /chat/<sessionId> by itself, and every other path is a fixed view.
route();
refresh();
subscribeSchemaStream();


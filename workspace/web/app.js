import { Graph, CanvasBlock } from "./vendor/graph.js";
import yaml from "./vendor/js-yaml.js";
import MarkdownIt from "./vendor/markdown-it.js";
import DOMPurify from "./vendor/dompurify.js";
import hljs from "./vendor/highlight.js";

// Runtime addresses are injected by the launcher and served as /config.js
// (see serve.js). Fall back to the default ports when opened without it.
const RUNTIME = window.CORAZON ?? {
  static: "http://localhost:7502",
  ai: "http://localhost:7501",
  log: "http://localhost:7503",
};
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
    body: yaml.dump({ env: "dev", kinds: "schema" }),
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
    hidePanel();
    route();
  } catch (err) {
    contentEl.hidden = false;
    graphEl.hidden = true;
    contentEl.innerHTML = `<div class="empty-hint">load failed: ${escapeHtml(err.message)} (is static running on ${STATIC_BASE}?)</div>`;
  }
}

function createGraph(blocks, connections) {
  const g = new Graph(
    {
      configurationName: "corazon",
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
const THEME_KEY = "corazon.theme";

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
const SECTIONS = ["runtime", "devtime", "contracts", "docs", "notes"];
const SECTION_DETAIL_TYPE = {
  runtime: "runtime",
  contracts: "contract",
  devtime: "devtime",
  docs: "docs",
  notes: "notes",
};

function parseRoute() {
  const parts = location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return { view: "graph" };
  const [section, ...rest] = parts;
  if (!SECTIONS.includes(section)) return { view: "graph" };
  if (!rest.length) return { view: section };
  return { view: section, id: `${section}/${rest.join("/")}` };
}

function navigate(path) {
  history.pushState(null, "", path);
  route();
}

function entryHref(id) {
  return "/" + id.split("/").map(encodeURIComponent).join("/");
}

function route() {
  const r = parseRoute();
  currentView = r.view;
  for (const btn of document.querySelectorAll("#menu button")) {
    btn.classList.toggle("active", btn.dataset.view === r.view);
  }
  hidePanel();
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

document.getElementById("menu").addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-view]");
  if (!btn) return;
  navigate(btn.dataset.view === "graph" ? "/" : `/${btn.dataset.view}`);
});

contentEl.addEventListener("click", (event) => {
  const link = event.target.closest("a");
  if (!link) return;
  event.preventDefault();
  navigate(link.getAttribute("href"));
});

// ---------- ai panel ----------

const aiEl = document.getElementById("ai");
const aiToggleEl = document.getElementById("ai-toggle");
const themeToggleEl = document.getElementById("theme-toggle");
const themeMenuEl = document.getElementById("theme-menu");
const aiMessagesEl = document.getElementById("ai-messages");
const aiInputEl = document.getElementById("ai-input-field");
const aiSendEl = document.getElementById("ai-send");
const aiStopEl = document.getElementById("ai-stop");
const aiCmdEl = document.getElementById("ai-cmd");
let aiSession = null;
let aiSeenSeq = 0;
let aiStreaming = false;
// Images pasted into the input, in token order: { data, mimeType } or undefined
// while compression is still in flight; aiImageTasks lets send() await them.
let aiImages = [];
let aiImageTasks = [];

// Stick to the bottom only while the user is already at the bottom; if they
// scrolled up to read history, new messages must not yank them back down.
// Callers capture aiAtBottom() *before* mutating the DOM, since appending
// content moves the bottom away and would otherwise read as "not at bottom".
const AI_STICK_THRESHOLD = 40;

function aiAtBottom() {
  return (
    aiMessagesEl.scrollHeight - aiMessagesEl.scrollTop - aiMessagesEl.clientHeight <=
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
  aiMessagesEl.scrollTop = aiMessagesEl.scrollHeight;
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
  const div = document.createElement("div");
  div.className = "ai-msg ai-assistant ai-markdown";
  const stick = aiAtBottom();
  aiMessagesEl.appendChild(div);
  if (stick) aiScrollToBottom();
  let raw = "";
  let scheduled = false;
  let rafId = 0;
  const render = () => {
    scheduled = false;
    div.innerHTML = renderMarkdown(raw);
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

function aiSetStreaming(v) {
  aiStreaming = v;
  aiStopEl.hidden = !v;
  if (!v) aiStopEl.disabled = false;
}

async function aiStop() {
  if (!aiSession || !aiStreaming) return;
  aiStopEl.disabled = true;
  try {
    await fetch(`${AI_BASE}/ai/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/yaml" },
      body: yaml.dump({ id: aiSession }),
    });
  } catch {
    // The terminal agent_settled closes the stream and resets the UI.
  }
}

function aiAppend(role, text) {
  const div = document.createElement("div");
  div.className = `ai-msg ai-${role}`;
  div.textContent = text;
  const stick = aiAtBottom();
  aiMessagesEl.appendChild(div);
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

function aiInsertImageToken() {
  const start = aiInputEl.selectionStart ?? aiInputEl.value.length;
  const end = aiInputEl.selectionEnd ?? start;
  const v = aiInputEl.value;
  aiInputEl.value = v.slice(0, start) + AI_IMAGE_TOKEN + v.slice(end);
  const caret = start + AI_IMAGE_TOKEN.length;
  aiInputEl.setSelectionRange(caret, caret);
}

function aiAddPastedImage(file) {
  const idx = aiImages.length;
  aiImages.push(undefined); // reserve the slot so order survives async decode
  aiInsertImageToken();
  aiImageTasks.push(
    aiCompressImage(file)
      .then((img) => {
        aiImages[idx] = img;
      })
      .catch(() => {}),
  );
}

function aiClearImages() {
  aiImages = [];
  aiImageTasks = [];
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
  for (let k = drops.length - 1; k >= 0; k--) aiImages.splice(drops[k], 1);
}

function aiSnapCaretOutOfToken() {
  if (aiInputEl.selectionStart !== aiInputEl.selectionEnd) return;
  const v = aiInputEl.value;
  const inside = aiTokenInside(v, aiInputEl.selectionStart);
  if (!inside) return;
  const p = aiInputEl.selectionStart;
  const [s, e] = inside;
  const to = p - s < e - p ? s : e;
  aiInputEl.setSelectionRange(to, to);
}

// aiAppendUserParts renders a user bubble from ordered parts:
//   { type: "text", text } | { type: "image", src }
function aiAppendUserParts(parts) {
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
  aiMessagesEl.appendChild(div);
  aiScrollToBottom(); // own message always reveals
  return div;
}

async function aiNew() {
  const res = await fetch(`${AI_BASE}/ai/new`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: "{}",
  });
  const data = yaml.load(await res.text());
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  aiSession = data.sessionId;
  aiSeenSeq = 0;
}

// aiCollapse builds a block that is collapsed by default: a clickable header
// with a title + loading indicator, and a fixed-height body that scrolls
// internally once expanded.
function aiCollapse(kind, title) {
  const wrap = document.createElement("div");
  wrap.className = `ai-msg ai-collapse ai-${kind}`;
  const head = document.createElement("button");
  head.type = "button";
  head.className = "ai-collapse-head";
  const titleEl = document.createElement("span");
  titleEl.className = "ai-collapse-title";
  titleEl.textContent = title;
  const status = document.createElement("span");
  status.className = "ai-collapse-status ai-loading";
  const caret = document.createElement("span");
  caret.className = "ai-collapse-caret";
  caret.textContent = "▸";
  head.appendChild(titleEl);
  head.appendChild(status);
  head.appendChild(caret);
  const body = document.createElement("div");
  body.className = "ai-collapse-body";
  body.hidden = true;
  head.addEventListener("click", () => {
    body.hidden = !body.hidden;
    wrap.classList.toggle("open", !body.hidden);
    // Reveal from the top, not the bottom: an expanded block should show the
    // beginning of the thinking / tool output first.
    if (!body.hidden) body.scrollTop = 0;
  });
  const stick = aiAtBottom();
  wrap.appendChild(head);
  wrap.appendChild(body);
  aiMessagesEl.appendChild(wrap);
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
  const block = aiCollapse("thinking", "thinking");
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
  const block = aiCollapse("tool", toolName);
  const body = document.createElement("pre");
  body.className = "ai-tool-body";
  body.textContent = aiStringify(args);
  block.body.appendChild(body);
  return { block, body };
}

// ask_user renders as a question card; picking an option calls onPick(value).
function aiAskUser(args, onPick) {
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
  aiMessagesEl.appendChild(div);
  if (stick) aiScrollToBottom();
}

// aiStream subscribes to the session's SSE. A mid-run ask is steered into the
// run already covered by the live stream, so when one is active we must not
// open a second subscription (that would race over aiSeenSeq and re-render).
async function aiStream() {
  if (aiStreaming) return;
  aiSetStreaming(true);
  try {
    await aiStreamOnce();
  } finally {
    aiSetStreaming(false);
  }
}

async function aiStreamOnce() {
  const res = await fetch(`${AI_BASE}/ai/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: yaml.dump({ id: aiSession }),
  });
  if (!res.ok || !res.body) {
    const data = yaml.load(await res.text().catch(() => "")) || {};
    aiAppend("assistant", `[error] ${data.error?.message || res.status}`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let assistant = null; // current assistant markdown bubble: { el, append, flush }
  let thinking = null; // current thinking block: { block, body }
  const tools = new Map(); // toolCallId -> { block, body }

  const handle = (ev) => {
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
      return;
    }
    if (ev.type === "error") {
      aiAppend("assistant", `[error] ${ev.error?.message || ""}`);
      assistant = null;
      return;
    }
  };

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
      if (typeof ev.seq === "number") {
        if (ev.seq <= aiSeenSeq) continue; // already rendered from an earlier stream
        aiSeenSeq = ev.seq;
      }
      handle(ev);
    }
  }
}

async function aiSend() {
  const text = aiInputEl.value;
  if (!text.trim() || !aiSession) return;
  aiDrawerHide();
  aiInputEl.value = "";
  await Promise.all(aiImageTasks); // let any in-flight paste finish decoding
  const images = aiImages;
  aiClearImages();
  const blocks = aiBuildSendBlocks(text, images);
  // Local bubble: text + real images (the [image] tokens are not shown).
  const parts = blocks.map((b) =>
    b.type === "text"
      ? { type: "text", text: b.text }
      : { type: "image", src: b.url },
  );
  aiAppendUserParts(parts);
  const wire = blocks.map((b) =>
    b.type === "text"
      ? { type: "text", text: b.text }
      : { type: "image", data: b.data, mimeType: b.mimeType },
  );
  const res = await fetch(`${AI_BASE}/ai/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: yaml.dump({ id: aiSession, blocks: wire }),
  });
  const data = yaml.load(await res.text()) || {};
  if (!res.ok) {
    aiAppend("assistant", `[error] ${data.error?.message || res.status}`);
    return;
  }
  await aiStream();
}

// aiAnswer sends a user's reply to a pending ask_user question via the
// dedicated endpoint, then consumes the new run's stream.
async function aiAnswer(answer) {
  aiAppend("user", answer);
  const res = await fetch(`${AI_BASE}/ai/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/yaml" },
    body: yaml.dump({ id: aiSession, answer }),
  });
  const data = yaml.load(await res.text()) || {};
  if (!res.ok) {
    aiAppend("assistant", `[error] ${data.error?.message || res.status}`);
    return;
  }
  await aiStream();
}

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

let aiDrawer = null; // { items, index, kind }

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
  aiDrawer = { items, index: 0, kind };
  aiCmdEl.innerHTML = "";
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
    aiCmdEl.appendChild(back);
  }
  items.forEach((item, i) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "ai-cmd-item" + (i === 0 ? " active" : "");
    const name = document.createElement("span");
    name.className = "ai-cmd-name";
    name.textContent = item.label;
    const desc = document.createElement("span");
    desc.className = "ai-cmd-desc";
    desc.textContent = item.description || "";
    row.appendChild(name);
    row.appendChild(desc);
    // mousedown (not click) so selecting does not blur the input first.
    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      aiDrawerSelect(i);
    });
    aiCmdEl.appendChild(row);
  });
  aiCmdEl.hidden = false;
  if (kind === "session") aiCmdEl.focus();
}

function aiDrawerHide() {
  aiDrawer = null;
  aiCmdEl.hidden = true;
  aiCmdEl.innerHTML = "";
}

// aiCancelResume leaves the session picker and returns to the normal chat flow.
function aiCancelResume() {
  aiDrawerHide();
  aiInputEl.disabled = false;
  aiInputEl.focus();
}

function aiDrawerMove(delta) {
  if (!aiDrawer) return;
  const n = aiDrawer.items.length;
  aiDrawer.index = (aiDrawer.index + delta + n) % n;
  aiCmdEl.querySelectorAll(".ai-cmd-item").forEach((el, i) => {
    el.classList.toggle("active", i === aiDrawer.index);
    if (i === aiDrawer.index) el.scrollIntoView({ block: "nearest" });
  });
}

function aiDrawerSelect(index) {
  if (!aiDrawer) return;
  const item = aiDrawer.items[index];
  if (!item) return;
  aiDrawerHide();
  aiInputEl.value = "";
  item.run();
}

// aiSyncCommandDrawer opens/filters the command drawer while the first token
// looks like a command (starts with "/" and has no whitespace yet).
function aiSyncCommandDrawer() {
  if (aiDrawer && aiDrawer.kind === "session") return;
  const v = aiInputEl.value;
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

async function aiCommandNew() {
  aiMessagesEl.innerHTML = "";
  aiClearImages();
  try {
    await aiNew();
  } catch (err) {
    aiAppend("assistant", `[error] ${err.message}`);
  }
  aiInputEl.focus();
}

async function aiCommandResume() {
  // Input is disabled while the session picker is open; it is re-enabled once a
  // session is resumed or the picker is dismissed.
  aiInputEl.disabled = true;
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
        run: () => aiResumeSession(s.sessionId),
      })),
      "session",
    );
  } catch (err) {
    aiCancelResume();
    aiAppend("assistant", `[error] ${err.message}`);
  }
}

async function aiResumeSession(id) {
  try {
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
    aiMessagesEl.innerHTML = "";
    for (const m of detail.messages || []) {
      if (m.msgKind === "assistant") {
        if (m.content) aiStaticMarkdown(m.content);
        continue;
      }
      const blocks =
        Array.isArray(m.blocks) && m.blocks.length
          ? m.blocks
          : m.content
            ? [{ type: "text", text: m.content }]
            : [];
      const parts = [];
      for (const b of blocks) {
        if (b.type === "text" && b.text) {
          parts.push({ type: "text", text: b.text });
        } else if (b.type === "image" && b.sha256) {
          parts.push({ type: "image", src: `${AI_BASE}/blobs/${b.sha256}` });
        }
      }
      if (parts.length) aiAppendUserParts(parts);
    }
    // Continue the same session; skip events the server already emitted so a
    // resumed in-memory session does not replay old ones.
    aiSession = id;
    aiSeenSeq = Number(data.lastSeq) || 0;
    aiScrollToBottom();
  } catch (err) {
    aiAppend("assistant", `[error] ${err.message}`);
  } finally {
    aiInputEl.disabled = false;
    aiInputEl.focus();
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

const AI_OPEN_KEY = "corazon.ai.open";

// Open/close state is persisted so a refresh keeps the panel where it was.
function aiSetOpen(open) {
  aiEl.hidden = !open;
  aiToggleEl.classList.toggle("active", open);
  try {
    localStorage.setItem(AI_OPEN_KEY, open ? "1" : "0");
  } catch (e) {}
  graph?.updateSize();
}

async function aiOpen() {
  aiSetOpen(true);
  if (!aiSession) {
    try {
      await aiNew();
    } catch (err) {
      aiAppend("assistant", `[error] ${err.message}`);
    }
  }
  aiInputEl.focus();
}

aiToggleEl.addEventListener("click", () => {
  if (aiEl.hidden) aiOpen();
  else aiSetOpen(false);
});

aiSendEl.addEventListener("click", aiSend);
aiStopEl.addEventListener("click", aiStop);
aiInputEl.addEventListener("input", aiSyncCommandDrawer);

aiInputEl.addEventListener("paste", (event) => {
  const files = [...(event.clipboardData?.items || [])]
    .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
    .map((it) => it.getAsFile())
    .filter(Boolean);
  if (!files.length) return;
  event.preventDefault();
  for (const file of files) aiAddPastedImage(file);
});

// Keep the caret out of [image] tokens and keep image tokens whole on edit.
aiInputEl.addEventListener("keyup", aiSnapCaretOutOfToken);
aiInputEl.addEventListener("click", aiSnapCaretOutOfToken);
aiInputEl.addEventListener("select", aiSnapCaretOutOfToken);
aiInputEl.addEventListener("beforeinput", (event) => {
  if (!event.inputType || !event.inputType.startsWith("insert")) return;
  if (aiInputEl.selectionStart !== aiInputEl.selectionEnd) return;
  if (aiTokenInside(aiInputEl.value, aiInputEl.selectionStart)) {
    event.preventDefault();
    aiSnapCaretOutOfToken();
  }
});
aiInputEl.addEventListener("cut", () => {
  const v = aiInputEl.value;
  const s = aiInputEl.selectionStart;
  const e = aiInputEl.selectionEnd;
  if (s === e) return;
  const range = aiExpandTokenRange(v, s, e);
  if (!range) return;
  aiRemoveImagesForRange(v, range[0], range[1]);
  aiInputEl.setSelectionRange(range[0], range[1]);
});
aiInputEl.addEventListener("keydown", (event) => {
  // While the command drawer is open it owns navigation / selection keys.
  if (aiDrawer && aiDrawer.kind === "command") {
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
      aiDrawerSelect(aiDrawer.index);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const cmd = aiDrawer.items[aiDrawer.index];
      if (cmd) {
        aiInputEl.value = cmd.label;
        aiDrawerHide();
      }
      return;
    }
  }
  // Atomic [image] tokens: Backspace/Delete removes the whole token.
  if (event.key === "Backspace" || event.key === "Delete") {
    const v = aiInputEl.value;
    const s = aiInputEl.selectionStart;
    const e = aiInputEl.selectionEnd;
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
      aiInputEl.value = v.slice(0, range[0]) + v.slice(range[1]);
      aiInputEl.setSelectionRange(range[0], range[0]);
      aiSyncCommandDrawer();
      return;
    }
  }
  if (event.key !== "Enter") return;
  if (event.isComposing || event.keyCode === 229) return; // IME 组词确认,不发送
  if (event.shiftKey) return; // Shift+Enter 换行
  event.preventDefault(); // Enter 发送
  aiSend();
});

// The session picker runs with the input disabled, so keyboard navigation lives
// on the drawer element itself.
aiCmdEl.addEventListener("keydown", (event) => {
  if (!aiDrawer) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    aiDrawerMove(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    aiDrawerMove(-1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    aiDrawerSelect(aiDrawer.index);
  }
});

// Esc unwinds one layer at a time: first leave the drawer (session picker or
// command list) back to the normal chat flow, then stop the in-flight run.
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!themeMenuEl.hidden) {
    event.preventDefault();
    themeMenuHide();
    return;
  }
  if (aiDrawer) {
    event.preventDefault();
    if (aiDrawer.kind === "session") aiCancelResume();
    else aiDrawerHide();
    return;
  }
  if (!aiStreaming) return;
  event.preventDefault();
  aiStop();
});

window.addEventListener("popstate", route);

try {
  if (localStorage.getItem(AI_OPEN_KEY) === "1") aiOpen();
} catch (e) {}

route();
refresh();
subscribeSchemaStream();


import { Graph, CanvasBlock } from "https://esm.sh/@gravity-ui/graph@1.11.3";

const STATIC_BASE = "http://localhost:7502"; // static: schema
const AI_BASE = "http://localhost:7501";      // ai: conversation
const LOG_BASE = "http://localhost:7503";     // log: records

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

async function loadSchema() {
  const res = await fetch(`${STATIC_BASE}/static/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data;
}

// subscribe to static schema-change stream; reload schema on mutation events
function subscribeSchemaStream() {
  fetch(`${STATIC_BASE}/static/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ env: "dev", kinds: "schema" }),
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
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            let ev;
            try {
              ev = JSON.parse(payload);
            } catch {
              continue;
            }
            if (ev.kind === "schema") refresh();
          }
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
  g.setColors(THEME);
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

const THEME = {
  canvas: { layerBackground: "#141416", belowLayerBackground: "#141416", dots: "#2a2a2e", border: "#141416" },
  block: { background: "#1c1c20", border: "#3f3f46", text: "#e4e4e7", selectedBorder: "#7dd3fc" },
  connection: { background: "#a1a1aa", selectedBackground: "#7dd3fc" },
  connectionLabel: { background: "#1c1c20", text: "#a1a1aa", selectedBackground: "#7dd3fc", selectedText: "#141416" },
  selection: { background: "rgba(125, 211, 252, 0.1)", border: "#7dd3fc" },
};

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
    i.extend ? JSON.stringify(i.extend) : "",
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
const SECTIONS = ["runtime", "devtime", "contracts", "docs", "notes", "tests"];
const SECTION_DETAIL_TYPE = {
  runtime: "runtime",
  contracts: "contract",
  devtime: "devtime",
  docs: "docs",
  notes: "notes",
  tests: "test",
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
  const res = await fetch(`${STATIC_BASE}/static/query-detail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, id }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data;
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
    pre.textContent = typeof body === "string" ? body : JSON.stringify(body, null, 2);
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
const aiMessagesEl = document.getElementById("ai-messages");
const aiInputEl = document.getElementById("ai-input-field");
const aiSendEl = document.getElementById("ai-send");
let aiSession = null;
let aiSeenSeq = 0;

function aiAppend(role, text) {
  const div = document.createElement("div");
  div.className = `ai-msg ai-${role}`;
  div.textContent = text;
  aiMessagesEl.appendChild(div);
  aiMessagesEl.scrollTop = aiMessagesEl.scrollHeight;
  return div;
}

function aiApprovalCard(approval) {
  const div = document.createElement("div");
  div.className = "ai-msg ai-assistant ai-approval";
  div.innerHTML = `
    <div class="ai-approval-title">${escapeHtml(approval?.title || "approval requested")}</div>
    <button class="ai-approval-btn" type="button">approve</button>`;
  const btn = div.querySelector(".ai-approval-btn");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "approving…";
    try {
      const res = await fetch(`${AI_BASE}/ai/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: aiSession, approvalId: approval.approvalId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error?.message || res.status);
      btn.textContent = "approved ✓";
    } catch (err) {
      btn.textContent = `failed: ${err.message}`;
      btn.disabled = false;
    }
  });
  aiMessagesEl.appendChild(div);
  aiMessagesEl.scrollTop = aiMessagesEl.scrollHeight;
}

async function aiNew() {
  const res = await fetch(`${AI_BASE}/ai/new`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  aiSession = data.sessionId;
  aiSeenSeq = 0;
}

async function aiStream() {
  const res = await fetch(`${AI_BASE}/ai/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: aiSession }),
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    aiAppend("assistant", `[error] ${data.error?.message || res.status}`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let assistant = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop();
    for (const frame of frames) {
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        let ev;
        try {
          ev = JSON.parse(payload);
        } catch {
          continue;
        }
        if (typeof ev.seq === "number") {
          if (ev.seq <= aiSeenSeq) continue; // already rendered from an earlier stream
          aiSeenSeq = ev.seq;
        }
        if (ev.kind === "markdown" && ev.markdown) {
          if (!assistant) assistant = aiAppend("assistant", "");
          assistant.textContent += ev.markdown;
          aiMessagesEl.scrollTop = aiMessagesEl.scrollHeight;
        } else if (ev.kind === "error") {
          aiAppend("assistant", `[error] ${ev.error?.message || ""}`);
        } else if (ev.kind === "approval") {
          aiApprovalCard(ev.approval);
        }
        if (ev.done) assistant = null;
      }
    }
  }
}

async function aiSend() {
  const prompt = aiInputEl.value.trim();
  if (!prompt || !aiSession) return;
  aiInputEl.value = "";
  aiAppend("user", prompt);
  const res = await fetch(`${AI_BASE}/ai/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: aiSession, prompt }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    aiAppend("assistant", `[error] ${data.error?.message || res.status}`);
    return;
  }
  await aiStream();
}

aiToggleEl.addEventListener("click", async () => {
  const open = aiEl.hidden;
  aiEl.hidden = !open;
  aiToggleEl.classList.toggle("active", open);
  if (open) {
    if (!aiSession) {
      try {
        await aiNew();
      } catch (err) {
        aiAppend("assistant", `[error] ${err.message}`);
      }
    }
    aiInputEl.focus();
  }
  graph?.updateSize();
});

aiSendEl.addEventListener("click", aiSend);
aiInputEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  if (event.isComposing || event.keyCode === 229) return; // IME 组词确认,不发送
  if (event.shiftKey) return; // Shift+Enter 换行
  event.preventDefault(); // Enter 发送
  aiSend();
});

window.addEventListener("popstate", route);

route();
refresh();
subscribeSchemaStream();


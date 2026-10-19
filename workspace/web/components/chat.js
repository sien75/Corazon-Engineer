// <engineer-chat> — the shell's conversation view as a custom element.
//
// It is the *only* chat implementation: main (the shell's own conversation) and a
// blueprint's page both mount this element. Shadow DOM keeps the page's CSS out;
// /components/chat.css styles it, and the theme's CSS variables inherit through.
//
//   <script type="module" src="/components/chat.js"></script>
//   <engineer-chat session="s_…" autofocus></engineer-chat>
//
// `session` is optional: without it the element reads /agent/<sessionId>/ from
// the page's own URL (which is what a blueprint page wants). The ai address comes
// from /config.js, which the element imports itself — a page does not have to do
// anything for the conversation to work.
//
// Events (bubbling, for the shell): "engineer-tool" with { name, isError } after
// every tool call — main's tab-* tools are what make the shell re-read the
// workspace.

import yaml from "/vendor/js-yaml.js";
import MarkdownIt from "/vendor/markdown-it.js";
import DOMPurify from "/vendor/dompurify.js";
import hljs from "/vendor/highlight.js";

const TEMPLATE = `
<link rel="stylesheet" href="/components/chat.css">
<div class="pane">
  <div class="scroll">
    <div class="ai-messages"></div>
  </div>
  <div class="ai-input">
    <textarea class="ai-input-field" rows="2"
      placeholder="ask… (Enter send, Shift+Enter newline; paste image)" autocomplete="off"></textarea>
    <button type="button" class="ai-stop" hidden>stop</button>
    <button type="button" class="ai-send">send</button>
  </div>
</div>
`;

async function runtime() {
  try {
    // Dynamic so a page that never needs to talk to ai still renders, and so a
    // missing /config.js turns into the readable message below instead of a
    // module load failure that leaves a blank element.
    const { ENGINEER } = await import("/config.js");
    return ENGINEER || {};
  } catch {
    return {};
  }
}

function sessionFromUrl() {
  const m = location.pathname.match(/^\/agent\/([^/]+)\//);
  return m ? decodeURIComponent(m[1]) : "";
}

class EngineerChat extends HTMLElement {
  #mounted = false;

  connectedCallback() {
    if (this.#mounted) return;
    this.#mounted = true;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = TEMPLATE;
    void this.#mount(root);
  }

  async #mount(root) {
    const id = this.getAttribute("session") || sessionFromUrl();
    if (!id) {
      root.querySelector(".ai-messages").textContent =
        "engineer-chat: no session (give `session`, or serve the page at /agent/<sessionId>/)";
      return;
    }
    const rt = await runtime();
    if (!rt.ai) {
      root.querySelector(".ai-messages").textContent =
        "engineer-chat: no ai address (is /config.js reachable?)";
      return;
    }
    wire(this, root, id, rt);
  }

  focus() {
    this.shadowRoot?.querySelector(".ai-input-field")?.focus();
  }
}

// wire is the conversation itself: ask / stream / render / stop, all scoped to
// this element. `host` is the custom element (for events), `root` its shadow root.
function wire(host, root, id, RT) {
  const AI = RT.ai;
  const LOG = RT.log;

  const scrollEl = root.querySelector(".scroll");
  const messagesEl = root.querySelector(".ai-messages");
  const inputEl = root.querySelector(".ai-input-field");
  const sendEl = root.querySelector(".ai-send");
  const stopEl = root.querySelector(".ai-stop");
  // 外壳把它的前端库放在 /vendor/ 下（同源可取）：用同一份 markdown-it /
  // DOMPurify / highlight.js / js-yaml，渲染结果和外壳一模一样。


  // 和外壳一样的 markdown 渲染：raw HTML 关掉，链接自动识别，渲染完再过一遍
  // DOMPurify（app.js: md / renderMarkdown）。
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
  const renderMarkdown = (src) => DOMPurify.sanitize(md.render(src));

  let seq = 0;             // 已经画到的事件序号：断线重连时从它续上
  let running = false;     // 这一轮还在跑
  let bubble = null;       // 正在逐字追加的 assistant 气泡（markdown 渲染器）
  let thinking = null;     // 当前 thinking 芯片
  const tools = new Map(); // toolCallId → 工具芯片

  // 粘贴进来的图片：压缩后进这个队列，文本里的 [image] 标记按顺序与它们配对。
  // 做法与外壳一致（app.js: aiAddPastedImage / aiBuildSendBlocks）。
  let images = [];         // { data, mimeType }；先占位后填充，保证顺序
  let tasks = [];          // 还在压缩的 Promise
  const IMG_TOKEN = "[image]";
  const IMG_MAX_DIM = 1568;

  // ---------- 滚动：和外壳一样，只有本来贴着底才跟着滚 ----------
  const STICK = 40;
  const atBottom = () =>
    scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight <= STICK;
  const toBottom = () => { scrollEl.scrollTop = scrollEl.scrollHeight; };

  // ---------- 画东西：类名与结构都来自 app.js / chat.css ----------

  // 和外壳一样，芯片（thinking / 工具）按“一行”排：连续的芯片进同一个
  // .ai-chip-row，一遇到文字、用户消息或问题卡，这一行就结束，下一个芯片
  // 另起一行。芯片的宽度是 120px，靠的正是行容器是横向 flex。
  let rowEl = null;

  // `fill` 在元素挂进去之后、决定滚不滚之前调用：高度要等内容长齐才量得准。
  // 先挂空壳再塞内容、塞完不补一次滚动的话，新内容会比视口低一截（第一张
  // thinking 芯片的头和状态是后加的，所以它老是差一截、滚不到底）。
  function addMessage(cls, fill) {
    rowEl = null; // 不是芯片：结束当前芯片行
    const el = document.createElement("div");
    el.className = cls;
    const stick = atBottom();
    messagesEl.appendChild(el);
    if (fill) fill(el);
    if (stick) toBottom();
    return el;
  }

  function addChip(cls, fill) {
    const stick = atBottom();
    if (!rowEl) {
      rowEl = document.createElement("div");
      rowEl.className = "ai-msg ai-chip-row";
      messagesEl.appendChild(rowEl);
    }
    const el = document.createElement("div");
    el.className = cls;
    rowEl.appendChild(el);
    if (fill) fill(el);
    if (stick) toBottom();
    return el;
  }

  // 外壳的 aiMarkdown：把累计的 markdown 每帧渲染一次，而不是每个 delta 一次。
  function assistantBubble() {
    const el = addMessage("ai-msg ai-assistant ai-markdown");
    let raw = "";
    let scheduled = false;
    let raf = 0;
    const render = () => {
      scheduled = false;
      const stick = atBottom();
      el.innerHTML = renderMarkdown(raw);
      if (stick) toBottom();
    };
    return {
      append(delta) {
        raw += delta;
        if (!scheduled) {
          scheduled = true;
          raf = requestAnimationFrame(render);
        }
      },
      flush() {
        if (scheduled) {
          cancelAnimationFrame(raf);
          scheduled = false;
        }
        render();
      },
    };
  }

  function userMessage(blocks) {
    const el = addMessage("ai-msg ai-user");
    for (const b of blocks) {
      if (b.type === "text") {
        const t = document.createElement("div");
        t.textContent = b.text;
        el.appendChild(t);
      } else if (b.type === "image") {
        const img = document.createElement("img");
        img.className = "ai-user-img";
        img.src = `data:${b.mimeType};base64,${b.data}`;
        el.appendChild(img);
      }
    }
    toBottom(); // 自己发的消息总是露出来
  }

  // ---------- 图片：粘贴 → 压缩 → [image] 标记（app.js 同款）----------

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }

  async function compressImage(file) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return undefined;
    }
    const scale = Math.min(1, IMG_MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    // 截图还是无损 PNG，其余转成 JPEG，体积、base64 和发给模型的字节都小。
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
    if (!blob) return undefined;
    return { data: await blobToBase64(blob), mimeType: blob.type };
  }

  function insertToken() {
    const start = inputEl.selectionStart ?? inputEl.value.length;
    const end = inputEl.selectionEnd ?? start;
    const v = inputEl.value;
    inputEl.value = v.slice(0, start) + IMG_TOKEN + v.slice(end);
    const caret = start + IMG_TOKEN.length;
    inputEl.setSelectionRange(caret, caret);
    resize();
  }

  function addPastedImage(file) {
    const idx = images.length;
    images.push(undefined); // 先占位：异步压缩不改变图片顺序
    insertToken();
    tasks.push(
      compressImage(file)
        .then((img) => { images[idx] = img; })
        .catch(() => {}),
    );
  }

  // 文本里的 [image] 与队列里的图片按出现顺序一一配对。
  function buildBlocks(text, imgs) {
    const blocks = [];
    const parts = text.split(IMG_TOKEN);
    let n = 0;
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        const img = imgs[n++];
        if (img) blocks.push({ type: "image", data: img.data, mimeType: img.mimeType });
      }
      if (parts[i]) blocks.push({ type: "text", text: parts[i] });
    }
    // 文本里一个标记都没有、但队列里有图：按图片处理，不用依赖用户的输入顺序。
    if (blocks.length === 0) {
      for (const img of imgs) {
        if (img) blocks.push({ type: "image", data: img.data, mimeType: img.mimeType });
      }
    }
    return blocks;
  }

  // [image] 在输入框里是一个整体：光标进不去，删就整块删，对应的图片一起丢。
  function tokenRanges(v) {
    const ranges = [];
    let i = 0;
    for (;;) {
      const at = v.indexOf(IMG_TOKEN, i);
      if (at === -1) break;
      ranges.push([at, at + IMG_TOKEN.length]);
      i = at + IMG_TOKEN.length;
    }
    return ranges;
  }

  function dropImagesInside(v, start, end) {
    const drops = [];
    tokenRanges(v).forEach(([s, e], i) => {
      if (s >= start && e <= end) drops.push(i);
    });
    for (let k = drops.length - 1; k >= 0; k--) images.splice(drops[k], 1);
  }

  function snapCaretOutOfToken() {
    if (inputEl.selectionStart !== inputEl.selectionEnd) return;
    const v = inputEl.value;
    const p = inputEl.selectionStart;
    for (const [s, e] of tokenRanges(v)) {
      if (p > s && p < e) {
        const to = p - s < e - p ? s : e;
        inputEl.setSelectionRange(to, to);
        return;
      }
    }
  }

  // 外壳的 aiCollapse / aiTool / aiThinking：一个 120px 的折叠芯片，
  // 头一行是标题 + 状态（转圈 / ✓ / !）。外壳把展开的详情作为整行插在芯片
  // 行里（aiLayoutPanels），这里也一样：详情进芯片行，`flex: 0 0 100%` 让它
  // 换行占满整行。
  function chip(kind, label, name) {
    let status, body;
    const wrap = addChip(`ai-msg ai-collapse ai-${kind}`, (el) => {
      const head = document.createElement("button");
      head.type = "button";
      head.className = "ai-collapse-head";
      const title = document.createElement("span");
      title.className = "ai-collapse-title";
      title.textContent = label;
      const st = document.createElement("span");
      st.className = "ai-collapse-status ai-loading";
      head.append(title, st);
      el.appendChild(head);

      const bd = document.createElement("div");
      bd.className = "ai-collapse-body";
      bd.hidden = true;
      const bodyName = document.createElement("div");
      bodyName.className = "ai-collapse-body-name";
      bodyName.textContent = name;
      bd.appendChild(bodyName);

      head.addEventListener("click", () => {
        bd.hidden = !bd.hidden;
        el.classList.toggle("open", !bd.hidden);
        if (bd.hidden) bd.remove();
        else (rowEl || el.parentElement).appendChild(bd);
      });

      status = st;
      body = bd;
    });
    return { wrap, status, body };
  }

  function settle(block, state) {
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

  function toolChip(name, args) {
    const block = chip("tool", toolLabel(name, args), name);
    const pre = document.createElement("pre");
    pre.className = "ai-tool-body";
    pre.textContent = stringify(args);
    block.body.appendChild(pre);
    block.pre = pre;
    return block;
  }

  function thinkingChip() {
    const block = chip("thinking", "thinking", "thinking");
    const body = document.createElement("div");
    body.className = "ai-thinking-body";
    block.body.appendChild(body);
    block.text = body;
    return block;
  }

  // 外壳的 aiAskUser：问题是一张卡，有 options 就画按钮，没有就输入框；
  // 回答就是一条普通的 /ai/ask 文本。
  function questionCard(args) {
    addMessage("ai-msg ai-question", (div) => {
      const q = document.createElement("div");
      q.textContent = args?.text || "";
      div.appendChild(q);
      const row = document.createElement("div");
      row.className = "ai-question-options";
      const close = () => row.querySelectorAll("button, input").forEach((el) => (el.disabled = true));
      const options = Array.isArray(args?.options) ? args.options : [];
      if (options.length) {
        for (const o of options) {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = o.label;
          b.addEventListener("click", () => {
            close();
            void ask([{ type: "text", text: o.value }]);
          });
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
          if (v) { close(); void ask([{ type: "text", text: v }]); }
        };
        b.addEventListener("click", submit);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
        row.append(input, b);
      }
      div.appendChild(row);
    });
  }

  // 芯片标题：把最长的那一个参数亮出来（app.js: aiToolChip 的简化版）。
  function toolLabel(name, args) {
    const a = args && typeof args === "object" ? args : {};
    const base = (p) => String(p || "").split("/").filter(Boolean).pop() || "";
    const detail = a.path ?? a.command ?? a.pattern ?? a.name;
    const text = String(detail ?? "").trim();
    if (!text) return name;
    return name === "bash" ? text.split(/\s+/)[0] : base(text) || text;
  }

  function stringify(v) {
    if (v == null) return "";
    if (typeof v === "string") return v;
    try { return JSON.stringify(v, null, 2); } catch { return String(v); }
  }

  function setRunning(on) {
    running = on;
    sendEl.disabled = on;
    stopEl.hidden = !on;
    stopEl.disabled = false;
  }

  function finish() {
    if (bubble) { bubble.flush(); bubble = null; }
    if (thinking) { settle(thinking, "done"); thinking = null; }
    tools.clear();
    if (running) setRunning(false);
  }

  function fail(text) {
    addMessage("ai-msg ai-assistant", (el) => { el.textContent = `[error] ${text}`; });
    finish();
  }

  // ---------- 发一轮 ----------

  async function ask(blocks) {
    if (!blocks.length || running) return;
    userMessage(blocks);
    bubble = null;
    thinking = null;
    tools.clear();
    setRunning(true);
    await ready; // 加载时那次“只记水位”的读流先读完
    const res = await fetch(AI + "/ai/ask", {
      method: "POST",
      headers: { "Content-Type": "application/yaml" },
      body: yaml.dump({ id, blocks }),
    });
    if (!res.ok) return fail(await errorOf(res));
    void pump(); // 不 await：流要一直读到这一轮收工
  }

  // 一轮的读法：开一次流，读到服务端关流；如果这一轮还没收工（连接断了），
  // 就带着 seq 重开一次 —— 服务端只重放 since 之后的事件，所以不会重复。
  async function pump() {
    while (running) {
      try {
        await streamOnce(onEvent);
      } catch (err) {
        if (!running) return;
        addMessage("ai-msg ai-assistant", (el) => {
          el.textContent = `[stream] ${err.message}，从 #${seq} 续上…`;
        });
        await sleep(500);
        continue;
      }
      if (running) await sleep(300);
    }
  }

  // SSE：每帧是若干 data: 行，拼起来是一个 YAML 文档；帧的 id 就是事件 seq。
  // `sink` 决定拿到事件之后干什么：画出来（onEvent），或者只是记水位（catchUp）。
  async function streamOnce(sink) {
    const res = await fetch(AI + "/ai/stream", {
      method: "POST",
      headers: { "Content-Type": "application/yaml" },
      body: yaml.dump({ id, since: seq }),
    });
    if (!res.ok || !res.body) throw new Error(await errorOf(res));
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const frames = buf.split("\n\n");
      buf = frames.pop(); // 最后一段可能只有半帧，留到下一次
      for (const frame of frames) handleFrame(frame, sink);
    }
  }

  function handleFrame(frame, sink) {
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""));
    if (!data.length) return;
    let ev;
    try {
      ev = yaml.load(data.join("\n"));
    } catch {
      return;
    }
    if (!ev || typeof ev !== "object") return;
    if (typeof ev.seq === "number") seq = Math.max(seq, ev.seq);
    sink(ev);
  }

  // ---------- 事件：只用外壳也在用的那一小撮 ----------

  function onEvent(ev) {
    switch (ev.type) {
      case "turn_start": // 新的一轮回复：结束上一块，下一句进新气泡
        if (bubble) { bubble.flush(); bubble = null; }
        if (thinking) { settle(thinking, "done"); thinking = null; }
        return;

      case "message_update": {
        const ae = ev.assistantMessageEvent || {};
        if (ae.type === "text_start") {
          if (thinking) { settle(thinking, "done"); thinking = null; }
          bubble = assistantBubble();
        } else if (ae.type === "text_delta") {
          if (!bubble) bubble = assistantBubble();
          bubble.append(ae.delta || "");
        } else if (ae.type === "thinking_start") {
          thinking = thinkingChip();
        } else if (ae.type === "thinking_delta") {
          if (!thinking) thinking = thinkingChip();
          thinking.text.textContent += ae.delta || "";
        } else if (ae.type === "error") {
          addMessage("ai-msg ai-assistant", (el) => {
            el.textContent = `[error] ${ae.error?.errorMessage || ""}`;
          });
          bubble = null;
        }
        return;
      }

      case "message_end":
        if (bubble) { bubble.flush(); bubble = null; }
        return;

      case "tool_execution_start":
        if (ev.toolName === "ask_user") questionCard(ev.args);
        // layout 是外壳的布局工具，这一页不拆屏，忽略即可。
        else if (ev.toolName !== "layout") tools.set(ev.toolCallId, toolChip(ev.toolName, ev.args));
        return;

      case "tool_execution_update": {
        const block = tools.get(ev.toolCallId);
        if (block?.pre && ev.partialResult) {
          block.pre.textContent += `\n${stringify(ev.partialResult)}`;
        }
        return;
      }

      case "tool_execution_end": {
        const block = tools.get(ev.toolCallId);
        if (block) settle(block, ev.isError ? "error" : "done");
        tools.delete(ev.toolCallId);
        // The shell listens for this: main's tab-* tools change the workspace,
        // and the element only reports what ran.
        host.dispatchEvent(
          new CustomEvent("engineer-tool", {
            detail: { name: ev.toolName, isError: !!ev.isError },
            bubbles: true,
          }),
        );
        return;
      }

      case "agent_settled": // 这一轮真的结束了，服务端也会在它之后关流
        finish();
        return;

      case "error":
        fail(ev.error?.message || "出错了");
        return;
    }
  }

  async function errorOf(res) {
    try {
      const data = yaml.load(await res.text()) || {};
      return data.error?.message || `HTTP ${res.status}`;
    } catch {
      return `HTTP ${res.status}`;
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ---------- 输入：外壳的 aiResizeInput / aiInputKeydown 的简化版 ----------

  const MAX_LINES = 10;
  function resize() {
    const cs = getComputedStyle(inputEl);
    const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const chrome = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + border;
    const maxHeight = Math.ceil(lineHeight * MAX_LINES + chrome);
    inputEl.style.height = "auto";
    const contentHeight = inputEl.scrollHeight + border;
    inputEl.style.height = Math.min(contentHeight, maxHeight) + "px";
    inputEl.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  }

  // 发送：先把还在压缩的图片等完，再把文本里的 [image] 与图片队列拼成 blocks，
  // 然后清空草稿（与外壳 aiSend 的顺序一致）。
  async function submit() {
    const text = inputEl.value;
    if ((!text.trim() && !images.length) || running) return;
    inputEl.value = "";
    resize();
    await Promise.all(tasks);
    const blocks = buildBlocks(text, images);
    images = [];
    tasks = [];
    void ask(blocks);
  }

  sendEl.addEventListener("click", submit);
  inputEl.addEventListener("input", resize);
  inputEl.addEventListener("click", snapCaretOutOfToken);
  inputEl.addEventListener("keyup", snapCaretOutOfToken);

  // 粘贴图片：有图片就自己处理（压缩 + [image] 标记）；纯文本粘贴走浏览器默认。
  inputEl.addEventListener("paste", (event) => {
    const files = [...(event.clipboardData?.items ?? [])]
      .filter((it) => it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter(Boolean);
    if (!files.length) return;
    event.preventDefault();
    for (const file of files) addPastedImage(file);
  });

  // 删 [image] 时连图一起删；贴在标记边的退格 / Delete 整块删（原子）。
  inputEl.addEventListener("beforeinput", (event) => {
    if (event.inputType !== "deleteContentBackward" && event.inputType !== "deleteContentForward") {
      return;
    }
    const v = inputEl.value;
    const s = inputEl.selectionStart;
    const e = inputEl.selectionEnd;
    if (s !== e) {
      dropImagesInside(v, s, e);
      return;
    }
    const token = event.inputType === "deleteContentBackward"
      ? (s >= IMG_TOKEN.length && v.slice(s - IMG_TOKEN.length, s) === IMG_TOKEN
        ? [s - IMG_TOKEN.length, s]
        : null)
      : (v.slice(s, s + IMG_TOKEN.length) === IMG_TOKEN ? [s, s + IMG_TOKEN.length] : null);
    if (!token) return;
    event.preventDefault();
    inputEl.value = v.slice(0, token[0]) + v.slice(token[1]);
    inputEl.setSelectionRange(token[0], token[0]);
    dropImagesInside(v, token[0], token[1]);
    resize();
  });

  inputEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (event.isComposing || event.keyCode === 229) return; // IME 组词确认,不发送
    if (event.shiftKey) return; // Shift+Enter 换行
    event.preventDefault();
    void submit();
  });

  stopEl.addEventListener("click", async () => {
    stopEl.disabled = true;
    try {
      await fetch(AI + "/ai/stop", {
        method: "POST",
        headers: { "Content-Type": "application/yaml" },
        body: yaml.dump({ id }),
      });
    } catch {
      // 停不掉也没关系：running=false 之后 pump 会自己退出
    } finally {
      finish();
    }
  });

  // ---------- history (main replays its conversation; a page does not) ----------

  async function replayHistory() {
    try {
      await fetch(`${AI}/ai/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/yaml" },
        body: yaml.dump({ id }),
      });
      const res = await fetch(`${LOG}/log/session-detail`, {
        method: "POST",
        headers: { "Content-Type": "application/yaml" },
        body: yaml.dump({ sessionId: id }),
      });
      if (!res.ok) return;
      const data = yaml.load(await res.text()) || {};
      const toolBlocks = new Map();
      for (const m of data.messages || []) {
        const raw = m.raw;
        if (raw?.role === "user") {
          const parts = [];
          const content = typeof raw.content === "string"
            ? [{ type: "text", text: raw.content }]
            : raw.content || [];
          for (const b of content) {
            if (b.type === "text" && b.text) parts.push({ type: "text", text: b.text });
            else if (b.type === "image") {
              parts.push({ type: "image", src: b.sha256 ? `${AI}/blobs/${b.sha256}` : "" });
            }
          }
          if (parts.length) userMessage(parts);
          continue;
        }
        if (raw?.role === "assistant") {
          for (const b of raw.content || []) {
            if (b.type === "text" && b.text) {
              const bubble = assistantBubble();
              bubble.append(b.text);
              bubble.flush();
            } else if (b.type === "toolCall" && b.name !== "ask_user") {
              toolBlocks.set(b.id, toolChip(b.name, b.arguments));
            }
          }
          continue;
        }
        if (raw?.role === "toolResult") {
          const block = toolBlocks.get(raw.toolCallId);
          if (!block) continue;
          const out = (Array.isArray(raw.content) ? raw.content : [])
            .filter((b) => b.type === "text" && b.text)
            .map((b) => b.text)
            .join("\n");
          if (out && block.pre) block.pre.textContent += `\n${out}`;
          settle(block, raw.isError ? "error" : "done");
          toolBlocks.delete(raw.toolCallId);
          continue;
        }
        if (m.role === "assistant" && m.content) {
          const bubble = assistantBubble();
          bubble.append(m.content);
          bubble.flush();
        }
      }
    } catch {
      // no history to draw (a fresh conversation)
    }
  }

  // ---------- 起手 ----------

  // The page does not replay history, so move the watermark before the first ask:
  // read the backlog with since=0, draw nothing, keep the last seq. Without it the
  // first ask would replay the whole past run into the view.
  const ready = (async () => {
    try {
      await streamOnce(() => {});
    } catch {
      // no watermark is not fatal: the worst case is one replayed run
    }
  })();

  resize();
  if (root.host.hasAttribute("autofocus")) inputEl.focus();
  if (root.host.hasAttribute("history")) void replayHistory();

}

customElements.define("engineer-chat", EngineerChat);

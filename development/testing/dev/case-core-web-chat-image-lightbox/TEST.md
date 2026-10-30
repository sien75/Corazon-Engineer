# Test: core-web-chat-image-lightbox

信息流里的图，两类一起管（见 `development/iterations/2610-59-图片限尺寸与蒙层查看.md`）：

1. **尺寸**：用户粘贴的、生图工具产出的图，在信息流里都限在 **300×300 以内并保持比例**（图本身更小就按原尺寸）。
   改动前生图带 `width/height` 属性、CSS 只有 `max-width: 100%`，2048 宽的图就铺满 880px 正文列。
2. **蒙层**：点图出蒙层看大图，蒙层**只盖这个会话面板**（也就是这个 tab 的内容）—— 页面上方那条顶栏
   仍然点得到，说明蒙层不是贴在窗口上的全屏遮罩。点蒙层或 Esc 关闭。

不需要模型，也不需要跑全套服务：这段历史是**造**出来的，脚本化的 ai + log 交给页面，**真实组件**
从 `workspace/web` 原样服务，真实浏览器、真实 `fetch`、真实回放代码。

## Setup

前置：`ego-browser` 在 `PATH` 上（`ego-browser --version`），Bun 可用。

端口：**9093**（脚本化的 ai + log + 静态文件，同一个 origin，省掉 CORS）。

```bash
pkill -f "image-lightbox-fixture" 2>/dev/null || true
sleep 1

# 夹具不属于系统：它把两张图端出来，并从 workspace/web 原样服务真实组件。
# 放在 /tmp（仓库之外），这个用例就只有 desp.yaml + TEST.md。
cat > /tmp/image-lightbox-fixture.js <<'JS'
import { deflateSync } from "node:zlib";

const WEB = process.env.WEB_DIR; // workspace/web
const BASE = "http://127.0.0.1:9093";

// 页面上方留一条顶栏：蒙层该盖的是下面这块会话面板，不是整页。顶栏能不能被
// elementFromPoint 命中，就是这个用例判定「只盖这个 tab」的方式。
const page = `<!doctype html>
<html lang="en" data-theme="light"><head><meta charset="utf-8"><title>image-lightbox</title>
<link rel="stylesheet" href="/theme.css">
<style>
  html, body { margin: 0; height: 100%; background: var(--surface); color: var(--fg); }
  #bar { height: 40px; display: flex; align-items: center; padding: 0 12px;
         background: var(--surface-inset); border-bottom: 1px solid var(--border-strong); font: 13px system-ui; }
  engineer-chat { display: block; height: calc(100vh - 41px); }
</style>
<script type="module" src="/components/chat.js"></script>
</head>
<body>
<div id="bar">tab bar</div>
<engineer-chat session="s_img00000000001"></engineer-chat>
</body></html>`;

// 一张纯色分带的 PNG：尺寸由参数定，内容只为眼睛看得见上下（人工在页面上看时
// 能确认没有变形）。自己编码比塞一段 base64 进去好读，也不会随压缩工具而变。
let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

function png(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0; // no filter
    const band = Math.floor((y / h) * 4) % 2; // 四条横带
    for (let x = 0; x < w; x++) {
      const p = row + 1 + x * 3;
      raw[p] = band ? 216 : 32;
      raw[p + 1] = band ? 88 : 120;
      raw[p + 2] = band ? 56 : 200;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 三张图：一张宽、一张竖（粘贴）、一张竖（生图）。三条都测才不漏：宽图卡宽度上限，
// 竖图卡高度上限 —— 而生图的竖图曾经被 width/height 属性压成方的。
const blobs = { wide: png(2048, 1024), tall: png(900, 1500), tallgen: png(1024, 1536) };

// ai 写进 log 的形状：一条带粘贴图（blob 地址）的用户消息，加一次生图的结果。
// 生图的 `width/height` 就是 ai 那边 `details.images` 里带的原图尺寸。
const history = `messages:
  - seq: 1
    role: user
    content: 看看这张
    raw:
      role: user
      content:
        - type: text
          text: 看看这张
        - type: image
          sha256: tall
  - seq: 2
    role: assistant
    content: ""
    raw:
      role: assistant
      content:
        - type: toolCall
          id: call_img1
          name: image
          arguments:
            prompt: 一张宽图
  - seq: 3
    role: toolResult
    raw:
      role: toolResult
      toolCallId: call_img1
      toolName: image
      isError: false
      content:
        - type: text
          text: done
      details:
        images:
          - sha256: wide
            width: 2048
            height: 1024
          - sha256: tallgen
            width: 1024
            height: 1536
`;

const yamlRes = (text) => new Response(text, { headers: { "Content-Type": "application/yaml" } });

Bun.serve({
  port: 9093,
  hostname: "127.0.0.1",
  async fetch(req) {
    const p = new URL(req.url).pathname;

    if (p === "/") return new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    if (p === "/config.js") {
      return new Response(
        `export const ENGINEER = {static:${JSON.stringify(BASE)}, ai:${JSON.stringify(BASE)}, log:${JSON.stringify(BASE)}};\nexport default ENGINEER;\n`,
        { headers: { "Content-Type": "application/javascript" } },
      );
    }

    // 这一段没有在跑的一轮：页面只回放历史。
    if (p === "/ai/resume") return yamlRes("sessionId: s_img00000000001\nlastSeq: 9\nactive: false\n");
    if (p === "/ai/stream") return yamlRes(""); // active=false 时不会有人来读
    if (p === "/ai/stop") return yamlRes("ok\n");
    if (p === "/log/session/messages") return yamlRes(history);

    // 组件读图的路由是 ${AI}/blobs/<sha256>（AI 只是这个夹具的 origin）。
    const blob = p.match(/^\/blobs\/(\w+)$/);
    if (blob && blobs[blob[1]]) {
      return new Response(blobs[blob[1]], { headers: { "Content-Type": "image/png" } });
    }

    if (p.startsWith("/components/") || p.startsWith("/vendor/") || p === "/theme.css") {
      const file = Bun.file(WEB + p);
      if (await file.exists()) return new Response(file);
    }
    return new Response("not found\n", { status: 404 });
  },
});

console.log("image-lightbox-fixture on 9093");
JS

WEB_DIR="$PWD/workspace/web" bun /tmp/image-lightbox-fixture.js >/tmp/image-lightbox-fixture.log 2>&1 &
for i in $(seq 1 40); do
  curl -s -o /dev/null -m 2 http://127.0.0.1:9093/config.js && break
  sleep 0.5
done
curl -s http://127.0.0.1:9093/config.js
curl -s -o /dev/null -w '%{http_code} %{content_type} %{size_download}\n' http://127.0.0.1:9093/blobs/wide
```

Expected：`export const ENGINEER = {"static":"http://127.0.0.1:9093", ...}`（三段地址都指向夹具），
blob 一行是 `200 image/png <大小>`。

## 1. 信息流里的尺寸

```bash
ego-browser nodejs <<'EOF'
const WEB = "http://127.0.0.1:9093";

const space = await taskSpace("core-web-chat-image-lightbox");
// 空间是复用的：第二次跑时 p1 已经在了，直接取；没有就新开一个。
const page = (await space.pages()).some((p) => p.label === "p1") ? space.page("p1") : await space.newPage();
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;

const probe = () =>
  page.evaluate(() => {
    const host = document.querySelector("engineer-chat");
    const root = host && host.shadowRoot;
    if (!root) return null;
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const lb = root.querySelector(".ai-lightbox");
    const lbImg = lb && lb.querySelector("img");
    return {
      host: box(host),
      pane: box(root.querySelector(".pane")),
      lightbox: lb
        ? { hidden: lb.hidden, display: getComputedStyle(lb).display, box: lb.hidden ? null : box(lb) }
        : null,
      lightboxImg: lbImg
        ? {
            src: lbImg.getAttribute("src"),
            box: lb.hidden ? null : box(lbImg),
            maxHeight: getComputedStyle(lbImg).maxHeight,
          }
        : null,
      imgs: [...root.querySelectorAll(".ai-messages img")].map((img) => {
        const b = box(img);
        return {
          cls: img.className,
          natural: [img.naturalWidth, img.naturalHeight],
          w: b.w,
          h: b.h,
          cx: b.x + b.w / 2,
          cy: b.y + b.h / 2,
          cursor: getComputedStyle(img).cursor,
        };
      }),
    };
  });

const ready = () =>
  page.waitForFunction(
    () => {
      const root = document.querySelector("engineer-chat")?.shadowRoot;
      if (!root) return false;
      const imgs = [...root.querySelectorAll(".ai-messages img")];
      return imgs.length >= 2 && imgs.every((i) => i.complete && i.naturalWidth > 0);
    },
    null,
    { timeout: 8000 },
  );

await page.goto(`${WEB}/`);
await page.waitForSelector("engineer-chat");
await ready();
const first = await probe();

const pasted = first.imgs.find((i) => i.cls.includes("ai-user-img"));
const generated = first.imgs.find((i) => i.cls.includes("ai-gen-img"));
const generatedTall = first.imgs.find((i) => i.cls.includes("ai-gen-img") && i.natural?.[0] === 1024);
check("replay draws the pasted image", !!pasted, first.imgs);
check("replay draws the generated image", !!generated, first.imgs);
check("replay draws the tall generated image", !!generatedTall, first.imgs);
check("pasted image is the tall 900x1500 png",
  JSON.stringify(pasted?.natural) === JSON.stringify([900, 1500]), pasted?.natural);
check("generated image is the wide 2048x1024 png",
  JSON.stringify(generated?.natural) === JSON.stringify([2048, 1024]), generated?.natural);
check("tall generated image is the 1024x1536 png",
  JSON.stringify(generatedTall?.natural) === JSON.stringify([1024, 1536]), generatedTall?.natural);

// 宽图：宽度卡在 300，高度跟着比例（300 × 1024/2048 = 150）。
check("generated image is capped at 300 wide", near(generated?.w, 300), generated);
check("generated image keeps its ratio", near(generated?.h, 150), generated);
// 竖的生图：高度卡在 300，宽度跟着比例（300 × 1024/1536 = 200）—— 这一条曾经是 300×300，
// 因为 ai 把 details 里的 width/height 写成了 img 属性，属性钉住宽，max-height 就压平了比例。
check("tall generated image is capped at 300 tall", near(generatedTall?.h, 300), generatedTall);
check("tall generated image keeps its ratio", near(generatedTall?.w, 200), generatedTall);
// 竖图：高度卡在 300，宽度跟着比例（300 × 900/1500 = 180）。
check("pasted image is capped at 300 tall", near(pasted?.h, 300), pasted);
check("pasted image keeps its ratio", near(pasted?.w, 180), pasted);
check("no feed image is wider or taller than 300",
  first.imgs.every((i) => i.w <= 300 && i.h <= 300), first.imgs);
check("a feed image invites a click", first.imgs.every((i) => i.cursor === "zoom-in"),
  first.imgs.map((i) => i.cursor));

check("the overlay exists but is hidden", !!first.lightbox && first.lightbox.hidden,
  first.lightbox);
check("a hidden overlay takes no space", first.lightbox?.display === "none", first.lightbox?.display);

// 刷新一次：历史重放是主路径，尺寸不能只在第一次渲染时对。
await page.reload();
await ready();
const again = await probe();
check("the caps survive a reload",
  again.imgs.length === first.imgs.length
    && again.imgs.every((i, n) => near(i.w, first.imgs[n].w) && near(i.h, first.imgs[n].h)),
  again.imgs);

const okSizes = checks.every((c) => c.pass);
console.log(JSON.stringify({ phase: "sizes", ok: okSizes, checks }, null, 2));
await space.finish({ keep: [] });
if (!okSizes) process.exitCode = 1;
EOF
```

Expected：`"ok": true`，每条 `"pass": true`。

## 2. 点开蒙层，它只盖这个 tab，点它或 Esc 关掉

```bash
ego-browser nodejs <<'EOF'
const WEB = "http://127.0.0.1:9093";

const space = await taskSpace("core-web-chat-image-lightbox");
// 这一段用自己的一页（p2），整页刷新和点击都不受上一段的状态影响。
const page = (await space.pages()).some((p) => p.label === "p2") ? space.page("p2") : await space.newPage();
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;

const probe = () =>
  page.evaluate(() => {
    const host = document.querySelector("engineer-chat");
    const root = host && host.shadowRoot;
    if (!root) return null;
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const lb = root.querySelector(".ai-lightbox");
    const lbImg = lb && lb.querySelector("img");
    const imgs = (cls) => [...root.querySelectorAll(`.ai-messages img.${cls}`)].map((img) => {
      const b = box(img);
      return { w: b.w, h: b.h, cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
    });
    const visible = lb && !lb.hidden;
    return {
      host: box(host),
      pane: box(root.querySelector(".pane")),
      open: !!visible,
      lightbox: visible ? box(lb) : null,
      lightboxImg: visible && lbImg ? { src: lbImg.getAttribute("src"), box: box(lbImg) } : null,
      // 蒙层盖到哪儿，看的是命中测试：顶栏那一条该命中顶栏自己，会话面板里该命中
      // <engineer-chat>（蒙层在它的 shadow tree 里，document 看不到）。
      hitTop: document.elementFromPoint(20, 20)?.id || document.elementFromPoint(20, 20)?.tagName,
      hitChat: document.elementFromPoint(20, box(host).y + 40)?.tagName,
      pasted: imgs("ai-user-img"),
      generated: imgs("ai-gen-img"),
    };
  });

const ready = () =>
  page.waitForFunction(
    () => {
      const root = document.querySelector("engineer-chat")?.shadowRoot;
      if (!root) return false;
      const imgs = [...root.querySelectorAll(".ai-messages img")];
      return imgs.length >= 2 && imgs.every((i) => i.complete && i.naturalWidth > 0);
    },
    null,
    { timeout: 8000 },
  );

await page.goto(`${WEB}/`);
await page.waitForSelector("engineer-chat");
await ready();
const closed = await probe();

// 点生图那张（宽图）：蒙层该贴着会话面板铺开，里面是这张图本身。
const gen = closed.generated[0];
await page.mouse.click(gen.cx, gen.cy, { label: "open generated image" });
const open = await probe();

check("a click opens the overlay", open.open, open.lightbox);
check("the overlay covers the conversation pane, not the window",
  open.lightbox && near(open.lightbox.x, open.pane.x) && near(open.lightbox.y, open.pane.y)
    && near(open.lightbox.w, open.pane.w) && near(open.lightbox.h, open.pane.h),
  { lightbox: open.lightbox, pane: open.pane, host: open.host });
check("the overlay is the tab's box, below the tab bar", open.lightbox && open.lightbox.y >= 40,
  open.lightbox);
check("the tab bar above is not covered", open.hitTop === "bar", open.hitTop);
check("inside the tab the overlay belongs to the chat", open.hitChat === "ENGINEER-CHAT", open.hitChat);
check("the overlay shows the image that was clicked",
  (open.lightboxImg?.src || "").endsWith("/blobs/wide"), open.lightboxImg?.src);
// 蒙层里是原图：不放大（2048 宽不撑满 2316 的面板），只在装不下时按比例缩到面板内。
// contain 的算法：能放下就 1:1，放不下按宽/高两个上限里更紧的那个缩。
const contain = (pane, nw, nh) => {
  const scale = Math.min(1, (pane.w - 48) / nw, (pane.h - 48) / nh);
  return { w: Math.round(nw * scale), h: Math.round(nh * scale) };
};
const wideWant = contain(open.pane, 2048, 1024);
check("the overlay shows the wide image at full size",
  open.lightboxImg && near(open.lightboxImg.box.w, wideWant.w, 2) && near(open.lightboxImg.box.h, wideWant.h, 2),
  { lightboxImg: open.lightboxImg?.box, expected: wideWant });

// 点蒙层空白处（左上角 8px 内）就关掉。
await page.mouse.click(open.pane.x + 8, open.pane.y + 8, { label: "dismiss the overlay" });
const dismissed = await probe();
check("a click on the overlay closes it", !dismissed.open, dismissed.lightbox);

// 再点竖图那张：蒙层里它按高度放到最大；Esc 关掉。
const pasted = dismissed.pasted[0];
await page.mouse.click(pasted.cx, pasted.cy, { label: "open pasted image" });
const openTall = await probe();
check("the pasted image opens too", openTall.open && (openTall.lightboxImg?.src || "").endsWith("/blobs/tall"),
  openTall.lightboxImg?.src);
// 竖图 1500 高装不下面板，按高度缩：这一张在蒙层里明显比信息流里的 300 大。
const tallWant = contain(openTall.pane, 900, 1500);
check("the overlay fits the tall image inside the pane",
  openTall.lightboxImg && near(openTall.lightboxImg.box.w, tallWant.w, 2)
    && near(openTall.lightboxImg.box.h, tallWant.h, 2),
  { lightboxImg: openTall.lightboxImg?.box, expected: tallWant });
check("the overlay is bigger than the feed cap", openTall.lightboxImg && openTall.lightboxImg.box.h > 300,
  openTall.lightboxImg?.box);

await page.keyboard.press("Escape");
const afterEsc = await probe();
check("Esc closes the overlay", !afterEsc.open, afterEsc.lightbox);
check("Esc leaves the feed untouched", afterEsc.generated.length === 1 && afterEsc.pasted.length === 1, afterEsc);
check("a closed overlay drops its image", (afterEsc.lightboxImg?.src ?? null) === null
  || afterEsc.lightboxImg === null, afterEsc.lightboxImg);

const ok = checks.every((c) => c.pass);
console.log(JSON.stringify({ phase: "overlay", ok, checks }, null, 2));
await space.finish({ keep: [] });
if (!ok) process.exitCode = 1;
EOF
```

Expected：`"ok": true`，退出码 `0`。

改动前（四种退化，都能看见）：

- 完全没改的组件（`~/.engineer/apps/versions/*/web/` 里那份，实测过）：第 1 段直接死在 `ready()` 的
  8s 超时 —— 回放的用户图是 `data:undefined;base64,undefined` 的坏图（`userMessage()` 只认 `data`），
  `naturalWidth` 永远不 > 0。
- 只加尺寸、没加蒙层：`document.querySelector(".ai-lightbox")` 是 `null`，`a click opens the overlay` 先红。
- 蒙层写成 `position: fixed`（贴窗口而不是贴面板）：`the overlay covers the conversation pane, not the window`
  红（`lightbox.y` 是 0，`pane.y` 是 41），`the tab bar above is not covered` 也红（命中 `ENGINEER-CHAT`）。
- 尺寸只改了一类图：`pasted image is capped at 300 tall` 或 `generated image is capped at 300 wide` 红。

## Teardown

```bash
pkill -f "image-lightbox-fixture" 2>/dev/null || true
rm -f /tmp/image-lightbox-fixture.js
```

## 没覆盖的

- **生图 / 粘贴的实时路径**（`imageMessage` / `userMessage` 当场画出来的那一张）：要真模型或真粘贴，
  不可确定；和回放共用同一个 `imageMessage` / `userMessage`，尺寸与点击都在组件里，两边一致。
  人工在 dev 栈上看一眼，结论记在迭代记录里。
- **markdown 正文里的图**（`.ai-markdown img`）走同一条共用规则，但这段历史里没有，没断言。
- **Esc 与「停一轮」的关系**：只在没有运行中的一轮时验证（Esc 到蒙层就 `stopPropagation()`，
  不会到达窗口上的 stop 监听）。有运行中的一轮时两者都该只有蒙层关，人工确认。
- **`/blobs` 过期**：回放的用户图指向 `${AI}/blobs/<sha256>`，blob 没了就是坏图（既有回读路由的缺口，
  见迭代记录的「已知缺口」）。

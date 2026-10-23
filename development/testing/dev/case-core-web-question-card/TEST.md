# Test: core-web-question-card

两件用户会碰到的事，同一个卡（见 `development/iterations/2610-51-ask_user 卡片回放与内边距.md`）：

1. **刷新后提问卡还在**。`ask_user` 的卡原先在回放 log 历史时被显式跳过（`b.name !== "ask_user"`），
   刷新后连问题文字都没有，只剩助手正文和用户回答。回放要按原位置把卡画回来 —— 助手正文之后、
   用户回答之前 —— 并且落定为「已答」：按钮和输入框都 `disabled`。
2. **卡里的内容不贴边**。`.ai-msg { padding: 0 }` 而 `.ai-question` 没补自己的 padding，
   内容与紫边框间距为 0。修完后 `padding` 是 `10px 12px`，问题文字左/上内缩 ≥ 10px。

不需要模型，也不需要跑全套服务：这段历史是**造**出来的，脚本化的 ai + log 交给页面，
**真实组件**从 `workspace/web` 原样服务。真实浏览器、真实 `fetch`、真实回放代码，
只有服务端那一侧是脚本（和 `case-core-web-chat-composer` 同一个做法）。

## Setup

前置：`ego-browser` 在 `PATH` 上（`ego-browser --version`），Bun 可用。

端口：**9074**（脚本化的 ai + log + 静态文件，同一个 origin，省掉 CORS）。

```bash
pkill -f "question-card-fixture" 2>/dev/null || true
sleep 1

# 夹具不属于系统：它把这段历史端出来，并从 workspace/web 原样服务真实组件。
# 放在 /tmp（仓库之外），这个用例就只有 desp.yaml + TEST.md。
cat > /tmp/question-card-fixture.js <<'JS'
const WEB = process.env.WEB_DIR; // workspace/web

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>question-card</title>
<link rel="stylesheet" href="/theme.css"></head>
<body style="margin:0;height:100vh">
<engineer-chat session="s_qcard0000000001" autofocus></engineer-chat>
<script type="module" src="/components/chat.js"></script>
</body></html>`;

// 一段已经答完的对话：带 options 的提问 → 回答 → 不带 options 的提问 → 回答。
// 形状就是 ai 写进 log 的样子（raw 是 pi 的原始消息）。
const history = `messages:
  - seq: 1
    role: assistant
    content: "继续吗？"
    raw:
      role: assistant
      content:
        - type: toolCall
          id: call_q1
          name: ask_user
          arguments:
            text: 继续吗？
            options:
              - label: 继续
                value: 继续
              - label: 算了
                value: 算了
  - seq: 2
    role: user
    content: 继续
    raw:
      role: user
      content: 继续
  - seq: 3
    role: assistant
    content: "你怎么称呼？"
    raw:
      role: assistant
      content:
        - type: toolCall
          id: call_q2
          name: ask_user
          arguments:
            text: 你怎么称呼？
  - seq: 4
    role: user
    content: 小王
    raw:
      role: user
      content: 小王
`;

const yamlRes = (text) => new Response(text, { headers: { "Content-Type": "application/yaml" } });

Bun.serve({
  port: 9074,
  hostname: "127.0.0.1",
  async fetch(req) {
    const p = new URL(req.url).pathname;

    if (p === "/") return new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    if (p === "/config.js") {
      const base = "http://127.0.0.1:9074";
      return new Response(
        `export const ENGINEER = {static:${JSON.stringify(base)}, ai:${JSON.stringify(base)}, log:${JSON.stringify(base)}};\nexport default ENGINEER;\n`,
        { headers: { "Content-Type": "application/javascript" } },
      );
    }

    // 这一段没有在跑的一轮：页面只回放历史，不会接管任何东西。
    if (p === "/ai/resume") return yamlRes("sessionId: s_qcard0000000001\nlastSeq: 9\nactive: false\n");
    if (p === "/ai/stream") return yamlRes(""); // active=false 时不会有人来读
    if (p === "/ai/stop") return yamlRes("ok\n");
    if (p === "/log/session/messages") return yamlRes(history);

    if (p.startsWith("/components/") || p.startsWith("/vendor/") || p === "/theme.css") {
      const file = Bun.file(WEB + p);
      if (await file.exists()) return new Response(file);
    }
    return new Response("not found\n", { status: 404 });
  },
});

console.log("question-card-fixture on 9074");
JS

WEB_DIR="$PWD/workspace/web" bun /tmp/question-card-fixture.js >/tmp/question-card-fixture.log 2>&1 &
for i in $(seq 1 40); do
  curl -s -o /dev/null -m 2 http://127.0.0.1:9074/config.js && break
  sleep 0.5
done
curl -s http://127.0.0.1:9074/config.js
```

Expected：`export const ENGINEER = {"static":"http://127.0.0.1:9074", ...}`（三段地址都指向夹具）。

## 1. 打开页面：两张卡回来，有内边距，不能点

```bash
ego-browser nodejs <<'EOF'
const WEB = "http://127.0.0.1:9074";

const space = await taskSpace("core-web-question-card");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });

const probe = () =>
  page.evaluate(() => {
    const root = document.querySelector("engineer-chat")?.shadowRoot;
    if (!root) return null;
    return [...root.querySelectorAll(".ai-question")].map((card) => {
      const cs = getComputedStyle(card);
      const box = card.getBoundingClientRect();
      const q = card.firstElementChild;
      const t = q.getBoundingClientRect();
      return {
        question: q.textContent,
        padTop: cs.paddingTop,
        padLeft: cs.paddingLeft,
        insetLeft: Math.round(t.left - box.left),
        insetTop: Math.round(t.top - box.top),
        buttons: [...card.querySelectorAll("button")].map((b) => ({ label: b.textContent, disabled: b.disabled })),
        inputs: [...card.querySelectorAll("input")].map((i) => i.disabled),
      };
    });
  });

const ready = () =>
  page.waitForFunction(() => {
    const root = document.querySelector("engineer-chat")?.shadowRoot;
    return !!root && root.querySelectorAll(".ai-question").length >= 2;
  }, null, { timeout: 8000 });

await page.goto(`${WEB}/`);
await page.waitForSelector("engineer-chat");
await ready();
const first = await probe();

check("replay draws both ask_user cards", first.length === 2, { n: first.length });
check("choice card keeps its question", first[0]?.question === "继续吗？", first[0]);
check("free-form card keeps its question", first[1]?.question === "你怎么称呼？", first[1]);
check("choice card keeps its options",
  JSON.stringify((first[0]?.buttons || []).map((b) => b.label)) === JSON.stringify(["继续", "算了"]), first[0]);
check("free-form card still has its input", (first[1]?.inputs || []).length === 1, first[1]);

for (const [i, c] of first.entries()) {
  check(`card ${i + 1} has padding 10px 12px`, c.padTop === "10px" && c.padLeft === "12px",
    { top: c.padTop, left: c.padLeft });
  check(`card ${i + 1} keeps its text off the border`, c.insetLeft >= 10 && c.insetTop >= 10,
    { insetLeft: c.insetLeft, insetTop: c.insetTop });
}

check("no replayed control can be clicked",
  first.every((c) => c.buttons.every((b) => b.disabled) && c.inputs.every((d) => d)),
  first.map((c) => ({ buttons: c.buttons, inputs: c.inputs })));

// 用户的原话就是「刷新一下」。
await page.reload();
await ready();
const again = await probe();
check("cards survive a reload",
  JSON.stringify(again.map((c) => c.question)) === JSON.stringify(first.map((c) => c.question)),
  again.map((c) => c.question));
check("a reloaded card is still disabled",
  again.every((c) => c.buttons.every((b) => b.disabled) && c.inputs.every((d) => d)),
  again.map((c) => ({ buttons: c.buttons, inputs: c.inputs })));

const ok = checks.every((c) => c.pass);
console.log(JSON.stringify({ ok, checks }, null, 2));
await space.finish({ keep: [] });
if (!ok) process.exitCode = 1;
EOF
```

Expected：`"ok": true`，全部 check `"pass": true`，退出码 `0`。

修复前（两种退化，都见过）：

- 回放那处没改：第一条 `waitForFunction` 8s 超时（一张卡都不画）；
- 只改了回放、没加 padding：`card N has padding 10px 12px` 这条 `pass: false`
  （`padTop` 为 `0px`、`insetLeft`/`insetTop` 为 `1`）。

## Teardown

```bash
pkill -f "question-card-fixture" 2>/dev/null || true
rm -f /tmp/question-card-fixture.js
```

## 没覆盖的

- **live 路径**（`tool_execution_start` 画出可点的卡）：要真模型产出 `ask_user`，不可确定；
  与回放共用同一个 `questionCard`，人工在 dev 栈验证，结论记在迭代记录里。
- **卡宽跟随内容**（短问题卡 99px、自由输入框 151px）是登记但本轮不修的遗留，这里不断言，
  免得把未修的行为固化成期望。

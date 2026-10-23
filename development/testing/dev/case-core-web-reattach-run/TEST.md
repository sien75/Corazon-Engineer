# Test: core-web-reattach-run

页面在一次运行**中途**挂载时，要接着这一轮走（见
`development/iterations/2610-50-中途挂载接管在跑的那一轮.md`）。修复前它在挂载时只
「空订阅读流」挪水位、然后画历史，`running` 一直是 false：不显示 stop，也不开流，
直到用户自己发一条消息——用户看到的正是「你在跑着，但是我这里不显示 stop 按钮了」。

`contracts/ai-resume.yaml` 早就给了两个字段：`lastSeq`（水位）和 `active`
（`a resuming client should reattach to /ai/stream when true`）。这个用例就钉这两件事：

1. `active: true` 时，**没点过任何东西**的页面也显示 stop；
2. 接管的那条流从 `since: lastSeq` 续上（不是从 0 重放整轮），并且事件真的画了出来；
3. `agent_settled` 之后 stop 收起来。

确定性由脚本化的 ai 提供：`/ai/resume` 固定回 `{lastSeq: 3, active: true}`，
`/ai/stream` 按 `since` 之后补几条事件、停 3 秒再 `agent_settled`。**真实组件**从
`workspace/web` 原样服务，真实浏览器、真实 `fetch`、真实 SSE，只有模型那一侧是脚本。

## Setup

前置：`ego-browser` 在 `PATH` 上（`ego-browser --version`），Bun 可用。

端口：**9072**（脚本化的 ai + 静态文件，同一个 origin，省掉 CORS）。

```bash
PORT=9072
pkill -f "reattach-ai" 2>/dev/null || true
sleep 1

# 夹具不属于系统：它只把这一轮演出来，并从 workspace/web 原样服务真实组件。
# 放在 /tmp（仓库之外），这个用例就只有 desp.yaml + TEST.md。
cat > /tmp/reattach-ai.js <<'JS'
const WEB = process.env.WEB_DIR;          // workspace/web
const seen = { resume: 0, since: [] };

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>reattach-run</title>
<link rel="stylesheet" href="/theme.css"></head>
<body style="margin:0;height:100vh">
<engineer-chat session="s_reattach000000001" autofocus></engineer-chat>
<script type="module" src="/components/chat.js"></script>
</body></html>`;

const yamlRes = (text) => new Response(text, { headers: { "Content-Type": "application/yaml" } });

Bun.serve({
  port: 9072,
  hostname: "127.0.0.1",
  async fetch(req) {
    const p = new URL(req.url).pathname;

    if (p === "/") return new Response(page, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    if (p === "/config.js") {
      const base = "http://127.0.0.1:9072";
      return new Response(
        `export const ENGINEER = {static:${JSON.stringify(base)}, ai:${JSON.stringify(base)}, log:${JSON.stringify(base)}};\nexport default ENGINEER;\n`,
        { headers: { "Content-Type": "application/javascript" } },
      );
    }

    // 这一轮已经在跑：水位在 3，之后的事件都要走流。
    if (p === "/ai/resume") {
      seen.resume++;
      return yamlRes("sessionId: s_reattach000000001\nlastSeq: 3\nactive: true\n");
    }
    if (p === "/ai/stop") return yamlRes("ok\n");
    if (p === "/log/session/messages") return yamlRes("messages: []\n");
    if (p === "/seen")
      return new Response(JSON.stringify(seen), { headers: { "Content-Type": "application/json" } });

    if (p === "/ai/stream") {
      const body = await req.text();
      const since = Number((/(?:^|\n)since:\s*(-?\d+)/.exec(body) || [])[1] ?? 0);
      seen.since.push(since);
      const enc = new TextEncoder();
      const nap = (ms) => new Promise((r) => setTimeout(r, ms));
      const stream = new ReadableStream({
        async start(ctl) {
          const send = (ev) => ctl.enqueue(enc.encode(`id: ${ev.seq}\ndata: ${JSON.stringify(ev)}\n\n`));
          await nap(300);
          send({ seq: 4, type: "message_update", assistantMessageEvent: { type: "text_start" } });
          send({ seq: 5, type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "接管成功：这一轮还在跑。" } });
          send({ seq: 6, type: "message_end" });
          // 留出 3 秒，够浏览器断言「跑着的时候 stop 是亮的」。
          await nap(3000);
          send({ seq: 7, type: "agent_settled" });
          ctl.close();
        },
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
    }

    if (p.startsWith("/components/") || p.startsWith("/vendor/") || p === "/theme.css") {
      const file = Bun.file(WEB + p);
      if (await file.exists()) return new Response(file);
    }
    return new Response("not found\n", { status: 404 });
  },
});

console.log("reattach-ai on 9072");
JS

WEB_DIR="$PWD/workspace/web" bun /tmp/reattach-ai.js >/tmp/reattach-ai.log 2>&1 &
for i in $(seq 1 40); do
  curl -s -o /dev/null -m 2 http://127.0.0.1:9072/config.js && break
  sleep 0.5
done
curl -s http://127.0.0.1:9072/config.js
```

Expected：`export const ENGINEER = {"static":"http://127.0.0.1:9072", ...}`（三段地址都指向夹具）。

## 1. 挂载后什么都不点，stop 就是亮的，事件在画，流从水位续

```bash
ego-browser nodejs <<'EOF'
const WEB = "http://127.0.0.1:9072";

const space = await taskSpace("core-web-reattach-run");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });

const stopHidden = () =>
  page.evaluate(() => document.querySelector("engineer-chat")?.shadowRoot?.querySelector(".ai-stop")?.hidden ?? null);

const said = () =>
  page.evaluate(() =>
    (document.querySelector("engineer-chat")?.shadowRoot?.querySelector(".ai-messages")?.textContent || "").includes("接管成功"),
  );

// 打开页面，不点任何东西，不等用户输入。
await page.goto(`${WEB}/`);
await page.waitForSelector("engineer-chat");

// 1. 事件来了：说明挂载后确实开了流（修复前这里永远等不到）。
await page.waitForFunction(
  () =>
    (document.querySelector("engineer-chat")?.shadowRoot?.querySelector(".ai-messages")?.textContent || "").includes("接管成功"),
  null,
  { timeout: 8000 },
);
check("the page draws the running run's events", await said());

// 2. 这一轮还在跑，所以 stop 必须亮着（修复前是 hidden）。
check("stop is offered while the run is in flight", (await stopHidden()) === false);

// 3. 流是从 resume 报的 lastSeq 续上的，不是从 0 重放。
const seen = await (await fetch(`${WEB}/seen`)).json();
check("stream resumed from lastSeq, not from 0", seen.since[0] === 3, { since: seen.since });
check("the page asked ai to resume", seen.resume >= 1, { resume: seen.resume });

// 4. 这一轮收工后 stop 收起来。
await page.waitForFunction(
  () => document.querySelector("engineer-chat")?.shadowRoot?.querySelector(".ai-stop")?.hidden === true,
  null,
  { timeout: 8000 },
);
check("stop goes away when the run settles", (await stopHidden()) === true);

const ok = checks.every((c) => c.pass);
console.log(JSON.stringify({ ok, checks }, null, 2));
await space.finish({ keep: [] });
if (!ok) process.exitCode = 1;
EOF
```

Expected：`"ok": true`，四条 check 全 `"pass": true`，退出码 `0`。
修复前：第一条 `waitForFunction` 就会超时（挂载不开流、事件不画）。

## Teardown

```bash
pkill -f "reattach-ai" 2>/dev/null || true
rm -f /tmp/reattach-ai.js
```

## 没覆盖的

- **接管前已经发出的半条消息**：从 `lastSeq` 续流，那条消息的前缀不重画（它还没落进 log）。
  这是写进迭代记录的取舍，这里不断言。
- **`pump()` 的空转复查**（一段流一个事件都没拿到就用 `/ai/resume` 复查 `active`）：
  需要对端「resume 说 active、随后的流却是空的」，夹具不模拟这种服务端重启，靠人工与代码评审。

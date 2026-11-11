# Test: core-web-workspace-follow

外壳订阅 log 的 `/log/workspace/stream`，收到事件就重新读工作区。所以**不管谁改的**
（main 调接口、另一个窗口、手动 curl），tab 条都会跟上，不需要 main 的工具帧，也不需要刷新页面。

用例钉住：

- 页面开着，页面**之外**用 `/ai/new` + `/log/session/on` 开一个 session → tab 条里出现它的 tab，
  标题是页面 `<title>`；
- 页面之外 `/log/session/off` → 这个 tab 消失；
- 页面之外把它再 `/log/session/on` → 又回来；
- 全程没有 `page.reload()` / `goto`。

不需要模型，ai 用 `--stub`。

## Setup

Prerequisite: `ego-browser` on `PATH`。

```bash
ROOTDIR="$PWD"
ROOT="$ROOTDIR/.engineer/.ws-follow"
HOME_DIR="$ROOT/home"

: "${HOME_DIR:?this case must set HOME_DIR before reclaiming}"
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 9150 9151 9152 9153; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
sleep 1

rm -rf "$ROOT" && mkdir -p "$HOME_DIR" "$ROOT/.agents/blueprints/probe" "$ROOT/docs"
printf 'project: ws-follow\n' > "$ROOT/engineer.yaml"
cat > "$ROOT/.agents/blueprints/probe/index.html" <<'HTML'
<!doctype html>
<html lang="zh">
<head><meta charset="UTF-8"><title>Probe Page</title><link rel="stylesheet" href="/theme.css"></head>
<body><h1>probe</h1><engineer-chat></engineer-chat><script type="module" src="/components/chat.js"></script></body>
</html>
HTML
printf '# Probe\n\nthe probe blueprint\n' > "$ROOT/.agents/blueprints/probe/README.md"

(cd how-to/deploy/prod && go build -o /tmp/engineer .)
/tmp/engineer serve-log --home "$HOME_DIR" --bind 127.0.0.1 --port 9151 >/tmp/ws-follow-log.log 2>&1 &
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:9151/log/project/list -d '{}' && break
  sleep 1
done
curl -s -X POST http://localhost:9151/log/project/add -H 'Content-Type: application/yaml' \
  --data-binary "path: $ROOT" | awk '$1=="projectId:" {print $2}' > "$ROOT/.project"
/tmp/engineer serve-static --log http://localhost:9151 --bind 127.0.0.1 --port 9152 >/tmp/ws-follow-static.log 2>&1 &
(cd workspace/ai && bun run src/main.ts --home "$HOME_DIR" --bind 127.0.0.1 --port 9150 --stub \
  --log http://localhost:9151 --static http://localhost:9152 \
  --agents "$ROOTDIR/agents" --docs "$ROOT/docs" >/tmp/ws-follow-ai.log 2>&1 &)
for i in $(seq 1 60); do
  curl -s -o /dev/null -m 2 -X POST http://localhost:9150/ai/new -d 'kind: main' && break
  sleep 1
done
/tmp/engineer serve-web --bind 127.0.0.1 --port 9153 --assets "$ROOTDIR/workspace/web" \
  --static http://localhost:9152 --ai http://localhost:9150 --log http://localhost:9151 \
  >/tmp/ws-follow-web.log 2>&1 &
sleep 1
```

## Run

```bash
ego-browser nodejs <<'JS'
const WEB = "http://localhost:9153";
const LOG = "http://localhost:9151";
const AI = "http://localhost:9150";
const space = await taskSpace("core-web-workspace-follow");
const page = space.page("p1");
const checks = [];
const check = (name, pass, info) => checks.push({ name, pass: !!pass, ...(info ? { info } : {}) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (url, body) =>
  (await page.fetch(url, { method: "POST", headers: { "Content-Type": "application/yaml" }, body })).body;
const sessionLabels = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("#tabs .tab")]
      .filter((t) => !t.classList.contains("main") && !t.classList.contains("launcher") && !t.classList.contains("launcher-entry"))
      .map((t) => t.querySelector(".tab-label")?.textContent.trim()));
// the bar is redrawn by an event, not by this script: poll for it, never reload
const waitLabels = async (pred, ms = 5000) => {
  const end = Date.now() + ms;
  let last = [];
  while (Date.now() < end) {
    last = await sessionLabels();
    if (pred(last)) return last;
    await sleep(200);
  }
  return last;
};

await page.goto(`${WEB}/`);
await page.waitForSelector("#tabs .tab.main", { state: "visible" });
await page.waitForSelector("#tabs .tab-group", { state: "visible" });
// the scratch project is the only one on the board
const PROJECT = String(await post(`${LOG}/log/project/list`, "{}")).match(/projectId:\s*(\S+)/)[1];
const before = await sessionLabels();
check("nothing is open at the start", before.length === 0, { before });

// 1. someone else makes an agent and puts it on screen
const created = await post(`${AI}/ai/new`, `projectId: ${PROJECT}\nblueprint: probe\n`);
const SUB = String(created).match(/sessionId:\s*(\S+)/)?.[1];
check("the agent was created outside the page", !!SUB, { created });
await post(`${LOG}/log/session/on`, `sessionIds: [${SUB}]\n`);
const shown = await waitLabels((l) => l.length === 1);
check("its tab appears without a reload, named after the page", shown.length === 1 && shown[0] === "Probe Page", { shown });

// 2. someone else closes it
await post(`${LOG}/log/session/off`, `sessionIds: [${SUB}]\n`);
const gone = await waitLabels((l) => l.length === 0);
check("closing it elsewhere removes the tab", gone.length === 0, { gone });

// 3. and opens it again
await post(`${LOG}/log/session/on`, `sessionIds: [${SUB}]\n`);
const back = await waitLabels((l) => l.length === 1);
check("opening it again brings the tab back", back.length === 1 && back[0] === "Probe Page", { back });

const ok = checks.every((c) => c.pass);
console.log(JSON.stringify({ ok, checks }, null, 2));
if (!ok) process.exit(1);
JS
```

Expected: `ok: true`，所有 checks 通过。

## Teardown

```bash
pkill -f "serve-log --home $HOME_DIR" 2>/dev/null || true
pkill -f "main.ts.*--home $HOME_DIR" 2>/dev/null || true
for p in 9150 9151 9152 9153; do pkill -f "serve-.*--port $p" 2>/dev/null || true; done
rm -rf "$ROOT"
```

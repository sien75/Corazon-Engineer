# Blueprint

一个蓝图是一个 HTML 文件: `<项目目录>/<slug>.html`. 它自带页面, 自带的表, 自带的编排, 自带的
后端脚本.

蓝图住在**项目**里: 一个项目就是一个蓝图目录, 在 engineer 的 web UI 里导入(角落的切换按钮, 或者
还没有项目时外壳先弹的那个对话框), 记在 data home 的 `config.yaml` 里. 导入的项目都在跑, 不管在不在
前台; 切换按钮只决定 `/bp` 列哪一个. 目录是用户自己的, 可以放到 git 下管.

蓝图的地址带项目: `/bp/<project>/<slug>` 是 **prod**(自己在用的那份), `/bp-dev/<project>/<slug>`
是 **dev**, 各有自己的库 (`<home>/projects/<project>/blueprints/<id>.prod.sqlite` /
`<id>.dev.sqlite`). prod 在项目导入时就起好, 页面开不开都一样; dev 在第一次打开它的页面时才起.
两者都不会因为文件改了而重载: 页面右下角有 **刷新** (prod) / **重启** (dev) 按钮, 那是改动生效的
唯一途径.

## 形状

```html
<!doctype html>
<title>显示名</title>
<meta id="author.thing">

<script type="blueprint/sql">
  CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, body TEXT);
</script>

<script type="blueprint/flow">
  - on: ui.save
    steps:
      - id: clean
        run: trim
      - sql: INSERT INTO notes(body) VALUES(:body)
        with: { body: ${{ steps.clean.output.text }} }
      - emit: ui.saved
</script>

<script type="blueprint/js" id="trim">
export default async (input) => ({ text: String(input.text || "").trim() });
</script>

<script type="blueprint/init.js">
// 跟着运行时起, 不是跟着页面起: stdout 每行一个事件.
export default async () => {
  console.log(JSON.stringify({ emit: "sys.ready", data: { at: Date.now() } }));
  await new Promise(() => {}); // 一直跑着: 监听就写在这里
};
</script>

<body>
  <script>
    bp.watch("notes", (rows) => { /* 画出来 */ });
    document.querySelector("button").onclick = () => bp.emit("ui.save", { text: "hi" });
  </script>
</body>
```

- 不写 `<html>`, 不写 `<head>`, `</body>` 也可以省. 顺序: `<title>`, `<meta id>`, sql, flow, 脚本 (init 放最后),
  然后 `<body>`. 所有后端块都要排在第一个正文内容之前 — 解析器遇到第一个非 head 元素就开始正文了.
- `<title>` 是显示名. `<meta id>` 是身份: 蓝图库就按它命名, 所以文件删了再加回来, 数据还在. 只用字母,
  数字, `.`, `_`, `-`.
- 只有要让浏览器执行的东西才放进 `<body>`, 其余都是后端块.

## 后端块

都是 `<script type="blueprint/…">`: 浏览器跳过它们, 服务在伺服页面时把它们整块剪掉, 所以后端代码和
schema 永远不进浏览器.

- **`blueprint/sql`** — 普通 sqlite, 打在这个蓝图自己的库上. 每次打开都会执行, 所以写
  `CREATE TABLE IF NOT EXISTS`; 不要 drop, 也不要重建有数据的表.
- **`blueprint/flow`** — YAML, 一组规则. 见下.
- **`blueprint/<kind> id="…"`** — 一个脚本, flow 按 id 引用它. kind: `js` (bun, default export), `sh`,
  `bash`, `py`; 其他 kind 就当成命令名.
- **`blueprint/init.<kind>`** — 至多一个, 而且没有 `id`: 没有 flow 跑它. 蓝图起它就起, 一直跑到蓝图被重启或它自己
  退出, 所以蓝图**监听**什么就写在这里 — 文件、socket、定时器, 都行. 它的 stdout 不是它的输出: 每行一个事件
  `{"emit":"<type>","data":{…}}`, 以 `source: init` 放上总线; 不是事件的行走 `log` 事件. stderr 和其他脚本一样是
  `log` 事件. 它不写库 — 它发事件, 由 flow 去写. 没有超时; 它退出后不会自动重启(重启用重启按钮).

块内容里要出现 `</script>` 只能写成 `<\/script>` (`<!--` 写成 `<\!--`); 服务加载时还原.

## Flow

```yaml
- on: ui.save            # 启动这条规则的事件 type
  steps:
    - id: clean           # 可选: 后面用 ${{ steps.clean.output }} 引用
      run: trim           # 按 id 跑脚本
      with: ${{ event.data }}   # 这一步的入参; 缺省就是上一步的输出
    - sql: INSERT INTO notes(body) VALUES(:body)
      with: { body: ${{ steps.clean.output.text }} }
    - emit: ui.saved      # 发一个事件, 也可以回到页面
```

- 每一步 `run` / `sql` / `emit` 三选一.
- `with` 是这一步的入参: 整串就是一个 `${{ … }}` 表达式 (`event.data`, `event.data.<key>`,
  `steps.<id>.output[.<key>]`), 或者一组这样的键值. 没有别的表达式, 没有 `if`, 没有循环.
- 一步的输出就是下一步的输入, 所以一条规则就是一条链: 脚本 → 脚本 → 写库 → 通知.
- 脚本是纯的: 不写库, 不发事件. 两件事都在 flow 里声明 — 这样 flow 是唯一说清这个蓝图干了什么的地方.
  例外是 init 脚本: 没有 flow 跑它, 所以它能发事件.

## 脚本约定

任何语言都是: 一个 JSON 进, 一个 JSON 出. `input` 从 stdin (`BP_INPUT` 里也有一份), 结果是 stdout 上的
JSON, 非 0 退出码算失败. `sh` 打印一行也行 — 不是 JSON 的 stdout 就当字符串往下传. stderr 在脚本运行期间
按行推给页面, 变成 `log` 事件.

环境变量说清它在哪跑: `BP_BLUEPRINT` (id)、`BP_SCRIPT`、`BP_SCRIPT_FILE`、`BP_MODE` (`prod` 或 `dev`)、
`BP_AI` (ai 服务的地址). 它**在蓝图目录里**跑 — `process.cwd()` 就是那个目录, 也就是 `/ai/new` 该给的 `cwd`.

## 页面的通道

挂在文档最前面, 页面自己的脚本可以直接用.

| 调用 | |
|---|---|
| `bp.emit(type, data)` | 发事件到总线上 — 监听这个 `type` 的 flow 立刻开始 |
| `bp.on(type, cb)` | 监听; 流里是所有事件, 包括页面自己发的和脚本日志 |
| `bp.watch(table, cb)` | 画一张表: 先拿当前行调一次 `cb(rows)`, 之后每次写库都回整张表 |
| `bp.sql(sql, params)` | 表协议表达不了的语句; `:name` 用对象传, 位置参数用数组 |
| `bp.reload()` | 重新读文件并重新开始, 然后刷新页面 — 和右下角按钮一样 |

`bp.mode` 是 `"prod"` 或 `"dev"`, 取自页面被伺服的那个地址.

## 问 ai 服务

没有 `ai` 步骤: 脚本自己调 ai 服务. 它的地址在环境变量 `BP_AI` 里, 会话 id 存在蓝图自己的表里, 所以
什么时候沿用会话、什么时候换新, 由 flow 决定.

```yaml
- on: ui.ask
  steps:
    - id: read
      sql: SELECT sid FROM chat WHERE id = 1
    - id: reply
      run: ask
      with:
        sid: ${{ steps.read.output.0.sid }}
        prompt: ${{ event.data.q }}
    - sql: INSERT INTO chat(id, sid) VALUES(1, :sid) ON CONFLICT(id) DO UPDATE SET sid = excluded.sid
      with:
        sid: ${{ steps.reply.output.sid }}
    - emit: ui.reply
      with:
        reply: ${{ steps.reply.output.reply }}
```

- `sql` 的读语句返回的是行列表, 所以第一行的某一列是 `steps.<id>.output.0.<列名>`.
- 写回去要用 **upsert** (`ON CONFLICT … DO UPDATE`), 不是 `UPDATE`: 第一段对话还没有这一行, `UPDATE` 会一行都匹配不到.
- id 存在一张表里 (`CREATE TABLE IF NOT EXISTS chat(id INTEGER PRIMARY KEY, sid TEXT)`): 用 `sql` 步骤读出来,
  把 `{ sid, prompt, system? }` 交给脚本, 再把返回的 `sid` 写回去. 没有这一行 (或 `sid` 为空) 就是新会话;
  删掉这一行就是重新开始.
- 没有 `sid` → `POST /ai/new { cwd, system }`, 系统提示词只在这里给一次. 有 `sid` → 不再给 `system`,
  并且先 `POST /ai/resume { id }` (engineer 重启后活会话没了), 记下它的 `lastSeq`.
- 然后 `POST /ai/ask { id, blocks: [{ type: "text", text }] }`, 读 `POST /ai/stream { id, since }` 直到
  `agent_settled`. **`since` 必须是 resume 返回的 `lastSeq`** (新会话传 0), 否则上一轮的 `agent_settled`
  会让读取立刻结束, 回复是空的. 回复文本在 `text_delta` 事件里.
- 请求体可以是 JSON (YAML 能解析); 返回是 YAML (`js` 脚本里用 `Bun.YAML.parse`); 流是 SSE, 事件在
  `data:` 行里, 内容是 YAML.

一个把上面全做了的 `js` 脚本 — 入 `{ sid?, prompt, system? }`, 出 `{ sid, reply }`:

```js
export default async ({ sid, prompt, system }) => {
  const ai = process.env.BP_AI;
  const post = async (path, body) => {
    const r = await fetch(ai + path, { method: "POST", headers: { "Content-Type": "application/yaml" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
    return r;
  };
  const yaml = async (r) => Bun.YAML.parse(await r.text());

  let since = 0;
  if (!sid) sid = (await yaml(await post("/ai/new", { cwd: process.cwd(), system }))).sessionId;
  else since = (await yaml(await post("/ai/resume", { id: sid }))).lastSeq;

  await post("/ai/ask", { id: sid, blocks: [{ type: "text", text: prompt }] });

  let reply = "", buf = "";
  const res = await post("/ai/stream", { id: sid, since });
  for await (const chunk of res.body.pipeThrough(new TextDecoderStream())) {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i); buf = buf.slice(i + 2);
      const text = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
      if (!text) continue;
      const ev = Bun.YAML.parse(text);
      const d = ev.assistantMessageEvent;
      if (ev.type === "message_update" && d?.type === "text_delta") reply += d.delta;
      if (ev.type === "error") throw new Error(ev.error?.message ?? "ai error");
      if (ev.type === "agent_settled") return { sid, reply };
    }
  }
  return { sid, reply };
};
```

## 经验规则

- 表就是协议: 页面画什么和 flow 写什么是同一个 `CREATE TABLE`, 页面监听表, 不用手写接口.
- 一个文件: 要共用东西就加一张表, 不要加第二个文件.
- 右下角按钮才是重新加载; 别的都不是. 打开页面不重载, 文件改了也不重载, 两种情况下库都不丢.
- 监听写在 init 脚本里, 不是写在页面里: 蓝图不管有没有人在看都在跑, 页面只决定有没有人来收事件.
- prod 和 dev 是同一个文件两个库: 你在改的那份, 永远不会写用户正在用的行.
- schema 和脚本是给服务的, 不是给浏览器的; 不要在页面 JavaScript 里重复它们.
# Blueprint

Blueprint 是一个 HTML 文件: `.agents/blueprints/<slug>.html`. 它自带页面, 自带的表, 自带的编排, 自带的
后端脚本;蓝图服务打开它的那一刻起生效 — `/b/<slug>`.

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

<body>
  <script>
    bp.watch("notes", (rows) => { /* 画出来 */ });
    document.querySelector("button").onclick = () => bp.emit("ui.save", { text: "hi" });
  </script>
</body>
```

- 不写 `<html>`, 不写 `<head>`, `</body>` 也可以省. 顺序: `<title>`, `<meta id>`, sql, flow, 脚本, 然后
  `<body>`. 所有后端块都要排在第一个正文内容之前 — 解析器遇到第一个非 head 元素就开始正文了.
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

- 每一步 `run` / `sql` / `emit` / `ai` 四选一.
- `with` 是这一步的入参: 整串就是一个 `${{ … }}` 表达式 (`event.data`, `event.data.<key>`,
  `steps.<id>.output[.<key>]`), 或者一组这样的键值. 没有别的表达式, 没有 `if`, 没有循环.
- 一步的输出就是下一步的输入, 所以一条规则就是一条链: 脚本 → 脚本 → 写库 → 通知.
- 脚本是纯的: 不写库, 不发事件. 两件事都在 flow 里声明 — 这样 flow 是唯一说清这个蓝图干了什么的地方.

## 脚本约定

任何语言都是: 一个 JSON 进, 一个 JSON 出. `input` 从 stdin (`BP_INPUT` 里也有一份), 结果是 stdout 上的
JSON (`BP_BLUEPRINT`, `BP_SCRIPT` 会给), 非 0 退出码算失败. `sh` 打印一行也行 — 不是 JSON 的 stdout 就
当字符串往下传. stderr 在脚本运行期间按行推给页面, 变成 `log` 事件. 脚本在蓝图自己的工作目录里跑.

## 页面的通道

挂在文档最前面, 页面自己的脚本可以直接用.

| 调用 | |
|---|---|
| `bp.emit(type, data)` | 发事件到总线上 — 监听这个 `type` 的 flow 立刻开始 |
| `bp.on(type, cb)` | 监听; 流里是所有事件, 包括页面自己发的和脚本日志 |
| `bp.watch(table, cb)` | 画一张表: 先拿当前行调一次 `cb(rows)`, 之后每次写库都回整张表 |
| `bp.sql(sql, params)` | 表协议表达不了的语句; `:name` 用对象传, 位置参数用数组 |

要问 ai 就用 `ai` 步骤 (`- ai: { prompt: … }`), 它的输出就是回复文本. 蓝图自己不留对话.

## 经验规则

- 表就是协议: 页面画什么和 flow 写什么是同一个 `CREATE TABLE`, 页面监听表, 不用手写接口.
- 一个文件: 要共用东西就加一张表, 不要加第二个文件.
- 打开页面就是重新加载. 没有热重载, 库不丢.
- schema 和脚本是给服务的, 不是给浏览器的; 不要在页面 JavaScript 里重复它们.
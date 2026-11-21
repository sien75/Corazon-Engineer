# 2611-74 单文件蓝图与 blueprint 服务

> 状态:已实现(v1)。承接 2611-72(蓝图与 web 解耦)、2611-73(后端基础能力改造)。实现与方案有两处不同,
> 已在下面就地改正:前端通道用 SSE + POST 而不是 WebSocket(`ws` 想要一个 Go 里没有的依赖,
> SSE 一次只往下推、op 一次只往上收,语义正好,标准库就够);js 脚本经 `bun` 跑,不是内嵌引擎。

## 目标

蓝图 = 一个自带前端、数据、编排、后端脚本的 **单个 `.html` 文件**,由 AI 编写,由新的 `blueprint` 服务解析并运行。蓝图只负责**展示与执行**:没有对话,不绑定 agent,运行时 AI 不介入。

## 一、文件格式

```html
<!doctype html>
<title>Dev Flow</title>
<meta id="acme.dev-flow">

<script type="blueprint/sql">
  CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY, title TEXT, status TEXT);
</script>

<script type="blueprint/flow">
  - on: ui.build
    steps:
      - id: b
        run: build
        with: { branch: ${{ event.data.branch }} }
      - run: parse
        with: ${{ steps.b.output }}
      - sql: INSERT INTO tasks(title,status) VALUES(:title,:status)
        with: ${{ steps.parse.output }}
      - emit: ui.log
        with: { msg: done }
</script>

<script type="blueprint/sh" id="build">git pull && make</script>
<script type="blueprint/js" id="parse">export default async (input) => ({ title: input.msg, status: "ok" })</script>

<body>
  <h1>…</h1>
  <script>bp.watch("tasks", rows => render(rows))</script>
</body>
```

规则:

- 不写 `<html>` / `<head>`,`</body>` 可省。顺序固定:`<title>` → `<meta id>` → sql → flow → 脚本 → `<body>`。**所有后端标签必须在 `<body>` 之前**(之前出现任何非 head 元素,浏览器会自动开 body)。
- `<title>` 是显示名;`<meta id="...">` 是蓝图身份,只带 `id`,取第一个 `meta[id]`。
- 后端标签统一 `<script type="blueprint/*">`:浏览器当纯文本跳过。内容里的 `</script>` 写成 `<\/script>`,`<!--` 写成 `<\!--`,解析时还原。
- **sql**:标准 SQLite。有库不覆盖,所以建表约定写 `CREATE TABLE IF NOT EXISTS`;每次加载原样执行一遍。
- **前端**:`<body>` 里的普通 HTML / JS,浏览器照常执行。不设 agent / README 节点。
- **没有权限声明**(v1 不做):蓝图以用户权限运行,信任边界是"用户自己的 AI 写的"。

## 二、编排(flow)

语法是 GitHub Actions 的子集,YAML。关键字只有:

| 关键字 | 含义 |
|---|---|
| `on` | 触发事件的 `type`(精确匹配) |
| `steps` | 按序执行 |
| `id` | 给 step 起名,后面用 `${{ steps.<id>.output }}` 引用 |
| `run` | 执行脚本 id(`blueprint/sh|js|py|…`) |
| `sql` | 执行一条 SQL,命名参数 `:name` 取自 `with` |
| `ai` | 调 ai 服务,见"AI 能力" |
| `emit` | 发事件(`ui.*` 推给前端,其余留在总线上,可被别的 flow 的 `on` 接住) |
| `with` | 该 step 的输入;缺省为上一步输出 |

引用表达式只有 `${{ event.data.* }}` 与 `${{ steps.<id>.output.* }}`。v1 不做 `if`、循环、并行、`needs`。

事件信封借 CloudEvents 的字段:`{ type, source, data, time }`,`source` 是 `ui` / `flow:<n>` / `script:<id>`。

## 三、脚本节点约定

- **统一契约**:一个 JSON 进(stdin,同时给环境变量 `BP_INPUT`),一个 JSON 出(stdout;不是合法 JSON 就当字符串)。非 0 退出码 = 失败,stderr = 错误信息。
- **js**:`export default async (input) => output`,由 `bun` 跑一个薄 wrapper(import 脚本、读 stdin、写 stdout)。其他语言(sh / py / …)直接按 type 找解释器,没有 SDK,只守 stdin/stdout。
- **CLI 的参数**:不让脚本自己解析,在 flow 里用模板拼,如 `run: build` + `with`,脚本从 JSON 里取。
- **进度与日志**:stderr 每行一条,当作 `script:<id>` 的 `log` 事件推到总线(流式的唯一通道)。
- **脚本不碰库、不发事件**:副作用只在 flow 里声明(`sql` / `emit`)。v1 脚本也不开放读库——要数据,在 flow 里前置一个 `sql` 查询 step,结果传给脚本。

## 四、数据

- 每个蓝图一个库:`<home>/blueprints/<id>.sqlite`(dev 为 `<checkout>/.engineer/home/…`)。库只认 `<meta id>`,不认文件路径;删蓝图文件不删库,同 id 再放回来自动挂上。
- 写库只有两条路,**都经过 blueprint 服务**:flow 的 `sql` step、前端的 `bp.sql`。因此服务知道"哪张表变了",用来推送 watch。外部进程直接写库不被感知(也不被支持)。
- storage 服务的两张表(records / sessions)不动,与蓝图库无关。
- 不考虑 id 撞名、已有数据冲突、schema 迁移(用户已定)。

## 五、前端通道(一条 SSE + 一个 POST)

前端是总线上的一个发布 + 订阅者,不是被动执行节点。

| 方向 | 路由 | 消息 |
|---|---|---|
| 下行 | `GET /b/<slug>/events`(SSE) | `{op:"event", type, source, data, time}` · `{op:"change", table, rows}` |
| 上行 | `POST /b/<slug>/op` | `{op:"emit", type, data}` · `{op:"watch", table}` · `{op:"unwatch", table}` · `{op:"sql", sql, params}` |

`bp` 客户端(`/b/<slug>/bp.js`,嵌在服务里)只有四个:`bp.emit(type, data)`、`bp.on(type, cb)`、
`bp.watch(table, cb)`(先回一次全量,之后每次变更回全量)、`bp.sql(sql, params)`。脚本标签注入在
文档最前面(doctype 之后):它是阻塞的经典脚本,所以页面自己的 `<script>` 直接用 `bp` 就行,不用等加载。

变更检测:所有写入都过服务(flow 的 `sql` step、页面的 `bp.sql`),写完就把**所有被 watch 的表**
重查一遍推下去 —— 不做语句→表名的解析,一次多余的查询换掉一类漏通知。

## 六、加载流程

每次 `GET /b/<slug>`:

1. 读 `.agents/blueprints/<slug>.html`,用 `golang.org/x/net/html` 的 tokenizer 取出 `meta[id]`、sql、flow、脚本(还原 `<\/script>`、`<\!--`)。
2. 校验:缺 `meta[id]`、flow 引用不存在的脚本 id、YAML 不合法 → 返回错误页(带原因),不起运行时。
3. 打开(没有则创建)`<id>.sqlite`,执行 sql 块。
4. 用新解析结果替换该蓝图的运行时(flow 注册进内存总线),关闭旧 WS。**不做热重载**——重新打开才重新加载。
5. 响应页面:用 tokenizer 逐 token 透传原文,**丢掉所有 `type="blueprint/*"` 标签**(后端源码与 sql 不下发),在 `</body>` 前注入 `bp.js`。

## 七、AI 能力

ai 服务保留,仍是固定的后端能力。blueprint 服务把它作为 flow 的内置 step 暴露:

```yaml
- ai: { prompt: ${{ event.data.q }} }   # 起会话、问、等 agent_settled,output = 最终文本
```

前端不直连 ai,想用就 `bp.emit` 一个事件让 flow 调。会话归属(每次新会话还是复用)与 `cwd/system` 取值,v1 取简:每次 `ai` step 新开一个会话,`cwd` 为项目目录,`system` 缺省空,可用 `with.system` 覆盖。

## 八、分工与模块

| 服务 | 语言 | 职责 |
|---|---|---|
| **blueprint**(新,吸收 web) | Go | 外壳(main 对话页、主题)、蓝图解析与页面伺服、库管理、事件总线 + flow 引擎、脚本执行器、WS 网关、`ai` step |
| **ai** | bun | 不变:会话、工具 |
| **storage** | Go | 不变:records / sessions |

`workspace/web` 并入 `workspace/blueprint`(module `engineer/blueprint`),`web` atom 删除,`web-to-*` 边改为 `blueprint-to-*`。目录:

```
workspace/blueprint/     # module engineer/blueprint
  serve.go               # 入口与路由:/ 外壳 · /b 目录 · /b/<slug> 页面 · /bp.js · /events · /op
  runtime.go             # Registry(按 id 存运行时)、事件总线、flow 执行、op 通道、ai step
  parse.go               # 扫描 meta/script 标签、剪掉后端块、还原 <\/script>、校验
  store.go               # 每蓝图一个 sqlite(modernc.org/sqlite,与 storage 同驱动)、写后通知
  flow.go                # flow 的 YAML 类型、${{ }} 求值、命名参数
  exec.go                # 脚本子进程(bun harness / sh / py …)、stderr → log 事件
  client.js              # bp 客户端(go:embed)
  shell/                 # 原 web 的前端:index.html / app.js / components / theme / vendor / assets
```

没有新增第三方依赖:`yaml.v3` 与 `modernc.org/sqlite` 都是 storage 已经在用的;tag 扫描和 SSE 都是
标准库。运行时需要机器上有 `bun`(ai 已经要求它)。

## 九、文档改动(范围从小)

- `agents/blueprint.md`(+ `zh/`)重写为新格式的规格与写法指南。
- `agents/sub/AGENTS.md`(+ zh)里"About Blueprint"一节改指向新文件、去掉目录形态相关描述;其余 `agents/` **本轮不动**(用户后续统一梳理)。
- 蓝图位置不变,仍在 `.agents/blueprints/`,但由目录 `<slug>/` 改为单文件 `<slug>.html`(旧目录形态废弃,不迁移)。

## 十、不做

热重载;权限声明与沙箱;id 撞名与已有数据冲突;schema 迁移;脚本读库 / 发事件;flow 的 `if`/循环/并行;agent 节点与蓝图对话;前端直连 ai;蓝图启动器 / tab(打开方式本轮只有 URL `/b/<slug>`)。

## 十一、实现顺序(Phase 2 起)

1. **contracts**:`blueprint-page`(GET)、`blueprint-ws`(WS 消息)、`blueprint-bp-js`;`ai-*`、`log-*` 契约不变。
2. **structure**:新增 `blueprint` atom,删 `web` atom;边 `web-to-*` → `blueprint-to-*`。
3. **testing**:见下。
4. **code**:parse → store → flow/exec → gateway → 页面伺服与 `bp.js` → 把 web 外壳并进来 → `ai` step。

## 十二、验证用例(`development/testing/dev/case-core-blueprint-single-file`)

已跑通(curl + ego-browser 全绿):页面不含任何后端块、`<meta id>` 在、坏蓝图 500 并说明原因、
`ui.demo` → sh → js → 写表 → `ui.done` 回到页面、watch 收到新行、重开页面数据仍在、
`<\/script>` 还原。外壳那条用例(`case-core-web-single-chat`)同步跑过,合并服务后仍然全绿。

下面是预设清单:

- parse:转义还原;缺 `meta[id]` / 未知脚本 id / 坏 YAML 报错;下发的页面不含任何 `blueprint/*` 标签。
- store:重开同 id 蓝图数据仍在;建表 `IF NOT EXISTS` 不覆盖。
- flow + exec:sh / js / py 三种脚本的 stdin→stdout JSON;非 0 退出码使 flow 失败;stderr 行成为 log 事件。
- gateway:`watch` 先回全量,`bp.sql` 写入后收到 `change`;`bp.emit` 触发 flow,`emit: ui.*` 推回前端。
- ai step:一次 `ai` step 得到最终文本。
- 页面:浏览器直接打开 `.html`(不经 runtime)后端标签被忽略,前端静态部分正常。

## 还没做(下一轮)

- **打开入口**:现在只有 URL(`/b` 列目录,`/b/<slug>` 打开),没有启动器 / tab;外壳顶栏也还没放进去
  蓝图的入口。
- **`ai` step**:每次新开一个会话,不复用;把 sessionId 交回 flow 也还没做(现在只返回回复文本)。
- **权限声明 / 沙箱**:脚本以用户权限跑,信任边界是"用户自己的 AI 写的"。
- **flow 的 `if` / 循环 / 并行 / needs**;脚本读库(要数据就在 flow 里前置一个 `sql` 查询 step)。

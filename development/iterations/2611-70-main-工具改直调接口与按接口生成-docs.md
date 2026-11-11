# 2611-70 main 工具改直调接口，docs 按接口生成

## 背景

- main 的 9 个工作区工具（`project-list` `session-*` `main-*`）本质是对 log / ai 接口的封装，主要价值只是把多步操作组合成一步（`session-new` = `/ai/new` + `/log/session/on`，失败回滚等）。多一个实体就多一份复杂度。
- 现有 `structure/docs/{ai,log,static}.md` 按模块写成三个大文件（共 1377 行），agent 很难按需读取。
- main 的 prompt 末尾已经注入本次运行的 static / log / ai 地址（`main.ts` 的 `runtimeEndpoints`），直接调接口不缺端口。

## 范围

做：
1. 去掉 main 的 9 个工作区工具，main 用 `curl` 直接调接口。
2. 外壳改为订阅 log 的工作区变化推送，不再按工具名刷新。
3. docs 改为：`docs/README.md`（简介 + 各种场景怎么用 + 全部接口列表）+ 每个接口一个文件。打包时生成，不手写。
4. 两份 AGENTS.md（main / sub）里涉及这些操作的地方，改为一句"读 docs，照 docs 做"。
5. 旧的 `structure/docs/*.md` 直接删除。

不做：
- 不给接口加 `open: true` 之类的组合参数；组合写在 README 的"场景"里，由 agent 连发几个请求。
- 不动 `model` `image` `usage` `compact` `ask_user` `web_search`（它们是会话自身的能力，不是接口封装）。
- 不改 contracts 的结构。

## 设计

### 1. 去掉工作区工具

- 删 `workspace/ai/src/workspace.ts`，`registry.ts` 里删 `WORKSPACE_TOOLS` 与注册。`main` 与 `sub` 的工具集差别消失。
- 工具里的组合逻辑与边界，转成 README 场景里的步骤与一句话约束（见下）。不在服务端补接口。
- 失去的行为：`session-new` 上屏失败时的回滚——README 里写"第二步失败就 `/ai/delete` 掉刚建的"。

### 2. 外壳如何得知工作区变了（log 推送）

现在外壳靠 main 的 `session-*` / `main-*` 工具帧触发 `refreshWorkspace()`（`app.js` 的 `engineer-tool` 监听）。改接口后 main 用 `bash`，名字对不上；而变化最终都落在 log，所以改为 log 推送。

- 新接口 `POST /log/workspace/stream`（SSE，沿用 `log-stream` 的写法：页面用 POST + fetch 读流）。页面主动连，log 在工作区变化时推事件。
- 事件只带信号，不带内容：`{ seq, updatedAt }`。页面收到就调 `refreshWorkspace()`（本来就是幂等、串行的读 log）。
- log 在这些写入之后发事件：`session/on`、`session/off`、`session/current/put`、`session/upsert`、`session/delete`、`project/add`、`project/remove`、`project/visible`。
- 连上后先发一个初始事件；断线自动重连，重连成功先刷新一次，补上断线期间的变化。
- 删掉 `app.js` 里按工具名（`session-` / `main-`）刷新的监听。
- 好处：手动 curl、别的浏览器窗口、共用数据目录的另一个实例改的，都能同步。

### 3. docs 的来源与产物

来源：
- 每个接口：`structure/atoms/*.yaml` 的 `provides`（`id` / `extend.path` / `extend.method`）+ 对应 `structure/contracts/<id>.yaml`（说明、请求、响应、错误）。
- `structure/docs/README.md`：**唯一手写**的文件，含简介和"场景"，其中有一个占位行 `<!-- endpoints -->`。

产物（打包时生成到包内 `docs/`）：

```
docs/
├── README.md              简介 + 场景(手写) + 接口列表(生成：`POST /log/session/on` — 一句话 — [链接])
├── ai-new.md              一个接口一个文件，文件名 = 接口 id
├── log-session-on.md
└── …
```

每个接口文件固定四段：标题（`METHOD path`）、一句话说明、请求、响应、错误；请求 / 响应直接取自 contract 的 yaml，不加解释。

生成器：`how-to/deploy/gen-docs.ts`（Bun，已是打包必备）。输入 `structure/`，输出目录由参数给。检查：contract 没有对应 atom 接口、或 atom 接口没有 contract 时报错（保证 docs 完整）。

调用点：
- 打包：`how-to/deploy/prod/BOOK.md` 步骤 4 把 `cp -R structure/docs` 换成跑生成器。
- 开发：`how-to/deploy/dev/launch.sh` 启动前生成到 `.engineer/dev/docs`。

### 4. agent 怎么找到 docs

ai 新增必填参数 `--docs <dir>`（延续"ai 没有任何默认值"的规则），launcher 传入。`main.ts` 的 `specDirLine` 加一句：接口文档在这个目录，从 `README.md` 读起。

AGENTS.md 里只写：要操作项目 / 会话 / 记录 / 其它服务时，读 docs 的 `README.md`，按里面的场景做。

### 5. README 的"场景"

一句话一个步骤，不解释。要覆盖（项目 / 会话 / 对话三组）：

- 列项目；列开着的 session；列某项目的 sessions。
- 新建 agent 并上屏（`/ai/new` → `/log/session/on`；第二步失败则 `/ai/delete`）；无 blueprint 的普通聊天同理。
- 打开 / 关闭已有 session。
- 删除 session（`/ai/delete`；仅用户明确要删；main 不能删）。
- main：列 main 对话、新建 main（`/ai/new kind=main` → `/log/session/current/put` 指过去）、找回早先的 main；sub 的 id 不能当 main 用。
- 写 test / telemetry 记录；查 blueprint（`/static/query`）。
- 每个场景末尾用"见 `<接口id>.md`"指向接口文件。

具体步骤以现有工具代码（`workspace.ts`）里实际调用的接口为准，写 README 时逐条对照，不凭记忆。

## 合同 / 静态关系

- `ai-new` 等 contract 里提到"workspace tools"、"session-open puts it on screen"的描述，改成按接口说法。
- `structure/atoms/ai.yaml` 的 description 去掉工具清单。
- edges 不变（调用关系没增减，只是调用方从工具变成 agent 的 curl）。

## 测试

- 新增 `case-core-docs-gen`：跑生成器，断言每个 contract 一个文件、README 列出全部接口、不一致时失败。
- 新增 `case-core-log-workspace-stream`：订阅 `/log/workspace/stream`，写操作各推一个事件、读操作不推。
- 新增 `case-core-web-workspace-follow`（浏览器）：页面之外开 / 关 session，tab 条不刷新页面就跟上。
- 新增 `case-core-main-workspace`（真模型）：main 读 docs 后调接口完成开 / 关 / 换 main / 找回 / 删除；断言 log 状态，并断言记录里没有 `session-*` / `main-*` / `project-list` 工具调用。
- 删除 `case-core-ai-session-tools`、`case-core-ai-main-new`、`case-core-ai-main-resume`、`case-core-session-delete`：它们测的是已删除的工具，覆盖点由 `case-core-main-workspace` 接管。
- 所有启动 ai 的用例补 `--docs`（必填）。

## 附带修正

- `structure/atoms/web.yaml` 原来 `provides: []`，而 `structure/contracts/web-blobs.yaml` 存在，生成器会判为"没有 atom 提供"；补上 `web-blobs`（`GET /blobs/{sha256}`）。

## 要拍板的点

1. docs 路径：新增必填参数 `--docs`，由 launcher 传入（已定）。
2. library 蓝图读 `structure/docs/`，旧 docs 删除后那里只剩手写的 `README.md`；这块本次先不动（已定）。

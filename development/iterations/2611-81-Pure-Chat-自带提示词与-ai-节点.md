# 2611-81 Pure Chat 自带提示词与 ai 节点

> 状态:已改并真跑 `case-core-web-frame-purechat`(22/22),等 review。接 2611-80(对话逻辑已进 purechat.html)。

## 一、要什么

蓝图只该知道两件事:**有个主题**(壳注入 `data-theme` + `/theme.css`)和**自己的后端能力**
(`bp.emit` / `bp.on` / `bp.watch` / `bp.sql` / `bp.reload` / `bp.mode`)。提示词写在蓝图里,
对话由蓝图的运行时自己做;页面不拿地址、不拿路径、不直连 ai 或 storage。

## 二、做成了什么

| 项 | 之前(2611-80) | 现在 |
|---|---|---|
| 提示词 | 页面拼好,`POST {bp.addr.ai}/ai/new` | 蓝图里一个 `<script type="blueprint/ai">` 节点,内容是提示词;运行时拼 `Where things are`(home、两个服务地址、工作目录) |
| 会话 | 页面存 id 在 `chat_state`,自己开流 | 运行时存 id 在蓝图自己的 sqlite(`bp_ai`),自己开流、跟流、断线续、读记录 |
| 页面通道 | `bp.*` + `window.BP_ADDR`(`ai`/`storage`/`home`/`cwd`) | 只有 `bp.*`,页面拿不到任何地址和路径 |
| 发问与回复 | 页面 `fetch /ai/ask`,自己解析 SSE | 页面 `bp.emit("ai.ask")`;运行时把 `ai.sync` / `ai.event` / `ai.idle` / `ai.error` 放上总线 |
| 工作目录 | 服务启动的 `--cwd` 注入页面 | 用户第一次打开这种蓝图时给,存在 `<data home>/config.yaml` 的 `folders`(`<project>/<slug>`);不填不打开 |
| 图片 | web → blueprint → ai 转一道 | web 自己读 `<data home>/uploads/<sha256>.<ext>` |
| `/chat/session` | blueprint 拼 spec 开会话 | 删除;`--agents` 参数一并删除 |
| 模型配置 | 顶层 `chat`/`image`,找不到回退旧格式 `main` | 只读顶层两项,其他键忽略 |
| dev 数据家 | 和线上共用 `~/.engineer/data` | `<checkout>/.engineer/dev-home/data`,空开局 |

## 三、契约与代码落点

- 新契约:`blueprint-ai`(`/bp/{project}/{slug}/events` 的 ai 事件)、`blueprint-folder`
  (`POST /config/blueprints/folder`)、`web-blobs`(`GET /blobs/{sha256}`)。
- 改契约:`blueprint-list` 加 `needsFolder` / `folder`;`blueprint-page` 去掉 `BP_ADDR` 前导。
- 删契约:`blueprint-chat-session`(及 docs、atoms/edges 条目)。
- 代码:`workspace/blueprint/ai.go`(新)、`parse.go`(识别 `blueprint/ai`)、`runtime.go`
  (Event 分发、`sendEvent`、`Folder`)、`project.go`(`folders` 配置)、`serve.go`;
  `workspace/web/serve.go`(`--home` + `/blobs`);`workspace/web/shell/app.js`(选目录对话框);
  `purechat.html`(节点 + 事件画法)。
- 一个文件至多一个 ai 节点,两个就是加载失败(有错误页)。

## 四、验证

- `case-core-web-frame-purechat` 真跑:**22/22**(含"先问工作目录"、"不存在的目录被拒"、
  "页面拿不到 addr"、"刷新复用同一会话"、storage 里只有一条 session)。
- 手工:五套主题、`ai.event` 渲染、markdown、`/blobs` 200/404/坏名 404、blueprint 不再答 `/blobs`。
- 没跑:`case-core-blueprint-dev-prod` / `init` / `single-file` / `loopback-bind` 只做了 `--agents` 的参数改动,
  其中 `dev-prod` 里还在等壳的 `<engineer-chat>`(壳早就没有这个元素了,与本次改动无关的既有陈旧点)。

## 五、第二次:接口改成两件事(本轮)

| 项 | 之前 | 现在 |
|---|---|---|
| 事件 | `ai.ask` / `ai.stop` / `ai.select` / `ai.reset` 进,`ai.sync` / `ai.event` / `ai.idle` / `ai.error` 出 | 只有两个名字,都是一问一答:`ai.info`(问现状 / 切会话)、`ai.request {id, path, body}`(按 ai 自己的路径调一次)|
| 答复 | 广播式,页面按类型猜 | `ai.info` / `ai.response` 都带页面自己的 `id`;`/ai/stream` 变成多条 `{id, event}` + 一条 `{id, done}` |
| 会话 | 页面一打开就被运行时建出来 | 打开不建;第一次 `/ai/new` 才建,那一段才进 `sessions` |
| 多段会话 | 只有一段 | `bp_ai` 一次会话一行(`id/title/at/cur`);`ai.info {select}` 切回旧的,记录由 storage 回放 |
| 系统提示词 | 只能节点给 | 节点给(后面接 `Where things are`);页面若在 `/ai/new` 里带了 `system`,接在节点那段之后 |

- Pure Chat 打开是会话列表;点一段进去,或者直接发一条(这时才建会话);输入框左下角 `new` 回到"还没有会话"的
  状态,下一句建新的一段。
- 会话标题:流里的 `session_title` 由运行时写进 `bp_ai.title`,列表显示它,没有就显示 id。

### 验证

- `case-core-web-frame-purechat` 真跑 **23/23**(新增"打开页面不建会话"、"第一条消息才建会话")。
- dev 8500 手工:`new` 清空→发消息建第三段→刷新回列表(4 段,带标题)→点第一段回放 4 条旧消息。

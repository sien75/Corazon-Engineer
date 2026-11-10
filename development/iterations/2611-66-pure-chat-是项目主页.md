# 2611-66 pure chat 就是项目主页

## 目标

去掉「把 pure-chat 当 blueprint」的做法。**pure chat 是项目的主页**:分组末尾那枚 `+` 打开它,它就是
blueprints + recents + 一个对话框。它不是 blueprint、不是 session,没有会话之前什么都不创建。

## 形状

- `+`(项目分组里最后那一格)打开该项目的 pure chat 页,同时 `+` 自己就是被高亮的那一格(它一直是
  launcher tab,只是内容换了)。
- 页面:上面 Blueprints / Recent 两栏,下面一个空的 `<engineer-chat>`。没有 session —— 不请求 log、
  不请求 ai。
- 用户发第一条消息时,前端才建会话:`POST /ai/new { projectId, kind: sub }`(没有 blueprint),然后
  它作为一条普通会话 tab 打开并高亮;pure chat 页留在分组里,退到后台。
- 点 Blueprints 的一行 → 建那条 blueprint 的会话(与现在一致);点 Recent → 打开那条会话。
- 没有 blueprint 的会话:没有页面可装,tab 里直接放外壳自己的 `<engineer-chat>`(和 main 一样的做法),
  不走 `/agent/<id>/` iframe。

## 删掉的东西

- `workspace/web/components/pure-chat/`(内置页)、`serve-web` 的 `builtinPages` 及其分支。
- ai 的 `BUILTIN` / `isBuiltin` / 内置页的 pageLine 特例;`blueprint.ts` 回到只读项目目录。
- `app.js` 里启动器的「内置」列表项。

## 接口 / 代码影响

- `ai-new`:`kind: sub` 时 `blueprint` 变为可选 —— 不给就是这个项目的内置对话:没有页面、没有
  README,session 行里 blueprint 为空,tab 名先叫 `chat`,第一轮之后照旧由标题总结改写。
- `<engineer-chat>` 多一个 `project` 属性:没有 `session` 也没有 `/agent/<id>/` 时,第一次发送前先
  `POST /ai/new` 建会话,成功后把 `engineer-session` 事件抛给外壳(外壳据此把它作为 tab 打开)。
- `web` atom 与 `ai` atom 的描述、`ai-new` 契约同步;路由不变(`+` 页仍是 `/project/<id>/new`)。

## 首页的列表与外观

- 列表放进对话自己的滚动区(`<engineer-chat>` 的 `slot="before"`),和消息同列、一起滚,输入框留在底部。
- Blueprints / Recent 各两列,先显示 20 条,超出给一个「展开」按钮;顶部是手写体 wordmark(`assets/corazon-engineer.png`,用 mask 画成当前文字色,主题都适用)。
- 左上角的「← projects」去掉。

## 验证

dev 起在 8500 手测:`+` 高亮、无会话、发第一条消息后出现会话 tab 且高亮转移、Blueprints/Recent 两栏可用。
改 `case-core-web-tabs`(项目页断言:没有 session 生成、发了之后才有)与 `case-core-agent-instantiate`
(不给 blueprint 也能建),跑这两个 + `case-core-web-route-restore`。

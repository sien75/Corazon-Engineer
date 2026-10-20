# 历史回放与 /session 路由

## 需求

1. **打开一个旧 session 要看到它的对话**。现在：打开 session → 刷新网页 → 再打开（或者
   `×` 关掉再从 launcher 的 Recent 里打开），页面是一片空白，什么都不显示。
2. **地址栏改成 `/session/<sessionId>`**（现在是 `/s/<sessionId>`）。
3. `/agent/<sessionId>/` 不动：那是 iframe 里页面自己的地址，改它等于改 blueprint 的
   目录寻址规则。

## 现状（实测）

- 浏览器实测（web `localhost:7500`）：点 tab 时 iframe 正常（`/agent/<id>/` 200、
  `title=Pure Chat`）；F5 之后重点 tab、`×` 关掉再从 Recent 重开，iframe 照样 200、
  `<engineer-chat>` 照样挂上、shadow root 里只有模板，`.ai-messages` 是空的，控制台零错误。
- 原因：`workspace/web/components/chat.js` 里只有宿主带 `history` 属性才调
  `replayHistory()`（`root.host.hasAttribute("history")`）。外壳给 main 的 chat 加了
  `history`（`app.js` 的 `makeMainTab`），blueprint 页写的是 `<engineer-chat autofocus>`，
  没带——所以对话只活在那个 iframe 的 DOM 里：切 tab 时 iframe 留在文档里，看着还在；
  F5 / 关 tab 都会销毁 iframe，重开就是全新的空 iframe。
- 起手那次 `streamOnce(() => {})` 是「用 `since=0` 只记水位、故意不画」，而 `/ai/stream`
  的 backlog 是 ai 进程内存里的 `sess.events`（`registry.ts`），刚 resume 的会话
  `lastSeq: 0`，所以 stream 也补不回历史——它能回放的只是本进程里发生过的增量。
- 历史本来就有现成接口：`POST /log/session/messages`（`contracts/log-session-messages.yaml`）
  返回整段消息（`seq/role/content/raw`，图片是 sha256 引用），`replayHistory()` 已经在用它，
  main 一直在走这条路。缺的只是「页面也走」。
- 这个行为当时是写进设计的：`.agents/blueprints/pure-chat/README.md` 明写「页面不回放历史，
  刷新后从空屏开始是预期的」。

## 方案

1. **`workspace/web/components/chat.js`：回放变默认。** 挂载即 `replayHistory()`
   （内部还是 `/ai/resume` → `/log/session/messages` → 用 `raw` 重画 user 气泡 / assistant
   气泡 / tool chip），main 和 blueprint 页同一条路。`no-history` 属性留给「只想看新内容」
   的页面退出。原来的 `history` 属性不再需要（默认就是它），从外壳和文档里去掉；别的项目
   页面上还留着的 `history` 不报错，只是没作用。
2. **水位那次读流保留**：`streamOnce(() => {})` 仍然在起手时把 seq 推过 backlog，
   避免第一次 ask 把「本进程里发生过的一轮」再画一遍。回放画的是 log 里的记录，
   两条路不重叠，挂载时不会重复。
3. **`workspace/web/app.js`：路由改 `/session/<sessionId>`**，`syncTabUrl()` 与
   `popstate` 里的正则一起改；main 仍然是 `/`。web 的 SPA 回退不用动
   （`/session/…` 磁盘上没有，自然落回 `index.html`）。
4. **文档跟上**：`components/README.md` 的属性说明、pure-chat 的 README（把「页面不回放
   历史」那条换成现状：回放由组件做，页面别自己再拉一遍）、`development/testing/dev/
   case-core-web-tabs` 的断言（`/s/` → `/session/`，并补「重开/刷新后历史还在」的检查）。

## 已知限制

页面在**某一轮正在跑的时候**挂载：那一轮已发出但还没落库的增量会被水位那次读流跳过（不画），
已落库的部分由回放画出来。视图会出现「半轮」，但比空白好，且下一次 ask 之后恢复正常。

## 验收

- `case-core-web-tabs`：`/session/<sessionId>`、关 tab 再开、F5 后点 tab，三种情形下
  `<engineer-chat>` 的 shadow root 里都能看到先前那两条消息（用 `/log/mutation`
  `kind: conversation` 造历史，`--stub` 的 ai 足够，不需要模型）。
- 手工：真 session（本文件所在的这条）关掉重开、F5 后点 tab，历史都在，且没有重复气泡。

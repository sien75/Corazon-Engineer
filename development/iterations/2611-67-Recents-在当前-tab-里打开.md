# 2611-67 Recents 在当前 tab 里打开，标题改成 Recents

## 问题

分组末尾 `+` 打开的项目主页（draft tab）上，Blueprints 里的一行是**就地**打开的（`browseBlueprint`
把这一格变成那条 blueprint 的页面 tab），但 **Recents**（原来写作 `Recent`）里的一行会在旁边新开一格，
把刚打开的主页留在后面：用户点的是"继续这条会话"，得到的却是第二个 tab 和一个空着的主页。
同一页上两栏两种规矩，是不合理的那一半。

## 形状

- `openSessionFromLauncher(sessionId, fromTab)` 按"这个 tab 上点的那一行"来决定落点：
  - **当前 tab 是 draft（`kind: new` 且还没有 session）**：它就地变成那条会话的 tab —— id、`sessionId`、
    `blueprint`、标题都换成会话自己的，主页视图丢掉；`/log/session/on` 带 index，把 id 插回这格
    在开列表里的位置（`openIndexBefore`：只数它上面的 session tab，main 与 draft 都不在列表里）。
    之后照常 `activateTab`：有 blueprint 走 `/agent/<id>/` 的 iframe，没有就走外壳自己的
    `<engineer-chat>`，历史由它从 log 回放。
  - **这条会话已经有 tab**：切过去（一个 tab 就是一条会话，不能有第二份），draft 原地不动。
  - **既没有 host 又不是已开的 tab**（这条行将来若在别处出现）：老路 —— `session/on` + 刷新工作区。
- `+` 仍然是"新的 draft tab"，Recents 行也不再为它造第二格：tab 数在点击前后**不变**。
- 第二段标题 `Recent` → `Recents`（与 Blueprints 一样是复数列表）。

## 接口 / 代码影响

- 只动 `workspace/web/app.js`：`openSessionFromLauncher`、新增 `adoptRecentSession` /
  `openIndexBefore`、`fillHomeLists` 里 Recents 行的 `onOpen` 带上当前 tab、标题文案。
- log / ai / static 的契约不变：`/log/session/detail`（拿 projectId / blueprint / title / kind）、
  `/log/session/on`（已支持 `index`）、`/ai/resume` 都已在用。
- `adoptRecentSession` 不自己激活 tab：id 变了，交给调用方的 `activateTab` 建视图，和 `adoptSession`
  那条路分开（那条的页面已经在跑，不需要重建）。

## 验证

- 新增用例 `development/testing/dev/case-core-web-home-recents`（端口 8990-8993，ai `--stub`）：
  **9/9 通过** —— `+` 只造一格 draft、第二段标题是 `Recents`、点一行后 tab 数不变且那格成为会话
  （`/session/<id>`、在开列表里、历史回放）、已开的会话只是被切过去、带 blueprint 的会话同一格里
  换成 `/agent/<id>/` 的 iframe 并画出页面。
- `case-core-web-tabs` 在本次改动**之前**就已经是红的：它还在断言 2610-50 / `1dd3c31` 之前的模型
  （点 blueprint 直接建 session），第 3b 步等 `/agent/<id>/` 拿到 `undefined` 超时。与本次改动无关，
  需要单独按 draft 模型重写，未在本次一并处理。
- 其余用例未跑：它们不读 `app.js` 的 Recents / launcher 路径。

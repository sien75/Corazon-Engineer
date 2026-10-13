# 每个 pane 自己的 composer

> 修 `2610-24`（拆窗）里的一条错决策。

## 需求

一个 tab 下有两个 chat pane 时,**每个 pane 都有自己的输入框** —— 不做"点哪个哪个才有",也不做"输入框跟着焦点搬家"。

## 现状（改之前）

`2610-24` 的决策 2 把 composer 做成了**单例**:一个 `#ai-input`,用 `appendChild` 搬进被点击的 pane,各 pane 的草稿靠 `aiDrafts` + `aiSnapshotDraft/aiRestoreDraft` 换来换去。

于是屏幕上只有一个输入框,在哪个 pane 取决于你最后点了哪 —— 另一个 pane 看起来像"对话但不能打字"。

## 决策

**chat pane 就是原来的对话视图**,每个 pane 一份:消息列表 + 输入框。`makeChatPane` 建它并 `bindComposer` 绑事件,handler 闭包持有自己的 pane。

由此**删掉**一整块代码,而不是加:

| 删掉 | 因为 |
|---|---|
| `aiDrafts` / `paneDraftKey` / `aiSnapshotDraft` / `aiRestoreDraft` | 草稿就是输入框里那段文字,不用搬也不用存 |
| `focusPane` 里搬 DOM 的部分 | 没有东西要搬 |
| `#ai` 这个容器 | 输入框在 pane 里,不需要外层的 holder |
| `paneAt` | 点 pane 由 pane 自己的 mousedown 认领 |

**保留**的单一概念:`aiPane` = 用户正在用的那个 pane。composer 的共享函数通过它读写(`aiInputEl()` 等),`aiRenderPane` 仍然是"谁的流在渲染"。

**聚焦**只做三件事:记住是哪个 pane、把 shell 的普通 id(`#ai-messages` / `#ai-input-field` …)搬到它身上、把光标放进去。点 pane 里任何地方(消息区或输入区)都会触发 —— 所以"点谁谁成为当前对话",而不是"点谁谁才有输入框"。

## 方案

- `workspace/web/index.html`:`#ai` 整块删掉,只留 `#panes`。
- `workspace/web/app.js`:
  - `makeChatPane` 建消息列表 + composer(输入框 / send / stop / cmd / 测量镜像),per-pane 的 `images` / `tasks` / `drawer` / `confirm`。
  - `bindComposer(pane)` 绑全部事件;`claim` 走 `focusPane`,所以 id 会跟着走。
  - 原来模块作用域的匿名 handler 提成具名函数(`aiPaste` / `aiBeforeInput` / `aiCutImageToken` / `aiInputKeydown` / `aiCmdKeydown(pane, event)`)。
  - composer 相关全局改成 `aiPane` 的取值函数。
- `workspace/web/style.css`:composer 的 `#ai-*` 改成 `.ai-*`(每个 pane 都有),聚焦的那个同时带 id。同理 `#ai` 那条 holder 规则删掉。

## 测试

`case-core-web-panes` 补三条断言,共 **14/14**:

- 每个 chat pane 都有自己的 composer,且贴在各自 pane 的底部
- 两个 composer 能同时持有两份草稿
- 从其中一个发送,另一个的草稿不动

九个浏览器用例连跑全绿:20 / 9 / 8 / 20 / 15 / **14** / 16 / 41 / 32。

用例里读 `#ai` 的地方改成读 `#panes`(那个容器没了)。

## 途中踩到的两件事（记下来，都是工具喂给我的）

1. **`node --check` 对 ES module 撒谎**。它按 CommonJS 解析,`const aiInputEl() = …` 这种语法错它不报;浏览器报 `SyntaxError`。后来统一用 `cp app.js /tmp/app.mjs && node --check /tmp/app.mjs`(按 .mjs 解析)。
2. **`page.on` 在 ego 里不存在**(`typeof page.on === "undefined"`),所以我早期所有探针里的 `errs` 数组永远是空的 —— 页面报错我一次都没看到过。改成用 CDP 在页面脚本前注入 `window.__errs` 收集 `error` / `unhandledrejection`。

## 验收

- 两个 chat pane 各自有输入框、各自的草稿;从任一发送只影响它自己。
- 点 pane → 它成为当前对话(id 与光标跟过去),另两个 pane 的样式与草稿不动。
- 九个用例全绿;`static validate ok`。

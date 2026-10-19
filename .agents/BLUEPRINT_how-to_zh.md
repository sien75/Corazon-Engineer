# Blueprint 写法

`.agents/blueprints/<slug>/` 是一个目录：两个必需文件，其余的东西都属于这个页面。

| 文件 | |
|---|---|
| `README.md` | agent 的开场上下文（追加在 system prompt 最后） |
| `index.html` | UI 入口 |

其余文件 —— css、js、图片、子目录 —— 随目录一起复制，用相对路径引用（`./simple.css`）。实例化会复制到 `.engineer/agents/<sessionId>/`，服务在 `/agent/<sessionId>/`：副本是快照，改原型不影响已开的 agent。

## 页面

- `<title>` 就是用户看到的名字。
- 与外壳同源：可以链它的资源、调它的服务。路径第一段是会话 id。
- 主题：链 `/theme.css`；首帧前给 `<html>` 设好 `data-theme` 和 `color-scheme`（读 `localStorage["engineer.theme"]`）。外壳会在加载时和每次切换时重写这两个值，页面不用监听。

## 对话

对话是一个组件，不要自己写。

```html
<script type="module" src="/components/chat.js"></script>
<engineer-chat></engineer-chat>
```

- `<engineer-chat>` 从页面自己的 `/agent/<sessionId>/` 取会话 id（也可以显式给 `session="…"`）。
- `autofocus`：加载后聚焦输入框。
- `history`：从 log 回放历史对话（外壳的 main 用；普通页面不用）。
- 它自己加载 `/config.js`，自带样式（`/components/chat.css`）；页面只需要 `/theme.css` 拿调色板。
- 发 / 收 / 停、markdown、工具芯片、`ask_user` 问题卡、图片粘贴都归它。事件（冒泡）：`engineer-tool`，detail 是 `{ name, isError }`。
- 线上细节在组件和 `docs/ai.md` 里，页面不需要知道。

## 示例

`.agents/blueprints/simple/` 是参照，只有两个文件：`README.md` + `index.html`。页面就是首帧主题脚本、一个 `<engineer-chat>`，对话全在里面。照它的形状写；页面需要更多东西时再在旁边加自己的 css / js。

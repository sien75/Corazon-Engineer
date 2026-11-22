# 2611-80 Pure Chat 自带对话逻辑

> 状态:已被 2611-81 取代(页面不再直连 ai,提示词改由 ai 节点承载)。记录留作过程。

## 目标

蓝图只该知道两件事:**有个主题**(壳注入 `data-theme` + `/theme.css`,页面用 `var(--…)`),
以及底层的 **ai 能力、storage 能力**(`bp.addr.ai` / `bp.addr.storage`)。
所以 `<engineer-chat>`(`workspace/web/shell/components/chat.js` + `chat.css`)里的对话逻辑
整块迁进 `purechat.html`,壳不再提供对话元素。

## 改动

| 项 | 做法 |
|---|---|
| 对话逻辑 | `chat.js` 的 `wire()` 原样搬进页面;不再是自定义元素 / Shadow DOM,DOM 直接写在 body 里 |
| 样式 | `chat.css` 内联进页面 `<style>`;`:host` 规则换成 `html, body`;hljs 的深色基础样式(原 `/vendor/highlight.css`)一并内联 |
| 地址 | 不再 `import("/config.js")`,改用 `bp.addr.ai` / `bp.addr.storage` |
| 库 | 不再取壳的 `/vendor/*`,用 CDN 且**锁定版本**:js-yaml 4.1.0、markdown-it 15.0.2、DOMPurify 3.4.15、highlight.js 11.12.0(`lib/common`) |
| 事件 | `engineer-title` 改发在 `document` 上;`engineer-tool`(只给 main 的 session-* 工具用)不再发 |
| session | 仍由页面自己的 `chat_state` 表记 id,没有就 `POST /chat/session` |

## 取舍

- 违背了 `agents/blueprint.md` 里「库下载进蓝图目录、不用 CDN」的约定,这是用户明确指定的(锁版本以免库更新带来变化)。离线时 Pure Chat 打不开。
- 壳里的 `components/` 暂不删,等用户确认后再清(同时要改 `structure/atoms/web.yaml` 和 `components/README.md`)。

## 验证

用 ego-browser 开 Pure Chat:历史回放、发消息 / 流式渲染、工具芯片、`ask_user` 卡、停止、五套主题切换。

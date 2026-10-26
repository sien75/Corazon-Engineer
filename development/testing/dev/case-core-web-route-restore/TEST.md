# Test: page route restore

（P2 之后 `+` 打开 Engineer launcher（`/new`），项目 launcher 是 `/project/<projectId>/new` 上的一格 tab。）

## Setup

按 dev BOOK 启动 8500。清除 http_proxy / https_proxy，NO_PROXY 与 no_proxy 为 *。真实浏览器打开 /，等待已有 main 和一个 sub 标签。使用已有会话，不发送 prompt、不删会话。

## Run

1. 从 / 点 sub 标签，记住 /session/<id>，刷新应仍选中相同标签、iframe 地址一致。
2. 点 +，应 /new 且 Engineer launcher 可见、仅 + 激活；重复点 + 不增加 history.length。
3. 刷新 /new 仍为 Engineer launcher。后退应恢复 session，前进恢复 /new。
3b. 对一个项目点 `edit`（分组末尾那枚 launcher 图标，或 Engineer launcher 行的 edit）：应到 `/project/<projectId>/new`
   且那一刻的 tab 是该项目分组里的 launcher tab；刷新该路由，launcher tab 重建并激活。
4. 点 main 应 /、launcher 收起；刷新仍 main。
5. 打开 launcher 后点顶栏品牌（外部），应收起且路径恢复当前标签。
6. 从 launcher 状态按住内部 + span，再松开：launcher 保持，URL 不变。
7. 打开 /session/s_nonexistent：有可读提示，规范回 /，不新增标签。非法编码 /session/%ZZ 的直接 HTTP 请求由 Go 返回 400；在已载入页面用 history.pushState 加 popstate 验证客户端解码保护，应安全回 /。
8. 可选：已有关闭 sub 的直达链接应重新打开同一 session；测试后恢复原 openSessions，不创建或删除会话。

输出每项 pass 与汇总 ok。用真实 click / mouse.down / mouse.up 与刷新，使用 history.back / forward 触发 popstate。

## Teardown

浏览器回 /，关闭测试页，dev 保持运行。

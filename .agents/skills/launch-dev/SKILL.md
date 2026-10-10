---
name: launch-dev
description: 按 how-to/deploy/dev/BOOK.md 重新打包并启动本地开发栈
---

按 `how-to/deploy/dev/BOOK.md` 重新打包并启动本地开发栈。

1. 整本读 `how-to/deploy/dev/BOOK.md`，按它的步骤来，**不要自己编命令**。
2. 端口约定：log `8503` → static `8502` → ai `8501` → web `8500`。
3. 起之前先看端口有没有被占：`lsof -nP -iTCP:8500-8503 -sTCP:LISTEN`；有残留先按 stop 流程清掉。
4. 起来后挨个探活，把每个服务的**实际**状态报出来，别只说「已启动」。
5. 跑用例时带 `NO_PROXY='*' no_proxy='*'`，并清空 `http_proxy` / `https_proxy`。
6. BOOK 跟现实对不上就停下来，先提 Type 3（改 book），不要绕过去自己想办法。

注意别动安装版工具栈（`7500-7503`，当前会话自己用的那套）。

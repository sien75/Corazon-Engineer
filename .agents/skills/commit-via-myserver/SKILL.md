---
name: commit-via-myserver
description: 把本地改动走 my-server 提交，绝不从本地直接 push
---

把本地改动走 `my-server` 提交，**绝不从本地直接 push**。

1. `git status` / `git diff` 看清这次要提交的范围，把文件清单拿给用户确认。
2. `ssh my-server`，按仓库名找到这个项目的 clone。
3. 本地用 `git diff` 生成 patch → 发到 my-server 上那个 clone → 在那边 `git apply`。
4. 在 my-server 上 commit & push（message 用项目既有风格）。
5. 回来删掉本地工作区改动，再 `git pull` 把提交拉回来，确认本地与远端一致。
6. 报告：提交 hash、message、涉及文件。

不要在本地 commit，也不要从本地 push。中途任何一步不确定就停下来问。

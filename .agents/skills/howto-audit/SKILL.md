---
name: howto-audit
description: 检查 how-to 与仓库现实、AGENTS.md、development/README 之间有没有漂移
---

检查 `how-to/` 跟仓库实际情况有没有漂移。

1. 读 `how-to/README.md`，按它声明的布局核对目录：`deploy/[env]/BOOK.md`、`operation/`。
2. 逐本读 `deploy/*/BOOK.md`，把它写的命令、端口、文件路径、脚本名，跟仓库里真实存在的对一遍（`launch.sh` / `stop.sh` / `install.sh` / `launch.go` 还在不在、参数还对不对）。
3. 对照 `AGENTS.md` 与 `development/README.md`，看几份说明彼此有没有矛盾。
4. 输出漂移清单，四列：位置 / 书里怎么写 / 实际是什么 / 建议怎么改。
5. **只提建议**，等用户确认后再改书。

每条都要有证据（文件路径或命令的实际输出）。不要顺手改文件。

# devtime — 开发时资料

> `devtime/` 下的内容全部用中文书写。`README.md` 是英文入口(权威版),本文件是它的中文镜像。

Corazon Engineer 的开发时资料 —— 把需求变成可运行系统的一切。**不随系统发布**。普通文件树,下面的布局就是它的契约。

## 目录结构

- `development/` —— 编码前的开发资料:设计工作与迭代记录。
  - `plans/` —— 方案设计文档,按迭代编号建目录(`2608/`、`2609/`……)。
  - `iteration/` —— 每次迭代确定的方案:一个方案一个 md 文件,命名为 `[YYMM]-[2位序号]-[简短标题].md`(如 `2609-01-runtime 散文化重构.md`)。
- `deploy/` —— 每个环境的构建、打包、启动与部署。负责确保项目成功启动,不负责验证业务功能。

## 开发入口

1. **流程** —— 开发流程 SOP 在项目根 `AGENTS.md` 里。按它执行,不跳阶段。
2. **设计记录** —— 方案设计写入 `development/plans/<迭代编号>/`;每次迭代确定的方案写入 `development/iteration/`,一个方案一个 md 文件,命名为 `[YYMM]-[2位序号]-[简短标题].md`。不要散落在聊天记录里。
3. **部署** —— 按 `deploy/dev/BOOK.md` 拉起本地服务(log :8503 → static :8502 → ai :8501 → web :8500)。
4. **验证** —— 系统级用例在 `runtime/testing/dev/`(`case-core-*/TEST.md`)。
5. **结构理解** —— 改代码前先理解 schema:见 `agents/zh/schema.md` / `agents/zh/enum.md`,或服务起好后用 `/static/query` 在线查。

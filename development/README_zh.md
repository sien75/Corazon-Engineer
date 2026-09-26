# development — 开发过程材料

> `development/plans/` 与 `development/iterations/` 下的内容全部用中文书写。`README.md` 是英文入口(权威版),本文件是它的中文镜像。

开发过程的产出。普通文件树,下面的布局就是它的契约。

## 目录结构

- `iterations/` —— AI 生成的方案,按需求一个 md 文件,命名为 `[YYMM]-[2位序号]-[简短标题].md`(如 `2609-01-runtime 散文化重构.md`),阶段一创建、随设计演进更新。
- `plans/` —— 人工的讨论与原始笔记,按迭代编号建目录(`2608/`、`2609/`……)。
- `testing/` —— E2E 测试,按环境分目录;每个用例是 `desp.yaml`(元数据)+ `TEST.md`(用例本身)。

## 开发入口

1. **流程** —— 开发流程 SOP 在项目根 `AGENTS.md` 里。按它执行,不跳阶段。
2. **设计记录** —— AI 生成的方案写入 `iterations/`,一个方案一个 md 文件,命名为 `[YYMM]-[2位序号]-[简短标题].md`;`plans/<迭代编号>/` 只放人工的讨论与原始笔记。不要散落在聊天记录里。
3. **部署** —— 按 `../how-to/deploy/dev/BOOK.md` 构建 / 拉起本地服务(log :8503 → static :8502 → ai :8501 → web :8500)。
4. **验证** —— 系统级用例在 `testing/dev/`(`case-core-*/TEST.md`)。
5. **结构理解** —— 改代码前先理解 schema:见 `agents/zh/schema.md` / `agents/zh/enum.md`,或服务起好后用 `/static/query` 在线查。

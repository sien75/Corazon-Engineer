# devtime — Corazon 开发时资料

本目录是 Corazon 本体(名词)的开发时资料,**不随系统发布**。要开发本项目,先读本文件,再按索引深入。本项目的 AI 能力描述与 schema/contract/enum 参考在 `agents/`(中文在 `agents/zh/`),不在本目录。

## 目录索引

- `sop/` — 开发流程 SOP:`development-workflow.md`(及同名 `.mmd` 流程图),定义澄清需求 → 开发测试 → 人工审核 → 部署的标准流程。所有开发任务按它执行。
- `iteration-2608/` — 2608 迭代的设计记录:初始想法、产品设计、架构拆分、接口设计。
- `iteration-2609/` — 2609 迭代的记录:事项清单、跨目录引用风险、设计理由与加载策略。

## 开发入口

1. **流程**:按 `sop/development-workflow.md` 执行,不跳阶段。
2. **环境**:按 `runtime/cookbooks/dev/BOOK.md` 拉起本地服务(log :7503 → static :7502 → ai :7501 → web :7500)。
3. **验证**:按 `runtime/tests/dev/` 下登记的系统级用例(`case-core-*/TEST.md`)验证。
4. **结构理解**:改代码前先理解 schema —— 结构与枚举参考见 `agents/zh/schema.md` / `agents/zh/enum.md`,或服务起好后用 `/static/query` 在线查。

## 迭代沉淀

重要设计决策、风险记录,记入新的 `devtime/iteration-XXXX/`(按迭代编号建目录),不要散落在聊天记录里。

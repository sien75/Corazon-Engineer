# AGENTS.md — Corazon Engineer

> 本文件是中文镜像,以英文版 `AGENTS.md` 为准。

**Corazon Engineer** 是一个位于 Coding Agent 之上的 Engineering Agent。用 Corazon Engineer 开发本项目,即为 dogfooding。

> 随工具发布的规范是 `agents/AGENTS.md`(中文在 `agents/zh/`):如何使用 Corazon Engineer 开发 Corazon-like 项目。

## 开发流程 SOP

所有任务分为三类操作,各按自己的阶段顺序执行,不得跳过。

通用原则:

- 先澄清:绝不基于假设写代码 —— 动手前确认目标、范围、验收标准(以及明确**不在范围**的部分)。置信度低于 80% 就继续追问。
- 改动最小,且限于当前阶段;不做顺手重构。
- 每步立即测试。同一失败连续 **3 次**,立即停止,报告报错、已尝试的方案与疑似阻塞,并给出备选思路。
- 提交与推送都经 `my-server`(`ssh my-server`),不在本机做:在 `my-server` 上按仓库名找到本项目的 clone → 改动以 patch 传过去 → 在 `my-server` commit 并 push → 本机删除工作区变动并 pull 回来。**严禁本机直接 push。**

### 第一类:常规需求开发

**阶段一:设计。** 范围:`development/` 与 `notes/`。把需求整理为设计记录:方案设计写入 `development/plans/<迭代编号>/`;每次迭代确定的方案写入 `development/iterations/`,命名为 `[YYMM]-[2位序号]-[简短标题].md`。

**阶段二:契约、测试、代码。** 范围:`contracts/`、`atoms/` `edges/`、`development/testing/`、`workspace/`。顺序很重要:先定义 **contracts**,再定义静态关系(`atoms/` `edges/`),再定义测试(`development/testing/`),最后才开发代码(`workspace/`)。

**阶段三:打包、运行、测试。** 按 `how-to/deploy/dev/BOOK.md` 重新打包并运行,执行测试用例。通过则继续;不通过则带着报错回到阶段二。

**阶段四:人工评审与提交。** 停下等待人工评审。不通过则回到阶段二;通过则在 `my-server` 上提交并推送,再拉回本机(见通用原则)。

### 第二类:系统变更

改变系统或其环境本身,而不是它规定的行为:打包发布、启动与操作基础服务、变更运行中资源的数据。

**阶段一:找到对应的书。** 每类变更都有对应的书:`how-to/deploy/<env>/BOOK.md` 负责构建 / 打包 / 启动 / 部署,`how-to/operation/` 负责连接 / 观测 / 变更资源。

**阶段二:照本执行。** 按书中指示逐步执行;不自行发挥命令,也不跳过步骤。书与现实不符时停下,转第三类(改书),不要绕过去。

目前只有构建打包接通:读 `how-to/deploy/prod/BOOK.md`,照它执行。

### 第三类:更改 How-to 内容

改的是说明本身 —— 告诉人和 agent 如何开发、如何操作这个项目的内容。初始化不是另一类,而是这一类的最初形态:项目还没有 how-to,只是尚未写出;此后让它与现实保持一致,是同一件事的延续。

**阶段一:按指示修改。** 按用户指定的文件修改。若英文与 `_zh` 版本都存在,则两个都要改。`development/plans/` 与 `development/iterations/` 固定用中文;其他地方英文优先。范围就是 how-to 内容:`how-to/` 与 `AGENTS.md`。

初始化就是同一类型应用在「还没有 how-to」的项目上:建项目标记 `engineer.yaml`,铺好 how-to 材料(`how-to/`,以及 `how-to/README.md` 和开发 SOP),和用户一起完成。

## 仓库结构

- `development/` —— 开发过程的产出:`plans/`(方案设计,按迭代编号分目录)、`iterations/`(每次迭代确定的方案,一个方案一个 md 文件、命名为 `[YYMM]-[2位序号]-[简短标题].md`)、`testing/`(E2E 测试)。
- `how-to/` —— 系统怎么构建与操作:`deploy/`(构建 / 打包 / 启动 / 部署,按环境)、`operation/`(连接 / 观测资源)。
- `agents/` —— 随工具发布的 AI 能力规范(`agents/AGENTS.md`,中文在 `agents/zh/`),以及 schema / contract / enum 参考。
- `atoms/` `edges/` `contracts/` `docs/` `notes/` `workspace/` —— 本项目的 schema 与代码。

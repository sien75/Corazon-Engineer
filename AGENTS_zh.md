# AGENTS.md — Corazon Engineer

> 本文件是中文镜像,以英文版 `AGENTS.md` 为准。

**Corazon Engineer** 是一个位于 Coding Agent 之上的 Engineering Agent。用 Corazon Engineer 开发本项目,即为 dogfooding。

> 随工具发布的规范是 `agents/AGENTS.md`(中文在 `agents/zh/`):如何使用 Corazon Engineer 开发 Corazon-like 项目。

## 开发流程 SOP

所有任务分为三类,各按自己的阶段顺序执行,不得跳过。

通用原则:

- 先澄清:绝不基于假设写代码 —— 动手前确认目标、范围、验收标准(以及明确**不在范围**的部分)。置信度低于 80% 就继续追问。
- 改动最小,且限于当前阶段;不做顺手重构。
- 每步立即测试。同一失败连续 **3 次**,立即停止,报告报错、已尝试的方案与疑似阻塞,并给出备选思路。
- 提交与推送都经 `my-server`(`ssh my-server`),不在本机做:在 `my-server` 上按仓库名找到本项目的 clone → 改动以 patch 传过去 → 在 `my-server` commit 并 push → 本机删除工作区变动并 pull 回来。**严禁本机直接 push。**

### 第一类:需求开发

**阶段一:设计。** 范围:`devtime/development/` 与 `notes/`。把需求整理为设计记录:方案设计写入 `development/plans/<迭代编号>/`;每次迭代确定的方案写入 `development/iteration/`(一次迭代一个 md 文件,用时间戳命名)。

**阶段二:契约、测试、代码。** 范围:`contracts/`、`atoms/` `edges/`、`runtime/testing/`、`workspace/`(若涉及 `agents/` 改动,也可改 `agents/`)。顺序很重要:先定义 **contracts**,再定义静态关系(`atoms/` `edges/`),再定义测试(`runtime/testing/`),最后才开发代码(`workspace/`)。

**阶段三:打包、运行、测试。** 按 `devtime/deploy/dev/BOOK.md` 重新打包并运行,执行测试用例。通过则继续;不通过则带着报错回到阶段二。

**阶段四:人工评审与提交。** 停下等待人工评审。不通过则回到阶段二;通过则在 `my-server` 上提交并推送,再拉回本机(见通用原则)。

### 第二类:打包发布

**阶段一:照本执行。** 读 `devtime/deploy/prod/BOOK.md`,按其中指示打包发布。(目前只有打包,照 BOOK 执行即可。)

### 第三类:更改 How-to 文件

**阶段一:按指示修改。** 按用户指定的文件修改。若英文与 `_zh` 版本都存在,则两个都要改。`devtime/development/` 固定用中文;其他地方英文优先。范围包括 `devtime/deploy/`、`runtime/operation/`、`devtime/README.md`、`runtime/README.md`、`AGENTS.md`、`engineer.yaml` 等。

## 仓库结构

- `devtime/` —— 开发期材料,不随工具发布:`development/`(设计工作与迭代记录 —— `plans/` 按迭代编号放方案设计,`iteration/` 放每次迭代确定的方案,一次迭代一个 md 文件、用时间戳命名)、`deploy/`(构建 / 打包 / 启动 / 部署,按环境)。
- `runtime/` —— 运行期材料,随工具发布:`testing/`(E2E 测试)、`operation/`(连接 / 观测资源)。
- `agents/` —— 随工具发布的 AI 能力规范(`agents/AGENTS.md`,中文在 `agents/zh/`),以及 schema / contract / enum 参考。
- `atoms/` `edges/` `contracts/` `docs/` `notes/` `workspace/` —— 本项目的 schema 与代码。

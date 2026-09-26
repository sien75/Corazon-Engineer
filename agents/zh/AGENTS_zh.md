# AGENTS.md — Corazon Engineer AI 能力(中文版)

本文件描述 AI agent 如何**使用** Corazon Engineer,以及如何**开发**一个 Corazon-like 项目。

> Corazon Engineer 本身就是一个 Corazon-like 项目:它遵循同一套规范(dogfooding)。

---

# 第一部分 —— 使用 Corazon Engineer

Corazon Engineer 是运行中的系统。它的 schema 是普通文件树,其它内部能力经 shell / HTTP 访问;本部分的工具、接口与端口属于 Corazon Engineer 本身,不是 Corazon-like 项目的要求。

## 工具

你有标准的 pi 内置工具:

- `read` `grep` `find` `ls` —— 读文件、搜内容、找文件、列目录。
- `bash` —— 运行 shell 命令。网络访问(如 `curl`)和外部 CLI 程序也都走它。
- `write` `edit` —— 新建或修改文件。

其它内部能力都从 `bash`(如 `curl`)访问。每个服务的用法 —— 端点、请求 / 响应结构、示例 —— 都写在已安装工具的 `docs/` 下(默认 `~/.engineer/apps/current/docs/`,如 `static.md`、`log.md`);调用前先读对应文档。你最常需要调用的内部接口是 `validate`(static,改完 schema 后)和写记录(log,跑完测试后),两者都在上述文档里。实际地址见本 prompt 末尾的 Runtime endpoints 段。

## 外部系统与工具

不要指望固定的工具清单。任务需要什么工具 —— 数据库就用 SQL 客户端、Go 项目就用 Go 工具链、Redis 就用 Redis 客户端 —— 自己去找合适的 CLI 工具,缺就装,然后经 `bash` 运行。带安装 / 检测步骤的推荐清单见 `agents/zh/tools.md`。

监听类工具(日志/指标/链路 tail、订阅、流读取)必须把监听结果以 `telemetry` log 记录形式接入(见 `~/.engineer/apps/current/docs/log.md`),让观测结果汇入日志,形成一条连续的流。

外部工具的凭证由各工具自己存储(在各自的 `~/.xxx` 位置),没有项目级凭证目录。登录 / 鉴权是用户的事 —— 让用户来做。工具未鉴权就如实说明,不要到处翻找。凭证不得进入回复或日志。

## 工作规则

- 先查证再回答:对系统结构或状态不确定时,先查询拿真实数据,不要凭记忆编造。
- 克制使用工具:任务确实需要时才调用,避免重复或试探性的调用,也不要把一步工作拆成一串相似的调用;不需要工具的步骤直接完成。必要的一定要用,但不能滥用。
- 改 schema 直接编辑文件;其它有副作用的操作从 `bash` 发出 —— `curl` 调内部服务,或经 `bash` 跑外部 CLI。
- 改完 schema 后调用 static 的 `validate` 接口校验全量树(atoms / edges / contracts)—— 用法见 `~/.engineer/apps/current/docs/static.md`。
- 每次实际跑完测试后调用 log 的写记录接口,`kind: test`;监听 / 观测结果用 `kind: telemetry`。(`conversation` 记录由 ai 服务自己写,不要记录。)用法见 `~/.engineer/apps/current/docs/log.md`。
- 回答使用与用户相同的语言(用户用中文就用中文)。
- 能力尚未接通时如实说明,不要假装执行了。

## 工具安全规则

- 改 schema 文件、写 log 及其它有副作用的调用都会产生真实影响 —— 审慎使用,不要试探性调用。
- 不要探测未知接口或执行效果不明的操作;效果不明确时,拒绝并解释,不要瞎猜。
- 凭证不得进入回复或日志。

---

# 第二部分 —— 开发 Corazon-like 项目

一个 Corazon-like 项目是一个工程架构系统:通过 schema 文件描述原子项目(atoms)、连接(edges)、接口契约(contracts),实现代码放在 `workspace/`,并通过系统级测试验证整体。Corazon-like 项目自行决定怎么运行,不继承 Corazon Engineer 的服务与端口。

`development/` 和 `how-to/` 划分材料:开发过程产出什么,以及系统怎么构建 / 操作。

- `development/` —— 开发过程的产出:设计记录、迭代记录,以及从用户视角的 E2E 测试。它下面的组织方式因项目而异,`development/README.md` 是它的概述。
- `how-to/` —— 系统怎么构建与操作:构建 / 打包 / 启动 / 部署资料,以及连接 / 观测数据库、缓存、日志、服务实例。它下面的组织方式因项目而异,`how-to/README.md` 是它的概述。

所以:除了项目自己的 `AGENTS.md` 之外,建议在修改前也读 `development/README.md` —— 它说明开发过程产出什么;以及 `how-to/README.md` —— 它说明系统怎么构建、测试、连接与操作。

## 目录约定

- `engineer.yaml` — 项目根标记(项目名、版本)。
- `atoms/` — 每个 atom 一个 YAML:它是谁、提供什么、依赖什么。
- `edges/` — atom 之间的连接。
- `contracts/` — atom 引用的接口契约;请求/响应结构的内部事实源。
- `workspace/` — atom 的源码(本地检出)。不必放在本仓库内:atom 的 `repo` / `path` 分别关联上游与检出位置。
- `how-to/` — 系统怎么构建与操作:构建 / 部署配方,以及资源的连接 / 观测;一个普通文件树,内部组织方式因项目而异;`how-to/README.md` 是它的概述。
- `docs/` — 文档,即通常意义上的文档。
- `agents/` — 项目面向 AI 的说明:AI 应如何在本项目上工作;以及 schema / contract / enum 参考。
- `development/` — 开发过程的产出:设计 / 迭代记录与 E2E 测试;一个普通文件树,内部组织方式因项目而异;`development/README.md` 是它的概述。
- `notes/` — 自由笔记。
- `.engineer/` — 项目的本地私有数据(数据库、运行数据、日志),不进 git,绝不提交。

## 参考

- `./schema.md` — schema 结构(atoms / edges / contracts / development / how-to / docs / notes)。
- `./contract.md` — contract 文件书写规范。
- `./enum.md` — 枚举取值(channel / protocol / runtime_type / role)。
- `./how-to.md` — 如何和用户一起写、一起维护项目的 how-to 内容:完整的初始化步骤,按顺序。

## 开发类型

在一个 Corazon-like 项目上的工作分为三类操作。具体阶段属于项目自己的 `AGENTS.md` —— 读它并遵循;下面只是分类。

1. **常规需求开发** —— 把需求变成系统的一部分,固定顺序:设计记录写入 `development/`,然后 contracts → 静态关系(`atoms/` `edges/`)→ 测试(`development/`)→ 代码(`workspace/`),再构建运行,最后人工评审。契约先于代码,并且是请求 / 响应结构的事实源。

2. **系统变更** —— 改变系统或其环境本身,而不是它规定的行为:打包发布、启动与操作基础服务、变更运行中资源的数据。不要自行发挥:每类变更都有自己的 how-to,全部放在 `how-to/` 下;找到它并遵循它。

3. **更改 How-to 内容** —— 改的是说明本身:告诉人和 agent 如何构建、如何操作这个项目的内容。即 `how-to/` 加上项目自己的 SOP(`AGENTS.md`)。初始化是这一类的最初形态,此后是同一件事的延续 —— 项目的 how-to 内容是有待持续维护的产物,不是一次性动作。

   - **步骤。** `./how-to.md` 是完整的初始化路径 —— 五步(建立系统地图 → 关联实际代码 → 分析 contract → 构建与运行方式 → 验证与操作方式),每步都写明要弄清楚什么、要问用户什么、要写什么。初始化项目时整篇读;只写或只改其中一部分材料时,读对应的那一步。
   - **初始化。** 项目还没有 how-to 材料时,按 `./how-to.md` 从头走完:在根目录建项目标记 `engineer.yaml`,铺好 how-to 目录 `how-to/`,和用户一起写材料(`how-to/README.md` 和项目的开发 SOP)。
   - **持续维护。** 当现实与 how-to 脱节(新增目录、流程变化、新约定),先向用户提出具体调整建议,确认后再更新 how-to —— 该动哪一部分,同样看这几步。绝不要默默绕过过时的 how-to —— 先改它,再遵循它。

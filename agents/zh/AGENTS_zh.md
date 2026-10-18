# AGENTS.md — Corazon Engineer AI 能力(中文版)

本文件描述 AI Agent 如何**使用** Corazon Engineer,以及如何**开发**一个 Corazon-like 项目。

> Corazon Engineer 本身就是一个 Corazon-like 项目:它遵循同一套规范(dogfooding)。

---

# 第一部分 —— 使用 Corazon Engineer

Corazon Engineer 是运行中的系统。它的 schema 是普通文件树,其它内部能力经 shell / HTTP 访问;本部分的工具、接口与端口属于 Corazon Engineer 本身,不是 Corazon-like 项目的要求。

## 工具

你有标准的 pi 内置工具:

- `read` `grep` `find` `ls` —— 读文件、搜内容、找文件、列目录。
- `bash` —— 运行 shell 命令。网络访问(如 `curl`)和外部 CLI 程序也都走它。
- `write` `edit` —— 新建或修改文件。

写 log 记录就是从 `bash` 里 `curl` 一下,实际地址见本 prompt 末尾的 Runtime endpoints 段。

## 外部系统与工具

不要指望固定的工具清单。任务需要什么工具 —— 数据库就用 SQL 客户端、Go 项目就用 Go 工具链、Redis 就用 Redis 客户端 —— 自己去找合适的 CLI 工具,缺就装,然后经 `bash` 运行。带安装 / 检测步骤的推荐清单见 `./tools.md`。

监听类工具(日志/指标/链路 tail、订阅、流读取)必须把监听结果以 `telemetry` log 记录形式接入,让观测结果汇入日志,形成一条连续的流。

外部工具的凭证由各工具自己存储(在各自的 `~/.xxx` 位置),没有项目级凭证目录。登录 / 鉴权是用户的事 —— 让用户来做。工具未鉴权就如实说明,不要到处翻找。凭证不得进入回复或日志。

## Blueprint

**Blueprint 是类,Agent 是实例。** 每个 Agent 都从某个 Blueprint 实例化而来:原型的那两个文件被复制到这个 Agent 自己的 session id 下,副本的 `README.md` 成为该 Agent system prompt 的结尾。从实例化那一刻起 Agent 就是独立的 —— 改原型不会影响已经存在的 Agent。

- Blueprint 是目录 `.agents/blueprints/<slug>/`,里面**只有两个文件,不能有别的**:`README.md`(这个 Agent 是什么、它的 UI 用来干什么 —— 这就是 Agent 的开场上下文)和 `index.html`(UI 本身,必须**自包含**:css / js 全部内联,不要同级文件)。

## 工作规则

- 先查证再回答:对系统结构或状态不确定时,先查询拿真实数据,不要凭记忆编造。
- 克制使用工具:任务确实需要时才调用,避免重复或试探性的调用,也不要把一步工作拆成一串相似的调用;不需要工具的步骤直接完成。必要的一定要用,但不能滥用。
- 改 schema 直接编辑文件;其它有副作用的操作从 `bash` 发出 —— `curl` 调内部服务,或经 `bash` 跑外部 CLI。
- 每次实际跑完测试后调用 log 的写记录接口,`kind: test`;监听 / 观测结果用 `kind: telemetry`。(`conversation` 记录由 ai 服务自己写,不要记录。)
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
- `agents/` — 项目自己的 Agent 说明:AI Agent 应如何在本项目上工作;以及 schema / contract / enum 参考。
- `development/` — 开发过程的产出:设计 / 迭代记录与 E2E 测试;一个普通文件树,内部组织方式因项目而异;`development/README.md` 是它的概述。
- `.agents/` — Agent 以文件形式保留、供其它 Agent 读取的项目资源:`skills/<slug>/SKILL.md`(保留的 skill)与 `blueprints/<slug>/index.html`(页面)。
- `notes/` — 自由笔记。
- `.engineer/` — 项目的本地私有数据(数据库、运行数据、日志),不进 git,绝不提交。

## 参考

- `./schema.md` — schema 结构(atoms / edges / contracts / development / how-to / docs / notes)。
- `./contract.md` — contract 文件书写规范。
- `./enum.md` — 枚举取值(channel / protocol / runtime_type / role)。
- `./how-to.md` — 如何和用户一起写、一起维护项目的 how-to 内容:完整的初始化路径,五步按顺序。项目还没有 how-to 时整篇读;只写或改其中一部分时,读对应那一步。现实与 how-to 脱节时先修 how-to,不要默默绕过去。


# AGENTS.md — Corazon AI 能力(中文版)

本文件描述 AI agent 如何**使用** Corazon,以及如何**开发**一个 Corazon-like 项目。

> Corazon 本身就是一个 Corazon-like 项目:它遵循同一套规范(dogfooding)。

---

# 第一部分 —— 使用 Corazon

Corazon 是运行中的系统。它的 schema 是普通文件树,其它内部能力经 shell / HTTP 访问;本部分的工具、接口与端口属于 Corazon 本身,不是 Corazon-like 项目的要求。

## 工具

你有标准的 pi 内置工具:

- `read` `grep` `find` `ls` —— 读文件、搜内容、找文件、列目录。
- `bash` —— 运行 shell 命令。网络访问(如 `curl`)和外部 CLI 程序也都走它。
- `write` `edit` —— 新建或修改文件。

其它内部能力都从 `bash`(如 `curl`)访问。每个服务的用法 —— 端点、请求 / 响应结构、示例 —— 都写在已安装工具的 `docs/` 下(默认 `~/.corazon/apps/current/docs/`,如 `static.md`、`log.md`);调用前先读对应文档。你最常需要调用的内部接口是 `validate`(static,改完 schema 后)和写记录(log,跑完测试后),两者都在上述文档里。实际地址见本 prompt 末尾的 Runtime endpoints 段。

## 外部系统与工具

不要指望固定的工具清单。任务需要什么工具 —— 数据库就用 SQL 客户端、Go 项目就用 Go 工具链、Redis 就用 Redis 客户端 —— 自己去找合适的 CLI 工具,缺就装,然后经 `bash` 运行。带安装 / 检测步骤的推荐清单见 `agents/zh/tools.md`。

监听类工具(日志/指标/链路 tail、订阅、流读取)必须把监听结果以 `telemetry` log 记录形式接入(见 `~/.corazon/apps/current/docs/log.md`),让观测结果汇入日志,形成一条连续的流。

外部工具的凭证由各工具自己存储(在各自的 `~/.xxx` 位置),没有项目级凭证目录。登录 / 鉴权是用户的事 —— 让用户来做。工具未鉴权就如实说明,不要到处翻找。凭证不得进入回复或日志。

## 工作规则

- 先查证再回答:对系统结构或状态不确定时,先查询拿真实数据,不要凭记忆编造。
- 克制使用工具:任务确实需要时才调用,避免重复或试探性的调用,也不要把一步工作拆成一串相似的调用;不需要工具的步骤直接完成。必要的一定要用,但不能滥用。
- 改 schema 直接编辑文件;其它有副作用的操作从 `bash` 发出 —— `curl` 调内部服务,或经 `bash` 跑外部 CLI。
- 改完 schema 后调用 static 的 `validate` 接口校验全量树(atoms / edges / contracts)—— 用法见 `~/.corazon/apps/current/docs/static.md`。
- 每次实际跑完测试后调用 log 的写记录接口,`kind: test`;监听 / 观测结果用 `kind: telemetry`。(`conversation` 记录由 ai 服务自己写,不要记录。)用法见 `~/.corazon/apps/current/docs/log.md`。
- 回答使用与用户相同的语言(用户用中文就用中文)。
- 能力尚未接通时如实说明,不要假装执行了。

## 工具安全规则

- 改 schema 文件、写 log 及其它有副作用的调用都会产生真实影响 —— 审慎使用,不要试探性调用。
- 不要探测未知接口或执行效果不明的操作;效果不明确时,拒绝并解释,不要瞎猜。
- 凭证不得进入回复或日志。

---

# 第二部分 —— 开发 Corazon-like 项目

一个 Corazon-like 项目是一个工程架构系统:通过 schema 文件描述原子项目(atoms)、连接(edges)、接口契约(contracts)、环境映射(runtime),实现代码放在 `workspace/`,并通过系统级测试验证整体。Corazon-like 项目自行决定运行方式,不继承 Corazon 的服务与端口。

`devtime/` 和 `runtime/` 是同一条工作流的划分:先把需求变成系统,再验证并操作它。

- `devtime/`(**不发布**)—— 把需求变成可运行系统:`architecture/`(设计)、`coding/`(代码 + 单元测试)、`deploy/`(构建 / 打包 / 启动 / 部署)。
- `runtime/`(**发布**)—— 验证运行中的系统并与资源交互:`testing/`(从用户视角的 E2E 测试)、`operation/`(连接 / 观测数据库、缓存、日志、服务实例)。

所以:要开发一个 Corazon-like 项目,先读 `devtime/README.md` —— 它说明了开发方式。要测 / 连 / 操作项目的环境,先读 `runtime/README.md` —— 它说明了运行方式。

## 目录约定

- `corazon.yaml` — 项目根标记(项目名、版本、默认 runtime)。
- `atoms/` — 每个 atom 一个 YAML:它是谁、提供什么、依赖什么。
- `edges/` — atom 之间的连接。
- `contracts/` — atom 引用的接口契约;请求/响应结构的内部事实源。
- `workspace/` — atom 的源码(本地检出)。不必放在本仓库内:atom 的 `repo` / `path` 分别关联上游与检出位置。
- `runtime/` — 运行中的系统:`testing/`(E2E 测试)+ `operation/`(连接 / 观测资源);一个普通文件树;`runtime/README.md` 是它的概述。
- `docs/` — 对外文档。必须说明 `workspace/` 打包产物如何使用,包括相关契约的对外视图 —— 使用方不应需要内部源码才能用产物。
- `agents/` — 本 AI 能力描述,以及 schema、contract、enum 参考。
- `devtime/` — 开发时资料(不发布):`architecture/` + `coding/` + `deploy/`;一个普通文件树;`devtime/README.md` 是它的概述。
- `notes/` — 自由笔记。
- `.corazon/` — 项目的本地私有数据(数据库、运行数据、日志),不进 git,绝不提交。

## 参考

- `./schema.md` — schema 结构(atoms / edges / runtime / contracts / docs / notes)。
- `./contract.md` — contract 文件书写规范。
- `./enum.md` — 枚举取值(channel / protocol / runtime_type / role)。

## 开发入口

明确区分这些场景:

1. **项目初始化** —— 项目还没有 Corazon 结构时:在根目录建 `corazon.yaml`,然后搭目录骨架(`atoms/`、`contracts/`、`edges/`、`workspace/`、`runtime/`、`docs/`、`agents/`、`devtime/`)。先定义第一个 atom 和它的契约,再写实现代码;并尽早和用户一起建立 `devtime/README.md`、`runtime/README.md` 和开发 SOP。
2. **已有开发指南** —— 读 `devtime/README.md` 并遵循它。不要另起炉灶,在已有 SOP 内工作。
3. **指南缺失或过时** —— 当现实与 `devtime/` 脱节(新增目录、流程变化、新约定),先向用户提出具体调整建议,确认后再更新 `devtime/`。

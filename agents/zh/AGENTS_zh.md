# AGENTS.md — Corazon AI 能力(中文版)

本文件描述 AI agent 如何**使用** Corazon,以及如何**开发**一个 Corazon-like 项目。

> Corazon 本身就是一个 Corazon-like 项目:它遵循同一套规范(dogfooding)。

---

# 第一部分 —— 使用 Corazon

Corazon 是运行中的系统。它的内部能力都是普通 HTTP 接口;本部分的工具、接口与端口属于 Corazon 本身,不是 Corazon-like 项目的要求。

## 工具

你有两个工具:

- `http` —— 发 HTTP 请求(method / url / headers / body),用于调用 Corazon 的内部服务及其他内部端点。仅限网络,不能访问文件系统或 shell。
- `cli` —— 以参数数组运行本地 CLI 程序。不经 shell,管道/重定向/链式命令不可用;每个程序首次使用需用户批准。

没有按接口拆分的独立工具。

## 内部 HTTP 接口(POST;默认端口见 `runtime/dev.yaml`)

**static 服务 —— schema(http://localhost:7502)**,线上格式 YAML(`application/yaml`):

- `/static/query` — 查全量架构(atoms / edges / runtime 条目 + 各目录清单)
- `/static/query-detail` — 查单个文件内容(runtime / contract / devtime / test / docs / notes)
- `/static/search` — 全局搜索 schema 内容
- `/static/mutation` — 增删改 schema 条目(有副作用)
- `/static/stream` — SSE 订阅 schema 变更事件(长连接;不要直接跑阻塞式 curl)

**log 服务 —— 记录(http://localhost:7503)**,线上格式 YAML:

- `/log/query` — 查记录(test / telemetry / conversation)
- `/log/query-detail` — 单条记录详情
- `/log/search` — 记录全文搜索
- `/log/mutation` — 写记录(有副作用)。每次你触发了测试,都应在此留痕;监听/监控结果也以流的形式汇入这里(见「外部系统与工具」)。(对话记录由 ai 服务自己写入,不要重复记录。)

请求/响应结构由 `contracts/` 下的契约文件定义(如 `contracts/static-query.yaml`)。调用不熟悉的接口前,先通过 `/static/query-detail`(type=contract)在线读契约。

## 外部系统与工具

不要指望固定的工具清单。任务需要什么工具 —— 数据库就用 SQL 客户端、Go 项目就用 Go 工具链、Redis 就用 Redis 客户端 —— 自己去找合适的 CLI 工具,通过 `cli` 工具连接。

监听类工具(日志/指标/链路 tail、订阅、流读取)必须把监听结果接入 `/log/mutation`,让观测结果汇入日志,形成一条连续的流。

连接凭证存放在 `.corazon/credentials/` 下。需要凭证时向用户索取,由用户提供。缺凭证就如实说明,不要到处翻找。凭证不得进入回复或日志。

## 工作规则

- 先查证再回答:对系统结构或状态不确定时,先查询拿真实数据,不要凭记忆编造。
- 改 schema / 有副作用的操作,直接通过 `http` / `cli` 发请求。`http` 调用无需审批;`cli` 调用在每个程序首次使用时向用户弹审批卡 —— 被拒绝就解释并停止;程序一经批准即可自由使用。
- 每次实际跑完测试后,调用 `/log/mutation` 留痕。
- 回答使用与用户相同的语言(用户用中文就用中文)。
- 能力尚未接通时如实说明,不要假装执行了。

## 工具安全规则

- `http` 工具只用于 Corazon 的内部服务与内部端点,绝不用它访问任意外部系统。
- 网络访问只能走 `http` 工具;本地程序只能走 `cli` 工具(每个程序首次使用需用户批准)。
- `/static/mutation` 和 `/log/mutation` 有副作用 —— 审慎使用,不要试探性调用。
- 不要探测未知接口或执行效果不明的操作;效果不明确时,拒绝并解释,不要瞎猜。
- 凭证不得进入回复或日志。

---

# 第二部分 —— 开发 Corazon-like 项目

一个 Corazon-like 项目是一个工程架构系统:通过 schema 文件描述原子项目(atoms)、连接(edges)、接口契约(contracts)、环境映射(runtime),实现代码放在 `workspace/`,并通过系统级测试验证整体。Corazon-like 项目自行决定运行方式,不继承 Corazon 的服务与端口。

要开发一个 Corazon-like 项目,先读 `devtime/README.md` —— 它说明了开发方式。

## 目录约定

- `corazon.yaml` — 项目根标记(项目名、版本、默认 runtime)。
- `atoms/` — 每个 atom 一个 YAML:它是谁、提供什么、依赖什么。
- `edges/` — atom 之间的连接。
- `contracts/` — atom 引用的接口契约;请求/响应结构的内部事实源。
- `workspace/` — atom 的源码。
- `runtime/` — 各环境的映射:端点、监控、测试。
- `runbooks/` — 各环境如何运行、如何接入。
- `tests/` — 系统级测试用例,由 `runtime/` 引用。
- `docs/` — 对外文档。必须说明 `workspace/` 打包产物如何使用,包括相关契约的对外视图 —— 使用方不应需要内部源码才能用产物。
- `agents/` — 本 AI 能力描述,以及 schema、contract、enum 参考。
- `devtime/` — 开发时资料(方法论、SOP、迭代记录)。
- `notes/` — 自由笔记。
- `.corazon/` — 本地私有数据(数据库、凭证),不进 git。

## 参考

- `./schema.md` — schema 结构(atoms / edges / runtime / contracts / tests / docs / notes / cookbooks)。
- `./contract.md` — contract 文件书写规范。
- `./enum.md` — 枚举取值(channel / protocol / runtime_type / role)。

## 开发入口

明确区分这些场景:

1. **项目初始化** —— 项目还没有 Corazon 结构时:在根目录建 `corazon.yaml`,然后搭目录骨架(`atoms/`、`contracts/`、`edges/`、`workspace/`、`runtime/`、`runbooks/`、`tests/`、`docs/`、`agents/`、`devtime/`)。先定义第一个 atom 和它的契约,再写实现代码;并尽早和用户一起建立 `devtime/README.md` 和开发 SOP。
2. **已有开发指南** —— 读 `devtime/README.md` 并遵循它。不要另起炉灶,在已有 SOP 内工作。
3. **指南缺失或过时** —— 当现实与 `devtime/` 脱节(新增目录、流程变化、新约定),先向用户提出具体调整建议,确认后再更新 `devtime/`。

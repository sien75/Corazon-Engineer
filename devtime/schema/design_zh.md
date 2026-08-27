# Schema 设计

## 总体结构

schema 由 **静态结构** 与 **场景** 组成：

```
静态结构 (atom & edge) —— 定义系统结构
├── Atom 层       atoms/      原子项目
│   └── Contract  contracts/  接口契约
├── Edge 层       edges/      连接定义
├── Docs          docs/       参考文档（引用 contract）
│   └── Contract  contracts/  接口契约
└── Notes         notes/      批注

场景 —— 填充具体内容
├── Runtime       runtime/    运行环境映射
│   └── Test      tests/      测试用例（引用 contract）
│       └── Contract  contracts/  接口契约
└── Devtime       devtime/    开发时记录
    └── Contract  contracts/  接口契约
```

加载策略：`atoms` 和 `edges` 全量加载（schema 查询返回完整内容 —— 画图要用）。`runtime` / `contracts` / `tests` / `devtime` / `docs` / `notes` 按需加载 —— 查询只返回路径 / 条目，用到时再取内容。

---

## 文件组织

根 `corazon.yaml` 只放项目级 meta。`atoms/` / `edges/` / `runtime/` / `devtime/` / `docs/` / `notes/` 靠目录约定自动发现；`contracts/` 和 `tests/` 为内容文件目录。`include`/`exclude` 仅在偏离约定时才写。任何目录下以 `.` 开头的条目一律忽略——永不解析为内容——因此 dot 目录可自由存放 fixture、临时数据和工具文件（如 `tests/.playground/`）。

```yaml
# corazon.yaml —— 只放根 meta，不枚举数据文件
project: Corazon
version: 1.0
default_runtime: dev
# 可选：偏离约定时才写
include:
  - ../shared-atoms/billing-service.yaml   # 从外部引入一个 atom
exclude:
  - atoms/experimental-service.yaml         # 跳过某个文件
```

```
project/
├── corazon.yaml               # 仅根 meta（project、version、default_runtime、include/exclude）
├── atoms/                     # *.yaml → atom
│   ├── user-service.yaml
│   ├── notification-service.yaml
│   └── ...
├── edges/                     # *.yaml → edge
│   ├── user-to-notification.yaml
│   └── ...
├── runtime/                   # *.yaml → runtime env（文件名即 env 名）
│   ├── dev.yaml
│   ├── staging.yaml
│   └── prod.yaml
├── devtime/                   # *.md → 开发时记录（会议 / ADR / changelog）
├── contracts/                 # 内容文件（接口 contract yaml）
│   ├── create-user-api.yaml
│   ├── user-created-event.yaml
│   ├── postgres-client.yaml
│   ├── redis-client.yaml
│   └── ...
├── tests/                     # 内容文件（测试用例 md）
│   ├── user-registration-flow.yaml
│   ├── user-service-api.yaml
│   └── ...
├── docs/                      # *.md → 参考文档（引用 contract）
├── notes/                     # *.md → 批注（anchor 指向实体）
└── workspace/                 # 本地代码仓库
```

---

## Atom 层 — 原子项目

描述一个最小独立项目/服务/仓库，位于 `atoms/`。格式：

```yaml
atoms:
  - name: user-service
    description: 用户管理与认证服务
    repo: git@github.com:org/user-service.git
    path: ./workspace/user-service
    runtime_type: go
    runtime_version: "1.22"
    role: service

    interfaces:
      provides:
        - id: create-user-api
          channel: network
          protocol: http
          contract: ./contracts/create-user-api.yaml
          extend:
            path: /api/v1/users
            method: POST
        - id: redis-sub
          channel: network
          protocol: redis
          extend:
            command: SUBSCRIBE
            topic: session:expired

      consumes:
        - id: user-created-event
          channel: network
          protocol: kafka
          contract: ./contracts/user-created-event.yaml
          extend:
            topic: user.created
        - id: postgres-client
          channel: network
          protocol: pgwire
          contract: ./contracts/postgres-client.yaml
        - id: redis-client
          channel: network
          protocol: redis
          contract: ./contracts/redis-client.yaml
```

- `interfaces.provides` / `interfaces.consumes` 按角色声明接口：`provides` = 本 atom 提供的能力（别人调本 atom）,`consumes` = 本 atom 依赖的能力（本 atom 调别人）
- `role` 是 atom 在架构中的角色（service | database | cache | queue | storage | gateway | scheduler | worker | proxy），见 devtime/schema/enums_zh.md
- 接口公共字段：`id` / `channel` / `protocol` / `contract`（指向 `contracts/` 下的契约文件）
- 协议特有字段统一放 `extend`（自由对象，形态随协议而变：http 用 `path/method`，redis 用 `command/topic`，kafka 用 `topic` 等）。监听地址/端口属于部署关注点，由 Runtime 层的 `connections.address` 表达，不写在 atom 里

---

## Edge 层 — 连接定义

定义原子之间的组合方式，位于 `edges/`。格式：

```yaml
edges:
  - id: user-to-notification
    from: user-service
    from_interface: user-created-event
    to: notification-service
    to_interface: send-notification-api
    channel: network
    protocol: http
    description: 用户注册后发送欢迎通知
```

---

## Runtime 层 — 运行环境映射

把 schema 映射到具体运行环境。位于 `runtime/`，**文件名即 env 名**（`dev.yaml` → env `dev`）。每个 env 有四个块：`description`（环境描述）、`connections`（每个 atom 怎么接入 —— 按 atom 为键，字段随 channel 变化）、`telemetry`（监控观测：logs/metrics/traces）、`tests`（绑定到该环境的系统级测试）。atom 怎么被拉起是它自己的事，不进架构 schema。

```yaml
runtime:
  dev:
    description: 本地开发环境
    connections:
      user-service:
        channel: network
        address: http://localhost:8080
      notification-service:
        channel: network
        address: http://localhost:9090
      mcp-server:
        channel: stdio
        in: /tmp/corazon.mcp.in
        out: /tmp/corazon.mcp.out
      local-daemon:
        channel: ipc
        address: /var/run/corazon.sock
    telemetry:
      user-service:
        backend: otlp
        endpoint: http://localhost:4317
    tests:
      - id: user-registration-flow
        description: 端到端 —— 用户注册后发送欢迎通知
        atoms: [user-service, notification-service]
        edges: [user-to-notification]
        case: ./tests/user-registration-flow.yaml
      - id: user-service-api
        description: user-service HTTP 契约一致性
        atoms: [user-service]
        case: ./tests/user-service-api.yaml

  staging:
    description: 预发环境
    connections:
      user-service:
        channel: network
        address: https://user.staging.corazon.com
      notification-service:
        channel: network
        address: https://notify.staging.corazon.com

  prod:
    description: 线上环境
    connections:
      user-service:
        channel: network
        address: https://user.api.corazon.com
      notification-service:
        channel: network
        address: https://notify.api.corazon.com
```

**connections 字段形态（按 channel）**

| channel | 字段 | 含义 |
|---|---|---|
| `network` | `address` | 拨号目标地址，如 `http://`、`grpc://`、`redis://...` |
| `stdio` | `in` + `out` | 命名管道（atom 自身怎么拉起不在 schema 范畴内） |
| `ipc` | `address` | 本地通信资源，如 unix socket 路径 |

**telemetry** —— 监控（读/监听）侧：在哪里观测 logs/metrics/traces。目前按 atom 为键（粒度待定）。统一为单个 OTLP endpoint 承载三种信号，不再按信号拆分。

**tests** —— 每个 runtime env 可挂一个 `tests:` 块，承载绑定到该环境的系统级测试。一个 test 圈定一组 atoms/edges（按 id）并把具体定义指向 `tests/` 下的 `case` 文件。atom 声明接口，test 去验证它们。`dev` 可跑全套，`prod` 可不跑或只跑只读检查。

---

## Contract 文件 — 接口契约

描述接口的输入输出与错误，位于 `contracts/`。被 atom 的 `interfaces` 和 test 引用。格式：

```yaml
id: ai-ask
description: Ask AI; prompt determines what AI does

request:
  body:
    id: string  # session id
    prompt: string  # what AI should do

response:
  status: 200
  body:
    sessionId: string

errors:
  - status: 400
    code: bad_request
    description: prompt missing or empty
  - status: 404
    code: not_found
    description: session not found
  - status: 500
    code: internal
    description: server error
```

- `request` / `response` 的 body 即真实数据结构；`stream: sse` 标记流式接口，body 为每条 event 的 schema
- `errors` 列出本接口可能出现的错误（status / code / description）
- 字段书写规范（类型、枚举、可选、数组、注释）见 `devtime/iteration-2608/contract 规范.md`

---

## Test 文件 — 测试用例

描述系统级测试，位于 `tests/`，被 runtime env 的 `tests.case` 引用。为普通 markdown 文件，不做格式约定。

测试绝不对真实项目树执行。测试在 `.playground/` 中运行——它是仓库根目录下一个空白或 mock 的 corazon 项目（git 忽略），由测试准备步骤搭建（如从 `tests/.playground/` 这类 fixture 生成），绝不拷贝真实项目。被测后端启动时将项目根指向 `.playground/`，测试与真实 schema 内容完全解耦，增删改只落在 mock 上。`.playground/` 可随时删除重建。

## Devtime 文件 — 开发时记录

记录开发过程中的会议、ADR、changelog 等，位于 `devtime/`。为普通 markdown 文件，不做格式约定。

## Docs 文件 — 参考文档

面向使用者的参考文档，位于 `docs/`。为普通 markdown 文件，不做格式约定。

## Notes 文件 — 批注

针对某个实体的标记与讨论，位于 `notes/`。为普通 markdown 文件，不做格式约定。

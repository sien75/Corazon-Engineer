# Schema 设计

## 总体结构

schema 由「**是什么**」与「**怎么做**」组成：

```
是什么 —— 定义系统结构
├── Atom 层       atoms/      原子项目   —— yaml
├── Edge 层       edges/      连接定义   —— yaml
├── Contract      contracts/  接口契约   —— yaml
├── Workspace     workspace/  原子代码   —— 代码
├── Docs          docs/       对外文档   —— 散文
└── Notes         notes/      内部批注   —— 散文

怎么做 —— 开发与运行
├── Devtime       devtime/    怎么开发（development + deploy）—— 散文
└── Runtime       runtime/    怎么测试与操作（testing + operation）      —— 散文
```

`workspace/` 放各 atom 的实现代码。atom 通过 `repo` 关联上游仓库、通过 `path` 关联本地检出;代码可以放在 `workspace/`(默认),也可以放在 `path` 指向的任意位置 —— **不一定要在这个仓库里**。

---

## 文件组织

根 `engineer.yaml` 只放项目级 meta。`atoms/` / `edges/` / `runtime/` / `devtime/` / `docs/` / `notes/` 靠目录约定自动发现；`contracts/` 为内容文件目录。`include`/`exclude` 仅在偏离约定时才写。任何目录下以 `.` 开头的条目都是**特殊条目**——它们不参与该目录的并列结构（不作为内容实体）。

```yaml
# engineer.yaml —— 只放根 meta，不枚举数据文件
project: Corazon Engineer
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
├── engineer.yaml               # 仅根 meta（project、version、default_runtime、include/exclude）
├── atoms/                     # *.yaml → atom
│   ├── user-service.yaml
│   ├── notification-service.yaml
│   └── ...
├── edges/                     # *.yaml → edge
│   ├── user-to-notification.yaml
│   └── ...
├── contracts/                 # 内容文件（接口 contract yaml）
│   ├── create-user-api.yaml
│   ├── user-created-event.yaml
│   ├── postgres-client.yaml
│   ├── redis-client.yaml
│   └── ...
├── workspace/                 # 本地代码仓库（检出）
├── docs/                      # *.md → 对外文档
├── notes/                     # *.md → 内部批注（标记 + thread，锚定实体）
├── devtime/                   # 普通文件树：开发时资料（布局由 devtime/README.md 定义）
│   ├── README.md              # devtime 树自身的约定 —— 先读
│   ├── development/           # 编码前的需求分析与架构设计（按迭代）
│   └── deploy/                # 构建 / 打包 / 启动 / 部署
└── runtime/                   # 普通文件树：testing + operation（布局由 runtime/README.md 定义）
    ├── README.md              # runtime 树自身的约定 —— 先读
    ├── testing/               # E2E 测试
    └── operation/             # 连接 / 观测资源（数据库、缓存、日志、服务）
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
- `role` 是 atom 在架构中的角色（service | database | cache | queue | storage | gateway | scheduler | worker | proxy），见 ./enum.md
- 接口公共字段：`id` / `channel` / `protocol` / `contract`（指向 `contracts/` 下的契约文件）
- 协议特有字段统一放 `extend`（自由对象，形态随协议而变：http 用 `path/method`，redis 用 `command/topic`，kafka 用 `topic` 等）。监听地址/端口属于部署关注点，由 Runtime 层的 `endpoints.address` 表达，不写在 atom 里

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
- 字段书写规范（类型、枚举、可选、数组、注释）见 `./contract.md`

---

## Docs 文件 — 对外文档

对外文档，位于 `docs/`。为普通 markdown 文件，不做格式约定。

---

## Notes 文件 — 内部批注

针对某个实体的内部标记与讨论，位于 `notes/`。为普通 markdown 文件，不做格式约定。

---

## Devtime 文件 — 开发时资料

把需求变成可运行系统的一切，位于 `devtime/`。为普通文件树（同 `runtime/`），布局由 `devtime/README.md` 定义。两个模块：

- **`development/`** —— 需求分析、架构设计及编码前的设计工作（会议、ADR、迭代记录，按迭代编号建目录）。
- **`deploy/`** —— 每个环境的构建、打包、启动与部署；负责确保项目成功启动，不负责验证业务功能。

以普通 markdown 为主，不做格式约定；也可能包含脚本文件（如 deploy 脚本）。应当读 README 并遵循项目声明的约定。

---

## Runtime 层 — 运行系统与资源交互

运行中的系统及其资源，位于 `runtime/`。为普通文件树（同 `devtime/`），布局由 `runtime/README.md` 定义。两个模块：

- **`testing/`** —— 从真实用户视角的 E2E 测试，通过 UI / API 操作业务系统验证功能。
- **`operation/`** —— 连接并观测资源（数据库、缓存、日志、服务实例），含 telemetry：实时监控、历史日志查询，以及对底层资源的主动操作。

系统级测试放在 `testing/` 下，含 `desp.yaml`（元数据）和 `TEST.md`（用例）；不得对真实项目树执行。

以普通 markdown 为主，不做格式约定；也可能包含脚本文件。应当读 README 并遵循项目声明的约定。

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
├── Runtime       runtime/    如何运行 + 跑哪些测试（普通文件树；见 runtime/README.md）
└── Devtime       devtime/    开发时记录
    └── Contract  contracts/  接口契约
```

---

## 文件组织

根 `corazon.yaml` 只放项目级 meta。`atoms/` / `edges/` / `runtime/` / `devtime/` / `docs/` / `notes/` 靠目录约定自动发现；`contracts/` 为内容文件目录。`include`/`exclude` 仅在偏离约定时才写。任何目录下以 `.` 开头的条目一律忽略——永不解析为内容。

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
├── runtime/                   # 普通文件树：如何运行 + 跑哪些测试（布局由 runtime/README.md 定义）
│   ├── README.md              # runtime 树自身的约定 —— 先读
│   ├── cookbooks/             # 每个 env 一个目录（env 名 = 目录名）
│   │   └── dev/               # BOOK.md（拉起/连接/观测）+ launch.sh（启动器）
│   └── tests/                 # 每个 env 的系统测试
│       └── dev/               # case-xxx/ → desp.yaml（元数据）+ TEST.md（用例）
├── devtime/                   # *.md → 开发时记录（会议 / ADR / changelog）
├── contracts/                 # 内容文件（接口 contract yaml）
│   ├── create-user-api.yaml
│   ├── user-created-event.yaml
│   ├── postgres-client.yaml
│   ├── redis-client.yaml
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

## Runtime 层 — 运行环境映射

把 schema 映射到具体运行环境。`runtime/` 是一个**普通文件树**（同 `devtime/`），不是结构化 YAML schema —— 它的布局与含义由 `runtime/README.md` 定义，README 就是这棵树的契约。消费方是 web 前端（原样返回文件、不解析结构）和 AI（先读 README，再读需要的文件，用于拉起/连接/观测/测试某个环境）。需要结构化值时，放进树内的小 YAML 文件（如 `desp.yaml`）；约定是项目自己的，写进 `runtime/README.md`。每个 env 由自己的 `launch.sh`（真实脚本，不是从散文生成的）启动，端口由它选定并在启动时下发给各 atom。

典型布局（每个 env 一个目录）：

```
runtime/
├── README.md          # runtime 树自身的约定 —— 先读
├── cookbooks/[env]/   # env 名 = 目录名
│   ├── BOOK.md        # 该 env 怎么拉起/连接/观测（散文）
│   └── launch.sh      # 该 env 的启动器（选端口、拉起各 atom）
└── tests/[env]/       # 绑定到该 env 的系统测试
    └── case-xxx/
        ├── desp.yaml  # 测试元数据：atoms 必填，env 可省
        └── TEST.md    # 测试用例本身
```

由于这棵树以散文为主，这里没有强制的 schema：端口、endpoint、telemetry 都在 cookbook 里描述、由该 env 的 `launch.sh` 落实，AI 应当读 README 并遵循项目声明的约定，而不是依赖固定结构。

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

## Test 文件 — 测试用例

系统级测试放在 runtime 树内（见 Runtime 层）：`runtime/tests/[env]/case-xxx/`，含 `desp.yaml`（元数据）和 `TEST.md`（用例）。用例文件本身为普通 markdown，不做格式约定。

测试绝不对真实项目树执行。测试在 `.corazon/.playground/` 中运行——`.corazon/` 是项目根下 git 忽略的私有目录，`.corazon/.playground/` 是其下的空白或 mock corazon 项目，由测试准备步骤搭建（如从 `runtime/tests/dev/.playground/` 这类 fixture 生成）。被测后端启动时将项目根指向 `.corazon/.playground/`，增删改只落在 mock 上。

## Devtime 文件 — 开发时记录

记录开发过程中的会议、ADR、changelog 等，位于 `devtime/`。为普通 markdown 文件，不做格式约定。

## Docs 文件 — 参考文档

面向使用者的参考文档，位于 `docs/`。为普通 markdown 文件，不做格式约定。

## Notes 文件 — 批注

针对某个实体的标记与讨论，位于 `notes/`。为普通 markdown 文件，不做格式约定。

# Coding Agent 之上，还缺什么？——探索 Engineering Agent

> 从 Coding Agent 到 Engineering Agent：一次系统级工程抽象的尝试  
> Corazon Engineer 原型设计与实践

## 1. AI 都会写代码了，工程问题解决了吗？

Coding Agent 正在让代码生成变得越来越便宜，但完成一个真实需求，仍然要经历一条更长的链路：

```text
理解系统 → 判断改哪里 → 设计改法 → Coding → 反复验证 → 各种系统操作 → 线上运维
```

Coding 只是其中一环。实际使用 Coding Agent 时，越来越明显地感觉到：代码可以更快生成，但理解系统、约束变更、判断结果是否正确，仍然很贵。

这带来了这次探索的起点：

> **AI 让代码生成越来越便宜，但系统理解、约束、验证没有同步变便宜。**

所以，也许我们缺的不是另一个更强的 Coding Agent，而是 Coding Agent 上面的一层。

## 2. 更高维度的抽象: 从单个代码仓库到软件工程地图

一个系统通常包含多个前端、后端、基础服务和工具仓库；不同系统之间还会通过接口、消息、数据和部署环境相互依赖。

与此同时，代码、接口文档、开发 SOP、监控日志和测试结果往往散落在不同平台，很难从一个地方看到完整的工程上下文。

因此，单独理解某一个仓库还不够。我们需要把这些分散的信息组织到一起：

```text
一个系统内的多个代码仓库
+ 仓库和服务之间的关系
+ 各环境中的实际运行状态
+ 开发、测试与验证结果
= 一张软件工程地图
```

这张地图不替代代码仓库，而是建立在代码仓库之上，把原本散落在各处的工程对象连接起来。人和 AI 可以先从整体上理解系统并设计方案，然后交由 AI 去实现, 然后再进行验证。

## ~ 一个小问题

编程 = 数据结构 + 算法.

那在 ai 时代, 哪一项更加重要呢?

## 3. 关键设计思路

在 Corazon Engineer 中，最小工程单元叫作 **Atom**，把单元之间的关系叫作 **Edge**，再用 Schema 描述它们的结构、契约和运行环境。

例如，在一个交易系统中，下面这些对象都可以是 Atom：

- `checkout-web`：用户下单的前端应用。
- `order-service`：创建和管理订单的后端服务。
- `payment-gateway`：连接外部支付渠道的网关。
- `order-db`：保存订单数据的数据库。
- `order-events`：传递订单事件的消息队列。
- `settlement-worker`：执行对账或结算的后台任务。

这些 Atom 可能来自不同代码仓库，也可能是数据库、消息队列等基础软件。Edge 再把“前端调用订单服务”“订单服务写入数据库”“订单事件触发结算任务”等关系连接起来，形成完整的系统视图。

Atom 内部如何编码，仍然交给 Coding Agent；Corazon Engineer 负责组织 Atom 之间的关系，让系统级的结构、运行和验证过程能够被统一理解。

### 3.1 Atom: 把代码项目作为原子, 不介入具体的代码编写

Corazon Engineer 不尝试理解和接管每个项目内部的全部实现。一个 Atom 内部使用 Java、Go 还是 TypeScript，并不是宏观层首先关心的问题。

宏观层只描述这个单元是谁、提供什么能力、依赖什么能力，以及它与其他单元有什么关系。这样可以保留 Coding Agent 擅长的边界，同时建立一个跨项目的系统视角。

一个 Atom 的 Schema 大致如下：

```yaml
atoms:
  - name: order-service
    description: 创建和管理订单
    repo: git@github.com:example/order-service.git
    path: ./workspace/order-service
    runtime_type: go
    runtime_version: "1.22"
    role: service

    interfaces:
      provides:
        - id: create-order-api
          channel: network
          protocol: http
          contract: ./contracts/create-order-api.yaml
          extend:
            path: /orders
            method: POST

      consumes:
        - id: payment-api
          channel: network
          protocol: http
          contract: ./contracts/payment-api.yaml
```

这份 Schema 主要回答四类问题：

- `name`、`description`、`repo`、`path`、`runtime_type`、`runtime_version`：基本信息。
- `role`：它是什么类型的工程单元。
- `interfaces.provides`：它向系统提供什么能力。
- `interfaces.consumes`：它依赖系统中的什么能力。

接口通过 `channel`、`protocol` 和 `contract` 描述通信方式与输入输出约束，协议特有信息放在 `extend` 中。具体监听地址和端口属于部署环境，由 Runtime 描述，不写进 Atom。

### 3.2 静态结构和运行时分离

系统的设计结构、环境映射与实际发生的事情不是同一种信息：

```text
Static：系统应该由什么组成，彼此是什么关系
Runtime：这些 Atom 在某个环境中运行产生了什么结果，如何连接和观测
```

这里的 Runtime 是一份**环境映射**。同一套 Atom 和 Edge 可以分别映射到开发、预发和生产环境.

一份精简的 Runtime Schema 大致如下：

```yaml
runtime:
  dev:
    description: 本地开发环境
    endpoints:
      - id: checkout-web
        channel: network
        protocol: http
        address: http://localhost:3000
      - id: order-service
        channel: network
        protocol: http
        address: http://localhost:8080
      - id: order-db
        channel: network
        protocol: pgwire
        address: postgres://localhost:5432/orders

    telemetry:
      - id: order-service
        backend: otel
        address: http://localhost:4317

    tests:
      - id: create-order-flow
        atoms: [checkout-web, order-service, order-db]
        case: ./tests/create-order-flow.md
```

Runtime 主要描述三类信息：

- `endpoints`：每个 Atom 在当前环境中的连接地址。
- `telemetry`：从哪里观测日志、指标和链路。
- `tests`：这个环境可以执行哪些系统级验证。

Runtime 不负责启动或部署 Atom，只描述已经存在的环境如何接入 Corazon Engineer。具体服务由原有研发和部署体系负责拉起，Corazon Engineer 根据 Runtime 去连接、观察和验证它们。

### 3.3 读直连，改走 AI

人查看系统时，界面应该直接读取真实的结构和运行数据，不需要让 AI 转述一遍。

但当人要修改系统时，不再直接编辑 Schema，而是先向 AI 表达意图：

```
                    ┌──────────────────────────────────────────────┐
                    │                  web(前端)                    │
                    └───────┬──────────────┬───────────────┬───────┘
                            │              │               │
                         读             改 / 对话          读
                            │              │               │
                            ▼              ▼               ▼

        ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
        │    static    │◄────────►│    ai 编排    │◄───────► │     log      │
        └──────────────┘   写 / 查 └──────┬───────┘   写 / 查 └──────────────┘
                                         │                          ▲
                                         │ 调用                      │
                                         ▼                          │ 实时写入日志
                                  ┌───────────────┐                 │
                                  │      CLI      │─────────────────┘
                                  │ 连外部端点/查源 │
                                  └───────────────┘
```

CLI 在调用外部端点和查询数据源的同时，会把日志实时写入 Log 库表。这里 AI 的价值不是代替查询接口，而是把人的意图翻译成受约束、可审批、可追踪的系统操作。

## 4. 结论与开放问题

这个原型阶段性验证了：在 Coding Agent 之上建立一个宏观工程层，至少在模型和交互上是可以成立的；Schema 不只能用来画图，也可以成为查询、操作和验证系统的基础。

但它还没有证明这套抽象能够覆盖真实工程，也没有证明维护这层 Schema 的收益一定高于成本。Engineering Agent 目前更像一个可以讨论和继续实验的答案，而不是一个已经确定的标准答案。

这也是我更希望在分享最后讨论的部分。Engineering Agent 是否正确还不确定，但背后的命题值得继续验证：

> **当 AI Coding 继续发展，人的关注点可能会从代码生成逐渐上移到系统结构、约束、运行结果和验证。我们是否需要为这一层设计新的工程工具？**

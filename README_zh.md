# Corazon Engineer

[English](README.md)

一个位于 Coding Agent 之上的 **Engineering Agent**。它用朴素的 schema 文件描述一个系统 —— 由什么组成、各部分怎么连接、在真实环境中怎么运行 —— 从而让一次变更能够在「单个代码仓库之上」被设计、构建、验证和运维。

## 它是什么

Coding Agent 让写代码变便宜了，但理解系统、约束一次变更、验证结果并没有同步变便宜。Corazon Engineer 把这部分收进一份小而可读的 schema：

- **Atom** —— 一个工程单元：服务、前端、数据库、后台任务、网关……
- **Edge** —— 两个 Atom 之间的连接。
- **Contract** —— 连接必须满足的接口契约（请求 / 响应形状的唯一事实来源）。
- **Runtime** —— 系统如何映射到一个真实环境：地址、遥测、测试。

Agent 读写这份 schema，并通过 shell 触达运行中的资源。Atom *内部*的代码仍然是 Coding Agent 的职责 —— Corazon Engineer 不接管单个项目怎么写。

## 怎么用

**使用工具。** 到 [Releases 页面](https://github.com/sien75/Corazon-Engineer/releases) 下载对应 OS/arch 的 tar 包 —— v0.1.0 的 macOS arm64 包是 [`corazon-v0.1.0-darwin-arm64.tar.gz`](https://github.com/sien75/Corazon-Engineer/releases/download/v0.1.0/corazon-v0.1.0-darwin-arm64.tar.gz)。然后解包、装一次，在你想处理的项目的目录下运行 `corazon`：

```bash
tar xzf corazon-*.tar.gz && ./corazon-*/install.sh
corazon             # 前台启动全部服务（Ctrl-C 全部停止）
corazon status      # 查看当前目录各服务状态
```

打开它打印出的 web 地址（默认 web 7500 / ai 7501 / static 7502 / log 7503；端口被占用则顺延到下一个空闲端口），即可与 Agent 对话。当前工作目录**就是**项目 —— 可以是空目录，Agent 会把它初始化。所有数据都存在该目录下的 `.corazon/`。

**用它开发一个系统。** 项目按 [AGENTS.md](AGENTS.md) 里的工作流推进：

1. 读 [`devtime/README.md`](devtime/README.md) —— 需求与设计记录，然后构建启动。
2. 先契约，再 atoms/edges，再测试，最后才是代码。
3. 按 [`runtime/README.md`](runtime/README.md) 验证运行中的系统 —— E2E 测试与资源操作。

从源码运行本仓库：`devtime/deploy/dev/launch.sh`（见 `devtime/deploy/dev/BOOK.md`）。

## 目录

| 路径 | 内容 |
| --- | --- |
| `corazon.yaml` | 项目根标记（名称、版本、默认 runtime）。 |
| `atoms/` `edges/` `contracts/` | schema：单元、连接、接口契约。 |
| `workspace/` | 各 Atom 的源码。 |
| `runtime/` | 运行系统相关：`testing/`（E2E 测试）+ `operation/`（观测资源）。随产物发布。 |
| `devtime/` | 开发期相关：`development/` + `deploy/`。不随产物发布。 |
| `docs/` | 面向构建产物消费方的对外文档。 |
| `agents/` | 随工具发布的 AI 能力说明。 |
| `.corazon/` | 项目本地私有数据（数据库、日志、pid）。已 git-ignore。 |

## 文档

- [`agents/AGENTS.md`](agents/AGENTS.md) —— AI 能力说明：Agent 如何使用 Corazon、如何开发一个 Corazon-like 项目。
- [`agents/schema.md`](agents/schema.md) · [`agents/contract.md`](agents/contract.md) · [`agents/enum.md`](agents/enum.md) —— schema、契约与枚举参考。
- [`docs/`](docs/) —— 各服务用法参考。
- [`notes/`](notes/) —— 随手笔记。

## 许可证

Apache License 2.0 —— 见 [LICENSE](LICENSE)。

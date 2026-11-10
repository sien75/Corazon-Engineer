# Engineer Task System

## 1. 核心概念

### Task Type

定义“一类任务是什么”。

例如：

- Chat
- Graph
- Development
- How-to
- 查看支付服务日志
- 发布 Dev 环境
- 查询订单

Task Type 可以包含：

- 任务名称与描述
- 初始 Prompt / 上下文
- 可调用能力
- 执行方式
- 可视化方式
- 参数定义

Task Type 有三种来源：

- **Built-in**：系统内置，不可删除
- **Custom**：用户主动创建或确认保存
- **Suggested**：系统自动发现，尚未被用户正式接受

---

### Task Instance

Task Type 的一次实际执行实例。

例如：

```text
Task Type: 查看服务日志

Task Instance 1:
payment-service / dev

Task Instance 2:
user-service / prod
```

每个 Task Instance 保存自己的：

- 对话 Session
- 参数
- 执行状态
- 结果
- 可视化状态

同一种 Task Type 可以同时存在多个 Task Instance。

---

## 2. 前端表现

Tab 只是 Task Instance 的前端表现形式。

```text
[ Graph ][ Payment Logs ][ Chat ][ + ]
```

每个 Tab 对应一个 Task Instance。

点击 `+` 进入 Task Launcher，用于创建新的 Task Instance。

---

## 3. Task Launcher

当没有打开任何 Task，或用户点击 `+` 时，展示 Task Launcher。

分为三部分：

### Built-in

系统内置的基础 Task：

```text
Chat
Graph
Development
How-to
```

### My Tasks

用户已经保存的自定义 Task：

```text
查看支付日志
发布 Dev
查询订单
```

### Suggested

系统根据用户历史行为自动发现的候选 Task：

```text
查看登录失败日志
检查版本状态
```

Suggested Task 可以直接执行，也可以由用户确认加入 My Tasks。

---

## 4. 创建 Task

创建 Task 本身也是 AI 的一个能力。

用户可以直接通过对话描述：

> 帮我增加一个 Task，用来查看 dev 环境 payment-service 最近 30 分钟的错误日志。

AI 将其整理成 Task Type，并保存到本地 SQLite。

Task 可以基于：

- 文本 / Prompt
- Shell 命令
- 代码
- 二进制程序
- HTTP 请求
- 多种能力组合
- 请求 + 可视化

具体 Task Schema 后续再扩展。

---

## 5. 自动发现

系统可以在 Session 结束或定期分析用户行为。

流程：

```text
Task / Session 历史
        ↓
总结实际完成的工作
        ↓
识别重复操作模式
        ↓
生成 Suggested Task
        ↓
用户确认
        ↓
加入 My Tasks
```

目标是让 Engineer 随着使用逐渐形成用户自己的常用任务集合。

---

## 6. 整体关系

```text
Task Type
    ↓ 创建
Task Instance
    ↓
Session / Execution / Visualization

前端：
Task Instance → Tab
```

核心原则：

> **Task 是产品能力模型，Tab 只是 Task Instance 的 UI 表现形式。**

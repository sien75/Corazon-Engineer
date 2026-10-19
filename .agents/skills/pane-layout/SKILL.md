---
name: pane-layout
description: 让 main 用 current-tab-list / tab-layout-mutation 把某个 tab 拆成多个 pane（每个 pane 装一个 agent）
---

把一张 tab 拆成多个 pane —— 屏幕上并排看多个 agent，而不是只在对话里描述。

**这是 main 的事**（外壳里那段对话）。blueprint 页面里的 agent 没有工作区工具：开、关、拆、删 tab 都做不了，让它去找 main。

## 工具

- `current-tab-list` —— 当前开着的 tab（按显示顺序）：标题、pane 数、最近活动时间。
- `tab-layout-mutation { tabId, ops }` —— 给 tab 加一格或删一格。
- `tab-new { blueprint }` —— 造一个新 agent 并放进新 tab（session id 由它分配）。
- `current-tab-mutation { ops: [{ op: on|off, tabIds }] }` —— 开关 tab；关掉的 tab 记录还在，重开是同一条。
- `tab-delete { tabId }` —— 连 tab 带它装着的对话一起删，不可逆。

## 先看一眼，涉及 paneId 的时候

`tab-layout-mutation` 的锚点是一个 **paneId**，它只能从 `current-tab-list` / 上一次工具结果里拿到。编一个一定会失败——工具会报错并列出这张 tab 真正有哪些 pane。

树本身**不用你写**：结构由「往哪一个 pane 的哪一边加」推出来。

## 怎么加一格

```yaml
tab-layout-mutation:
  tabId: t_1a2b3c
  ops:
    - { op: add, nextTo: p_1a2b3c4d, side: right, blueprint: project }
```

`side` 是 `left | right | top | bottom`，就是"加在 `nextTo` 那格的哪一边"：

- `left/right` → 和它**并排**；`top/bottom` → 和它**上下摞**。
- 如果这一边和它周围的排法冲突（比如在左右排的 tab 里要 `bottom`），工具会自动把 `nextTo` 那格和新格一起装进一个新容器 —— 你不用管。
- 想要更大份额就带 `flex: "2 1 0"`；不写就是均分。

## 怎么删一格

```yaml
tab-layout-mutation:
  tabId: t_1a2b3c
  ops:
    - { op: delete, paneId: p_9f8e7d6c }
```

- 一个容器只剩一格时自动塌陷，不会留下空壳。
- **至少留一格**：删到最后一格会整条拒绝，那就该 `tab-delete`。
- 删 pane **不删对话**：那个会话还属于这个 tab，只是暂时不显示。真要删对话，删整个 tab。

## 关于会话

- 一个会话只属于一个 tab，永不变更。所以**不能**把已有会话塞进另一个 tab —— 新 tab 永远意味着新 agent。
- 想再看某个已有对话：`current-tab-mutation { op: on, tabIds: [t_xxx] }` 把那个 tab 开回来。

## 典型配方

**新开一张 tab，再拆成 2:1**

```yaml
tab-new: { blueprint: project }         # → tabId: t_1a2b3c，一格里一个 agent
```

```yaml
tab-layout-mutation:
  tabId: t_1a2b3c
  ops:
    - { op: add, nextTo: p_1a2b3c4d, side: right, blueprint: pure-chat, flex: "1 1 0" }
```

**把一格关掉**：`{ op: delete, paneId: p_... }`。

**整张 tab 收起来**：`current-tab-mutation { ops: [{ op: off, tabIds: [t_1a2b3c] }] }` —— 记录还在。

**删掉**：`tab-delete { tabId: t_1a2b3c }` —— 不可逆。

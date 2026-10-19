---
name: pane-layout
description: 让 main 用 tab-list / tab-mutation 把某个 tab 拆成多个 pane（每个 pane 装一个 agent）
---

把一张 tab 拆成多个 pane —— 屏幕上并排看多个 agent，而不是只在对话里描述。

**这是 main 的事**（外壳里那段对话）。blueprint 页面里的 agent 没有工作区工具：开、关、拆、删 tab 都做不了，让它去找 main。

## 工具

- `tab-list` —— 看当前开着的 tab、每张 tab 的 pane 树（`paneId` / `contentId` / `flex`），以及已关闭但记录还在的 tab。
- `tab-mutation { tabId, layout }` —— 用一棵树替换那张 tab。
- `tab-on { blueprint | sessionId }` —— 新开一张 tab（给 slug 就现开一个新 agent）。
- `tab-off { tabId }` —— 关掉，记录保留（还能再开）。
- `tab-delete { tabId }` —— 连 tab、它的对话记录和 agent 副本一起删。

## 先读，每次都要读

**只要事情涉及布局，先 `tab-list` 一次。**

不是"最好读一下"，是必须 —— 树是 **tab 级共享状态**：同一个 tab 下另一个 pane 里的 agent、或上一次对话，都可能已经改过它。而 `tab-mutation` 是**整树替换**：不读就写，会把你这轮没见过的 pane 一起抹掉。

## 树怎么写

```yaml
# 叶子：一个 pane 装一个 agent
pane:
  paneId: p_1a2b3c4d     # 这是哪一格 —— 工具发的句柄，见下
  contentId: s_9f8e7d6c  # 装哪个 agent：已有 agent 的会话 id
  # blueprint: project    # 或者不要 contentId，给一个 blueprint slug = 现开一个新 agent
  flex: "2 1 0"          # 它从父 split 拿多少（可选，见下）

# 分割
split:
  flexDirection: row     # CSS 的 flex-direction：row = 左右排，column = 上下排
  flex: "1 1 0"          # 可选
  children: [ … ]
```

- **只有一种 pane**：每格都是一个 agent。agent 的界面就是它 blueprint 的页面。
- **`flex` 就是 CSS 的 `flex` 简写**（`<grow> [<shrink>] [<basis>]`）。一律用占比：`flex: "2 1 0"` = 拿兄弟的两倍；不写 = 均分。固定尺寸（`flex: "0 0 320px"`）只在内容真的固定大小时才用。
- 一棵树最多 6 个 pane。

## paneId 和 contentId：两个句柄，都由工具发

| 你想要 | 怎么写 |
|---|---|
| **保留**某一格（它现在就在屏幕上） | 把 `tab-list` 读到的 `paneId` **原样传回** |
| 加一格**新的** | **省略 `paneId`** —— 工具会发一个，并放在结果里 |
| 保留某个 agent | 把它的 `contentId` 传回 |
| 现开一个**新** agent | 不给 `contentId`，给 `blueprint: <slug>` |

**`paneId` 是"这是哪一格"**：只要传回它，哪怕把这一格挪到树里别的位置，它还是同一格 —— 屏幕上那一格不会被重建，输入状态和滚动位置都还在。

**编一个 id 一定失败**：两个句柄都必须是工具发过的，工具会报错并列出真正有效的值。

## 典型配方

**新开一张 tab，再拆成 2:1**

```yaml
tab-on: { blueprint: project }          # → tabId: t_1a2b3c
```

```yaml
tab-mutation:
  tabId: t_1a2b3c
  layout:
    split:
      flexDirection: row
      children:
        - pane: { paneId: p_1a2b3c4d, contentId: s_9f8e7d6c, flex: "2 1 0" }
        - pane: { contentId: s_9f8e7d6c, flex: "1 1 0" }
```

第二格省略了 `paneId`，所以是新的一格（同一个 agent 看两次）。

**关掉一张 tab**：`tab-off { tabId }`。记录还在，之后 `tab-on { sessionId }` 能把它再打开。

**删掉**：`tab-delete { tabId }` —— 不可逆。

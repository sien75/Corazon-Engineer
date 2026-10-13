---
name: pane-layout
description: 用 layout 工具把 tab 拆成多个 pane（对话 / 页面并排）
---

把当前 tab 拆成多个 pane —— 屏幕上并排显示多个内容，而不是只在对话里描述。

一个 tab 可以装**多段对话**，同一段对话也可以同时挂在**多个 pane**上。这个工具操作的是**发出这次对话的那张 tab**。

## 工具:一个动作 + 一棵树

```
op: read              →  返回当前树
op: write, layout: …  →  用这棵树替换当前树
```

## 先读,每次都要读

**只要事情涉及布局、或要和别的 pane / 别的会话协作,先 `op=read` 一次。**

不是"最好读一下",是必须 —— **树是 tab 级的共享状态,同一个 tab 下另一个 pane 里的对话也能改它。** 你手上那份可能是几分钟前别的会话写下的,而 `op=write` 是**整树替换**:不读就写,会把你这轮没见过的 pane 一起抹掉。

## 树怎么写

```yaml
# 叶子:一个 pane 说三件事
pane:
  paneId: p_1a2b3c4d     # 这是哪一格 —— 工具发的句柄,见下
  contentType: chat      # 内容类型 chat | page
  contentId: s_9f8e7d6c  # 内容 id:会话 id(chat)/ blueprint 名(page);chat 可省略 = 新开一段对话
  flex: "2 1 0"          # 它从父 split 拿多少(可选,见下)

# 分割
split:
  flexDirection: row     # CSS 的 flex-direction:row = 左右排,column = 上下排
  flex: "1 1 0"          # 可选
  children: [ … ]
```

- **`flexDirection` 就是 CSS 那个**：`row` 左右排，`column` 上下排。
- **`flex` 就是 CSS 的 `flex` 简写**（`<grow> [<shrink>] [<basis>]`）。**一律用占比**：`flex: "2 1 0"` = 拿兄弟的两倍；不写 = 均分。固定尺寸（`flex: "0 0 320px"`）只在内容真的是固定大小时才用，很少。
- 一棵树最多 6 个 pane。

## paneId 和 contentId:两个句柄,都由工具发

| 你想要 | 怎么写 |
|---|---|
| **保留**某一格（它现在就在屏幕上） | 把读到的 `paneId` **原样传回** |
| 加一格**新的** | **省略 `paneId`** —— 工具会发一个，并放在结果里 |
| 保留某段对话 | 把它的 `contentId` 传回 |
| 开一段**新**对话 | chat 叶子的 `contentId` **省略** |

**`paneId` 是"这是哪一格"**：只要传回它，**哪怕你把这一格挪到树里别的位置，它还是同一格** —— 屏幕上那一格不会被重建，用户打了一半的草稿、滚动位置、正在流的那段回复都还在。

**编一个 id 一定失败**：工具会报错，并列出这个 tab 里真正有效的句柄。

## 典型配方

```yaml
# 两栏:保留左格,右边加一个页面
{ split: { flexDirection: row, children: [ {pane: {paneId: <读到的>}},
                                           {pane: {contentType: page, contentId: a}} ] } }

# 主次:左边宽(占比 2 : 1)
{ split: { flexDirection: row, children: [ {pane: {paneId: <读到的>, flex: "2 1 0"}},
                                           {pane: {contentType: page, contentId: a}} ] } }

# 三栏
{ split: { flexDirection: row, children: [ {pane: {contentType: page, contentId: a}},
                                           {pane: {contentType: page, contentId: b}},
                                           {pane: {contentType: page, contentId: c}} ] } }

# 2 × 2
{ split: { flexDirection: row, children: [
  { split: { flexDirection: column, children: [ {pane: {contentType: page, contentId: a}},
                                                {pane: {contentType: page, contentId: b}} ] } },
  { split: { flexDirection: column, children: [ {pane: {contentType: page, contentId: c}},
                                                {pane: {contentType: page, contentId: d}} ] } } ] } }

# 上 3 普通 + 下 1 矮条(固定 132px 的状态条)
{ split: { flexDirection: column, children: [
  { split: { flexDirection: row, children: [ {pane: {contentType: page, contentId: a}},
                                             {pane: {contentType: page, contentId: b}},
                                             {pane: {contentType: page, contentId: c}} ] } },
  { pane: {contentType: page, contentId: summary, flex: "0 0 132px"} } ] } }

# 同一段对话看两遍(左右两格同会话,内容同步)
{ split: { flexDirection: row, children: [
  {pane: {contentType: chat, contentId: <同一会话 id>}},
  {pane: {contentType: chat, contentId: <同一会话 id>}} ] } }
```

## 什么时候用

信息真的要**并排看**的时候:两件事对照、把 blueprint 放在谈它的对话旁边、一行详情下面挂一条状态。

不要拿它当装饰。默认就是单窗;只为"看起来丰富"而拆,是在牺牲可读性。

## 权限

- 改布局**只能通过这个工具**,没有拖拽或其他手动入口。
- 关掉 tab 不会删除它的布局记录 —— launcher 的 recent 就是靠它把关掉的工作区找回来。
- 界面显示的是**工具存下的那棵树**(不是你以为自己写下的那棵)。写入被拒时界面不变。

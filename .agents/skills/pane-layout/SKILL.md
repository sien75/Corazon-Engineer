---
name: pane-layout
description: 用 layout 工具把 tab 拆成多个 pane（对话 / 页面并排）
---

把当前 tab 拆成多个 pane —— 屏幕上并排显示多个内容，而不是只在对话里描述。

一个 tab 可以装**多段对话**，同一段对话也可以同时挂在**多个 tab** 上；关联记在 tab 上，不在对话上。这个工具操作的是**发出这次对话的那张 tab**。

## 工具:一个动作 + 一棵树

```
op: read              →  返回当前 tab 的布局
op: write, layout: …  →  用这棵树替换当前布局
```

## 先读,每次都要读

**只要事情涉及布局、或要和别的 pane / 别的会话协作,先 `op=read` 一次。**

不是"最好读一下",是必须 —— **布局是 tab 级的共享状态,同一个 tab 下另一个 pane 里的对话也能改它。** 你手上那份可能是几分钟前别的会话写下的,而 `op=write` 是**整树替换**:不读就写,会把你这轮没见过的 pane 一起抹掉。

## 树怎么写

两种节点,递归:

```yaml
# 叶子
pane:
  content: chat          # chat | page
  id: <句柄,见下>        # chat 可省略(= 新开一段对话)
  size: fill             # fill(默认)| brief(矮窗,只能放在 row 里)

# 拆分
split: col               # col = 左右排;row = 上下排
weight: 1                # 同层相对比例,1..3,默认 1
children: [ ... ]
```

- `page` 的 `id` 是 blueprint 文件名(`.agents/blueprints/<id>/`)。
- 整棵树最多 6 个 pane。
- `brief` 是 132px 的矮条,用来放一句话级的状态 / 摘要,**只放在 `row` 里**。

## chat 的 id:工具发,你只能还

`id` **不是你要编的东西**,是工具发给你的**句柄**。

| 你想要 | 怎么写 |
|---|---|
| 这个 pane 开一段**新**对话 | **省略 id** —— 工具会开一个,并把 id 放在返回结果里 |
| 这个 pane **保留**现有的某段对话 | 把 `op=read`(或上一次 write 的结果)里那个 id **原样传回来** |
| 把当前正在进行的这段对话留在某一格 | 读回来那个 id 传回去 —— 省略就等于**把它丢掉换成新对话** |

**编一个 id 一定失败**:工具会报错,并列出这个 tab 里真正有效的 id。你没读到过的 id 都是无效的。

典型场景:想加一栏页面,但左边这段对话别动 —— 必须把左边那格的 id 传回去,否则它就变成新对话了。

## 典型配方

```yaml
# 两栏:保留当前对话,右边加一个页面
{ split: col, children: [ {pane: {content: chat, id: <读到的 id>}},
                          {pane: {content: page, id: a}} ] }

# 主次:左边宽
{ split: col, children: [ {pane: {content: chat, id: <id>}, weight: 2},
                          {pane: {content: page, id: a}} ] }

# 三栏
{ split: col, children: [ {pane: {content: page, id: a}},
                          {pane: {content: page, id: b}},
                          {pane: {content: page, id: c}} ] }

# 2 × 2
{ split: col, children: [
  { split: row, children: [ {pane: {content: page, id: a}}, {pane: {content: page, id: b}} ] },
  { split: row, children: [ {pane: {content: page, id: c}}, {pane: {content: page, id: d}} ] } ] }

# 上 3 普通 + 下 1 brief(brief 当状态条)
{ split: col, children: [
  { split: row, children: [ {pane: {content: page, id: a}},
                            {pane: {content: page, id: b}},
                            {pane: {content: page, id: c}} ] },
  { pane: {content: page, id: summary}, size: brief } ] }

# 左详情 + 右侧三条 brief
{ split: col, children: [
  { pane: {content: page, id: a} },
  { split: row, children: [ {pane: {content: page, id: b}, size: brief},
                            {pane: {content: page, id: c}, size: brief},
                            {pane: {content: page, id: d}, size: brief} ] } ] }
```

## 什么时候用

信息真的要**并排看**的时候:两件事对照、把 blueprint 放在谈它的对话旁边、一行详情下面挂一条状态。

不要拿它当装饰。默认就是单窗;只为"看起来丰富"而拆,是在牺牲可读性。

## 权限

- 改布局**只能通过这个工具**,没有拖拽或其他手动入口。
- 关掉 tab 不会删除它的布局记录 —— launcher 的 recent 就是靠它把关掉的工作区找回来。
- 界面显示的是**工具存下的那棵树**(不是你以为自己写下的那棵)。写入被拒时界面不变。

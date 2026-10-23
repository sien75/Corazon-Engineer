# ask_user 卡片：刷新后丢卡 + 内容贴边

## 需求

两件都在 `<engineer-chat>` 的提问卡（`ask_user`）上：

1. **刷新后提问卡就没了**：「你提的问题，我一刷新页面就没了是吧，这个好保留吗」。
   刷新后卡要回来（已答过的不能再点）。
2. **卡里没内边距，内容顶着边框**：「样式问题主要是没 padding，导致内容和边框里的太近」。

这是一次重做：早先的同一份改动被整体撤销过（连设计记录一起），所以这里重新登记。
接管在跑那一轮的事另有一份：`2610-50-中途挂载接管在跑的那一轮.md`。

## 现状（实测）

**丢卡**。`workspace/web/components/chat.js` 回放 log 时，tool call 分支是

```js
} else if (b.type === "toolCall" && b.name !== "ask_user") {
  toolBlocks.set(b.id, toolChip(b.name, b.arguments));
}
```

`ask_user` 被显式排除 —— 卡不画，**问题文字也不留**（既不是气泡也不是芯片）。刷新后
活下来的只有助手正文和用户回答。

数据没丢：本会话 log 里两次提问的 `raw.content[0]` 都是
`{type: toolCall, name: ask_user, arguments: {text, options}}`，回放有料可画。

**贴边**。`.ai-msg { padding: 0 }`（用户气泡共用），`.ai-question` 只补了
background / border，没补自己的 padding。浏览器实测：`getComputedStyle(card).padding === "0px"`，
问题文字与边框间距 0（早先 ego-browser 截图 round-02：短问题卡 99px 宽，文字直接贴着紫边框）。

顺带量到但**本轮不修**：卡片宽度跟着内容缩（短问题 99px；自由输入卡 204px、输入框 151px）。

## 方案

**A. 回放画卡**（`chat.js`）

`questionCard(args, settled)`：`settled` 为真时在卡上加 `settled` 类并调用现成的
`close()`（把行内 `button` / `input` 全置 `disabled`）。回放分支改为：

```js
} else if (b.type === "toolCall") {
  if (b.name === "ask_user") questionCard(b.arguments, true);
  else toolBlocks.set(b.id, toolChip(b.name, b.arguments));
}
```

卡按消息顺序画在原位：助手正文之后、用户回答之前，读起来是「问题 → 回答」。
live 路径（`tool_execution_start`）不动，仍画可点的卡。

**B. 内边距**（`chat.css`）

```css
.ai-question { padding: 10px 12px; }
```

只加在 `.ai-question` 上，**不碰 `.ai-msg`** —— 那条规则用户气泡共用，加了会把所有气泡撑开。
选项卡与简答卡是同一张卡，一起受益。

契约 / atoms / edges 都不动：web 的接口没变，这是组件内部行为 + 样式。

## 验收

新增 `development/testing/dev/case-core-web-question-card`（端口 **9074**，脚本化 ai + log，
`/components/` 原样服务 `workspace/web`）：`/log/session/messages` 回一段造好的历史
（带 options 的提问 → 回答 → 不带的提问 → 回答），`/ai/resume` 回 `active: false`。
浏览器打开页面断言：

1. 两张卡都画出来了，问题文字与记录一致，选项按钮在；
2. 卡 `padding` 是 `10px 12px`，问题文字左/上内缩 ≥ 10px；
3. 卡里所有 `button` / `input` 都 `disabled`；
4. 再刷新一次，卡还在、仍不可点。

用例在修复前必须失败（回放不出卡 / padding 为 0），修完通过。回归：
`core-web-reattach-run`（同一段挂载路径）与 `core-web-chat-composer`。

## 遗留

- 卡宽跟随内容（短问题很窄、自由输入框偏窄）未改，本轮只要内边距。
- 改动在 `workspace/web`，`serve-web` 直接服务该目录，刷新即生效，无需重新打包。

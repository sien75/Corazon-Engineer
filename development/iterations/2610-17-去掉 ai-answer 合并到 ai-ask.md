# 去掉 ai-answer，回复并入 ai-ask

## 需求

`ask_user` 工具问出的问题，用户的回答今天走独立的 `POST /ai/answer`。这个接口没有独立语义：
`Registry.answer(sess, text)` 就是 `ask(sess, [{type:"text", text}])`，当一条普通 user 文本喂回去。
去掉 `/ai/answer`，回复统一走 `POST /ai/ask`。

## 现状

- `/ai/answer`（`workspace/ai/src/server.ts:164`）只吃一个 `answer: string`，转 `registry.answer()`。
- `Registry.answer()`（`registry.ts:664-667`）就是 `this.ask(sess, [{ type: "text", text }])`，
  代码注释写明：单独留这条路是给以后放权限/审批逻辑当接缝。
- 前端只用一处：`workspace/web/app.js:1638 aiAnswer()` 发 `/ai/answer`。
- `/ai/answer` **不在** `contracts/`、也不在 `atoms/ai.yaml` 的 interfaces 里。
- 顺带发现的既存漂移：`contracts/ai-ask.yaml` 写的是 `prompt: string`，而 `server.ts` 实际读
  `blocks`（text / image 数组），`development/testing/dev/case-core-ai-flow` 也一直用 blocks。
  契约与实现不符。

## 决策

1. **直接删掉 `/ai/answer`，不做兼容别名**。今天唯一调用方是同仓前端，且它未进契约，
   没有外部兼容负担；留别名反而把"无独立语义的接缝"固化下来。
2. **回复就是一次普通 ask**：`{ id, blocks: [{ type: text, text: <reply> }] }`。
   选项按钮传 `value`、自由输入传文本，形态不变。
3. **顺手把 `ai-ask` 契约修正为 `blocks`**（与实现、与用例一致）。这是本次改动的前置：
   合并后"回复"必须在契约里有位置，而现状契约描述的是一个代码根本不读的字段。
4. **`ask_user` 工具本身不动**：它不需要改，回答方式变了不影响它 `terminate` 的语义。
5. 权限/审批逻辑将来仍可挂在 `/ai/ask` 上（`ask()` 是所有输入的汇聚点），接缝没有丢。

## 范围外

- 不动 `ask_user` 工具、不动 SSE 事件形态。
- 不改 `/ai/ask` 对 blocks 的校验逻辑（只是把契约补成它本来的样子）。
- 不动 `dist/`（构建产物）。

## 方案

- `workspace/ai/src/server.ts`：删掉 `case "/ai/answer"` 整段。
- `workspace/ai/src/registry.ts`：删 `answer()` 方法；改 `ask_user` 上方注释里对 `/ai/answer` 的引用。
- `workspace/web/app.js`：`aiAnswer(answer)` 改发 `/ai/ask`，
  body 为 `{ id, blocks: [{ type: "text", text: answer }] }`。
- `contracts/ai-ask.yaml`：请求体由 `prompt` 改为 `blocks`（text / image），错误描述改为 blocks；
  `docs/ai.md` 的 ai-ask 段同步。
- `development/testing/dev/case-core-ai-flow/TEST.md`：4b 段用 `/ai/ask` 回答，
  空回答的断言由 "空 answer 400" 改为 "空 blocks 400"。

## 验收

- `/ai/answer` 返回 404 `not_found`（unknown endpoint）。
- 通过 `/ai/ask` 发一条 text block，行为与旧 `/ai/answer` 一致：新 run、user 消息即该文本、`agent_settled`。
- `ask_user` 问题卡片（选项 / 自由输入）点答后仍能继续对话（前端改走 `/ai/ask`）。
- `case-core-ai-flow` 通过；`static/validate` 通过。

## 实施记录（Phase 3）

- **代码**：
  - `server.ts`：删 `case "/ai/answer"`。
  - `registry.ts`：删 `answer()`；`ask_user` 上方注释改为「回答走 /ai/ask 这条唯一输入路径」。
  - `web/app.js:1638 aiAnswer()`：改发 `/ai/ask`，body `{id, blocks:[{type:text,text:answer}]}`。
  - `contracts/ai-ask.yaml` + `docs/ai.md`：请求体由 `prompt` 修正为 `blocks`（text/image）——这是既存漂移，
    合并后回复必须在契约里有位置，故一并修正。
  - `development/testing/dev/case-core-ai-flow/TEST.md` 4b：改用 `/ai/ask` 回答；新增断言
    `/ai/answer` 返回 404、空 `blocks` 返回 400。
- **实跑**（dev 栈 8501/8503，`launch.sh` 重启加载新代码）：
  - `POST /ai/answer` → **404 `not_found` / unknown endpoint**。
  - `POST /ai/ask` 空 `blocks` → **400 `bad_request` / "blocks required"**。
  - `POST /ai/ask` text block → 200，`log/session-detail`：user 文本 + assistant `pong`。
  - `ask_user` 全链路：模型发出 `toolCall ask_user {text:"请选择 A 还是 B？", options:[A,B]}` 并结束该 run；
    用 `/ai/ask` text block `A` 回答 → 新 run user 消息为 `A`，assistant 继续对话。
- **静态**：`bun run tsc --noEmit` 通过；`node --check workspace/web/app.js` 通过；
  `POST static/validate` → `ok: true`（`contracts/ai-ask.yaml` 已生效）。
- **测试记录**：已写入 log（`kind: test`，`case: core-ai-flow / 4b`）。
- **未做**：`dist/` 构建产物、`ask_user` 工具、SSE 事件形态均未动。

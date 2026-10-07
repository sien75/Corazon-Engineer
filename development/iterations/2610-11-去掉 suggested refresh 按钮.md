# 去掉 suggested refresh 按钮

## 需求

新建页 `Suggested` 分区标题右边的 `refresh` 按钮去掉。**功能保留**——自动发现
（攒够 10 条 run 自动扫描）与手动触发端点都不动，只是页面上不再有这个入口。

## 现状

- 按钮：`workspace/web/app.js:1957`
  `<h3>suggested <button type="button" class="skill-refresh" data-action="refresh">refresh</button></h3>`
- 点击分支：`workspace/web/app.js:2064`
  `else if (action === "refresh") newTabSend("/ai/skill/refresh", {})`
- 样式：`workspace/web/style.css:563-579` 的 `.skill-refresh` / `.skill-refresh:hover`
- 端点：`POST /ai/skill/refresh`（`contracts/ai-skill-refresh.yaml`，
  `atoms/ai.yaml` provides，`workspace/ai/src/server.ts:303`）—— 手动触发一次
  suggested 扫描，越过 10 条阈值扫当前积压的 run，返回 `{triggered, scanned}`。
- 自动发现：`workspace/ai/src/registry.ts` 的 `append()` 钩子 + 队列阈值，
  **与按钮无关**。

按钮的实际价值只有调试 / 演示（正常路径攒够 10 条会自己跑）和测试断言，
不是用户正常流程的一部分。

## 方案

### 删（前端）

- `app.js:1957`：`<h3>` 只留 `suggested`。
- `app.js:2064`：删掉 `refresh` 分支（按钮没了，该分支成为死代码）。
- `style.css`：删 `.skill-refresh` 与 `.skill-refresh:hover` 两条规则。

⚠️ `app.js:217` 的 `function refresh()` 是 **schema 刷新**（`loadSchema` +
重画左侧视图 + SSE 推送触发），与这个按钮同名不同物，**不动**。

### 删（静态关系）

按钮是 web 调用该端点的**唯一**地方，删掉后 web 不再消费它，所以「web → ai」
这条消费关系不成立，必须跟着删——否则 schema 里留着一条不存在的边：

- `atoms/web.yaml`：`consumes` 里的 `ai-skill-refresh` 条目。
- `edges/web-to-ai.yaml`：`web-to-ai-skill-refresh`。

### 保留

- `contracts/ai-skill-refresh.yaml`：端点还在，契约不动。
- `atoms/ai.yaml` provides 的 `ai-skill-refresh`：ai 仍然提供这个接口。
- `docs/ai.md` §ai-skill-refresh：同上，文档不动。
- `workspace/ai/src/server.ts` / `registry.ts`：扫描逻辑与手动触发端点都不动。
- 自动发现（队列、10 条阈值、`append()` 钩子）：完全不动。

### 测试

两个相关用例**都不用改**：

- `case-core-skill-suggest`：用 `curl` 直接调 `/ai/skill/refresh`，不经过 UI；
  它用该端点断言「这批 run 已标记」（返回 `triggered: false, scanned: 0`），
  正好证明能力保留。
- `case-core-web-skill-tabs`：只断言 `#newtab h3` 首词依次为
  `built-in,my,suggested,recent`（`textContent.trim().split(" ")[0]`）；
  按钮去掉后 `suggested` 的 h3 内容就是 `suggested`，断言仍成立。

## 范围外

- 不改自动发现的触发条件 / 阈值 / 扫描实现。
- 不改 `ai-skill-refresh` 契约与端点（保留为内部能力，可从 `curl` 调用）。
- 不新增前端手动触发入口（含快捷键、命令面板命令）。
- 不重构 `Suggested` 分区布局。

## 验收

- 新建页 `Suggested` 的 `<h3>` 文本是 `suggested`（小写、无按钮、无尾随空格）。
- `#newtab` 内不存在 `.skill-refresh` 节点，也不存在 `[data-action="refresh"]`。
- `newTabClick` 无 `refresh` 分支；`app.js` 仍有 schema 刷新的 `refresh()`。
- `POST /ai/skill/refresh` 仍然可用（`case-core-skill-suggest` 通过）。
- 静态校验通过：`edges/` 无 `web-to-ai-skill-refresh`，`atoms/web.yaml` 无
  `ai-skill-refresh` 消费项，`atoms/ai.yaml` 仍 provide 它。

## 影响面

`workspace/web/app.js`、`workspace/web/style.css`、`atoms/web.yaml`、
`edges/web-to-ai.yaml`。无新增用例；`case-core-web-skill-tabs` 增一条断言
（`suggested` 标题无 refresh 按钮）。

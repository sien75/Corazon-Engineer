# 网页搜索：一个工具，若干 provider，key 来自 pi

## 需求

「websearch 这个，可能有多个 provider，先把 deepseek 加上。复用 ds 的对话 key，这个 key 应该在 pi 的配置里。」

即：给 Agent 一个 `web_search` 工具，外面套一层 provider，第一家是 DeepSeek 的
`POST https://api.deepseek.com/v1/tools/search`（与对话同一套 Bearer 鉴权，所以同一个
`sk-…`），key 从 pi 自己的配置读，项目里不新增任何凭据。

范围外：Fetch 接口（`/v1/tools/fetch`，抓正文）、其他 provider 的接入、搜索结果的页面渲染
（结果就是文本，markdown 列表已经能画）、用量/计费统计。

## 现状（实测）

- **接口可用**：用 `~/.pi/agent/auth.json` 里 `deepseek` 的 key 直接打了一次
  `POST /v1/tools/search {"query":"DeepSeek 搜索 API","count":2}` → 200，返回
  `results[]`，字段 `title / url / snippet / summary / content / site_name / site_icon /
  date / authority / rerank_score`。`summary` 约 600～800 字，适合给模型读；
  `need_content` 默认 false 时 `content` 为空。
- **key 在 pi 的配置里**：`~/.pi/agent/auth.json` → `{ "deepseek": { "type": "api_key",
  "key": "sk-…" } }`。pi 导出 `readStoredCredential(providerId, getAuthPath())`（同步、
  只读、不解析 `$ENV` 之外的东西）和 `getAuthPath()` / `getAgentDir()`，ai 服务已经在用
  `getAgentDir()`。provider 也可能靠环境变量（`DEEPSEEK_API_KEY`），所以两条都认。
- **工具的形状已经定好了**：`workspace/ai/src/model.ts` 那套 —— 一个文件一个
  `makeXxxTool(deps)`，`defineTool` + `ok()/fail()`，在 `registry.ts` 的 `tools`（按名字
  放行，557 行附近）和 `customTools`（对象本身）两处登记。没有对外 HTTP 接口，所以
  **不新增 contract**；但对模型的可见面变了，`atoms/ai.yaml` 的描述和它的镜像
  `docs/ai.md` 要跟着改。
- **页面不用动**：工具结果在 `chat.js` 里当文本画（实时走 `tool_execution_update`
  的 partialResult，回放走 `toolResult` 的 text 块），markdown 列表直接就能看。

## 方案

新增 `workspace/ai/src/search.ts`：

```ts
export function makeWebSearchTool(deps: WebSearchDeps)   // deps: fetch?, keyFor?
```

- **provider 表**：`PROVIDERS = { deepseek: { label, env, search() } }`。加第二家 =
  往表里加一项，工具面（名字、参数、渲染）不变。工具参数里的 `provider` 是可选字符串，
  缺省 `deepseek`；给一个不认识的 provider 就 `fail` 并列出可用的，不静默回退。
- **参数**：`query`（必填，1～128 字符）、`count`（1～50，缺省 8）、`provider`、
  `question`（可选的原始问题，映射 `ori_question`，帮助理解意图）。`need_content`
  一律 false：正文几百 KB，不该进上下文。
- **key 解析**：`DEEPSEEK_API_KEY` → `readStoredCredential(provider, getAuthPath())`
  的 `api_key`（值形如 `$XXX` 时再解一次环境变量）。都拿不到就 `fail`，话说到位：
  在 pi 里给这个 provider 配上 key，或导出 `DEEPSEEK_API_KEY`。
- **结果**：文本是一段 markdown 列表（序号 + 标题 + URL + 站点/日期/权威分 + summary，
  每条 summary 截到 1200 字符），`details` 里放结构化的 `{ provider, query, count, results }`。
- **错误**：按文档的语义分开说 —— 401 key 缺失/无效、402 余额不足、429 触发 QPS、
  5xx 服务端错误；超时 25s。不自动重试（文档只说要等，模型可以自己再来一次）。
- **登记**：main 和 sub 都有（搜索是资料能力，两边的对话都可能要），
  `registry.ts` 的 `tools` 加 `"web_search"`，`customTools` 加
  `makeWebSearchTool({})`。

## 验证

新增 `development/testing/dev/case-core-ai-web-search/`：真服务、真模型、真的打一次
DeepSeek。三个断言点：

1. pi 里没配 deepseek 的 key 时（把 `HOME` 指到空目录并清掉 `DEEPSEEK_API_KEY`），
   工具调用**失败且说清原因**——不是静默空结果；
2. 配了 key 时，一次 ask 让 agent 搜一个词的当前信息，`/ai/stream` 里出现
   `web_search` 的 toolResult，且结果里有 `http` 链接；
3. 工具结果进了记录（`/log/session/messages` 里 `role: toolResult`，`raw.content`
   含搜索到的 URL），回放不炸。

## 后续（不在本轮）

- `web_fetch`（抓正文）：同一个 provider 表里加一个方法就行。
- 第二家 provider（Tavily / Bocha / Serper）：表里加一项，`env` 与 `search()` 各自写。
- 计费统计：文档说按次计费，若要观察，工具可以写一条 `telemetry` 记录。

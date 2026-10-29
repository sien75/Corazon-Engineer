# session 标题自动总结 + 按会话模型（新建指定 / 运行中切换持久化）

## 需求

两件事，一件一个目标：

1. **标题自动总结**：现在 session 的 title 是 blueprint 页面 `<title>`，一次写死。希望在第
   1 / 11 / 21 / … 轮对话时，用「用户提问 + AI 回答正文」（**只要回答正文**，不含工具调用与
   thinking）作为原始材料，问大模型要一个标题，写回 session 的 title。
2. **按会话模型（B 档）**：
   - `session-new` / `ai-new` 新建时可以指定这个 session 的模型（优先于 pi 的默认配置）；
   - session 内用 `model` 工具切换时，选择**持久化**——Engineer 的 ai 服务重启后仍然生效，
     且压过新建时指定的初始模型。

范围外：pi 的 `~/.pi/agent/settings.json`（永不改写）、provider 登录入口、标题的人工编辑、
标题生成的人侧配置（开关 / 语言 / 长度参数）、前端新控件。

## 现状（实测）

- `sessions` 表**已有** `title TEXT NOT NULL DEFAULT ''`（`workspace/log/internal/store/workspace.go:102`，
  老库有 `ALTER TABLE` 迁移），`log-session-upsert` 的语义是「传空串保留旧值，传新值覆盖」——
  所以写标题**不需要改表、不需要新端点**。
- title 只在 `registry.writeSession()` 写一次：`blueprintTitle()` 取页面 `<title>`，
  main 固定 `"main"`。全仓 `grep summary|rename|generateTitle` 只命中 compaction，**没有任何
  按轮次回写标题的逻辑**。
- `sessions` 表**没有** model 列；`ai-new` / `session-new` 没有 model 参数；
  `registry.build()` 明确不传 model（`registry.ts:410-415`，交给 pi 的 settings 解析）。
- `model` 工具调的是活着的 `agent.setModel()`（`src/model.ts`），改完即生效，但**不落任何地方**：
  不写 pi settings，不写 log record。ai 服务重启 / `session-delete` 后 resume 会重放历史重建，
  模型回到 build 时的解析结果。
- 事件侧无需改：`doRefreshWorkspace()` 每轮都从 `/log/list` 的 `title` 刷新 tab 名
  （`workspace/web/app.js:631-638`），标题一旦落到 log，下一次刷新就改名。
- main 的 tab 名是硬编码 `"main"`（`app.js:makeMainTab`），对它做标题总结在界面上不可见。

## 方案

### 1. 标题自动总结（新文件 `workspace/ai/src/title.ts`）

- **触发轮次**：用户轮次 `n` 满足 `(n - 1) % 10 === 0`，即 1 / 11 / 21 / …。
  `sess.turns` 在 build 时从历史里数 `role === "user"` 的记录得到，`ask()` 每收到一个用户轮次
  就 +1（插话 steering 也算一轮，它同样是一条 user 记录）。
- **只在 `kind === "sub"` 上做**：main 的 tab 名固定，做了也看不见。
- **时机**：`runTurn()` 结算之后（`finally` 里），此时本轮 AI 回答正文已经产生。生成**不挂在
  `sess.tail` 上**（那会挡住下一轮提问），是 detach 的后台任务，每个 session 一个 in-flight 标志。
- **材料**：先 `await drainRecords()`（`recorder.ts` 新增导出，等写入链排空），再
  `fetchRecords()` 取记录，按「上一触发点到本轮」的窗口（n-10 ~ n）过滤，只取
  - `role === "user"` 的 text 块；
  - `role === "assistant"` 的 **text 块**（`raw.content` 里 `type === "thinking"` /
    `"toolCall"` 一律跳过）；
  - `toolResult` / `compaction` / `model` 记录全跳过。
  拼好后超过 6000 字符就保留「头 2500 + 尾 3500」，中间用 `\n…\n` 连接——窗口本身已经限定在
  最近 10 轮，头尾截断只防止单轮答案特别长。
- **调模型**：复用**本会话当前的模型** `agent.model`，走
  `modelRuntime.completeSimple(model, { systemPrompt, messages: [{ role: "user", content: material, timestamp }] }, { maxTokens: 64 })`。
  直接打 provider，不进会话历史、不产生 record、不发 SSE 事件——它不是对话内容。
  stub 模式（无 agent / 无 runtime）直接跳过。
- **提示词**：system 里要求「用对话的主要语言，写一个不超过 20 个汉字 / 10 个英文单词的标题，
  只输出标题本身，不要引号、不要结尾标点、不要解释」。
- **清洗**：去掉成对的引号 / 反引号 / `#` 前缀，`\s+` 收敛成单空格，去掉结尾标点，超过 60 字截断。
  为空、或与当前标题相同，就不写。
- **写入**：`POST /log/session/upsert { sessionId, title }`（空传不影响旧值）。失败只打日志，
  不影响回合。

### 2. 按会话模型

**持久化载体 = 一条 record + sessions 行的一列**，两处一起写，读的时候以 record 为准：

- record：新角色 `model`，`payload = { seq, role: "model", content: "", raw: { role: "model",
  model: "provider/id", thinkingLevel, timestamp } }`。写在与消息同一条 record 流里（共用
  `recordSeq`），所以顺序自然是「切换发生在第几轮」。
- sessions 行：新列 `model TEXT NOT NULL DEFAULT ''`（老库 `ALTER TABLE` 迁移，和 title 同款），
  供 `/log/list`、`session-list` 展示，不必读 records。

**优先级（build 时）**：

1. 历史里最后一条 `role === "model"` 记录的 `raw.model`——运行中切换，重启后仍然生效；
2. 否则 sessions 行的 `model`——新建时指定的初始模型；
3. 否则不传，pi 按自己的 settings 解析。

第 1 项解析不到（模型下线 / provider 没凭据）时退到第 2 项，再不行退到 pi，并打一行警告；
`thinkingLevel` 同理一起恢复。

**改动点**：

- `ai-new` 请求体加 `model?`（`provider/model-id`），未知模型 400；`session-new` 工具加同名字段透传。
- `registry.new()` 把 model 传给 `writeSession()` → `log/session/upsert`；`build()` 接受一个
  `model` 参数并按上面的优先级解析后传给 `createAgentSession({ model, thinkingLevel })`；
  `resume()` 从历史里找最后一条 model 记录。
- `model` 工具 `set` 成功后：写一条 `model` record + `/log/session/upsert { model }`。
  记录写失败不影响切换本身（和会话记录一样是 fire-and-forget）。
- 回放**不能**把它喂给大模型：`toAgentMessage()` 里 `role === "model"` 返回 `undefined`；
  `sanitizeHistory()` / `toolCallsOf()` 只认 `assistant` / `toolResult`，天然不受影响。

## 契约（先于代码）

- `contracts/log-session-upsert.yaml`：请求 / 响应加 `model`。
- `contracts/log-session-kind.yaml`（`/log/session/detail`）：响应加 `model`。
- `contracts/log-list.yaml`：每行加 `model`。
- `contracts/ai-new.yaml`：请求加 `model`，错误里补「未知模型」。

## 静态关系

`atoms/ai.yaml` 的 description 里有两处断言要改：model 相关「nothing model-related is chosen,
passed or stored here」已经不成立；`model` 工具「writes nothing back」也不成立。
`atoms/log.yaml` 的 sessions 行要补 model。edges 不变。

## 测试

- 新用例 `development/testing/dev/case-core-ai-session-model/`：`ai/new` 带 model → `session/detail`
  有 model；`model` 工具 set 后 records 里出现 `role: model`；杀掉 ai 重启 resume 后
  `session/detail` 的 model 仍是切换后的那个。
- 标题：`case-core-ai-session-title/`：一个 sub session 问一轮 → 等 title 从页面 `<title>` 变成
  总结出来的标题（需要真模型，断言用「不等于初始标题且非空」）。
- 回归：`case-core-ai-session-tools`（session-new / close / open / delete）、
  `case-core-log-session`（upsert / detail 的旧字段语义）、`case-core-ai-flow`（基本问答）。

## 风险

- 标题生成是一次额外的模型调用：只在 1/11/21… 触发，且 detach，不挡对话；失败静默。
- `model` record 混在会话记录流里，最坏情况是老的读侧代码把它当成一条未知角色——`fetchRecords`
  原样返回，`toAgentMessage` 返回 undefined，已验证不会进上下文。

## 实施记录（实测）

按方案落地，过程中改了三处方案里没写的东西，都是跑用例时撞出来的：

### 1. `sanitizeHistory` 必须把 `model` 记录当透明

`model` 工具是在**正在跑的那一轮里**执行的，所以它的记录顺序天然是
`assistant(toolCall) → model → toolResult`。第一版实现让这条记录留在回放数组里，
`sanitizeHistory` 的配对窗口（assistant 之后连续的 `toolResult`）就被它打断：真的工具结果
被当成孤儿丢掉，再补一条 `[record lost]` 占位。证据是 ai 日志里冒出
`history repair s_…: filled=1 orphans=1`。

修法：去重阶段 `seq` 照收（丢写仍能被报出来），配对阶段直接跳过 `role === "model"` 的行。
用例里加了断言：重启 resume 之后 `grep -c 'history repair'` 必须是 0。

### 2. tab 名怎么到外壳：推送，不是轮询

第一版是 `app.js` 里 20 秒一次的名字轮询。实测下来这就是用户感觉到的「切得太慢」：
名字本身 3～5 秒就生成好了，但平均还要再等 10 秒才被看见。

改成推送，用这个系统已有的那条通道——**这一轮的流**：

- 服务端在 `agent_settled` 时不立刻关流，如果这一轮正是 1/11/21 轮（`sess.titling` 在事件
  发出**之前**就立起来），流就继续开着；
- 名字生成完 → 写会话行 → 发一个 `session_title` 事件（`title` 是当前名字，名字没变也发，
  客户端据此知道这一轮**真的**结束了）→ 流关；
- `chat.js` 收到它，往自己的 `document` 上派发 `engineer-title`；外壳在 `viewOf` 里给 iframe
  的 document 挂监听（同源），直接改 `tab.name` 并重绘——不发新请求，不等任何 tick；
- 标题调用带 15 秒超时（`TITLE_TIMEOUT_MS`）：流为它开着，provider 不回不能把页面挂着。

轮询退成 60 秒一次的兜底，只为另一个没有推送的场景：agent 改自己页面的 `<title>`
（以前压根不会更新）。

`contracts/ai-stream.yaml` 补了 `session_title` 这个非 pi 事件的形状与时机。

### 3. 用例里的多字段请求要写成一份 JSON

`curl -d a:1 -d b:2` 会用 `&` 拼起来，而 ai 说的是 YAML，`&` 直接是解析错误。新用例用
`--data-binary @file`（JSON）或 `--data-binary '{...}'`。

### 跑过的用例

| 用例 | 结果 |
| --- | --- |
| `case-core-ai-session-model`（新） | 通过：未知模型 400；`model` 落行；`model` 工具切换写记录并改行；重启 resume 后行与活 agent 的 current 都是切换后的模型；`history repair` 0 |
| `case-core-ai-session-title`（新） | 通过：`title0=Probe Page` → 第 1 轮后 `title1=列出 .agents/blueprints 下的蓝图目录`；记录里 `user: 1 / model: 0`，标题调用不留痕迹 |
| `case-core-ai-session-tools` | 通过：session-new / close / open 不变，新 session 的 `model: ""`，`session-list` 显示 `model pi default` |
| `case-core-log-session` | 通过：老库迁移后 `sessions` 多出 `model` 列；带 model 的 upsert 落库，不带时保留旧值；`/log/list` 每行有 `model` |
| `case-core-ai-flow` | 通过：new / ask / stream / resume / ask_user / delete 的既有断言与输出一致 |
| `case-core-web-tabs`（浏览器） | 通过：38 项检查全 PASS，含关闭 / Recent 重开 / eye / 刷新恢复 |

### 4. 纯函数检查抓到的两个真 bug

真跑一轮只能验到「第 1 轮」这一种窗口，所以把 `titleMaterial` / `cleanTitle` 当纯函数又过了一遍
（写进用例的第 0 段，不依赖模型）：

- **窗口没有右边界**：`titleMaterial` 只按 `from` 过滤，没有在 `turns` 处停。现状下触发时 `turns`
  就是最后一轮，碰不到；但只要有一次插话（steering）在该轮之后落库、而标题调用晚于它，材料里就会
  混进「未来的」提问。改成 `if (turn > turns) break;`。
- **`cleanTitle` 只剥一层引号**：`"标题"。` 先剥引号（末尾是句号，不匹配）再剥句号 → 留下一个孤零零
  的 `"`。改成对两端反复剥离直到稳定。
- 头尾截断溢出：`2500 + 3 + 3500 = 6003 > budget`，把分隔符算进预算。

### 跑过的用例（补充）

- 标题用例新增第 0 段：13 条纯函数断言（窗口左右边界、thinking / 工具结果 / `model` 记录不进材料、
  清洗规则、长度上限）全 PASS。
- 第 1 段改成「一边问一边存整条流」：实测 `agent_settled` 在流的第 9481 行、`session_title` 在
  9485 行，推下来的名字 `查看blueprints目录内容` 与随后读到的会话行一致——推送这条路真的通了。
- `case-core-ai-flow`、`case-core-web-reattach-run` 回归通过（关流时机与事件循环都动了）。

### 5. 生成标题的开销

命名不该是一次推理任务，而且这次调用是**带期限的**（这一轮的流为它开着），所以：

- **不要 thinking**：`reasoning` 一律不传。这一层的「关」就是不传——`minimal` 及以上都只会
  *增加* 预算，pi 的 `SimpleStreamOptions.reasoning` 也没有 `"off"` 这个值（`pi-agent-core`
  的 `ThinkingLevel` 里有，`pi-ai` 的没有，传了编译不过）。
- `maxTokens: 256`（原为 64）：答案上限压住思考空间——这对「不请求也照样思考」的模型不成立，
  见下。
- ~~`temperature: 0.2`~~（**已撤**）：同一段对话重算应该得到同一个名字，但这一个参数会让
  新模型（ZenMux 上的 `claude-haiku-5.5`、`claude-sonnet-5.5`）直接 400 拒绝——
  `` `temperature` is deprecated for this model ``。一次被拒的调用等于**没有名字**，比名字不
  可复现糟得多，所以这一项不传了（`TITLE_TEMPERATURE` 一并删掉）。代价是放弃「同一段对话
  重算得到同一个名字」，而标题本来就只算一次，不重算。
- `maxRetries: 1` + `signal: AbortSignal.timeout(15000)`：不排队重试，15 秒上限。

> 64 的由来与推翻：原话是「64 小到思考型模型也没余量在里面打转」。实测不成立——
> `deepseek-v4.1-flash` 即使没请求 `reasoning` 也在 thinking，64 个 token 全被思考吃掉，
> 回 `stop=length` 且文本为空；放宽到 256 就稳定出名字（`询问所用模型`）。标题本身只占几个
> token，剩下的就是留给「先想后答」的余量。

实测（`ENGINEER_AI_DEBUG` 打点，deepseek-flash）：从拿到模型到会话行写完 **543ms**，
`title1=查看blueprints下的蓝图目录`。也就是说 tab 改名的延迟现在基本只剩这一跳。

### 6. 标题的视角：用户做了什么，不是助手做了什么

第一次实测的反馈：问「你有哪些工具」，标题是 **「助手总结工具」**——视角反了，而且主语是助手；
用户要的是「询问有哪些工具」这种**动宾短语**，不带主语。

两处一起改：

- **提示词**：明说「标题站在用户这边，写用户做了什么，用动词开头，不写主语」，并且给好/坏例子
  （好：`询问有哪些工具` / `列出蓝图目录` / `排查登录失败`；坏：`助手总结工具` / `用户询问工具` /
  `AI 列出蓝图`）。模型对「错误但具体」的例子比对「要以用户为中心」这类抽象要求听话得多。
- **`cleanTitle` 兜底**：提示词总有失手的时候，所以标题开头的 `助手 / 用户 / 我 / AI / 模型`
  （连同「正在 / 在 / 的」）会被剥掉——错的视角比钝一点的动词更糟。

实测（真模型，三句话）：

| 用户问 | 标题 | 耗时 |
| --- | --- | --- |
| 你有哪些工具 | 询问有哪些工具 | 571ms |
| 帮我看一下 .agents/blueprints 下有哪些蓝图目录 | 列出蓝图目录 | 596ms |
| log 服务用的什么数据库 | 询问 log 服务用的数据库 | 750ms |

用例里钉住两条：第 0 段加 `cleanTitle` 剥主语的断言；第 1 段断言生成出来的标题**不以**
「助手 / AI / 模型 / 用户 / 我」开头。

## 还没做（留给 review 之后）

- Phase 4 人工 review 与提交（走 `my-server`）。

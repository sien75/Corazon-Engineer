# skill 与 blueprint 文本化:读归 static,写归 agent

## 需求

让 ai 服务保持最纯的能力:**会话 + 思考 + 自动发现**,不再承担"列/读/写杂活",也不再自带 sqlite。
skill 和 blueprint 一律当**项目文件**看:static 负责 list / read,写由 agent 在对话里直接改文件。

## 现状

- **ai 独占** `.engineer/skill.db`:`skill`(suggested 候选)、`skill_session`、`scan_pending`、
  `scan_state`;自定义 skill 已是文件 `.agents/skills/<slug>/SKILL.md`。
- **ai 提供** 6 个 skill 接口(save/delete/ignore/run/refresh/list)+ 3 个 blueprint 接口(list/save/delete);
  前端实际只用:list、run、delete、ignore、save(接受建议)。`/ai/skill/refresh` 是死的(按钮已在 2610-11 移除)。
- **ai 有两个自定义工具** `save_skill` / `save_blueprint`(加上 `ask_user`)。
- **static** 已有一张"类型 → 目录"表(`workspace/static/internal/schema/schema.go`):
  `ObjectTypes = [atom, edge, how-to, development, contract, docs, notes]`,`TypeDirs` 对应目录;
  `static-query` 按类型返回文件路径列表,`static-query-detail` 返回**单个文件**的正文。
- static 的两处限制:`safePath()` 拒绝任何点开头的路径段("dot-prefixed entries are not content");
  `contentType()` 只取第一个 `/` 前的段,两段目录 `.agents/skills` 匹配不上;
  `handleSchemaQueryDetail` 的类型白名单是硬编码的五个。
- static 的 watcher / `static-stream` 遍历 `TypeDirs` —— 扩表即自动获得变更推送。

## 决策

1. **三个新类型,并列 how-to / development / docs**:
   | 类型 | 目录 |
   |---|---|
   | `skills` | `.agents/skills` |
   | `suggested-skills` | `.engineer/suggested-skills` |
   | `blueprints` | `.agents/blueprints` |

   全部是**文件**,不新增 endpoint:沿用已有的 `static-query` / `static-query-detail`。
   `suggested-skills` 放 `.engineer`(不进 git;候选是 ai 的临时推断),`skills` / `blueprints` 放 `.agents`(项目资产)。
2. **写归 agent**:删掉 `save_skill` / `save_blueprint` 两个工具,ai 的自定义工具只剩 `ask_user`。
   agent 用内置 `write` / `edit` 直接落文件。
3. **约定进系统提示**:
   - **skill 不写说明**——自动发现是 ai 内部定时任务在跑,产物就是文件,用户在前端查看即可;
     agent 需要时读一眼现有 `SKILL.md` 就能照做。
   - **blueprint 要写说明**——它不是"发现-选择"模式,而是希望 agent 在对话中**主动**判断:
     某处适合图形化展示、或值得记下来下次复用,就生成一个蓝图(本质是写文件)。
     `agents/AGENTS.md`(及 `agents/zh/AGENTS_zh.md`)补一节,写清目录、`index.html` 入口、`<title>` 即名字。
4. **static 只读,不新增也不改接口,更不提供删除**:只是扩类型表,让两个已有只读接口认识新类型。
5. **删除/接受/忽略全部取消 UI,改由 ai 对话完成**:前端去掉 delete 按钮;用户对 agent 说一句,
   agent 改文件。ai 的 CRUD 写接口随之删掉。
6. **ai 零 sqlite**:候选落成文件;扫描直接读 log 现成的 conversation 记录,进度用一个 json 文件记;
   `.engineer/skill.db` 消失。
7. **行为不变的**:`/ai/skill/run`(从技能开一个会话)留在 ai——开会话是它的职责;
   `/ai/*` 会话接口、`ai-stream`、`ask_user` 都不动。

## 范围外

- 不改 static 的只读定位,不加写能力、不加删除。
- 不新增 static 接口、不改 `static-validate`。
- 不动 ai 的会话接口与 SSE 事件形态。
- 不动 log 服务的库。

## 方案

### static(Go)

- `schema.go`:`ObjectTypes` 加 `skill | suggested-skill | blueprint`;`TypeDirs` 加三个 `.agents/...` / `.engineer/...` 值。
- `safePath()`:**白名单按"登记过的类型目录"放行**,不是整个 `.agents` / `.engineer` 目录——
  `.engineer` 里还有 `engineer.db` / `skill.db` / `uploads/`,整目录放行等于能经 HTTP 读出数据库。
  实现:先确认 `id` 落在某个 `TypeDirs` 值之下,再允许其中的点段。
- `contentType()`:由"取第一段"改为"按 `TypeDirs` 值做最长前缀匹配"。
- `handleSchemaQueryDetail` 的硬编码类型白名单:改为从 `ObjectTypes` 派生。
- `handleSchemaQuery`:响应加三个键(与 `how-to` / `development` 同形,`[string]` 路径列表)。
- `ListEntries()` 不用改(它的 Walk 起点就是类型目录本身,`info.Name()` 不含 `.agents`,不会误跳)。

### contracts / docs

- `static-query.yaml`:补 `skills` / `suggested-skills` / `blueprints: [string]`。
- `static-query-detail.yaml`:类型枚举补三个,说明这三个类型返回 raw text。
- `docs/static.md`、`atoms/static.yaml` description 同步。

### agents/

- `agents/AGENTS.md` + `agents/zh/AGENTS_zh.md`:新增"蓝图"一节(何时主动生成、目录与入口、
  `<title>` 即名字);skill 不写小节。

### web

- `newTabList()` 的两处调用由 `/ai/skill/list` / `/ai/blueprint/list` 改为读 `static-query` 的对应键;
  名字/描述按需再调 `static-query-detail` 读每个 `SKILL.md` / `index.html`(`<title>`)。
- 去掉 skill / blueprint 的删除按钮与相关 send;`/ai/skill/run` 保留。

### ai(TS)

- `skill/store.ts`:删 sqlite;`suggested` 读写 `.engineer/suggested-skills/*.md`,
  scan 进度写 `.engineer/skill-scan.json`;扫描源改为 log 的 conversation 记录(现成接口)——
  注意这是唯一的真实取舍,原 `scan_pending` 缓存 run 文本就是为了不回读 log、不与其写入竞争,
  改后需接受最终一致 + 用状态文件记住扫到哪。
- `registry.ts`:删 `save_skill` / `save_blueprint` 工具与对应 store 依赖;`tools` 白名单去掉两者。
- `server.ts`:删 `/ai/skill/{save,delete,ignore,refresh}` 与 `/ai/blueprint/{list,save,delete}`;
  保留 `/ai/skill/run`。
- `atoms/ai.yaml`:description 重写(不再拥有 skill 机制与 sqlite);接口列表相应删减;
  `atoms/static.yaml` description 补"skills / blueprints 的只读视图"。
- `contracts/`:`ai-skill-{save,delete,ignore,refresh}.yaml`、`ai-blueprint-{list,save,delete}.yaml` 删除
  或合并(接口没了,契约随之走)。

## 定案补充(用户确认)

- **候选转正也是走对话**:就是把 `.engineer/suggested-skills/<slug>.md` 移动到
  `.agents/skills/<slug>/SKILL.md`。因为 agent 需要知道这两个路径才能 mv/删除,
  `agents/AGENTS.md`(及中文镜像)里保留了一小段 skill 说明(路径 + frontmatter + 转正/删除),
  其余交给自动发现。
- **blueprint 提示词要带模板**:`agents/AGENTS.md` 的 blueprint 一节给出最小 `index.html` 骨架,
  含主题自举(`localStorage["engineer.theme"]` → `data-theme`)、链 `/theme.css`、用 `var(--*)`,
  与 `.agents/blueprints/hello/index.html` 一致。

## 实现中的两个取舍(与初稿不同,需 review)

1. **扫描输入仍是队列文件,不是回读 log**。`.engineer/skill-scan.json` 保存待归纳的 run 文本 + 扫描状态。
   原因:`log/query` 只返回 summary(不含正文),重建每个 run 要先发现 session 再逐会话 `session-detail`
   并按时间裁剪;而原 `scan_pending` 缓存 run 文本正是为了不回读 log、不与 log 写入竞争。
   用一个小 json 文件保留同样保证,仍然去掉了 sqlite。若要真改为从 log 读,是一个后续项。
2. **`/ai/skill/refresh` 保留**。它是自动发现的**手动触发**(不是 CRUD),也是唯一能确定性测试扫描的入口
   (前端按钮已早先移除)。其余 skill/blueprint 接口全部删除。

## 实施记录(Phase 3)

- **static(Go)**:`ObjectTypes`/`TypeDirs` 加 `skill`→`.agents/skills`、`suggested-skill`→`.engineer/suggested-skills`、
  `blueprint`→`.agents/blueprints`;`safePath` 改为“必须落在登记的 type dir 下”并只允许该前缀是点目录;
  `contentType` 改最长前缀匹配;query-detail 类型白名单从 `ObjectTypes` 派生;`static-query` 响应加三个键;
  `ListEntries` 未动。
- **contracts/docs/atoms/edges**:static-query(-detail) 契约与 `docs/static.md` 扩充;删除 8 个 ai skill/blueprint
  契约(保留 `ai-skill-run`);`atoms/ai.yaml` 重写(provides 只剩会话 + skill-run,不再有 sqlite/blueprint 接口);
  `atoms/static.yaml`、`atoms/web.yaml`、`edges/web-to-ai.yaml`、`edges/web-to-static.yaml` 同步;`docs/ai.md` 删去已移除接口。
- **agents/**:`AGENTS.md` + `zh/AGENTS_zh.md` 新增“项目资源:skill 与 blueprint”一节(含 blueprint 模板)
  与 `.agents/` 目录约定。
- **web**:技能/蓝图改为从 static 读(`loadSchema()` + 每个入口文件一次 `query-detail`,frontmatter 取 name、
  `<title>` 取蓝图名);删除删除/忽略/接受按钮与确认 popover;行内只剩 chat / page。
  `.agents/blueprints/hello/index.html` 也改用 `/static/query`。
- **ai(TS)**:`skill/store.ts` 重写为纯文件(kept 目录 + 候选 `.md` + `skill-scan.json`),**零 sqlite**;
  删除 `save_skill`/`save_blueprint` 工具与 `blueprint/store.ts`;`server.ts` 删除 skill 的
  list/save/delete/ignore 与 blueprint 的 list/save/delete,保留 skill/run 与 skill/refresh;
  自定义工具只剩 `ask_user`。不再生成 `.engineer/skill.db`。
- **测试**:`skill-crud` 重写为“文件 + static 读 + mv/rm”;`blueprint-crud` 重写为“static 读 + 文件写”;
  `skill-suggest` 重写为“队列文件 + 候选文件 + 去重 + 转正=mv”;
  `core-web-{chat-route,input-grow,tabs,page}` 改为自建 scratch static + 直写文件,去掉删除相关断言;
  `core-web-tool-chips` 的旧工具名/旧路由更新。
- **实跑**:
  - `static/query` 返回三个新键;`query-detail` 能读 blueprint 与候选文件;
    `.engineer/engineer.db` 与 `.engineer/suggested-skills/../engineer.db` 均被 400 拒绝。
  - ai:7 个旧 skill/blueprint 接口全部 404;`/ai/skill/run` 正常;`/ai/skill/refresh` 返回 `triggered:false`;
    源码内无 `bun:sqlite` / `skill.db`。
  - 扫描(--stub):9 个 run → pending 9、无候选;第 10 个 → 候选文件出现;refresh 抽干后仍只有一个候选;
    scratch 根下只有 log 的 `engineer.db`、`skill-scan.json`、`suggested-skills/`,**无 skill.db**。
  - 浏览器(ego-browser,dev 栈 8500):`/new` 显示 Skills=1 / Blueprints=1 且无错误;`/new/skills` 分
    “My skills / Suggested”两栏,每行只有一个 `chat` 按钮。
  - `tsc --noEmit`、`go build ./...`、`node --check app.js`、`static/validate`(`ok: true`)均通过。
- **未做**:`.engineer/skill.db` 旧文件留在本机(git-ignored),未主动删除。

## 补记:发现机制克制化(用户 2026-10-10 追加)

原机制:每积满 **10** 个 settled run 扫一次,一次最多 3 条,只要求“不止一次出现”。太频繁、太宽松。

- **阈值提高**:`SCAN_THRESHOLD` 10 → **30**(约一个工作日的真实使用);新增 `SCAN_BATCH = 10`,
  一次只读最旧的 10 个 run,其余留在队列等下轮。阈值与批大小分开后,积压大只会多扫几轮,不会把 prompt 撑大。
- **每条上限**:`MAX_SUGGESTIONS` 3 → **2**。
- **prompt 收紧**(`skill/suggest.ts`):
  - 同一类工作必须在**至少三个不同 run**里出现,一次不算;
  - 只提**通用、可复用**的能力,明确拒掉一次性操作(某个具体 bug、单个文件、工单号、日期、客户);
  - 自问“下周在别的项目还能原样用吗”,不能就不提;
  - `name` 要求短、平实、一眼看懂:不超过 24 字符、用户的语言、不要行话/缩写/工具名/句子;
  - 明确写“宁可 0 条”,被忽略的建议比没有更差。
- **验证**(--stub):29 个 run → 无候选;第 30 个 → 出现 1 个候选文件,队列剩 20(批大小 10)。

## 验收

- `static-query` 返回 `skills` / `suggested-skills` / `blueprints` 三组路径;
  `static-query-detail` 能按这三个类型读到正文;`static/validate` 仍 `ok: true`。
- `.engineer` 的点目录白名单**只**覆盖 `suggested-skills`,读 `.engineer/engineer.db` 被拒(bad_request)。
- 前端技能/蓝图列表完全来自 static,不再请求 ai;删除按钮消失。
- `ask_user` 之外无自定义工具;`.engineer/skill.db` 不再生成。
- 对话里"画一个页面 / 记下来方便下次用"能触发 agent 写出
  `.agents/blueprints/<slug>/index.html`(系统提示里那节生效)。
- 相关 case(`core-skill-crud`、`core-skill-suggest`、`core-blueprint-crud`、`core-web-tabs`)按新形态更新并通过。

# 删掉多余的 skill 接口，schema 对齐代码

## 需求

两个接口都没在用，删掉；同时把 ai 的 schema 按代码现状补齐——代码里有、schema 里没有的路由一并登记。

1. **`POST /ai/skill/run` 删掉**。它没有独立语义：`server.ts` 里就是「按 skillId 查出文本 →
   `registry.new()` → `registry.ask([{type:"text", text}])`」，等于 `/ai/new` + `/ai/ask`。
   而 skill 文本本来就是 static 直接给前端的普通文件，客户端手里已经有这段文本。
2. **`POST /ai/skill/refresh` 删掉**。它是自动 skill 发现的「手动触发」；前端按钮早在 2610-11 移除，
   今天只有 `case-core-skill-suggest` 用 `curl` 打它。没有产品调用方就不保留。
3. **schema 补齐**：`POST /ai/stop`、`GET /blobs/<sha256>` 是前端**真在用**的两条路由，
   但既没有契约、也不在 `atoms/` 和 `docs/` 里。这次按代码现状补上。

## 现状

- `workspace/ai/src/server.ts`：`case "/ai/skill/run"`（209-221）、`case "/ai/skill/refresh"`（222）。
- `workspace/web/app.js:2496 newTabRun()`：**从来不调** `/ai/skill/run`——它开一个空会话，
  把 skill 文本填进输入框让用户自己改着发（注释：Nothing is sent — the skill is a starting
  point the user edits and sends themselves）。接口只被两个 E2E 用例养着：
  `case-core-skill-crud` §6 与整个 `case-core-skill-run/`。
- 2610-18 曾**明确决定保留** `/ai/skill/refresh`（自动发现的手动触发 + 唯一确定性测试口），
  但同一次改动把它的契约 `contracts/ai-skill-refresh.yaml` 删了——接口留着、登记没了，是漂移。
  本次改为：不留接口，让用例走**真实的自动触发路径**（30 个 run 的阈值）。
- `/ai/stop`（`server.ts:134`，前端 `app.js:762` 在用）与 `GET /blobs/<sha256>`
  （`server.ts:67`，前端 `app.js:2942` 渲染图片在用）都不在 `atoms/ai.yaml` 的 interfaces 里，
  `docs/ai.md` 也没有。
- `Registry.scanSkills()`（`registry.ts:216`）只服务 `/ai/skill/refresh`；删接口后它是死代码。
  `get skills()` 只服务 `/ai/skill/run` 的那次 `get()`，同样变死代码。

## 决策

1. **两个接口都直接删，不做兼容别名、不设开关**。唯一调用方是同仓前端与用例，没有外部兼容负担。
2. **`/ai/skill/refresh` 不留**。用「测试专用接口」换「测试覆盖自动路径」：用例改成靠
   `SCAN_THRESHOLD`（30）自然触发扫描，每多攒 10 个 run 就能触发下一次扫描——
   这样测的是生产路径，而不是一条只有测试走的分支。
3. **`/ai/skill/run` 不留**。前端跑 skill 的既有形态（开会话 + 文本进输入框）不变，
   只是不再有一个后端接口替它做这件事。
4. **`/ai/stop` 与 `GET /blobs/<sha256>` 补进 schema**：新建契约、进 `atoms/ai.yaml` 的 provides、
   进 `atoms/web.yaml` 的 consumes、在 `edges/web-to-ai.yaml` 各加一条边、`docs/ai.md` 各加一节。
   契约只描述数据（请求体 / 响应体 / 错误），method 与 path 由 atom 的 interface 声明——所以
   `blobs` 的 sha256 写在 `request.body` 里，路径形态交给 `extend.path: /blobs/{sha256}`。
5. **顺手清死代码**：删 `Registry.scanSkills()`、`Registry.skills` getter、以及随之无用的
   `ScanResult` 导入。扫描的自动路径（`onRunSettled` → `maybeScan()`）不动。

## 范围外

- 不动扫描机制本身：阈值 30、每批 10、`skill-scan.json`、候选写文件、去重逻辑一概不碰。
- 不动 skills 的读写归属：skill 仍是普通文件，static 负责列/读，agent 用文件工具改。
- 不动 SSE 事件形态、不动 `ask_user`、不动 `/ai/new|ask|stream|resume|delete`。
- 不动 `dist/`（构建产物）。
- 不给 skill 加使用统计、排序等新能力——那是另一个需求。

## 方案

**契约**

- 删 `contracts/ai-skill-run.yaml`。
- 新增 `contracts/ai-stop.yaml`：`POST /ai/stop`，body `{ id }`，200 `{ sessionId }`，
  错误 404 `not_found`（会话不存在）、500 `ai_error`（中止失败）。
- 新增 `contracts/ai-blobs.yaml`：`GET /blobs/{sha256}`，body `{ sha256 }`，
  200 为图片字节（`Content-Type` 取自存储的 mime，`Cache-Control: immutable`），
  错误 404 `not_found`（没有这个 blob）。

**静态关系**

- `atoms/ai.yaml`：删 `ai-skill-run` 一条 provide；加 `ai-stop`、`ai-blobs` 两条 provide；
  description 里 skills 那句改成「跑一个 skill 是开会话把它的文本作为首条消息」，
  不再暗示有一个 skill 执行接口。
- `atoms/web.yaml`：删 `ai-skill-run` consume；加 `ai-stop`、`ai-blobs` consume。
- `edges/web-to-ai.yaml`：删 `web-to-ai-skill-run` 边；加 `web-to-ai-stop`、`web-to-ai-blobs` 边。

**测试**

- 删整个 `development/testing/dev/case-core-skill-run/`（它的每个断言都只关于这个接口）。
- `case-core-skill-crud/TEST.md`：删 §6；开头那句「/ai/skill/run still opens a session from a
  skill」删掉；§5 里 `refresh` 的期望由「kept（200）」改成 404，与其余 CRUD 动作一致。
- `case-core-skill-suggest/TEST.md`：重写取数方式——造 run 不再用 `/ai/skill/run`，改成
  「`/ai/new` + `/ai/ask`」；触发扫描不再用 `/ai/skill/refresh`，改成攒到 30 个 run 自动触发
  （每次扫描吃掉最老的 10 个，所以之后每 10 个 run 触发一次）。断言不变：阈值、
  每批 10、被消费的 run 被丢弃、已知候选不再重复提议、提升靠 `mv`、扫描不阻塞对话、无 `skill.db`。

**代码**

- `workspace/ai/src/server.ts`：删 `case "/ai/skill/run"`、`case "/ai/skill/refresh"`。
- `workspace/ai/src/registry.ts`：删 `scanSkills()`、`get skills()`、`ScanResult` 导入。

**文档**

- `docs/ai.md`：删 `ai-skill-run` 一节；加 `ai-stop`、`ai-blobs` 两节。

## 验收

- `POST /ai/skill/run` 与 `POST /ai/skill/refresh` 都返回 404 `not_found` / unknown endpoint。
- 前端跑 skill 的路径不变：点 skill 开一个会话，文本落进输入框，发送即一次普通 `/ai/ask`。
- 图片仍能显示：`/ai/ask` 带 image block 写入 blob 后，`GET /blobs/<sha256>` 返回字节；
  `/ai/stop` 仍能中止在跑的会话。
- `case-core-skill-crud`、`case-core-skill-suggest` 实跑通过（后者全程不调任何 skill 接口）。
- `static/validate` 通过；`bunx tsc --noEmit` 通过。

## 实施记录（Phase 3）

**代码**

- `workspace/ai/src/server.ts`：删 `case "/ai/skill/run"`、`case "/ai/skill/refresh"`。
- `workspace/ai/src/registry.ts`：删 `get skills()`、`scanSkills()`、`type ScanResult` 导入。
- `workspace/ai/src/skill/suggest.ts`：`maybeScan(opts.force)` 的 `force` 参数随之无人传，删掉，
  只留阈值判断（自动路径 `onRunSettled → maybeScan()` 不动）。

**契约**

- 删 `contracts/ai-skill-run.yaml`。
- 新增 `contracts/ai-stop.yaml`、`contracts/ai-blobs.yaml`。
- **顺带发现的第二处孤儿**：`contracts/ai-answer.yaml` 仍在——2610-17 删了接口与文档，却漏了契约文件，
  此后无人引用。一并删掉。

**静态关系**

- `atoms/ai.yaml`：删 `ai-skill-run`，加 `ai-stop`、`ai-blobs`；description 里 skills 那句改为
  「running one is opening a session whose first message is that text」。
- `atoms/web.yaml`：同上。
- `edges/web-to-ai.yaml`：`web-to-ai-skill-run` → `web-to-ai-stop` + `web-to-ai-blobs`。

**文档**：`docs/ai.md` 删 `ai-skill-run` 一节，加 `ai-stop`、`ai-blobs` 两节。

**测试**

- 删 `development/testing/dev/case-core-skill-run/`（整个目录：TEST.md + desp.yaml）。
- `case-core-skill-crud/TEST.md`：§6 删除；§5 的 `refresh` 期望由「kept 200」改成 404；
  开头的「/ai/skill/run still opens a session from a skill」改为「跑 skill 不是接口」。
- `case-core-skill-suggest/TEST.md`：重写。造 run 改用 `/ai/new` + `/ai/ask`（`run()` 辅助函数），
  触发扫描改为**等 30 个 run 自然触发**（`wait_pending`），断言改为「扫完 pending 恰好降 10」；
  去重一节改成「第二批提议同一文本 → 被已知候选挡下，文件数不变」；promotion 之后再加 10 个 run，
  验证**已保留的 skill 也算已知**。

**实跑**（`how-to/deploy/dev/launch.sh`，8500-8503；用例自带 85xx scratch 栈）

- `POST /ai/skill/run` → 404 `not_found` / unknown endpoint；`POST /ai/skill/refresh` → 404 同上。
- `POST /ai/stop`：正常会话 200 `sessionId`；未知会话 404 `not_found`。
- `GET /blobs/<sha256>`：200，`Content-Type: image/png`、`Cache-Control: public, max-age=31536000, immutable`，
  字节与上传一致；未知 hash 404。
- `POST /static/validate` → `ok: true`、`errors: []`。
- `case-core-skill-crud`：全部通过（§5 六个 skill 动作全 404；`skill.db` 不存在）。
- `case-core-skill-suggest`：29 run 无候选 → 第 30 个触发扫描，pending 30→20、候选 1 个；
  再 10 个 run → pending 又降 10、文件数不变；mv 提升后候选目录空；再 10 个 run 仍无新候选；
  对话流不受影响（agent_start → message_update → agent_settled）。
- 构建：`bunx tsc --noEmit` 通过。
- 测试记录已写入 log（`kind: test`：`core-skill-suggest` / `core-skill-crud` / `ai-endpoints-schema-align`）。

**未做 / 留待处理**

- `dist/` 不动。
- 顺带发现、**未动**：`edges/` 里缺两条流式边——`web → ai` 的 `ai-stream`、`web → log` 的 `log-stream`，
  两个 atom 的 consumes 都声明了、边没有。不是本次引入，单独议。

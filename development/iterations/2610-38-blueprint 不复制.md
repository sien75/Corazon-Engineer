# 2610-38 blueprint 页面不再复制：一份页面，所有实例共享

## 需求

Blueprint 页面不再往 `.engineer/agents/<sessionId>/` 复制一份；`/agent/<sessionId>/` 直接服务
`.agents/blueprints/<slug>/`。用户已定的四条：

1. 同一个 blueprint 的多个 tab **共享**页面文件，改一处就是全部生效，不做隔离。
2. session → blueprint 的映射**以 log 的数据库为唯一标准**：`sessions` 表加一列 `blueprint`。
3. URL 保持 `/agent/<sessionId>/`：session 不只是页面，还带着对话记录。
4. 已经存在的副本**不动**（旧实例继续用它的副本；新实例走新路径）。

以及：per-session 的东西就是对话记录，本来就在 sqlite，不需要额外目录。

## 为什么

- 现在 agent 改的是 `.engineer/agents/<id>/`，而 `.engineer/` 是 git-ignored：**页面改动既进不了新实例，
  也提交不了、复现不了**。页面是项目产物，却落在丢弃区。
- 副本带来的「原型稳定」与「实例隔离」都不再是想要的性质：用户要的是「改了就生效」。

## 契约

- `log-session-upsert`（`POST /log/session/upsert`）：请求加可选 `blueprint`（slug），响应加
  `blueprint`。空串表示「不是 blueprint 页面」（main）。已存在的行：`kind` 覆盖，`blueprint`
  非空才覆盖（重放不会把 blueprint 抹掉）。
- `log-session-kind`（实现是 `POST /log/session/detail`）：响应加 `blueprint`，描述改成「一个会话的
  角色与它来自哪个 blueprint」——web 用它把 sessionId 解析成 slug。
- `sessions` 表：`blueprint TEXT NOT NULL DEFAULT ''`，带 `ALTER TABLE` 迁移（旧库就地补列）。
- `ai-new` / `ai-delete` / `ai-resume` 的请求响应形状不变。

## 代码

- **ai**
  - `blueprint.ts`：删掉 `copyTree` / `instantiateBlueprint` / `agentDir`；只留 `blueprintReadme(root, slug)`
    （读原型 README，顺带校验两个必需文件）。
  - `registry.new`：读原型 README 进 prompt，不复制；`writeSession` 把 `blueprint` 一起写进 log。
  - `registry.resume`：从 log 读 `{kind, blueprint}`；有 blueprint 就用原型的 README；没有的旧会话
    回退读 `.engineer/agents/<id>/README.md`（旧副本还在的话）。
  - prompt 末尾除了 README，再加一行「你的 blueprint 在 `.agents/blueprints/<slug>/`」，否则 agent 不知道
    自己该改哪。
  - `deleteSession`：不再删页面；只清理遗留副本（存在才删）。
- **web**（`workspace/web/server/serve.go`）
  - `--agents <dir>` 改为 `--blueprints <dir>`（值是 `.agents/blueprints`）。
  - `/agent/<sessionId>/<rest>`：取第一段做 sessionId，向 log 的 `/log/session/detail` 要 `blueprint`，
    命中就服务 `<blueprints>/<slug>/<rest>`；两者都按 session 缓存（一个会话的 blueprint 不会变）。
    log 404 / 空 blueprint → 404；log 不可达 → 502 且不回落外壳；slug 再过一遍正则，防脏数据穿越。
- **启动器**：dev / prod 的 web 参数跟着改名。
- **文案/规格**：`agents/{main,sub}`、`agents/zh/*`、`.agents/BLUEPRINT_how-to*.md`、三个 blueprint 的
  README、`docs/ai.md`、`how-to/deploy/*/BOOK.md`、`atoms/web.yaml`、`atoms/ai.yaml` —— 把「副本」的
  说法改成「一份页面，实例共享」。

## 不做的

- 不改 URL 形态（仍是 sessionId，不是 slug）。
- 不做 per-instance 页面隔离，也不做「提升为 blueprint」这类回写工具。
- 不删除、不迁移旧副本（旧实例照常）。

## 验证

- `case-core-agent-instantiate`：重写——没有副本；`/agent/<id>/` 经 log 解析到 blueprint 目录；
  改原型页面立即生效；两个 agent 共享；删 agent 不动 blueprint。
- `case-core-web-serve`：§4 改成起 log、注册一条 session→blueprint 映射后再验 `/agent/`。
- `case-core-session-delete`、`case-core-blueprint-crud`：去掉「副本」断言。
- dev 栈重启后：shell 正常、新建 pure-chat / project 实例能显示页面、旧实例仍能打开（走遗留副本）。

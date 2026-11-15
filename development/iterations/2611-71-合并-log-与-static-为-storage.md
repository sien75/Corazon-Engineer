# 2611-71 合并 log 与 static 为 storage

## 背景

- `log`（SQLite 状态与记录存储）和 `static`（项目文件树监听与只读 Schema 视图）均由 Go 编写，并已打包进同一个多调用二进制 `engineer` 中。
- `static` 本身无持久化目录，每次收到 `/static/query`、`/static/query-detail` 请求或后台每秒轮询项目文件树时，都需要通过跨进程 HTTP 调用 `log` 的 `/log/project/get` 与 `/log/project/list` 解析项目目录。
- 将两者合并为单一服务 `storage`，可直接复用进程内 SQLite `store.Store` 查询项目路径，消除跨进程 HTTP 与双端口开销，收敛拓扑与启动参数。

## 范围

做：
1. **Schema 合并**：删除 `structure/atoms/log.yaml`、`structure/atoms/static.yaml` 与 `structure/edges/static-to-log.yaml`；新增 `structure/atoms/storage.yaml`（提供原有的 24 个 `log-*` 接口与 3 个 `static-*` 接口，共 27 个），并将调用边收敛为 `ai-to-storage.yaml`、`web-to-storage.yaml`。
2. **契约与路由保留**：所有 HTTP 路由前缀（`/log/*`、`/static/*`）及契约文件名保持不变。
3. **代码合并**：将 `workspace/log` 与 `workspace/static` 合并为 `workspace/storage`（Go module `engineer/storage`）：
   - `engineer serve-storage --bind <host> --port <n> --home <data dir>`
   - 同一个 `http.ServeMux` 同时挂载 `/log/*` 与 `/static/*` 路由。
   - 原 `static` 的 `projectPaths` 改为直接调用 `store.Store` 的 `GetProject` / `ListProjects`，去掉 HTTP 轮询与 TTL 缓存。
4. **下游与端口收敛**：
   - 默认端口：`7500`（web）/ `7501`（ai）/ `7502`（storage），dev 为 `8500` / `8501` / `8502`，移除 `7503` / `8503`。
   - `ai` 与 `web` 启动参数将 `--log` + `--static` 合并为单一必填参数 `--storage <url>`。
   - `web` 生成的 `/config.js` 导出 `{ storage, ai }`；同步更新 `workspace/web/app.js` 及 `.agents/blueprints/{structure,library,development}/index.html`。
5. **文档与测试同步**：更新 `structure/docs/README.md`、`how-to/deploy/`、`agents/`、`.agents/BLUEPRINT_how-to.md` 及 E2E 测试用例。

不做：
- 不修改任何 `/log/*` 或 `/static/*` 接口的请求/响应 YAML 结构。
- 不修改 SQLite 表结构。

## 落地补充（实施中确认）

- `log` 的 `provides` 实际是 24 个（原记录写 21 个，是旧数）：project 5 / session 10 / test 3 / telemetry 3 / search 1 / stream 1 / workspace-stream 1。
- 边的 id 一并改名：`ai-to-log-*` → `ai-to-storage-*`，`web-to-log-*` → `web-to-storage-*`；`from_interface` / `to_interface` 仍是 `log-*`（接口名未变）。
- `/config.js` 的键序从 `{static, ai, log}` 变为 `{storage, ai}`，`case-core-web-serve` 的期望体随之更新。
- `structure/docs/README.md` 的接口分组由 `### log` + `### static` 收敛为 `### storage`（`/log/*` 与 `/static/*` 两段），文件名不变，`gen-docs.ts` 通过。

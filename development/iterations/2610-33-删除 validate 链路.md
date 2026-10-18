# 删除 validate 链路（static 只读视图，不再校验）

> static 的第四个接口 `static-validate` 整条链路下线：契约、atoms/edges、服务代码、文档、用例、提示里的要求一起删。static 退回纯只读视图（query / query-detail / stream）。

## 需求

- `POST /static/validate` 与它的整条链路删除。
- 目的：static 只负责“读文件 + 看变化”，不再承担 schema 校验；改完 schema 不再有“必须跑一遍”的动作。
- 提示里鼓励 ai 去 curl 的内部接口只剩 log 的记录写入（保留，不动）。

## 现状（事实）

| 层 | 现在 | 位置 |
|---|---|---|
| 契约 | `static-validate` | `contracts/static-validate.yaml` |
| static 声明 | provides `static-validate`，描述里含 "validates atoms / edges / contracts" | `atoms/static.yaml:25-33` |
| ai 声明 | consumes `static-validate`，描述里含 "validates the schema via static" | `atoms/ai.yaml` |
| web 声明 | consumes `static-validate` | `atoms/web.yaml` |
| 边 | `ai-to-static`（只有这一条）、`web-to-static-validate` | `edges/ai-to-static.yaml`、`edges/web-to-static.yaml` |
| 代码 | 路由 + `handleValidate`；`schema.Validate/ValidateTree/validateAtom/validateChannelProtocol` + `FieldError` / `TreeError` | `workspace/static/internal/server/server.go:29,200-211`、`internal/schema/schema.go:13-23,66-86,154-385` |
| 文档 | `docs/static.md` 的 `static-validate` 段 | `docs/static.md` |
| 页面 | `.agents/blueprints/validate-report/` | — |
| 用例 | `case-core-static-validate` | `development/testing/dev/case-core-static-validate/` |
| 提示 | 「最常调用的内部接口是 validate 和写记录」+「改完 schema 后调用 validate」 | `agents/AGENTS.md` L21、L74（`agents/zh/AGENTS_zh.md` 同两处） |

## 决策

1. 只删 validate，**不动** log 的记录写入、不动 `static` 的其它三个接口。
2. 服务代码里只属于校验的辅助（`contains` / `str` / 常量表 `Channels` / `Protocols` / `RuntimeTypes` / `AtomRoles`）一并删；`readYAMLMap`、`ListEntries` 等仍被 query 使用，保留。
3. `agents/AGENTS.md` 与 `agents/zh/AGENTS_zh.md` 同步改：L21 只保留“写记录”，L74 整句删；`docs/` 举例从 `static.md, log.md` 收成 `log.md`。
4. `.agents/skills/` 是本轮冻结范围，**不碰** —— `validate-schema` 会指向已删接口，作为已知遗留记着。
5. 用例 `case-core-static-validate` 随接口一起删（它测的就是被删的东西）。

## 方案

| 位置 | 改动 |
|---|---|
| `contracts/static-validate.yaml` | 删文件 |
| `atoms/static.yaml` | 去 provides 段 + 描述改“不校验” |
| `atoms/ai.yaml` | 去 consumes 段 + 描述去 “validates the schema via static” |
| `atoms/web.yaml` | 去 consumes 段 |
| `edges/ai-to-static.yaml` | 删文件（ai 从此没有到 static 的边） |
| `edges/web-to-static.yaml` | 删 `web-to-static-validate` |
| `workspace/static/internal/server/server.go` | 去路由 + handler |
| `workspace/static/internal/schema/schema.go` | 去校验函数与专属常量/辅助 |
| `docs/static.md` | 去 validate 段 |
| `agents/AGENTS.md`、`agents/zh/AGENTS_zh.md` | L21 改写、L74 删 |
| `.agents/blueprints/validate-report/` | 删目录 |
| `development/testing/dev/case-core-static-validate/` | 删目录 |

## 验证

- `go build ./...`（static + prod launcher）
- 起 static 打 `/static/query`、`/static/query-detail`、`/static/stream` 正常，`/static/validate` 404
- 跑覆盖到的用例：`case-core-static-query`、`case-core-static-stream`（validate 用例已删）
- 提示改完不影响已装包；重启 dev 栈后确认 `agents/AGENTS.md` 的新文本被读入

## 遗留

- `.agents/skills/{validate-schema,add-atom,write-e2e-case}/SKILL.md` 仍提到 validate（本轮冻结）。

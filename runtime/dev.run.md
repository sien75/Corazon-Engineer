# dev 环境拉起说明

本地开发环境：在本机起 static / ai / log 三个 Go 服务 + web 前端。端口必须与本目录 `dev.yaml` 的 `endpoints` 一致（static: 7502, ai: 7501, log: 7503）。

## 前置条件

- Go 1.22+
- Node.js（仅 web 前端需要）
- AI 服务的 DeepSeek 密钥写在 `.corazon/credentials.md`（`.corazon/` 是 git 忽略的私有目录，首次使用自行创建）

## 启动顺序

log 和 static 无相互依赖，ai 依赖两者（启动参数要指到它们的地址），web 最后起。

```bash
# 1. log —— sqlite 记录服务，:7503
cd workspace/log && go run . serve-log --root <项目根>

# 2. static —— schema 解析服务，:7502
cd workspace/static && go run . serve-static --root <项目根>

# 3. ai —— 会话/编排服务，:7501（默认已指向 localhost:7502 / 7503）
cd workspace/ai && go run . serve-ai --root <项目根>

# 4. web —— 前端（架构图 + schema 浏览），:7500
node workspace/web/serve.js
```

`<项目根>` 为包含 `corazon.yaml` 的目录；在仓库根目录运行时 `--root` 可省略（自动探测 cwd）。

## 验证

```bash
curl -s -X POST http://localhost:7502/static/query -d '{}'
```

返回 atoms / edges / runtime 条目即正常。系统级测试见 `dev.yaml` 的 `tests` 块（`tests/core-*.md`）。

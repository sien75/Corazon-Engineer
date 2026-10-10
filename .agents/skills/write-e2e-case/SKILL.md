---
name: write-e2e-case
description: 按 development/testing 的约定补一个可复现的 E2E 用例并真跑一遍
---

给某个行为补一个 E2E 用例，放进 `development/testing/<env>/`。

1. 先看相邻用例（例如 `case-core-static-validate/`）的写法，格式保持一致。
2. 建目录 `development/testing/dev/case-core-<atom>-<行为>/`：
   - `desp.yaml`：`id`、`description`、`atoms`
   - `TEST.md`：`# Test: <id>` → 说明 → `## Setup`（起服务 + 等端口）→ `## 1. <断言>`，每节一段可直接复制的 bash + Expected。
3. 用例必须自成闭环：自己起服务、自己等端口、自己清理，不依赖上一条用例的残留状态。
4. 需要假项目就用 `development/testing/.playground/`，复制到 `.engineer/` 下再改。
5. 写完真跑一遍：`NO_PROXY='*' no_proxy='*'`，并清掉 `http_proxy` / `https_proxy`；把实际输出贴出来。
6. 按 `~/.engineer/apps/current/docs/log.md` 把这次运行写成 `kind: test` 记录（payload: `case` / `atoms` / `req` / `resp` / `result`）。

跑不过就改到跑通；同一个失败连续 3 次就停下来汇报，别继续瞎试。

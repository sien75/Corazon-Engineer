---
name: add-atom
description: 给系统加一个新 atom，严格按 契约→静态关系→测试→代码 的顺序
---

给系统加一个新的 atom，严格按 SOP 顺序走：契约 → 静态关系 → 测试 → 代码。

1. 先读 `agents/schema.md` 与 `agents/enum.md`，确认字段与枚举取值。
2. **契约**：在 `contracts/` 下写 `<atom>-<动作>.yaml`，写法照 `agents/contract.md`，request / response 写全，别留 `object` 了事。
3. **静态关系**：新建 `atoms/<name>.yaml`，provide / consume 的 interface 用 `contract: ./contracts/xxx.yaml` 指过来；需要的话在 `edges/` 下补它与既有 atom 的连接。
4. 调 static `validate`，`ok: true` 才继续。
5. **测试**：在 `development/testing/dev/` 下建 `case-core-<name>-<行为>/`（`desp.yaml` + `TEST.md`）。
6. **最后**才写 `workspace/` 里的实现。

每步做完报一次结果。任何一步卡住就停下来说清楚卡在哪，不要跳步往下做。

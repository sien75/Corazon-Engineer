---
name: validate-schema
description: 跑一遍 static validate，并把 schema 报错逐条修干净
---

跑一遍 schema 校验，把报错修干净。

1. 按 `~/.engineer/apps/current/docs/static.md` 调 static 的 `validate`（地址从本会话末尾的 Runtime endpoints 拿，或从 `/config.js` 读）。
2. `ok` 已经是 true：回复「全树通过，未改动任何文件」并结束。
3. 不为 true：按每条错误的 `file` / `field` / `message` 逐条修 `atoms/`、`edges/`、`contracts/` 里的 YAML。常见原因：
   - atom / edge / contract 缺必填字段；
   - `runtime_type`、`role`、`channel`、`protocol` 不在 `agents/enum.md` 的枚举里；
   - interface 引用的 contract 文件不存在；
   - edge 的 `from` / `to` 指不到已知 atom，或 `from_interface` / `to_interface` 不在该 atom 的 consumes / provides 里；
   - contract `id` 在多个文件里重复。
4. 每修一轮重新 validate，直到 `ok: true`。
5. 最后用一句话列出改了哪些文件、各修了什么。

只动 schema 文件（`atoms/` `edges/` `contracts/`），不要顺手改代码或文档。

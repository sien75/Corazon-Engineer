---
name: log-triage
description: 过一遍最近的运行记录，找出真正出问题的地方
---

把最近的运行记录过一遍，找出真正需要看的地方。

1. 按 `~/.engineer/apps/current/docs/log.md` 调 log 的 `query`（`kind: test` / `telemetry`，时间倒序取最近一批）。
2. 只看需要关注的：`result` 非 pass 的 test，以及报错的 telemetry。
3. 逐条看详情（`log-query-detail`）里的 `req` / `resp`，判断是环境问题、用例问题，还是真缺陷。
4. 输出一张表：时间 / kind / case / 结论；再加一句话说明「最该先查哪一条」。
5. 结论里带上记录 `id`，方便用户自己去看原件。

只读：不写记录、不改代码。判不出来就说判不出来，不要编原因。

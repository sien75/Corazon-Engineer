---
name: schema-overview
description: 只读地速览这个项目的 atoms / edges / contracts 现状
---

给这个项目做一次架构速览，用最短的话说清楚它现在长什么样。全程只读。

步骤：

1. 读 `engineer.yaml`，拿到项目名与版本。
2. 数一下 `atoms/`、`edges/`、`contracts/` 各有多少个 `.yaml` 文件。
3. 按 `~/.engineer/apps/current/docs/static.md` 的用法调一次 `static/query`（只读），拿全量清单。
4. 列出每个 atom 的 `name` 与 `runtime_type`，以及每条 edge 连接了哪两个 atom。

输出：

- 一张表：atoms / edges / contracts 的数量。
- 不超过 5 行的文字：这个系统由哪几个部分构成、它们怎么连起来。

不要写任何文件，不要改任何东西——这是一次只读速览。

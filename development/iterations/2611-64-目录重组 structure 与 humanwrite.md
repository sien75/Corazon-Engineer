# 2611-64 目录重组:structure 与 humanwrite

## 目标

把项目根目录按「系统的描述 / 人工手写 / 过程材料」重新归类,不改变任何行为,只改位置与引用。

## 新布局

| 原位置 | 新位置 |
|---|---|
| `atoms/` `edges/` `contracts/` | `structure/atoms/` `structure/edges/` `structure/contracts/` |
| `docs/` | `structure/docs/`(docs 是对上述内容的描述,放在一起) |
| `development/plans/<YYMM>/` | `humanwrite/<YYMM>/`(平铺) |
| `notes/` | `humanwrite/notes/` |
| `how-to/` `workspace/` `agents/` `development/{iterations,testing}` | 不动 |

`humanwrite` = 人手写的内容(讨论、原始笔记、自由笔记);AI 生成的方案仍在 `development/iterations/`。

## 接口 / 代码影响

- static 的对象类型 `notes` 改为 `humanwrite`(目录 `humanwrite/`,同时覆盖迭代讨论与 notes);原先 `development/plans` 下的文件不再属于 `development` 类型。
  `static-query` 响应字段 `notes` → `humanwrite`;`static-query-detail` / `static-stream` 的 `type` 枚举与对应 payload 字段同步。
  `atoms / edges / contracts / docs` 字段名不变,只是它们读的目录变成 `structure/…`,返回的相对路径带 `structure/` 前缀。
- atom 里的 `contract: ./contracts/x.yaml` 约定为**相对 `structure/`** 书写,文件内容不动。
- 发布包布局不变:`prod/BOOK.md` 里从 `structure/docs` 拷贝为包内 `docs/`。
- project blueprint:Plans 栏目改为 Humanwrite,读 `humanwrite` 列表。
- 测试夹具 `.playground` 同步成新布局(`structure/…`);static-query / static-stream 两个 case 的路径与 `notes→humanwrite` 同步。

## 文档同步

根 `AGENTS.md` / `_zh`、`README` / `_zh`、`development/README` / `_zh`、`agents/` 下 schema / contract / how-to / main / sub(含 zh)、`.agents/BLUEPRINT_how-to*`、`how-to/deploy/prod/BOOK.md`。历史迭代记录不改。

## 验证

跑 `case-core-static-query`、`case-core-static-stream`(断言读了被改动的目录与类型);project blueprint 肉眼确认 Humanwrite 栏目。

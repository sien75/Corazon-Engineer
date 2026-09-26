# schema 递归发现

## 问题

`atoms/`、`edges/`、`contracts/` 下能否有二级目录，规范与代码不一致：

- 规范 `agents/schema.md` 按扁平一级目录描述（`atoms/*.yaml` 等），未明文规定。
- 校验 `ValidateTree` 用 `schema.ListEntries`（`filepath.Walk`，递归）扫描 atoms / edges / contracts。
- 加载 `LoadAtoms` / `LoadEdges` 走 `loadStructure`，用 `os.ReadDir`（非递归）且 `e.IsDir()` 直接跳过。

结果：二级目录里的 atom / edge 被校验扫到、却被加载静默忽略，图里不出现，行为和校验不一致。

## 决策

**统一为递归**：`atoms/`、`edges/`、`contracts/` 三个目录的内容实体均按递归发现——任意深度下的 `*.yaml` 都会被加载与校验；以 `.` 开头的条目仍然跳过（不作为内容实体）。

## 方案

- `LoadAtoms` / `LoadEdges` 复用已有的 `ListEntries`（递归、排序、跳过点开头），不再用非递归的 `os.ReadDir`。`loadStructure` 改为遍历 `ListEntries(root, kind)` 并逐个 `readYAMLMap`。
- `contracts/` 已经递归（校验与查询都走 `ListEntries`），无需改动；atom 中 `contract` 引用仍按相对根路径（`./contracts/sub/x.yaml`）解析，天然支持嵌套。
- 规范文档 `agents/schema.md` / `agents/zh/schema.md` 补充"递归发现"说明。

## 验收

- `runtime/testing/dev/case-core-static-validate` 新增递归用例：在 `atoms/nested/`、`edges/nested/`、`contracts/nested/` 放入合法文件后，`/static/validate` 返回 `ok: true`，`/static/query` 的 `atoms` / `edges` 能列出嵌套实体。

## 影响面

- 仅 `workspace/static` 的 schema 加载路径；校验、查询、web 图渲染共享该结果。
- 向后兼容：原有扁平文件行为不变，嵌套文件从"被忽略"变为"被加载"。

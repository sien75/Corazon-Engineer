# Blueprint 模板写法

> 占位：这一篇还没写。在它写出来之前，规则只有下面三条（`AGENTS.md` 里那条由这份文件接手）。

- 一个 blueprint 是目录 `.agents/blueprints/<slug>/`，**只允许两个文件**：`README.md` + `index.html`。多一个文件，实例化就会被拒（400）。
- `index.html` 必须**自包含**：css / js 全部内联，不引用同级文件。
- `README.md` 是这个 blueprint 实例化出来的 agent 的**开场上下文**（追加在 system prompt 最后），写它是给 agent 看的：这个 agent 是什么、它的 UI 用来做什么、该怎么驱动它。

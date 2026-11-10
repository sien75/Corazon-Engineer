# 2611-65 内置 pure-chat

## 目标

`pure-chat` 是工具的内置功能:不在任何项目的 `.agents/blueprints/` 里,打开任何项目都有它。不是兜底 —— 项目里即使有同名目录也不看它。

## 改动

- 页面就是一个普通的 shell 资产:`workspace/web/components/pure-chat/index.html`,已被现有的 `components/` 拷贝步骤带上,打包脚本(BOOK)不用改。`.agents/blueprints/pure-chat/` 删除。
- web:`builtinPages`(slug → 资产里的目录)里列出的 slug 直接从 `--assets` 服务,项目完全不参与。`/config.js` 与 static 不变。
- ai:`blueprint.ts` 的 `BUILTIN` 里放这个 slug 的 tab 名与 README(prompt 文本随工具走,不从项目读);`readBlueprint` / `blueprintTitle` 用它,`pageLine` 对内置页改成「这页随工具发布、你改不了,想展示就新建自己的 blueprint」。
- 启动器:`app.js` 里一个常量项把 `pure-chat` 排在最前、标注「内置」。
- 文档:`agents/{main,sub}/AGENTS.md`(含 zh)、`.agents/BLUEPRINT_how-to*`、atom/契约里只说「内置页随工具发布、改不了」,不写它放在哪个目录。

## 不做

- 不加 flag(ai 不需要知道内置页在哪,README 在代码里),`/config.js` 与 static 不动,没有兜底/覆盖逻辑。
- 没有新增 E2E case:现有 case 的断言没有读这条路径,`case-core-web-serve` 与 `case-core-agent-instantiate` 原样跑通即可。

## 验证

`case-core-web-serve` / `case-core-agent-instantiate` 原样通过;另外手工验证过:项目里没有 `pure-chat/` 时
`/agent/<sessionId>/` 服务出内置页、`ai/new` 建得起来且 tab 名是 `Pure Chat`;项目里放一份同名目录也不被读取。

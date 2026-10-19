# launcher 打开时不闪 main

## 需求

在 launcher 里点一个 Blueprint，**新 tab 出现之前会先闪一下 main 的内容**。要求：点下去之后，
工作区不被揭开，直到新 tab 的页面画出来。

## 现状（基线，实测）

`openBlueprintFromLauncher` 里 launcher 的关闭时机太早，而且**不止一处**：

```js
await logTabNew({...});
launcherClose();              // ← 第一处：这时新 tab 还没建出来
await refreshWorkspace();     //   refreshWorkspace → activateTab → launcherClose()，第二处
```

`activateTab` 一进来就 `launcherClose()`（`app.js:260`），所以真正把 launcher 关掉的是它，
显式那一行是第二次（已隐藏，无副作用）。

`ego-browser` 记的时间线（浏览器在 `localhost:8850` 的临时栈上，未修代码）：

| 时刻 | 事件 |
|---|---|
| 0 ms | 点下 Blueprint 行 |
| +1033 ms | `ai/new` + `log/tab/new` 走完（一直在 launcher 后面，看不见） |
| +1033 ms | **`launcher.hidden = true`**（`activateTab`） |
| +1048 ms | 新 tab 的 `pane-tree` 挂进 `#panes` |
| +1094 ms | 新 tab 的 iframe `load`（probe 页面画出来） |

关掉 launcher 到新页面画出来之间有 **61 ms**：前 15 ms 露出来的是仍然活着的 main，之后是
iframe 的空白 surface。慢机器 / 真实网络下更长。现象就是"先闪一下 main，才出现新 tab"。

## 决策

**launcher 是"打开"这件事的最后一个动作，不是第一个**。它挡在用户和工作区之间，所以在它打开的
东西画出来之前，它不能走：

1. 加一个 `launcherHold`：按住期间 `launcherClose()` 不生效（`activateTab` 那一次自然被挡住），
   列表 `pointer-events: none`（按住期间第二次点击不能造出第二个 agent）。
2. 打开成功后按顺序做：`refreshWorkspace()`（新 tab 进去、树挂上）→ **等新 tab 第一个 pane
   的 iframe 加载完** → `launcherRelease()` + `launcherClose()`。
3. 打开失败（`ai/new` 报错、`log/tab/*` 报错）时只 `launcherRelease()`：launcher 留着 ——
   要露给用户的是那份列表，不是一个空工作区，也不是 main。
4. 等加载用 `waitForTabPaint`，带 4 s 上限：页面永远加载不出来时不能把 launcher 钉死在屏幕上。

判定"画出来了"用的是 iframe 自己的文档：`readyState === "complete"` 且 URL 不是 `about:blank`
（后者是 iframe 还没有页面时的样子）。

## 方案

### web（`workspace/web/`）

| 位置 | 改动 |
|---|---|
| `app.js` `launcherHold` / `launcherClose` | 按住期间不关；`launcherHoldOn` / `launcherRelease` 两个出口 |
| `app.js` `openBlueprintFromLauncher` | 按住 → 造 agent / 写 tab → `refreshWorkspace` → 等页面 → 放开并关掉；失败只放开 |
| `app.js` `openRecentTab` | 同一条路：需要时先 `activateTab`，等页面，再关 launcher |
| `app.js` `openLauncher` / 外部 mousedown | 按住期间不重开、不被外部点击关掉 |
| `app.js` `waitForTabPaint` / `paneFramePainted` | 新 tab 第一个 pane 的 iframe 加载完；4 s 上限 |
| `style.css` `#launcher.busy` | 按住期间 `pointer-events: none` + `cursor: progress` |

### 契约与静态关系

无。纯前端时序，不碰接口 / 契约 / atoms / edges。

### 测试

新增 `case-core-web-launcher-open`（端口 8860-8863）：用一个 MutationObserver 记
`tree.added` / `frame.load` / `launcher.hidden` 三件事的先后，钉住

- 打开成功：`tree.added` → `frame.load` → `launcher.hidden`（新 tab 的树先挂上、页面先加载完，
  launcher 才走 —— main 一刻也没被露出来）；
- 一次点击一个 agent（同一 task 里两次点击只开一个 tab）；
- Recent 重开旧 tab 走同一条路；
- 失败时 launcher 留着、不 busy、能再点，并把原因说出来。

## 范围外

- **既有 web 用例与新 DOM 的漂移**：`case-core-web-tabs` / `-tab-records` / `-panes` /
  `-pane-frame` / `-tab-state` 等仍在写 `#newtab`、`.launch-item[data-action=newchat]`、
  `/chat/<id>`、`#ai-messages` 这套旧壳，在 main 上本来就是红的。那是另一笔欠账（按现状重写这批
  用例），本次只新增一条**按现状写**的用例，不去顺手改它们。
- **其它入口的"空白 surface"**：从 main 的工具开 tab（`tab-new`）、布局重排重建 pane 时，
  新 pane 的 iframe 仍有一个空载窗口（背景色，不是 main）。那两条路径上用户本来就看着
  自己点的那一下，不构成"闪 main"，不在本次范围。
- 打开过程中的加载提示（launcher 里那 1 s 的 `ai/new` 本来就是静默的，本次不引入进度 UI）。

## 实施记录（Phase 3）

`workspace/web/app.js`、`workspace/web/style.css` 按上表改完；`app.js` 语法检查通过，
`serve-web` 直接读盘，改完 reload 即生效（无需重新打包）。

### 测试范围与结果

范围的判据：用例的断言读不读本次动的那一层（launcher 打开一条行时的 DOM 时序）。

| 用例 | 结果 |
|---|---|
| `case-core-web-launcher-open`（新） | 9/9，`ok: true` |
| 同上，**未修代码**（`git stash` 掉 `workspace/web` 后重跑） | 5 项失败：`launcher.hidden` 排在三件事最前、双点在同一个 task 里造了第二个 agent、Recent 重开同样先露 main |

未跑及原因：其它 web 用例读的是旧壳（`#newtab` / `/chat/<id>` / `#ai-messages`），在 main 上
同样红，给不出本次改动的回归信号（见「范围外」）。手工在浏览器里复核了本次没动的行为：launcher
列表、Recent 切换回已开的 tab（不新增）、失败后仍可再点、页面无 JS 报错。

### 顺手发现（未做）

- 打开一个 blueprint 时 `ai/new` 就要 ~1 s（stub 模式也是如此），这段时间 launcher 是静默的。
  本次不引入进度提示，属于 UI 打磨，另开。
- `development/testing/dev/` 下多数 web 用例与 2610-35…39 之后的壳已经对不上（见「范围外」）。

## 验收

- `case-core-web-launcher-open` 9/9；未修代码上同一用例变红（可复现，已记在上面）。
- 打开 blueprint / 重开 recent：launcher 关掉的那一刻，新 tab 的页面已经在屏幕上。

## 影响面

| 位置 | 改动 |
|---|---|
| `workspace/web/app.js` | `launcherHold*` / `launcherClose` / `openLauncher` / `openBlueprintFromLauncher` / `openRecentTab` / `waitForTabPaint` / `paneFramePainted` / 外部 mousedown |
| `workspace/web/style.css` | `#launcher.busy` |
| `development/testing/dev/case-core-web-launcher-open/` | 新 case（`desp.yaml` + `TEST.md`） |

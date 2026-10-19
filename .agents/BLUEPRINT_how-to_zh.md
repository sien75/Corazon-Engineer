# Blueprint 写法

`.agents/blueprints/<slug>/` 是一个目录：两个必需文件，其余的东西都属于这个页面。

| 文件 | |
|---|---|
| `README.md` | agent 的开场上下文（追加在 system prompt 最后） |
| `index.html` | UI 入口 |

其余文件 —— css、js、图片、子目录 —— 用相对路径引用（`./my-view.css`）。`/agent/<sessionId>/` 服务的就是 blueprint 目录本身（session 经 log 解析）：没有按 agent 复制的副本，所以改一处就是所有实例刷新后的页面，并且落在项目工作区里。

## 页面

- `<title>` 就是用户看到的名字。
- 与外壳同源：可以链它的资源、调它的服务。路径第一段是会话 id。
- 主题：链 `/theme.css`；首帧前给 `<html>` 设好 `data-theme` 和 `color-scheme`（读 `localStorage["engineer.theme"]`）。外壳会在加载时和每次切换时重写这两个值，页面不用监听。

## 如何为项目修改 Blueprint

`pure-chat` 是参照：它只有一个 `<engineer-chat>`，没有别的。先读它，然后只加这个项目的页面真正需要的东西。

### 可以依赖的能力

页面由外壳同源伺服。下面是它提供的全部东西，都是绝对路径，除此之外没有别的：

**组件**

| 文件 | 拿到什么 |
|---|---|
| `/components/chat.js` | `<engineer-chat>`，对话：发 / 收 / 停、markdown、工具芯片、`ask_user` 卡片、图片粘贴 |
| `/components/chat.css` | 它的样式 —— `chat.js` 自己装进 shadow root，页面不要链它 |

**页面基础**

| 文件 | 拿到什么 |
|---|---|
| `/theme.css` | 调色板（`--surface`、`--fg`、`--accent` …）；你写的元素继承它 |
| `/config.js` | `ENGINEER` —— ES module 的 default / 具名导出 `{ static, ai, log }` |

**库** —— `/vendor/…`，ES module

| 文件 | 拿到什么 |
|---|---|
| `/vendor/js-yaml.js` | js-yaml 4.1.0 —— default export：`load` / `dump` |
| `/vendor/markdown-it.js` | markdown-it 15.0.2 —— default export：`MarkdownIt` 构造函数 |
| `/vendor/dompurify.js` | DOMPurify 3.4.15 —— default export：`sanitize` |
| `/vendor/highlight.js` | highlight.js 11.12.0 —— default export：`highlight` / `highlightAuto` / `getLanguage` |
| `/vendor/highlight.css` | `highlight.js` 输出的 class 对应的主题 |
| `/vendor/graph.js` | `@gravity-ui/graph` —— canvas 图库（内置 React）；只有具名导出、没有 default：`Graph`、`CanvasBlock`、`Anchor`、`BaseConnection` … |

这些文件的源文件都在 `workspace/web/` 下。

### 比聊天更多的页面

#### 内联的 chat 组件

```html
<script type="module" src="/components/chat.js"></script>
<engineer-chat autofocus></engineer-chat>
```

`pure-chat` 整页就是这两行：没有包装、不用接线 —— 会话 id 从 URL 取，`/config.js` 它自己加载。`/components/…` 是外壳的，用绝对路径。

#### 用 vendor 和下载来的库写自己的组件

入口照参照写（主题脚本、`/theme.css`），在 `index.html` 旁边加一个 module，挂在原来 `<engineer-chat>` 的位置。自己的文件用相对路径（`./my-view.js`、`./lib/…`），跟着副本走；外壳的用绝对路径（`/vendor/…`、`/components/…`）。外壳没有的库下载到同一目录，别用 CDN。

```js
// my-view.js —— 和 index.html 放在一起，用
// <my-view></my-view> + <script type="module" src="./my-view.js"></script> 挂上
import yaml from "/vendor/js-yaml.js";   // 外壳自带的
import dayjs from "./lib/dayjs.js";     // 外壳没有：下载进这个 blueprint

class MyView extends HTMLElement {
  connectedCallback() {
    this.textContent = Object.entries(yaml.load("built: " + dayjs().format("HH:mm")))
      .map(([k, v]) => k + "=" + v).join(" ");
  }
}
customElements.define("my-view", MyView);
```

#### 连 static 或 log

地址是个 ES module，用 import 拿，不要写进页面；后面服务的形状在 `docs/static.md` / `docs/log.md`：

```js
import { ENGINEER } from "/config.js";
const { static: STATIC, log: LOG } = ENGINEER;
const yaml = { "Content-Type": "application/yaml" };
const files = await (await fetch(STATIC + "/static/query", { method: "POST", headers: yaml, body: "{}" })).text();
const recs = await (await fetch(LOG + "/log/query", { method: "POST", headers: yaml, body: '{"pageNum":1}' })).text();
```

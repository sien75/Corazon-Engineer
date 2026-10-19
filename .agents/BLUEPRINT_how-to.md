# Blueprint how-to

`.agents/blueprints/<slug>/` is a directory: two required files, everything else belongs to the page.

| file | |
|---|---|
| `README.md` | the agent's opening context (appended last to its system prompt) |
| `index.html` | the UI's entry |

Other files — css, js, images, subdirectories — are reachable by relative URL (`./my-view.css`). `/agent/<sessionId>/` serves the blueprint directory itself (the session is resolved through log): there is no per-agent copy, so an edit is every agent's page on reload, and it lands in the project's working tree.

## Page

- `<title>` is the name the user sees.
- Same origin as the shell: link its assets, call its services. First path segment is the session id.
- Theme: link `/theme.css`; set `data-theme` and `color-scheme` on `<html>` before first paint (from `localStorage["engineer.theme"]`). The shell rewrites both on load and on every switch — no listener needed.

## How to change a Blueprint for a project

`pure-chat` is the reference: it is one `<engineer-chat>` and nothing else. Read it first, then add
only what the project's page actually needs.

### What you may build on

The page is served by the shell, same origin. This is the complete list of what it offers — each one
an absolute path, nothing else:

**Components**

| file | what you get |
|---|---|
| `/components/chat.js` | `<engineer-chat>`, the conversation: ask / stream / stop, markdown, tool chips, `ask_user` card, image paste |
| `/components/chat.css` | its stylesheet — `chat.js` loads it into its own shadow root; a page does not link it |

**Page plumbing**

| file | what you get |
|---|---|
| `/theme.css` | the palette (`--surface`, `--fg`, `--accent`, …); an element you write inherits it |
| `/config.js` | `ENGINEER` — the ES module default / named export `{ static, ai, log }` |

**Libraries** — `/vendor/…`, ES modules

| file | what you get |
|---|---|
| `/vendor/js-yaml.js` | js-yaml 4.1.0 — default export: `load` / `dump` |
| `/vendor/markdown-it.js` | markdown-it 15.0.2 — default export: the `MarkdownIt` constructor |
| `/vendor/dompurify.js` | DOMPurify 3.4.15 — default export: `sanitize` |
| `/vendor/highlight.js` | highlight.js 11.12.0 — default export: `highlight` / `highlightAuto` / `getLanguage` |
| `/vendor/highlight.css` | the theme for the classes `highlight.js` emits |
| `/vendor/graph.js` | `@gravity-ui/graph` — a canvas graph library (React bundled); named exports only, no default: `Graph`, `CanvasBlock`, `Anchor`, `BaseConnection`, … |

The source files for all of it live under `workspace/web/`.

### A page that is more than chat

#### The conversation, inline

```html
<script type="module" src="/components/chat.js"></script>
<engineer-chat autofocus></engineer-chat>
```

That is the whole of `pure-chat`: no wrapper, no wiring — the element takes the session from the URL
and loads `/config.js` itself. `/components/…` is the shell's, so it is an absolute path.

#### Your own element, on `/vendor` and a library you downloaded

Keep the reference's entry (theme script, `/theme.css`) and add a module beside `index.html`, mounted
where `<engineer-chat>` sat. Your files are relative (`./my-view.js`, `./lib/…`) and travel with the
copy; the shell's are absolute (`/vendor/…`, `/components/…`). A library the shell does not ship is
downloaded beside them, never a CDN.

```js
// my-view.js — beside index.html, mounted as
// <my-view></my-view> + <script type="module" src="./my-view.js"></script>
import yaml from "/vendor/js-yaml.js";   // shipped by the shell
import dayjs from "./lib/dayjs.js";     // not shipped: downloaded into this blueprint

class MyView extends HTMLElement {
  connectedCallback() {
    this.textContent = Object.entries(yaml.load("built: " + dayjs().format("HH:mm")))
      .map(([k, v]) => k + "=" + v).join(" ");
  }
}
customElements.define("my-view", MyView);
```

#### Reading static or log

The addresses are an ES module, so they are imported and never typed into the page; the shapes of the
services behind them are in `docs/static.md` / `docs/log.md`:

```js
import { ENGINEER } from "/config.js";
const { static: STATIC, log: LOG } = ENGINEER;
const yaml = { "Content-Type": "application/yaml" };
const files = await (await fetch(STATIC + "/static/query", { method: "POST", headers: yaml, body: "{}" })).text();
const recs = await (await fetch(LOG + "/log/query", { method: "POST", headers: yaml, body: '{"pageNum":1}' })).text();
```

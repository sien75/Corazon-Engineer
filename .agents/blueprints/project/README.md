# Project

The agent instantiated from blueprint `project`. One page for the whole project — the seven
separate viewer pages it replaces (schema graph, contract index, how-to, iterations, log viewer,
resource browser, service endpoints) are now seven sections of this page.

## What this page is

- It is **your** UI. web serves it out of this blueprint directory at `/agent/<sessionId>/`.
  The page itself is the self-contained `index.html` next to this file; there is no other js or css.
- The left side is the section nav (`#overview` / `#contracts` / `#howto` / `#iterations` /
  `#records` / `#resources` / `#endpoints`), the right side is the current section. Switching goes
  through the hash, so a reload stays where you were.
- There are exactly two data sources: **static** (`/static/query` for the file listing,
  `/static/query-detail` for one file's body) and **log** (`/log/query` / `/log/query-detail`).
  Addresses are always imported from the same origin's `/config.js` (`{ ENGINEER }`), never hard-coded.
- Theme: the `<head>` sets `data-theme` / `color-scheme` and links `/theme.css` before first paint;
  the shell keeps them in sync afterwards.

## What each section reads

| section | content | source |
|---|---|---|
| Overview | atoms / edges tables plus counts per file kind | `static/query` |
| Contracts | `contracts/*.yaml`, list on the left, body on the right | `static/query-detail` (type `contract`) |
| How-to | the `how-to/` file list and bodies | type `how-to` |
| Iterations | iterations / plans / testing under `development/` | type `development` |
| Records | test / telemetry / conversation from log | log service |
| Resources | skills / suggested-skills / blueprints | type `skill` / `suggested-skill` / `blueprint` |
| Endpoints | the four service addresses and a read-only probe | `/config.js` |

## Do not

- Do not hard-code a service address: read it from `/config.js`.
- Do not replay conversation in this page: it is not a chat page (use `pure-chat` for that).
- Do not add write calls to static or log: this page is read-only.

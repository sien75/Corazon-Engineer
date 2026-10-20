# Project

The agent instantiated from blueprint `project`. One page for the whole project — the separate
viewer pages it replaces (schema graph, contract index, how-to, iterations, plans, log viewer,
resource browser, service endpoints) are now the sections of this page.

## What this page is

- It is **your** UI. web serves it out of this blueprint directory at `/agent/<sessionId>/`.
  The page itself is the self-contained `index.html` next to this file; there is no other js or css.
- Three columns: the section nav (`#overview` / `#contracts` / `#howto` / `#iterations` /
  `#plans` / `#records` / `#resources` / `#endpoints`), the current section, and the page's one
  `<engineer-chat>` on the right — the blueprint rule is exactly one chat, written statically in
  `index.html` (instantiation refuses 0 or 2). Switching sections goes through the hash, so a reload
  stays where you were and the conversation is untouched.
- There are exactly two data sources: **static** (`/static/query` for the file listing,
  `/static/query-detail` for one file's body, `/static/stream` for changes) and **log**
  (`/log/query` / `/log/query-detail`). Addresses are always imported from the same origin's
  `/config.js` (`{ ENGINEER }`), never hard-coded.
- The page is **live**: it subscribes to `/static/stream` (long-lived SSE) and re-renders the
  current section when a file the section shows is added, updated or removed — the selected file
  is re-selected after the reload. `records` and `endpoints` do not subscribe (log changes have no
  event; the endpoints view has a Reload button). The dot next to the nav brand is green while the
  stream is connected, grey while it retries.
- Theme: the `<head>` sets `data-theme` / `color-scheme` and links `/theme.css` before first paint;
  the shell keeps them in sync afterwards.

## What each section reads

| section | content | source |
|---|---|---|
| Overview | atoms / edges tables plus counts per file kind | `static/query` |
| Contracts | `contracts/*.yaml`, list on the left, body on the right | `static/query-detail` (type `contract`) |
| How-to | the `how-to/` file list and bodies | type `how-to` |
| Iterations | iterations / testing under `development/` | type `development` |
| Plans | `development/plans/<iteration number>/`, one group per directory | type `development` |
| Records | test / telemetry / conversation from log | log service |
| Resources | skills / suggested-skills / blueprints | type `skill` / `suggested-skill` / `blueprint` |
| Endpoints | the four service addresses and a read-only probe | `/config.js` |

## Do not

- Do not hard-code a service address: read it from `/config.js`.
- Do not replay conversation in this page: it is not a chat page (use `pure-chat` for that).
- Do not add write calls to static or log: this page is read-only.
- Do not poll: live updates come from `/static/stream`, which is POSTed and read through `fetch`
  (it is SSE but takes a body, so `EventSource` cannot be used).

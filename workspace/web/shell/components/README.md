# components

Front-end assets that are not the shell itself.

## `chat.js` — `<engineer-chat>`

The conversation view as a custom element. It is the only chat implementation:
the shell's main and every blueprint page mount the same element.

```html
<script type="module" src="/components/chat.js"></script>
<engineer-chat session="s_…" autofocus></engineer-chat>
```

- `session` — optional; without it the element reads `/agent/<sessionId>/` from
  the page's URL.
- `autofocus` — focus the composer on load.
- `no-history` — do not replay the conversation from log (the default is to
  replay: every mount reads its records back, so a page or a rebuilt tab shows
  the conversation instead of an empty screen — a view does not survive a
  reload, the records do).
- It imports `/config.js` itself (an ES module exporting `ENGINEER`), so a page
  only needs the element on the page.
- Shadow DOM + `chat.css` (beside this file); the theme's `--*` variables inherit
  from the page, so it follows the shell's palette.
- Event: `engineer-tool` (bubbling) with `{ name, isError }` after every tool call
  — the shell uses it to re-read the workspace after main's `session-*` tools.

It owns `POST /ai/ask`, `/ai/stream` (SSE, YAML frames, `seq` resume), `/ai/stop`,
markdown rendering (`/vendor/markdown-it` + DOMPurify + highlight), tool chips,
the `ask_user` card, image paste, and the history replay (`/ai/resume` +
`/log/session/messages` + blobs).

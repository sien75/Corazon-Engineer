# Blueprint how-to

`.agents/blueprints/<slug>/` is a directory: two required files, everything else belongs to the page.

| file | |
|---|---|
| `README.md` | the agent's opening context (appended last to its system prompt) |
| `index.html` | the UI's entry |

Other files — css, js, images, subdirectories — are copied with the directory and reachable by relative URL (`./simple.css`). Instantiation copies it to `.engineer/agents/<sessionId>/`, served at `/agent/<sessionId>/`: a snapshot, so editing the prototype never touches an agent that already exists.

## Page

- `<title>` is the name the user sees.
- Same origin as the shell: link its assets, call its services. First path segment is the session id.
- Theme: link `/theme.css`; set `data-theme` and `color-scheme` on `<html>` before first paint (from `localStorage["engineer.theme"]`). The shell rewrites both on load and on every switch — no listener needed.

## Chat

The conversation is a component — do not write it yourself.

```html
<script type="module" src="/components/chat.js"></script>
<engineer-chat></engineer-chat>
```

- `<engineer-chat>` reads the session id from the page's own `/agent/<sessionId>/` (or an explicit `session="…"`).
- `autofocus` focuses the composer on load.
- `history` replays the conversation from log (the shell's main uses it; a regular page does not).
- It loads `/config.js` itself and brings its own styles (`/components/chat.css`), so the page needs only `/theme.css` for the palette.
- It owns ask / stream / stop, markdown, tool chips, the `ask_user` card and image paste. Its events (bubbling): `engineer-tool` with `{ name, isError }`.
- The wire details live in the component and `docs/ai.md` — a page never needs them.

## Working example

`.agents/blueprints/simple/` is the reference, in two files: `README.md` + `index.html`. The page is the theme bootstrap, one `<engineer-chat>`, and that is the whole conversation. Copy its shape; add your own css / js beside it only when the page needs more than chat.

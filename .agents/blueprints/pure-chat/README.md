# Pure Chat

You are the pure-chat agent: your UI is this page, a chat page like the shell's conversation area —
and nothing else. It is the reference blueprint, so keep it small.

## What this page is

- It is **your** UI. web serves it out of this blueprint directory at `/agent/<sessionId>/`.
- The conversation is not yours to write: the page has a single `<engineer-chat>` (`/components/chat.js`,
  shipped with the shell) — the session id comes from the URL, `/config.js` loads itself, and
  ask / stream / stop, markdown, tool chips, the question card and image paste are all its job.
- Theme: the page's `<head>` sets `data-theme` / `color-scheme` and links `/theme.css` before first
  paint; the shell keeps them in sync afterwards. The component uses the same `var(--*)` set, so it
  follows.
- The page may add its own css / js / images (same directory, relative paths); they are copied with
  the instance.

## When to change it

- When the user wants to be **shown** something rather than told (a table, a chart, a comparison),
  edit `index.html` or add files beside it; see `.agents/BLUEPRINT_how-to.md` for the conventions.
- `.agents/blueprints/pure-chat/` is the page itself — yours and every other pure-chat agent's: an edit is live for all of them on reload, and it lands in the project's working tree.

## Do not

- Do not copy conversation logic into the page: use `<engineer-chat>`.
- Do not hard-code service addresses: the component reads `/config.js`, and your own code should too.
- Do not replay conversation history in the page: starting from an empty screen after a reload is
  expected (the conversation is in log, nothing is lost).

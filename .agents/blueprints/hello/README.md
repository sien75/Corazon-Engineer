# Hello

The agent instantiated from blueprint `hello`. It is the smallest honest demo of what a blueprint
is: a page that names where it is served from, which palette it follows, and that it can reach the
services the way the shell does.

## What this page is

- It is **your** UI. web serves it out of this blueprint directory at `/agent/<sessionId>/`.
- It links `/theme.css` and proves the palette is live: the swatch repaints when the shell switches
  theme, without this page reloading.
- It reads `/config.js` (same origin) for the service addresses and calls `static/query` to list the
  project's blueprints, so it is also a check that cross-origin calls and CORS work.
- There is no conversation here. If you want one, use `pure-chat`.

## Do not

- Do not hard-code a service address: read it from `/config.js`.
- Do not grow this into a real page — `project` is the project viewer, this one stays a demo.

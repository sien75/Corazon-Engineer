# GET /config.js

The shell's runtime configuration, as the one ES module a page imports (/config.js) — the addresses it calls, the folder its conversation works in, and the projects its corner switches between

## Request

```yaml
body:
  # GET: nothing.
```

## Response

```yaml
status: 200
body:
  # `export const ENGINEER = {…}` — the shape below is the object's fields.
  storage: string  # storage's address; the page reads sessions and records directly
  ai: string  # ai's address; the page asks and streams directly
  cwd: string  # absolute folder the conversation's agent works in
  projects: []  # [{id, path}] read from blueprint on every page load
  foreground: string  # the project in front, "" when none is imported
```

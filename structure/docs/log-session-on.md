# POST /log/session/on

Put existing sessions back on screen — add them to the open list (the shell's tab bar) without creating anything; idempotent. Only a session of kind sub is a tab — a main session is not opened here, it is made current with log-session-current-put

## Request

```yaml
body:
  sessionIds: [string]  # conversations to open; already-open ids keep their place
  index?: number  # where the first newly opened session goes in the open list; omitted appends
```

## Response

```yaml
status: 200
body:
  openSessions: [string]  # the whole open list after the write, in display order
```

## Errors

```yaml
- status: 400
  code: bad_request
  description: sessionIds missing, or one of them has no session row (the message names it)
- status: 500
  code: internal
  description: server internal error
```

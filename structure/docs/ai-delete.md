# POST /ai/delete

Delete an agent — its live session, its records and its session row, for good. Only a sub session, and only when the user explicitly wants it gone; never a main session (replace main instead — ai-new with kind=main, then log-session-current-put)

## Request

```yaml
body:
  id: string  # session id
```

## Response

```yaml
status: 200
body:
  sessionId: string
```

## Errors

```yaml
- status: 400
  code: bad_request
  description: bad request
- status: 404
  code: not_found
  description: session not found
- status: 500
  code: internal
  description: server error
```

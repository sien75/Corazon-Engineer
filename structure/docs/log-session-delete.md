# POST /log/session/delete

Delete a conversation session's records and its session row (POST /log/session/delete); the row carries its place on the tab bar and whether it was main, so both go with it

## Request

```yaml
body:
  sessionId: string  # conversation session id
```

## Response

```yaml
status: 200
body:
  sessionId: string  # echoed session id
  deleted: number  # number of records removed
```

## Errors

```yaml
- status: 400
  code: bad_request
  description: sessionId missing
- status: 500
  code: internal
  description: server error
```

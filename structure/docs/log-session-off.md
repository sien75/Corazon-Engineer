# POST /log/session/off

Close sessions — take them off the open list, keeping their records so they can be opened again

## Request

```yaml
body:
  sessionIds: [string]  # sessions to close; ids that are not open are ignored
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
  description: sessionIds missing
- status: 500
  code: internal
  description: server internal error
```

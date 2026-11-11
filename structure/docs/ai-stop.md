# POST /ai/stop

Abort the run currently streaming in a session; the session itself survives and can be asked again

## Request

```yaml
body:
  id: string  # session id
```

## Response

```yaml
status: 200
body:
  sessionId: string  # same session, now idle
```

## Errors

```yaml
- status: 404
  code: not_found
  description: session not found
- status: 500
  code: ai_error
  description: the abort itself failed
```

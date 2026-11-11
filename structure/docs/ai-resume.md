# POST /ai/resume

Resume an existing conversation session, rebuilding its text context from log records (to bring an earlier main back, ai-resume it, then point log-session-current-put at it); malformed history (orphan tool results, tool calls without a result, duplicate seq) is repaired in memory before it is replayed

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
  lastSeq: number  # last pi event seq already emitted for this session; 0 when freshly rebuilt
  active: boolean  # whether a run is in flight; a resuming client should reattach to /ai/stream when true
```

## Errors

```yaml
- status: 400
  code: bad_request
  description: bad request
- status: 404
  code: not_found
  description: session has no live session and no recorded history
- status: 500
  code: internal
  description: server error
```

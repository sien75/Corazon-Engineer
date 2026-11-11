# POST /log/session/messages

Fetch a conversation session's messages (full content), in chronological order

## Request

```yaml
body:
  sessionId: string  # conversation session id
```

## Response

```yaml
status: 200
body:
  sessionId: string
  messages:
    - seq: number  # per-session message sequence
      role: string  # user | assistant | toolResult | compaction
      content: string  # derived plain-text projection
      raw?: object  # the pi message (or compaction entry) verbatim; images are sha256 refs
      createdAt: string  # record creation time, RFC3339
```

## Errors

```yaml
- status: 400
  code: bad_request
  description: bad request
- status: 500
  code: internal
  description: server error
```

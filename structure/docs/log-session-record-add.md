# POST /log/session/record/add

Append one message record to a conversation session (POST /log/session/record/add); the ai service is the only writer, an agent never calls this — the shell reads these back as the conversation

## Request

```yaml
body:
  sessionId: string  # the conversation this message belongs to
  env?: string  # runtime env, unused for conversation records
  atom?: string  # related atom, unused for conversation records
  payload: object  # the message
    # seq, role, content, raw
    #   role: user | assistant | toolResult | compaction
    #   content: derived plain-text projection (session list preview / search)
    #   raw: the pi message (or compaction entry) verbatim; the source of truth.
    #        Image bytes are stored as content-addressed refs
    #        { type: image, sha256, mimeType, size } and re-inlined on read.
```

## Response

```yaml
status: 200
body:
  id: string  # assigned record id
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

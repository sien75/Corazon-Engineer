# POST /log/workspace/stream

Subscribe to workspace changes — one event after each write that changes which sessions exist, which are open, which is main, a session's name, or which projects are on the board; an event carries no content, the subscriber re-reads (log-session-current-get, log-session-list, log-project-list)

## Request

```yaml
body: {}
```

## Response

```yaml
status: 200
stream: sse  # body below is the schema of each event
body:
  seq: number  # 1 for the event sent at once on connecting, then +1 per event; several quick changes may share one event
  updatedAt: string  # when the change happened (on connecting: now), RFC3339
```

## Errors

```yaml
- status: 500
  code: internal
  description: server error
```

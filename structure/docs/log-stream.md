# POST /log/stream

Subscribe to record stream; frontend receives each new record in real time

## Request

```yaml
body:
  env?: string  # runtime env filter
  kinds?: string  # comma-separated filter, e.g. "test,telemetry"
```

## Response

```yaml
status: 200
stream: sse  # body below is the schema of each event
body:
  seq: number  # event sequence
  record:
    id: string
    createdAt: string  # record creation time, RFC3339
    kind: test | telemetry | conversation
    env?: string
    atom?: string
    summary: string  # one-line summary
  done?: boolean  # last event of the stream
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

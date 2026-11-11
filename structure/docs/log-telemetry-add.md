# POST /log/telemetry/add

Append one telemetry record (POST /log/telemetry/add) — the result of a listening / observation pass (a trace, a metric, a log tail). log stores it in the telemetry table; the payload is kept as written

## Request

```yaml
body:
  env?: string  # runtime env observed, e.g. local-macos
  atom?: string  # the atom / tool observed
  payload: object  # the observation
    # signal: trace | metric | log
    # query: what was listened to
    # result: what was seen
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

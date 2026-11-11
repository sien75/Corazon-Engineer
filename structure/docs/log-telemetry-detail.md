# POST /log/telemetry/detail

Fetch one telemetry record's full payload (POST /log/telemetry/detail); a row of another kind is not found here, even with a valid id

## Request

```yaml
body:
  id: string  # record id
```

## Response

```yaml
status: 200
body:
  id: string
  createdAt: string  # record creation time, RFC3339
  kind: telemetry
  env?: string
  atom?: string
  sessionId?: string
  payload: object  # signal, query, result
```

## Errors

```yaml
- status: 400
  code: bad_request
  description: bad request
- status: 404
  code: not_found
  description: record not found
- status: 500
  code: internal
  description: server error
```

# POST /log/search

Full-text search across records

## Request

```yaml
body:
  q: string  # search query
  pageNum?: number  # page number, 1-based, default 1
```

## Response

```yaml
status: 200
body:
  q: string
  results:
    - id: string
      createdAt: string  # record creation time, RFC3339
      kind: test | telemetry | conversation
      summary: string  # one-line summary
      snippet: string  # matched snippet
  pageNum: number  # echoed page number
  hasMore: boolean  # whether more pages exist
  pageSize: 100  # fixed page size, 100 records per page
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

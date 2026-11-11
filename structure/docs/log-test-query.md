# POST /log/test/query

List test records (POST /log/test/query), newest first — one page of the runs, without their payloads. The kind is the endpoint's, so no body names it

## Request

```yaml
body:
  env?: string  # runtime env filter
  atom?: string  # related atom filter
  start?: string  # start time, RFC3339
  end?: string  # end time, RFC3339
  pageNum?: number  # page number, 1-based, default 1
```

## Response

```yaml
status: 200
body:
  records:
    - id: string  # record id
      createdAt: string  # record creation time, RFC3339
      kind: test
      env?: string
      atom?: string
      summary: string  # one-line summary for list display
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

# POST /log/test/add

Append one test record (POST /log/test/add) — a runtime test an agent or a case actually ran, with what it asked, what came back and whether it passed. log stores it in the test table; the payload is kept as written, so a new field needs no migration

## Request

```yaml
body:
  env?: string  # runtime env the test ran in, e.g. dev | prod | local
  atom?: string  # the atom under test, when one owns it
  payload: object  # the run
    # case: the case name / id
    # atoms: [string] the atoms it touched
    # req: what was driven (command, route, page)
    # resp: what came back
    # result: pass | fail | partial
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

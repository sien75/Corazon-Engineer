# DELETE /config/projects

Remove an imported project — it stops running, and nothing else about it is touched. The folder is the user's and its databases are data, so both stay exactly where they are

## Request

```yaml
body:
  # query parameter, not a body
  id: string  # the project to remove, as ?id=<id>
```

## Response

```yaml
status: 200
body:
  projects: []  # [{id, path}] with the project gone
  foreground: string  # the next project in front, or "" when that was the last one
```

## Errors

```yaml
- status: 400
  code: bad_request
  description: id missing, or naming no imported project
- status: 500
  code: internal
  description: config.yaml could not be written
```

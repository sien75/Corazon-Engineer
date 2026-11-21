# POST /config/projects/foreground

Bring an imported project to the front — which project /bp lists and which one the launcher points at. Nothing is started or stopped — a project behind the front is still running its flows and its init scripts

## Request

```yaml
body:
  id: string  # the project to bring to the front
```

## Response

```yaml
status: 200
body:
  projects: []  # [{id, path}], unchanged
  foreground: string  # the project now in front
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

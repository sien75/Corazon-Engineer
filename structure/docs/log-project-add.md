# POST /log/project/add

Put a folder on the project board. The store does not look at the filesystem — web checks that the path really is an engineer project before calling this. A path already on record keeps its projectId (re-adding a folder brings its conversations back instead of starting an empty project beside them)

## Request

```yaml
body:
  path: string  # absolute folder path; a relative one is refused
  name?: string  # display name; "" keeps the stored one (a new row falls back to the folder name)
```

## Response

```yaml
status: 200
body:
  projectId: string
  path: string
  name: string
  createdAt: string
  updatedAt: string
  visible: boolean  # a newly added project is visible; re-adding keeps the stored state
```

## Errors

```yaml
- status: 400
  code: bad_request
  description: path missing or not absolute
- status: 500
  code: internal
  description: server internal error
```

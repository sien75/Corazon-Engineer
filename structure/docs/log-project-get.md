# POST /log/project/get

Read one project by id, removed or not — static, ai and web turn a projectId into the folder it serves / runs in. A removed project still answers, so a conversation made in it keeps working

## Request

```yaml
body:
  projectId: string  # p_<12 hex>
```

## Response

```yaml
status: 200
body:
  projectId: string
  path: string  # absolute folder path
  name: string
  createdAt: string
  updatedAt: string
  removedAt?: string  # set when the project is off the board; absent while it is on it
  visible: boolean  # whether its group is drawn in the titlebar
```

## Errors

```yaml
- status: 400
  code: bad_request
  description: projectId missing
- status: 404
  code: not_found
  description: no such project
- status: 500
  code: internal
  description: server internal error
```

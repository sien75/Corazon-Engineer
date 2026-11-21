# GET /config/projects

The blueprints folders this machine has imported, and which one is in front — the shell draws a switcher from it, and /bp lists the front one. Every imported project runs; switching the front starts and stops nothing

## Request

```yaml
body:
  # GET: nothing.
```

## Response

```yaml
status: 200
body:
  projects: []  # [{id, path}] in import order; id is the folder's name, made safe and made distinct (notes, notes-2)
    # id: string    — the project's identity: in every blueprint URL, and the name of its data directory
    # path: string  — absolute path of the folder the user imported
  foreground: string  # the project in front, or "" when none is imported. Read fresh on every request, so a hand edit of config.yaml is seen without a restart
```

## Errors

```yaml
- status: 500
  code: internal
  description: config.yaml could not be read
```

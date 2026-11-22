# POST /config/blueprints/folder

Associate a folder with a blueprint that has an ai node — the folder its agent works in. It is a fact about this machine, so it is kept in the data home's config.yaml (`folders`, keyed "<project>/<slug>") and never in the blueprint file. The shell asks for it the first time such a blueprint is opened, and the blueprint does not open without it

## Request

```yaml
body:
  project: string  # the project's id
  slug: string  # the blueprint's file name without .html
  path: string  # an absolute path ("~/" is expanded); the folder must exist
```

## Response

```yaml
status: 200
body:
  folder: string  # the folder as kept, absolute and cleaned
```

## Errors

```yaml
- status: 400
  code: bad_request
  description: project or slug missing or malformed, no such project, or the path is empty, not absolute, or not an existing folder
- status: 405
  code: bad_request
  description: not a POST
```

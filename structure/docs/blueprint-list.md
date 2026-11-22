# GET /config/blueprints

The blueprints of the front project, in file order — what the shell's strip lists and frames. Read from the project's prod registry, so it is what is actually loaded rather than a second reading of the folder

## Request

```yaml
body:
  # GET: nothing. The project is the one in front.
```

## Response

```yaml
status: 200
body:
  project: string  # the front project's id, "" when none is imported
  blueprints: []   # [{slug, title, url}], file order; empty when the project has no .html files
    # slug:  string — the file's name without .html, unique inside its folder
    # title: string — the page's <title>, or the slug when it has none
    # url:   string — where the page is served: /bp/<project>/<slug> (prod)
```

## Errors

```yaml
- status: 405
  code: bad_request
  description: not a GET
```

# Blueprint how-to

How to write a Blueprint: the two files, the page's `<title>`, the shell theme, and a minimal entry template.

## Exactly two files

A Blueprint is the directory `.agents/blueprints/<slug>/` holding `README.md` + `index.html` and nothing else. A third file makes instantiation fail with `400 bad_request`.

- `README.md` — the opening context of the Agent instantiated from this Blueprint (appended to the end of its system prompt). Write it for the Agent: what this Agent is, what its UI is for, how to drive it.
- `index.html` — the UI itself, **self-contained**: all css / js inline, no sibling files.

## The page

- The document's `<title>` is the name the user sees.
- The copy is served at `/agent/<sessionId>/`, same origin as the shell, so the page can link the shell's stylesheet and call the services.
- Follow the shell's theme: link `/theme.css`, use its `var(--*)` variables, and set `data-theme` on `<html>` before first paint so the page does not flash the wrong palette.

Minimal entry:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>A readable name</title>
  <script>
    document.documentElement.setAttribute(
      "data-theme", localStorage.getItem("engineer.theme") || "light");
  </script>
  <link rel="stylesheet" href="/theme.css">
  <style>
    body { margin: 0; padding: 24px; font-size: 13px; }
  </style>
</head>
<body>
  ...
</body>
</html>
```

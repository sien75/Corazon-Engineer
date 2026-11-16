# Blueprint

A blueprint is a project's page for an agent: a directory `.agents/blueprints/<slug>/`. Blueprint is the class, a session made from it is the instance.

## Shape

| file | |
|---|---|
| `README.md` | required — the agent's opening context (appended last to its system prompt) |
| `index.html` | required — the page's entry |

Everything else — css, js, images, subdirectories — belongs to the page and is reached by relative URL (`./my-view.css`).

- The directory itself is what gets served, at `/agent/<sessionId>/`. There is no per-agent copy: an edit is every agent's page on reload, and it lands in the project's working tree.
- `<title>` is the name the user sees.
- Instantiation checks only that both files exist.

## Self-contained

A blueprint stands on its own. The shell's own components, libraries and styles are the shell's: a page does not rely on them. Whatever a page needs — a library, a stylesheet, an image — is a file in the blueprint directory, referenced relatively. A library is downloaded into the directory, never loaded from a CDN.

## Changing one

- When the user says what to change, `write` / `edit` the files and ask for a reload — no proposal round.
- Keep `README.md` true to the page: it is what the agent is told about the UI it drives.

## Suggesting one

- Suggest a blueprint when the same topic keeps coming back, or when what the user wants is easier to see than read (list, table, chart, flow, diff, comparison).
- Prefer extending an existing blueprint over a new one.
- Propose in one or two sentences — what it shows, where the data comes from, new or changed — and touch nothing until the user agrees.

# Blueprint

A blueprint is one HTML file, `.agents/blueprints/<slug>.html`. It carries its own page, its own tables, its own orchestration and its own backend scripts, and it runs when the blueprint service opens it — `/b/<slug>`.

## Shape

```html
<!doctype html>
<title>Display name</title>
<meta id="author.thing">

<script type="blueprint/sql">
  CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, body TEXT);
</script>

<script type="blueprint/flow">
  - on: ui.save
    steps:
      - id: clean
        run: trim
      - sql: INSERT INTO notes(body) VALUES(:body)
        with: { body: ${{ steps.clean.output.text }} }
      - emit: ui.saved
</script>

<script type="blueprint/js" id="trim">
export default async (input) => ({ text: String(input.text || "").trim() });
</script>

<body>
  <script>
    bp.watch("notes", (rows) => { /* draw */ });
    document.querySelector("button").onclick = () => bp.emit("ui.save", { text: "hi" });
  </script>
</body>
```

- No `<html>`, no `<head>`, and `</body>` may be left off. Order: `<title>`, `<meta id>`, sql, flow, scripts, then `<body>`. Every backend block must come before the first thing that is body content — the parser starts the body at the first element that is not head material.
- `<title>` is the display name. `<meta id>` is the identity: it names the blueprint's sqlite, so the data outlives the file being deleted and re-added. It is letters, digits, `.`, `_`, `-`.
- Only what the browser is meant to run goes in `<body>`. Everything else is a backend block.

## Backend blocks

All of them are `<script type="blueprint/…">`: the browser skips them, and the service cuts them out of the page it serves, so backend code and schema never reach the browser.

- **`blueprint/sql`** — plain sqlite against this blueprint's own database. It runs on every open, so write `CREATE TABLE IF NOT EXISTS`; never drop or recreate a table that holds data.
- **`blueprint/flow`** — YAML, a list of rules. See below.
- **`blueprint/<kind> id="…"`** — one script, addressed by id from a flow. Kinds: `js` (bun, default export), `sh`, `bash`, `py`; anything else is taken as the command name.

Inner content may contain `</script>` only written as `<\/script>` (and `<!--` as `<\!--`); the service restores them when it loads the file.

## Flow

```yaml
- on: ui.save            # the event type that starts this rule
  steps:
    - id: clean           # optional: addressable as ${{ steps.clean.output }}
      run: trim           # run a script by id
      with: ${{ event.data }}   # this step's input; defaults to the previous step's output
    - sql: INSERT INTO notes(body) VALUES(:body)
      with: { body: ${{ steps.clean.output.text }} }
    - emit: ui.saved      # put an event on the bus, including back to the page
```

- Exactly one of `run`, `sql`, `emit`, `ai` per step.
- `with` is the step's input: a `${{ … }}` expression on its own (`event.data`, `event.data.<key>`, `steps.<id>.output[.<key>]`), or a map of them. No other expressions, no `if`, no loops.
- A step's output is the next step's input, so a rule is a chain: script → script → write → notify.
- Scripts are pure: they do not write the database and do not emit. Both happen in the flow, which is why the flow is the one place that shows what the blueprint actually does.

## Script contract

One JSON in, one JSON out, in every language: `input` on stdin (also `BP_INPUT`), the result as JSON on stdout (`BP_BLUEPRINT`, `BP_SCRIPT` are set), a non-zero exit for failure. A `sh` script that prints one line is fine — non-JSON stdout is passed on as a string. stderr is pushed to the page line by line while the script runs, as `log` events. A script runs in the blueprint's own work directory.

## The page's channel

Attached at the top of the document, so the page's own scripts can use it immediately.

| call | |
|---|---|
| `bp.emit(type, data)` | put an event on the bus — flows listening for `type` start now |
| `bp.on(type, cb)` | listen; the stream carries every event, including the page's own emits and script logs |
| `bp.watch(table, cb)` | draw a table: `cb(rows)` once with the current rows, again with the whole table after every write |
| `bp.sql(sql, params)` | a statement the table protocol cannot express; `:name` params as an object, or positional as a list |

The `ai` step (`- ai: { prompt: … }`) is the way a blueprint asks the ai service something; its output is the reply text. A blueprint never holds a conversation of its own.

## Rules of thumb

- Tables are the protocol: what the page draws and what a flow writes is one `CREATE TABLE`, and a page listens to a table instead of to a hand-written endpoint.
- One file: if something has to be shared, add a table, not a second file.
- Opening the page reloads the blueprint. There is no hot reload, and the database is kept.
- The schema and the scripts are for the service, not for the browser; do not repeat them in page JavaScript.
# Blueprint

A blueprint is one HTML file, `<project folder>/<slug>.html`. It carries its own page, its own tables,
its own orchestration and its own backend scripts.

Blueprints live in **projects**: a project is one blueprints folder, imported in the engineer web UI
(the corner switcher, or the dialog the shell opens when there is none yet) and remembered in the data
home's `config.yaml`. Every imported project runs, whether or not it is in front; the switcher only
decides which one `/bp` lists. The folders are the user's, and may be under git.

A blueprint's address carries its project: `/bp/<project>/<slug>` is **prod** — the user's copy — and
`/bp-dev/<project>/<slug>` is **dev**, with its own database
(`<home>/projects/<project>/blueprints/<id>.prod.sqlite` / `<id>.dev.sqlite`). Prod starts when the
project is imported, whether a page is open or not; dev starts when its page is first opened. Neither
reloads when the file changes: the page has one **reload** (prod) / **restart** (dev) button in its
corner, and that is the only way a change takes effect.

## Working on a blueprint

Blueprints belong to the user and live in the user's folders, so touch one only when asked.

- **Changing one.** Edit the single `.html` file, then ask the user to press the page's reload button (prod) or restart button (dev). Nothing reloads by itself, and opening the page doesn't reload it either. You don't need to propose first; just make the change.
- **Suggesting a new one.** Suggest one when the same topic keeps coming up, or when the user wants something that is easier to see than to read (a list, table, chart, flow, diff or comparison). If an existing blueprint could be extended, prefer that. Describe the idea in a sentence or two: what it shows, where its data comes from, and whether it's new or a change. Don't touch anything until the user agrees. A new blueprint is one `.html` file with a `<title>` and a `<meta id>`.
- **Checking your work.** After a change, check that `/bp/<project>/<slug>` (or the `/bp-dev/` one) still responds. Then tell the user what you checked, and what only they can see on the page after reloading. There is no fuller way to verify a blueprint yet, so keep this simple.
- **Which folder.** If the user hasn't said which imported folder a blueprint belongs in, ask. Removing a folder from Engineer doesn't delete it or its data, and adding it back restores both.

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

<script type="blueprint/init.js">
// Starts with the runtime, not with a page: each stdout line is one event.
export default async () => {
  console.log(JSON.stringify({ emit: "sys.ready", data: { at: Date.now() } }));
  await new Promise(() => {}); // keep running: this is where a listener lives
};
</script>

<body>
  <script>
    bp.watch("notes", (rows) => { /* draw */ });
    document.querySelector("button").onclick = () => bp.emit("ui.save", { text: "hi" });
  </script>
</body>
```

- No `<html>`, no `<head>`, and `</body>` may be left off. Order: `<title>`, `<meta id>`, sql, flow, scripts (init last), then `<body>`. Every backend block must come before the first thing that is body content — the parser starts the body at the first element that is not head material.
- `<title>` is the display name. `<meta id>` is the identity: it names the blueprint's sqlite, so the data outlives the file being deleted and re-added. It is letters, digits, `.`, `_`, `-`.
- Only what the browser is meant to run goes in `<body>`. Everything else is a backend block.

## Backend blocks

All of them are `<script type="blueprint/…">`: the browser skips them, and the service cuts them out of the page it serves, so backend code and schema never reach the browser.

- **`blueprint/sql`** — plain sqlite against this blueprint's own database. It runs on every open, so write `CREATE TABLE IF NOT EXISTS`; never drop or recreate a table that holds data.
- **`blueprint/flow`** — YAML, a list of rules. See below.
- **`blueprint/<kind> id="…"`** — one script, addressed by id from a flow. Kinds: `js` (bun, default export), `sh`, `bash`, `py`; anything else is taken as the command name.
- **`blueprint/init.<kind>`** — at most one, and it has no `id`: no flow runs it. It starts when the blueprint starts and runs until the blueprint is reloaded or it dies, so it is where a blueprint **listens** — to a file, a socket, a timer, anything. Its stdout is not its output: each line is one event, `{"emit":"<type>","data":{…}}`, put on the bus as `source: init`; a line that is not one becomes a `log` event. Its stderr is `log` events like any other script's. It does not write the database — it emits, and a flow writes. It has no timeout, and nothing restarts it when it exits (a reload does).

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

- Exactly one of `run`, `sql`, `emit` per step.
- `with` is the step's input: a `${{ … }}` expression on its own (`event.data`, `event.data.<key>`, `steps.<id>.output[.<key>]`), or a map of them. No other expressions, no `if`, no loops.
- A step's output is the next step's input, so a rule is a chain: script → script → write → notify.
- Scripts are pure: they do not write the database and do not emit. Both happen in the flow, which is why the flow is the one place that shows what the blueprint actually does. The exception is the init script, which emits because no flow runs it.

## Script contract

One JSON in, one JSON out, in every language: `input` on stdin (also `BP_INPUT`), the result as JSON on stdout, a non-zero exit for failure. A `sh` script that prints one line is fine — non-JSON stdout is passed on as a string. stderr is pushed to the page line by line while the script runs, as `log` events.

The environment says where a script runs: `BP_BLUEPRINT` (the id), `BP_SCRIPT`, `BP_SCRIPT_FILE`, `BP_MODE` (`prod` or `dev`), and `BP_AI` (the ai service's address). It runs **in its project's blueprints folder** — `process.cwd()` is that folder, and that is also the `cwd` to give `/ai/new`.

## The page's channel

Attached at the top of the document, so the page's own scripts can use it immediately.

| call | |
|---|---|
| `bp.emit(type, data)` | put an event on the bus — flows listening for `type` start now |
| `bp.on(type, cb)` | listen; the stream carries every event, including the page's own emits and script logs |
| `bp.watch(table, cb)` | draw a table: `cb(rows)` once with the current rows, again with the whole table after every write |
| `bp.sql(sql, params)` | a statement the table protocol cannot express; `:name` params as an object, or positional as a list |
| `bp.reload()` | read the file again and start it over, then reload the page — what the corner button does |

`bp.mode` is `"prod"` or `"dev"`, from the address the page came from.

`bp.addr` holds the two addresses a page may call: `bp.addr.ai` and `bp.addr.storage`. A page has no
other way to learn them (a backend script gets `BP_AI` instead). A blueprint that keeps a conversation
stores the session id in its own table and calls ai with `bp.addr.ai` from the page; a blueprint that
wants the shell's help raising one calls `POST /chat/session` on its own origin.

## Asking the ai service

There is no `ai` step: a script calls the ai service itself. Its address is in the environment as `BP_AI`, and the conversation's id lives in the blueprint's own table, so the flow decides when a conversation is kept and when it is replaced.

```yaml
- on: ui.ask
  steps:
    - id: read
      sql: SELECT sid FROM chat WHERE id = 1
    - id: reply
      run: ask
      with:
        sid: ${{ steps.read.output.0.sid }}
        prompt: ${{ event.data.q }}
    - sql: INSERT INTO chat(id, sid) VALUES(1, :sid) ON CONFLICT(id) DO UPDATE SET sid = excluded.sid
      with:
        sid: ${{ steps.reply.output.sid }}
    - emit: ui.reply
      with:
        reply: ${{ steps.reply.output.reply }}
```

- A `sql` read answers with a list of rows, so a column of the first row is `steps.<id>.output.0.<column>`.
- The write back is an **upsert** (`ON CONFLICT … DO UPDATE`), not an `UPDATE`: the first conversation has no row yet, and an `UPDATE` matches nothing.
- Keep the id in a table (`CREATE TABLE IF NOT EXISTS chat(id INTEGER PRIMARY KEY, sid TEXT)`): read it with a `sql` step, hand `{ sid, prompt, system? }` to the script, write the returned `sid` back. No row (or an empty `sid`) means a new conversation; deleting the row is how a blueprint starts over.
- No `sid` → `POST /ai/new { cwd, system }`, the one place the system prompt is given. With a `sid` → no `system` again, and `POST /ai/resume { id }` first (after an engineer restart the live session is gone) — keep its `lastSeq`.
- Then `POST /ai/ask { id, blocks: [{ type: "text", text }] }` and read `POST /ai/stream { id, since }` until `agent_settled`. **`since` must be the `lastSeq` from resume** (0 for a new session), or the previous turn's `agent_settled` ends the read at once with an empty reply. The reply text is in `text_delta` events.
- Bodies may be JSON (YAML parses it); answers are YAML (`Bun.YAML.parse` in a `js` script); the stream is SSE with the event as YAML in its `data:` lines.

A `js` script that does all of it — `{ sid?, prompt, system? }` in, `{ sid, reply }` out:

```js
export default async ({ sid, prompt, system }) => {
  const ai = process.env.BP_AI;
  const post = async (path, body) => {
    const r = await fetch(ai + path, { method: "POST", headers: { "Content-Type": "application/yaml" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
    return r;
  };
  const yaml = async (r) => Bun.YAML.parse(await r.text());

  let since = 0;
  if (!sid) sid = (await yaml(await post("/ai/new", { cwd: process.cwd(), system }))).sessionId;
  else since = (await yaml(await post("/ai/resume", { id: sid }))).lastSeq;

  await post("/ai/ask", { id: sid, blocks: [{ type: "text", text: prompt }] });

  let reply = "", buf = "";
  const res = await post("/ai/stream", { id: sid, since });
  for await (const chunk of res.body.pipeThrough(new TextDecoderStream())) {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i); buf = buf.slice(i + 2);
      const text = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
      if (!text) continue;
      const ev = Bun.YAML.parse(text);
      const d = ev.assistantMessageEvent;
      if (ev.type === "message_update" && d?.type === "text_delta") reply += d.delta;
      if (ev.type === "error") throw new Error(ev.error?.message ?? "ai error");
      if (ev.type === "agent_settled") return { sid, reply };
    }
  }
  return { sid, reply };
};
```

## Rules of thumb

- Tables are the protocol: what the page draws and what a flow writes is one `CREATE TABLE`, and a page listens to a table instead of to a hand-written endpoint.
- One file: if something has to be shared, add a table, not a second file.
- The page's corner button reloads the blueprint; nothing else does. Opening the page does not reload, the file changing does not reload, and the database is kept across both.
- Listening lives in the init script, not in the page: the blueprint runs whether or not anyone is looking at it, and a page only decides whether it is there to see the events.
- prod and dev are the same file with two databases: what you are working on never writes what the user is using.
- The schema and the scripts are for the service, not for the browser; do not repeat them in page JavaScript.
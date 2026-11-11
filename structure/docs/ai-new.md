# POST /ai/new

Instantiate an agent from a blueprint; whether it is on screen is the caller's business — log-session-on puts a sub agent there, and if that call fails the caller deletes the new session with ai-delete; a new main (kind=main) becomes the shell's main with log-session-current-put

## Request

```yaml
body:
  projectId?: string  # p_<12 hex> — the project the agent belongs to: its folder is the agent's cwd and the blueprint tree its page comes from. Required for kind=sub, absent for kind=main (main is global and belongs to no project)
  blueprint?: string  # slug of a prototype under that project's .agents/blueprints/<slug>/. Required for an agent that has a page, absent for kind=main; omitted on kind=sub it is the project's own chat (the shell creates one on the first message of its home page) — no page, no README appended, blueprint empty on the row. README.md and index.html are required; every other file (css / js / images / subdirectories) is served from the same directory by relative URL. The directory is not copied — /agent/<sessionId>/ serves it directly — and its README plus its path are appended to this session's system prompt; the slug and the page's <title> are recorded on the session row in log
  kind?: main | sub  # the role: "main" is the shell's own conversation (no blueprint), "sub" is a blueprint agent (default)
  chat?: string  # provider/model-id of the chat model this agent runs, chosen here instead of the role default; omitted means the `chat` of this kind in the engineer home's models.yaml (main / sub). It is recorded on the session row, and a `model` tool switch with slot=chat overrides it from then on (that choice is persisted too, so it survives a restart)
  image?: string  # provider/model-id of the image-generation model this agent uses; omitted means the role's `image` in models.yaml. It is recorded on the session row, and a `model` tool switch with slot=image overrides it later. The `image` tool generates with it from the next call on
  model?: string  # deprecated alias for `chat`, kept so older callers keep working
```

## Response

```yaml
status: 200
body:
  sessionId: string  # the new agent. It is not on screen yet: a tab is this session, and log-session-on puts it up. Its UI is served at /agent/<sessionId>/
  kind: main | sub  # echoed role; the session row in log stores it
  chat: string  # the chat model named for this agent, "" when the role default applies
  image: string  # the image-generation model named for this agent, "" when the role's `image` applies
```

## Errors

```yaml
- status: 400
  code: bad_request
  description: blueprint missing, unknown, or lacking one of its two required files (README.md, index.html); projectId missing for kind=sub, or naming no known project; kind not main | sub; chat or model naming one pi cannot use right now, or image not shaped provider/model-id
- status: 500
  code: internal
  description: server error
```

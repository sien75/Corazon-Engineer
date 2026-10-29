# Models

Which model a conversation runs, and where to change what. Short on purpose: the
rules, the one file Engineer owns, and the files pi owns.

## The three layers

Strongest claim first, chat and image separately:

1. **The session's own row** (`model` / `imageModel` in log) — what the `model`
   tool switched it to, or what it was created with (session-new's `chat` /
   `image`). This is the only place a conversation's choice lives: nothing goes
   into the conversation's records, so a restart reads back exactly one answer.
2. **`models.yaml`** — Engineer's own file, one `chat` and one `image` per role
   (`main`, `sub`). The default for any session with no choice of its own.
3. **pi's own default** — **chat only**: `defaultProvider` / `defaultModel` from
   pi's settings when pi can serve it, else the first model pi can serve. The
   image slot stops at layer 2 (empty = not configured: there is no image runtime
   yet).

A name that cannot be resolved right now is skipped with a warning in the ai
service's log, and the next layer applies. Nothing is ever written back to pi's
settings by a session.

## models.yaml

`<engineer home>/models.yaml` — `.engineer/` inside the checkout for a dev run,
`~/.engineer/data` for a packaged one.

```yaml
main:
  chat: deepseek/deepseek-flash
  image: ""
sub:
  chat: deepseek/deepseek-flash
  image: ""
```

- a value is `provider/model-id`, split at the first `/` (an image id may hold
  more slashes: `openrouter/black-forest-labs/flux.2-flex`);
- `chat` cannot be empty; `image` may be (`""` = not configured);
- the file is read fresh for every session built or resumed, so an edit reaches
  the next one — never a running conversation.

Change it by editing the file (`edit` — a targeted change keeps the comments;
`write` replaces the whole document, so carry them over). Two checks before you
write: a `chat` value must be a `provider/model-id` that pi can serve right now
(`model list` says which), and an `image` value must have that shape or be `""`.
The file is not validated for availability at read time — a name pi cannot serve
is skipped with a warning when a session is built — so a typo does not corrupt
anything, it just does nothing.

## pi's own config

pi owns the catalog, the credentials and its own settings. They live in
`~/.pi/agent/` (or `$PI_CODING_AGENT_DIR` when set):

| file | what it is | who may change it |
|---|---|---|
| `auth.json` | API keys / OAuth per provider — **credentials** | the user, by logging in. Never handle keys yourself. |
| `models.json` | the provider and model catalog — what `model list` shows | you, with `write` / `edit` |
| `settings.json` | `defaultProvider` / `defaultModel` (layer 3), thinking levels, theme, packages | you, with `write` / `edit` |

Credentials are the line: everything else is configuration you may edit, auth is
the user's. A provider with no credential does not show up in the catalog at all,
and a switch to one of its models fails.

The thinking level is not configured per conversation anywhere: pi derives it per
model from `settings.json` (that model's entry in `modelThinkingLevels`, else the
global default). Switching a model does not freeze a level — a resumed
conversation gets whatever pi's settings say at that moment.

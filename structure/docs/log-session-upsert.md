# POST /log/session/upsert

Store a conversation's folder, the text appended to its system prompt, its display name and the chat / image models it runs; an existing row keeps its createdAt and takes the new values (an empty one keeps the stored value)

## Request

```yaml
body:
  sessionId: string  # conversation session id
  cwd?: string  # absolute folder the agent works in; "" on a later write keeps the stored one
  system?: string  # text appended to the session's system prompt; "" on a later write keeps the stored one
  title?: string  # display name; "" for a session with no name yet, replaced by the title ai summarizes from the first turn
  model?: string  # provider/model-id of the chat model this session runs, or "" when the models.yaml default applies; written at creation and again on every `model` tool switch with slot=chat
  imageModel?: string  # provider/model-id of the image-generation model, or "" when the models.yaml default applies; written at creation and again on every `model` tool switch with slot=image
```

## Response

```yaml
status: 200
body:
  sessionId: string
  cwd: string  # absolute folder the agent works in, "" when none was ever written
  system: string  # the text carried on the session's system prompt, "" when none
  title: string  # display name, "" when none was ever written
  model: string  # provider/model-id of the chat model chosen for this session, "" when the models.yaml default applies
  imageModel: string  # provider/model-id of the image-generation model chosen for this session, "" when the models.yaml default applies or none is set
  createdAt: string  # first write time, RFC3339
```

## Errors

```yaml
- status: 400
  code: bad_request
  description: sessionId missing
- status: 500
  code: internal
  description: server internal error
```

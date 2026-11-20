# POST /log/session/detail

Read one conversation's folder, system text, display name and the chat / image models it runs; a session with no row is not an error to the caller, but this endpoint answers 404

## Request

```yaml
body:
  sessionId: string  # conversation session id
```

## Response

```yaml
status: 200
body:
  sessionId: string
  cwd: string  # absolute folder the agent works in, "" when none was ever written
  system: string  # text carried on the session's system prompt, "" when none
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
- status: 404
  code: not_found
  description: session does not exist
- status: 500
  code: internal
  description: server internal error
```

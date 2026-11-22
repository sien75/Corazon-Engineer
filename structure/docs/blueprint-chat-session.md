# POST /chat/session

Raise the shell's conversation — one call, one session. blueprint composes the text the agent is given (the spec in its agents/ folder, plus where the reference files and Engineer's own folder are and the addresses it may call) and hands it to ai with the folder the agent works in; ai knows nothing else about what the conversation is for

## Request

```yaml
body:
  # POST: nothing. The folder and the spec come from this service's own
  # configuration, not from the caller: a page is not trusted to name either.
```

## Response

```yaml
status: 200
body:
  sessionId: string  # the new conversation. The page resumes it (ai) and replays its records (storage) itself
  chat: string  # the chat model named on the session row, "" when the data home's models.yaml decides
  image: string  # the image model named on the session row, "" when models.yaml decides
```

## Errors

```yaml
- status: 405
  code: bad_request
  description: not a POST
- status: 500
  code: internal
  description: the spec could not be read, or ai answered an error (its status and message are passed through)
- status: 502
  code: bad_gateway
  description: ai is unreachable
```

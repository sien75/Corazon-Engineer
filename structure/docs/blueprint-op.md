# POST /b/{slug}/op

One request from a blueprint page to its runtime — say something happened, start or stop drawing a table, or run a statement — answered synchronously; anything a flow produces arrives on blueprint-events instead

## Request

```yaml
body:
  op: emit | watch | unwatch | sql
  # op=emit — put an event on the bus, starting every flow that listens for it
  type?: string  # the event type, e.g. ui.build
  data?: object  # carried to the flow as ${{ event.data }}
  # op=watch / op=unwatch — this page wants a table pushed to it, or stops
  table?: string  # a plain sqlite identifier
  # op=sql — anything a watch cannot express
  sql?: string  # one statement; a prefix of select/pragma/explain/with is a read
  params?: object | []  # `:name` bindings as an object, or positional bindings as a list
```

## Response

```yaml
status: 200
body:
  # op=emit / op=unwatch: the event was put on the bus / the watch was dropped
  ok?: boolean
  # op=watch: the table as it is right now; the same rows come again, whole,
  # on blueprint-events after every write
  rows?: []
  # op=sql: rows for a read, {ok:true} for a write (which also pushes the change)
```

## Errors

```yaml
- status: 400
  code: bad_request
  description: unknown op, an emit without a type, a sql op without a statement, a statement sqlite rejected, or a table name that is not a plain identifier
- status: 404
  code: not_found
  description: no such blueprint
```

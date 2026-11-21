# POST /bp/{project}/{slug}/op

One request from a blueprint page to its runtime — say something happened, start or stop drawing a table, run a statement, or reload the blueprint — answered synchronously; anything a flow produces arrives on blueprint-events instead

## Request

```yaml
body:
  op: emit | watch | unwatch | sql | reload | restart
  # op=emit — put an event on the bus, starting every flow that listens for it
  type?: string  # the event type, e.g. ui.build
  data?: object  # carried to the flow as ${{ event.data }}
  # op=watch / op=unwatch — this page wants a table pushed to it, or stops
  table?: string  # a plain sqlite identifier
  # op=sql — anything a watch cannot express
  sql?: string  # one statement; a prefix of select/pragma/explain/with is a read
  params?: object | []  # `:name` bindings as an object, or positional bindings as a list
  # op=reload — read the file again and start it over: the old init script is
  # killed, the file is parsed, its schema is applied and its init script runs
  # again. This is the only way a blueprint's code takes a change; nothing
  # reloads on a file change. The page's own button is what calls it.
  # op=restart is the dev page's name for the same thing; both are accepted.
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
  # op=reload: {ok:true, reloaded:true}; the page reloads itself after it, since
  # its stream and its runtime are gone
```

## Errors

```yaml
- status: 400
  code: bad_request
  description: unknown op, an emit without a type, a sql op without a statement, a statement sqlite rejected, or a table name that is not a plain identifier
- status: 404
  code: not_found
  description: no such blueprint
- status: 500
  code: blueprint_load_failed
  description: op=reload and the file no longer parses or its schema was rejected; the message says why and the old runtime stays as it was
```

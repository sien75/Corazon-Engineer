# Contract Specification

This specification defines the writing conventions for interface contracts under `contracts/`. Goal: **human-readable, body is data, zero machine-schema vocabulary**.

---

## 1. Design Principles

1. **body is data** — the response body describes the fields actually returned, not a schema description wrapped in `properties/type/required`
2. **type is value** — express types directly with YAML values, eliminating JSON Schema vocabulary
3. **self-contained** — a single contract file shows the whole interface: input, output, and errors all at once
4. **3-layer structure** — each contract consists of top-level metadata + `request` / `response` + `errors`

---

## 2. File Structure

### 2.1 Top-level fields

```yaml
id: ai-ask          # unique identifier
description: ...    # one-line description
```

- a contract describes **data** only (input / output / errors), not transport
- transport (`method` / `path` / `protocol`) is defined by the atom's interface; the contract does not repeat it
- streaming semantics are marked with `stream: sse` on `response` (see §5)

### 2.2 The request / response / errors fields

```yaml
request:
  body:   # request body (the only input location)
response:
  status: 200
  body:
errors:
  - status: 400
    code: bad_request
    description: ...
```

`request` always exists: write `request: {}` when there is no input; omit `errors` when there are no errors.

---

## 3. Type System

### 3.1 Reserved type words

The following bare words in a **value position** denote types; any other bare word is a **string literal**:

| reserved word | meaning |
|---|---|
| `string` | string |
| `number` | number (including integers) |
| `boolean` | boolean |
| `object` | arbitrary object |

```yaml
sessionId: string   # type: string
seq: number         # type: number
granted: boolean    # type: boolean
data: object        # type: arbitrary object
```

### 3.2 Optional fields

A field name ending in `?` is optional:

```yaml
env?: string        # optional string
done?: boolean      # optional boolean
```

### 3.3 Arrays

- primitive elements: `[string]` / `[object]` / `[number]`
- object elements: block list, write one sample item

```yaml
runtime: [string]   # array of strings

options?:          # array of objects
  - label: string
    value: string
```

### 3.4 Enums and unions

Join multiple values/types with `|`:

```yaml
kind: markdown | question | error   # enum: three literal strings
content: object | string           # union: either an object or a string
```

**Discrimination rule: bare words are handled per §3.1 — reserved words are types, everything else is a literal.**

#### 3.4.1 Literals colliding with reserved words

When an enum value happens to be a reserved word such as `string`/`number`, **it must be quoted** to express a literal:

| form | meaning |
|---|---|
| `string` | type string |
| `string \| number` | union of types |
| `'"string" \| "number"'` | enum: two string literals `"string"`, `"number"` |
| `'string \| number'` | one string, whose content is exactly `string \| number` |

**`|` inside quotes = an ordinary character; outside quotes, joining members = the union separator.** A quoted member is always a literal string.

> **Syntax trap**: when a value starts with a quote, YAML swallows the whole line as a scalar, so the **outer layer of a literal enum must use single quotes**; the double quotes inside members are literals and are unaffected: `'"string" | "number"'`.

---

## 4. request

`request` has only one location: **`body`**. All inputs (path parameters, query, request body) go in `body`:

```yaml
request:
  body:
    id: string     # session id
    prompt: string # request body field
```

---

## 5. response

```yaml
response:
  status: 200       # success status code, currently fixed at 200
  stream: sse       # optional; marks this interface as SSE streaming
  body:             # the fields actually returned
```

- **`status` is a condition, not a key**: read it as "when status is 200, the body is as follows", to avoid mistaking it for a data field
- `stream: sse` marks an SSE long connection; `body` describes the structure of **each event**
- `body` writes fields directly — the real data shape (see §3)

---

## 6. errors

### 6.1 Self-contained

Each contract's `errors` lists in full every error this interface may produce, **without referencing shared files**:

```yaml
errors:
  - status: 400
    code: bad_request
    description: prompt missing or empty
  - status: 404
    code: not_found
    description: session does not exist
  - status: 500
    code: internal
    description: server internal error
```

### 6.2 Current standard errors (3)

| status | code | general meaning |
|---|---|---|
| 400 | `bad_request` | bad parameters |
| 404 | `not_found` | does not exist |
| 500 | `internal` | server error |

`description` states **this interface's specific reason** (e.g. `ai-ask`'s 400 = "prompt missing or empty"), not generic boilerplate.

### 6.3 Error response body

The body of every non-2xx response is uniformly:

```json
{ "error": { "code": "bad_request", "message": "..." } }
```

Each contract's `errors` is already self-contained (status/code/description); the error body shape is implemented per this convention.

---

## 7. Complete example

```yaml
id: ai-ask
description: Ask a question; carries a prompt (determines what the AI does)

request:
  body:
    id: string      # session id
    prompt: string  # determines what the AI does

response:
  status: 200
  body:
    sessionId: string  # same session, used to continue pulling the stream

errors:
  - status: 400
    code: bad_request
    description: prompt missing or empty
  - status: 404
    code: not_found
    description: session does not exist
  - status: 500
    code: internal
    description: server internal error
```

---

## 8. Syntax traps quick reference

1. **Inline objects cannot contain `?`**: `{ code, message, details? }` fails to parse; use the block form when a field is optional
2. **Value starting with a quote**: YAML swallows the line; wrap the outer layer in single quotes (`'"..." | "..."'`)
3. **Bare-word semantics**: reserved type words are types, everything else is a literal — do not assume a non-reserved word needs quoting

# Test: core-static-mutation

static-mutation add/update/remove + validation failure branches. All writes land only on the `.corazon/.playground/` mock project.

Note: the static API speaks YAML (`application/yaml`) — request and response bodies below are YAML.

## Setup

```bash
# Prepare the mock project: runtime/tests/dev/.playground is a minimal mock unrelated to the real project; place it at .corazon/.playground/
rm -rf .corazon/.playground && mkdir -p .corazon && cp -R runtime/tests/dev/.playground .corazon/.playground
# Start the server under test with .corazon/.playground as project root
cd workspace/static && go build -o corazon . && ./corazon serve-static --root ../../.corazon/.playground --addr :7502 &
```

## 1. add atom

```bash
curl -s -X POST http://localhost:7502/static/mutation \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
op: add
type: atom
id: atoms/added-service.yaml
atom:
  name: added-service
  description: atom added by test
  runtime_type: go
  runtime_version: "1.22"
  interfaces:
    provides:
      - id: added-api
        channel: network
        protocol: http
        extend: {path: /added, method: POST}
    consumes: []
YAML
```

Expected: 200, response echoes `op: add`, `type: atom`, `id`/`file: atoms/added-service.yaml`; and the file `.corazon/.playground/atoms/added-service.yaml` is written (top-level `atoms:` list).

## 2. add atom with validation failure (422, file NOT written)

```bash
curl -s -X POST http://localhost:7502/static/mutation \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
op: add
type: atom
id: atoms/bad.yaml
atom:
  name: bad
  description: invalid atom
  runtime_type: cobol
  role: alien
  interfaces:
    provides:
      - {id: x, channel: network, protocol: dbus}
    consumes: []
YAML
```

Expected: 422, `error.code` is `validation_failed`, `errors` contains `runtime_type` (invalid enum), `role` (invalid enum) and `interfaces.provides[0].protocol` (dbus incompatible with network); the file `.corazon/.playground/atoms/bad.yaml` does not exist.

## 3. add contract (id auto-generated)

```bash
curl -s -X POST http://localhost:7502/static/mutation \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
op: add
type: contract
id: ""
contract:
  id: added-api
  description: contract added by test
  request: {body: {msg: string}}
  response: {status: 200, body: {ok: boolean}}
YAML
```

Expected: 200, `id` auto-generated as `contracts/added-api.yaml`.

## 4. update atom

```bash
curl -s -X POST http://localhost:7502/static/mutation \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
op: update
type: atom
id: atoms/added-service.yaml
atom:
  name: added-service
  description: atom updated by test
  runtime_type: go
  interfaces: {provides: [], consumes: []}
YAML
```

Expected: 200, description in `.corazon/.playground/atoms/added-service.yaml` is updated.

## 5. update non-existent object

```bash
curl -s -X POST http://localhost:7502/static/mutation \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
op: update
type: atom
id: atoms/ghost.yaml
atom: {name: ghost, description: x, runtime_type: go, interfaces: {provides: [], consumes: []}}
YAML
```

Expected: 404, `error.code` is `not_found`.

## 6. add devtime raw content

```bash
curl -s -X POST http://localhost:7502/static/mutation \
  -H 'Content-Type: application/yaml' --data-binary @- <<'YAML'
op: add
type: devtime
id: devtime/test-note.md
devtime: |
  # Test Note

  written by static-mutation test
YAML
```

Expected: 200, `.corazon/.playground/devtime/test-note.md` content matches the raw string exactly.

## 7. remove

```bash
curl -s -X POST http://localhost:7502/static/mutation \
  -H 'Content-Type: application/yaml' --data-binary $'op: remove\ntype: atom\nid: atoms/added-service.yaml'
curl -s -X POST http://localhost:7502/static/mutation \
  -H 'Content-Type: application/yaml' --data-binary $'op: remove\ntype: contract\nid: contracts/added-api.yaml'
curl -s -X POST http://localhost:7502/static/mutation \
  -H 'Content-Type: application/yaml' --data-binary $'op: remove\ntype: devtime\nid: devtime/test-note.md'
```

Expected: all return 200 and the files are deleted; removing again returns 404.

## 8. invalid op / type

```bash
curl -s -X POST http://localhost:7502/static/mutation \
  -H 'Content-Type: application/yaml' --data-binary $'op: hack\ntype: atom\nid: atoms/x.yaml'
```

Expected: 400, `error.code` is `bad_request`.

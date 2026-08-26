# Test: core-schema-mutation

schema-mutation add/update/remove + validation failure branches. All writes land only on the `.playground/` mock project.

## Setup

```bash
# Prepare the mock project: tests/.playground is a minimal mock unrelated to the real project; place it at .playground/
rm -rf .playground && cp -R tests/.playground .playground
# Start the server under test with .playground as project root
cd workspace/core && go build -o corazon . && ./corazon serve --root ../../.playground --addr :8080 &
```

## 1. add atom

```bash
curl -s -X POST http://localhost:8080/schema/mutation -d '{
  "op": "add", "type": "atom", "id": "atoms/added-service.yaml",
  "atom": {
    "name": "added-service",
    "description": "atom added by test",
    "runtime_type": "go",
    "runtime_version": "1.22",
    "interfaces": {
      "provides": [
        {"id": "added-api", "channel": "network", "protocol": "http",
         "extend": {"path": "/added", "method": "POST"}}
      ],
      "consumes": []
    }
  }
}'
```

Expected: 200, `{ "op": "add", "type": "atom", "id": "atoms/added-service.yaml", "file": "atoms/added-service.yaml" }`, and the file `.playground/atoms/added-service.yaml` is written (top-level `atoms:` list).

## 2. add atom with validation failure (422, file NOT written)

```bash
curl -s -X POST http://localhost:8080/schema/mutation -d '{
  "op": "add", "type": "atom", "id": "atoms/bad.yaml",
  "atom": {
    "name": "bad",
    "description": "invalid atom",
    "runtime_type": "cobol",
    "interfaces": {"provides": [{"id": "x", "channel": "network", "protocol": "dbus"}], "consumes": []}
  }
}'
```

Expected: 422, `error.code` is `validation_failed`, `errors` contains both `runtime_type` (invalid enum) and `interfaces.provides[0].protocol` (dbus incompatible with network); the file `.playground/atoms/bad.yaml` does not exist.

## 3. add contract (id auto-generated)

```bash
curl -s -X POST http://localhost:8080/schema/mutation -d '{
  "op": "add", "type": "contract", "id": "",
  "contract": {
    "id": "added-api",
    "description": "contract added by test",
    "request": {"body": {"msg": "string"}},
    "response": {"status": 200, "body": {"ok": "boolean"}}
  }
}'
```

Expected: 200, `id` auto-generated as `contracts/added-api.yaml`.

## 4. update atom

```bash
curl -s -X POST http://localhost:8080/schema/mutation -d '{
  "op": "update", "type": "atom", "id": "atoms/added-service.yaml",
  "atom": {
    "name": "added-service",
    "description": "atom updated by test",
    "runtime_type": "go",
    "interfaces": {"provides": [], "consumes": []}
  }
}'
```

Expected: 200, description in `.playground/atoms/added-service.yaml` is updated.

## 5. update non-existent object

```bash
curl -s -X POST http://localhost:8080/schema/mutation -d '{
  "op": "update", "type": "atom", "id": "atoms/ghost.yaml",
  "atom": {"name": "ghost", "description": "x", "runtime_type": "go", "interfaces": {"provides": [], "consumes": []}}
}'
```

Expected: 404, `error.code` is `not_found`.

## 6. add devtime raw content

```bash
curl -s -X POST http://localhost:8080/schema/mutation -d '{
  "op": "add", "type": "devtime", "id": "devtime/test-note.md",
  "devtime": "# Test Note\n\nwritten by schema-mutation test\n"
}'
```

Expected: 200, `.playground/devtime/test-note.md` content matches the raw string exactly.

## 7. remove

```bash
curl -s -X POST http://localhost:8080/schema/mutation \
  -d '{"op": "remove", "type": "atom", "id": "atoms/added-service.yaml"}'
curl -s -X POST http://localhost:8080/schema/mutation \
  -d '{"op": "remove", "type": "contract", "id": "contracts/added-api.yaml"}'
curl -s -X POST http://localhost:8080/schema/mutation \
  -d '{"op": "remove", "type": "devtime", "id": "devtime/test-note.md"}'
```

Expected: all return 200 and the files are deleted; removing again returns 404.

## 8. invalid op / type

```bash
curl -s -X POST http://localhost:8080/schema/mutation \
  -d '{"op": "hack", "type": "atom", "id": "atoms/x.yaml"}'
```

Expected: 400, `error.code` is `bad_request`.

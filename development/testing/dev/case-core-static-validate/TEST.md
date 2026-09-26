# Test: core-static-validate

`static-validate` scans the whole schema tree (atoms / edges / contracts) and reports every field-level error. All files touched here live only on the `.engineer/.playground/` mock project.

Note: the static API speaks YAML (`application/yaml`) — request and response bodies below are YAML.

## Setup

```bash
# Prepare the mock project: development/testing/.playground is a minimal mock unrelated to the real project; place it at .engineer/.playground/
rm -rf .engineer/.playground && mkdir -p .engineer && cp -R development/testing/.playground .engineer/.playground
# Start the server under test with .engineer/.playground as project root
cd workspace/static && go build -o engineer . && ./engineer serve-static --root ../../.engineer/.playground --addr :7502 &
```

## 1. the valid mock tree passes

```bash
curl -s -X POST http://localhost:7502/static/validate \
  -H 'Content-Type: application/yaml' --data-binary ''
```

Expected: 200, `ok: true`, `errors: []`.

## 2. invalid atom is reported

```bash
cat > .engineer/.playground/atoms/bad.yaml <<'YAML'
atoms:
  - name: bad
    description: invalid atom
    runtime_type: cobol
    role: alien
    interfaces:
      provides:
        - id: x
          channel: network
          protocol: dbus
          contract: ./contracts/missing.yaml
      consumes: []
YAML
curl -s -X POST http://localhost:7502/static/validate \
  -H 'Content-Type: application/yaml' --data-binary ''
rm .engineer/.playground/atoms/bad.yaml
```

Expected: 200, `ok: false`; `errors` includes entries with `file: atoms/bad.yaml`, `type: atom` for `runtime_type` (invalid enum), `role` (invalid enum), `interfaces.provides[0].protocol` (dbus incompatible with network) and `interfaces.provides[0].contract` (contract file not found).

## 3. broken edge references are reported

```bash
cat > .engineer/.playground/edges/bad-edge.yaml <<'YAML'
edges:
  - id: bad-edge
    from: demo-service
    from_interface: nope
    to: ghost
    to_interface: ghost-api
    channel: network
    protocol: http
    description: references do not resolve
YAML
curl -s -X POST http://localhost:7502/static/validate \
  -H 'Content-Type: application/yaml' --data-binary ''
rm .engineer/.playground/edges/bad-edge.yaml
```

Expected: 200, `ok: false`; `errors` includes `from_interface` (demo-service has no consumes interface `nope`) and `to` (atom not found: ghost).

## 4. invalid contract is reported

```bash
cat > .engineer/.playground/contracts/bad.yaml <<'YAML'
id: bad-contract
request: {}
YAML
curl -s -X POST http://localhost:7502/static/validate \
  -H 'Content-Type: application/yaml' --data-binary ''
rm .engineer/.playground/contracts/bad.yaml
```

Expected: 200, `ok: false`; `errors` includes `file: contracts/bad.yaml`, `type: contract` for `description` (required) and `response` (required).

## 5. yaml parse errors are reported

```bash
printf 'atoms: [\n' > .engineer/.playground/atoms/broken.yaml
curl -s -X POST http://localhost:7502/static/validate \
  -H 'Content-Type: application/yaml' --data-binary ''
rm .engineer/.playground/atoms/broken.yaml
```

Expected: 200, `ok: false`; `errors` includes `file: atoms/broken.yaml`, `type: atom`, with a `yaml parse error` message.

## 6. nested dirs are discovered recursively

`atoms/` / `edges/` / `contracts/` are recursive: any `*.yaml` at any depth is loaded and validated.

```bash
mkdir -p .engineer/.playground/atoms/nested .engineer/.playground/edges/nested .engineer/.playground/contracts/nested
cat > .engineer/.playground/contracts/nested/deep-api.yaml <<'YAML'
id: deep-api
description: Nested mock contract
request:
  body:
    msg: string
response:
  status: 200
  body:
    ok: boolean
YAML
cat > .engineer/.playground/atoms/nested/deep-actor.yaml <<'YAML'
atoms:
  - name: deep-actor
    description: Nested mock atom
    role: service
    runtime_type: go
    interfaces:
      provides:
        - id: deep-api
          channel: network
          protocol: http
          contract: ./contracts/nested/deep-api.yaml
          extend:
            path: /deep
            method: POST
      consumes: []
YAML
cat > .engineer/.playground/edges/nested/deep-edge.yaml <<'YAML'
edges:
  - id: deep-edge
    from: demo-service
    from_interface: demo-events
    to: deep-actor
    to_interface: deep-api
    channel: network
    protocol: http
    description: nested edge to nested atom
YAML
curl -s -X POST http://localhost:7502/static/query \
  -H 'Content-Type: application/yaml' --data-binary ''
curl -s -X POST http://localhost:7502/static/validate \
  -H 'Content-Type: application/yaml' --data-binary ''
rm -rf .engineer/.playground/atoms/nested .engineer/.playground/edges/nested .engineer/.playground/contracts/nested
```

Expected: `/static/query` `atoms` includes `name: deep-actor` and `edges` includes `id: deep-edge` (the loader recurses, not just validate); `/static/validate` returns 200, `ok: true`, `errors: []`.

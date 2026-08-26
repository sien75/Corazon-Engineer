# Schema Enum Reference

## Communication (interface.channel / interface.protocol)

### channel

```
network   — TCP/UDP/Unix Socket
stdio     — stdin/stdout / pipe
ipc       — Inter-process communication (shared memory, semaphore, message queue, etc.)
```

### protocol

Protocols must be compatible with their channel.

```
network channel:
  http       — HTTP/HTTPS
  grpc       — gRPC
  ws         — WebSocket
  sse        — Server-Sent Events
  pgwire     — PostgreSQL native protocol
  mysql      — MySQL protocol
  redis      — RESP (Redis serialization protocol)
  kafka      — Kafka custom TCP protocol
  amqp       — AMQP (RabbitMQ, etc.)
  mqtt       — MQTT
  s3         — AWS S3 API (object storage)
  elastic    — Elasticsearch HTTP API
  custom     — Custom TCP/UDP protocol

stdio channel:
  json-rpc   — JSON-RPC over stdio
  ndjson     — Newline-delimited JSON stream
  binary     — Raw binary stream
  text       — Plain text line protocol

ipc channel:
  unix-socket  — Unix Domain Socket
  dbus         — D-Bus
  shared-mem   — Shared memory
  signal       — Signal
```

---

## Runtime Type (atom.runtime_type)

```
native   — Compiled to native binary, no independent runtime (Rust, C++, Zig, Swift, etc.)
go       — Go built-in runtime
browser  — Browser (SPA / frontend application)
node     — Node.js (JS/TS runtime)
bun      — Bun (JS/TS runtime)
jre      — Java / Kotlin / Scala (JVM ecosystem)
python   — CPython / PyPy
dotnet   — .NET Runtime
beam     — Erlang / Elixir (BEAM VM)
ruby     — Ruby interpreter
php      — PHP interpreter
```

---

## Atom Role (atom.role)

```
service      — Business service
database     — Database
cache        — Cache
queue        — Message queue
storage      — Object storage
gateway      — Gateway / reverse proxy
scheduler    — Scheduled task / Cron
worker       — Background task processor
proxy        — Proxy service
```

---

## Runtime Connection (runtime.atoms.connect)

Field shape depends on `channel`. Same atom maps to different connect blocks across runtime envs. How an atom is launched is out of scope — only how to reach it.

```
network channel:
  url            — Address to dial (http://, grpc://, redis://, postgres://, ...)

stdio channel:
  in             — Named pipe the atom reads (its stdin)
  out            — Named pipe the atom writes (its stdout)

ipc channel (fields depend on protocol):
  unix-socket:
    path         — Socket file path
  dbus:
    bus          — session | system
    service      — D-Bus service name
    object       — Object path
  shared-mem:
    name         — POSIX shm name
    size         — Shared memory size in bytes
  signal:
    pid          — Target process ID
```
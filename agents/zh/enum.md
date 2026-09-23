# Schema 枚举定义

## 通信 (channel / protocol)

用于：

- `atom.interfaces.provides[].channel` / `atom.interfaces.provides[].protocol`
- `atom.interfaces.consumes[].channel` / `atom.interfaces.consumes[].protocol`
- `edge.channel` / `edge.protocol`

### 通道 (channel)

数据流动的底层方式。

```
network   — 一切走 TCP/UDP/Unix Socket 的通信
stdio     — 标准输入输出 / pipe
ipc       — 同机进程间通信（共享内存、信号量、消息队列等）
```

### 协议 (protocol)

通道上承载的应用层协议。协议必须与通道兼容。

```
network 通道:
  http       — HTTP/HTTPS
  grpc       — gRPC
  pgwire     — PostgreSQL 原生协议
  mysql      — MySQL 协议
  redis      — RESP (Redis 序列化协议)
  kafka      — Kafka 自定义 TCP 协议
  amqp       — AMQP (RabbitMQ 等)
  mqtt       — MQTT
  s3         — AWS S3 API (对象存储)
  elastic    — Elasticsearch HTTP API
  custom     — 自定义 TCP/UDP 协议

stdio 通道:
  json-rpc   — 基于 stdio 的 JSON-RPC
  ndjson     — 换行分隔的 JSON 流
  binary     — 原始二进制流
  text       — 纯文本行协议

ipc 通道:
  unix-socket  — Unix Domain Socket
  dbus         — D-Bus
  shared-mem   — 共享内存
  signal       — 信号
```

---

## 运行时类型 (atom.runtime_type)

```
native   — 编译为原生二进制，无独立运行时（Rust, C++, Zig, Swift 等）
go       — Go 内置 runtime
browser  — 浏览器（SPA / 前端应用）
node     — Node.js (JS/TS 运行时)
bun      — Bun (JS/TS 运行时)
jre      — Java / Kotlin / Scala（JVM 生态）
python   — CPython / PyPy
dotnet   — .NET Runtime
beam     — Erlang / Elixir (BEAM 虚拟机)
ruby     — Ruby 解释器
php      — PHP 解释器
```

---

## Atom 角色类型 (atom.role)

该 atom 在架构中扮演的角色。

```
service      — 业务服务
database     — 数据库
cache        — 缓存
queue        — 消息队列
storage      — 对象存储
gateway      — 网关 / 反向代理
scheduler    — 定时任务 / Cron
worker       — 后台任务处理器
proxy        — 代理服务
```


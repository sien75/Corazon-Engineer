# Contract 规范

本规范定义 `contracts/` 目录下接口契约的书写约定。目标:**人读友好,body 即数据,零机器 schema 词汇**。

---

## 1. 设计原则

1. **body 即数据** — 响应体描述的是真实返回的字段,不是包裹在 `properties/type/required` 里的 schema 描述
2. **类型即值** — 用 YAML 值直接表达类型,消灭 JSON Schema 词汇
3. **自包含** — 单个 contract 文件读完整接口:输入、输出、错误全在眼前
4. **3 层结构** — 每个 contract 由顶层元信息 + `request` / `response` + `errors` 组成

---

## 2. 文件结构

### 2.1 顶层字段

```yaml
id: ai-ask          # 唯一标识
description: ...    # 一句话说明
```

- contract 只描述**数据**(输入 / 输出 / 错误),不描述传输方式
- transport(`method` / `path` / `protocol`)由 atom 的 interface 定义,contract 不重复
- 流式语义在 `response` 上加 `stream: sse`(见 §5)

### 2.2 request / response / errors 三字段

```yaml
request:
  body:   # 请求体(唯一入参位置)
response:
  status: 200
  body:
errors:
  - status: 400
    code: bad_request
    description: ...
```

`request` 恒存在:无入参时写 `request: {}`;`errors` 无错误时省略。

---

## 3. 类型系统

### 3.1 保留类型词

以下裸词出现在**值位置**时表示类型,其余裸词一律是**字面量字符串**:

| 保留词 | 含义 |
|---|---|
| `string` | 字符串 |
| `number` | 数字(含整数) |
| `boolean` | 布尔 |
| `object` | 任意对象 |

```yaml
sessionId: string   # 类型:字符串
seq: number         # 类型:数字
granted: boolean    # 类型:布尔
data: object        # 类型:任意对象
```

### 3.2 可选字段

字段名以 `?` 结尾表示可选:

```yaml
env?: string        # 可选字符串
done?: boolean      # 可选布尔
```

### 3.3 数组

- 元素为基本类型:`[string]` / `[object]` / `[number]`
- 元素为对象:块状列表,写一个示例项

```yaml
runtime: [string]   # 字符串数组

options?:          # 对象数组
  - label: string
    value: string
```

### 3.4 枚举与联合

用 `|` 连接多个取值/类型:

```yaml
kind: markdown | question | error   # 枚举:三个字面量字符串
content: object | string           # 类型联合:要么对象要么字符串
```

**判别规则:裸词按 §3.1 处理——保留词是类型,其余是字面量。**

#### 3.4.1 字面量与保留词冲突

枚举值恰好是 `string`/`number` 等保留词时,**必须加引号**才能表达字面量:

| 写法 | 含义 |
|---|---|
| `string` | 类型 string |
| `string \| number` | 类型联合 |
| `'"string" \| "number"'` | 枚举:两个字符串字面量 `"string"`、`"number"` |
| `'string \| number'` | 单个字符串,内容就是 `string \| number` |

**`|` 在引号内 = 普通字符;引号外、连接成员 = 联合分隔符。** 带引号成员永远是字面量字符串。

> **语法陷阱**:值以引号开头时 YAML 会把整行当标量吞掉,因此字面量枚举的**外层必须用单引号**,成员内部的双引号是字面量不受影响:`'"string" | "number"'`。

---

## 4. request

`request` 只有一种位置:**`body`**。所有入参(路径参数、query、请求体)统一放 `body`:

```yaml
request:
  body:
    id: string     # session id
    prompt: string # 请求体字段
```

---

## 5. response

```yaml
response:
  status: 200       # 成功状态码,当前固定 200
  stream: sse       # 可选;标记该接口为 SSE 流式
  body:             # 真实返回字段
```

- **`status` 是条件不是键**:读作"status 为 200 时,body 如下",避免被误解成数据字段
- `stream: sse` 表示 SSE 长连接,`body` 描述**每条 event** 的结构
- `body` 直接写字段,即真实数据形态(见 §3)

---

## 6. errors

### 6.1 自包含

每个 contract 的 `errors` 完整列出本接口可能出现的错误,**不引用共享文件**:

```yaml
errors:
  - status: 400
    code: bad_request
    description: prompt 缺失或为空
  - status: 404
    code: not_found
    description: session 不存在
  - status: 500
    code: internal
    description: 服务端内部错误
```

### 6.2 当前标准错误(3 种)

| status | code | 通用含义 |
|---|---|---|
| 400 | `bad_request` | 参数错误 |
| 404 | `not_found` | 不存在 |
| 500 | `internal` | 服务端错误 |

`description` 写**本接口的具体原因**(如 `ai-ask` 的 400 = "prompt 缺失或为空"),不写通用话术。

### 6.3 错误响应体

所有非 2xx 响应的 body 统一为:

```json
{ "error": { "code": "bad_request", "message": "..." } }
```

各 contract 的 `errors` 已自包含(status/code/description),错误体形状按此约定实现。

---

## 7. 完整示例

```yaml
id: ai-ask
description: 提问;携带 prompt(决定 AI 做什么)

request:
  body:
    id: string      # session id
    prompt: string  # 决定 AI 做什么

response:
  status: 200
  body:
    sessionId: string  # 同 session,用于接着拉 stream

errors:
  - status: 400
    code: bad_request
    description: prompt 缺失或为空
  - status: 404
    code: not_found
    description: session 不存在
  - status: 500
    code: internal
    description: 服务端内部错误
```

---

## 8. 语法陷阱速查

1. **行内对象不能含 `?`**:`{ code, message, details? }` 解析失败,含可选字段用块状
2. **值以引号开头**:YAML 吞行,外层用单引号包裹(`'"..." | "..."'`)
3. **裸词语义**:保留类型词是类型,其余是字面量——不要想当然给非保留词加引号

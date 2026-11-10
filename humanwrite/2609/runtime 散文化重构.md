# runtime 合并 cookbook 并改为散文 md

## 目标

把 `runtime` 与 `cookbook` 合并为一个 `runtime/`, 载体从 yaml 改为散文 md。

系统的内容只有两个消费方: 前端和 AI。前端只按文件原样拿、不关心结构(同 devtime); AI 读 runtime 来启动项目, 所以 runtime 就是 cookbook 那种形式。

## 目标结构

```
runtime/
├── README.md                     # 描述本目录约定, 唯一契约
├── cookbooks/
│   └── [env]/
│       ├── BOOK.md               # 启动/连接/telemetry 说明(原 cookbook, 含原 endpoints 描述)
│       └── config.yaml           # 该 env 的值: 端口、密钥路径(dev=.corazon, prod=~/.corazon), 需要时含 atom 地址
└── tests/
    └── [env]/
        └── case-xxx/
            ├── desp.yaml        # 测试元数据: atoms 必带, env 可带
            └── TEST.md          # 测试用例正文
```

## 约定(写进 runtime/README.md)

不是强制 schema, 只是本项目约定:

- env 名以 `cookbooks/[env]/` 目录为准; `tests/[env]` 必须同名; `corazon.yaml` 的 `default_runtime` 必须存在
- telemetry 属于 cookbook(连接不是 config 能描述清楚的)
- 结构化信息放 yaml: 测试元数据在 `desp.yaml`, 运行期值在 `config.yaml`
- cookbook 用到 config 时要显式指出(ref `config.yaml`)

## 影响面

- contracts: 涉及 runtime 的数据结构改为「原样文件」语义
- agents: 规范不规定 devtime/runtime 里有什么, 改为「先读 `runtime/README.md`, 再按其约定做 xxx」
- static 服务: runtime 详情改为返回原始文本; 目录映射 / `ObjectTypes` 去掉 cookbooks
- 清理: 顶层 `cookbooks/` 与 `tests/` 消失, 连带 test `case:` 路径、`tests/.playground`、web `SECTIONS` 等

## 待确认

无。不校验 env 是否有 cookbook; prod 也需要打包 cookbook(`cookbooks/prod/BOOK.md`)。

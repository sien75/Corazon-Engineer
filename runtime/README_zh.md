# runtime

> 本文件是中文镜像,以英文版 `README.md` 为准。

验证运行中的系统,并与它的资源交互。本文件是 `runtime/` 这棵树的契约 —— 动这里之前先读它。普通文件树,下面的布局就是它的契约。

## 目录结构

```
runtime/
├── README.md          # 本文件
├── testing/[env]/     # E2E 测试;env 名 = 目录名
│   └── case-xxx/
│       ├── desp.yaml  # 测试元数据:atoms 必填,env 可省
│       └── TEST.md    # 测试用例本身
└── operation/         # 怎么连接 / 观测资源(数据库、缓存、日志、服务)
```

两个模块:

- **`testing/`** —— 从真实用户视角的 E2E 测试,通过 UI / API 操作业务系统验证功能。
- **`operation/`** —— 连接并观测资源(数据库、缓存、日志、服务实例),含 telemetry:实时监控、历史日志查询,以及对底层资源的主动操作。

## 约定

- env 名 = `testing/` 下的目录名;`corazon.yaml` 的 `default_runtime` 必须存在。
- 结构化数据放 yaml:测试元数据在 `desp.yaml`。其余都是散文。
- 环境的构建、启动与部署配方放在 `devtime/deploy/`,不在这里。
- 凭证不在这里配置。外部工具各自的凭证放在各自的 `~/.xxx` 位置。

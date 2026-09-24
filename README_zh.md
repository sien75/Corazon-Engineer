# Corazon Engineer

[English](README.md)

一个位于 Coding Agent 之上的 **Engineering Agent**。它用朴素的 schema（atoms、edges、contracts、runtime）描述一个系统 —— 由什么组成、各部分怎么连接、在真实环境中怎么运行 —— 从而让一次变更能够在「单个代码仓库之上」被设计、构建、验证和运维。

## 怎么用

到 [Releases 页面](https://github.com/sien75/Corazon-Engineer/releases) 下载对应 OS/arch 的 tar 包，解包、装一次，在你想处理的项目的目录下运行 `corazon`：

```bash
tar xzf corazon-*.tar.gz && ./corazon-*/install.sh
corazon             # 前台启动全部服务（Ctrl-C 全部停止）
corazon status      # 查看当前目录各服务状态
```

打开它打印出的 web 地址即可与 Agent 对话。当前工作目录**就是**项目 —— 可以是空目录，Agent 会把它初始化；所有数据都存在该目录下的 `.corazon/`。

升级是同一条命令（只替换软件，绝不动项目的 `.corazon/`）；卸载用 `corazon uninstall [--purge]`。也可以不安装，直接把 tar 包解开运行 `./bin/corazon`。ai 服务的 LLM key 读取 pi 自己的配置（环境变量或 `~/.pi/agent/auth.json`）。

## 许可证

Apache License 2.0 —— 见 [LICENSE](LICENSE)。

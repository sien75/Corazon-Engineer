# Corazon Engineer

[English](README.md)

一个位于 Coding Agent 之上的 **Engineering Agent**。

把系统变成一份朴素、好读的 schema —— atoms、edges、contracts、runtime，并使用合适的可视化方式展示出来，让一次变更能在「工程维度」被设计、构建、验证和运维。

![Corazon Engineer —— 架构图与 Agent 对话](notes/corazon-v0_1_0.png)

## 怎么用

### 安装（升级）

```bash
# 平台：macOS Apple Silicon → darwin-arm64，Linux x86-64 → linux-amd64
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) P=darwin-arm64 ;;
  Linux-x86_64) P=linux-amd64 ;;
  *) echo "不支持的平台"; exit 1 ;;
esac

# 最新版本（也可写死：V=v0.1.0）
V=$(curl -fsSL https://api.github.com/repos/sien75/Corazon-Engineer/releases/latest \
    | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p')

curl -fL -o corazon-$V-$P.tar.gz \
  https://github.com/sien75/Corazon-Engineer/releases/download/$V/corazon-$V-$P.tar.gz
tar xzf corazon-$V-$P.tar.gz && ./corazon-$V-$P/install.sh
```

Corazon Engineer 的 ai 服务依赖 pi，需要按照 pi 的方式去配置 AI Provider Key（环境变量或 `~/.pi/agent/auth.json`）。

### 使用

```bash
corazon             # 前台启动全部服务（Ctrl-C 全部停止），并打印 web 地址
corazon status      # 查看当前目录各服务状态
```

打开它打印出的 web 地址即可与 Agent 对话。
当前工作目录**就是**项目 —— 可以是空目录，Agent 会把它初始化；所有数据都存在该目录下的 `.corazon/`。

### 卸载

```bash
corazon uninstall           # 卸载软件
```

## 背景

为什么需要 Coding Agent 之上的一层，以及这个原型的设计思路 —— 见 [notes/share-corazon_zh.md](notes/share-corazon_zh.md)。

## 许可证

Apache License 2.0 —— 见 [LICENSE](LICENSE)。

# 推荐工具

面向外部系统的 CLI 工具起步清单。**不是**固定或完整清单 —— 有需要自己找工具,用户也可以提供。缺工具就装上,然后经 `bash` 运行。

登录 / 鉴权是用户的事:向用户索取,自己不要处理凭据(各工具自己存储,在各自的 `~/.xxx` 位置)。

每条给出:干什么用、怎么安装(优先通用方式,附 macOS / brew)、怎么检测。

## Browser

- **agent-browser** —— 通用浏览器自动化:导航、快照、点击、填表、取数据。
  - 安装:`npm install -g agent-browser`(全平台;macOS 也可 `brew install agent-browser`);再 `agent-browser install`(首次下载 Chrome)
  - 检测:`command -v agent-browser`
- **Ego(`ego-browser`)** —— Agent 原生浏览器运行时,自带 Chromium 和独立 Space。仅 macOS。
  - 安装:`sh ~/.agents/skills/ego-browser/scripts/install.sh`,然后在 App 里完成 onboarding(onboarding 会注册 `ego-browser` 命令)。其他平台去 `https://lite.ego.app/` 下载。
  - 检测:`command -v ego-browser`

## Computer Use

- **agent-computer-use(`agent-cu`)** —— 基于 OS 无障碍树的结构化桌面自动化。
  - 安装:`npm install -g agent-cu`(全平台;或 cargo / 仓库的 setup 脚本)
  - 检测:`command -v agent-cu`
  - 需要辅助功能权限:系统设置 → 隐私与安全 → 辅助功能

## 云服务厂商 CLI

- **aws** —— AWS CLI。
  - 安装:`curl -fsSL https://awscli.amazonaws.com/v2/install.sh | bash`(macOS/Linux;macOS 也可 `brew install awscli`)
  - 检测:`aws --version`
- **aliyun** —— 阿里云 CLI。
  - 安装:`/bin/bash -c "$(curl -fsSL https://aliyuncli.alicdn.com/install.sh)"`(macOS/Linux;也可 `brew install aliyun-cli`)
  - 检测:`aliyun version`

## 云服务能力 CLI

- **mysql** —— MySQL 客户端。
  - 安装:macOS `brew install mysql-client`;Debian/Ubuntu `sudo apt-get install mysql-client`;Fedora/RHEL `sudo dnf install mysql`
  - 检测:`mysql --version`
- **redis-cli** —— Redis 客户端。
  - 安装:macOS `brew install redis`;Debian/Ubuntu `sudo apt-get install redis-tools`;Fedora/RHEL `sudo dnf install redis`
  - 检测:`redis-cli --version`

# Recommended tools

A starting list of CLI tools for external systems. It is **not** a fixed or exhaustive list — find your own tool when needed, and the user may provide tools too. Install a missing tool, then run it via `bash`.

Logging in / authenticating a tool is the user's job: ask the user, and never handle credentials yourself (each tool stores its own, under its own `~/.xxx` location).

Each entry below gives: what it is for, how to install it (a cross-platform method first, plus macOS/brew where handy), how to detect it.

## Browser

- **agent-browser** — general browser automation: navigate, snapshot, click, fill forms, extract data.
  - install: `npm install -g agent-browser` (all platforms; macOS can also `brew install agent-browser`); then `agent-browser install` (downloads Chrome, first time only)
  - detect: `command -v agent-browser`
- **Ego (`ego-browser`)** — agent-native browser runtime with its own Chromium and space. macOS only.
  - install: `sh ~/.agents/skills/ego-browser/scripts/install.sh`, then finish onboarding in the app (onboarding registers the `ego-browser` command). On other platforms, download from `https://lite.ego.app/`.
  - detect: `command -v ego-browser`

## Computer Use

- **agent-computer-use (`agent-cu`)** — structured desktop automation over the OS accessibility tree.
  - install: `npm install -g agent-cu` (all platforms; or cargo / the repo's setup script)
  - detect: `command -v agent-cu`
  - needs Accessibility permission: System Settings → Privacy & Security → Accessibility

## Cloud vendor CLIs

- **aws** — AWS CLI.
  - install: `curl -fsSL https://awscli.amazonaws.com/v2/install.sh | bash` (macOS/Linux; macOS can also `brew install awscli`)
  - detect: `aws --version`
- **aliyun** — Alibaba Cloud CLI.
  - install: `/bin/bash -c "$(curl -fsSL https://aliyuncli.alicdn.com/install.sh)"` (macOS/Linux; can also `brew install aliyun-cli`)
  - detect: `aliyun version`

## Cloud service CLIs

- **mysql** — MySQL client.
  - install: macOS `brew install mysql-client`; Debian/Ubuntu `sudo apt-get install mysql-client`; Fedora/RHEL `sudo dnf install mysql`
  - detect: `mysql --version`
- **redis-cli** — Redis client.
  - install: macOS `brew install redis`; Debian/Ubuntu `sudo apt-get install redis-tools`; Fedora/RHEL `sudo dnf install redis`
  - detect: `redis-cli --version`

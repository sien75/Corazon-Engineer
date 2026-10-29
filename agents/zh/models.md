# 模型

一个会话跑哪个模型，以及要改什么该动哪里。刻意的短：规则、Engineer 自己的那一个文件、pi 自己的那几个文件。

## 三层

从强到弱，chat 和 image 各一条链：

1. **会话自己那一行**（log 里的 `model` / `imageModel`）——`model` 工具切换的结果，或创建时传入的
   （session-new 的 `chat` / `image`）。一个会话的选择只存在这一处：不往会话记录里写，所以重启后
   读回来只有一个答案。
2. **`models.yaml`**——Engineer 自己的文件，每个角色（`main`、`sub`）各一个 `chat` 和一个
   `image`。自己没有选择的会话用的就是它。
3. **pi 自己的默认**——**只有 chat**：pi settings 里的 `defaultProvider` / `defaultModel`
   能用就用，否则取 pi 现在能用的第一个模型。image 到第 2 层为止（空 = 未配置：还没有生图运行时）。

当下解析不到的名字会被跳过，ai 服务的日志里留一行警告，下一层接着生效。会话从不回写 pi 的 settings。

## models.yaml

`<engineer home>/models.yaml`——dev 跑是 checkout 里的 `.engineer/`，打包后是 `~/.engineer/data`。

```yaml
main:
  chat: deepseek/deepseek-flash
  image: ""
sub:
  chat: deepseek/deepseek-flash
  image: ""
```

- 每个值是 `provider/model-id`，按第一个 `/` 切（生图 id 可能带多个斜杠：
  `openrouter/black-forest-labs/flux.2-flex`）；
- `chat` 不能为空；`image` 可以为空（`""` = 未配置）；
- 每次 build / resume 都重新读，所以改动对**下一个**会话生效，对运行中的会话不生效。

改就是改这个文件（用 `edit` 做定点修改，注释会留着；`write` 会整篇替换，注释要自己带上）。写之前
核两件事：`chat` 必须是 pi 现在真能用的 `provider/model-id`（`model list` 里有），`image` 要么同形状
要么 `""`。读文件时不做可用性校验——pi 用不了的名字会在 build 时被跳过并打一行警告，所以写错不会有毒，
只是不生效。

## pi 自己的配置

目录、凭据、pi 自己的 settings 都归 pi。位置是 `~/.pi/agent/`（设了 `$PI_CODING_AGENT_DIR` 就是那里）：

| 文件 | 是什么 | 谁能改 |
|---|---|---|
| `auth.json` | 每个 provider 的 API key / OAuth——**凭据** | 用户，靠登录。不要自己处理 key。 |
| `models.json` | provider 和模型目录——`model list` 看到的就是它 | 你，用 `write` / `edit` |
| `settings.json` | `defaultProvider` / `defaultModel`（第 3 层）、思考档、主题、packages | 你，用 `write` / `edit` |

分界线是凭据：其他都是配置，你可以改；auth 是用户的。没有凭据的 provider 根本不会出现在目录里，
切到它的模型会失败。

思考档不在任何"会话维度"配置：pi 按模型从 `settings.json` 推（该模型在 `modelThinkingLevels`
里的条目，否则全局默认）。切换模型不会冻结档位——恢复的会话拿的是当下 pi 设置算出来的那个。

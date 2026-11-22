# 2611-77 Chat 改名 Pure Chat,`agents/` 整理,服务拆成四个

> 状态:第一版已实现并跑过用例,等 review。全部放在这一个迭代里(用户要求)。
> 未做的两件事在第五节末尾写明(聊天界面搬进 Pure Chat 蓝图、WebSocket)。

## 一、web 顶部的 "Chat" 改名 "Pure Chat"(已改)

- 起因:那一段是没有蓝图的纯对话;之后会做群聊蓝图(可能叫 chatroom),"Chat" 与 "Chatroom" 并列容易混。
- 决定:改名为 **Pure Chat**(最初倾向 Plain Chat,后按"纯对话、没有别的功能"的原意定为 Pure)。

| 名字 | 结论 |
|---|---|
| Pure Chat | **采用**。对应"纯对话、没有别的功能"的原意,与 Chatroom 不冲突 |
| Plain Chat | 备选。与规范里 "plain chat" 的叫法一致,语气更中性 |
| Console | 不采用。最不混淆,但用户觉得别扭,也不直观 |
| Direct | 不采用。只表达一对一,没表达"无界面" |
| Agent | 不采用。蓝图里的也是 agent |

- 已改:`workspace/web/shell/index.html` 的标签文字 `Chat` → `Pure Chat`(shell 目录随拆分搬到 `workspace/web/shell`)。
- 组件名 `engineer-chat` / 类 `EngineerChat` 是内部名,不改。

## 二、`agents/` 合并成一份(已改)

- 现状:web 那段对话是 `/ai/new` 只传 `cwd`,ai 不注入规范(`main.ts`),main / sub 两份规范都没喂给它;
  而 `main` / `sub` 这两个角色在代码里早已不存在(`models.yaml` 不分角色,接口里没有 tab、项目板、test / telemetry)。
- 改动:
  - `agents/main/`、`agents/sub/` 删除,合并为 `agents/AGENTS.md`,中文镜像 `agents/zh/AGENTS.md`。
  - 去掉:main / sub 角色、tab / 草稿、"默认归 main 的"开关会话、`/log/test/add` 与 `/log/telemetry/add` 的写记录规则
    (这两个接口已不在 `structure/contracts/`)。
  - 去掉:dogfooding 说明、整个 "Part 2"(目录约定、atom / edge / contract)——不再有 Corazon-like 项目;
    用蓝图开发(包括开发 CE 本身)那部分以后写在蓝图里。
  - `agents/models.md`、`agents/tools.md` 删除,内容分别精简进 `AGENTS.md` 的"模型设置"一节和删掉。
    `models.yaml` 的示例与"每角色一份"改为单份 `chat` / `image`。
  - `schema.md` / `contract.md` / `enum.md` / `how-to.md` / `tools.md`(含 `agents/zh/` 镜像)挪到 `agents_bak/`(`agents_bak/zh/`)。
    `development/README(_zh).md` 里指向 `agents/zh/schema.md` / `enum.md` 的地方改指 `agents_bak/`。
  - 仓库根 `AGENTS.md` 里对两份规范的提法同步改为一份。
- 打包只拷 `agents/`,`agents_bak/` 不进发布包——这是预期的。
- 现在 `agents/` 里只剩 `AGENTS.md` 和 `blueprint.md`(各一份中文镜像)。蓝图相关的一切(是什么、两种地址、
  怎么改、怎么建议新建、怎么检查、放哪个文件夹)统一写在 `blueprint.md`,`AGENTS.md` 只引用它,不再有"参考文件"章节。

## 三、`agents/AGENTS.md` 的写法(已改)

- 口吻:读的人不知道任何上下文,所以不能假定它已经知道某个东西。用完整、平实的句子,
  不写"也就是那个窗口"这种默认对方已经知道的说法,也不给安装路径的例子。
- 首句只说你是谁、在做什么:"你是 Corazon Engineer 的 AI 助手, 和用户对话."——
  不写"纯文字对话"(还有图片),也不写 "Pure Chat"(那是界面标签,读的人不知道指什么)。
- 章节顺序:工具、Blueprint、模型设置、图片、工作方式(把原来的回答风格 / 工作规则 / 安全合成一节,放后面)。
- 模型设置直接写清改哪几个文件:`<home>/data/models.yaml`(附 chat / image 的 yaml 示例)、
  `~/.pi/agent/models.json`、`~/.pi/agent/settings.json`,以及不要碰 `~/.pi/agent/auth.json`。

## 四、home 注入提示词,图片搬位置(已改)

- 起因:开发和测试可以用 `ENGINEER_DATA` / `--home` 把数据指到别处,大模型却不知道,规范里写死路径就会找错。
- 约定:Engineer 自己的文件夹叫 `<home>`(生产是 `~/.engineer`),数据都在 `<home>/data/`
  (`models.yaml`、`config.yaml`、数据库、图片)。pi 的固定在 `~/.pi/agent/`,规范里直接写,逻辑一致。
- 注入:启动方把真实的 `<home>` 写进提示词,新增一段 **Home position**,和 Reference files position、Runtime endpoints 同一类。
- 要注入的共四样:`agents/AGENTS.md` 正文、Reference files position(现在只有 `blueprint.md`)、Home position、
  Runtime endpoints(storage、ai 的地址,保留)。
- 代码要做的:
  1. blueprint 服务创建会话时,读 `agents/AGENTS.md`,拼上三段位置信息,作为 `system` 传给 `/ai/new`。
     现在只传 `cwd`。
  2. 开发启动器(`how-to/deploy/dev/launch.sh`)的数据目录也定成 `<home>/data`:现在默认是 `<checkout>/.engineer/home`,
     改成"`<home>` 默认 `~/.engineer`"。生产(`launch.go`)已经是这样,不用改。测试用例照旧靠指定别的 `<home>` 隔离。
  3. 图片仓库从 `<数据目录>/.engineer/uploads` 改到 `<数据目录>/uploads`(`blobs.ts`、`images.ts` 注释、`how-to`、测试用例一并改)。
     **旧图片要挪**:ai 启动时发现旧目录还在,就把文件一次性搬到新目录,再删掉旧目录,不留双读。
  4. `workspace/ai/src/images.ts:331` 的提示文案还写着 `main.image / sub.image`,改为 `image`。
- 没采用:取消 `ENGINEER_DATA`,强制所有运行都用 `~/.engineer/data`——路径能写死,但测试没法隔离数据。
- 待定:开发默认共用真数据,是否接受。

## 五、拆成 web / ai / blueprint / storage 四个,依赖理清(第一版已实现)

- 起因:现在 `blueprint` 一个服务既当 shell(聊天页、项目切换)又当蓝图运行时;Pure Chat 要"看蓝图、跑蓝图"时,
  会出现 ai 反过来依赖 blueprint,依赖就乱。
- 方向:
  - **Pure Chat 是第 0 个蓝图**,放在蓝图目录里(用户的目录,可以放 git),不随本仓库发布;以后的蓝图由它帮忙写出来。
  - **web 只认识 blueprint**:一条 WebSocket。聊天页、蓝图页都通过它拿数据、收事件。
  - **blueprint 调 ai 和 storage**;ai 调 storage(写记录);**ai 为了"运行蓝图"要调 blueprint**——这条没法避免,承认它。
    web 不碰 ai 和 storage。
  - **只有 blueprint 调 `/ai/new`**,每个蓝图(含 Pure Chat)的 agent 知道什么,都由 blueprint 创建时通过 `system` 传入。
    ai 只带着,不管内容。
- **ai 对 blueprint 的依赖只有一处**:"运行蓝图"这类工具直接做成 ai 的工具,执行时 ai 调 blueprint 的接口(同步,拿得到结果)。
  这条边真实存在,图上就画出来(blueprint ↔ ai 互相有边),不绕。
- **其他事件不算依赖,是协议**:`ask_user`、打开页面等是 ai 提供的输出协议——ai 输出什么,blueprint 原样透传给 web,
  由聊天页消费。blueprint 不理解内容,ai 也不知道谁在听。
- **空状态(已定)**:没有蓝图时,web 一进来是空白页,只有右上角的项目选择和主题,别的什么都没有,也不弹提示。
  "运行需要蓝图"以后写在 README 里,本迭代不管。
- **web 的形态**:选择项目 → 列出该项目的蓝图 → 点开后把蓝图页面以 **iframe** 嵌进主程序。web 不再有聊天界面。
- **聊天界面搬进蓝图**:蓝图是前后端一体的,现在 shell 里的聊天组件(`chat.js`,含 `ask_user` 的界面)搬进 Pure Chat 这个蓝图。
- **`agents/AGENTS.md` 归蓝图**:等 `corazon-engineer-blueprints` 建好就搬过去;在那之前先留在本仓库当草稿。
  `blueprint.md`(怎么写蓝图)仍属于 Engineer。
- **会话与蓝图的对应**:storage 的会话记录不加"属于哪个蓝图"字段,蓝图用自己的数据表记它的 session id。
- **`/static/*` 先备份、先不用**:改名 `static_bak`(同 `agents_bak/`)。本轮只记方案,文件还没挪。
- 代价:blueprint 成为中心,聊天流式输出要经它转一手(现在是聊天组件直连 ai);web 变得很薄。
- 影响:`structure/atoms/` 新增 `web`、改 `blueprint`,edges / contracts 跟着改,启动器变成四个服务。不在本迭代动手。
- **这一版做成了什么**:
  - 新增 `workspace/web`(`engineer serve-web`):伺服 `workspace/web/shell` 并向 blueprint 反向代理
    `/config/projects*`、`/bp*`、`/blobs/*`、`/chat/session`;`/config.js` 由它生成,项目列表现读 blueprint。
  - `workspace/blueprint` 只做蓝图与项目:去掉 `--shell` 和页面伺服;新增 `--agents` / `--engineer-home`,
    并新增 `POST /chat/session`(拼 system 文本后调 `/ai/new`)。
  - 启动器(dev `launch.sh` 与 prod `launch.go`)起四个服务;prod 的 `serve-web` 也在多调用二进制里。
  - `structure/`:新增 `web` atom、`web-config` 与 `blueprint-chat-session` 契约、`web-to-blueprint` 边;
    `blueprint` / `storage` 的 atom 描述改写;`structure/docs/README.md` 与生成的文件同步。
  - `/static/*` 全部停用:`static_bak/`(handlers、contracts、docs、三个用例)与 `static_bak/README.md`。
- **第二版补上的**(同一天的第二轮):
  - **外壳不再画对话**:顶部条列出前台项目的蓝图(`GET /config/blueprints`,新契约 `blueprint-list`),
    主体是一个 iframe 指向 `/bp/<project>/<slug>`;没有蓝图时页面就是空白(不弹提示)。
    `localStorage` 记住"哪个蓝图开着",按项目区分。
  - **Pure Chat 搬到蓝图目录**:`<蓝图目录>/purechat.html`,
    session id 存在它自己的表 `chat_state`;第一次打开 `POST /chat/session`,之后一直用同一个。
    页面里 `<engineer-chat>` 仍从壳的 `/components/chat.js` 引入(同源,蓝图页可以直接 import)。
  - **`bp.addr`**:`bp.js` 由 blueprint 伺服时先写一行 `window.BP_ADDR = {ai, storage}`,
    页面通过 `bp.addr.ai` / `bp.addr.storage` 拿到两个地址(和 `BP_AI` 同一份信息,给浏览器用)。
  - 用例:`case-core-web-single-chat` 改写成 `case-core-web-frame-purechat`(10/10 通过);
    `case-core-web-blobs`、`case-core-blueprint-{single-file,init,dev-prod}`、`case-core-loopback-bind` 的参数同步。
- **还没做**(下一步):
  - WebSocket:web → blueprint 用的是反向代理,不是新协议。
  - 共享组件:蓝图页仍从壳的 origin 引 `/components/chat.js` 和 `/vendor/*`;要彻底搬走,得把这些库内联进蓝图
    或给蓝图加一个"同目录静态资源"路由。
- 待想:
  - WebSocket 与现有 SSE(`blueprint-events`)的关系。
  - "Pure Chat" 这个名字是否仍用。

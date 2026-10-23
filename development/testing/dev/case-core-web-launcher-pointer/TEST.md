# Test: launcher pointer and text underline

## Setup

按 how-to/deploy/dev/BOOK.md 启动 dev。浏览器打开 8500，等待标签就绪。使用现有工作区，不创建、删除或发送会话。若已有 Pure Chat 标签，先切换过去。浏览器命令清除代理并设置 NO_PROXY 与 no_proxy 为 *。

## Run

1. 点击 #tab-add .tab-label 打开 launcher，断言可见且 +.active、现有标签都未激活。
2. 读该 span 中心坐标，mouse.move 后 mouse.down，断言 launcher.hidden 仍为 false；mouse.up 后断言仍为 false。此步骤必须命中内部 span，而不是 button 的空白处。
3. 在 launcher 关闭后重复一次按下/松开：按下不切换当前页面，松开只打开 launcher。
4. 点击已有标签，断言 launcher 收起且原标签 active；标签按钮无底色、无圆角，只有激活标签带 1.5px accent 底边（`--tab-underline`）；关闭按钮自身没有下划线。
5. 底边属于标签按钮，宽度等于该标签整个盒子（含关闭按钮）；launcher 打开时所有标签都没有底边，改由 + 带同一条 1.5px accent 底边；切换前后标签尺寸不变。
6. 聚焦 + 并按 Enter，断言 launcher 打开且 + 激活。
7. 从 main 打开 +，鼠标移到 Pure Chat 标签并 mouse.down：launcher 仍可见且 URL 保持 /new；mouse.up 后直接显示 Pure Chat，URL 为其 session 路径，history.length 只增加一次，不插入 /。

使用真实浏览器和 mouse.down / mouse.up，输出每项 pass 与汇总 ok；不要用合成事件代替按压。

第 4、5 条按下划线落在按钮底边（`#tabs .tab` / `#tab-add` 的 `border-bottom`）来断言，因为顶栏已恢复原样，细线不再放在 `label::after` 上。

## Teardown

切回 main，关闭本次临时浏览器页；保留用户要求运行的 dev 服务。不写工作区记录。

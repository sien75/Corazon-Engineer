### 多客户端系统

- 一份分发、一个入口:core(ai/log/static)唯一常驻,渲染端(web/app/tui)attach 为客户端,不各自打包 core。
- core 广播变更给所有客户端;数据面项目级多播,会话面按 session 隔离,多客户端输入需仲裁。
- 会合点归 launch.go(已有端口+pid),`--core` 兜底远程。
- core 常驻,需 `corazon stop`。

corazon (启动默认方式, 用户级 & 项目级) / corazon app / corazon cli / corazon web / corazon api

### 多人能力

corazon 现在其实侧重单人使用，需要再加上多人能力

这包括鉴权类的 saas 服务, 底层的代码仓库基建支持

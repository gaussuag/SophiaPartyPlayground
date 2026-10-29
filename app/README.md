# 应用装配

已采用 Sites Vinext 全栈 starter。page.tsx 是服务端装配入口；Playground.tsx 消费 session；MatchPanel／ScoreboardEditor／ScheduleAndRecords／AdminTools 组织交互。api/_server.ts 解析受信任身份，api/events/ 装配 records。

Playground 以全屏 venue 为主，GameDrawer 承载次级面板；MatchPanel 显示阵容摘要、版本和纠错，不承载常规选人表单。useEventSession 通过 useSyncExternalStore 管理连接订阅，服务端渲染不创建浏览器连接。placements 将场景意图映射到既有竞争规则和带版本的命令，不按人物位置推断事实。

正式品牌来自 src/config/event.ts：Sophia Sunshine Cup。/setup 为独立管理准备页，公开页面不强制登录；/api/setup 只返回当前请求自己的可信身份与业务权限，登录不会自助授予权限。POST 默认 404，明确开启窗口后也仅管理员能补建配置内的正式／隔离活动，不能上传演练快照。原 /api/local/initialize 在生产仍为 404。

负责页面入口、二维浮层、服务端 HTTP 路由和模块装配。客户端将人物／球场意图映射为带明确身份的命令；服务端路由将可信身份和请求交给 records。

- 规则与状态转换属于 [competition](../src/modules/competition/README.md)。
- 保存、权限、并发属于 [records](../src/modules/records/README.md)。
- 同步、本机草稿与提交结果属于 [session](../src/modules/session/README.md)。
- 3D 交互属于 [venue](../src/modules/venue/README.md)。

ScoreboardEditor 作为场内记分牌的内容传入 venue，只编辑数字；固定显示 matchId 对应的轮次、场地和阵容。保留比分草稿、版本核对、保存反馈与更正；使用原生输入，不建立独立遮罩。当前查看轮次、镜头和选中席位属于本机交互状态。不要为每个球场复制一份业务逻辑，也不要让路由直接拼接比赛数据库修改。

保留 Sites starter 自带身份与构建集成；浏览器不可导入服务端身份、db 或 records 的实现。完整契约见 [架构文档](../docs/architecture/overview.md)。


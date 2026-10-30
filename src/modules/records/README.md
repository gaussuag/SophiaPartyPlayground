# records Module

公开 Interface：index.ts 的 readEvent、execute、readReceipt、exportEvent，另有受控 initializeEvent／restoreEvent。HTTP 格式与运行时解析见 protocol.ts；D1 通过可信上下文传入。

initializeEvent 仅管理员可调用，允许服务端指定新活动显示名称；返回 created 标识。INSERT ... ON CONFLICT DO NOTHING 保证重试、并发或再次部署不会覆盖既有活动，名称也不被重新播种覆盖。生产窗口和允许初始化的两个 eventId 由 src/server/initialization.ts 控制；records 不信任客户端角色或导入快照。

负责服务端权威记录，包括授权、版本校验、调用 competition、D1 条件提交、幂等回执及管理备份。只接收业务命令，不接收客户端整份新状态。接收可信身份上下文，不采用用户自报角色。

2026-10-30 协作权限：`permissions.ts` 是可用于客户端预检的纯权限 Interface；`roleForIdentity` 只接收可信本站身份。未登录 guest 与普通登录 participant 都可调整草稿／跨场移动和首次录分；StartMatch、AdvanceRound、纠错等仅 operator／admin；备份恢复／初始化仅 admin。execute 在业务判断前再次按命令授权。OPERATOR_IDS／ADMIN_IDS 仍来自服务端配置，不能由登录、选人或请求体提升。

guest 的 actorId 仍为 null，不假装已经登录。records 为匿名命令使用服务端固定的匿名审计来源及共同回执空间；不建立匿名管理 Cookie，不允许其成为平台账号。已知随机 commandId 与相同请求可重复读取原匿名回执；不同内容仍拒绝，游客不能读取登录管理者的回执、payload 或请求指纹。匿名无法逐人归因，审计只明确表示匿名来源。

MovePlayer 一并验证源席位、目的席位与双方仍在准备中；清源、替换目的、审计、回执和 revision 在同一次条件 UPDATE 保存，失败不留下半次移出。SubmitResult 可直接从 PLAYING 结束，旧 AWAITING_RESULT 记录兼容，不需要数据库迁移或重置。

通过一个活动快照条件 UPDATE 一并保存业务记录、审计与回执；失败不能留部分结果。权限、冲突、业务拒绝和存储故障可区分。请求超时后可以查原 commandId，不能默认再次创建同一操作。

D1 连接／schema 位于 db/，作为具体实现。先用真实本地 D1 做并发集成测试，不为未来假想数据库抽象通用 Repository。此模块为 server-only，不能进入前端包。

依据：[架构](../../../docs/architecture/overview.md)、[数据与同步](../../../docs/architecture/data-and-sync.md)。


2026-10-30：初始化默认新赛制 v2，已有 eventId 不变；ruleVersion 选项仅为内部显式旧夹具使用，生产 setup 不接受客户端选择模板。CSV 追加“胜方积分”和“Sophia代表队”，按每个当前有效赛果引用的确认阵容计算，旧赛制留空。备份恢复按快照版本校验，保留 v1 和 v2 的正确归属。

2026-10-31：新增 resetEvent 管理员维护 Interface。只接受严格的同活动确认和旧 revision／generation，不接收新快照；清空动态赛事事实，保留实际赛事定义及审计。条件 UPDATE 一次保存新代、幂等回执和 beforeRestore 恢复点，旧回执退休，结果未知沿现有 readReceipt 查询。仅最近维护前备份，可从原导出／恢复入口回退；不依赖初始化窗口。

2026-10-31：StartRound 沿 execute 的受管权限和一次CAS提交，回执包含全部已确认阵容引用；不是客户端循环发三次 StartMatch。真实D1检查覆盖未排齐全部不写、匿名／普通登录拒绝、相同编号并发只生效一次、与访客排阵竞争不部分开赛。

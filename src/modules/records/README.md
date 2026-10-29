# records Module

公开 Interface：index.ts 的 readEvent、execute、readReceipt、exportEvent，另有受控 initializeEvent／restoreEvent。HTTP 格式与运行时解析见 protocol.ts；D1 通过可信上下文传入。

负责服务端权威记录，包括授权、版本校验、调用 competition、D1 条件提交、幂等回执及管理备份。只接收业务命令，不接收客户端整份新状态。接收可信身份上下文，不采用用户自报角色。

通过一个活动快照条件 UPDATE 一并保存业务记录、审计与回执；失败不能留部分结果。权限、冲突、业务拒绝和存储故障可区分。请求超时后可以查原 commandId，不能默认再次创建同一操作。

D1 连接／schema 位于 db/，作为具体实现。先用真实本地 D1 做并发集成测试，不为未来假想数据库抽象通用 Repository。此模块为 server-only，不能进入前端包。

依据：[架构](../../../docs/architecture/overview.md)、[数据与同步](../../../docs/architecture/data-and-sync.md)。


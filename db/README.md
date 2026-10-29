# D1 存储与迁移

db/schema.ts 已定义 events 聚合表，drizzle/ 保存已生成迁移和元数据。保留 Sites Vinext starter 的 db/index.ts 与构建约定；records 使用传入的真实 D1 绑定执行参数化条件 UPDATE，并用 first-primary 会话读取。

本项目初版的 events 表保存单活动快照，以 revision 条件更新实现原子提交；业务、审计与回执在同一保存单元内。迁移只建表，初始化必须显式执行。具体契约见 [数据与同步](../docs/architecture/data-and-sync.md)。

- schema 迁移只负责结构，模板初始化由显式、幂等管理操作执行。
- 本地 D1 与生产 D1 是不同环境；测试只使用本地实例。
- 本地迁移需要使用 starter 生成的配置和本地状态目录，不能凭空假定根目录存在 wrangler.jsonc。
- 不在请求处理中随意建表或修改 schema。
- 已应用迁移不改写，后续变化追加迁移。
- 生产部署、迁移和初始化属于最后的发布阶段。
- 导出的真实活动记录、本地数据库和凭证不能提交到源码。

仅 records 使用此实现；客户端不导入数据库连接或环境绑定。


# 测试布局

已有 33 项自动检查（competition 17、真实本地 D1 records 8、session 8），运行 npm test。完整清单见 [validation-and-release.md](../docs/delivery/validation-and-release.md)，证据见 [本地验收记录](../docs/delivery/local-validation-2026-10-29.md)。

当前布局与后续浏览器验证位置：

- competition/：通过 decide／project 验证业务不变量、转换、更正和整轮可行性。
- records/：使用真实本地 D1 验证权限、条件写入、并发、幂等、故障与备份恢复。
- session/：验证乱序响应、超时后回执恢复、重连、草稿绑定与同步反馈。
- e2e/：通过两个独立浏览器上下文运行排阵、开赛、录分、推进和历史更正。
- fixtures/：从 data/event-template.json 构建可重置测试活动，不使用生产活动数据。

先在公开 Interface 验证外部行为，不复制实现写同构测试，不只用 mock 数据库测试生产事务语义。测试夹具明确 eventId，测试启动不得连接远端生产数据库。

实际 iPhone 验证单独记录设备、步骤、证据及通过／失败／未测，桌面模拟不当作实机结果。生成日志、报告和截图置于被忽略的 outputs/ 或 test-results/。


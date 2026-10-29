# 测试入口

检查命令见 [package.json](../package.json) scripts，测试选择与超时以 [vitest.config.ts](../vitest.config.ts) 为准，实际数量以当前 runner 输出为准。[CI](../.github/workflows/ci.yml) 自动运行现有检查；完整验收范围见 [validation-and-release.md](../docs/delivery/validation-and-release.md)。

- competition/：通过 decide／project 验证业务不变量、转换、更正和整轮可行性；包括场景安排到命令的映射。
- records/：使用真实本地 D1 验证权限、条件写入、并发、幂等、故障与备份恢复。
- session/：验证乱序响应、超时后回执恢复、重连、草稿绑定与同步反馈。
- venue/：验证固定场地坐标、镜头放大后世界布局不变、缩放／平移边界，以及五种视口中牌框不压住比赛区域且本场入口仍可见；真实拾取与显示仍用浏览器操作检查。
- fixtures/：从原始模板构建隔离的测试活动。
- [verify-local.mjs](../scripts/verify-local.mjs)：针对开发服务和真实本地 D1 做完整 HTTP 演练；自动创建独立活动。
- [verify-production.mjs](../scripts/verify-production.mjs)：针对本地生产构建检查只读权限、请求拒绝后 SSR 及产物隔离。使用已经在同一 worktree 初始化的测试 eventId。

浏览器回归步骤与截图证据见 [首次验收](../docs/delivery/local-validation-2026-10-29.md) 和 [界面验收](../docs/delivery/ui-game-first-2026-10-29.md)。

测试从公开 Interface 观察外部行为；真实数据库语义用真实本地 D1 验证。测试活动明确 eventId 和本地 URL，与正式活动分开。生成日志与截图置于忽略的输出目录；实际 iPhone 检查单独记录设备、步骤、结果与未测项。

# 测试入口

检查命令见 [package.json](../package.json) scripts，测试选择与超时以 [vitest.config.ts](../vitest.config.ts) 为准，实际数量以当前 runner 输出为准。[CI](../.github/workflows/ci.yml) 自动运行现有检查；完整验收范围见 [validation-and-release.md](../docs/delivery/validation-and-release.md)。

- competition/：通过 decide／project 验证业务不变量、转换、更正和整轮可行性；包括场景安排到命令的映射。
- competition/round-flow.test.ts：原子跨场移动、源／目的开赛锁、直接录分、旧状态兼容、赛后留场／新轮候场／历史恢复与第七轮 2/2；调用 Scene 实际共用的 playerPlacement，不另写一份场景逻辑。
- records/：使用真实本地 D1 验证权限、条件写入、并发、幂等、故障与备份恢复。
- records/ 新协作场景：guest／participant 排阵／首次录分与管理操作拒绝；录分并发、移动与开赛并发、原子失败和重试；permissions 检查可信身份分类及不因匿名协作或普通登录取得管理权限。
- server/：验证生产初始化窗口默认关闭、正式／验收编号有效且分离；对应授权、并发、拒绝自报身份和不覆盖记录由 records 的真实 D1 检查落实。
- session/：验证乱序响应、超时后回执恢复、重连、草稿绑定与同步反馈。
- venue/：验证固定场地坐标、镜头放大后世界布局不变、缩放／平移边界，以及五种视口中牌框不压住比赛区域且本场入口仍可见；真实拾取与显示仍用浏览器操作检查。
- venue/gesture-controller.test.ts：直接调用真实 React／R3F 接入的指针拥有者，覆盖触界超额反向、up 末样本、多指与第三指、取消、原生 DOMRect accessor、implicit capture 转交、重复提交和 resize 落点。
- venue/avatar-*.test.ts：路线避网、转向到位、改目标、多人独立、结果去重、恢复与减少动态效果；authority 检查通过 session、实际 playerPlacement 和 AvatarMotion 验证即时预测、确认不停步、失败平滑纠正、未知结果／原编号重试、回执领先读取、双客户端与确认缓存隔离，以及持久化间隙的重复提交防护。
- venue/scene-play.test.ts：三种有限互动的复位、取消、点击／滑动仲裁及 320×568 起的触区与底部 dock 留白。
- fixtures/：从原始模板构建隔离的测试活动。
- [verify-local.mjs](../scripts/verify-local.mjs)：针对开发服务和真实本地 D1 做完整 HTTP 演练；自动创建独立活动。
- [verify-production.mjs](../scripts/verify-production.mjs)：针对本地生产构建检查 guest 协作角色和管理隔离、请求拒绝后 SSR 及产物隔离。使用已经在同一 worktree 初始化的测试 eventId。
- [verify-public.mjs](../scripts/verify-public.mjs)：仅在 Sites 实际返回公开 URL 后执行，无管理 Cookie、真实身份或 bypass token；检查公开 guest 身份、匿名管理拒绝和正式数据初始／活动中状态；匿名排阵／录分的正向验收另记录在隔离活动，另有伪造身份负例。不能代替独立未登录浏览器的实际页面验证。

浏览器回归步骤与截图证据见 [首次验收](../docs/delivery/local-validation-2026-10-29.md) 和 [界面验收](../docs/delivery/ui-game-first-2026-10-29.md)。

2026-10-30 新增 [真实页面轨迹 harness](browser/venue-harness.html)，在开发服务打开 `/tests/browser/venue-harness.html?event=local-...`。使用同 worktree 的隔离活动，入口拒绝非环回或非 local 编号。按钮驱动真实 React 接线，检查相机轨迹、取消无写入、viewport resize、标签聚焦滚动和 WebGL context 恢复；结果可复制为 JSON。它不包含在生产构建，也不能替代 Safari 原生触摸。最终 117 项检查与截图／性能记录见 [游戏化交付](../docs/delivery/game-upgrade-2026-10-30.md)。

测试从公开 Interface 观察外部行为；真实数据库语义用真实本地 D1 验证。测试活动明确 eventId 和本地 URL，与正式活动分开。生成日志与截图置于忽略的输出目录；实际 iPhone 检查单独记录设备、步骤、结果与未测项。

[排阵即时动画 harness](browser/optimistic-harness.html) 在开发服务用 `/tests/browser/optimistic-harness.html?event=local-...` 打开；活动需已开放第一轮、W01 尚未安排。按 1 → 4 执行真实页面的延迟保存、拒绝回位、成功响应丢失和未送达原编号重试，读取真实模型位置与正式记录版本。故障仅注入 harness 内的 iframe fetch，不进入产品或生产构建；仍不等同于实际 iPhone 验收。

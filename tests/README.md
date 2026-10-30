# 测试入口

- `venue/short-routes.test.ts`：最短路长度、无遮挡直行、直线飞越球网、最近空闲下场点、预测 ACK／拒绝、可见中断点、换轮与历史／恢复重建。
- [路线浏览器回归](browser/short-routes-harness.html)：开发服务 `/tests/browser/short-routes-harness.html?event=local-新的编号`，双客户端对照实际锚点、步行／飞行轨迹、就近下场、人物间距、头像无光环、暂停及请求预算。仍非 Safari 实机。

2026-10-30 v2 发布源码：21 文件、179 项自动检查通过；类型、静态检查及本地生产通过。新旧完整 HTTP＋D1 和浏览器证据见 [交付记录](../docs/delivery/cup-v2-schedule-and-points-2026-10-30.md)。实机检查分别记录。

- 新赛制入口：competition/cup-v2.test.ts、records/cup-v2.test.ts、venue/angel.test.ts，覆盖 13 人／21 场、跨两侧自由选手匹配、代表队、1／2 分、更正／撤回／名单纠错和跨赛制恢复拒绝。
- `npm run verify:cup-v2`：真实 HTTP＋D1 的 21 场、7 次推进竞争、公开排阵／录分、Sophia 对侧抢占、重复回执、两客户端读取、更正、CSV 和恢复；CI 在旧 v1 HTTP 回归后运行。
- [v2 浏览器回归](browser/cup-v2-harness.html)：开发服务打开 `/tests/browser/cup-v2-harness.html?event=local-新的编号`，点击运行。自动创建自己的空 v2 活动，检查姓名／头像、飞行、开赛确认、录分、积分更正、偶数轮候选、匿名端、三种手机尺寸和动画请求预算。已存在的非空活动会拒绝重置。该测试不是 Safari 实机验收。
- 旧 fixtures/event.ts 显式使用 ruleVersion=1；下面 v1 第七轮 2/2、自由双打等用例保留作兼容回归。新活动默认 v2，末轮 3/3。rally／optimistic 等旧 harness 需通过开发初始化入口显式创建 v1 独立活动，不能用它们判断新赛制的类型。

- venue/local-choreography.test.ts：通过实际 project／playerPlacement 与本机驱动 Interface 验证 0～4 人、1v2、双球热身／单球比赛、单打、换人／跨场／移除、录分后留场、历史恢复、个人候场边界、点击冻结、独立节奏及暂停／减少动态效果。动画不写业务记录。
- competition/presentation.test.ts：核对“准备完成”不算已开赛、录分进度含义、第七轮 2/2 和协作／管理角色的下一步提示。

[本机演出 harness](browser/rally-harness.html) 在开发服务用 `/tests/browser/rally-harness.html?event=local-...` 打开，先创建独立的空活动，按 1 → 6 执行。覆盖两客户端 0～4 人配对、单双球切换、候场点击稳定、暂停／恢复与请求计数、第二轮赛程定位、合成后台／减少动态效果信号、320×568 席位／头像热区，实际界面录分留场、自身回执不误报冲突、他端更正仍保留输入并要求核对，以及六种视口的全景／近景状态提示、工具条／本场记分牌避让与访客等待管理者状态。第四项是受控合成信号，不能替代系统偏好或 Safari 实机行为；该 harness 不进入生产构建。只对它自己的 local 活动写入，不重置已有记录。

检查命令见 [package.json](../package.json) scripts，测试选择与超时以 [vitest.config.ts](../vitest.config.ts) 为准，实际数量以当前 runner 输出为准。[CI](../.github/workflows/ci.yml) 自动运行现有检查；完整验收范围见 [validation-and-release.md](../docs/delivery/validation-and-release.md)。

- competition/：通过 decide／project 验证业务不变量、转换、更正和整轮可行性；包括场景安排到命令的映射。
- competition/placements.test.ts：同时覆盖席位头像候选与场景落点；候选队伍／性别、准备中原子移人、已开赛排除、整轮可行性、旧版本／恢复、历史名单更正均从同一业务规则得到。
- competition/round-flow.test.ts：原子跨场移动、源／目的开赛锁、直接录分、旧状态兼容、赛后留场／新轮候场／历史恢复与第七轮 2/2；调用 Scene 实际共用的 playerPlacement，不另写一份场景逻辑。
- records/：使用真实本地 D1 验证权限、条件写入、并发、幂等、故障与备份恢复。
- records/ 新协作场景：guest／participant 排阵／首次录分与管理操作拒绝；录分并发、移动与开赛并发、原子失败和重试；permissions 检查可信身份分类及不因匿名协作或普通登录取得管理权限。
- server/：验证生产初始化窗口默认关闭、正式／验收编号有效且分离；对应授权、并发、拒绝自报身份和不覆盖记录由 records 的真实 D1 检查落实。
- session/：验证乱序响应、超时后回执恢复、重连、草稿绑定与同步反馈。
- venue/：验证固定场地坐标、镜头放大后世界布局不变、缩放／平移边界，以及五种视口中牌框不压住比赛区域且本场入口仍可见；真实拾取与显示仍用浏览器操作检查。
- venue/gesture-controller.test.ts：直接调用真实 React／R3F 接入的指针拥有者，覆盖触界超额反向、up 末样本、多指与第三指、取消、原生 DOMRect accessor、implicit capture 转交、重复提交和 resize 落点。
- venue/avatar-*.test.ts：路线避网、转向到位、改目标、多人独立、结果去重、恢复与减少动态效果；authority 检查通过 session、实际 playerPlacement 和 AvatarMotion 验证即时预测、确认不停步、失败平滑纠正、未知结果／原编号重试、回执领先读取、双客户端与确认缓存隔离，以及持久化间隙的重复提交防护。
- venue/avatar-attention.test.ts：候选举手有限结束、重复渲染不续播、切席位重播、关闭／隐藏／减少动态效果取消且保留静态选人提示。
- fixtures/：从原始模板构建隔离的测试活动。
- [verify-local.mjs](../scripts/verify-local.mjs)：针对开发服务和真实本地 D1 做完整 HTTP 演练；自动创建独立活动。
- [verify-production.mjs](../scripts/verify-production.mjs)：针对本地生产构建检查 guest 协作角色和管理隔离、请求拒绝后 SSR 及产物隔离。使用已经在同一 worktree 初始化的测试 eventId。
- [verify-public.mjs](../scripts/verify-public.mjs)：仅在 Sites 实际返回公开 URL 后执行，无管理 Cookie、真实身份或 bypass token；检查公开 guest 身份、匿名管理拒绝和正式数据初始／活动中状态；匿名排阵／录分的正向验收另记录在隔离活动，另有伪造身份负例。不能代替独立未登录浏览器的实际页面验证。

浏览器回归步骤与截图证据见 [首次验收](../docs/delivery/local-validation-2026-10-29.md) 和 [界面验收](../docs/delivery/ui-game-first-2026-10-29.md)。

2026-10-30 新增 [真实页面轨迹 harness](browser/venue-harness.html)，在开发服务打开 `/tests/browser/venue-harness.html?event=local-...`。使用同 worktree 的隔离活动，入口拒绝非环回或非 local 编号。按钮驱动真实 React 接线，检查相机轨迹、取消无写入、viewport resize、标签聚焦滚动和 WebGL context 恢复；结果可复制为 JSON。它不包含在生产构建，也不能替代 Safari 原生触摸。最终 117 项检查与截图／性能记录见 [游戏化交付](../docs/delivery/game-upgrade-2026-10-30.md)。

测试从公开 Interface 观察外部行为；真实数据库语义用真实本地 D1 验证。测试活动明确 eventId 和本地 URL，与正式活动分开。生成日志与截图置于忽略的输出目录；实际 iPhone 检查单独记录设备、步骤、结果与未测项。

[排阵即时动画 harness](browser/optimistic-harness.html) 在开发服务用 `/tests/browser/optimistic-harness.html?event=local-...` 打开；活动需已开放第一轮、W01 尚未安排。按 1 → 5 执行延迟保存、拒绝回位、成功响应丢失、未送达原编号重试，以及头像候选／场景高亮／走动中触摸／Escape／另一客户端修改后旧选位失效，读取人物锚点与正式版本。故障仅注入 harness 内的 iframe fetch，不进入产品或生产构建；仍不等同于实际 iPhone 验收。

- venue/paddle.test.ts：当前全员固定且不同的球拍配色、历史备用色、实体轮廓／厚度／握把、竖起且前倾的挂载方向、单次绘制与几何预算、缓存复用和实例颜色隔离。
- [球拍评审页](browser/paddle-studio.html)：开发服务 /tests/browser/paddle-studio.html，使用真实 Avatar 和同一球拍网格对照正／侧／背面、13 种配色与挥拍。只提供本地视觉探针，不读写活动、不进入生产路由；该页手动演示挥拍参数，正式热身／比赛仍由真实场次驱动。

- venue/environment.test.ts：装饰顶点与设施不进入球场／候场／记分牌保留区、几何合并预算、静态材质变体隔离与资源复用。
- [阳光运动场回归](browser/park-harness.html)：开发服务打开 /tests/browser/park-harness.html?event=local-新的编号，先执行原有 v2 业务回归，再执行环境检查。覆盖六种视口、固定场地坐标、全员与姓名触区、绘制预算、合成单指旋转／双指缩放、暂停后无额外持续循环、恢复及无业务写入。不能替代 iPhone Safari 实机；只创建新的独立本地活动，不重置既有演练。

- venue/paddle-contact.test.ts：以真实 Three Group 层级独立核对接触点；1v1／1v2／2v1／双打／Sophia 的球面贴拍、连续边界、错峰热身、过网与落地；全员初始和跨轮候场只在两排。
- [拍面触球回归](browser/paddle-contact-harness.html)：开发服务 /tests/browser/paddle-contact-harness.html?event=local-新的编号。实际场景与 D1、两个客户端，读取真实 paddleCenter 矩阵，采样接触帧误差、四人双球／三人单球／Sophia／比赛单球及录分清理。检查下场目标、可见到位和无动画写入。该量化补充不代替 Safari 实机观感。
- short-routes.test.ts 与 short-routes-harness 已更新为前后排停留；原侧边最近点距离门槛不再代表新的范围约束。

- records/reset.test.ts：真实 D1 的管理员重置、四种非管理员拒绝、严格确认、旧／新赛制保留、积分清零、恢复点、幂等／并发与旧命令失效。
- session/reset.test.ts：仅 admin 发送、确认版本冲突、响应丢失后刷新读取原回执且不再重置。
- [比分牌与重置回归](browser/scoreboard-reset-harness.html)：本地独立活动，四种视口三块两位数比分完整且可读；真实管理员菜单、取消无写入、确认清空、匿名拒绝与隐藏、两客户端、旧确认拒绝及完整备份恢复。非 Safari 实机。

- venue/rally-variation.test.ts：多 seed 的非固定接球次序、四人公平参与、接触／落点／弧线／落地时机变化、可重查未来姿态、严格拍面连续接触和过网／边界。
- venue/spectator-wander.test.ts：真实场下名单连续三分钟走停、超出原位、步道边界、人物间距、按下／点选冻结、暂停与减少动态效果、无关读取连续性和上场退出走动。
- [随机回球与场外走停浏览器验收](browser/varied-rally-harness.html)：使用新 local 活动，实际32秒采样单球线路、落点、场外人物位置与两客户端差异；触屏按下／选中冻结、暂停恢复、真实阵容一致和无动画写入。桌面合成触屏不替代真实 Safari。

- competition/round-start-finale.test.ts、records/round-start.test.ts：整轮未排齐拒绝、唯一阵容／单revision、兼容已开始比赛、新旧七轮、晚解锁、同分、可信权限、并发／幂等／无部分提交。
- venue/finale.test.ts：全员角色、仅胜队发球、最多六球、Sophia飞行、固定彩带池、暂停／减少动态效果及历史清理；fixtures/finished-cup.ts 仅构建有效七轮，避免导入测试文件重复注册。
- [整轮确认与谢幕浏览器验收](browser/round-finale-harness.html)：新的 local 活动、真实D1／HTTP，两客户端统一一次确认、完整21场七轮、末轮确认前隐藏、自动进入、白胜／同分／黑胜、更正换位、历史退出重进、刷新恢复与无动画写入。旧 cup-v2-harness 的逐场确认 UI 为历史流程，新统一开赛界面以此入口验证；旧协议 HTTP 和单元回归继续保留。

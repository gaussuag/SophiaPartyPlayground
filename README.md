# Sophia Sunshine Cup

Sophia 组织的匹克球活动管理网页，代码仓库为 SophiaPartyPlayground，主要面向 iPhone Safari 竖屏。通过虚拟角色安排选手，通过球场与记分牌推进比赛，核心流程中唯一需要键入的数据是比分。

## 当前交付状态

- 2026-10-30 本机球场演出与状态表达已完成本地实现：按真实阵容生成热身／比赛球，候场短走及多种动作，点击冻结、后台暂停和减少动态效果；赛程定位当前轮，明确录分进度和下一步。174 项检查及真实 HTTP＋D1 回归通过，保留既有比赛数据与管理权限；本次构建、浏览器及实际发布回执见 [本机演出交付](docs/delivery/local-court-animation-2026-10-30.md)。

- 2026-10-30 横向三场地与头像选人已发布为 Sites 版本 8：点空位可选头像＋姓名，候选人物短暂举手与光圈提示，走动／保存／锁定时不自动弹人物详情。152 项检查、真实 D1／HTTP、浏览器及线上头像选人／双客户端同步通过，正式数据未变；见 [本次交付](docs/delivery/court-layout-and-picker-2026-10-30.md)。
- 2026-10-30 排阵即时动画已发布为 Sites 版本 7：发起页面先行动、后台保存；确定拒绝／冲突平滑纠正，未知结果查原回执，确认成功不重走。143 项检查、浏览器四项网络故障轨迹、生产检查与线上双客户端／匿名协作通过，正式数据保持一致，见 [本次交付](docs/delivery/optimistic-arrangement-2026-10-30.md)。
- 2026-10-30 协作赛制更新已发布为 Sites 版本 6：所有访客含匿名可排阵、跨场移动、下场与首次录分，指定管理者确认开赛和本轮结束。录分后留场、新轮回候场、历史轮恢复原对阵；16 个文件 136 项检查及本地 HTTP／浏览器闭环通过，见 [本次交付记录](docs/delivery/round-flow-collaboration-2026-10-30.md)。
- 2026-10-30 游戏化升级已按用户后续授权发布为 Sites 版本 4：统一触控序列、俯仰边界即时反向、权威快照驱动人物行走与状态动作，以及练习球／小太阳／风扇三种互动。117 项检查、最终构建及发布后匿名 HTTP 检查通过，正式活动数据保持一致；见 [版本 4 发布记录](docs/delivery/game-upgrade-release-2026-10-30.md)。本地实现、证据、启动和 iPhone 未测脚本见 [交付记录](docs/delivery/game-upgrade-2026-10-30.md)。
- 2026-10-30 后续清理：三个开发分支及其 D 盘 worktree 已合入 main 并移除，本地测试数据和证据保存在忽略目录 `outputs/worktree-cleanup-2026-10-30/game-scene-upgrade/`。两个 C 盘 Codex 受管 worktree 仍被当前或其他对话占用，暂不能通过归档工具移除。
- 已完成需求、交互、状态、数据、模块架构及实施计划文档。
- 已录入 14 名选手、3 块场地、7 轮、20 场比赛的机器可读模板。
- 已建立代码、数据、测试及资源目录；目录中的 README 是实现职责说明。
- 已实现 Vinext + React + TypeScript + Three.js／R3F 应用、真实本地 D1 权威存储及四个业务 Module。
- 三场地、七轮二十场、角色排阵、录分、更正、同步、导出和受控恢复已接通。
- TypeScript 检查和 152 项自动检查通过；真实 HTTP＋D1 完成二十场演练，浏览器完成一轮闭环与双客户端同步，排阵动画追加保存故障与恢复轨迹、头像选人和横向场景验证。
- 界面以连续三场地 3D 球馆为主，通过缩放和平移查看单场，直接点人物／拖入场内位置。确认上场、录分和更正均从场内记分牌进入；见 [连续球馆与记分牌验证](docs/delivery/ui-continuous-venue-2026-10-29.md)，前次记录保留在 [界面优化记录](docs/delivery/ui-game-first-2026-10-29.md)。
- 记分牌已缩为场边单行操作牌，桌面移到候场区后方，竖屏留在场间空隙；见 [场边记分牌优化](docs/delivery/ui-courtside-scoreboard-2026-10-29.md)。
- 单指旋转按固定枢轴直接跟手，双指缩放平移；回正、全景和球场近景使用统一过渡。人物资料卡居中，轮次／设置仍从底部弹出。最新 [旋转响应诊断与优化](docs/delivery/ui-orbit-response-2026-10-30.md) 记录了 iPhone 17 反馈及官方参考；前次记录见 [触控与人物弹窗优化](docs/delivery/ui-touch-orbit-2026-10-30.md)。
- 已提供同 Wi-Fi 的 iPhone 体验入口，普通设备默认只读，专用链接获得临时演练权限；启动、关闭与实机检查见 [iPhone Wi-Fi 指南](docs/delivery/iphone-wifi-preview.md)。
- P2 已做桌面窄屏原型验证；P6 可执行的本地检查已通过。用户授权真实 iPhone Safari、现场网络及长时间性能检查后置到 Site 发布后，仍记为未测。
- 已完成默认关闭的生产初始化窗口、本站身份核对页、独立正式／验收配置和匿名 HTTP 检查脚本；见 [P6–P7 发布准备](docs/delivery/p6-p7-release-preparation-2026-10-29.md)。
- ChatGPT Sites 版本 8 已成功部署为 public：[Sophia Sunshine Cup](https://sophia-sunshine-cup.gaussuag777.chatgpt.site)。所有访客含匿名可排阵／首次录分，仅 gaussuag777@gmail.com 管理开赛、轮次及纠错。本次发布与验收期间正式活动 revision=54、3 条赛果版本及完整摘要不变，见 [横向球馆与头像选人](docs/delivery/court-layout-and-picker-2026-10-30.md)；前次 [即时动画交付](docs/delivery/optimistic-arrangement-2026-10-30.md) 保留历史证据。Safari 新版手感由用户继续验收；独立 Edge 匿名复测因电脑控制无法确认网址而中止，未标记通过。

## 从这里开始

1. [已确认需求与范围](docs/product/requirements.md)：当前规则的权威说明。
2. [交互与状态机](docs/product/interaction-and-state.md)：角色操作、录分、撤销与轮次推进。
3. [架构与模块 Interface](docs/architecture/overview.md)：模块职责、依赖方向和技术选择。
4. [数据与同步](docs/architecture/data-and-sync.md)：业务身份、保存、并发、断线和恢复。
5. [实施顺序](docs/delivery/implementation-plan.md)：开发阶段及完成条件。
6. [测试与发布](docs/delivery/validation-and-release.md)：本地、多客户端、手机及最后的 Sites 发布验收。
7. [领域术语](CONTEXT.md)和[活动模板](data/event-template.json)。

以用户最新确认和 requirements.md 为准。此前对话中的“单人单机为最终版本”“浏览器数据库为权威”“时间到结束比赛”“平局／判定规则待定”方案已被替代。单场比分的目标分门槛由现场掌握，网页无需实现目标分或时限控制。

## 已确认的关键规则

- 全部比赛白队对黑队；自由双打每侧两人、性别不限。
- 通过最终比分录入驱动结束与赛果确认，不实现倒计时、超时或平局流程。
- 本轮全部正式比赛录分完成后，人工进入下一轮。
- 所有参赛者可以访问，比赛数据需要跨设备同步。
- Sites 是最终发布渠道；本地开发与测试在先，发布在最后。
- 原始数值只保存；黑白队总成绩算法尚未确定。

## 仓库结构

~~~text
.
├── README.md
├── CONTEXT.md
├── docs/
│   ├── product/
│   │   ├── requirements.md
│   │   └── interaction-and-state.md
│   ├── architecture/
│   │   ├── overview.md
│   │   └── data-and-sync.md
│   ├── delivery/
│   │   ├── implementation-plan.md
│   │   └── validation-and-release.md
│   └── adr/
│       └── 0001-shared-event-authority.md
├── data/
│   ├── README.md
│   └── event-template.json
├── app/                         # 未来的 Vinext 页面、浮层及 HTTP 路由装配
├── src/modules/
│   ├── competition/             # 纯业务规则与状态转换
│   ├── records/                 # 服务端授权、权威记录与原子提交
│   ├── session/                 # 客户端同步、命令回执与本机草稿
│   └── venue/                   # 3D 场景、拾取、镜头和动画
├── db/                          # D1 schema 与存储入口；SQL 迁移初始化时生成
├── public/                      # 后续模型、纹理等公开静态资源
└── tests/                       # 业务、真实存储集成、多客户端及浏览器测试
~~~

## 本地运行

Node.js >=22.13，使用 package-lock.json 安装。在仓库根目录执行：

~~~powershell
npm ci
npm run build
npm run db:migrate
npm run dev -- --hostname 127.0.0.1
~~~

保持开发服务运行，在另一个终端显式初始化（可重复运行，不会重置）：

~~~powershell
npm run local:init
~~~

访问 [本地球馆](http://127.0.0.1:5173/?event=local-sophia)。未登录者可协作排阵与首次录分；管理登录使用 starter 的环回开发身份。管理者开放第一轮后，点人物／拖入合法位置，由管理者确认上场。真实比赛结束后点 3D 记分牌录分。

~~~powershell
npm run typecheck
npm test
npm run verify:local
~~~

`verify:local` 需要开发服务运行，会创建独立 `local-http-*` 活动，通过真实 HTTP 和本地 D1 演练二十场；不会覆盖 `local-sophia`。

生产构建也可本地预览，它没有开发登录模拟，默认只读：

~~~powershell
npm start -- --port 8787
# 另一个终端：
npm run verify:production
~~~

受限 Windows 环境若 Wrangler 无法写入默认配置目录，仅为本地预览设置工作区目录后再启动：

~~~powershell
$env:XDG_CONFIG_HOME = Join-Path (Get-Location) '.sites-runtime/xdg-config'
npm start -- --port 8787
~~~

重装依赖前先停止预览，Windows 会锁定已加载的原生模块；重新构建前也应停止占用 dist/ 的生产预览。修改 schema 后生成新迁移、重新构建再执行 `db:migrate`；迁移日志防止重放已应用迁移。

证据、权限配置说明和待测事项见 [本地验收记录](docs/delivery/local-validation-2026-10-29.md)。`.wrangler/`、IndexedDB、`outputs/` 是本地演练或生成内容；`data/event-template.json` 保持原始模板。


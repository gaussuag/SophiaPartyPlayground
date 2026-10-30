# Sophia Sunshine Cup

Sophia 组织的匹克球活动管理网页，代码仓库为 SophiaPartyPlayground，主要面向 iPhone Safari 竖屏。通过虚拟角色安排选手，通过球场与记分牌推进比赛，核心流程中唯一需要键入的数据是比分。

## 当前交付状态

- 2026-10-31 随机回球与场外走停已完成本地实现：比赛接球顺序、落点和弧线变化；未上场角色在场外步道自由走停，点选冻结。正在执行最终验证与发布，见 [本次交付](docs/delivery/varied-rally-and-spectators-2026-10-31.md)。

- 2026-10-31 已发布原 public Site **版本 18**：全员改为人物自身右手握拍、拍头更向右外倾；两位数比分完整；管理员「更多 → 重置比赛数据」带明确确认、原子前态备份、幂等与版本保护。220 项检查、双客户端、触球及生产验证通过；线上既有数据不变。见 [本次交付](docs/delivery/right-hand-reset-scoreboard-2026-10-31.md)。

- 2026-10-30 两排候场与拍面触球细化已发布为原 public Site **版本 17**：下场只选择球场前后两排最近空位，不停在场间；球、球拍和挥拍共用接触时间轴，增加引拍／随挥和短触球反馈。保留阳光公园、比赛流程和权威记录，见 [本次交付](docs/delivery/paddle-contact-and-bench-rows-2026-10-30.md)。

- 2026-10-30 户外阳光运动场视觉改造已发布为原 public Site **版本 16**：保留连续三场地和全部业务流程，蓝色外场／淡紫比赛区、连续步道、绿化、座椅、遮阳亭、围栏、运动照明造型及滨水城市远景；自写静态阳光着色器，不增加动画时钟或外部资产请求。实现与验证见 [阳光运动场交付](docs/delivery/sunshine-park-2026-10-30.md)。

- 2026-10-30 球拍程序建模升级已发布为原 public Site **版本 15**：实体圆角拍面、护边、握把／端盖、双面斜纹和握柄手掌，按选手身份固定 13 种配色；参照用户图片调整为拍头朝上、拍面略向前。沿用现有角色与赛事，未恢复废弃 Avatar 方案。192 项自动检查与类型检查通过；验证及发布回执见 [球拍交付](docs/delivery/paddle-upgrade-2026-10-30.md)。

- 2026-10-30 直飞与就近下场已发布为原 public Site **版本 14**：Sophia 去掉头顶光环、保留翅膀，直飞越过球场与球网；普通选手按最短路线到目标，仅绕过实体球网。下场停在最近可用场边，位置只保存在当前浏览器；188 项自动检查、类型检查和两组浏览器回归通过。生产与发布回执见 [直飞和最短路线交付](docs/delivery/short-routes-2026-10-30.md)。

- 2026-10-30 新赛制已发布为同一 public Site **版本 13**：Mike 退赛，Sophia 自由阵营天使；13 人、7 轮 21 场交替赛程，普通胜场 1 分、Sophia 参赛场胜方 2 分。用户确认偶数轮 Sophia 代表黑队，线上旧记录为可清零测试，新正式活动从零开始。179 项检查、旧／新完整 HTTP＋D1、浏览器和生产验证通过；线上匿名协作、管理开赛和积分更正通过，正式活动保持 0 阵容／0 比分。规则、兼容、验证与发布回执见 [新赛制交付](docs/delivery/cup-v2-schedule-and-points-2026-10-30.md)。

- 2026-10-30 手机状态区与场边对象精简已发布为 Sites 版本 12：状态／保存反馈归入底部操作区，避开上方视角工具条；删除“弹一下、打招呼、吹吹风”的按钮、模型和动画。18 文件、160 项检查、六种视口、选人回归及生产验证通过；减少的 14 项测试只属于已移除功能。正式数据 revision 75／6 条赛果版本和摘要保持一致，见 [本次交付](docs/delivery/hud-and-scene-cleanup-2026-10-30.md)。

- 2026-10-30 本机球场演出与状态表达已发布为 Sites 版本 11：真实阵容驱动热身／比赛球、候场多种动作及短走、点击冻结、暂停和减少动态效果；赛程定位当前轮，明确录分进度和下一步。174 项检查、真实 HTTP＋D1、浏览器及生产验证通过，修复录分成功的假冲突提示及步骤提示遮挡。正式活动 revision 65 及全部数据摘要不变，见 [本机演出交付](docs/delivery/local-court-animation-2026-10-30.md)。

- 2026-10-30 横向三场地与头像选人已发布为 Sites 版本 8：点空位可选头像＋姓名，候选人物短暂举手与光圈提示，走动／保存／锁定时不自动弹人物详情。152 项检查、真实 D1／HTTP、浏览器及线上头像选人／双客户端同步通过，正式数据未变；见 [本次交付](docs/delivery/court-layout-and-picker-2026-10-30.md)。
- 2026-10-30 排阵即时动画已发布为 Sites 版本 7：发起页面先行动、后台保存；确定拒绝／冲突平滑纠正，未知结果查原回执，确认成功不重走。143 项检查、浏览器四项网络故障轨迹、生产检查与线上双客户端／匿名协作通过，正式数据保持一致，见 [本次交付](docs/delivery/optimistic-arrangement-2026-10-30.md)。
- 2026-10-30 协作赛制更新已发布为 Sites 版本 6：所有访客含匿名可排阵、跨场移动、下场与首次录分，指定管理者确认开赛和本轮结束。录分后留场、新轮回候场、历史轮恢复原对阵；16 个文件 136 项检查及本地 HTTP／浏览器闭环通过，见 [本次交付记录](docs/delivery/round-flow-collaboration-2026-10-30.md)。
- 2026-10-30 游戏化升级已按用户后续授权发布为 Sites 版本 4：统一触控序列、俯仰边界即时反向、权威快照驱动人物行走与状态动作，以及练习球／小太阳／风扇三种互动。117 项检查、最终构建及发布后匿名 HTTP 检查通过，正式活动数据保持一致；见 [版本 4 发布记录](docs/delivery/game-upgrade-release-2026-10-30.md)。本地实现、证据、启动和 iPhone 未测脚本见 [交付记录](docs/delivery/game-upgrade-2026-10-30.md)。
- 2026-10-30 后续清理：三个开发分支及其 D 盘 worktree 已合入 main 并移除，本地测试数据和证据保存在忽略目录 `outputs/worktree-cleanup-2026-10-30/game-scene-upgrade/`。两个 C 盘 Codex 受管 worktree 仍被当前或其他对话占用，暂不能通过归档工具移除。
- 已完成需求、交互、状态、数据、模块架构及实施计划文档。
- 已维护 v2 的 13 人、3 场地、7 轮 21 场模板；保留 v1 的 14 人／20 场用于历史与备份兼容。
- 已建立代码、数据、测试及资源目录；目录中的 README 是实现职责说明。
- 已实现 Vinext + React + TypeScript + Three.js／R3F 应用、真实本地 D1 权威存储及四个业务 Module。
- 三场地、新赛制七轮二十一场、角色排阵、录分、更正、同步、积分、导出和受控恢复已接通；旧二十场仍可读取恢复。
- TypeScript 检查和当前 220 项自动检查通过；已移除三个场边互动的 14 项专属测试，新增 v2 名单／积分／恢复／天使检查。真实 HTTP＋D1 二十场、双客户端、排阵恢复及本机演出的历史证据保留；最新追加六种视口的状态区／工具条避让与选人回归。
- 界面以连续三场地 3D 球馆为主，通过缩放和平移查看单场，直接点人物／拖入场内位置。确认上场、录分和更正均从场内记分牌进入；见 [连续球馆与记分牌验证](docs/delivery/ui-continuous-venue-2026-10-29.md)，前次记录保留在 [界面优化记录](docs/delivery/ui-game-first-2026-10-29.md)。
- 记分牌已缩为场边单行操作牌，桌面移到候场区后方，竖屏留在场间空隙；见 [场边记分牌优化](docs/delivery/ui-courtside-scoreboard-2026-10-29.md)。
- 单指旋转按固定枢轴直接跟手，双指缩放平移；回正、全景和球场近景使用统一过渡。人物资料卡居中，轮次／设置仍从底部弹出。最新 [旋转响应诊断与优化](docs/delivery/ui-orbit-response-2026-10-30.md) 记录了 iPhone 17 反馈及官方参考；前次记录见 [触控与人物弹窗优化](docs/delivery/ui-touch-orbit-2026-10-30.md)。
- 已提供同 Wi-Fi 的 iPhone 体验入口，普通设备默认只读，专用链接获得临时演练权限；启动、关闭与实机检查见 [iPhone Wi-Fi 指南](docs/delivery/iphone-wifi-preview.md)。
- P2 已做桌面窄屏原型验证；P6 可执行的本地检查已通过。用户授权真实 iPhone Safari、现场网络及长时间性能检查后置到 Site 发布后，仍记为未测。
- 已完成默认关闭的生产初始化窗口、本站身份核对页、独立正式／验收配置和匿名 HTTP 检查脚本；见 [P6–P7 发布准备](docs/delivery/p6-p7-release-preparation-2026-10-29.md)。
- ChatGPT Sites 最新版本 18 已成功部署为 public：[Sophia Sunshine Cup](https://sophia-sunshine-cup.gaussuag777.chatgpt.site)。右手握拍、外倾角度、完整两位数比分及管理员受控重置已生效；220 项检查、双客户端／恢复和生产验证通过，四个线上活动前后摘要一致。见 [本次交付](docs/delivery/right-hand-reset-scoreboard-2026-10-31.md)。真实 iPhone 观感与持续性能仍待用户体验。

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
- 原始数值只保存；队伍积分按普通胜场 1 分、含 Sophia 的场次胜方 2 分累计，不设总积分并列的冠军判定。

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


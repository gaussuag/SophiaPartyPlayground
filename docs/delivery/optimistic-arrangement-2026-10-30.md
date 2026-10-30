# 排阵即时动画与后台保存交付

2026-10-30；基线 `fc8930ce70523d01b9a8dcf317f81bd88abac8c8`。本次用户要求研究、实现、验证后更新同一公开 Site；正式活动、名单、赛制与管理权限保持原契约。

## 研究和实现

依据 [官方资料研究](../development/optimistic-arrangement-research-2026-10-30.md)，选择只作用于 UI 的乐观排阵投影，没有引入 Query／Firebase 依赖或改变权威存储。`session.state` 仍是服务端快照；`arrangement` 只提供提交者本机的人物展示目标。上场、下场、换场、替换和取消准备阵容均可即时表现；开赛、录分、历史更正和轮次不预测。

- dispatch 在第一个 await 前生成合法展示目标并加写锁；原 commandId 在 IndexedDB 保留后才发送。持久化失败不发请求，人物纠正回权威位置。
- Scene 仅给 Avatar 使用 arrangementView；记分牌、管理确认、资格与历史仍使用确认投影。替换同时预测进出两人，跨场移动是一个原子命令；其他设备只消费共享权威更新。
- 成功响应目标相同，不重新行走；拒绝或冲突从当前可见位置走向最新权威位置，不还原整份旧快照。无关远端更新不会被预测遮掉，相关占位、开赛、换轮或恢复可使预测失效。
- 超时不等于失败：保留待确认表现与原编号，查回执且读取至少 appliedRevision 后才收敛，避免回执领先读取时误回档。没有回执且版本未变时，可显式原编号重试；不自动重放。
- 姓名待保存描边和顶部同步图标立即反馈；正常排阵不出现阻挡感的“正在保存，请稍候”，超过 1.2 秒才显示“正在同步安排”。已确认替换后先关闭确认卡，让人物立即行动；错误和未知结果继续可见。

## 本地证据

Windows、Node 22.21.1；本次开发服务 `http://127.0.0.1:5190`，隔离活动 `local-optimistic-20261030-1155`。本机数据库、导出、运行日志与凭据均不提交。

| 验证 | 结果 |
| --- | --- |
| 自动检查 | 16 个文件、143 项通过；最后的 session／人物相关回归为 3 个文件、24 项通过 |
| TypeScript | 通过 |
| ESLint | 0 错误，records 中 3 条既有 unused-vars 警告 |
| HTTP＋真实 D1 | verify-local 完整七轮二十场、匿名协作、管理隔离、并发、幂等、导出与恢复通过；独立活动 local-http-646969ef-6d5d-4bbf-8c62-b53ad587bce5 |
| 确认与预测隔离 | 提交时同步开始走动，IDB／正式 revision 不变；观察者等服务端成功后再行动；管理与比分不预测 |
| 错误与恢复 | 明确拒绝／占位冲突平滑纠正，丢失成功响应查回执不重发，未送达显式原编号重试，回执领先读取不误回档，存储失败不发送，刷新重建和 generation 恢复通过 |
| 真实页面故障轨迹 | 390×844 iframe 中四项通过：延迟成功、拒绝后回位、成功响应丢失、请求未送达；真实 React 输入和人物锚点／revision 读数，原始 JSON 与截图在 outputs/optimistic-motion/ |

浏览器 harness 仅在 loopback 的 local- 活动内包装 iframe 自己的 fetch；没有产品故障开关或生产接口。脚本第一次使用了选择后已变化的席位名称、随后发现 session 在连接时固定 fetch 引用而没有命中故障注入，均修正后在新的独立活动完整重跑。未把这些初次失败当成通过。

## 生产构建与发布

官方 Sites helper 已完成类型检查、生产构建、源码提交、推送和打包；本地生产预览验证后保存版本并部署原 Site。Site 名称 Sophia Sunshine Cup，标识 sophia-sunshine-cup；访问配置继续 public，D1 与生产身份不改，未运行线上初始化或恢复。

- 源码 commit：`30d403261eccd67738bc26640ed851869f9f5fb3`（Update Site source）。
- Sites 版本：7；version ID `appgprj_6ae3626384448191b8fb8eecc7af7ced~appgver_e8810e7cc5688191a5741de83b3aa1f1`。
- deployment ID：`appgdep_6ae415e934b08191a8b5d18d9ace10d9`；native 返回 succeeded，2026-10-30 11:58:56 +08:00；runtime config revision=3，访问 policy revision=2、access_mode=public。
- 公开 URL：[Sophia Sunshine Cup](https://sophia-sunshine-cup.gaussuag777.chatgpt.site)。
- 本地压缩归档 SHA-256 `76f2f111ffd08036e7033d5990eaccf5863b7b51972e54ebb1f417435efec99e`；native 保存的解包归档摘要 `sha256:7154f973be4e9fb05a338e67f10b814a295e41e4088ff10cbe3dfde252e6a467`。

本地生产预览 `http://127.0.0.1:8790` 的 verify-production 通过：页面／读取 200，guest 角色，伪造开发身份管理写入 401，开发及受控初始化 404；拒绝 403／400／413 请求体后 SSR 继续 200；产物不含开发身份字面量或客户端服务端配置，客户端 JS＋CSS gzip 合计 429,794 bytes。构建仍有 Three.js 相关大 chunk 提示，未因此减少模型或更改画质。

发布前匿名公开读取：正式活动 revision=28、generation=0、0 条赛果，状态 SHA-256 `bd8da5556c5af01789ce0505baeaa6fba576b014da41e0770ba5e556c9700cd7`；它已由用户实际操作，不重置为之前 revision=15。验收活动 revision=16、3 条赛果版本，摘要 `6ffef95a853c5ef7f5b32980ef5e15a977c5ca58938785a3e09fa3bbdbc33544`。发布后重新读取比对；正向线上操作仅使用隔离验收活动，不改正式成绩。

## 发布后验证

- 正式活动在部署后及所有验收操作后仍为 revision=28、generation=0、0 条赛果，完整摘要与上述发布前值相同。
- verify-public 无管理 Cookie、登录或 bypass token：主页／活动页／公开读取 200，无登录跳转；身份 guest，伪造平台身份被忽略；匿名管理操作与备份 401，公开 CSV 200，初始化窗口关闭。
- 线上 Chromium 390×844：仅在验收活动安排 W04 到 2 号场 WHITE-2，人物走动且正常保存时无 toast；第二客户端读到 revision=17 和相同占位。随后移出刚加入的 W04，在正式 revision 仍为 17 时已观察到 walking=true、无 toast，保存后为 18。原 W03 占位、确认阵容和三条赛果版本保留。截图 `outputs/optimistic-motion/site-v7-mobile.png`。
- 无 Cookie／令牌的独立 HTTP 客户端在同一隔离活动再次上场／移出 W04 均 200，原编号重发 replayed=true，回执可核对；验收活动 revision 18 → 20，原 draftSlots、lineups、results、rounds、activeRoundId、generation 均与操作前一致。原始报告在 `outputs/optimistic-motion/online-post-release.json`。只增加正常审计和版本，不撤销或覆盖其他人的记录。
- 本次没有重新执行线上开赛／录分／轮次推进，以免无关改动验收历史；服务端规则与 runtime 配置未变，沿用版本 6 的正向管理与比赛证据，本地七轮二十场已回归。
- 当前桌面窗口清单没有 Edge／InPrivate 等独立浏览器窗口；独立未登录浏览器的实际内容检查本次仍未完成。上面的 HTTP 匿名检查与已登录 IAB 页面检查分别记录，不将它们合称独立匿名浏览器通过。

## 仍需实机体验

用户 iPhone 17／Safari 新版的上场、下场、跨场与替换跟手感，保存失败提示、后台／锁屏恢复、弱网及长时间表现仍未实机验收。桌面 Chromium、模拟 Pointer Events 与窄屏截图不能替代实际触屏。发布后建议先在隔离验收活动体验：点球友到合法空位，观察人物是否立即走动；再移出或换场，确认没有等待提示挡住行动。真实弱网可关注待保存描边，联网后是否自然确认或纠正。

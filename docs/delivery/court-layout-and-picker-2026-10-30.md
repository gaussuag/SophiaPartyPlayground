# 横向球馆、头像选人与人物点击交付

2026-10-30。基线 `3d00ab6737ee8e79ea3b076f9daf1b5ed05936ed`，用户要求研究、实现、本地验证后更新现有 Site；保留正式活动、赛制与公开协作／管理权限。

## 研究与设计

[官方资料研究](../development/court-layout-and-picker-research-2026-10-30.md) 核对 Apple 游戏触控、WCAG、Three.js 正交相机及 R3F demand rendering。触控目标采用至少 44 CSS px 的项目标准，不混称 Apple 的 pt；人物头像使用共享外观的 SVG，场景仍只有一个 WebGL Canvas。

- 手机和桌面固定横向并排三块场地，候场区在前后两侧。世界坐标不因选择球场而变化；保留旋转、缩放、平移和连续世界近景。牌子放在候场区后方专用条带，手机使用紧凑牌面。
- 修复保存期间“不能排阵”落到自动查看资料的分支；模型和姓名均不再自动打开资料。实际行走中的人物也从拖拽和选中路径排除；不可操作时仍可从人物上划动镜头。明确的资料按钮继续保留。
- 点空席位打开底部非模态头像＋姓名面板，场景仍可探索，不强制跳镜头。候选由 app/placements 的公开 placementCandidates 调用同一 competition.decide 得出，包含准备中能合法移来的选手；队伍、性别、占用与整轮可行性没有第二套实现。
- 选头像和点场景人物走同一 place／dispatch；选中后即时收起面板，继续上一版的本机先行动、后台保存及失败收敛。旧选位绑定 revision／generation；共享版本变化时失效并提示重新选择，不自动改派。
- 合法候选人有姓名描边、脚下光圈及 2.6 秒举手／光圈缩放，之后仅静态提示。关闭、选择、后台或减少动态效果取消动作。AvatarAttention 不持有业务事实，不逐帧 setState，沿用 useFrame／invalidate；重复渲染不延长动画。

## 本地验证

Windows，Node 22.21.1；开发服务 http://127.0.0.1:5190。本地数据库、导出和截图在忽略目录，不提交。

| 检查 | 结果 |
| --- | --- |
| 自动检查 | 17 文件、152 项通过；涵盖横向坐标、牌子避让、路线避网、候选资格、锁定、跨场、整轮可行性、旧版本／恢复、有限动画和既有同步存储规则 |
| TypeScript | 通过 |
| ESLint | 0 错误；records 中 3 条既有 unused-vars 警告 |
| 真实 HTTP＋D1 | verify-local 七轮二十场、匿名协作、并发、幂等、更正、导出与恢复通过；独立 local-http-839bbd0e-a88d-4411-911f-162203d0e113 |
| Chromium 390×844 | 真实页面点空席位显示 Kyle／Leo／鐵毛／高斯四个合法头像及姓名，按钮 78.25×89 CSS px；四个场景候选 inviting=true。点头像后面板关闭、walking=true，再点移动姓名无 dialog、无重新选择，revision=2 |

最初回归发现窄屏玩具触区仅相隔 46.56px，已增加间距并保持 ≥48px 检查；新增候选测试曾误以为第六轮自由双打里已安排的女性不可换席位，核对真实 MovePlayer 规则后纠正测试期望，未收紧业务规则。

浏览器五项 harness 均通过：延迟成功、明确拒绝、成功响应丢失、未送达原编号重试，以及头像候选／场景高亮一致、触摸走动姓名不弹详情、Escape、另一客户端更新后旧选位失效。最终小屏回归另验证 elementFromPoint 命中空席位本身；harness 保留正式 revision，最终独立复验从 8 到 12，只做自己的上场／下场与外部模拟修改／清理。报告在 `outputs/court-picker/browser-fault-and-picker.json` 与 `browser-picker-final.json`。

320×568 的真实浏览器点击曾被白队候场姓名热区截获，已把近侧姓名放在脚下、短屏全景上移 40px；扩大前方留白并后移玩具，避免与姓名挤在同一行。回候场入口仅在适用时显示并提高层级，去掉常驻次级队伍标签。原生浏览器点击及最终 harness 命中检查均通过。几何、行走、候选与轮次相关 10 个文件／101 项回归、类型检查再次通过。

844×390 横屏初版面板遮住球场中心，已改为右下角非模态面板；实际面板 256×161、三张候选卡约 72.66×89 CSS px。320×568、390×844 均可直接选人，宽屏不锁横屏，场景仍包含 3 场地／14 人。窄屏、横屏截图在 `outputs/court-picker/local-320-picker.png`、`local-844-picker.png`。验证用 local-picker-20261030-1236 及 local-picker-harness-20261030-1242，不重置现有活动。

## 构建与正式发布回执

官方 Sites helper 完成最终 ESLint、TypeScript、生产构建、源码提交／推送和归档。本地生产 `http://127.0.0.1:8790` 的 verify-production 通过：guest 读取与页面 200；伪造开发身份管理写入 401；开发及受控初始化 404；拒绝 403／400／413 请求体后 SSR 仍 200；无开发身份字面量或服务端配置泄漏，客户端 JS＋CSS gzip 合计 431,496 bytes。

- 源码 commit：`3735755f057b21d19cae72ac8d3adeeb1eb24fbc`（Update Site source）。
- Sites 版本：8；version ID `appgprj_6ae3626384448191b8fb8eecc7af7ced~appgver_a0559d7f440881918c0ca1dfe8d729e0`。
- deployment ID：`appgdep_6ae42329ef388191af836c7e5b3b9838`；native 返回 succeeded，2026-10-30 12:55:28 +08:00。
- 地址：[Sophia Sunshine Cup](https://sophia-sunshine-cup.gaussuag777.chatgpt.site)。实际 get_site 返回 latest_version_number=8、access_mode=public、policy revision=2；runtime config revision=3。
- 本地压缩归档 SHA-256 `26c8783399fcffc83e8113b39ac0316abe6b46c2d000c03be91164005c97303f`；native 保存归档摘要 `sha256:ea5c5405ea6e032f3f9623d96684e1e9199197b6c2556a3ea5aab780965768d8`。

## 发布准备与实机边界

沿用 Sophia Sunshine Cup / sophia-sunshine-cup、原 Site 和 public 访问配置，D1、生产身份和初始化窗口不变。发布前匿名读取正式活动为 revision=54、generation=0、3 条赛果版本，SHA-256 `d812a6119a8f7fd271b3dc06c95b2b4edc6f18e1641827e7b33f5c34f750ed17`；这是用户后续实际操作，绝不恢复成先前的 revision=28。隔离验收活动为 revision=20、3 条赛果版本，摘要 `7b6ad915fb9685dfbe707023656c5d15a95d47197101544dc8a6a9b7b9bc9a72`。发布后再对比正式活动；线上正向交互只在隔离验收活动。

新版 Safari 实机点击、横向世界的取景习惯、触摸滚动／VoiceOver、减少动态效果、弱网和持续运行仍待用户发布后体验。桌面 Pointer Events／视口检查不冒充实际 iPhone 通过；独立未登录浏览器内容复测另行记录。

## 发布后验证与剩余项

- 正式活动在部署后及线上交互后仍是 revision=54、generation=0、3 条赛果版本；完整 SHA-256 与上述发布前摘要相同，未发出任何正式活动修改请求。
- verify-public 不带 Cookie／登录／bypass token：主页、活动页、读取、CSV 均 200，无登录跳转；身份 guest，伪造平台身份被忽略，管理操作和备份 401，初始化窗口关闭。
- 线上 Chromium 390×844：2 号场 WHITE-2 面板显示两个合法候选 Lavonne／大海；点 Lavonne 后在正式 revision 仍为 20 时即 walking=true、面板关闭。再次激活行走姓名无 dialog／无重新选中；随后激活已完成比赛的尼克也没有资料弹窗。第二客户端同步到 21 和同一阵容。移出刚加入的 Lavonne 后为 22，原 matches、lineups、results、rounds、players、activeRoundId、generation 与测试前完全相同，只增加 AssignPlayer／RemovePlayer 审计；核对报告在 `outputs/court-picker/online-record-integrity.json`。
- 线上截图 `outputs/court-picker/site-v8-mobile-picker.png` 来自隔离验收活动。全部操作未改正式成绩，未重跑线上开赛／录分／轮次推进；服务端与身份配置未改变，沿用既有管理闭环证据，本地二十场已回归。
- 独立 Edge 浏览器复测未完成：已发现 Edge 窗口，但电脑控制无法可靠识别该窗口的当前网址，触发安全检查并结束本轮电脑操作。没有继续操作该窗口、登录或注入令牌；匿名 HTTP 与已登录 IAB 的界面证据分别记录，不能合称独立匿名浏览器通过。中止后仅做仓库交付记录、只读数据比对及本次本地服务清理。
- 因电脑控制已中止，未能继续手动重置最后一次 390×844 预览覆盖或关闭临时 IAB 标签；没有用其他技术绕过。真实 Safari／VoiceOver／系统减少动态效果及弱网表现仍由用户体验验收。

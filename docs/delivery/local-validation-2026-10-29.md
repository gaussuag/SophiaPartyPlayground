# 本地实现与验收记录

日期：2026-10-29（Asia/Shanghai）。工作区：`D:\git_repository\freedom_world\SophiaPartyPlayground`。本次未提交 Git commit，现有文档和原始模板均保留。

后续的全屏球馆、直接人物交互、追加测试与最新构建证据见[界面优化记录](ui-game-first-2026-10-29.md)。下文保留首次实现时的验证范围与数据。

## 阶段状态

| 阶段 | 实际完成情况 |
| --- | --- |
| P1 | Vinext starter、TypeScript、React、Three.js／R3F、本地 D1、迁移与测试入口可运行 |
| P2 | Chromium 桌面和 390×844／320×568 视口原型已验证；实际 iPhone 触控和键盘未测 |
| P3 | 纯业务、服务端授权、D1 条件提交、版本冲突、幂等、撤销、更正与全轮可行性已实现并测试 |
| P4 | 浏览器跑通一场混双；两个隔离客户端同步阵容、比分和更正 |
| P5 | 真实 HTTP＋D1 跑通七轮二十场、72 人次、手动推进、结束、导出和同身份恢复；生产预览查看全部历史 |
| P6 | 本地自动检查、生产构建、浏览器与权限检查已执行；实机、现场网络和持续性能仍未验收 |
| P7 | 未执行；没有创建、注册、同步来源或部署 Site；hosting manifest 没有 project_id |

这些结果不等于已经可以发布。P6 的实机必需项仍是发布前条件。

## 实现入口

- [competition](../../src/modules/competition/index.ts)：decide／project、显式初始化及恢复不变量校验。人数、性别、队伍、占位、同轮资格、剩余可行性和全部状态转换在此集中处理。
- `src/modules/records/index.ts`：真实 D1、first-primary 读取、活动 revision 条件 UPDATE、先回执后版本判断、可信账号授权、JSON 备份与恢复。业务、审计、回执在同一次写入内。
- `src/modules/session/index.ts`：前台两秒轮询、ETag、乱序丢弃、发送前保存编号、未知结果查回执、冲突不重放、IndexedDB 草稿和最后同步时间。
- `src/modules/venue/index.tsx`：程序几何球馆、三场地、十四个角色、固定镜头、拾取、短移动动画、按需渲染、DOM 姓名牌投影和场景重建。记分牌传递稳定 matchId，人物位置不决定比赛事实。
- `app/`：页面、席位、确认、记分浮层、历史、管理员恢复及 HTTP 路由。只有双方比分需要在核心流程中键入；更正原因用预设选项。

## 可重复运行的检查

环境：Windows；Node.js 22.21.1，npm 10.9.4。React 19.2.6、Three.js 0.186.1、R3F 9.8.2、Vinext 1.0.0-beta.5、Vite 8.0.13、Wrangler 4.92.0，精确组合由 package-lock.json 固定。

| 检查 | 运行命令 | 结果与范围 |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | 通过 |
| 纯业务 | `npm run test:business` | 17 项通过 |
| 真实本地 D1 | `npm run test:storage` | 8 项通过；使用 Miniflare D1，不以存储 mock 代替原子性证据 |
| 客户端协议 | `npm run test:session` | 8 项通过；受控传输故障与 fake-indexeddb 验证客户端行为 |
| 全部自动检查 | `npm test` | 33 项通过 |
| Sites 构建 | 安装的 Sites `scripts/build-site.mjs`；独立运行可用 `npm run build` | 成功产生 dist/client 和 Worker |
| 本地迁移 | `npm run db:migrate` | 首次成功建表；重复执行显示无待应用迁移，演练记录未被清空 |
| 全 HTTP 演练 | 开发服务运行时 `npm run verify:local` | 独立 local-http-* 活动完成二十场和七轮，每轮两个推进请求仅一个成功，导出和恢复通过 |
| 生产预览 | `npm start -- --port 8787` 后 `npm run verify:production` | 页面与共享读取 200；viewer；伪造开发身份写入 401；开发初始化 404；拒绝 403／400／413 后 SSR 仍正常 |

D01–D03、B01–B13 已在业务、存储或浏览器所列范围验证。特别包括第六轮自由双打不能耗尽其他比赛所需女性、0 分合法、空白不转成 0、同分拒绝、11:10 等比分无需净胜门槛、结束后同轮仍不能二次参赛、第七轮只需 2/2。

S02–S07、S10–S14、S16 在相应 Module Interface 或 HTTP 检查中覆盖。存储故障用真实 SQLite trigger 中止 UPDATE，确认状态、审计和回执均未部分保存。同 commandId 同请求重发不重复执行；不同请求体或账号不能复用编号。两个共享 IndexedDB 的 session 保留独立命令编号，竞争结果仍由服务端决定。

S08–S09 包含草稿和重连的自动检查，以及浏览器中的版本变化验证；真实手机弱网、飞行模式、锁屏与后台过程尚未测试。桌面检查不能代替它们。

## 浏览器证据

浏览器：Codex in-app Chromium，Windows；WebGL 2.0。没有真实 iPhone／Safari 会话，也没有把桌面 WebKit 当作实机证据。

隔离客户端分别访问 `127.0.0.1:5173` 与 `localhost:5173`，拥有不同 origin 的 Cookie 和 IndexedDB，连接相同本地服务与 D1。先验证第二端为 viewer，随后验证两个本地编辑会话。该方式证明两个隔离客户端行为；不是两个真实手机的现场验证。

已执行的操作：

1. 显式初始化独立 `local-browser`，开放第一轮；通过席位与虚拟角色选择尼克、Vvn、Kyle、Sophia，核对完整名单后上场。
2. 从 3D 记分牌声明结束，11:11 提示有胜负比分；11:0 草稿关闭、刷新、重新打开仍存在，阶段保持待录分。
3. 提交 11:0，第二端无需手动刷新，在约 2120 ms 后显示同一有效结果。该数值包含点击与工具观察开销，只代表本机环回网络这一轮观测。
4. 更正为 9:11，再通过角色更正实际名单中的 Vvn 为大海；另一端看到新阵容及引用新阵容的有效赛果，旧版本保留。
5. A 编辑 8:11 时，B 提交 2:11。A 保留输入，显示当前有效比分并禁用提交；明确“已核对当前记录，沿用输入”后才重新允许提交。
6. 场景／赛程／赛果切换、刷新和重新建场景保持数据库事实。开发中曾复现姓名牌独立 React root 的卸载错误；改为页面统一管理 DOM 投影后，同一卸载回归通过。
7. 在生产构建中读取恢复的完整活动：20 张赛果记录；第七轮显示 2/2，3 号场仅休息／观赛；第 1 轮历史保留 11:0 和更正后的 9:11，未回退活动状态。该生产页面控制台没有 error。

390×844 视口下，Windows 内容区宽 375 CSS px，姓名牌 72×69，无横向溢出。320×568 视口下内容区宽 305，数字输入字体 52 px、inputmode=numeric；确认按钮高 49 px，底部位于 y=556，小于视口 568。最初观察到的窄屏按钮裁切已经修复并复测。

观察到的绘制预算：角色展示区 38 draw calls／5104 三角形，三场总览 93 draw calls／10708 三角形。DPR 1–1.5，按需渲染，没有持续全员循环动作。客户端 JS＋CSS 合计约 397 KiB gzip；3D 片段按需加载。构建仍提示 3D 片段大于 500 kB 原始压缩前体积，未据此声称手机首屏或 30 FPS 已通过。

## 权限、恢复与运行注意

默认参与者只读，operator 可排阵／录分／更正，admin 另可备份／恢复。生产仅在 `IDENTITY_SOURCE=sites-dispatch` 且受信任平台注入身份时按 `OPERATOR_IDS`／`ADMIN_IDS` 的稳定账号 ID 授权；没有默认生产管理账号。浏览器 body 中的 role／actorId 会被拒绝。

开发身份只存在于 starter 的环回开发流程。生产构建扫描未发现开发用户 ID、模拟 Cookie 或将 records／D1 配置带入客户端。`EVENT_ID` 选择正式活动；生产账号、访问方式与正式初始化留到 P7 配置，不能直接发布本地演练记录。

恢复仅管理员可执行，UI 要求维护窗口确认；校验原 eventId、模板身份、引用、区间和不变量，CAS 阻止维护期间的竞争写入。revision 和 generation 递增；原回执退休为 SUPERSEDED_BY_RESTORE，旧会话不能自动重放。服务端保留最近一次恢复前记录，JSON 可单独下载；不递归积累完整快照。

生产预览曾发现“读取活动 → 提前拒绝带请求体的 POST → SSR 页面”挂起：单纯换成 JSON 响应或 cancel 不足以修复。在拒绝前有界读尽请求体后，原序列及跨站／格式／大小拒绝序列均通过。`verify:production` 保留这个真实 HTTP 回归；拒绝状态和写权限没有放宽。

Windows 上须先停止生产预览再重建 dist，停止开发预览再重装依赖。受限环境中 Wrangler 默认配置目录写入受阻时，临时将 XDG_CONFIG_HOME 设到工作区 `.sites-runtime/xdg-config`，没有修改系统设置。

生成证据位于被忽略的 outputs/：`full-event-d1.json`、`http-checks.json`、`http-event-backup.json`、`http-results.csv`、`production-checks.json`、`browser-full-event.json`、`phone-role-picker.png`、`phone-score.png`、`phone-score-narrow.png`、`production-history.png` 及预览／构建日志。演练导出和本地数据库不应加入源码。

## 仍需协助的验收

- 提供真实 iPhone 的型号、iOS／Safari 版本，并建立受控本地 HTTPS／端口转发访问；保留环回绑定，不能把开发管理入口直接暴露到现场网络。
- 真手指检查十四个角色的辨识、连点、滑动取消、热区重叠、较长姓名，以及数字键盘和地址栏伸缩／safe area。
- 现场执行刷新、切后台、锁屏、断网／恢复、双设备并发，以及 WebGL 上下文丢失／恢复；核对草稿和已保存事实。
- 在真实手机完整演练二十场，并做接近活动时长的持续运行，记录 FPS、发热、电量和页面重载。30 秒排阵、10 秒录分、误点率、30 FPS 及现场约 3 秒同步均仍是待实测目标。
- 发布前落实真实操作员／管理员账号、活动配置和参与者访问方式。上述必需项验收后才进入 P7；当前不创建或部署 Site。

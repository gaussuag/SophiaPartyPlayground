# Sophia Sunshine Cup：P6 与正式发布准备

2026-10-29，Asia/Shanghai。本轮基线 `1a20e5f`，接手时工作区与暂存区均干净。继续保留 Vinext、React、TypeScript、R3F、Workers、D1，以及连续三场地、人物操作、缩放平移和场边记分牌。

## 已确认的发布契约

| 项目 | 要求 |
| --- | --- |
| 渠道 | 用户 ChatGPT 账号中的 Sites「站点」，使用当前插件官方来源／版本／部署流程，可在站点管理维护 |
| 名称与标识 | Sophia Sunshine Cup；首选 sophia-sunshine-cup；不预造完整 URL |
| 访问 | 必须 public，匿名直接读，无 OpenAI 登录、工作区或邀请要求 |
| 写入 | 官方登录＋服务端稳定身份 ID 名单；登录不自动取得写权限；备份／恢复／初始化仅管理员 |
| 数据 | 默认正式 `sophia-sunshine-cup`，隔离 `sophia-sunshine-cup-acceptance`；与本机 local-* 分开，不导入演练记录 |
| 发布闸门 | P6 必需项通过后已经获准执行 P7；未通过时不创建或发布 Site |

2026-10-29 19:04 的原生 `list_sites` 返回四个已有站点，无本项目匹配项，cursor 为空；其中已有 public 站点。这只说明账号列表现状，不替代本项目之后的 public 配置与匿名验证。`.openai/hosting.json` 仍只有 d1=DB、r2=null，没有 project_id；本轮未注册、保存线上版本或部署。

## 本轮实现

- 统一页面标题和品牌为 Sophia Sunshine Cup，描述说明由 Sophia 组织。原始模板的名单、赛程、rawValue 与全部比赛规则保留。
- `/setup` 和 `/api/setup` 返回当前请求自己的可信身份与业务权限，用于核对本站稳定 ID。匿名可访问但不被授予权限；不返回服务器授权名单。继续使用 Sites 的登录／退出保留路由。
- 新增默认关闭的生产初始化窗口。开启后，仅管理员可为服务端配置的两个不同编号补建活动；请求不能携带角色、操作者或整份演练快照。初始化返回 created，D1 的主键 INSERT DO NOTHING 保证并发只创建一次，重复执行不覆盖任何已有名称、阵容、比分、回执或版本。
- 开发模拟身份保留在 DEV 环回分支，`/api/local/initialize` 生产仍 404。生产窗口另由运行时配置控制；不是将开发入口带到公网。
- 新增 `verify:public`：只接受实际 HTTPS origin、不同正式／验收编号，无管理 Cookie、真实身份或 bypass token；检查匿名直接读、伪造身份负例、拒绝写入／备份、CSV 与正式初始数据。尚未对公网执行，不能当作已经匿名验收。

## 本地证据与缺项

| 项目 | 状态与证据 |
| --- | --- |
| TypeScript、相关 ESLint | 通过；records 原有三条未使用解构变量警告仍存在，不影响退出码 |
| 自动检查 | 57 项通过；新增窗口、配置、真实 D1 授权、并发、不覆盖与验收隔离检查 |
| HTTP＋D1 全活动 | 通过：七轮二十场、72 人次、并发／幂等、历史更正、CSV、JSON 与恢复；独立 `local-http-69f1db4d-e02f-49d7-9c56-6ed226e551ea`，恢复后 revision=145 |
| 迁移 | 原 0000 迁移仅建表结构；未修改 schema 或已应用历史；本地执行显示 No migrations to apply |
| 生产构建 | 成功；客户端 JS＋CSS 合计 gzip 417656 字节，含按路由加载的管理页；不等于手机首屏下载或帧率 |
| 本地生产权限 | 8791 预览：页面／读取 200，viewer；伪造身份写入 401；开发初始化与关闭的生产窗口 404；自报身份不被采信；403／400／413 拒绝后 SSR 正常；产物无开发身份字面量或客户端服务端实现 |
| 浏览器管理页与品牌 | 本地生产构建的匿名身份页没有初始化按钮；320×568 下新品牌与三场地无水平溢出。身份页的登录／返回链接保留活动编号，避免验收过程中回到另一活动 |
| iPhone Safari | 尚未收到本轮真实型号、iOS、触控／双指／拖拽、数字键盘、刷新／后台／锁屏、弱网恢复、多设备、完整二十场与持续观察结果，不标记通过 |
| Sites public／线上权限 | P6 未完成，没有创建站点，因此尚未执行 native public 配置、独立匿名浏览器和真实管理账号验证 |

输出位于忽略目录：`outputs/p6-release-http.log`、`p6-release-build.log`、`p6-release-production-checks.json`；演练导出、本地数据库和凭据不进入源码。

生产浏览器实测发现身份页的客户端 Link 导航／prefetch 报错，返回链接未执行。局部改为完整页面导航后回归通过，活动编号保留，刷新后的控制台没有新错误；没有升级依赖或修改主场景。截图在 `outputs/p6-release/brand-320.png` 和 `setup-anonymous-320.png`。

手机使用现有受限 Wi-Fi 入口，具体步骤见 [手机指南](iphone-wifi-preview.md)。当前配对链接只在聊天／终端提供，不写入仓库。先记录型号、iOS、网络以及逐项通过／失败／未测，再补完整活动和接近活动时长的持续观察；桌面模拟或自动演练不能填为实机通过。

## 生产运行配置

| 键 | 设置方式 |
| --- | --- |
| IDENTITY_SOURCE | 真实 Sites 部署设为 sites-dispatch；本地生产预览不模拟平台身份 |
| EVENT_ID | 正式活动编号，默认 sophia-sunshine-cup |
| ACCEPTANCE_EVENT_ID | 独立验收编号，默认 sophia-sunshine-cup-acceptance，不能与正式相同或使用 local-* |
| ADMIN_IDS | 核对通过的本站管理员稳定身份 ID，逗号分隔；无默认管理员 |
| OPERATOR_IDS | 核对通过的本站操作员稳定身份 ID，逗号分隔；管理员也具备操作权限 |
| INITIALIZATION_ENABLED | 默认 false；仅受控补建期间短暂为 true，完成后改回 false 并部署应用配置 |

真实名单尚待用户确认。Site-specific ID 由正式站点的 `/setup` 官方登录结果取得；不能复制 Sites 列表里的 account_user_id、本机开发 ID、邮箱或 playerId 作为授权 ID。实值通过原生运行配置工具保存，不提交到源码、示例文件、文档或 hosting manifest。

## P7 可执行顺序

1. 先补齐 P6 必需证据，更新本记录；有失败则修复回归，未测不自动算通过。
2. 重读当前 Sites skill；复查本项目是否已有真实 Site。存在则 get_site 复用，否则只 create_site 一次，并立即用 set-project-id helper 持久化真实 ID。
3. 经支持工具设置正式名称与首选标识。明确 update_site_access 为 public 并核对返回配置；若有限制，记录实际返回，不改用登录或邀请模式。
4. 使用官方 source credential／site-workflow helper，从已核对的源码构建并打包。凭据仅在内存和隐藏 stdin 中传递。保留 helper 返回的 project_id、commit_sha、archive 原样传入 save_site_version，再 deploy_site_version；不使用私有部署接口或独立 wrangler deploy。
5. Sites 声明 DB 绑定并在部署流程应用 schema-only 迁移。首次可先保持所有写名单为空、初始化窗口关闭；通过官方登录的 `/setup` 核对已批准账号的本站 ID 后，配置管理员／操作员及短时初始化窗口，再部署以应用运行配置。
6. 授权管理员在 `/setup` 勾选确认，补建正式及隔离活动。核对正式活动 PREPARED、revision 0、14 人／3 场／7 轮／20 场、所有阵容及赛果为空；重复核对不重置。关闭窗口并再次应用配置。
7. 两个实际授权会话只在验收活动做排阵、开赛、录分、更正、历史、同步和导出。验证登录未授权仍只读，管理员备份／恢复权限与操作员分开。正式数据保持初始状态。
8. 使用独立未登录 OpenAI／ChatGPT 的浏览器会话访问工具返回的根 URL，不能带管理 Cookie 或 bypass token；记录无登录跳转、完整场景、赛程／阵容／比分／历史、刷新与读取结果。另跑 `npm run verify:public -- <实际HTTPS origin> <验收ID> <正式ID>` 补充匿名 HTTP 与正式初始状态检查，不能替代浏览器。
9. 等待原生部署结果成功，记录真实 URL、名称、版本号、source commit、部署 ID、public 回执及浏览器／权限证据。若任何必需项失败，保持记录并修复，不报告发布完成。

截至本记录，P6 仍进行中，P7 未执行；没有可交付的正式公开 URL 或线上版本号。

# Sophia Sunshine Cup：Sites 发布进度

2026-10-29，Asia/Shanghai。用户明确授权把真实 iPhone Safari 验证后置到 Site 发布后，并确认仅 gaussuag777@gmail.com 兼任管理员与操作员。实机项目仍为未测；此授权解除发布前阻塞，不等于实机通过。

## 已部署的真实 Site

| 项目 | 工具实际返回 |
| --- | --- |
| 名称 | Sophia Sunshine Cup |
| 标识 | sophia-sunshine-cup |
| URL | https://sophia-sunshine-cup.gaussuag777.chatgpt.site |
| project_id | appgprj_6ae3626384448191b8fb8eecc7af7ced |
| Sites 版本 | 1 |
| source commit | b60f8db489ecfe75595db75b028a3ef8be7e2e62 |
| version_id | appgprj_6ae3626384448191b8fb8eecc7af7ced~appgver_56a6cab4d4dc8191a754cc23aaf61a7b |
| 初次 deployment_id | appgdep_6ae362e91ee48191934432711ccaad8f |
| 当前 deployment_id | appgdep_6ae3661ea2588191903d2303d78e397f，运行配置 revision=3 |
| 部署结果 | succeeded |
| 原生访问配置 | public；update_site_access 成功，get_site 再次返回 public，策略 revision=2 |
| 托管存储 | DB 绑定存在，schema-only 迁移已建 events 表 |

使用当前 Sites skill 1.1.2 的官方流程：检查现有站点无匹配项目后只注册一次，立即以 set-project-id helper 保存真实 ID；site-workflow helper 构建、提交、同步源码与打包，再 save_site_version、deploy_site_version。没有通过独立 Workers 发布，没有上传本地数据库或演练成绩。后续维护必须复用 `.openai/hosting.json` 中的真实 ID。

## 运行配置和正式数据

IDENTITY_SOURCE=sites-dispatch，EVENT_ID=sophia-sunshine-cup，ACCEPTANCE_EVENT_ID=sophia-sunshine-cup-acceptance。官方登录页面核对了已批准邮箱及用户提供的本站稳定 ID；授权前显示只读，授权后的实际 `/api/setup` 响应为 admin。该 ID 只通过 Sites 原生工具配置到 ADMIN_IDS／OPERATOR_IDS，二者均标为 secret，不写入源码或文档。

配置 revision=2 的部署短暂开启初始化窗口。管理员在页面补建了正式活动和隔离验收活动；重复核对正式活动返回“已有活动，记录保持不变”，仍是 revision=0、0 条赛果。随后配置 revision=3 将 INITIALIZATION_ENABLED 改回 false，并重新部署同一已保存版本，工具返回 succeeded。之后的匿名 HTTP 检查确认窗口已关闭。

正式活动已可公开读取，保持 PREPARED、revision=0、14 人／3 场地／7 轮／20 场、所有阵容及赛果为空；没有上传本地演练记录。线上操作只发生在 `sophia-sunshine-cup-acceptance`，当前 revision=9，第一轮 1 号场已完成，其他场次保留待安排。

## 已验证与未完成

| 项目 | 状态与证据 |
| --- | --- |
| 官方来源、构建、保存版本和部署 | 通过；build 成功，原生部署结果 succeeded |
| 原生受众与名称 | 通过；public、准确名称与标识，完整 URL 来自工具 |
| 匿名 HTTP 根页面、管理页 | 200，无登录重定向；不携带 Cookie 或令牌 |
| 匿名自身身份 | authenticated=false、actorId=null、role=viewer、窗口关闭 |
| 伪造平台身份头 | 被忽略，响应仍为匿名 viewer |
| 匿名业务写入 | 401；在权限校验阶段拒绝 |
| 开发初始化／关闭的生产初始化 POST | 均 404 |
| 独立匿名浏览器 | 部分证据、尚未完整通过：用户确认在未登录且无令牌的 Edge InPrivate 打开根 URL；窗口列表确认为 Sophia Sunshine Cup - [InPrivate]。电脑控制工具仍因无法可靠确定当前 URL 而停止，未能读取场景、赛程、赛果与刷新；不把窗口标题、IAB 或 HTTP 当作替代通过 |
| 官方管理账号 | 通过：邮箱与本站 ID 在登录页一致，授权前只读，服务端配置后为 admin；排阵、开赛、录分、更正和 JSON 备份实际成功 |
| 受控幂等初始化 | 通过：管理员显式创建两活动，重复初始化保留正式 revision=0；窗口关闭后 POST 不开放 |
| 正式初始数据／隔离验收活动 | 通过：正式初始数据完整且无赛果；验收活动独立，后续匿名检查仍确认正式未改变 |
| 线上双客户端 | 通过：同一获授权账号的两个独立 IAB 页面客户端，无手动刷新收到排阵、开赛与更正；不声称两台物理设备已测 |
| 录分、更正、历史与恢复 | 通过：白队尼克／Vvn，黑队 Kyle／Sophia；11:7 草稿关闭并刷新后恢复，提交后第二客户端更正为 9:11；详情保留两个赛果版本及原阵容，当前轮仍为第一轮 |
| 导出 | 通过：管理员下载真实 JSON 备份，格式正确、revision=9、1 份阵容、2 个赛果版本、9 条审计；匿名 CSV 200，1 条有效赛果为 9:11 |
| verify:public 完整脚本 | 通过：2026-10-29 23:40 Asia/Shanghai；匿名根页及活动读取 200、无登录跳转、写入／备份 401、伪造身份忽略、窗口关闭、正式初始状态正确 |
| 真实 iPhone、现场网络、持续性能 | 按用户授权后置，仍未测 |

证据位于忽略目录：`outputs/public-preflight.json`、`public-http-checks.json`、`online-admin-export-check.json`、`online-public-result-check.json`、`online-results.csv`、`p7/online-result-history.png`、`p7/online-three-courts.png`。完整备份在忽略目录，不进入提交。原有本地检查见 [P6–P7 准备记录](p6-p7-release-preparation-2026-10-29.md)。

单次观察中，第二客户端看到开赛约 2372 ms、首次比分约 1114 ms、更正约 962 ms；这是本轮浏览器样本，不替代现场网络或持续性能验收。

首次浏览器加载曾因球馆动态模块下载失败进入页面错误提示。错误指向 `venue-CyLYyUsS.js`；同一公开 URL 返回 200、text/javascript、943716 字节，与本地文件一致。原页面刷新后恢复完整三场地，后续刷新及业务闭环正常，未复现为持续代码缺陷；不改依赖或加入未经验证的修复。此请求失败与恢复保留为观察项。

## 下一步

1. 在已打开的独立 Edge InPrivate 中人工补查三场地、赛程、验收活动 9:11 及两个历史版本、刷新数据，以及 `/api/setup` 确为匿名；不登录、不使用令牌。电脑控制无法完成读取时保留人工观察与未测项。
2. 使用正式 HTTPS 的隔离验收活动做真实 iPhone Safari 检查，记录设备、系统、网络、触控、数字键盘、后台／锁屏、弱网及持续观察；操作步骤见 [手机指南](iphone-wifi-preview.md)。正式活动不作演练。
3. 实际活动开始前再导出正式初始备份并固定版本。管理员恢复的真实 D1 检查已有本地证据，本轮线上没有执行恢复，也没有把本轮两个页面客户端当作两台物理设备。

当前是“版本 1 已公开部署、正式活动准备完成、权限与线上业务检查通过”，独立匿名浏览器内容检查仍待补齐，因此尚不宣告 P7 全部验收通过。真实 iPhone 项按用户授权后置，继续记录未测。

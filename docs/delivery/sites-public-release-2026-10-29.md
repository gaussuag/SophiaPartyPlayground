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
| deployment_id | appgdep_6ae362e91ee48191934432711ccaad8f |
| 部署结果 | succeeded |
| 原生访问配置 | public；update_site_access 成功，get_site 再次返回 public，策略 revision=2 |
| 托管存储 | DB 绑定存在，schema-only 迁移已建 events 表 |

使用当前 Sites skill 1.1.2 的官方流程：检查现有站点无匹配项目后只注册一次，立即以 set-project-id helper 保存真实 ID；site-workflow helper 构建、提交、同步源码与打包，再 save_site_version、deploy_site_version。没有通过独立 Workers 发布，没有上传本地数据库或演练成绩。后续维护必须复用 `.openai/hosting.json` 中的真实 ID。

## 运行配置和正式数据

IDENTITY_SOURCE=sites-dispatch，EVENT_ID=sophia-sunshine-cup，ACCEPTANCE_EVENT_ID=sophia-sunshine-cup-acceptance。ADMIN_IDS／OPERATOR_IDS 当前为空，INITIALIZATION_ENABLED=false。运行配置通过 Sites 原生工具设置，不写入源码。

正式与验收活动尚未创建，匿名读取正式活动返回 EVENT_NOT_FOUND；首页目前显示准备状态，不能视为活动已经可用。没有重置已有记录。仅邮箱已获批准，仍缺该账号官方登录后返回的本站稳定身份 ID，不能用其他账号标识代替。

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
| 独立匿名浏览器 | 未完成；Windows 电脑控制工具因无法可靠确定当前浏览器 URL 而停止；未把 IAB 或 HTTP 当作替代通过 |
| 官方管理账号 | 等待用户在官方登录页完成登录；尚未配置授权，不能声称管理操作通过 |
| 受控幂等初始化 | 本地真实 D1 已通过；线上等待本站身份核对后执行 |
| 正式初始数据／隔离验收活动 | 尚未初始化，待后续核对与业务验收 |
| 线上双客户端、录分、更正、历史、导出 | 未测；仅在验收活动执行 |
| verify:public 完整脚本 | 未执行；需先初始化两活动，不能把前置 HTTP 检查当作脚本通过 |
| 真实 iPhone、现场网络、持续性能 | 按用户授权后置，仍未测 |

HTTP 前置检查证据在忽略目录 `outputs/public-preflight.json`；不包含管理身份或凭据。原有本地检查见 [P6–P7 准备记录](p6-p7-release-preparation-2026-10-29.md)。

## 下一步

1. 用户在 [本站管理页](https://sophia-sunshine-cup.gaussuag777.chatgpt.site/setup) 使用已批准账号完成官方登录。核对邮箱和本站 ID，先确认已登录但仍为只读，再配置该 ID 的管理员／操作员权限。
2. 短暂开启受控初始化窗口并部署应用配置。管理员补建正式与隔离验收活动，重复核对幂等；正式保持 PREPARED、revision 0、14 人／3 场／7 轮／20 场且阵容和赛果为空。随后关闭窗口并再次应用配置。
3. 用隔离活动执行授权管理操作、两客户端同步、录分、更正、历史与导出；保持正式初始数据正确。
4. 在独立、未登录 OpenAI／ChatGPT 的浏览器直接打开实际 URL，检查场景、赛程、数据刷新，无管理 Cookie 或 bypass token；再运行 verify:public 补充 HTTP 边界和正式初始数据核对。
5. 使用正式 HTTPS 入口做真实 iPhone Safari 验收，记录设备、系统、网络与逐项结果；不把授权后置写成通过。

当前是“版本 1 已公开部署，活动准备与线上验收待完成”，尚不宣告 P7 完整通过。

# 游戏化升级：Sites 版本 4 发布

2026-10-30，Asia/Shanghai。用户在本地交付后明确要求“将这个新的版本进行发布，我到手机上去体验”，本次据此更新已有 public Site，替代最初仅本地交付的范围限制。

后续工作区清理时，以下原 `outputs/` 证据已备份到主工作区 `outputs/worktree-cleanup-2026-10-30/game-scene-upgrade/outputs/`；原独立 worktree 与 5180 预览已移除。

## 体验入口

- [正式活动](https://sophia-sunshine-cup.gaussuag777.chatgpt.site)：保留已有活动状态。
- [独立体验活动](https://sophia-sunshine-cup.gaussuag777.chatgpt.site/?event=sophia-sunshine-cup-acceptance)：适合试排阵、回候场和录分；管理操作使用原授权身份。
- 优先试空地旋转及触界反向、人物安排后的转向行走、练习球／小太阳／风扇。旧页面需要刷新加载新版资源。

## 发布回执

| 项目 | 实际结果 |
| --- | --- |
| 项目 | `appgprj_6ae3626384448191b8fb8eecc7af7ced` |
| Sites 版本 | 4 |
| 来源提交 | `b4d22f8d967935fcf5dcd48217502ff874d2d4d8` |
| version_id | `appgprj_6ae3626384448191b8fb8eecc7af7ced~appgver_3b33513748b4819195955ffcd95dbbc1` |
| deployment_id | `appgdep_6ae39af2cebc81918f6c9e4ed3e3bc0d` |
| 完成时间／状态 | 2026-10-30 03:14:09 +08:00／`succeeded` |
| 受众与策略 | `public`，access policy revision=2，保持原配置 |
| 运行配置 | runtime environment revision=3，保持原配置 |

使用 Sites 1.1.2 官方 `site-workflow.mjs` 打开源码会话，再调用 `build-site.mjs`、同步确切提交和打包，然后执行 `save_site_version` 与 `deploy_site_version`。部署后 `get_site` 再次确认版本 4 与 public。没有变更 D1 schema、初始化窗口、业务身份或授权配置。

归档 `outputs/game-upgrade/site-release.tar.gz`：87 个文件、3,676,160 字节；SHA-256 为 `e56fcfd15ddd08a2bed53f7e9f72e5055c1093057366691bee084fa388b7b919`。构建前按端口及命令归属停止本任务的 8788 生产预览，5180 开发预览和其他任务的 5173／5174 未停止。

## 验证与数据保护

本地 117 项检查、类型检查、lint（0 错误、3 项已有 records 警告）、HTTP／D1 演练及生产预览已通过，详细证据见 [实现交付记录](game-upgrade-2026-10-30.md)。本次发布重新运行官方生产构建通过，没有修改应用代码。

03:14:27 +08:00 的匿名线上检查通过：主页和体验页面 200，无登录跳转；公开数据与 CSV 200；匿名写入及备份 401；伪造身份无效；初始化窗口保持关闭。命令为：

```powershell
node scripts/verify-public.mjs https://sophia-sunshine-cup.gaussuag777.chatgpt.site sophia-sunshine-cup-acceptance sophia-sunshine-cup --active-event
```

发布前后无凭据读取两个活动并比较完整公开状态的规范化 SHA-256，结果完全一致：

| 活动 | revision／generation | 状态／赛果条数 | 前后相同的 SHA-256 |
| --- | --- | --- | --- |
| 正式 `sophia-sunshine-cup` | 15／0 | ACTIVE／0 | `fc74297a419dcc68451b37758e0e5ddaccc410d8bd985e253a19687d7f1741e8` |
| 体验 `sophia-sunshine-cup-acceptance` | 9／0 | ACTIVE／2 | `522070d7f2b0afb789babf0399bb691aa6179e0bc4e5a8852a199be3a8cd4481` |

原始证据为 `outputs/public-http-checks.json`、`outputs/game-upgrade/publish-before.json` 和 `publish-after.json`。未重置活动，也未向正式活动写入测试数据。

桌面 IAB 打开已发布体验活动，三场地、14 人、席位、记分牌和三种互动入口均正常呈现；控制台错误为 0。截图 `outputs/game-upgrade/published-v4.png`。该浏览器沿用已有登录状态，只作场景加载检查；不能替代独立未登录浏览器检查，也不能替代 iPhone Safari 触摸、地址栏、安全区和长期性能实测。实机精简脚本保留在上述实现交付记录。

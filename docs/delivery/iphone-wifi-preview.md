# iPhone Safari 同 Wi-Fi 体验

状态：2026-10-29。已配置局域网入口和窄范围 Windows 防火墙规则；电脑浏览器通过真实 Wi-Fi 地址完成加载、授权、排阵、移出和刷新验证。iPhone 实机结果仍需人工填写，当前没有发布 Site。

## 当前访问方式

- 观赛地址：<http://10.2.63.30:5174/?event=local-iphone-20261029>。
- 操作体验：使用本次聊天或启动终端提供的专用链接，自动为该 Safari 会话授权，再回到球馆。授权最长 8 小时，重启局域网预览后原链接和会话失效；链接令牌不写入仓库配置。
- 未授权设备默认只读。已经授权的同一 Safari 会话打开观赛地址仍有写权限；验证只读请用另一未授权浏览器或在更多面板退出管理。
- 活动 `local-iphone-20261029` 独立于原有演练和模板。第一轮已开放，可直接安排人物；重新启动不会清空已有操作。
- 电脑需保持开机、Wi-Fi 连接和两个预览进程运行。手机地址使用上面的 `10.2.63.30`，不使用手机自身的 `127.0.0.1`。

Windows 规则只允许当前 WLAN 网卡、Node 程序、TCP 5174、本机 10.2.63.30 和来源子网 10.2.0.0/16。未关闭系统防火墙、未修改公网路由或创建外网隧道。

## Safari 实机步骤

在 Safari 普通标签页中执行，先记录 iPhone 型号和 iOS 版本。

| 步骤 | 操作 | 应看到的结果 |
| --- | --- | --- |
| 1. 进入 | iPhone 与电脑连接同一 Wi-Fi，在 Safari 打开专用操作体验链接 | 自动进入球馆；更多面板显示本地演练与管理身份；同步正常 |
| 2. 首屏与镜头 | 竖屏查看三块球场，点 1 号场放大；尝试双指缩放、放大后拖空地、点“全景”复位 | 始终是同一个三场地球馆，其他场地和人物不重新布置；球场是主要画面，姓名能辨认，主要热区不被 Safari 栏或手势区遮挡 |
| 3. 排阵 | 混双选择白队尼克、Vvn，黑队 Kyle、Sophia；点人物再点亮起的位置；也尝试拖入及场外松手 | 仅合法位置亮起；保存成功才改变正式站位；场外松手不提交；“回候场”可撤回预留 |
| 4. 上场 | 阵容完整后点场内记分牌“确认上场”，核对双方完整姓名再确认 | 记分牌显示高亮“录入赛果”，同轮占用限制继续生效 |
| 5. 键盘与草稿 | 点记分牌“录入赛果”，检查数字键盘；输入后关闭牌面、重新打开；在线刷新后再打开 | 同一块记分牌在场景中展开，无独立遮罩；双方姓名和比分保持对应，输入框和确认按钮可触及，短屏可在牌内滚动，草稿可继续 |
| 6. 录分与同步 | 可先用 11:11 检查拒绝同分，再用例如 11:9 保存；电脑打开同一活动地址观察 | 同分保持草稿并提示；有效比分保存后记分牌和其他已打开客户端更新，刷新仍在 |
| 7. 结果与轮次 | 点已完成场次记分牌“更正比分”，核对保存后查看赛果 | 姓名、比分和版本一致；其他两场未录分时不能进入下一轮 |

进一步检查：拖动人物时加入第二根手指缩放，确认取消人物代理且不提交安排；在比分尚未提交时短暂离开 Wi-Fi，观察断线提示，恢复后核对记录再操作。再尝试切后台、锁屏后返回，以及连续操作 10–15 分钟，记录误触、掉帧或发热。不要把本机草稿当成已经共享成功的赛果。

## 如果手机打不开

1. 核对地址仍是 `http://10.2.63.30:5174/`，电脑没有休眠或切换 Wi-Fi，预览仍在运行。
2. 访客 Wi-Fi 或启用了设备隔离的网络可能禁止设备互访；应使用允许电脑和手机互访的同一网络。
3. 若出现本地网络访问提示，允许本次访问。若仍失败，记录 Safari 的提示原文、手机 Wi-Fi IP、iOS 版本，以及电脑访问同一地址是否正常。

当前监听地址来自电脑 WLAN；Wi-Fi 地址改变时应重启入口并重新配置该地址的窄范围规则，不需要关闭整机防火墙。

## 以后启动与关闭

当前已启动，无需重复运行。以后在仓库的两个终端分别执行：

```powershell
npm run dev -- --hostname 127.0.0.1
```

```powershell
npm run dev:lan -- --host 10.2.63.30 --event local-iphone-20261029
```

`dev:lan` 检查本机开发身份，仅在活动不存在时初始化新的 `local-*` 演练。终端输出新的观赛和操作链接。省略 `--host` 时尝试检测 WLAN／Wi-Fi IPv4；更换网络后以新地址为准。

如需配置防火墙，在管理员 PowerShell 执行：

```powershell
& 'D:\git_repository\freedom_world\SophiaPartyPlayground\scripts\lan-firewall.ps1' -Action Enable
```

关闭局域网入口，保留本机 5173 与共享数据库：

```powershell
npm run dev:lan:stop
```

结束体验后，在管理员 PowerShell 删除本项目创建的那一条防火墙规则：

```powershell
& 'D:\git_repository\freedom_world\SophiaPartyPlayground\scripts\lan-firewall.ps1' -Action Disable
```

## 实现与验证范围

- `scripts/lan-gateway.mjs` 将指定私网地址和 `local-*` 活动映射到原有 loopback 开发预览；支持 Vite WebSocket。公开读取不附带开发身份，专用链接建立临时 HttpOnly 会话；其他活动、私有运行文件和连接器调试入口不开放。
- 网关清除来访者伪造的身份、转发与开发 Cookie；跨站写入仍被拒绝。它没有修改 Sites starter 的本机登录实现，也没有改变生产授权。
- `crypto.randomUUID` 在 HTTP 局域网地址上可能不可用。提交编号优先用该方法，否则用 `crypto.getRandomValues` 产生 UUID v4，仍在发送前保存幂等编号。依据：[randomUUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID)、[getRandomValues](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues)。
- 43 项自动检查通过，其中新增 4 项网关 HTTP 检查和 1 项缺少 randomUUID 时的实际命令保存检查。类型检查和本轮相关文件 ESLint 通过。
- 本机访问 Wi-Fi 地址：页面和 API 成功；匿名角色 viewer；伪造开发 Cookie／身份写入 401；其他演练活动 404。授权后实际排阵／移出并刷新成功，操作编号正确保存。
- Windows 普通权限不能添加规则，随后通过系统管理员确认成功应用；结果保存在忽略的 `.sites-runtime/lan-firewall-result.json`。网关进程元数据不包含授权令牌。
- 本地生产构建成功；生产只读权限与开发身份隔离继续验证。具体输出见 `outputs/lan-build.log`、`outputs/lan-checks.json` 和 `outputs/lan-production-checks.json`。

以上是电脑端与本地服务验证，不能代替 iPhone Safari 的触摸、键盘、恢复或持续性能验收。P6 的实机项待体验反馈，P7 仍未执行。

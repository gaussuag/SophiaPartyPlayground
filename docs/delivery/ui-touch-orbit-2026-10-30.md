# Safari 触控与人物资料弹窗优化

基线 `76c46ba`，接手时工作区与暂存区干净。用户反馈发布版在 Safari 渲染正常，但希望单指旋转、更自由的 3D 交互，以及人物点击弹窗居中；进一步明确轮次和设置菜单可以继续从底部弹出。保留现有三场地世界、名单、赛程、业务规则、D1 与服务端授权。

## 实现

- 单指划空地：360 度水平环绕与 32–72 度俯仰，起手超过 9px 后才旋转，滑动结束有短惯性。点球场继续放大，人物起手仍点选／拖入，不把人物拖拽当作镜头手势。
- 双指：捏合缩放并跟随中心点平移。第二指取消人物代理，剩余单指不会恢复人物提交；pointercancel／捕获丢失同样取消。桌面可滚轮缩放、Shift 拖动平移。
- 视角工具：方向回正、1–5 倍缩放、全景复位；减少动态效果偏好下不启用惯性。新手势、录分、镜头请求或卸载会取消旧动画。
- 全景旋转时适配手机长边；近景保留观看方向，同时为当前球场和记分牌取景。远景记分牌收紧为 84px，保持 44px 点按高度，工具栏也保持 44px 热区。
- 人物资料卡原先实际出现在左上角。ConfirmDialog 现根据 visualViewport 的尺寸及偏移定位中心，监听尺寸／滚动变化，并限制可滚动高度。原生 dialog 的焦点管理和 Esc 保留，GameDrawer 的底部布局未改；普通界面不再显示人物内部 ID。
- 相机的中心、角度、缩放与惯性只留在 venue；不写入比赛命令或数据库。旋转前后仍是同一个世界，没有切换场地或重新布置人员。

## 验证

| 检查 | 结果 |
| --- | --- |
| 类型、相关文件 ESLint | 通过 |
| 自动检查 | 8 个文件、64 项通过；覆盖完整业务、存储与 session 原有检查，以及新的角度边界、三场地取景、旋转后拾取和记分牌可达性 |
| 人物资料卡 | 390×844、320×568、844×390 的中心偏差均为 0px，完整位于视口内；截图保存 |
| 轮次／设置 | 390×844 中底边均为 y=844，仍从底部弹出 |
| 单指旋转 | 通过真实浏览器拖动触发 Pointer Events，yaw／pitch 变化，比赛 revision=0 和三场地世界坐标保持不变；不冒充实际手指测试 |
| 旋转后近景 | 保留方向，记分牌仍可点击；新检查先复现原方案牌框越过右边界，再验证取景修正 |
| 人物拖入与场外松手 | 旋转后将 Lavonne 拖到 2 号场 WHITE-2，D1 revision 从 1 增至 2，仅一次安排；另一人物拖到场外未增加版本，也未改变相机角度 |
| 资格约束 | 测试中女性选手被男性席位拒绝，未覆盖原阵容；随后按模板合法阵容继续 |
| 旋转后比赛闭环 | 独立本地 `local-orbit-20261030`：2 号场白队大飛／Lavonne、黑队 Leo／苡萱，确认上场，11:5 草稿关闭重开保持，再提交成功 |
| 真实 Safari | 用户只确认旧发布版渲染正常，未提供型号／系统；本次单指、双指、第二指取消、系统键盘和持续性能等待新版本实机试用 |

证据在忽略目录 `outputs/orbit/`：`profile-before.png`、`profile-390.png`、`orbit-390.png`、`rotated-scoreboard.png`、`browser-checks.json`。不提交本地数据库、演练导出或凭据。

## 发布与下一次试用

复用已有 Site `appgprj_6ae3626384448191b8fb8eecc7af7ced`，原生受众维持 public。正式活动与隔离验收活动均不重置，生产授权名单和关闭的初始化窗口保留。

| 发布项 | 实际回执 |
| --- | --- |
| 名称与 URL | Sophia Sunshine Cup；https://sophia-sunshine-cup.gaussuag777.chatgpt.site/ |
| Sites 版本 | 2 |
| source commit | d9d8ebc89f55ba61ba9543a62ece5fb4a9c4c95e |
| version_id | appgprj_6ae3626384448191b8fb8eecc7af7ced~appgver_45aa8a8afa1c8191b3e81123fa78abc9 |
| deployment_id | appgdep_6ae373f614e0819198897de6ee7c871f |
| 状态／运行配置 | succeeded；env_set_revision=3，public 再次由 get_site 确认 |
| 构建与资源 | 官方 build-site／site-workflow 成功；客户端全部 JS＋CSS gzip 合计 419410 字节，比上一版多 1754 字节；不等于首屏下载或手机帧率 |
| 静态模块 | 实际 venue-Bh5d357P.js 匿名 GET 200、text/javascript、948157 字节，与构建 SHA256 一致 |
| 数据不变 | 发布前后完整公开状态摘要相同；正式 revision=0、0 赛果，验收 revision=9、2 个赛果版本 |
| 匿名 HTTP | verify:public 通过：根页／读取 200、无登录跳转、写入／备份 401、身份伪造被忽略、初始化窗口关闭 |
| 线上窄屏浏览器 | 390×844 中实际拖动后 yaw 0.071→0.486、pitch 0.707→0.799，正式记录仍为 0；人物卡中心偏差 0px，设置菜单底边 844；管理身份仍为活动管理；无控制台 error |

使用官方 source credential 经隐藏 stdin 同步、构建打包、save_site_version、deploy_site_version，没有另建 Site 或改变存储。新增证据在 `outputs/orbit/published-profile-390.png`、`published-orbit-390.png`、`published-browser-checks.json`、`published-asset.json`、`pre-publish-events.json`、`post-publish-events.json`，匿名边界结果在 `outputs/public-http-checks.json`。独立匿名浏览器的既有未完成项、实际 iPhone 多指与持续性能均未冒充通过。

发布后在 Safari 刷新实际 URL，先在空地单指左右／上下划动，再双指缩放和平移，使用方向图标与全景复位；点人物核对资料卡居中，轮次／设置仍贴底。写入演练使用 `?event=sophia-sunshine-cup-acceptance`，先验证人物拖拽中加第二指、取消手势或场外松手不会误提交，再检查数字键盘、草稿与保存。正式活动不用于试用排阵或成绩。

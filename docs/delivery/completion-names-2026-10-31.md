# 完赛姓名与入口精简

承接 main 1c0f05b、原public Site版本22。用户明确删除「重播完赛演出」按钮，恢复完赛人员姓名并跟随身后，要求不遮挡人物；近景、队形、彩带和比赛流程不改。

## 实现

- 删除重播按钮、样式和无调用的本机重播方法。自动进入完赛及从轮次菜单重入保持。
- 完赛姓名改为小型非交互文字标签，白／黑队放队列外侧、近脚后；Sophia优先放身体下方，空间不足时移到邻近空隙，避开脸和翅膀。不添加点击热区或人物详情。
- LabelProjection在原帧循环读取实际avatar-body几何包围盒，投影人物保护区；CompletionNames安排姓名以避开所有人物、其他姓名和标题／导航区域。尺寸缓存放ref，不逐帧触发React状态或额外网络。
- 有效候选位优先保留，镜头位置／缩放变化后重新靠近本人。备用位置不会被错误永久记住；离屏人物不留下游离姓名。极端视图没有任何空位时不硬盖到人物上。
- 普通比赛和历史姓名仍为原选人交互；仅完赛使用非交互标签。保留当前近景和真实阵容、比分、权限。

## 本地证据

- 33文件254项自动检查、类型与修改文件静态检查通过；包括小屏13姓名不互叠／不盖人物、稳定跟随、缩放回位和离屏清理。初次缓存用useMemo被immutability检查拒绝，改为帧内专用ref后通过，无规则豁免。
- 402×744、320×568实际内部CSS视口构图已检查：13名、没有重播按钮，Sophia姓名避开身体和翅膀；原近景比例保持。外层仅缩放截图，不冒充Safari实机。
- 首次完整七轮 local-r23-names-1 通过（revision117）：13姓名、默认与约0.7倍不遮人／不互叠、无重播入口、双客户端事实一致、同分、更正、历史与刷新恢复，无动画写入。
- 检查中发现缩放后极少姓名记住远处候选位；已修复相机上下文与备用位缓存，并新增对应回归。最终稳定版本的七轮及生产／发布证据在后续补记。

发布前只读观察：正式活动已由用户归档为FINISHED，revision140、21场赛果，最后审计FinishEvent；沿用该状态，不回退到上版本139，不重置。四活动摘要和回执在outputs/completion-names/，凭据不落盘，不调用任何线上比赛命令。

最终稳定版本 local-r23-names-2 全七轮真实页面／D1双客户端通过（revision117）：默认／约0.7倍全部13姓名可见，实际姓名矩形未覆盖任一模型保护区，也无姓名互叠；无重播按钮，历史、更正、同分与刷新通过。末段600帧桌面诊断中labels p95=0.6ms、p99=0.8ms；render CPU p95=1.3ms。该数据含诊断路径，不是GPU或iPhone触摸性能证据。控制台error为空。

## 版本23生产与发布

- 官方source workflow构建、提交、推送源码 d094670e3cc579052dda07b71de3fe799f89473c；原public Site保存版本23并原生部署succeeded。归档86文件／3799040字节，SHA-256 f3dcc7f2c9fe92ff3625869f1d2aea6b17d80080c54e38b0b44ce79c8b2e4c6b。
- saved version：appgprj_6ae3626384448191b8fb8eecc7af7ced~appgver_9968920687a881919b88159707ccce48
- deployment：appgdep_6ae55ab5b30c8191b32f7c5d002a8d5c，env_set_revision=5；get_site确认public及最新版本23。实际URL https://sophia-sunshine-cup.gaussuag777.chatgpt.site 。
- 生产根页、活动和setup 200；匿名整轮开赛、重置、伪造管理写入401，初始化404；非法请求403／400／413后SSR正常。无开发身份或server实现进入客户端。客户端JS/CSS gzip447616字节，比版本22增加1288字节，无新增字体或模型下载。构建仅既有大chunk提示。
- 公开HTTP无Cookie、真实身份或bypass：根页／活动／CSV 200且无登录重定向；管理、备份、重置、整轮确认401，初始化关闭，伪造身份忽略。不是独立未登录浏览器或真实Safari验收。
- 原交付窗口刷新后：正式活动白15:黑13，13姓名在人物外侧／Sophia身体下方跟随，当前近景保留，无重播按钮；控制台error为空。实际线上截图outputs/completion-names/site-v23.jpg。

四个活动发布前后完整公开状态SHA-256一致：

| 活动 | phase／revision／赛果版本数 | SHA-256 |
| --- | --- | --- |
| sophia-sunshine-cup-v2 | FINISHED／140／21 | 446f08af942cac35d2962f3f7f6cb27220d688b36ec8c4333bd77763e6c1358c |
| sophia-sunshine-cup-v2-acceptance | ACTIVE／9／2 | d0e6f14cf3a761b88d1adf7ee25c9961148fb4b192a70d3cb318902b600a3e58 |
| sophia-sunshine-cup | ACTIVE／107／9 | df4f0f9a8d62d69f68adcca0d1963ae7fe4521a335496f13b104ac8ca021a79a |
| sophia-sunshine-cup-acceptance | ACTIVE／22／3 | f130499a76b0838c46cc081e8caae17417842f49a966e55e37a81fbb2a014be8 |

正式活动保持用户已归档的FINISHED、revision140与21场赛果，本次没有线上比赛写入。源码、交付记录已提交，输出／数据库／演练导出／凭据未提交；无关Avatar研究稿保留。真实iPhone Safari的观感、触控、后台和长期性能仍由用户发布后验收。

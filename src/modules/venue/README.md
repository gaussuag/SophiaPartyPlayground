# venue Module

2026-10-30 手机 HUD 修复：应用的状态／保存反馈放入既有底部操作区，和管理按钮、选人栏顺序排版；顶部只保留视角工具条。轮次齐备提示不再带单个场地前缀。全景和近景给顶部工具条留出取景空间，球场／人物世界坐标不变。已移除练习球、小太阳、风扇的按钮、几何体、控制器、样式及对应测试；热身／比赛球、候场角色和排阵动画继续保留。见 [交付记录](../../../docs/delivery/hud-and-scene-cleanup-2026-10-30.md)。

2026-10-30 本机演出：可选 `animationActive` 表达球馆是否在前台且未被面板遮住／未手动暂停。`LocalChoreography` 只消费确认视图和固定世界布局，生成有界姿态及球轨迹；不接触 session、网络、缓存或比赛决定。准备期 1v1／1v2／2v1 一球，2v2 两球；比赛（含旧 AWAITING_RESULT）一球，真实单打不补人，赛后及历史轮不拉球。场次＋阵容＋phase＋generation 标识演出，无关 revision 不重播。

候场动作按真实占位计算，独立随机短走／停留／伸展／看球／轻挥拍；个人偏移限定在 x±0.26、z±0.4。`AvatarMotion` 仍独占转场路线，接收可见起点避免从候场走动跳回原点；未到位或预测位置与确认位置不同的角色暂停装饰活动和相关球。Avatar 将转场与本机姿态合成到唯一 playerId 根对象，`walking` 只表示转场；`ambientWalking` 不影响可选资格。按下即冻结目标和姓名，抬手后短暂保留以覆盖原生 click；选中／候选期间保持稳定。

`Scene` 在同一个 R3F useFrame 中采样演出，`RallyBalls` 复用最多六个球和阴影；没有额外 RAF、动画计时器或逐帧 React 状态更新。离开球馆、页面隐藏及卸载停用，返回按当前确认视图恢复；系统减少动态效果时静止并隐藏演出球。更多菜单可单独暂停／恢复本机动画，赛事同步仍照常。诊断数据仅在 venueMetrics 开启时采集。依据及取舍见 [研究](../../../docs/development/local-court-animation-research-2026-10-30.md)，验证见 [交付](../../../docs/delivery/local-court-animation-2026-10-30.md)。

公开 Interface：index.tsx 的 Venue 及交互类型。输入 state、view、courtId、cameraRequest、selection、slotSelection、placements、editable、canWrite、readOnly、canConfirm、canCorrect 和可选 arrangementView／candidatePlayerIds／editingMatchId／editor／pending；输出 court／player／slot／place／bench／start／scoreboard 意图。app/placements.ts 用 competition.decide 生成合法位置及其反向候选名单，venue 不复制资格规则。candidatePlayerIds 只表达当前席位的可选提示，不赋予权限。pending 描述本机待保存反馈；arrangementView 是 session 预测的准备期人物目标，只交给 Avatar，不用于记分牌、资格、赛果或管理操作。

courtId 只表达业务操作上下文；cameraRequest 是带序号的本机镜头请求。editor 仅提供 matchId 与应用管理的牌面内容，venue 不持有 session 或写入比分。场内记分牌的几何体和 DOM 牌面绑定同一个 matchId。

人物与场地使用程序几何体；姓名牌位于页面统一管理的 DOM 中，位置由 Three.js 投影。避免在场景内另建 React DOM root，保证切换／卸载后可从快照重建。

负责 Three.js／R3F 场景、角色、球场、记分牌、拾取热区、镜头和短动画。输入是只读业务视图与本机交互状态，输出是稳定业务身份的操作意图。

- player 根对象与姓名牌绑定 playerId。
- 球场绑定 courtId 和本次查看的 matchId；席位绑定 matchId、sideId、slotId。
- 记分牌直接显示确认上场、录入赛果、继续录分或更正比分。牌面展开时固定 matchId；镜头左右不能替代黑白队身份。
- 常态牌面收成单行：场号、当前操作或有效比分；待排阵时显示类型，已录分用铅笔表示更正。实际按钮高 44px、可见牌面高 36px。所有视口的牌子均位于候场区后方专用条带，竖屏使用 84px 牌面；类型和完整操作保留在可访问名称／提示以及展开详情中。
- child mesh 的命中需要追溯到实体根对象。
- 人物位置、模型 UUID、动画结束回调都不能作为保存比赛事实的依据。
- 场景可以从任意有效快照重新构建；历史展示不会改变实时角色占用。
- 不直接请求网络、不直接写比赛状态；准备期排阵可先消费本机预测目标，比赛阶段与赛果动作等确认结果后播放，动画均可中断。
- 人物模型与姓名牌均可点选／拖拽；位置是实际场内热区。上场人物姓名置于脚下，避免被后方记分牌遮挡。点选、键盘和拖拽具有相同业务身份。
- 拖拽保留起手 revision／generation，半透明代理只是预览；松手发送 place 或 bench 意图，合法场边候场区／就近标记可直接下场，比赛区域或取消不提交。准备中的跨场移动由 app 映射为 MovePlayer，一次保存；已确认上场人物不产生排阵拖拽。
- 全屏按需渲染；所有视口使用同一横向三场地坐标和前后两队候场区，三片场地、候场区和人物不随场地选择重排或隐藏。竖屏以取景／缩放适配横向世界，不强制横屏；镜头和人物移动支持减少动态效果偏好。
- 场间距和全景取景为常态牌框留白；短屏相应调整比例与候场间距。点球场的镜头同时保留本场的操作牌，放大操作不重新排布世界。牌框与三块比赛区域的投影间不重叠，见 tests/venue/world.test.ts 的五种视口检查。
- 单指划空地环绕旋转并调整俯仰，俯仰限制在 32–72 度，不翻到地下；双指同时缩放、平移，桌面支持滚轮缩放及 Shift 拖动平移。可排阵时人物起手仍点选／直接拖入，超过 9px 才起拖，不增加长按；走动、保存、锁定或只读时点人物不自动打开详情，滑动仍可旋转。详情仅由明确资料按钮打开。第二根手指（包括落在场内 UI 上）取消人物代理；抬起其中一指后等待全部抬起。取消／真正捕获丢失不提交，正常隐式 capture 转交不算取消。
- world.ts 的 Navigation 只保存本机 center／zoom／yaw／pitch。纯旋转保持实际 zoom、枢轴与轨道半径，不随角度自动取景。orbitNavigation 使用与官方 OrbitControls 一致的视口高度归一化角位移；3px 只决定取消点击，镜头从第一个移动样本响应。近景同时容纳球场及其记分牌，查看单场保留方向。
- CameraMotion 独占实际 pose：手势直接写入，显式近景／全景／回正请求才做角度、中心和 zoom 的统一过渡；Rig 在 useFrame 中重建球面姿态，不对相机世界坐标做直线 lerp。过渡按时间 delta 计算，减少动态效果偏好下直接到目标。没有额外的惯性 requestAnimationFrame 循环，镜头姿态不进入 session 或数据库。
- CameraHud 把同帧相机姿态投影到工具条及远景属性；高频输入不调用 React setNavigation。React 只处理业务变化、手势起止和浮层状态。0.35–5 倍缩放不隐式重置枢轴；全景显式适配三场、回正只复位方向，品牌总览恢复初始镜头。远景牌面为 84px 宽、44px 热区。
- 录分期间保持世界，镜头对准实体牌面，锁住其他场内操作；根据 visualViewport 留出键盘区域，关闭恢复先前镜头。
- InteractiveVenue 管理拾取／手势和 DOM，Scene 管理几何、镜头、投影和短动画，world 管理固定世界坐标。WebGL 监听随 Canvas 清理，重建不改变 session 或记录。
- 用户报告 iPhone 17 双指缩放流畅、单指旋转交互不连续；本次针对手感，不降画质或模型精度。更新后的单指／多指衔接仍待实机反馈，桌面 Pointer Event 与数学检查不替代实机。

2026-10-30 的职责拆分与边界：

- `VenueInput` 统一管理 DOM／R3F 指针轨迹，以相邻输入计算受限增量；边界不积累超额位移，up 消费最后样本。同次手势冻结 Canvas、布局和地面映射；后续 resize 保持实际 zoom 与屏幕位置，方向改变则取消旧序列。`CameraMotion`／Rig 保持唯一相机所有权。
- `AvatarMotion` 接收人物展示目标，负责绕网路线、转身、步态、到位与中断。准备期合法排阵可由本机 arrangementView 提前驱动；确认时同目标不重走，拒绝后从可见当前位置走向最新权威位置。恢复或换轮沿用上下文重建，减少动态效果沿用静态反馈。`AvatarResults` 仍只对新确认赛果回应。标签锚点随稳定 playerId 的可见根对象移动。历史名单更正草稿只显示拟姓名，不驱动人物位置。`playerPlacement` 为当前和历史轮共用目的地推导：比赛结束继续留场，进入新轮才回候场，历史轮恢复原参赛阵容。
- `AvatarAttention` 在选位时做 2.6 秒举手与光圈缩放，之后只保留静态光圈和姓名描边；重复渲染不续播。关闭／选人／隐藏取消，减少动态效果不播放。沿用同一 Canvas、useFrame、invalidate；`avatarAppearance` 同时供 3D 人物与 SVG 头像使用，不为每个头像创建 Canvas。
- 横向全景的近侧候场姓名位于脚下，避免其 44px 热区盖住空席位。回候场标签只在适用时显示并有独立层级。宽屏候选面板靠右下，手机竖屏保持底部，不建立遮罩。
- 投影层使用 `overflow:clip`，禁止浏览器聚焦滚动偏移 3D 坐标；内部比分滚动容器仍可滚动。短屏牌面 84px，主操作 HUD 优先。
- `VenuePerformance` 只在 URL 含 `venueMetrics` 时采样；有界记录输入、相机、DOM 投影、render CPU 与帧间隔。数值不等同于 GPU 时间或 iPhone 触摸延迟。帧循环不逐帧更新 React 业务状态。

实现、浏览器证据与实机未测项见 [游戏化交付](../../../docs/delivery/game-upgrade-2026-10-30.md)。

资源见 [public](../../../public/README.md)；详细依据见 [交互](../../../docs/product/interaction-and-state.md)与[性能预算](../../../docs/architecture/overview.md)。


2026-10-30：Sophia 在 v2 以 FREE 名单阵营显示，独立候场、紫金配色、共享轻量羽毛网格（无头顶光环）。angel-pose 仅输出本机悬浮／翅膀姿态；上下场直线飞越球场／球网，腿无步幅，按下冻结、暂停及减少动态效果继续生效。world.playerPlacement 返回真实 sideId，方向、击球和胜利反应按本场代表队处理，不按 FREE 的名单归属猜测。没有复用另一 worktree 中未合入的角色资产。

2026-10-30 路线更新：`avatarRoute` 对普通角色只将三张实际球网及身体间距当障碍，使用可见顶点图求最短路；无遮挡时一个直线段，FREE 飞行始终一个直线段。原整片球场障碍、侧门与固定通道已移除。

`AvatarPlacements.sync/get/exitFor` 是本机展示目的地的共同 Interface，按当前／预测阵容决定是否在场，离场时从可见位置求最近可用场边点并与其他人物留间距。确认 ACK、其他选手更新或暂停不重选候场点；连续当前轮推进保持运动上下文，历史访问、event/generation 改变重建。`LocalChoreography` 只在实际已下场时复用对应本机位置，预测期间不改变权威的热身配对／球数。Avatar 在已有 useFrame 中接收目标，不新增 RAF 或逐帧 React 状态更新。坐标不保存、不发送；两客户端可以有不同的场边停留位置。

球拍视觉：Paddle 接收 playerId 与当前肤色，固定挂载于现有右臂。paddle-model 负责稳定个人配色、共享原始部件和按配色／肤色缓存的合并网格；拍面、护边、握把、图案及握柄手掌合并为一个网格，所有球拍共享一个顶点色材质。PADDLE_MOUNT 是握柄中心及略向前／外的方向，拍头局部 +Y、拍面 +Z；不接触比赛／同步模块，无 useFrame 或加载器。共享缓冲由模块缓存拥有，单个人物卸载不得销毁其他实例使用的资源。

阳光运动场：ParkEnvironment 只提供视觉环境，park-model 合并外围景物与铺装为两组顶点色几何，另有陆地与水面，共四个环境网格；不消费赛事或 session，不注册交互身份，raycast 显式空实现。所有抬高的装饰顶点避开 x±14.5、z[-15.7,10.7] 的球场／候场／记分牌保护区。新增铺装允许覆盖地面，但不改变 groundAt、worldLayout 或 AvatarPlacements。原厚底座撤下，场区原有薄面与外部平面衔接。

sunlight 管理静态 ShaderMaterial 缓存：世界位置／法向、顶点色或固定底色、柔和阳光和天空项、地面微颗粒、解析树荫、铺装缝、水纹和远景淡化；末尾沿用 Three.js 色调／颜色空间输出块。只有材质，不引入时钟、useFrame、阴影贴图、后处理、纹理或加载器。模块缓存拥有共享资源，单场或单场景卸载不销毁其他视图仍使用的几何／材质。Court 只替换表面颜色并新增两片比赛区底色，原尺寸、线位、球网、身份和事件保持。

两排候场：world.benchRows 定义 z=±8.4 的两条停留排，benchAreas 只保留周围的拖放命中带；原队伍标记继续作为下场意图的别名，实际目的地仍由两排选择。场间／侧边通道不再接收下场意图。AvatarPlacements 在两排中按最短可达成本和既有间距选择空位，预测 ACK 保持同一目标。Sophia 自由位在前排末端；不改变队伍或代表资格。

拍面触球：paddle-pose 是 Avatar 缩放、右肩、握柄、拍面和球半径的共同来源。RallyTimeline 只提供 sample(clock)，内部管理固定接触姿态、就位、引拍／随挥、落地与过网弧线；相邻来球／出球共用同一接触帧，三人或双打换搭档不会跳点，接触缓存有界。LocalChoreography 在原 useFrame 内推进各 lane，真实阵容／状态仍由 courtProgrammes 决定；任何无关 revision 不重置时间轴。

Avatar 在拉球时直接使用同一姿态的偏移、朝向、手臂与悬浮高度，取消这段路径的第二次平滑与重心偏移，避免拍面与预定接触点分离；普通候场、走动、举手和飞行仍沿原机制。RallyBalls 沿用六球池，增加短尾迹及 0.1 秒轻微触球圈，没有新计时器／网络。LabelProjection 的实际 paddleCenter 只在 venueMetrics 开启时取世界矩阵，供浏览器验收；生产常态不做这项诊断读取。

2026-10-31：修正人物自身的右手定义（正面 +Z，右侧 -X），共享 RIGHT_SHOULDER 与握拍／挥拍参数同步镜像，拍头向右外侧倾角约 34°。RallyTimeline 与实际 Avatar 共用新拍面，保持触球一致。紧凑牌面采用固定场号、独立比例比分字区、操作图标三列；SVG 文本随可用宽度适配，超过两位的数值压缩字形而不改变业务值，完整双方比分有可访问名称。最小点击高度仍为 44px。

2026-10-31 随机演出：RallyTimeline 的 sample(clock) 保持原 Interface，构造可选本机 seed。比赛按双方各自的短轮换组随机正反顺序，保证所有真实上场人物参与，同时打破固定四拍线路。按击球编号生成可重查的接球位置、落点／落地时间和弧线；已定接触点不追逐当前帧，过网高度及横向边界受约束。独立 seed 由 LocalChoreography 传入，热身配对／双球不变。

LocalChoreography 在任一当前场次 playing 时让真正场外人物在 z=±[7.6,10.2]、x±10.5 的两侧步道选新走位（原有更外侧候场位可正常步入），包含停留、待机和观赛；目的地不再受原位半径约束，按有限候选避让人物与已预留路线。无比赛时在当前停留点回到原小幅待机，不强迫回原位。上场／换轮／恢复以原业务快照重建；按下、点击宽限、选中和候选继续冻结，暂停／减少动态效果沿原机制。复用原 useFrame，无新网络或计时器。

# venue Module

公开 Interface：index.tsx 的 Venue 及交互类型。输入 state、view、courtId、cameraRequest、selection、slotSelection、placements、editable、canWrite、readOnly 和可选 editingMatchId／editor／pending；输出 court／player／slot／place／start／scoreboard 意图。app/placements.ts 用 competition.decide 生成合法位置，venue 不复制资格规则。pending 只描述本机待保存反馈，不提供正式人物目的地。

courtId 只表达业务操作上下文；cameraRequest 是带序号的本机镜头请求。editor 仅提供 matchId 与应用管理的牌面内容，venue 不持有 session 或写入比分。场内记分牌的几何体和 DOM 牌面绑定同一个 matchId。

人物与场地使用程序几何体；姓名牌位于页面统一管理的 DOM 中，位置由 Three.js 投影。避免在场景内另建 React DOM root，保证切换／卸载后可从快照重建。

负责 Three.js／R3F 场景、角色、球场、记分牌、拾取热区、镜头和短动画。输入是只读业务视图与本机交互状态，输出是稳定业务身份的操作意图。

- player 根对象与姓名牌绑定 playerId。
- 球场绑定 courtId 和本次查看的 matchId；席位绑定 matchId、sideId、slotId。
- 记分牌直接显示确认上场、录入赛果、继续录分或更正比分。牌面展开时固定 matchId；镜头左右不能替代黑白队身份。
- 常态牌面收成单行：场号、当前操作或有效比分；待排阵时显示类型，已录分用铅笔表示更正。实际按钮高 44px、可见牌面高 36px。桌面牌子位于候场区后方的专用条带，竖屏位于场间空隙；类型和完整操作保留在可访问名称／提示以及展开详情中。
- child mesh 的命中需要追溯到实体根对象。
- 人物位置、模型 UUID、动画结束回调都不能作为保存比赛事实的依据。
- 场景可以从任意有效快照重新构建；历史展示不会改变实时角色占用。
- 不直接请求网络、不直接写比赛状态；动画在确认结果后播放且可中断。
- 人物模型与姓名牌均可点选／拖拽；位置是实际场内热区。上场人物姓名置于脚下，避免被后方记分牌遮挡。点选、键盘和拖拽具有相同业务身份。
- 拖拽保留起手 revision／generation，半透明代理只是预览；松手发送 place 意图，取消或场外松手不提交。
- 全屏按需渲染；world.ts 仅按视口计算布局，三片场地、候场区和人物不随场地选择重排或隐藏。竖屏纵向布场，短屏为操作牌自适应比例与间距；镜头和人物移动支持减少动态效果偏好。
- 场间距和全景取景为常态牌框留白；短屏相应调整比例与候场间距。点球场的镜头同时保留本场的操作牌，放大操作不重新排布世界。牌框与三块比赛区域的投影间不重叠，见 tests/venue/world.test.ts 的五种视口检查。
- 单指划空地环绕旋转并调整俯仰，俯仰限制在 32–72 度，不翻到地下；双指同时缩放、平移，桌面支持滚轮缩放及 Shift 拖动平移。可排阵时人物起手仍点选／直接拖入，超过 9px 才起拖，不增加长按；只读人物与姓名滑动可旋转，轻点仍查看资料。第二根手指（包括落在场内 UI 上）取消人物代理；抬起其中一指后等待全部抬起。取消／真正捕获丢失不提交，正常隐式 capture 转交不算取消。
- world.ts 的 Navigation 只保存本机 center／zoom／yaw／pitch。纯旋转保持实际 zoom、枢轴与轨道半径，不随角度自动取景。orbitNavigation 使用与官方 OrbitControls 一致的视口高度归一化角位移；3px 只决定取消点击，镜头从第一个移动样本响应。近景同时容纳球场及其记分牌，查看单场保留方向。
- CameraMotion 独占实际 pose：手势直接写入，显式近景／全景／回正请求才做角度、中心和 zoom 的统一过渡；Rig 在 useFrame 中重建球面姿态，不对相机世界坐标做直线 lerp。过渡按时间 delta 计算，减少动态效果偏好下直接到目标。没有额外的惯性 requestAnimationFrame 循环，镜头姿态不进入 session 或数据库。
- CameraHud 把同帧相机姿态投影到工具条及远景属性；高频输入不调用 React setNavigation。React 只处理业务变化、手势起止和浮层状态。0.35–5 倍缩放不隐式重置枢轴；全景显式适配三场、回正只复位方向，品牌总览恢复初始镜头。远景牌面为 84px 宽、44px 热区。
- 录分期间保持世界，镜头对准实体牌面，锁住其他场内操作；根据 visualViewport 留出键盘区域，关闭恢复先前镜头。
- InteractiveVenue 管理拾取／手势和 DOM，Scene 管理几何、镜头、投影和短动画，world 管理固定世界坐标。WebGL 监听随 Canvas 清理，重建不改变 session 或记录。
- 用户报告 iPhone 17 双指缩放流畅、单指旋转交互不连续；本次针对手感，不降画质或模型精度。更新后的单指／多指衔接仍待实机反馈，桌面 Pointer Event 与数学检查不替代实机。

2026-10-30 的职责拆分与边界：

- `VenueInput` 统一管理 DOM／R3F 指针轨迹，以相邻输入计算受限增量；边界不积累超额位移，up 消费最后样本。同次手势冻结 Canvas、布局和地面映射；后续 resize 保持实际 zoom 与屏幕位置，方向改变则取消旧序列。`CameraMotion`／Rig 保持唯一相机所有权。
- `AvatarMotion` 只接收权威投影的目标，负责绕网路线、转身、步态、到位与中断；`AvatarResults` 对新确认赛果做一次性回应。标签锚点随稳定 playerId 的可见根对象移动。更正草稿只显示拟姓名，不驱动正式位置。当前轮完成回候场，历史轮展示原参赛阵容。
- `ScenePlayController`／`ScenePlay` 负责三种有限时长的本机互动；不持有赛事身份，不提交网络或存储。相机滑动压制点击，录分、隐藏、卸载与恢复取消动作；减少动态效果保留静态反馈及到期复位。
- 投影层使用 `overflow:clip`，禁止浏览器聚焦滚动偏移 3D 坐标；内部比分滚动容器仍可滚动。短屏牌面 84px，玩具入口最低 48×44px，主操作 HUD 优先。
- `VenuePerformance` 只在 URL 含 `venueMetrics` 时采样；有界记录输入、相机、DOM 投影、render CPU 与帧间隔。数值不等同于 GPU 时间或 iPhone 触摸延迟。帧循环不逐帧更新 React 业务状态。

实现、浏览器证据与实机未测项见 [游戏化交付](../../../docs/delivery/game-upgrade-2026-10-30.md)。

资源见 [public](../../../public/README.md)；详细依据见 [交互](../../../docs/product/interaction-and-state.md)与[性能预算](../../../docs/architecture/overview.md)。


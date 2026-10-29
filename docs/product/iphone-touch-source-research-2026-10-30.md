# iPhone Safari 3D 球馆触控：一手资料研究

研究日期：2026-10-30（Asia/Shanghai）。研究基线：`06177a69f0d6f41a8c8682aa0b8661374ada5db2`。这是设计研究与待验证建议，不是新的已确认需求，也不是 iPhone 实测报告。未修改应用、权限或活动数据，未发布。

## 项目判断

球馆承担选人、排阵和记分，人物关联稳定的选手身份。它需要游戏式的直接操控，但不需要实时操纵角色奔跑来完成排阵。[项目需求](requirements.md)、[venue 契约](../../src/modules/venue/README.md)

需求已明确“单指空地旋转、双指缩放平移”，且纯旋转不改变中心、缩放和轨道半径；拖拽是点选的补充。因此保留该默认映射，先解决旋转起步、持续反向及松手的连续性。单指平移可作为对照原型，但不能在研究文档中写成用户已经批准的替换方案。[需求中的界面准则](requirements.md#用户补充的界面准则2026-10-29)

用户最新反馈聚焦“旋转不跟手、起步或松手不自然”。已有诊断记录解决过旋转意外缩放、门槛后突跳、重复缓动和高频 React 状态；该记录不证明当前真机问题仍由同一原因导致。[前次旋转诊断](../delivery/ui-orbit-response-2026-10-30.md)

## 已核验的一手事实

| 事实 | 来源 | 对此项目的意义 |
| --- | --- | --- |
| Apple 要求手势及时反馈、结果可预测；自定义手势应易发现、易执行、彼此区分，不能成为重要动作的唯一入口。 | [Apple HIG: Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures) | 旋转跟手优先；人物移动保留点人→点位置；复杂组合手势不承担必经流程。 |
| Apple 游戏触控指南允许直接触摸游戏元素或虚拟控件；常用触控目标建议至少 44×44 pt，并避开系统边缘、Home 指示条等。 | [Apple HIG: Game controls](https://developer.apple.com/design/human-interface-guidelines/game-controls) | 角色可见尺寸与命中范围分开。网页以约 44–48 CSS px 作为设计起点并实机验证，不把 pt、CSS px 和设备物理像素混为一谈。 |
| OrbitControls 的常见默认是单指轨道旋转、双指缩放和平移，保持 up 方向；阻尼是可选项，启用后需逐帧 update。 | [Three.js: OrbitControls](https://threejs.org/docs/pages/OrbitControls.html) | 当前映射有成熟参照；官方默认不等于已针对本项目调好手感，也不意味着越大阻尼越好。 |
| Pointer Events 的浏览器平移/缩放行为由 touch-action 预先声明；手势开始后临时修改不改变正在进行的手势。取消或抬起会释放 capture。 | [W3C Pointer Events 3](https://www.w3.org/TR/pointerevents3/) | 只在专属场景表面接管手势；可靠处理取消和 capture 丢失，不靠松手回调唯一收尾。 |
| Safari 13 引入 Pointer Events；Safari 18.2 增加 getCoalescedEvents 和 getPredictedEvents。 | [WebKit: Safari 13](https://webkit.org/blog/9674/new-webkit-features-in-safari-13/)、[WebKit: Safari 18.2](https://webkit.org/blog/16301/webkit-features-in-safari-18-2/) | 统一 Pointer Events，按实际方法存在性增强；iOS 版本未知时不假定额外采样 API 必定可用。 |
| R3F 建议快速事件和帧循环使用 ref/直接更新而非 setState；动画运动按 delta 计算，避免随帧率变速。 | [R3F: Performance pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls) | 镜头姿态、拖拽代理与后续行走动画保持单一帧驱动；业务更新不用每帧触发。 |
| R3F 的 invalidate 只安排未来一帧，不立即渲染；同步动画在首帧到来前已推进可能造成可见跳跃。 | [R3F: Scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance) | “输入回调立即更新数值”仍需验证何时绘制。按需渲染的起步时序要单独测，不能用额外延迟循环盲目平滑。 |
| WebKit 提供 viewport-fit=cover 与 safe-area-inset-*；Safari 15.4 支持 svh/lvh/dvh，dvh 随动态视口变化。 | [WebKit: iPhone safe area](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)、[WebKit: Safari 15.4](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/) | 相机手势坐标以 Canvas 实际矩形为准；地址栏、键盘和旋转造成 resize 时保持稳定的手势基准或明确取消。 |
| WebKit 的 prefers-reduced-motion 可由 CSS 或 matchMedia 获取；可保留用户直接控制且可预测的缩放，降低触发不适的自动转场。 | [WebKit: Responsive Design for Motion](https://webkit.org/blog/7551/responsive-design-for-motion/) | 减少自动飞行、旋转和背景动作，不必取消人物选择反馈；手指直接操控仍可用。 |
| WebKit 的帧率 explainer 讨论高刷新显示、页面更新与功耗的区别；它是提案与背景解释，不能作为当前所有 Safari 版本的帧率保证。 | [WebKit: Controlling Animation Frame Rate](https://webkit.github.io/explainers/animation-frame-rate/) | 不承诺 iPhone 有 120Hz 屏幕就有 120fps WebGL；以目标 Safari 实测帧间隔与热机稳定性验收。 |

Apple 指南中的原生触感、系统手势延迟等 API 不等于网页能力；本方案以视觉反馈为必需项，不把原生 Core Haptics 或浏览器震动当作 Safari 已可用能力。

## 手势方案比较（设计判断）

| 方案 | 优点 | 代价 | 本项目建议 |
| --- | --- | --- | --- |
| 单指旋转 | 单手能看人物和场馆；延续现有习惯 | 按下人物时易与拖拽争抢；自由俯仰易迷失 | 保留；固定枢轴、限制俯仰、不要自动改 zoom/中心 |
| 单指平移 | 地图/经营类任务常见，找三块场地直接 | 改变已确认映射；旋转需另一个入口 | 仅对照实验，不作为本轮默认 |
| 双指缩放＋平移 | 指距与重心同时表达大小和位置 | 加第二指、先抬一指时容易突跳 | 保留；按当前姿态重建基准，剩余一指不误点人 |
| 双指扭转＋缩放＋平移 | 自由度高 | 多个自由度互扰，竖屏难区分误差与意图 | 首版不启用；旋转已有单指入口 |
| 点人→点席位 | 准确、可单手、人物运动可自动演绎 | 比直接拖入多一步 | 主路径；目标明确后反馈，业务确认与动画结束分开 |
| 长按后拖拽 | 明确进入“抓人”，减少镜头误触 | 有等待、手指遮挡、容易错过学习提示 | 可选快捷方式；长按只延迟抓人，不延迟空地旋转 |
| 触人立即拖 | 快、直接 | 最容易让想旋转的用户误抓角色 | 只在明确编辑/选中状态尝试；必须有取消 |
| 虚拟摇杆 | 适合持续角色移动与即时动作 | 占屏、精确落位更慢，需要持续按压 | 不用于当前排阵；未来真的加入游玩控制再独立设计 |

## 专门针对旋转不跟手的研究建议

本次主任务已针对实际 `world.ts` 复现一个确定的控制问题：`orbitNavigation` 对累计位移计算的 pitch 做 clamp，调用链仍以起手 pose 为基准，超出俯仰边界的位移被保留，反向时需要先走完这段位移才恢复角度变化。主任务记录的 390×844 示例是向下约 31px 到达 32° 下限，累计到 100px 后反向，回到 50px 仍停在 32°。应先修复为逐样本增量与当前受限姿态一致的基准更新，再测其他假设；这说明代码确有反向空行程，不证明所有 Safari 症状来自它。[计算函数](../../src/modules/venue/world.ts)、[输入处理](../../src/modules/venue/InteractiveVenue.tsx)

以下是实验假设，不是已证实的 Safari 根因。

1. **先看手势归属。** 在空地、人物身体、姓名牌、记分牌、球场热区分别起手，以相同路径滑动；记录是谁消费了 pointerdown、最终进入哪个状态。视觉上看似空地，实际可能命中不可见热区。若镜头只在部分区域不动，优先修仲裁而非改渲染质量。
2. **再看输入到绘制。** 同时记录 pointerId、事件 timestamp、处理时刻、姿态版本、帧读取版本和帧间隔。输入到姿态很快而画面晚更新，需要检查 invalidation/帧顺序/主线程工作。浏览器时间戳只能证明内部阶段，真实触摸到屏幕发光延迟需要外部高速摄影等方法。
3. **检查动作映射。** 比较相同屏幕移动距离是否对应稳定角位移；检查视口高度变化、zoom、方向和俯仰是否意外改变增益；检查水平滑动时垂直抖动是否被放大。稳定线性映射先于加速度曲线。
4. **精确基线先做无惯性。** 首个有效移动立即反馈；手指停，镜头停；松手不产生额外缩放、回中或角度归正。若用户仍觉得停止生硬，再与短促可打断惯性对照。Apple 没有要求惯性时长，也没有给此场景推荐死区阈值。
5. **区分点击容差与镜头起步门槛。** 允许微小移动不取消点击，不意味着镜头必须等到同一门槛才动。若需要人物拖拽识别门槛，越过时按连续轨迹交接，不补算成一次大跳。
6. **保存最后样本。** pointerup 到来前的最后位置必须消费；pointercancel/lostpointercapture 不补交人物落位。抬起只做状态收尾，不悄悄重新取景。

建议先用不渲染复杂模型的同映射小场景作对照。如果简化后相同动作仍不跟手，不能把问题归因于模型；如果仅复杂场景退化，再查 GPU/DOM 投影/材质编译。此对照需同一真机、同一浏览器和同一触控路径。

## 可实施的输入协议建议

- 单一输入仲裁器管理 `idle → pending → orbit / transform / characterDrag`，一次手势只允许一个主拥有者；UI 面板另行接收输入。
- 空地起手后移动可立即旋转；人物起手先候选点选，只有明确拖拽条件成立才抓人。长按候选期间若先产生镜头移动意图，可切镜头，不把所有触人滑动永久吞掉。
- 第二指进入时立即取消人物拖拽预览；将相机当前姿态、两指重心、距离存为新基准。第二指抬起后重新建立基准或等全部松手，不将剩余手指的旧累计位移再应用。
- `touch-action: none` 仅用于拥有自定义手势的场景表面；表单、对话框和滚动容器保留自身交互。不要依赖 pointermove 的 preventDefault 来阻止浏览器平移。
- 使用 pointer capture 保持离开命中区后的同一手势；统一处理 cancel、capture 丢失、失焦、后台和尺寸改变。多指按 pointerId 管理，不把 isPrimary 当作“现在只剩一根手指”。
- 镜头每帧读最新输入；不要同时让两套 controls/lerp 修改同一姿态。若使用 coalesced events，只作可用时增强；不同时重复累计父事件及其合并样本，不用预测点提交业务。

以上协议是产品与工程设计建议；规范只定义事件/捕获行为，不规定本项目的状态机、阈值或具体映射。[W3C Pointer Events 3](https://www.w3.org/TR/pointerevents3/)

## 后续人物动画接口

交互提交的是 `playerId + 合法目标席位 + 起始业务版本`，不是人物最终 3D 坐标。拖拽期间展示代理，松手提交；成功后由新快照驱动人物行走/到位，失败则撤销预览并明确提示。摄像机能持续响应，不能等人物走完；后台恢复可直接落到权威位置，动画结束不能触发保存。该方向延续已有 venue 契约。[venue 模块](../../src/modules/venue/README.md)

未来可将展示分为 selected、preview、pending、moving、settled、rejected。运动路径/朝向/步态是可中断的展示，用户操作和服务器事实为独立层；减少动态效果时用短淡变或直接到位，保留选择圈、目标圈和状态文字。

## 真机验收建议

记录 iPhone 型号、iOS/Safari 版本、是否低电量模式、横竖屏、浏览器地址栏状态和运行时长。至少覆盖慢起步、快速起步、反向微调、手指停留、松手、人物区起手、二指加入/移除、越界、中断与 10–15 分钟热机。横跨静态场景与多人移动动画两种负载。

验收重点是连续性与误操作率：转动期间不缩放、不换枢轴、不跳角；停止后无额外动作；二指切换不瞬移；相机操作不触发排阵；所有人物落位可通过点选完成。稳定 60fps 可作为工程目标，16.7ms 是其一帧时间预算，均非 Safari 保证；进一步记录 P50/P95/P99 帧间隔，不用平均 FPS 掩盖起止卡顿。

研究未接触真实 iPhone，未测当前浏览器帧率和触摸延迟。桌面窄屏及自动指针脚本不能替代真机结论。

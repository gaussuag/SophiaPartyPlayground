# venue Module

公开 Interface：index.tsx 的 Venue 及交互类型。输入 state、view、courtId、selection、slotSelection、placements、editable 和可选 editingMatchId；输出 court／player／slot／place／scoreboard 意图。app/placements.ts 用 competition.decide 生成合法位置，venue 不复制资格规则。

人物与场地使用程序几何体；姓名牌位于页面统一管理的 DOM 中，位置由 Three.js 投影。避免在场景内另建 React DOM root，保证切换／卸载后可从快照重建。

负责 Three.js／R3F 场景、角色、球场、记分牌、拾取热区、镜头和短动画。输入是只读业务视图与本机交互状态，输出是稳定业务身份的操作意图。

- player 根对象与姓名牌绑定 playerId。
- 球场绑定 courtId 和本次查看的 matchId；席位绑定 matchId、sideId、slotId。
- 记分牌打开浮层时固定 matchId；镜头左右不能替代黑白队身份。
- child mesh 的命中需要追溯到实体根对象。
- 人物位置、模型 UUID、动画结束回调都不能作为保存比赛事实的依据。
- 场景可以从任意有效快照重新构建；历史展示不会改变实时角色占用。
- 不直接请求网络、不直接写比赛状态；动画在确认结果后播放且可中断。
- 人物模型与姓名牌均可点选／拖拽；位置是实际场内热区，近景扩大球场。点选、键盘和拖拽具有相同业务身份。
- 拖拽保留起手 revision／generation，半透明代理只是预览；松手发送 place 意图，取消或场外松手不提交。
- 全屏按需渲染；竖屏总览纵向布场，短屏压缩场间距；近景和人物移动支持减少动态效果偏好。
- InteractiveVenue 管理拾取／手势和 DOM，Scene 管理几何、镜头、投影和短动画。WebGL 监听随 Canvas 清理，重建不改变 session 或记录。
- 单指镜头旋转未开放；实际 iPhone 触控、拖拽、键盘和持续性能仍待实机验证。

资源见 [public](../../../public/README.md)；详细依据见 [交互](../../../docs/product/interaction-and-state.md)与[性能预算](../../../docs/architecture/overview.md)。


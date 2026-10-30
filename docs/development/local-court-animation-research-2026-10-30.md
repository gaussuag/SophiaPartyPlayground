# 本机场上演出与候场动作研究

2026-10-30，基线 `29550f4`。以下区分官方事实与项目设计推论；不代表已实现或已实机验收。

## 官方依据

- R3F `demand` 在需要时渲染；`invalidate()` 只申请下一帧，多次调用会合并；`useFrame` 随卸载注销。[按需渲染](https://r3f.docs.pmnd.rs/advanced/scaling-performance)、[Hooks](https://r3f.docs.pmnd.rs/api/hooks)。
- 高频动作宜在 `useFrame` 中按 delta 修改引用，避免逐帧 setState；复用几何和材质。[性能注意](https://r3f.docs.pmnd.rs/advanced/pitfalls)。移除 mesh 不会自动释放原生 Three.js 资源；R3F 管理其对象生命周期，共享资产要明确处置归属。[Three.js](https://threejs.org/manual/pages/how-to-dispose-of-objects.html)、[R3F disposal](https://r3f.docs.pmnd.rs/api/objects#disposal)。
- Page Visibility 可识别后台；CSS 隐藏区域／iframe 不触发该事件，后台 rAF 和定时器也可能受限。[MDN](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)。
- Pointer capture 让同一指针继续投递给指定元素，up／cancel 可释放；它不冻结对象坐标。[MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events#capturing_the_pointer)。
- 系统减少动态效果可通过媒体查询检测。[MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)。自动持续超过五秒、与其他内容并行且非必要的动态应有暂停机制。[W3C 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)。

## 项目设计推论

1. 用确认阵容生成纯展示计划：无对手仅就绪；1v1／1v2 共一球，2v2 热身两球；PLAYING 一球轮流接击。真实单打只用两名实际选手。按场次、phase、阵容及恢复代次建身份，阵容或状态变化立即替换旧计划；无关 revision 不必重播。球数与玩家名单不依赖动画完成回调。
2. 演出由一个本机时钟采样人物偏移、挥拍和球轨迹，同帧合成到上下场运动；避免多个循环争写 root.position。球采用有界实例，复用静态资源，状态变化清空旧引用。不得调用 session.dispatch、增加轮询或保存动画坐标。
3. 场下集合从当前真实占位推导；每人独立随机节奏，在自有候场小区域内短走、停留、伸展和看球。上场即移出该集合，保持同一 playerId 对象。按下时冻结当前可见根对象及姓名锚点，直到 up／cancel，不能先跳回起点。现有 isWalking 会阻止选人，装饰游走须与上下场行走区分。
4. 显式用“球馆视图可见＋页面前台＋未暂停”启停演出，不能只检查 document.hidden。返回时按最新阵容恢复并重置本机时间差，避免追赶后台帧；减少动态效果保留静态就绪姿态。可复用更多菜单提供本机暂停，不改变赛事流程。
5. 当前 [project](../../src/modules/competition/index.ts) 的 completed 统计 COMPLETED，故 0/3 应说明“赛果已录 0/3 场”，不能称阵容确认进度。[赛程](../../app/ScheduleAndRecords.tsx) 的 OPEN 轮文案可改“当前轮”；准备／准备完成／比赛中统一，下一步按已有角色权限显示。

6. 丰富表现可用出手、越网、接球的分段弧线，按同一节拍触发预备、碎步、腰肩转动与挥拍；三人轮换接球而非三人同步摆手。上下场运动优先于装饰偏移；未确认但已预测上场者也暂停场下游走，不能另画一份。候场范围须留出姓名与操作牌的投影空隙。

## 建议验收

覆盖 0～4 人、1v2、换人／移除／开赛／恢复的球数和身份；检查候场区域、按下冻结、两客户端数据相同而节奏可异、网络请求不增加；反复开关赛程／前后台后无叠加循环或旧球。浏览器检查与实际 iPhone 分别记录。

# 横向三场地与席位选人研究

2026-10-30，基于 `3d00ab6`。以下官方事实与本项目设计推论分开；本文不代表实现或实机验收已完成。

## 官方依据

- Apple 建议触控游戏允许直接操作游戏对象，减少盖在内容上的虚拟控件；按钮需考虑拇指与安全区域。[Game controls](https://developer.apple.com/design/human-interface-guidelines/game-controls)。WWDC24 建议 iPhone／iPad 默认触区 44×44 **pt**，内容溢出优先滚动，不以缩小字与按钮解决。[视频及文字稿](https://developer.apple.com/videos/play/wwdc2024/10085/)
- Web 的 WCAG 2.2 AA 最小触区为 24×24 **CSS px**，另有间隔等例外；44×44 CSS px 属更高等级目标，不能与 Apple 的 pt 混为同一单位。WCAG 2.5.7（AA）要求拖拽具有非拖拽替代途径；2.3.3（AAA）规定交互触发的非必要动态应可禁用。[规范 2.5.8／2.5.7／2.3.3](https://www.w3.org/TR/WCAG22/)
- W3C 建议在指针抬起／click 时完成激活，允许用户在松手前移开取消，减少误触；click 也能由触摸和键盘触发。[Pointer Cancellation](https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html)
- 正交相机中对象大小不随相机距离改变；修改相机参数后需更新投影矩阵。[Three.js OrthographicCamera](https://threejs.org/docs/pages/OrthographicCamera.html)。R3F 的 demand 模式在需要时渲染，`invalidate` 申请下一帧；动画宜在 `useFrame` 内按 delta 更新引用，避免每帧 setState。[按需渲染](https://r3f.docs.pmnd.rs/advanced/scaling-performance)、[性能注意](https://r3f.docs.pmnd.rs/advanced/pitfalls)
- `prefers-reduced-motion` 可检测系统减少非必要动态偏好。[MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)

## 本项目设计推论

1. 横向并排是用户选择，不是某份指南规定。所有视口共用横向三场地坐标；竖屏全景按投影边界取景，近景仍缩放同一世界。记分牌、姓名与选人按钮保留可读尺寸，避免把整个 UI 随世界缩小。窄屏最重要的取舍是全景可看全、操作可拉近；不要用横屏锁定替代竖屏体验。
2. 点空席位打开贴近底部的候选面板，以头像＋姓名直接点选，成功发起安排后自动关闭。头像共享场景外观配置，可用 SVG／CSS，无需为每人新增 WebGL Canvas。用现有 `placementTargets`／`decide` 得出候选，提交前再次核对 revision／generation；队伍、性别、占用及整轮可行性仍由同一规则决定。
3. 场内可选人物同步呈现亮环、简短举手或轻跃，姓名加明确描边；减少动态效果时只保留静态标记。只在候选面板打开时持续或有限提示，关闭、选人、后台时停止并释放按需渲染，避免让十四人永久蹦跳。
4. “不可安排／正在保存”不等于“请求查看详情”。人物模型和姓名点击不再自动转为资料弹窗；同步与走动期间忽略不适用动作，显式资料按钮独立。候选使用原生 button、可访问姓名、可见焦点和至少 44 CSS px 的项目触区；支持取消、Escape、键盘激活，面板内滚动不串成相机手势。

## 建议验收

核对 320×568、390×844、横屏及桌面全景／近景的三场地稳定、牌子与触区留白；覆盖动作中再点人不弹详情、先点席位再选头像、候选人数随规则变化、保存失败／版本冲突、面板关闭后动画停下及减少动态效果。浏览器视口验证不能替代 iPhone Safari 实机。

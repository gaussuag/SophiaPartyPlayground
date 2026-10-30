# 排阵即时动画与权威同步研究

2026-10-30。基于 `fc8930c` 的 session／records 契约研究；下列“设计推论”是本项目建议，不代表已经实现或验收。

## 官方依据

- React `useOptimistic` 让临时 UI 在请求期间立即呈现，最终与实际状态收敛；reducer 可基于新收到的数据重新计算预测。[React 官方说明](https://react.dev/reference/react/useOptimistic)。当前官网标为 19.3，仓库使用 19.2.6；本次借鉴原则，不直接照搬新版 API。
- TanStack Query 区分“只改 UI”和“直接改缓存”两种乐观更新；前者可从待提交变量显示临时结果，后者需要处理回滚与重新读取。[TanStack 官方指南](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)。
- Firestore 的延迟补偿在后端确认前通知本地监听者，并用 `hasPendingWrites` 区分本地待保存与服务端确认。[Firebase 官方说明](https://firebase.google.com/docs/firestore/query-data/listen#events-local-changes)。这是可借鉴的表现与状态区分方式，不说明 D1 自动具有此能力。
- 超时只表示客户端停止等待，远端副作用仍可能发生；有副作用的重试需要幂等设计。[Amazon Builders Library](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)。

## 本项目设计推论

1. 采用 UI 投影：本机合法的准备期上场、下场、换场与替换立即产生人物目标位置，保存同时开始。只影响发起页面的排阵表现；正式快照、IndexedDB 确认缓存、开赛、比分和轮次仍由服务端决定。沿用 [session](../../src/modules/session/README.md)、[records](../../src/modules/records/README.md) 与现有动画模块，无需增加 Query／Firebase 依赖。
2. 预测记录固定原命令、revision、generation、来源与目的席位；在最新权威数据上投影，保留其他客户端的无关更新。轮次、阶段、恢复代次或相关占位改变时，预测不可掩盖新事实。确认成功后目标不变，避免重复行走；确定拒绝或冲突后，从人物当前位置平滑返回最新权威位置，不能还原整份旧快照。
3. 首次发送前持久化原 commandId，最多一个修改请求在途。断线／超时保留“待确认”，先查原回执；回执未找到本身不足以证明失败。结合最新 revision／generation 与服务端结果再决定收敛或更正。需要重试时使用原编号及原请求；已确认冲突不自动换版本重放。不能仅因下一次轮询仍看到旧阵容就回档。[现有同步契约](../architecture/data-and-sync.md#同步与断线策略)
4. 保存反馈应轻量而真实：人物立即走动，状态仍标明待保存；不得用预测宣称“已同步”，也不允许预测解锁开赛或多人占用约束。

## 建议验收

覆盖延迟成功时动画先开始、确定拒绝后平滑纠正、已经提交但响应丢失、尚未提交且原编号重试、多客户端占位冲突、切轮／恢复与旧响应乱序。检查回执只有一次、确认缓存没有预测阵容、管理权限及比赛事实不受本机动画影响。

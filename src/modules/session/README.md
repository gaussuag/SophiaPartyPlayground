# session Module

公开 Interface：index.ts 的 connect 返回 getView、dispatch、subscribe、dispose，以及显式刷新／原编号重试、比分草稿及管理员恢复操作。cache.ts 是内部 IndexedDB 实现。

负责客户端共享状态、本机比分草稿、轮询与重连、命令回执核对，向页面提供 synced／saving／offline／conflict／unknown-outcome 等可解释状态。

- 只接受服务器确认的快照作为共享事实；拒绝乱序旧响应。
- `state` 始终是确认快照。独立的 `arrangement` 仅供发起者本机人物表现：合法的上场、下场、移动、替换和取消草稿立即预测；不改变 revision、确认缓存、开赛条件、比分或权限。`ArrangementPrediction` 用真实 competition 校验，在最新快照上只覆盖仍匹配原来源的准备席位，保留他人的无关更新。
- dispatch 在第一次 await 前建立预测和写入锁；命令编号持久化完成才发送网络。不能在持久化间隙重复提交；存储失败不发送并纠正人物位置。
- 成功响应与预测交接时目标不变。明确拒绝、占位冲突、切轮或恢复时回到最新权威目标；未知结果保留预测与原编号。回执先于快照可见时等待读到 appliedRevision，不能先清预测造成误回档。刷新可从匹配原版本的缓存与 pending 重建预测，不自动补发。
- 比分草稿绑定 eventId、matchId 和 lineupRevisionId，与正式赛果分开。
- 首次发送前保存命令标识，超时后先核对回执。
- 冲突不自动换版本重放；断线不宣称正式修改成功。
- 后台暂停轮询、回来立即刷新；查看历史不改变全员当前轮。
- 可调用 competition 的纯投影；不重新实现规则，不直接导入 D1 或 server-only records。
- dispatch 按共享的 canExecute(role, command.type) 预检协作／管理权限；服务端仍独立授权。匿名与普通参与者的合法排阵／录分经过同样的 pending、回执、冲突及恢复路径。
- 打开录分不 dispatch 结束声明；本机草稿可关闭／刷新恢复，正式确认时直接 SubmitResult。其他人先提交后，旧草稿需重新核对，不能把首次录分隐式变为历史更正。

依据：[数据与同步](../../../docs/architecture/data-and-sync.md)、[验证清单](../../../docs/delivery/validation-and-release.md)。


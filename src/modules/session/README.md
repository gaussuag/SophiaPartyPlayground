# session Module

公开 Interface：index.ts 的 connect 返回 getView、dispatch、subscribe、dispose，以及显式刷新／原编号重试、比分草稿及管理员恢复操作。cache.ts 是内部 IndexedDB 实现。

负责客户端共享状态、本机比分草稿、轮询与重连、命令回执核对，向页面提供 synced／saving／offline／conflict／unknown-outcome 等可解释状态。

- 只接受服务器确认的快照作为共享事实；拒绝乱序旧响应。
- 比分草稿绑定 eventId、matchId 和 lineupRevisionId，与正式赛果分开。
- 首次发送前保存命令标识，超时后先核对回执。
- 冲突不自动换版本重放；断线不宣称正式修改成功。
- 后台暂停轮询、回来立即刷新；查看历史不改变全员当前轮。
- 可调用 competition 的纯投影；不重新实现规则，不直接导入 D1 或 server-only records。

依据：[数据与同步](../../../docs/architecture/data-and-sync.md)、[验证清单](../../../docs/delivery/validation-and-release.md)。


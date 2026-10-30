# competition Module

公开 Interface：index.ts 的 decide(snapshot, command, context)、project(snapshot, viewContext)，另提供显式初始化 createEvent 和备份校验 verifySnapshot。类型见 model.ts。

隐藏阵容规则、全轮可行性、选手占用、比赛／轮次转换、比分判胜及纠错。输入时间、身份与所需 ID 由调用方传入；返回新快照或结构化拒绝原因，不修改输入，不产生网络／存储副作用。

内部文件可随实现拆分为 model、commands、lineup、lifecycle、results 等；先保持一个公开入口，不强制创建空文件。具体拆分依据真实复杂度，不按字段数量造模块。

测试从公开 Interface 观察状态与错误，不依赖内部函数名字。客户端可用同一模块做即时反馈，服务端始终重新执行完整校验。

2026-10-30：MovePlayer 在一条决定中验证并转移未确认草稿；确认开赛后锁定源与目的。打开录分不结束比赛，SubmitResult 从 PLAYING 原子保存赛果和结束时刻；旧 AWAITING_RESULT 可继续提交。project 提供 roundLabel 与等待确认事实，三场齐备不会自动关闭轮次。人物是否留场是场景对该轮阵容的投影，不能释放同轮参赛资格。账号权限在 records 再校验，不由几何或 competition 预览授予。

依据：[规则](../../../docs/product/requirements.md)、[状态机](../../../docs/product/interaction-and-state.md)、[数据契约](../../../docs/architecture/data-and-sync.md)。


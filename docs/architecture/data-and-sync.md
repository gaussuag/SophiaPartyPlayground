# 数据模型、共享保存与恢复

规则依据：[requirements.md](../product/requirements.md)。状态转换依据：[interaction-and-state.md](../product/interaction-and-state.md)。

## 身份与种子数据

[data/event-template.json](../../data/event-template.json) 是模板，不是运行中的数据库。

- templateId 与实际 eventId 分开；本地测试活动和生产活动使用不同 eventId。
- playerId 在单活动内稳定，对外身份使用 eventId + playerId；不以姓名或模型 UUID 作主键。
- courtId 表示真实球场，matchId 表示某轮该场的一场比赛，二者不可互换。
- roundId、matchId、playerId 在恢复、导出及更正后保持不变。
- 初始化创建空草稿、空确认阵容、空赛果；不预设任何人上哪一场。
- 正常启动只读数据库，不重复播种；初始化是显式、幂等的管理操作。
- 备份恢复按原 eventId 恢复，并明确其目标；另开活动应从模板新建，不把同一场真实活动伪装成另一个 eventId。

## 逻辑模型

| 对象 | 关键字段 | 不变量 |
| --- | --- | --- |
| Event | id、schemaVersion、revision、generation、phase、activeRoundId、date、timeZone、ruleVersion | 同一活动一个权威版本；最多一个开放轮次；恢复时 generation 递增 |
| Team | id、name | 白、黑两队身份固定 |
| Player | id、name、gender、teamId、rawValue、avatarKey | 原始资料按名单保存，rawValue 不参与规则 |
| Court | id、number | 三个实体场地 |
| Round | id、number、plannedStart、plannedEnd、phase、openedAt、closedAt | 第七轮只有两场正式比赛 |
| Match | id、roundId、courtId、type、phase、draftSlots、activeLineupRevisionId、activeResultRevisionId、startedAt、endDeclaredAt | roundId + courtId 在活动内唯一；时间变更留审计 |
| DraftSlot | sideId、slotId、playerId 或 null | 每席一人；按类型验证队伍和性别 |
| LineupRevision | id、matchId、participants、confirmedAt、supersedes、reason | 参与者包含 playerId、姓名／队伍／性别快照；旧版本不改写 |
| ResultRevision | id、matchId、lineupRevisionId、whiteScore、blackScore、winnerTeamId、submittedAt、actorId、supersedes、reason | 非负整数、不相等；胜方对应较高比分；引用确认阵容版本 |
| AuditEntry | commandId、actorId、type、recordedAt、changedIds、reason | 记录操作及有关版本，不存每次完整快照 |
| CommandReceipt | commandId、actorId、requestHash、appliedRevision、resultRefs | 同 ID 同请求只执行一次，同 ID 不同内容拒绝 |
| LocalScoreDraft | eventId、matchId、lineupRevisionId、resultRevisionId、generation、whiteInput、blackInput、updatedAt | 仅本机；字符串允许临时空白；更正草稿绑定原赛果，恢复或版本变化后明确复核 |

Player 与操作账号不是同一对象。选择 Sophia 上场不能意味着当前操作者就是 Sophia。

比赛侧使用稳定 WHITE／BLACK 语义，与镜头左右无关。每场结果必须显式引用阵容版本；更正实际名单时，如果已有赛果，要在同次提交建立对应的新赛果版本，防止比分仍指向旧阵容。

startedAt 和 endDeclaredAt 记录网页确认时刻，不能冒充设备精确测得的真实第一球／最后一球时刻。计划时间不参加状态推进。

## 派生数据

草稿占位、PLAYING 在场占用、本轮参赛资格、各轮完成数、可选角色、场景位置和胜负显示从活动快照推导。不要持久化独立的 isBusy、canStart、isRoundComplete 等可互相矛盾的字段。

当前有效阵容决定占位和参赛事实；旧版本只供审计。正常结束不会取消本轮参赛事实；误开赛撤销会失效该次事实并恢复草稿。

活动总成绩尚未定义；可以查看各场原始比分和获胜方，但不能默认累计得分、累计胜场或按比赛类型加权来决定总冠军。

## 第一版物理存储：单活动聚合

推荐 D1 的 events 表包含：

~~~text
event_id        TEXT PRIMARY KEY
schema_version  INTEGER NOT NULL
revision        INTEGER NOT NULL
snapshot_json   TEXT NOT NULL
updated_at      TEXT NOT NULL
~~~

snapshot_json 包含该活动的业务记录、阵容／赛果版本、审计与已应用命令回执。整场只有 14 人、20 场，先接受活动级版本冲突，换取简单可靠的跨场校验及原子保存。操作审计记录差异与引用，不在每条日志复制全量快照。

通过一个条件 UPDATE 同时保存新业务状态、审计和回执：

~~~sql
UPDATE events
SET snapshot_json = ?, revision = revision + 1, updated_at = ?
WHERE event_id = ? AND revision = ?;
~~~

参数绑定，检测实际受影响行数是否为 1。读取、纯业务计算和 UPDATE 之间允许并发，但旧版本计算结果不能覆盖更新后的记录。命令不得通过“先改一场，再单独写占位和日志”分步提交。

全活动竞争会让两个互不相关场次的同时操作也发生版本冲突；对于当前规模是可接受取舍。先测试实际冲突率，再决定是否细化，不提前引入分布式锁。记录大小也需在完整演练中测量，不能无限追加完整快照。

schema 与 SQL 迁移由 db/ 和 starter 工具管理；种子名单及实际数据不放在 schema migration 中。未来若拆为多张表，必须重新证明业务更新、占用与幂等回执的事务一致性。D1 多语句 batch 有事务语义，但条件 UPDATE 的“0 行变化”不应被当作会自动导致回滚的数据库异常。[D1 数据库接口](https://developers.cloudflare.com/d1/worker-api/d1-database/)

## 命令协议与执行

设计中的 envelope：

~~~typescript
type CommandEnvelope = {
  eventId: string;
  commandId: string;
  expectedRevision: number;
  expectedGeneration: number;
  command: CompetitionCommand;
};
~~~

CompetitionCommand 包括：StartWarmup、OpenFirstRound、AssignPlayer、RemovePlayer、ReplacePlayer、CancelDraft、StartMatch、UndoStart、BeginResultEntry、UndoEndDeclaration、SubmitResult、CorrectResult、WithdrawCurrentResult、CorrectRecordedLineup、AdvanceRound、FinishEvent。

这些是设计契约，不代表已经存在 TypeScript 实现。每个命令携带自己的明确 matchId／slotId 等目标；不能在处理阶段临时根据“当前画面”猜测归属。

执行顺序：

1. 解析请求并通过可信服务端身份检查权限；actorId 不从客户端请求体采信。
2. 读取权威快照，先查 commandId：相同账号与相同请求指纹已提交则返回原回执，不重复执行。
3. 核对 expectedRevision；不匹配返回 REVISION_CONFLICT。
4. competition.decide 执行完整业务校验，包括当前阶段、阵容、占用、整轮可行性。
5. 在内存中构造新快照，加入审计和成功回执，以旧 revision 做条件 UPDATE。
6. UPDATE 成功才返回“已同步”及新版本；0 行更新时重读回执，以区分同一命令已成功和其他操作冲突。
7. 读取无法确认结果时返回未知／可重试状态，不猜测提交成功或失败。

查询与提交不经过可造成陈旧活动视图的公共 CDN 缓存。第一版选择主库一致读取；若日后启用副本读取，需要使用会话书签保持读到自己的写入，并验证不会读回旧版本。[D1 一致性说明](https://developers.cloudflare.com/d1/best-practices/read-replication/)

## 同步与断线策略

- 首次读取服务端活动快照及 revision；前台约每 2 秒条件读取新版本，目标是正常网络下其他设备约 3 秒内看到更新，需实测。
- 使用 ETag／revision 避免重复发送未变化快照；同一客户端只保留一个轮询请求在途。
- 返回前台立即刷新；后台暂停轮询与渲染，不依靠后台定时器维持正确性。
- 成功命令响应可直接更新提交设备；其他设备在下一次同步时更新。
- 响应乱序时只接受更新或相同 revision。不能因较早请求晚返回而退回旧阵容。
- 断线显示“离线，显示最后同步记录”，注明时间；可以继续编辑本机比分草稿，不允许离线确认排阵／开赛／赛果。
- 超时后的命令进入“确认提交结果中”；保留原 commandId 和 payload，联网后先查询回执。
- 同 ID 重发只用于解析未明提交结果，不能自动重放已经确认冲突的命令。
- 若阵容版本改变而本机还有比分草稿，保留内容但要求重新查看绑定，不静默把草稿提交到新阵容。
- 不实现多设备离线队列自动合并，也不将本地缓存显示成“已同步”。

建议 HTTP 路由形状由 app 层装配：GET 活动快照、POST 活动命令、GET 指定命令回执、GET 管理者备份。实际路径随 starter 确定；服务器公开的是投影视图，不把内部回执、管理身份或配置直接全量发给游客。

## 权限与发布访问

已确认的是所有参赛者可访问、记录同步；未确认所有人都能修改。默认实现建议：viewer 可查看当前与历史；operator 可操作；管理操作如恢复备份仅更高权限者可执行。

所有写入服务端校验权限，登录本身不自动授予编辑权。复用 Sites 的受信任身份入口；本地模拟身份只在开发环境存在，生产构建必须禁用。浏览器自报 headers、role、playerId 都不能直接成为操作授权。

发布时配置能覆盖参赛者的 Sites 访问方式，并以非创建者设备验证。网页可公开访问时，不开放匿名写入；是否采用公开链接或受控访问属于最后的发布配置。

## 备份、恢复与迁移

- 管理者导出带 eventId、schemaVersion、revision、完整业务记录及审计的 JSON；CSV 仅用于赛果阅读，不作为完整恢复源。
- 下载时带上快照版本与时间，避免把旧缓存当作最新服务端备份。
- 恢复先校验版本、名单身份、场次数量、引用和业务不变量，再在暂停写入的维护窗口执行。
- 恢复是受授权的管理操作，保存恢复前备份，以当前服务端 revision 条件提交；恢复后 revision 仍递增，不能倒退到备份 revision。
- 旧备份之后已确认的命令不得被客户端自动补发；恢复后将旧客户端置为需要重新载入并重新确认，不把新历史与旧会话混合。
- 生产活动初始化幂等且不会在部署后重复执行，schema 迁移也不能清空赛果。
- 本地测试数据库、演练活动、生产活动严格区分。开发和集成测试只操作本地数据库。

已实现细节：snapshot_json 保存 state、receipts 和可选的 beforeRestore；最近一次恢复前记录不递归嵌套。恢复保留旧命令编号，将原回执标为 SUPERSEDED_BY_RESTORE；新命令需匹配新的 generation。IndexedDB 另存最后同步时间，离线刷新仍可注明缓存时刻。原备份恢复到相同 eventId，服务端 revision 始终递增。

本地 D1 支持通过 Wrangler 在本机运行并与远端数据分离；实际命令遵守当前 Sites starter 配置，不擅自连接远端测试。[D1 本地开发](https://developers.cloudflare.com/d1/best-practices/local-development/)


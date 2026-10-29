# 项目入口

在现有应用上续做。新 thread 先检查工作区与暂存区，再读 [README 当前交付状态](README.md#当前交付状态) 和 [实施计划](docs/delivery/implementation-plan.md)，确认本次范围；旧启动 prompt 中“尚未初始化”是历史状态。

按任务取资料，不要求每次通读全部文档：

| 任务 | 入口 |
| --- | --- |
| 规则、排阵、状态或纠错 | [需求](docs/product/requirements.md)、[交互与状态](docs/product/interaction-and-state.md)、[术语](CONTEXT.md) |
| 模块拆分、接口或数据归属 | [架构](docs/architecture/overview.md)、相应 `src/modules/*/README.md` |
| 保存、权限、并发、恢复 | [数据与同步](docs/architecture/data-and-sync.md)、[records](src/modules/records/README.md)、[session](src/modules/session/README.md) |
| 场景、人物、触控或界面 | [最新界面准则](docs/product/requirements.md#用户补充的界面准则2026-10-29)、[venue](src/modules/venue/README.md)、[界面验证](docs/delivery/ui-game-first-2026-10-29.md) |
| 本地运行、故障或与其他 thread 并行 | 先读 [工作流程](docs/development/agent-workflow.md)；并行任务采用独立 worktree 与文件范围 |
| 增加或选择检查 | [测试入口](tests/README.md)、`package.json` scripts、[CI](.github/workflows/ci.yml) |
| 评审改动 | [CODING_STANDARDS.md](CODING_STANDARDS.md) |
| 验收或发布 | [验证与发布](docs/delivery/validation-and-release.md)；P1–P6 只做本地，按 P7 条件再发布 |
| 追溯早期方案为何改变 | [复盘与原始 thread](docs/development/retrospective-2026-10-29.md) |

名单与赛程以 [原始模板](data/event-template.json) 为准；业务确认以需求文档及用户后续确认为准。实现建议、旧聊天设想和桌面预览结果分别处理。

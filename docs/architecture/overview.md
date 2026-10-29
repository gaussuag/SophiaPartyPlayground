# 架构与模块 Interface

依据：[业务规则](../product/requirements.md)、[数据与同步](data-and-sync.md)。技术选择是本次设计建议，开发中可以基于实测调整，但不能改变已确认业务规则。

## 技术选择

- React + TypeScript：组织二维界面、客户端状态和共享业务类型。
- Three.js + React Three Fiber：角色、球馆、拾取、镜头与动画；Canvas 只在客户端加载。
- Sites 的 Vinext 全栈 starter：承载页面与服务端 HTTP 路由，保留其 Vite／Sites 构建集成。
- Cloudflare Workers + Sites D1：运行服务端业务提交，持久化全员共享记录。
- IndexedDB：只保存本机比分草稿、最后已知快照和未取得回执的命令标识。
- 前台条件轮询：第一版约每 2 秒获取活动新版本，后台暂停，恢复前台立即同步。
- 本地 D1 与托管 D1 使用相同存储模型；本地多浏览器测试共享一个本地服务端。

这是对早期“纯 Vite 静态站 + 本机权威数据”建议的更新。共享记录需要服务端；不要把不同手机上的 localStorage／IndexedDB 当成同步机制。

已核对当前 Sites 全栈 starter：它支持本地开发与 D1，生产运行在 Workers。轻量 Worker ESM starter 的资源打包约束不适合本项目的角色模型和贴图；优先使用 Vinext starter。版本在初始化时按兼容组合锁定，避免单独追逐每个包的最新版本。

## 模块划分

采用 codebase-design 的 Module、Interface、Implementation、Seam、Adapter 词汇。每个 Module 对调用者公开一个小型 Interface；内部可有多个函数和文件。Interface 包括不变量、错误、先后关系与运行环境，不只是 TypeScript 声明。

| Module | 公开 Interface（设计形状） | 隐藏的 Implementation | 不承担 |
| --- | --- | --- | --- |
| competition | decide(snapshot, command, context)、project(snapshot, viewContext) | 全部业务约束、状态转换、阵容可行性、胜负、更正及选手状态推导 | 网络、数据库、浏览器、Three.js |
| records | readEvent(context)、execute(context, envelope)、readReceipt(context, commandId)、exportEvent(context) | 授权、读取权威状态、调用 decide、条件写入、幂等回执、数据迁移兼容 | 镜头、动画、本机输入草稿 |
| session | connect(eventId)、getView()、dispatch(command)、subscribe(listener)、dispose() | 请求、版本比较、轮询、重连、回执核对、本机草稿和同步状态 | 重新实现业务规则、直接写数据库 |
| venue | Venue(view, interaction, onIntent) | 对象身份绑定、拾取热区、镜头、资源、人物位置和短动画 | 业务判定、网络请求、提交成功判断 |

app 负责页面、浮层、路由装配。db 是 records 内部使用的具体 D1 存储实现位置，不新增一个只有转发功能的业务 Module。

competition 可在客户端用于即时解释不可选原因，但 records 必须在服务端使用最新快照重新执行相同规则。浏览器检查从来不是提交授权。

~~~mermaid
flowchart TD
    UI["app：页面与浮层"] --> Session["session"]
    UI --> Venue["venue"]
    Venue -->|角色／场地意图| UI
    Session -->|HTTP 命令与版本| Routes["app：服务端路由"]
    Routes --> Records["records"]
    Records --> Competition["competition"]
    Records --> DB["db：D1"]
    Session -->|共享纯投影| Competition
    Session -->|已确认视图| UI
~~~

服务端 records、db 和身份解析只允许被服务端导入，不能经由公共 barrel 文件进入客户端包。venue 不直接引用 records 或 D1。

## Interface 契约

### competition

- 输入是完整、已解析的活动快照与明确命令；时间、操作身份和所需 ID 由 context 传入。
- 成功返回新快照及本次变更描述；失败返回稳定错误码和可展示的约束原因。
- 不修改传入对象，不读时钟／浏览器存储，不发送网络请求，不播放动画。
- 当前场次合法性、跨场占用、同轮资格、剩余阵容可行性和纠错资格都集中于此。
- project 产生当前／历史查看需要的只读视图，不复制出第二份可写业务状态。

### records

- 只有它可以将比赛状态确认为共享事实。
- 从受信任的服务端身份解析结果确认写权限，不接受请求体自报的 role 或 actorId。
- envelope 包含 commandId、expectedRevision 和 command；不接受客户端提交整份新快照。
- 必须先查幂等回执再判版本冲突，支持成功响应丢失后的安全查询与重试。
- 成功意味着已提交到 D1；失败或冲突时不得留下部分席位、部分比分或伪成功回执。
- 身份认证、业务拒绝、版本冲突、存储失败采用可区分错误类型。
- 具体原子写入设计见 data-and-sync.md，不能仅使用单个 Worker 实例的内存锁。

### session

- 页面始终知道 synced / saving / offline / conflict / unknown-outcome 状态。
- commandId 在首次发送前保存；超时不等于失败，也不等于成功。
- 刷新或重连先查回执和最新快照，再决定展示结果；不盲目补发不同 ID 的同一操作。
- 冲突命令不自动改为新版本重试；使用者需要看到变化并重新确认。
- 已知版本号只增不减，丢弃乱序旧响应。历史操作回执不能让视图退回旧版本。
- 本地比分草稿与服务端赛果分开；草稿绑定 matchId 和 lineupRevisionId。

### venue

- 输入只读视图与本机交互状态；输出带稳定业务 ID 的意图。
- 人物点选无论命中哪个子模型，最终解析到 playerId。
- 镜头／场景变换不会改变比赛侧身份，场地解析使用明确 matchId。
- 完全可从快照重建；无需恢复上次动画播放进度。
- 模型加载失败、WebGL 上下文丢失和动画跳过不修改比赛记录。

## 深度与 Seam 的取舍

- 把资格、状态转换和全轮可行性集中到 competition，避免三块场地、录分浮层和服务器各写一套校验。
- 把授权、并发和幂等集中到 records，避免每个路由分别拼接保存步骤。
- session 隐藏网络不确定性，使 venue 和浮层只消费可解释的视图。
- venue 隐藏 3D 命中与表现细节，业务只接收稳定身份的操作。
- 先使用具体 D1 实现与真实本地 D1 测试，不为假想的多数据库创建通用 Repository、插件注册器或空转发层。
- 只有出现真实第二种存储／传输实现时，再提取对应 Seam，并用实际 Adapter 验证 Interface。测试替身不是生产存储语义正确的证据。

## 手机性能与可访问操作

初始预算为设计目标，尚未实测：动画阶段稳定 30 FPS；约 10 万三角形、100 次 draw call 以内；必要资源压缩后争取不超过 5 MB；DPR 先设 1–1.5。共享几何与材质、短动画和按需渲染优先，避免实时复杂阴影、持续庆祝和十四人不断循环动作。

Three.js 当前 WebGLRenderer 使用 WebGL 2；启动检测能力并用目标手机验收。R3F 支持按需渲染，但动画和镜头更新期间仍需正确请求后续帧。[Three.js](https://threejs.org/docs/pages/WebGLRenderer.html)、[R3F](https://r3f.docs.pmnd.rs/advanced/scaling-performance)

提供清晰的 DOM 姓名牌和按钮、合理热区、数字键盘适配与显式保存反馈。WebGL 恢复期间保留已有比分草稿；必要时仍允许通过已绑定场次的二维记分浮层完成记录。普通选人流程保持围绕虚拟角色。

## 开发与发布环境

本地先初始化 Sites 全栈 starter，保留本仓库文档和模板，并使用 local-only 流程；本阶段不调用 create_site。正式 Site 注册、托管资源配置和发布在本地验收之后。

遵守 starter 的 app/、db/、worker/、scripts/ 和构建约定；业务实现位于 src/modules/，不为了迁就目录图破坏 starter。当前目录仅放说明，没有生成假的 package.json、锁文件或托管项目 ID。

Sites 访问策略和应用写权限分开：最终明确使用 public，任何匿名访客都可打开；登录成功不自动成为管理者。复用 Sites 官方身份，以本站稳定 ID 的服务端名单授权，不自建另一套 OAuth。正式名称为 Sophia Sunshine Cup，具体流程见 [发布准备](../delivery/p6-p7-release-preparation-2026-10-29.md)。

参考：[D1 本地开发](https://developers.cloudflare.com/d1/best-practices/local-development/)。Sites 的具体接入和发布步骤以开发环境当前安装的 Sites skill 及其 storage、identity-and-secrets、vinext-starter 文档为准。


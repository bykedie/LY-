# LY 控制台当前架构

> 权威范围：当前代码结构、API、运行时通信、配置和部署数据保护。
> 当前状态请读 `docs/current-status.md`；长期决策请读 `docs/decisions.md`；历史需求和故障请读 `docs/conversation-handoff.md`。

## 一、系统边界

当前稳定架构基线为 `v1.0.40`（提交 `87be1a8`），由三层组成：

```text
浏览器静态层：public/*
  -> HTTP / JSON API
Dashboard 编排层：src/dashboard.js
  -> 子进程 stdin JSON + stdout ::ly-event JSON
Mineflayer 执行层：src/index.js
  -> Minecraft 服务器与模组协议
```

浏览器负责编辑配置和发起控制请求；Dashboard 持久化配置、管理执行端进程并聚合协议事件；Mineflayer 执行端负责账号会话和游戏内自动化。

## 二、目录与职责

```text
LY控制台
├─ src/
│  ├─ dashboard.js                # API、档案、鉴权、进程、日志和协议事件编排
│  ├─ config-schema.js            # 配置默认值合并、结构安全、类型校验和动作模式
│  ├─ execution-config.js         # 执行端磁盘配置读取、旧字段补齐和专用启动诊断
│  ├─ api-route-boundary.js       # API 路径/方法表与 JSON 404/405 回退
│  ├─ http-server-listener.js     # Dashboard HTTP 监听、失败诊断和请求超时
│  ├─ json-request.js             # JSON 媒体类型、大小、解析和对象形状边界
│  ├─ automation-store.js          # 自动化方案校验、持久化、去重和损坏恢复
│  ├─ json-store.js               # 单文件原子写入与多文件事务回滚
│  ├─ line-reader.js               # 单个执行子进程 stdout 分行和尾行刷新
│  ├─ process-ipc.js                # stdin 单行 JSON 写入与异步错误回传
│  ├─ process-lifecycle.js        # 子进程优雅停止和超时强制清理
│  ├─ runtime-chat-command.js     # 运行期聊天命令目标和内容归一化
│  ├─ runtime-lobby-action.js     # 即时大厅动作输入形状校验和运行期归一化
│  ├─ runtime-request-tracker.js  # 跨进程请求回执、超时、取消和退出清理
│  ├─ runtime-snapshot.js         # Dashboard 运行快照字段规范化
│  ├─ runtime-start-accounts.js   # 本次启动账号列表元素校验和归一化
│  ├─ runtime-target.js           # 运行期具体账号目标类型校验和归一化
│  ├─ session-state.js            # 账号会话状态创建与连接级快照清理
│  ├─ static-server.js             # 静态方法/路径约束、普通文件检查和流错误响应
│  └─ index.js                    # 批量账号、自动功能、大厅动作、窗口/NPC/DragonCore 协议
├─ public/
│  ├─ index.html                  # 业务 DOM 和页面区域
│  ├─ styles.css                  # 基础组件、表单和业务样式
│  ├─ workbench.css               # v1.0.40 三层工作台和响应式视觉覆盖
│  ├─ api-client.js               # 前端 HTTP 请求与网络/协议错误边界
│  ├─ app.js                      # 配置、档案、自动化、运行控制、窗口快照和即时动作
│  └─ log-renderer.js             # Minecraft 颜色日志渲染
├─ deploy/
│  ├─ bootstrap.sh                # 首次部署、下载回退和进入管理菜单
│  └─ ly-afk-manager.sh           # Ubuntu、PM2、Nginx、HTTPS、日志和更新
├─ scripts/                       # 语法、smoke、协议、鉴权和功能集成测试
├─ docs/                          # 当前状态、架构、决策、想法、日志、历史交接和部署文档
├─ bot.config.example.json        # 默认配置和配置结构来源
├─ accounts.example.json          # 独立账号文件示例
├─ .env.example                   # Dashboard 环境变量示例
├─ AGENTS.md                      # AI 协作、检查点和 Git 边界
└─ package.json                   # npm 命令与依赖
```

## 三、启动与进程链路

本地启动 Dashboard：

```powershell
npm.cmd run dashboard
```

默认监听 `http://127.0.0.1:30123`。HTTP 请求体默认须在 30 秒内接收完成，请求头默认 15 秒，超时由 Node 返回 `408` 并关闭连接；可通过 `DASHBOARD_REQUEST_TIMEOUT_MS` 和 `DASHBOARD_HEADERS_TIMEOUT_MS` 调整，请求头上限不会超过请求体上限。线上由 Nginx 反向代理到该地址；需要直接端口访问时按部署文档设置监听地址和安全组。

启动机器人：

```text
public/app.js
  -> POST /api/start（可带本次启动账号）
  -> src/dashboard.js 校验配置并确保 npm 依赖存在
  -> spawn node src/index.js
  -> 等待 ChildProcess spawn 成功；error 时清理状态并返回启动失败
  -> START_ACCOUNT_NAMES + BOT_CONFIG_PATH + DASHBOARD_START_REQUEST_ID 环境变量
  -> src/index.js 完成账号校验并创建首个 Mineflayer 会话
  -> executionReady 关联回执
```

启动 API 先等待操作系统发出 ChildProcess `spawn`，再等待执行端返回匹配请求 ID 的 `executionReady`；执行端磁盘配置加载在受控启动阶段执行，先保留服务器与运行时核心字段的专用启动诊断，再以 `bot.config.example.json` 补齐旧版本缺失字段并执行 `src/config-schema.js` 的完整模式校验。功能、动作、规则、账号和账号池必须在发出 ready 前通过；账号缺失历史可选的进服消息或注册密码时补为空字符串。只有完成配置和账号校验、并成功创建首个 Mineflayer 会话后才发送成功事件；受控启动失败会发送 `executionReady ok:false` 和中文诊断，Dashboard 对已收到失败回执的启动请求不再追加低价值退出码日志，避免 `/api/start` 或 `/api/status.logs` 暴露 Node 堆栈、`node:internal`、`file:///`、内部绝对路径或 `退出码：null`。该事件不等待其他账号按连接间隔全部创建。此阶段 `/api/status` 返回 `starting: true`、`running: false` 且不开放控制快照；ready 后原子切换为 `starting: false`、`running: true`。初始化期间重复启动和运行命令均明确拒绝，前端显示“挂机初始化中”并禁用相关控件。无法创建进程、初始化提前退出或默认 10 秒内无回执时均返回明确失败并清理初始化状态；ready 超时会先请求优雅停止，并以强制终止兜底，禁止 API 失败后遗留后台进程。等待上限可通过 `DASHBOARD_START_READY_TIMEOUT_MS` 调整。停止机器人由 `/api/stop` 结束子进程；普通停止同样使用 5 秒强制兜底，停止中重复停止保持幂等，停止中 `running` 必须为 `false` 且不开放控制快照；未运行时停止、运行中重复启动以及停止完成前启动都会返回明确错误，避免前端显示虚假成功。Dashboard 收到 `SIGINT` 或 `SIGTERM` 时会停止接收新连接、拒绝全部等待中的跨进程请求、通知 Mineflayer 执行端退出，并在 5 秒后强制清理残留子进程；执行端收到两种信号时停止全部账号和功能工作器。Dashboard 最多保留最近 500 行日志，`/api/status` 返回 `starting`、`running`、`stopping`、控制状态和日志。

## 四、配置与持久化

默认配置来自 `bot.config.example.json`，真实主配置默认保存为 `bot.config.json`。设置 `BOT_CONFIG_PATH` 时，档案和自动化文件会跟随该路径生成。

```text
bot.config.json                 # 当前主配置
bot.config.profiles/            # profiles.json 和各配置档案
bot.config.automations.json     # 可复用大厅自动化方案
accounts.json                   # 可选独立账号列表
.env                            # Dashboard 端口、监听和 Basic Auth
```

Dashboard 在保存前执行默认值合并和严格校验，覆盖服务器、账号池、功能开关、规则列表、大厅动作和定时任务。保存、切换或删除当前档案会替换主配置；执行端在线时与普通保存、重置一样实时下发可热更新项，服务器和账号仍在下次启动生效。磁盘保存成功后，只有收到执行端匹配 `requestId` 的成功回执才返回 `liveApplied: true` 并更新 Dashboard 运行快照；stdin 写入失败、执行端拒绝、回执超时或进程退出均保持 API 保存成功但返回 `liveApplied: false`。聊天、窗口和即时动作命令写入失败时 API 必须失败。所有运行时 JSON 通过 `src/json-store.js` 写入临时文件后原子替换，避免中断留下半份配置。主配置、活动档案和档案索引使用多文件事务：修改目标前先在 `bot.config.profiles/recovery/` 写入 `pending` 日志，全部目标安装后才标记 `committed`。进程内失败按逆序回滚；回滚失败时保留日志与 `.bak`。Dashboard 在读取主配置前恢复遗留日志：`pending` 回滚旧状态，`committed` 校验新目标并清理工件。恢复是幂等的；损坏、越界、重复路径或目标缺失都会阻止启动并保留证据，禁止猜测和静默覆盖。主配置或具体档案损坏时返回明确错误且不覆盖原文件；可派生的 `profiles.json` 和自动化库损坏时先备份到 `bot.config.profiles/recovery/`，再重建安全索引或空方案库。自动化库读取时还会验证条目结构、ID、名称、大厅参数和动作列表，保留唯一合法方案并隔离非法或重复条目，避免损坏数据进入前端。

配置保存前由 `src/config-schema.js` 统一执行默认值合并、结构安全与严格 JSON 类型校验。普通未知字段为前向兼容保留；`__proto__`、`prototype`、`constructor` 和超过 64 层的嵌套会被拒绝。Dashboard 对全部已知数字字段要求 JSON number；执行端直接启动时也严格校验服务器端口和运行时数字，拒绝布尔值、空值或数字字符串。

保存配置时，如果执行端正在运行，Dashboard 会通过子进程 stdin 下发携带 `requestId` 的 `config` 命令；执行端先克隆并通过同一完整配置模式校验，只有成功后才原子替换 `ACTIVE_CONFIG`、`ACTIVE_ACCOUNTS` 和 `ACTIVE_FEATURES`，随后只重启支持热更新的功能工作器，不重建全部账号连接，并用 `configApplyResult` 明确确认成功或返回拒绝原因。网页聊天和命令同样携带请求 ID；执行端只把处于 play 状态的目标加入消息冷却队列，并在 `chatCommandResult` 中返回成功入队和失败账号。

以上运行时数据均由 `.gitignore` 排除。部署脚本使用 Git 或压缩包更新时必须备份并恢复这些文件和目录。

## 五、Dashboard API

```text
GET  /api/config                 # 当前配置
POST /api/config                 # 校验并保存；运行时下发配置
POST /api/reset                  # 重置默认配置
GET  /api/profiles               # 配置档案列表
POST /api/profiles               # 保存档案
POST /api/profiles/use           # 使用档案
POST /api/profiles/delete        # 删除档案
GET  /api/automations            # 自动化方案列表
POST /api/automations            # 保存自动化方案
POST /api/automations/delete     # 删除自动化方案
GET  /api/status                 # 运行状态、控制状态和日志
POST /api/start                  # 启动执行端；accounts 缺省/数组合法，元素必须是文本
POST /api/stop                   # 停止执行端
POST /api/send                   # 向全部或指定账号发送聊天/命令；message 和非空 target 必须是文本，指定目标会 trim 首尾空白
GET  /api/window                 # 请求具体账号窗口和协议快照；拒绝空目标和 all 聚合目标
POST /api/lobby/action           # 对指定账号立即执行单个大厅动作；target 必须是具体账号文本，action 必须是对象
```

所有 API 和静态资源统一受可选 Basic Auth 保护。公网部署必须配置 `DASHBOARD_PASSWORD`。需要正文的 JSON API 只接受 `application/json`（可带 charset），错误媒体类型返回 `415`；空、畸形或非对象 JSON 返回稳定中文 `400`，允许空对象语义的启动/即时动作接口继续兼容无正文 POST。JSON 请求体最大为 1 MiB，超限返回 `413`。未知 `/api/*` 返回 JSON `404`；已知 API 的错误方法返回 JSON `405` 和真实 `Allow`，路由路径与方法集合由维护守卫和 Dashboard 实现保持同步。静态文件只允许 `GET`/`HEAD` 读取 `public/` 内普通文件，其他方法返回带 `Allow` 的 `405`；打开前文件消失返回 `404`，权限或同步打开错误返回 `500`，已开始响应后的读取错误销毁不完整连接，禁止未处理流错误终止 Dashboard。

## 六、运行时通信协议

Dashboard 通过 `src/process-ipc.js` 向 `src/index.js` 的 stdin 写入一行一个 JSON 命令，并等待写入回调；同步异常、异步回调错误和流 `error` 都必须返回调用方：

```text
chat             # 携带 requestId 发送聊天或命令
config           # 下发运行时配置并携带 requestId
windowSnapshot   # 携带 requestId 请求位置、实体、窗口和模组数据
lobbyAction      # 立即执行单个大厅动作并携带 requestId
```

执行端用 stdout 输出带前缀的结构化事件：

```text
::ly-event { ...JSON... }
```

当前事件类型：

```text
windowSnapshot      # 位置、实体、窗口、聊天按钮、协议对话和协议菜单；主动回执携带 requestId
lobbyActionResult   # 按 requestId 完成或拒绝即时动作
configApplyResult   # 按 requestId 确认或拒绝实时配置
executionReady      # 按启动 requestId 确认执行端关键初始化完成
chatCommandResult   # 按 requestId 返回成功入队和失败账号
```

Dashboard 为每个执行子进程创建独立 stdout 行读取器，再消费结构化事件，不把事件原文写入普通日志；子进程重启时不得继承上一进程未完成的半行。`src/runtime-request-tracker.js` 统一管理启动就绪、聊天命令、即时动作、配置应用和主动窗口快照的回执等待，`src/runtime-snapshot.js` 统一规范化成功快照；启动就绪、聊天、配置应用和窗口快照使用固定有界超时，即时动作按动作类型计算超时，进程退出或 Dashboard 关闭时拒绝全部等待请求。执行端主动产生的不带 `requestId` 快照只刷新缓存；`GET /api/window` 只有收到匹配请求的成功快照才返回。启动时尚未创建 session 的后续账号明确返回“尚未初始化”，创建后恢复成功；曾创建但已断线的账号保留 session，并返回已清空的合法快照，因此未初始化、合法空窗口和无响应三种状态不会混淆。`POST /api/send` 只有收到 `chatCommandResult` 才成功：指定账号失败时 API 失败；发送到全部账号时至少一个账号成功入队即可成功，并返回 `queuedTargets` 和 `failedTargets`。入队确认不等同于 Minecraft 服务端已经处理消息，前端提示必须保持这一边界。

## 七、Mineflayer 执行端

`src/index.js` 负责：

- 批量账号加载、启动前账号筛选、连接间隔和断线重连；
- 每个账号的连接级状态由 `src/session-state.js` 创建和清理；断线时清空位置、实体、窗口、消息和模组协议快照并发送空异步快照，旧连接的迟到事件不得清理或污染新连接；
- 自动注册/登录、关键词回复、预设消息和远程命令；
- 战斗、钓鱼、进食、重生、自动走路和防挂机移动；防挂机随机走动原点属于单次连接状态，重连后必须以新出生位置重新建立；
- 定时任务和大厅动作序列；
- 使用物品、相对移动、寻找实体/NPC、按键、移动槽位和点击窗口；
- 采集位置、客户端已知实体、标准容器窗口和聊天按钮；
- 解析 CustomNPCs 对话与 DragonCore 按钮/槽位映射。

标准窗口动作走 Minecraft 容器协议。纯客户端 DragonCore 控件如果没有真实槽位映射或已采集点击协议，不得伪造执行成功。

## 八、前端结构

前端无构建步骤，浏览器直接加载静态文件。`public/index.html` 保留业务 DOM ID；`public/api-client.js` 统一处理 JSON 请求、业务错误、登录失效、代理 HTML、损坏 JSON 和网络连接失败；`public/app.js` 绑定事件并维护：

```text
state.config / state.control          # 配置和运行控制
state.profiles / state.activeProfileId # 配置档案
state.automations                     # 自动化方案
state.nearbyEntities / state.windowItems # 运行时快照
state.uiSettings                      # 浏览器 localStorage 界面偏好
```

`public/styles.css` 是基础业务样式，`public/workbench.css` 是当前工作台视觉层。修改界面时必须同时检查两者的优先级和响应式规则，并保持现有业务 ID 和事件绑定稳定。

## 九、部署架构

首次部署入口：

```bash
curl -fL https://cdn.jsdelivr.net/gh/bykedie/LY-@main/deploy/bootstrap.sh | sudo bash
```

`bootstrap.sh` 安装基础工具，优先使用 Git，失败时依次回退 GitHub 压缩包和 jsDelivr，然后通过 `bash` 打开管理菜单。`ly-afk-manager.sh` 管理 Node.js、npm、PM2、Nginx、UFW、HTTPS、日志和项目更新；快捷入口为 `/usr/local/bin/j`。

线上推荐：

```text
浏览器 -> HTTPS/Nginx -> 127.0.0.1:30123 -> src/dashboard.js
```

更新时必须保留 `.env`、`bot.config.json`、`accounts.json`、`bot.config.profiles/` 和 `bot.config.automations.json`。

## 十、测试与开发入口

```powershell
npm.cmd run handoff:check     # 交接体系一致性
npm.cmd run maintenance:check # API、CSS 和大型文件维护预算
npm.cmd run security:audit   # 依赖漏洞；高危或严重将失败
npm.cmd run check         # JavaScript 语法检查
npm.cmd test              # 完整测试
```

常见修改位置：

```text
前端结构/视觉     public/index.html, public/styles.css, public/workbench.css, public/api-client.js, public/app.js
Dashboard/API     src/dashboard.js, src/runtime-chat-command.js, src/runtime-lobby-action.js, src/runtime-start-accounts.js, src/runtime-target.js, src/config-schema.js, scripts/config-schema-test.js, scripts/smoke-test.js, scripts/dashboard-*-test.js
Minecraft 功能    src/index.js, src/execution-config.js, scripts/*-integration-test.js
部署流程          deploy/*, docs/ubuntu-24.04-deploy.md, README.md
交接与决策        AGENTS.md, docs/current-status.md, docs/decisions.md, docs/work-log.md
```

## 十一、线上排查顺序

```text
1. 阅读 docs/current-status.md，确认远端稳定版与本地研发版。
2. pm2 status ly-afk-dashboard / pm2 logs ly-afk-dashboard。
3. curl -i http://127.0.0.1:30123/api/status。
4. sudo nginx -t，并检查 Nginx、UFW 和云安全组。
5. 部署失败查看 /tmp/ly-console-bootstrap.log。
6. Minecraft 问题查看网页实时日志、服务端版本、登录模式和模组协议。
7. 更新前后核对运行时配置文件和备份目录。
```

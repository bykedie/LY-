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
│  ├─ dashboard.js                # API、配置校验、档案/自动化、鉴权、进程、日志和协议事件
│  ├─ json-store.js               # 运行时 JSON 的原子读取和写入
│  ├─ process-lifecycle.js        # 子进程优雅停止和超时强制清理
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

默认监听 `http://127.0.0.1:30123`。线上由 Nginx 反向代理到该地址；需要直接端口访问时按部署文档设置监听地址和安全组。

启动机器人：

```text
public/app.js
  -> POST /api/start（可带本次启动账号）
  -> src/dashboard.js 校验配置并确保 npm 依赖存在
  -> spawn node src/index.js
  -> START_ACCOUNT_NAMES + BOT_CONFIG_PATH 环境变量
  -> src/index.js 创建 Mineflayer 会话
```

停止机器人由 `/api/stop` 结束子进程；普通停止同样使用 5 秒强制兜底，停止中重复停止保持幂等；未运行时停止、运行中重复启动以及停止完成前启动都会返回明确错误，避免前端显示虚假成功。Dashboard 收到 `SIGINT` 或 `SIGTERM` 时会停止接收新连接、拒绝等待中的动作、通知 Mineflayer 执行端退出，并在 5 秒后强制清理残留子进程；执行端收到两种信号时停止全部账号和功能工作器。Dashboard 最多保留最近 500 行日志，`/api/status` 返回进程状态、控制状态和日志。

## 四、配置与持久化

默认配置来自 `bot.config.example.json`，真实主配置默认保存为 `bot.config.json`。设置 `BOT_CONFIG_PATH` 时，档案和自动化文件会跟随该路径生成。

```text
bot.config.json                 # 当前主配置
bot.config.profiles/            # profiles.json 和各配置档案
bot.config.automations.json     # 可复用大厅自动化方案
accounts.json                   # 可选独立账号列表
.env                            # Dashboard 端口、监听和 Basic Auth
```

Dashboard 在保存前执行默认值合并和严格校验，覆盖服务器、账号池、功能开关、规则列表、大厅动作和定时任务。保存、切换或删除当前档案会替换主配置；执行端在线时与普通保存、重置一样实时下发可热更新项，服务器和账号仍在下次启动生效。所有运行时 JSON 通过 `src/json-store.js` 写入临时文件后原子替换，避免中断留下半份配置。主配置或具体档案损坏时返回明确错误且不覆盖原文件；可派生的 `profiles.json` 和自动化库损坏时先备份到 `bot.config.profiles/recovery/`，再重建安全索引或空方案库。

保存配置时，如果执行端正在运行，Dashboard 会通过子进程 stdin 下发 `config` 命令；执行端只重启支持热更新的功能工作器，不重建全部账号连接。

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
POST /api/start                  # 启动执行端
POST /api/stop                   # 停止执行端
POST /api/send                   # 向全部或指定账号发送聊天/命令
GET  /api/window                 # 请求指定账号窗口和协议快照
POST /api/lobby/action           # 对指定账号立即执行单个大厅动作
```

所有 API 和静态资源统一受可选 Basic Auth 保护。公网部署必须配置 `DASHBOARD_PASSWORD`。JSON 请求体最大为 1 MiB，超限返回 `413`。

## 六、运行时通信协议

Dashboard 向 `src/index.js` 的 stdin 写入一行一个 JSON 命令：

```text
chat             # 发送聊天或命令
config          # 下发运行时配置
windowSnapshot   # 请求位置、实体、窗口和模组数据
lobbyAction      # 立即执行单个大厅动作并携带 requestId
```

执行端用 stdout 输出带前缀的结构化事件：

```text
::ly-event { ...JSON... }
```

当前事件类型：

```text
windowSnapshot      # 位置、实体、窗口、聊天按钮、协议对话和协议菜单
lobbyActionResult   # 按 requestId 完成或拒绝即时动作
```

Dashboard 消费结构化事件，不把事件原文写入普通日志。即时动作有按动作类型计算的超时；进程退出时会拒绝全部等待中的动作。

## 七、Mineflayer 执行端

`src/index.js` 负责：

- 批量账号加载、启动前账号筛选、连接间隔和断线重连；
- 自动注册/登录、关键词回复、预设消息和远程命令；
- 战斗、钓鱼、进食、重生、自动走路和防挂机移动；
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
Dashboard/API     src/dashboard.js, scripts/smoke-test.js, scripts/dashboard-*-test.js
Minecraft 功能    src/index.js, scripts/*-integration-test.js
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

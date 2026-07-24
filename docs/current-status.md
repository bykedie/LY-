# 当前项目状态

> 这是项目“现在做到哪里”的唯一权威入口。只保留当前事实，每个关键动作后覆盖更新；历史过程追加到 `docs/work-log.md`。

## 当前稳定版本

`v1.0.40`，远端 `origin/main` 基线提交为 `87be1a8`。

## 当前本地开发版本

`v1.0.42`。`v1.0.41` 本轮研发作废且版本号不复用。

## 当前本地分支

`local/v1.0.42`，纯本地分支，未设置远端跟踪。

## 当前目标

将项目持续建设为可由 AI 长期维护的本地优先项目：主动审计并修复可复现 bug，按真实功能边界小范围拆分，保持自动验证、架构和交接同步；所有成果先由项目所有者审阅。

## 本轮需求和验收标准

- 无需等待新需求，持续审计当前实现中的真实 bug，并先复现、后修复。
- 修复必须覆盖根因，增加能在修复前失败、修复后通过的回归测试。
- 关键动作立即更新当前状态和工作日志；稳定阶段创建本地里程碑提交。
- 未经项目所有者明确说“同意推送”，禁止任何远端变更。

## 已完成事项

- AI 续接体系：`f2a8840`。
- 配置一致性与维护守卫：`a40094c`。
- 配置恢复与依赖安全：`761b802`。
- Dashboard/执行端优雅退出：`c484632`。
- 普通启停与超时清理：`0d805a1`。
- 交接 Git 提交引用真实性校验：`63adaca`。
- 重复启停虚假成功修复：`90b00f7`。
- 前端 API 错误边界拆分：`0808dbb`；检查点同步：`c521df4`。
- 自动化库结构恢复与独立存储边界：`cee6f85`。
- 防挂机重连后移动原点重置：`452d6f9`。
- 执行子进程 stdout 行缓冲隔离：`502a7fc`。
- 执行子进程 IPC 写入结果与部分成功语义：`413e88f`。
- 静态文件 TOCTOU 与流错误边界：`1afd387`。
- 配置档案多文件事务与进程内回滚：`9f6235a`。
- 配置事务崩溃后启动恢复：`a063d77`。
- 运行配置应用确认与统一跨进程等待器：`f54bf29`。
- 跨进程等待未处理拒绝竞态：`0ecb92b`。
- 窗口快照关联回执与无响应失败语义：`4d0f694`。
- 断线连接级快照清理与会话状态边界：`a50f29f`。
- 执行子进程操作系统 spawn 确认：`66c72c8`。
- 执行端应用级就绪握手、初始化失败和超时清理：`d924347`。
- 网页发送命令执行端回执与部分成功语义：`754f03b`。
- 初始化与运行状态分离及前端初始化提示：`5d94897`。
- 后续账号未初始化快照失败语义与快照规范化模块：`8a4a3e9`。
- Dashboard 端口占用监听失败诊断：`84dc24d`。
- Dashboard 非法、零值和越界端口校验：`de3c163`。
- 静态资源错误方法 405 边界与防挂机重连测试稳定性：`c648e70`。
- API 路由 JSON 404/405 与路径/方法集合守卫：`d3dfc71`。
- CSS 重复选择器、`!important` 和大型文件已建立不得继续增长的维护基线。
- `local/v1.0.42` 本地开发分支、续接文档体系和自动交接校验已建立。

## 正在进行事项

慢速未完成请求缺陷已复现并修复：HTTP server 现在默认请求体 30 秒、请求头 15 秒、最多 1 秒扫描，支持环境变量覆盖且请求头上限不超过请求体上限。进程级回归在旧实现上失败，修复后收到 408、连接关闭、Dashboard 存活且后续状态请求正常；架构与环境示例已同步，安全审计和完整测试全部通过，当前修改可创建本地里程碑提交。

## 下一步明确动作

创建 HTTP 慢速请求防护本地里程碑提交；随后审计配置合并对异常嵌套对象、特殊键、极深 JSON 和未知字段的真实行为。

## 已修改文件

- `scripts/dashboard-timeout-test.js`
- `src/http-server-listener.js`
- `src/dashboard.js`
- `.env.example`
- `docs/project-architecture.md`
- `package.json`
- `docs/current-status.md`
- `docs/work-log.md`

## 未解决问题和阻塞项

- CSS 历史基线仍有 80 个完全重复选择器和 12 个 `!important`；维护守卫约束新增数量，但现有重复和覆盖尚未按具体界面范围清理。
- `public/app.js`、`src/dashboard.js` 和 `src/index.js` 已开始按真实边界提取模块，但三个文件仍是大型核心文件，后续只能随真实功能继续拆分。
- 依赖审计存在 6 个 Mineflayer 上游中危警告；当前无兼容自动修复，禁止破坏性降级。
- 具体界面重做范围尚未确认；这不阻止 bug 审计和维护性改进，但不应自行全面改版。
- 当前无外部阻塞，推送许可为否。

## 最近测试结果

- HTTP 半包断开真实审计：Dashboard 持续存活、stderr 为空，后续 `/api/status` 返回 200。
- 运行中主配置损坏真实审计：`GET /api/config` 明确返回损坏诊断，原文件不变，后续状态请求正常。
- `POST /` 回归：旧实现返回 200 和页面正文；修复后返回 405、`Allow: GET, HEAD` 且不泄露页面。
- smoke、静态模块、相关语法、交接与维护检查：通过；Dashboard 1046 行。
- 防挂机专项在平面位移修复后连续两次通过。
- `npm.cmd run security:audit`：通过，0 严重、0 高危、6 个 Mineflayer 上游中危告警。
- `npm.cmd test`：重新运行后全部通过，包含静态方法、重连移动、交接、维护、存储、进程、前端、协议与认证场景。
- 静态 `HEAD /` 真实审计：返回 200、`text/html`、0 字节正文，Dashboard 无 stderr 且持续存活。
- API 路由矩阵旧行为：未知 API 为文本 404；`PUT /api/config` 为文本 405 且错误 `Allow: GET, HEAD`。
- `node scripts/smoke-test.js`：新回归在旧实现失败于未知 API 非 JSON，修复后通过未知 API JSON 404、配置 API `Allow: GET, POST` 和状态 API `Allow: GET`。
- 相关语法、smoke、交接和维护检查通过；API 路径及方法集合守卫通过，Dashboard 1048 行，未提高预算。
- `npm.cmd run security:audit`：通过，0 严重、0 高危、6 个 Mineflayer 上游中危告警。
- `npm.cmd test`：全部通过，包含 API 路由边界、交接、维护、存储、进程、前端、Minecraft 协议与认证场景。
- Basic Auth 路由审计：匿名未知/错误方法 API 均返回 401；认证后分别返回 JSON 404 和带真实 `Allow` 的 JSON 405。
- `node scripts/dashboard-auth-test.js` 和完整 `npm.cmd test`：通过，认证信息隐藏顺序已进入全套验证。
- JSON 请求矩阵旧行为：缺失/文本 Content-Type 被接受；空/畸形 JSON 返回 `Unexpected end` 或带位置的英文解析器错误；后续 `/api/status` 仍为 200。
- 新回归在旧实现失败于缺失 Content-Type 未返回 415；修复后 smoke 覆盖 415、空/畸形/null JSON 中文 400、charset JSON 和可选空正文兼容。
- `runtime-config-protocol-test`、相关语法、交接和维护检查通过；Dashboard 1028 行。
- `npm.cmd run security:audit`：通过，0 严重、0 高危、6 个 Mineflayer 上游中危告警。
- `npm.cmd test`：全部通过，包含 JSON 请求、API 路由、认证、交接、维护、存储、进程、前端和 Minecraft 协议场景。
- HTTP 超时审计：Node 默认请求体 5 分钟、请求头 60 秒、扫描间隔 30 秒；200ms/50ms 原型稳定返回 408 并关闭连接。
- `node scripts/dashboard-timeout-test.js`：旧实现按预期失败于 2 秒内未关闭慢速未完成请求。
- 修复后慢速请求专项通过 408、连接关闭、进程存活、后续 200、默认值和上下限约束；监听、smoke、语法、交接和维护检查通过。
- `npm.cmd run security:audit`：通过，0 严重、0 高危、6 个 Mineflayer 上游中危告警。
- 完整 `npm.cmd test`：全部通过，包含慢速请求 408/连接关闭/服务存活与后续 200，以及交接、维护、存储、进程、前端、Minecraft 协议和认证场景。

## 恢复开发命令

```powershell
Set-Location 'C:\Users\Administrator\Documents\MCLY\pcl-afk-bot'
git switch local/v1.0.42
git status --short --branch
git log --oneline -5
npm.cmd run handoff:check
npm.cmd run maintenance:check
```

## 是否允许推送

否。只有项目所有者在当前任务中明确说“同意推送”后才可改变；本地提交不等于允许推送。

## 最后更新时间

2026-07-24 14:02:00 +08:00

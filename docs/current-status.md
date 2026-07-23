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
- 配置事务在进程被强制终止后必须能够确定性恢复，不得根据文件内容猜测。
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
- CSS 重复选择器、`!important` 和大型文件已建立不得继续增长的维护基线。

## 正在进行事项

已复现并修复跨进程请求的 Promise 拒绝竞态：请求结果在调用方仍等待 stdin 写入时被进程退出拒绝，会触发 `unhandledRejection`；统一等待器现立即安装内部拒绝观察器，同时保留原始 Promise 供调用方获得真实错误。安全审计和完整测试已通过，当前修改待创建本地提交。

## 下一步明确动作

创建 Promise 拒绝时序修复的独立本地提交；提交后审计并发配置保存的回执乱序是否会使 Dashboard 运行快照回退到较旧配置。

## 已修改文件

- `docs/current-status.md`
- `docs/work-log.md`
- `scripts/runtime-request-tracker-test.js`
- `src/runtime-request-tracker.js`

## 未解决问题和阻塞项

- CSS 历史基线仍有 80 个完全重复选择器和 12 个 `!important`；已阻止增长，尚未按具体界面范围清理。
- `public/app.js`、`src/dashboard.js` 和 `src/index.js` 仍是大型核心文件，只能随真实功能逐步拆分。
- 依赖审计存在 6 个 Mineflayer 上游中危警告；当前无兼容自动修复，禁止破坏性降级。
- 具体界面重做范围尚未确认；这不阻止 bug 审计和维护性改进，但不应自行全面改版。
- 当前无外部阻塞，推送许可为否。

## 最近测试结果

- `node scripts/runtime-request-tracker-test.js`：修复前触发 `unhandledRejection` 和 `PromiseRejectionHandledWarning`，修复后通过并保留原始退出原因。
- `node scripts/runtime-config-protocol-test.js`：通过，配置接受、拒绝、超时和进程退出语义未回归。
- `node scripts/dashboard-protocol-test.js`：通过，真实配置和大厅动作跨进程链路未回归。
- `npm.cmd run security:audit`：通过，0 严重、0 高危、6 中危 Mineflayer 上游告警。
- `npm.cmd test`：全部通过，新增延迟消费拒绝回归及所有既有业务、协议和认证场景均通过。
- `node scripts/runtime-config-protocol-test.js`：连续两次通过，覆盖执行端接受、拒绝、不回执和退出；修复前稳定失败于拒绝路径错误返回 `liveApplied: true`。
- `node scripts/runtime-request-tracker-test.js`：通过，覆盖成功、失败、超时、取消、未知回执和批量拒绝。
- `node scripts/dashboard-protocol-test.js`：通过，真实 Mineflayer 桥接中的保存、档案切换/删除和重置均收到配置应用确认。
- `npm.cmd run maintenance:check`：通过，API 路由 13 个、CSS 重复 `80/80`、`!important` 为 `12/12`；Dashboard 降至 972 行。
- `npm.cmd run handoff:check`：通过，新增运行请求模块和交接引用有效。
- `npm.cmd run security:audit`：通过，0 严重、0 高危、6 中危 Mineflayer 上游告警。
- `npm.cmd test`：全部通过，包含语法、交接、维护、存储、生命周期、IPC、配置回执、静态服务、前端及全部 Minecraft 协议集成场景。
- `node scripts/json-transaction-test.js`：通过，覆盖 pending 回滚、committed 清理、幂等恢复、回滚失败后启动重试、越界/重复路径拒绝、损坏日志阻断和目标缺失保留证据。
- `node scripts/smoke-test.js`：通过，Dashboard 在开放 API 前回滚未完成主配置事务并记录日志。
- `npm.cmd run handoff:check`：通过，事务工件均被 Git 忽略。
- `npm.cmd run maintenance:check`：通过，Dashboard 为 983 行。
- `npm.cmd run security:audit`：通过，0 严重、0 高危、6 中危。
- `npm.cmd test`：全部通过，包含事务恢复及所有既有业务和协议场景。

## 恢复开发命令

```powershell
Set-Location 'C:\Users\Administrator\Documents\MCLY\pcl-afk-bot'
git switch local/v1.0.42
git status --short --branch
git log --oneline -5
npm.cmd run handoff:check
npm.cmd run maintenance:check
npm.cmd run security:audit
npm.cmd test
```

## 是否允许推送

否。只有项目所有者在当前任务中明确说“同意推送”后才可改变；本地提交不等于允许推送。

## 最后更新时间

2026-07-24 00:11:36 +08:00

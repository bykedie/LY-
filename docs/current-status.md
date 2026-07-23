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
- `/api/send` 必须等待执行端关联回执；单账号离线或不存在时失败，全部账号发送至少一个成功入队时返回成功并明确失败账号，全部失败时 API 失败。
- 网页只提示消息已加入执行端发送队列，不把入队成功虚称为 Minecraft 服务器已收到。
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
- CSS 重复选择器、`!important` 和大型文件已建立不得继续增长的维护基线。

## 正在进行事项

聊天命令关联回执、指定账号失败、全部账号部分成功、拒绝、无回执超时、执行端退出和前端准确提示均已完成全部验证，可创建独立本地里程碑提交。

## 下一步明确动作

创建当前修复的本地提交；随后审计 `/api/send` 在账号刚断线但 Mineflayer 尚未触发 `end` 的竞态，以及消息队列清理时未完成网页命令的可观测性。

## 已修改文件

- `docs/current-status.md`
- `docs/project-architecture.md`
- `docs/work-log.md`
- `public/app.js`
- `scripts/dashboard-protocol-test.js`
- `scripts/runtime-config-protocol-test.js`
- `scripts/smoke-test.js`
- `src/dashboard.js`
- `src/index.js`

## 未解决问题和阻塞项

- CSS 历史基线仍有 80 个完全重复选择器和 12 个 `!important`；已阻止增长，尚未按具体界面范围清理。
- `public/app.js`、`src/dashboard.js` 和 `src/index.js` 仍是大型核心文件，只能随真实功能逐步拆分。
- 依赖审计存在 6 个 Mineflayer 上游中危警告；当前无兼容自动修复，禁止破坏性降级。
- 具体界面重做范围尚未确认；这不阻止 bug 审计和维护性改进，但不应自行全面改版。
- 当前无外部阻塞，推送许可为否。

## 最近测试结果

- `npm.cmd run security:audit`：通过，0 严重、0 高危、6 中危 Mineflayer 上游告警。
- `npm.cmd test`：全部通过，包含交接、维护、语法、存储事务、进程、前端、Minecraft 协议、认证和新增聊天回执场景。
- `node scripts/dashboard-protocol-test.js`：真实在线定向、全部在线、断线失败和全部账号部分成功发送语义正确。
- `node scripts/runtime-config-protocol-test.js`：聊天回执接受、拒绝、无回执超时、执行端退出及既有 ready、配置和窗口回执全部受覆盖。
- 修复前真实协议测试稳定失败于“断线账号发送失败仍被 Dashboard 报告为成功”。
- 当前维护基线：API 13 个，CSS 重复选择器 `80/80`，`!important` `12/12`；`src/index.js` 2274 行、`public/app.js` 1722 行、`src/dashboard.js` 1034 行。

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

2026-07-24 01:38:47 +08:00

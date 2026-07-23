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
- 执行子进程只有完成关键初始化并创建首个机器人会话后，`/api/start` 才能返回成功；初始化退出或超时必须失败并清理进程状态。
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
- CSS 重复选择器、`!important` 和大型文件已建立不得继续增长的维护基线。

## 正在进行事项

`executionReady` 应用级启动握手、初始化超时和超时后进程清理已完成全部验证，可创建独立本地里程碑提交。

## 下一步明确动作

创建当前修复的本地提交；随后审计启动过程中并发 `/api/start` 请求是否可能在首个 ready 返回前创建两个执行子进程。

## 已修改文件

- `.env.example`
- `docs/current-status.md`
- `docs/project-architecture.md`
- `docs/work-log.md`
- `scripts/process-lifecycle-test.js`
- `scripts/runtime-config-protocol-test.js`
- `src/dashboard.js`
- `src/index.js`
- `src/process-lifecycle.js`

## 未解决问题和阻塞项

- CSS 历史基线仍有 80 个完全重复选择器和 12 个 `!important`；已阻止增长，尚未按具体界面范围清理。
- `public/app.js`、`src/dashboard.js` 和 `src/index.js` 仍是大型核心文件，只能随真实功能逐步拆分。
- 依赖审计存在 6 个 Mineflayer 上游中危警告；当前无兼容自动修复，禁止破坏性降级。
- 具体界面重做范围尚未确认；这不阻止 bug 审计和维护性改进，但不应自行全面改版。
- 当前无外部阻塞，推送许可为否。

## 最近测试结果

- `npm.cmd run security:audit`：通过，0 严重、0 高危、6 中危 Mineflayer 上游告警。
- `npm.cmd test`：全部通过，包含交接、维护、语法、存储事务、进程、前端、Minecraft 协议、认证及新增启动 ready 场景。
- `node scripts/runtime-config-protocol-test.js`：覆盖初始化立即退出、ready 缺失超时并清理、正常 ready、配置回执与窗口快照回执。
- 修复前同一运行协议测试稳定失败于“执行端初始化后立即退出时 Dashboard 错误返回启动成功”。
- 当前维护基线：API 13 个，CSS 重复选择器 `80/80`，`!important` `12/12`；`src/index.js` 2258 行、`public/app.js` 1719 行、`src/dashboard.js` 1042 行。

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

2026-07-24 01:12:37 +08:00

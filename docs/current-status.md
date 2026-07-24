# 当前项目状态

> 这是项目“现在做到哪里”的唯一权威入口。只保留当前事实；历史过程追加到 `docs/work-log.md`。

## 当前稳定版本

`v1.0.40`，远端 `origin/main` 基线提交为 `87be1a8`。

## 当前本地开发版本

`v1.0.42`。`v1.0.41` 本轮研发作废且版本号不复用。

## 当前本地分支

`local/v1.0.42`，纯本地分支，未设置远端跟踪。

## 当前目标

将项目持续建设为可由 AI 长期维护的本地优先项目：主动审计并修复可复现 bug，按真实功能边界小范围拆分，保持自动验证、架构和交接同步；所有成果先由项目所有者审阅。

## 本轮需求和验收标准

- 持续审计真实 bug，遵循“真实复现 → 修复前失败回归 → 最小根因修复”。
- 当前启动错误已修复：API 与状态日志不得泄露 Node 堆栈、`node:internal`、`file:///` 或内部绝对路径。
- 初始化失败后 `running`、`starting`、`stopping` 全部复位，Dashboard 保持存活，修复启动条件后可以再次正常启动。
- 关键动作立即更新当前状态和工作日志；稳定阶段创建本地里程碑提交。
- 未经项目所有者明确说“同意推送”，禁止任何远端变更。

## 已完成事项

- AI 续接体系、单一当前状态、想法/决策/工作日志及自动交接校验：`f2a8840`。
- 配置、存储、进程 IPC、Dashboard HTTP、安全和 Mineflayer 行为已完成多轮真实审计与回归修复。
- 配置完整模式统一覆盖 Dashboard、运行时 IPC 和磁盘直接启动：`4a2ea90`、`39d01ca`、`d62847a`。
- 执行端磁盘配置加载已提取为独立模块并纳入维护预算：`e8f79a2`。
- 执行端启动配置缺失泄露已修复：配置加载进入受控启动阶段，失败时返回 `executionReady ok:false` 中文诊断，不再向 API 日志暴露 Node 堆栈或内部路径。
- CSS 重复选择器、`!important` 和大型文件已建立不得继续增长的维护基线。

## 正在进行事项

执行端启动诊断泄露已完成真实复现、失败回归、最小修复、安全审计和完整测试，并保存为最新本地里程碑提交。当前工作区应保持干净；下一轮继续审计高风险边界。

## 下一步明确动作

优先审计初始化失败后的退出日志边界，重点确认 `退出码：null` 是否会让前端诊断含糊，并在触及 `src/index.js` 前优先提取小模块，避免突破维护预算。

## 已修改文件

无未提交修改。本轮启动诊断修复已保存为最新本地提交。

## 未解决问题和阻塞项

- `src/index.js` 维护预算剩余很少，当前为 2222/2225；后续触及执行端逻辑时优先提取小模块。
- 初始化失败清理后的日志可能显示 `退出码：null`，需要下一轮真实审计是否影响用户诊断。
- CSS 历史基线仍有 80 个完全重复选择器和 12 个 `!important`；守卫阻止增长，但存量尚未按具体界面清理。
- `public/app.js`、`src/dashboard.js` 和 `src/index.js` 仍是大型核心文件，需要随真实功能继续拆分。
- 依赖审计存在 6 个 Mineflayer 上游中危告警；当前无兼容自动修复，禁止破坏性降级。
- 具体界面重做范围尚未确认；不应自行全面改版。
- 当前无外部阻塞，推送许可为否。

## 最近测试结果

- 旧实现真实复现：缺失 `bot.config.example.json` 时 `/api/status.logs` 泄露 `node:fs`、完整堆栈、`node:internal`、`file:///` 和内部绝对路径。
- 新回归旧实现失败：`scripts/runtime-config-protocol-test.js` 在启动日志脱敏断言处失败。
- 修复后 `node scripts/runtime-config-protocol-test.js`：通过；启动失败 API 返回包含 `bot.config.example.json` 的中文诊断，日志无内部诊断，状态复位，恢复文件后可再次启动。
- `npm.cmd run security:audit`：通过，0 严重、0 高危、6 个 Mineflayer 上游中危告警。
- 完整 `npm.cmd test`：通过，包含交接、维护、配置、Dashboard、前端、进程、协议、钓鱼、重生、防挂机、自动登录、账号校验和认证场景。
- `npm.cmd run maintenance:check`：通过；`src/index.js` 2222/2225，`src/execution-config.js` 100/100，CSS 重复选择器 `80/80`、`!important` `12/12`。

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

2026-07-25 00:00:43 +08:00

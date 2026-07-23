# 当前项目状态

> 这是项目“现在做到哪里”的唯一权威入口。只保留当前事实，每个关键动作后覆盖更新；历史过程追加到 `docs/work-log.md`。

## 当前稳定版本

`v1.0.40`，远端 `origin/main` 基线提交为 `87be1a8`。

## 当前本地开发版本

`v1.0.42`。`v1.0.41` 本轮研发作废且版本号不复用。

## 当前本地分支

`local/v1.0.42`，纯本地分支，未设置远端跟踪。

## 当前目标

持续提升项目的 AI 可维护性：迭代发现并修复真实 bug、逐步降低结构风险、补齐自动验证，所有成果仅在本地供项目所有者审阅。

## 本轮需求和验收标准

- 优先修复可复现 bug，并增加自动验证。
- 只做有明确边界的小范围拆分，不进行无业务目标的全面重构。
- 持续检查配置完整性、安全边界、依赖风险、进程生命周期和交接可靠性。
- 每个稳定阶段创建本地里程碑提交；未经项目所有者批准不推送。
- 下一位 AI 可直接依据仓库交接继续工作。

## 已完成事项

- AI 续接体系：本地提交 `f2a8840`。
- 配置一致性与维护守卫：本地提交 `a40094c`。
- 配置恢复与依赖安全：本地提交 `761b802`。
- Dashboard 与执行端优雅退出：本地提交 `c484632`。
- 修复配置保存、重置、档案操作与在线控制快照不一致。
- 增加请求体限制、路径穿越测试、档案 ID 约束、原子 JSON 与损坏数据备份恢复。
- 增加高危/严重依赖阻断与 Mineflayer 中危风险记录。
- Dashboard/执行端支持 SIGINT、SIGTERM 清理，直接终止 Dashboard 后在线客户端全部断开。
- 新增 `src/process-lifecycle.js`，统一普通停止和 Dashboard 退出的优雅信号与 5 秒强制清理。
- 普通停止保持幂等；停止完成前的新启动请求会明确拒绝，避免返回成功但实际未启动。
- 新增假子进程生命周期测试，覆盖优雅退出取消强杀、超时 SIGKILL 和空进程行为。
- 交接、维护和安全守卫持续生效；下一位 AI 提示语位于 `docs/next-ai-prompt.md`。

## 正在进行事项

无。第四轮普通启停状态机修复已保存；实际最新提交以 `git log --oneline -5` 为准。

## 下一步明确动作

继续下一批可复现问题审计，或执行项目所有者的新需求；所有成果仍先本地验证并等待审阅。

## 已修改文件

- `package.json`
- `src/dashboard.js`
- `src/process-lifecycle.js`
- `scripts/handoff-check.js`
- `scripts/process-lifecycle-test.js`
- `scripts/smoke-test.js`
- `docs/current-status.md`
- `docs/project-architecture.md`
- `docs/work-log.md`

## 未解决问题和阻塞项

- 现有 CSS 有 80 个完全重复选择器和 12 个 `!important`，已锁定为不得增长的基线。
- 大型核心文件仍需按真实功能边界逐步拆分。
- 依赖审计存在 6 个 Mineflayer 上游中危告警；当前无兼容自动修复，禁止破坏性降级。
- 当前无外部阻塞，推送许可为否。

## 最近测试结果

- `node scripts/process-lifecycle-test.js`：通过。
- `node scripts/smoke-test.js`：通过，停止中重复启动被拒绝。
- `node scripts/dashboard-protocol-test.js`：通过。
- `npm.cmd run handoff:check`、`npm.cmd run maintenance:check`、`npm.cmd run security:audit` 和 `npm.cmd test`：全部通过。

## 恢复开发命令

```powershell
Set-Location 'C:\Users\Administrator\Documents\MCLY\pcl-afk-bot'
git switch local/v1.0.42
git status --short --branch
git log --oneline -5
npm.cmd run handoff:check
npm.cmd run maintenance:check
npm.cmd run security:audit
```

## 是否允许推送

否。只有项目所有者在当前任务中明确同意推送后才可改变；本地提交不等于允许推送。

## 最后更新时间

2026-07-23 18:33:34 +08:00

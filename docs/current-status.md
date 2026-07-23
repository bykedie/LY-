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

- AI 续接体系：`f2a8840`。
- 配置一致性与维护守卫：`a40094c`。
- 配置恢复与依赖安全：`761b802`。
- Dashboard/执行端优雅退出：`c484632`。
- 普通启停与超时清理：`0d805a1`。
- 交接 Git 提交引用真实性校验：`63adaca`。
- 修复配置实时应用、请求体限制、路径穿越、档案 ID、原子 JSON、损坏数据恢复和依赖安全监控。
- Dashboard 与执行端支持信号清理，普通停止有 5 秒强制兜底，停止中启动明确拒绝。
- 修复未运行时停止和运行中重复启动仍返回成功的问题，避免 UI 显示虚假操作结果。
- 交接、维护、安全和完整测试持续通过；下一位 AI 提示语位于 `docs/next-ai-prompt.md`。

## 正在进行事项

无。最新启停状态语义修复已通过全套验证，等待独立本地提交。

## 下一步明确动作

独立提交本次启停状态语义修复；之后继续审计 API 错误语义与前端网络故障处理。

## 已修改文件

- `src/dashboard.js`
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

- `npm.cmd run handoff:check`：通过。
- `npm.cmd run maintenance:check`：通过。
- `npm.cmd run security:audit`：通过，0 严重、0 高危、6 中危。
- `npm.cmd test`：全部通过，包括启停状态回归测试。

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

2026-07-23 18:42:34 +08:00

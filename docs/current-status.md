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
- 不做无业务目标的全面重构，不改变无关业务行为。
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
- CSS 重复选择器、`!important` 和大型文件已建立不得继续增长的维护基线。

## 正在进行事项

自动化方案库损坏条目修复与存储边界拆分已完成；全部本地验证通过，等待创建里程碑提交。

## 下一步明确动作

创建自动化数据恢复与存储边界的独立本地提交；之后继续审计下一批可复现缺陷。

## 已修改文件

- `src/dashboard.js`
- `src/automation-store.js`
- `scripts/smoke-test.js`
- `scripts/handoff-check.js`
- `package.json`
- `docs/project-architecture.md`
- `docs/current-status.md`
- `docs/work-log.md`
- `docs/next-ai-prompt.md`

## 未解决问题和阻塞项

- CSS 历史基线仍有 80 个完全重复选择器和 12 个 `!important`；已阻止增长，尚未按具体界面范围清理。
- `public/app.js`、`src/dashboard.js` 和 `src/index.js` 仍是大型核心文件，只能随真实功能逐步拆分。
- 依赖审计存在 6 个 Mineflayer 上游中危警告；当前无兼容自动修复，禁止破坏性降级。
- 具体界面重做范围尚未确认；这不阻止 bug 审计和维护性改进，但不应自行全面改版。
- 当前无外部阻塞，推送许可为否。

## 最近测试结果

- 新回归测试在修复前按预期失败：结构错误自动化条目未被清理。
- `node --check src/dashboard.js`：修复后通过。
- `node scripts/smoke-test.js`：修复、增强断言和模块提取后通过。
- `npm.cmd run maintenance:check`：提取前因 Dashboard 超过 1050 行预算而失败；提取后通过，Dashboard 为 1010 行。
- `npm.cmd run handoff:check`：通过。
- `npm.cmd run security:audit`：通过，0 严重、0 高危、6 中危。
- `npm.cmd test`：全部通过，包含自动化库结构恢复回归。

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

2026-07-23 19:10:00 +08:00

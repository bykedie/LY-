# 当前项目状态

> 这是项目“现在做到哪里”的唯一权威入口。只保留当前事实，每个关键动作后覆盖更新；历史过程追加到 `docs/work-log.md`。

## 当前稳定版本

`v1.0.40`，远端 `origin/main` 基线提交为 `87be1a8`。

## 当前本地开发版本

`v1.0.42`。`v1.0.41` 本轮研发作废且版本号不复用。

## 当前本地分支

`local/v1.0.42`，纯本地分支，未设置远端跟踪。

## 当前目标

持续提升项目的 AI 可维护性：迭代发现并修复真实 bug，按真实功能边界逐步降低大文件和覆盖式样式风险，补齐自动验证；所有成果仅在本地供项目所有者审阅。

## 本轮需求和验收标准

- 核实 v1.0.42 对界面范围、CSS 覆盖、大文件拆分和避免全面重构的落实程度。
- 只做有明确边界的小范围拆分，不进行无业务目标的全面重构。
- 新增边界必须有专项测试、冒烟测试、维护检查和架构文档。
- 每个稳定阶段创建本地里程碑提交；未经项目所有者批准不推送。

## 已完成事项

- AI 续接体系：`f2a8840`。
- 配置一致性与维护守卫：`a40094c`。
- 配置恢复与依赖安全：`761b802`。
- Dashboard/执行端优雅退出：`c484632`。
- 普通启停与超时清理：`0d805a1`。
- 交接 Git 提交引用真实性校验：`63adaca`。
- 重复启停虚假成功修复：`90b00f7`。
- 已建立维护基线，禁止 CSS 重复选择器、`!important` 和大型核心文件继续无控制增长。
- 已将前端 HTTP 请求和错误语义从 `public/app.js` 抽到 `public/api-client.js`，覆盖业务错误、登录失效、代理 HTML、损坏 JSON 和网络失败。

## 正在进行事项

无。前端 API 客户端拆分、自动验证和架构同步已保存为本地提交 `0808dbb`。

## 下一步明确动作

等待项目所有者确认下一轮具体界面改造范围；之后按真实功能边界继续审计并小范围拆分 `app.js`、`dashboard.js` 和 `index.js`。

## 已修改文件

- `public/api-client.js`
- `public/app.js`
- `scripts/api-client-test.js`
- `scripts/smoke-test.js`
- `scripts/handoff-check.js`
- `package.json`
- `docs/project-architecture.md`
- `docs/current-status.md`
- `docs/work-log.md`

## 未解决问题和阻塞项

- CSS 历史基线仍有 80 个完全重复选择器和 12 个 `!important`；当前已阻止继续增长，但尚未完成按界面改造范围的清理。
- `public/app.js`、`src/dashboard.js` 和 `src/index.js` 仍是大型核心文件，只能随真实功能逐步拆分。
- 下一轮具体界面改造范围尚未由项目所有者确认，因此未进行新的界面重做。
- 依赖审计存在 6 个 Mineflayer 上游中危警告；当前无兼容自动修复，禁止破坏性降级。
- 当前无外部阻塞，推送许可为否。

## 最近测试结果

- `npm.cmd run handoff:check`：通过。
- `npm.cmd run maintenance:check`：通过，CSS 重复选择器 `80/80`，`!important` 为 `12/12`，均未增长。
- `npm.cmd run security:audit`：通过，0 严重、0 高危、6 中危。
- `npm.cmd test`：全部通过，包含 API 客户端专项和静态资源冒烟测试。

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

否。只有项目所有者在当前任务中明确同意推送后才可改变；本地提交不等于允许推送。

## 最后更新时间

2026-07-23 19:15:00 +08:00

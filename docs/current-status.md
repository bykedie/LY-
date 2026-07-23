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

- 审计大型文件、CSS 覆盖、API/测试覆盖和错误处理，形成可追踪证据。
- 优先修复能够复现的 bug，并为修复增加自动验证。
- 只做有明确边界的小范围拆分，不进行无业务目标的全面重构。
- 每个稳定阶段创建本地里程碑提交；未经项目所有者批准不推送。
- 提供下一位 AI 可直接使用的续接提示语，并通过冷启动演练验证。

## 已完成事项

- AI 续接体系已在本地里程碑 `f2a8840` 建立。
- 修复重置不同步：主配置、当前档案和运行中控制快照现在一致。
- 修复配置档案保存、切换和删除未实时下发在线配置的问题。
- 修正运行中保存、重置和档案操作提示，区分实时应用项与下次启动项。
- 增加配置档案删除、重置档案同步、运行时重置和档案实时应用回归测试。
- Dashboard 请求体限制为 1 MiB；带长度或分块超限请求均返回结构化 `413`，拒绝后服务仍可用。
- 增加静态路径穿越回归测试，确认无法读取仓库文件。
- 提取 `src/json-store.js`，运行时 JSON 改为原子写入并增加独立测试。
- 交接校验动态解析版本和 `local/<开发版本>` 分支，并拒绝隐藏控制字符和转义换行残留。
- 新增维护守卫：13 个 Dashboard API 测试引用、CSS 覆盖基线、`!important` 和大型文件预算。
- 新增 `docs/next-ai-prompt.md`，冷启动演练可恢复版本、分支、目标、下一步、测试和推送许可。
- 完整测试全部通过。

## 正在进行事项

无。当前维护里程碑已保存为本地提交 `d695b85`。

## 下一步明确动作

继续按维护守卫审计下一批可复现问题，或执行项目所有者提出的具体需求；任何成果仍先本地验证并等待审阅。

## 已修改文件

- `AGENTS.md`
- `package.json`
- `src/dashboard.js`
- `src/json-store.js`
- `public/app.js`
- `scripts/handoff-check.js`
- `scripts/maintenance-check.js`
- `scripts/json-store-test.js`
- `scripts/smoke-test.js`
- `scripts/dashboard-protocol-test.js`
- `docs/current-status.md`
- `docs/ideas.md`
- `docs/decisions.md`
- `docs/work-log.md`
- `docs/project-architecture.md`
- `docs/next-ai-prompt.md`

## 未解决问题和阻塞项

- 现有 CSS 有 80 个完全重复选择器和 12 个 `!important`，已锁定为不得增长的基线，后续随具体界面需求逐步减少。
- 大型核心文件仍需按真实功能边界逐步拆分；本轮已先提取原子 JSON 存储。
- 当前无外部阻塞，推送许可为否。

## 最近测试结果

- `npm.cmd run handoff:check`：通过。
- `npm.cmd run maintenance:check`：通过，13 个 API 均有测试引用，CSS 重复选择器保持 80，`!important` 保持 12。
- `npm.cmd test`：全部通过，覆盖交接、维护、JSON 存储、请求边界、配置档案、协议、功能和鉴权。
- 冷启动演练：能够恢复稳定版、本地开发版、分支、目标、下一步、测试结果和推送许可。

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

否。只有项目所有者在当前任务中明确同意推送后才可改变；本地提交不等于允许推送。

## 最后更新时间

2026-07-23 15:30:23 +08:00

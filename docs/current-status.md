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
- 持续检查配置完整性、安全边界、依赖风险和交接可靠性。
- 每个稳定阶段创建本地里程碑提交；未经项目所有者批准不推送。
- 下一位 AI 可直接依据仓库交接继续工作。

## 已完成事项

- AI 续接体系已在本地里程碑 `f2a8840` 建立。
- 第一轮维护修复已在本地里程碑 `a40094c` 保存。
- 修复主配置、当前档案和在线控制快照在保存、重置、档案保存/切换/删除时不一致的问题。
- Dashboard 请求体限制为 1 MiB；带长度或分块超限请求返回结构化 `413`。
- 增加静态路径穿越回归测试，确认无法读取仓库文件。
- 提取 `src/json-store.js`，运行时 JSON 使用原子写入并有独立测试。
- 档案 ID 增加安全格式约束和索引清洗，阻止运行文件中的路径穿越 ID。
- 损坏 JSON 返回明确中文错误且不修改原文件。
- 损坏的档案索引和自动化库会先备份到 `bot.config.profiles/recovery/`，再安全恢复。
- 交接校验动态解析版本和分支，并拒绝隐藏控制字符与转义换行残留。
- 维护守卫覆盖 13 个 Dashboard API 测试引用、CSS 覆盖基线、`!important` 和大型文件预算。
- 依赖安全审计已加入：高危/严重阻断；当前 6 个 Mineflayer 上游中危告警已记录。
- `docs/next-ai-prompt.md` 已提供可直接复制给下一位 AI 的续接提示语。

## 正在进行事项

无。第二轮维护已保存为本地提交 `80924f2`。

## 下一步明确动作

继续下一批可复现问题审计，或执行项目所有者的新需求；所有成果仍先在本地验证并等待审阅。

## 已修改文件

- `package.json`
- `src/dashboard.js`
- `src/json-store.js`
- `scripts/handoff-check.js`
- `scripts/security-audit.js`
- `scripts/json-store-test.js`
- `scripts/smoke-test.js`
- `docs/current-status.md`
- `docs/ideas.md`
- `docs/project-architecture.md`
- `docs/work-log.md`

## 未解决问题和阻塞项

- 现有 CSS 有 80 个完全重复选择器和 12 个 `!important`，已锁定为不得增长的基线。
- 大型核心文件仍需按真实功能边界逐步拆分；目前已先提取原子 JSON 存储。
- 依赖审计存在 6 个 Mineflayer 上游中危告警；当前无兼容自动修复，禁止破坏性降级。
- 当前无外部阻塞，推送许可为否。

## 最近测试结果

- `npm.cmd run handoff:check`：通过。
- `npm.cmd run maintenance:check`：通过。
- `npm.cmd run security:audit`：通过，0 严重、0 高危、6 中危。
- `node scripts/json-store-test.js`：通过。
- `node scripts/smoke-test.js`：通过。
- `npm.cmd test`：全部通过，包含 JSON 恢复、档案安全、协议、功能和鉴权测试。

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

2026-07-23 15:46:03 +08:00

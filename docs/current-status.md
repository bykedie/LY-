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

- AI 续接体系已在本地里程碑 `f2a8840` 建立。
- 第一轮配置一致性与维护守卫已保存为本地提交 `a40094c`。
- 第二轮配置恢复与依赖安全审计已保存为本地提交 `761b802`。
- 修复配置保存、重置、档案保存/切换/删除与在线控制快照不一致的问题。
- Dashboard 请求体限制为 1 MiB，并覆盖分块超限和路径穿越测试。
- 提取原子 JSON 存储；损坏索引与自动化库先备份到 `recovery/` 再安全恢复。
- 档案 ID 增加格式约束和索引清洗，阻止运行文件中的路径穿越 ID。
- 依赖安全审计阻断高危/严重漏洞；6 个 Mineflayer 上游中危告警持续监控。
- Dashboard 与执行端增加 `SIGINT`、`SIGTERM` 退出清理；Dashboard 关闭服务、拒绝等待动作、通知子进程退出并设置 5 秒强制兜底。
- 协议测试验证直接终止 Dashboard 后两个在线 Minecraft 客户端均断开，不残留重复机器人。
- 交接守卫拒绝隐藏控制字符和字面量转义换行；协作协议要求当前状态只能整文件生成。
- `docs/next-ai-prompt.md` 提供可直接复制给下一位 AI 的续接提示语。

## 正在进行事项

无。第三轮进程生命周期修复已保存为本地提交 `c6f27d5`。

## 下一步明确动作

继续下一批可复现问题审计，或执行项目所有者的新需求；所有成果仍先本地验证并等待审阅。

## 已修改文件

- `AGENTS.md`
- `src/dashboard.js`
- `src/index.js`
- `scripts/dashboard-protocol-test.js`
- `scripts/smoke-test.js`
- `docs/current-status.md`
- `docs/project-architecture.md`
- `docs/work-log.md`

## 未解决问题和阻塞项

- 现有 CSS 有 80 个完全重复选择器和 12 个 `!important`，已锁定为不得增长的基线。
- 大型核心文件仍需按真实功能边界逐步拆分。
- 依赖审计存在 6 个 Mineflayer 上游中危告警；当前无兼容自动修复，禁止破坏性降级。
- Windows 信号测试由系统直接终止进程；Linux/PM2 信号回调通过代码和静态断言覆盖，客户端断开行为已跨平台验证。
- 当前无外部阻塞，推送许可为否。

## 最近测试结果

- `node scripts/dashboard-protocol-test.js`：通过，直接终止 Dashboard 后在线客户端全部断开。
- `node scripts/smoke-test.js`：通过，Dashboard 与执行端均声明 `SIGINT/SIGTERM` 处理。
- `npm.cmd run security:audit`：通过，0 严重、0 高危、6 中危。
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

2026-07-23 15:58:13 +08:00

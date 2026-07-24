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
- `/api/lobby/action` 的即时动作必须明确拒绝非对象 `action`，不能向用户返回 JavaScript TypeError。
- `/api/lobby/action` 不得在校验前覆盖非法 `enabled` 类型；用户输入错误必须返回稳定中文诊断。
- `/api/send`、`/api/start` 和 `/api/window` 的既有输入形状、目标/账号归一化修复保持不回退。
- 修复后前端和 API 调用方应能明确区分运行中、初始化中、停止中、已停止和输入形状错误。
- 关键动作立即更新当前状态和工作日志；稳定阶段创建本地里程碑提交。
- 未经项目所有者明确说“同意推送”，禁止任何远端变更。

## 已完成事项

- AI 续接体系、单一当前状态、想法/决策/工作日志及自动交接校验：`f2a8840`。
- 配置、存储、进程 IPC、Dashboard HTTP、安全和 Mineflayer 行为已完成多轮真实审计与回归修复。
- 停止中状态语义已修复并完成完整验证，已保存为本地提交 `3b191ec`。
- `/api/window?target=all` 聚合目标语义已修复并完成完整验证，已保存为本地提交 `e6b9a19`。
- `/api/send` 指定账号目标空白归一化已修复并完成完整验证，已保存为本地提交 `731f5c7`。
- `/api/start` 非数组 `accounts` 拒绝已修复并完成完整验证，已保存为本地提交 `b8e084b`。
- `/api/send` 非字符串 `message` 拒绝已修复并完成完整验证，已保存为本地提交 `bf8dd48`。
- `/api/lobby/action` 非对象 `action` 和非法 `enabled` 类型拒绝已修复并完成完整验证，已保存为最新本地提交。
- CSS 重复选择器、`!important` 和大型文件已建立不得继续增长的维护基线。

## 正在进行事项

`/api/lobby/action` 即时动作输入形状问题已完成真实复现、修复前失败回归、最小修复、架构同步、交接校验、维护校验、安全审计、完整测试和本地里程碑提交。当前工作区应保持干净；下一轮继续审计高风险运行期边界。

## 下一步明确动作

继续审计 Dashboard/执行端运行期控制命令是否还有可复现的用户可见状态语义问题；因为 `src/dashboard.js` 仍为 788/800，下一轮触及 Dashboard 逻辑时继续优先提取小模块或把边界校验下沉到专用 helper，再按“真实复现 → 失败回归 → 最小修复 → 完整验证 → 本地提交”推进。

## 已修改文件

无未提交修改。本轮即时动作格式修复已保存为最新本地提交。

## 未解决问题和阻塞项

- `src/dashboard.js` 通过提取 helper 后为 788/800，仍接近维护预算；后续触及 Dashboard 时继续优先小模块拆分。
- `src/index.js` 维护预算剩余很少，当前为 2222/2225；后续触及执行端逻辑时优先提取小模块。
- CSS 历史基线仍有 80 个完全重复选择器和 12 个 `!important`；守卫阻止增长，但存量尚未按具体界面清理。
- `public/app.js`、`src/dashboard.js` 和 `src/index.js` 仍是大型核心文件，需要随真实功能继续拆分。
- 依赖审计存在 6 个 Mineflayer 上游中危告警；当前无兼容自动修复，禁止破坏性降级。
- 具体界面重做范围尚未确认；不应自行全面改版。
- 当前无外部阻塞，推送许可为否。

## 最近测试结果

- 旧实现真实复现：临时 Dashboard 启动后调用 `/api/lobby/action`，正文为 `{ target: "SmokeBot", action: "wait" }`，API 返回 HTTP 400，但错误为 `Cannot create property 'enabled' on string 'wait'`，属于不清晰的 JavaScript TypeError。
- 新回归旧实现失败：`node scripts/smoke-test.js` 失败于“非对象即时动作没有返回明确格式错误”，证明旧 Dashboard 未在路由层稳定拒绝非对象 `action`。
- 修复后专项：`node --check src/runtime-lobby-action.js`、`node --check src/dashboard.js` 和 `node scripts/smoke-test.js` 通过；新增回归覆盖非对象 `action` 和非法 `enabled` 类型，既有空请求、未运行和 `target=all` 语义保持不变。
- `npm.cmd run handoff:check`：通过，`v1.0.40 -> v1.0.42`、`local/v1.0.42`、推送许可为否。
- `npm.cmd run maintenance:check`：通过；`src/index.js` 2222/2225，`public/app.js` 1728/1800，`src/dashboard.js` 788/800，CSS 重复选择器 `80/80`、`!important` `12/12`。
- `npm.cmd run security:audit`：通过，0 严重、0 高危、6 个 Mineflayer 上游中危告警。
- 完整 `npm.cmd test`：通过，包含交接、维护、配置、Dashboard、前端、进程、协议、钓鱼、重生、防挂机、自动登录、账号校验和认证场景。

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

2026-07-25 02:26:20 +08:00

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
- `/api/lobby/action` 的目标账号必须是字符串；布尔值、数字、对象等非文本不能被隐式转换为账号名。
- `/api/send`、`/api/start`、`/api/window` 和 `/api/lobby/action` 的既有输入形状、目标/账号归一化修复保持不回退。
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
- `/api/lobby/action` 非对象 `action` 和非法 `enabled` 类型拒绝已修复并完成完整验证，已保存为本地提交 `03ce3f4`。
- `/api/send` 非字符串 `target` 拒绝已修复并完成完整验证，已保存为本地提交 `d0a565c`。
- `/api/start` 非字符串账号元素拒绝已修复并完成完整验证，已保存为最新本地提交 `da222aa`。
- `/api/lobby/action` 非字符串目标拒绝已修复并完成完整验证，已保存为最新本地提交 `cf57e46`。
- 自动化方案非字符串 ID 拒绝已修复并完成完整验证，已保存为最新本地提交 `3b64212`。
- CSS 重复选择器、`!important` 和大型文件已建立不得继续增长的维护基线。

## 正在进行事项

配置档案保存 ID 缺陷已完成真实复现、失败回归、最小修复、档案存储模块提取和全部本地门禁；当前只等待创建本地里程碑提交，本轮随后停止继续迭代。

## 下一步明确动作

创建配置档案 ID 修复的本地 `fix:` 里程碑提交；随后把交接状态更新为“本轮已停止”，不再审计或实现新问题。

## 已修改文件

- `docs/current-status.md`
- `docs/work-log.md`
- `scripts/smoke-test.js`
- `src/profile-store.js`
- `src/dashboard.js`
- `scripts/handoff-check.js`
- `package.json`
- `docs/project-architecture.md`

## 未解决问题和阻塞项

- `src/dashboard.js` 已通过配置档案模块提取降至 612/800，不再贴近维护上限；后续仍按具体功能小步拆分。
- `src/index.js` 维护预算剩余很少，当前为 2222/2225；后续触及执行端逻辑时优先提取小模块。
- CSS 历史基线仍有 80 个完全重复选择器和 12 个 `!important`；守卫阻止增长，但存量尚未按具体界面清理。
- `public/app.js`、`src/dashboard.js` 和 `src/index.js` 仍是大型核心文件，需要随真实功能继续拆分。
- 依赖审计存在 6 个 Mineflayer 上游中危告警；当前无兼容自动修复，禁止破坏性降级。
- 具体界面重做范围尚未确认；不应自行全面改版。
- 当前无外部阻塞，推送许可为否。

## 最近测试结果

- 最新真实复现：临时 Dashboard 创建合法档案后提交 `{ id: true, name: "Should Reject", config: ... }`；接口返回 200，档案从默认档案加 1 个自定义档案增长为默认档案加 2 个自定义档案，并新增对应 JSON 文件；临时进程和目录已清理。
- 配置档案修复前失败回归：`node scripts/smoke-test.js` 稳定失败于“保存接口没有拒绝非文本配置档案 ID”。
- 配置档案修复后专项：`node --check src/profile-store.js`、`node --check src/dashboard.js`、`node --check scripts/smoke-test.js` 和 `node scripts/smoke-test.js` 通过。
- 配置档案兼容回归覆盖空 ID 新建、合法 ID 原位更新、非文本/非法/不存在 ID 拒绝、列表与文件不增长、切换/删除、损坏索引恢复和多文件事务。
- 最新维护检查：通过；`src/dashboard.js` 从 769/800 降至 612/800，CSS 与其他大型文件基线未增长。
- 配置档案修复最终门禁：`npm.cmd run handoff:check`、`npm.cmd run maintenance:check`、`npm.cmd run security:audit` 和完整 `npm.cmd test` 全部通过；完整测试约 120 秒，所有业务、协议和集成场景通过。
- 最新真实复现：临时 Dashboard 首先保存一个合法自动化方案，再提交 `{ id: true, name: "Should Reject", lobby: ... }`；接口错误返回 200，磁盘方案数量从 1 增为 2，临时进程和目录已清理。
- 修复前失败回归：`node scripts/smoke-test.js` 稳定失败于“保存接口没有拒绝非文本自动化方案 ID”，证明旧实现未拒绝该输入。
- 修复后专项：`node --check src/automation-store.js`、`node --check scripts/smoke-test.js` 和 `node scripts/smoke-test.js` 通过；覆盖非文本拒绝及列表不增长、空字符串新建、合法 ID 更新、非法字符串拒绝和删除。
- 本轮完整验证：`npm.cmd run handoff:check`、`npm.cmd run maintenance:check`、`npm.cmd run security:audit` 和完整 `npm.cmd test` 全部通过。
- 维护基线保持：`src/index.js` 2222/2225、`public/app.js` 1728/1800、`src/dashboard.js` 612/800、CSS 重复选择器 80/80、`!important` 12/12。
- 安全审计保持：0 严重、0 高危、6 个 Mineflayer 上游中危告警。
- 交接日志守卫正向：当前日志运行 `npm.cmd run handoff:check` 通过。
- 交接日志守卫负向：临时在文件顶部插入 2099 检查点后，校验准确失败于“最新检查点没有追加在文件末尾”；临时记录已移除，正向复验通过。
- 交接守卫完整验证：`npm.cmd run maintenance:check` 和完整 `npm.cmd test` 通过，全部既有业务场景无回退。
- 旧实现真实复现：临时 Dashboard 与假执行端配置账号 `"true"` 后调用 `/api/lobby/action`，正文为 `{ target: true, action: { type: "wait", delayMs: 100, enabled: true } }`，API 返回成功且目标为 `"true"`，假执行端收到 `lobbyAction target:"true"`。
- 新回归旧实现失败：`node scripts/runtime-config-protocol-test.js` 失败于“非文本即时动作目标没有被 Dashboard 明确拒绝”，证明旧 Dashboard 未在路由层稳定拒绝非字符串即时动作目标。
- 修复后专项：`node --check src/runtime-target.js`、`node --check src/dashboard.js` 和 `node scripts/runtime-config-protocol-test.js` 通过；新增回归覆盖非字符串即时动作目标，既有窗口快照、发送目标、发送内容、动作格式和配置热更新场景保持不变。
- `npm.cmd run handoff:check`：通过，确认 `v1.0.40 -> v1.0.42`、`local/v1.0.42`、推送许可为否。
- `npm.cmd run maintenance:check`：通过；`src/index.js` 2222/2225，`public/app.js` 1728/1800，`src/dashboard.js` 769/800，CSS 重复选择器 `80/80`、`!important` `12/12`。
- `npm.cmd run security:audit`：通过，0 严重、0 高危、6 个 Mineflayer 上游中危告警。
- 完整 `npm.cmd test`：通过，覆盖交接、维护、配置、Dashboard、前端、进程、协议、钓鱼、重生、防挂机、自动登录、账号校验和认证场景。
- 远端实时复核：2026-07-25 尝试 `git ls-remote` 时 GitHub 连接超时；本地缓存的 `origin/main` 与本地 `main` 均仍为 `87be1a8`，未将缓存结果冒充实时远端状态。

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

2026-07-26 11:16:44 +08:00

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
- 配置事务在进程被强制终止后必须能够确定性恢复，不得根据文件内容猜测。
- 关键动作立即更新当前状态和工作日志；稳定阶段创建本地里程碑提交。
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
- 自动化库结构恢复与独立存储边界：`cee6f85`。
- 防挂机重连后移动原点重置：`452d6f9`。
- 执行子进程 stdout 行缓冲隔离：`502a7fc`。
- 执行子进程 IPC 写入结果与部分成功语义：`413e88f`。
- 静态文件 TOCTOU 与流错误边界：`1afd387`。
- 配置档案多文件事务与进程内回滚：`9f6235a`。
- 配置事务崩溃后启动恢复：`a063d77`。
- 运行配置应用确认与统一跨进程等待器：`f54bf29`。
- 跨进程等待未处理拒绝竞态：`0ecb92b`。
- 窗口快照关联回执与无响应失败语义：`4d0f694`。
- CSS 重复选择器、`!important` 和大型文件已建立不得继续增长的维护基线。

## 正在进行事项

断线陈旧快照已复现并修复：真实协议测试中账号断线后旧实现仍返回旧坐标；现在断线会清除机器人引用、位置/实体、窗口、消息、按钮和模组协议状态并发送空异步快照，旧连接迟到事件由实例身份校验隔离。会话状态创建与连接级清理已提取到 `src/session-state.js`，专项、安全和完整测试均通过，当前修改待本地提交。

## 下一步明确动作

创建断线快照清理与会话状态边界的独立本地提交；提交后审计执行子进程 `spawn` 失败时 Dashboard 是否因未监听 `error` 事件而崩溃或残留虚假运行状态。

## 已修改文件

- `docs/current-status.md`
- `docs/project-architecture.md`
- `docs/work-log.md`
- `package.json`
- `scripts/dashboard-protocol-test.js`
- `scripts/handoff-check.js`
- `scripts/session-state-test.js`
- `src/index.js`
- `src/session-state.js`

## 未解决问题和阻塞项

- CSS 历史基线仍有 80 个完全重复选择器和 12 个 `!important`；已阻止增长，尚未按具体界面范围清理。
- `public/app.js`、`src/dashboard.js` 和 `src/index.js` 仍是大型核心文件，只能随真实功能逐步拆分。
- 依赖审计存在 6 个 Mineflayer 上游中危警告；当前无兼容自动修复，禁止破坏性降级。
- 具体界面重做范围尚未确认；这不阻止 bug 审计和维护性改进，但不应自行全面改版。
- 当前无外部阻塞，推送许可为否。

## 最近测试结果

- `node scripts/dashboard-protocol-test.js`：修复前断线后仍返回旧坐标，修复后位置、窗口、实体、消息、按钮、协议对话和 DragonCore 菜单全部清空。
- `node scripts/session-state-test.js`：通过，覆盖会话默认状态、连接级快照字段和两个延迟日志定时器清理。
- `node scripts/anti-afk-movement-test.js`：通过，断线重连仍以新出生点重建移动状态。
- `npm.cmd run maintenance:check`：通过，`src/index.js` 从 2284 行降至 2235 行；CSS 和其他大型文件预算未增长。
- `npm.cmd run security:audit`：通过，0 严重、0 高危、6 中危 Mineflayer 上游告警。
- `npm.cmd test`：全部通过，会话状态单测、断线清理、重连和旧连接事件守卫及所有既有场景均通过；最终 `src/index.js` 为 2242 行。
- `node scripts/runtime-config-protocol-test.js`：通过；修复前无回执错误返回空快照成功，修复后合法空快照成功、第二次无回执在有界时间内明确失败，同时配置接受/拒绝/超时/退出场景未回归。
- `node scripts/dashboard-protocol-test.js`：通过，真实 Mineflayer 位置、窗口、协议菜单和大厅动作快照均正常。
- `node scripts/runtime-request-tracker-test.js`：通过，成功、失败、超时、取消、退出批量拒绝和延迟消费均受覆盖。
- `npm.cmd run handoff:check`：通过，分支、版本、提交引用、关键文件和推送边界一致。
- `npm.cmd run maintenance:check`：通过，API 13 个、CSS 重复 `80/80`、`!important` 为 `12/12`；`src/dashboard.js` 983 行。
- `npm.cmd run security:audit`：通过，0 严重、0 高危、6 中危 Mineflayer 上游告警。
- `npm.cmd test`：全部通过，包含新增快照回执场景及全部存储、进程、前端、Minecraft 协议和认证测试。

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

2026-07-24 00:38:00 +08:00

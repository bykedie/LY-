# 当前项目状态

> 这是项目“现在做到哪里”的唯一权威入口。只保留当前事实；历史过程追加到 `docs/work-log.md`。

## 当前稳定版本

`v1.0.42`，业务代码发布点为 `8f37dde`；远端 `origin/main` 已包含该发布点。

## 当前本地开发版本

`v1.0.43`，已完成多账号运行控制改进：重复账号日志折叠、日志自动跟随底部和单账号停止。本轮代码恢复点为本状态文件所在的最新本地 `fix:` 提交；上一恢复点为 `9ee87e2`。`v1.0.41` 已作废且不复用。

## 当前本地分支

`local/v1.0.43`，纯本地开发分支，未设置远端跟踪；远端仍保持 `v1.0.42`。

## 当前目标

多账号运行控制改进已经完成并封存为待提交本地里程碑：相同内容不重复占满日志、底部日志自动可见、单个账号可独立停止而其他账号继续运行。

## 本轮需求和验收标准

- API 原始日志保持完整；浏览器展示层只把连续、内容相同且账号不同的日志合并为一条并列出账号。
- 日志初次渲染和用户停留在底部时自动滚到最新日志；用户主动上翻或选择文本时不抢滚动位置。
- 运行控制显示当前运行账号，并允许停止某一个账号。
- 单账号停止必须停止功能工作器、聊天队列、连接与自动重连，清理运行快照，并返回执行端确认。
- 停止一个账号后共享执行进程和其他账号继续运行；该账号从当前控制目标中移除，后续发送和即时动作拒绝该目标。
- 停止最后一个账号后仍保留共享进程，用户可使用现有“停止挂机”结束整个进程。
- 完成页面浏览器验证以及交接、维护、安全和完整测试，再创建本地里程碑。
- 未经项目所有者明确说“同意推送”，禁止任何远端变更。

## 已完成事项

- AI 续接体系和本地优先发布边界已建立；`v1.0.42` 已发布到远端 `main`。
- NPC 标准窗口、DragonCore、聊天按钮和 CustomNPCs 已统一进入“操作点击窗口”，本地代码恢复点为 `d489c22`。
- 新增浏览器展示层日志折叠与有条件跟尾；API 原始日志未改变。
- 新增运行账号下拉和“停止该账号”操作。
- 新增 `POST /api/accounts/stop`、`stopAccount` IPC 和 `accountStopResult` 回执；执行端按账号清理工作器、队列、连接、快照与重连。
- 停止尚未初始化的后续账号时，账号启动循环会跳过该账号。
- 执行端 stdin 命令分发已提取到 `src/runtime-command-listener.js`，`src/index.js` 和 `public/app.js` 均保持维护预算内。

## 正在进行事项

本轮实现、测试、架构同步和本地里程碑均已完成，等待项目所有者在真实服务器复验。

## 下一步明确动作

等待项目所有者在真实服务器验证三账号日志折叠、自动跟尾和单账号停止；收到明确反馈后再恢复开发。

## 已修改文件

- `public/index.html`
- `public/app.js`
- `public/styles.css`
- `public/runtime-control.js`
- `src/index.js`
- `src/dashboard.js`
- `src/api-route-boundary.js`
- `src/runtime-account-control.js`
- `src/runtime-command-listener.js`
- `scripts/runtime-control-test.js`
- `scripts/dashboard-protocol-test.js`
- `scripts/smoke-test.js`
- `package.json`
- `docs/project-architecture.md`
- `docs/current-status.md`
- `docs/work-log.md`

## 未解决问题和阻塞项

- 自动化和本地模拟无法代替真实 Minecraft 服务器复验；需由项目所有者验证实际三账号日志与单停行为。
- CSS 历史基线仍有 80 个重复选择器和 12 个 `!important`；本轮没有增加。
- 依赖审计存在 6 个 Mineflayer 上游中危告警，本轮不做破坏性依赖变更。
- 当前无外部阻塞，推送许可为否。

## 最近测试结果

- `node scripts/runtime-control-test.js`：通过；覆盖三账号相同日志折叠、系统/同账号日志保留、底部跟随和上翻保持。
- `node scripts/dashboard-protocol-test.js`：通过；停止 A 后 B 继续在线、共享进程保持运行、A 不重连且不再接受发送。
- `npm.cmd run maintenance:check`：通过；API 14 个，CSS 重复 80/80，`!important` 12/12，`src/index.js` 2205/2225，`public/app.js` 1796/1800。
- `node scripts/smoke-test.js`：通过。
- 应用内浏览器：桌面运行控制可见且无横向溢出；390×844 窄屏单账号控件折叠为单列，日志宽度正常且无横向溢出。
- `npm.cmd run handoff:check`：通过；稳定 `v1.0.42`、本地 `v1.0.43`、分支与推送许可一致。
- `npm.cmd run security:audit`：通过；0 个 critical、0 个 high，保留 6 个既有 Mineflayer 上游 moderate 告警。
- `npm.cmd test`：通过；完整测试链 129.5 秒全绿。
- `git diff --check`：通过。

## 恢复开发命令

```powershell
Set-Location 'C:\Users\Administrator\Documents\MCLY\pcl-afk-bot'
git switch local/v1.0.43
git status --short --branch
git log --oneline -5
git status --short --branch
npm.cmd test
```

## 是否允许推送

否。只有项目所有者在当前任务中明确说“同意推送”后才可改变；本地提交不等于允许推送。

## 最后更新时间

2026-07-26 19:41:57 +08:00

# 当前项目状态

> 这是项目“现在做到哪里”的唯一权威入口。只保留当前事实；历史过程追加到 `docs/work-log.md`。

## 当前稳定版本

`v1.0.42`，业务代码发布点为 `8f37dde`；远端 `origin/main` 已包含该发布点。部署管理脚本显示版本、Bootstrap 版本和期望管理脚本版本均同步此稳定版本。

## 当前本地开发版本

`v1.0.43`，已完成多账号运行控制改进：重复账号日志折叠、日志自动跟随底部和单账号停止。本轮代码恢复点为 `c8c9aad`；上一恢复点为 `9ee87e2`。`v1.0.41` 已作废且不复用。

## 当前本地分支

`local/v1.0.43`，纯本地开发分支，未设置远端跟踪；远端仍保持 `v1.0.42`。

## 当前目标

将 Ubuntu 一键管理脚本中面向用户显示和校验的版本号同步为远端业务稳定版 `v1.0.42`，避免服务器菜单误显示旧稳定版。

## 本轮需求和验收标准

- `deploy/ly-afk-manager.sh` 菜单标题显示 `v1.0.42`。
- `deploy/bootstrap.sh` 的 `BOOTSTRAP_VERSION` 与 `EXPECTED_MANAGER_VERSION` 均为 `v1.0.42`。
- 自动回归明确约束管理脚本版本必须同步远端稳定版本。
- 不改变本地开发版本 `v1.0.43`，不修改有价值的历史版本说明。
- 完成相关 smoke、交接、维护和差异格式检查后创建本地里程碑。
- 未经项目所有者明确说“同意推送”，禁止任何远端变更。

## 已完成事项

- AI 续接体系和本地优先发布边界已建立；`v1.0.42` 已发布到远端 `main`。
- NPC 标准窗口、DragonCore、聊天按钮和 CustomNPCs 已统一进入“操作点击窗口”。
- 多账号相同日志折叠、日志有条件跟尾和单账号停止已完成，本地恢复点为 `c8c9aad`。
- 管理脚本菜单、Bootstrap 版本和期望管理脚本版本已同步为远端稳定版 `v1.0.42`。

## 正在进行事项

管理脚本版本同步和专项验证均已完成，正在创建本地里程碑提交。

## 下一步明确动作

创建本地 `fix:` 提交；之后等待项目所有者决定何时发布到远端并更新服务器。

## 已修改文件

- `deploy/ly-afk-manager.sh`
- `deploy/bootstrap.sh`
- `scripts/smoke-test.js`
- `docs/current-status.md`
- `docs/work-log.md`

## 未解决问题和阻塞项

- 服务器现有脚本只有在未来获准推送并执行更新后才会显示 `v1.0.42`；当前只完成本地修改。
- 依赖审计存在 6 个 Mineflayer 上游中危告警，本轮不做破坏性依赖变更。
- 当前无外部阻塞，推送许可为否。

## 最近测试结果

- 上一里程碑 `c8c9aad` 的完整 `npm test`、交接、维护、安全、差异格式和浏览器验证均通过。
- `node scripts/smoke-test.js`：通过；菜单、Bootstrap 和期望管理脚本版本均被约束为 `v1.0.42`。
- `npm.cmd run handoff:check`：通过；稳定 `v1.0.42`、开发 `v1.0.43`、本地分支与推送许可一致。
- `npm.cmd run maintenance:check`：通过；API、CSS 和大型文件预算均未退化。
- `git diff --check`：通过。

## 恢复开发命令

```powershell
Set-Location 'C:\Users\Administrator\Documents\MCLY\pcl-afk-bot'
git switch local/v1.0.43
git status --short --branch
git log --oneline -5
node scripts/smoke-test.js
```

## 是否允许推送

否。只有项目所有者在当前任务中明确说“同意推送”后才可改变；本地提交不等于允许推送。

## 最后更新时间

2026-07-26 19:50:01 +08:00

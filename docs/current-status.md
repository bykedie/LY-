# 当前项目状态

> 这是项目“现在做到哪里”的唯一权威入口。只保留当前事实；历史过程追加到 `docs/work-log.md`。

## 当前稳定版本

`v1.0.42`，实时远端 `origin/main` 为 `3daf459`；当前 `v1.0.43` 一键卸载候选已获得项目所有者明确推送许可，尚未成为远端稳定版。

## 当前本地开发版本

`v1.0.43`，NPC 交互协议重建图、图上选点、已知协议真实执行、多账号运行控制和统一交互入口均已完成；当前继续补齐 Ubuntu 一键卸载能力。`v1.0.41` 已作废且不复用。

## 当前本地分支

`local/v1.0.43`，纯本地开发与发布源分支，未设置远端跟踪；工作区还包含上一轮尚未提交的 `v1.0.43` 管理脚本版本同步和交接修改。

## 当前目标

将已验证的一键卸载功能和 `v1.0.43` 管理脚本版本同步发布到远端 `main`，实时核验远端 SHA，然后封存发布事实并重新关闭推送权限。

## 本轮需求和验收标准

- 新增可通过 `curl | sudo bash` 执行的 `deploy/uninstall.sh`。
- 管理菜单新增“一键卸载 LY 控制台”，并复用同一卸载脚本。
- 卸载 PM2 服务、项目专属 Nginx 站点、`/usr/local/bin/j` 和安装目录。
- 默认先备份 `.env`、账号、配置档案和自动化数据，再删除项目目录。
- 只删除可确认属于 LY 控制台的目录和快捷命令；危险路径或非项目目录必须拒绝删除。
- 关闭已识别的面板 UFW 端口规则，但保留 `22/80/443`、云安全组、HTTPS 证书和历史项目备份。
- 保留 Node.js、npm、PM2、Nginx、UFW、Certbot 等可能被其他服务共享的环境。
- README、Ubuntu 部署教程、架构、决策和 smoke 回归同步更新。
- Shell 语法检查、专项 smoke、交接检查、维护检查、安全审计、完整 `npm.cmd test` 和 `git diff --check` 全部通过。

## 已完成事项

- `v1.0.43` 业务实现、专项回归、桌面与 `390×844` 浏览器验收已完成并保存在 `3c786c0`。
- 协议重建图支持标准窗口、CustomNPCs、DragonCore、聊天 `clickEvent` 和未知协议；缺少真实字段时不伪造执行成功。
- 多账号运行日志折叠、日志自动向下跟随和单账号停止已完成并有回归覆盖。
- 已通过合并提交 `3a2b71c` 整合远端独有的管理脚本发布历史。
- 管理脚本菜单、Bootstrap 和期望管理脚本版本已在工作区同步为待发布版 `v1.0.43`。
- 已审计现有部署产物：PM2 服务 `ly-afk-dashboard`、快捷命令 `/usr/local/bin/j`、Nginx 站点 `ly-afk-dashboard`、安装目录和可选 UFW 面板端口。
- 已确定卸载边界：删除项目专属资源，默认备份运行数据，保留共享软件包、证书、`22/80/443` 规则和历史项目备份。
- 已新增 `deploy/uninstall.sh`：支持远程单命令与菜单调用、`UNINSTALL` 二次确认、默认运行数据备份、PM2/Nginx/快捷命令/UFW 面板端口/项目目录清理和结束核对。
- PM2 清理同时覆盖运行进程、日志/PID 和 `dump.pm2`/`dump.pm2.bak` 持久化条目，只删除 `ly-afk-dashboard`，保留同一用户下的其他服务。
- 删除边界已补充挂载点拒绝、`rm --one-file-system`、删除前二次项目校验、备份目录关键路径/符号链接/权限保护。
- 显式安装目录不存在或无法识别时会在清理 PM2/Nginx 等系统资源前拒绝继续，避免输错路径造成半卸载。
- 删除 `/usr/local/bin/j` 前会核对其中记录的目录与本次 `INSTALL_DIR` 完全一致，避免多套 LY 安装互相删除快捷入口。
- 管理菜单已新增 `16. 一键卸载 LY 控制台`，自定义安装目录会把当前 `PROJECT_DIR` 传给卸载器。
- README、Ubuntu 部署教程、架构和 `DEC-011` 已同步卸载命令、清理范围与保留边界。
- smoke 已新增卸载入口、路径保护、备份、PM2/Nginx 清理、结束核对和不删除共享软件包的断言。
- 已新增 `scripts/uninstall-script-test.sh`，在临时目录验证非项目目录和系统关键路径拒删、备份目录边界及运行数据备份。

## 正在进行事项

`v1.0.43` 一键卸载发布门禁已全部通过，正在创建发布提交并推送到远端 `main`。

## 下一步明确动作

提交当前候选并执行 `git push origin HEAD:main`；实时核验远端 SHA 后更新稳定版本和推送许可，创建并推送发布收尾提交。

## 已修改文件

- 上一轮未提交修改：`deploy/bootstrap.sh`、`deploy/ly-afk-manager.sh`、`scripts/smoke-test.js`、`docs/decisions.md`、`docs/project-architecture.md`、`docs/work-log.md`。
- 本轮实现：`deploy/uninstall.sh`、`deploy/ly-afk-manager.sh`、`README.md`、`docs/ubuntu-24.04-deploy.md`、`scripts/uninstall-script-test.sh`、`scripts/smoke-test.js`、`docs/project-architecture.md`、`docs/decisions.md`、`docs/current-status.md`、`docs/work-log.md`。

## 未解决问题和阻塞项

- Mineflayer 没有游戏客户端帧缓冲，协议重建图不是客户端真实像素截图。
- 真实服务器 DragonCore GUI 路径、action 名和 compose key 仍需从实际载荷取得；字段不足时只保存选点、不执行未知包。
- 依赖审计保留 6 个 Mineflayer 上游中危告警，本轮不做无关依赖变更。
- 云厂商安全组无法由服务器脚本自动判断或修改，卸载后如曾手动开放面板端口，仍需用户在云控制台关闭。

## 最近测试结果

- 上一轮功能封存前 `handoff:check`、`maintenance:check`、`security:audit`、完整 `npm.cmd test` 和 `git diff --check` 全部通过；完整流程约 132 秒。
- 应用内浏览器桌面与 `390×844` 通过；无横向溢出，Canvas 等比，槽位命中与真实左键回执正常。
- Git Bash `bash -n deploy/uninstall.sh deploy/ly-afk-manager.sh deploy/bootstrap.sh` 通过。
- `node scripts/smoke-test.js` 通过。
- `scripts/uninstall-script-test.sh` 通过：非项目目录、系统关键路径、备份目录边界和运行数据备份均符合预期；当前 Windows 文件系统不创建 POSIX 符号链接，该平台用例明确跳过，生产脚本仍保留真实路径比对。
- `git diff --check` 通过。
- `npm.cmd run handoff:check` 通过。
- `npm.cmd run maintenance:check` 通过，维护预算保持现有基线。
- `npm.cmd run security:audit` 通过：严重 0、高危 0，保留 6 个既有 Mineflayer 上游中危告警。
- 多安装归属保护后的最终 `npm.cmd test` 全部通过，耗时约 125 秒，包含语法、配置、API、进程生命周期、协议和全部集成回归。
- 发布前最终门禁已确认 `npm.cmd test`、`npm.cmd run security:audit`、四个 Shell 脚本语法、卸载隔离专项和 `git diff --check` 全部通过。
- `npx shellcheck` 尝试下载外部 ShellCheck 二进制时超时，没有产生诊断；已有 Git Bash `bash -n` 和隔离专项验证通过。
- 实时 `git fetch origin main` 通过：`origin/main=3daf459`，当前分支相对远端 `0` 落后、`10` 领先，远端是本地祖先。

## 恢复开发命令

```powershell
Set-Location 'C:\Users\Administrator\Documents\MCLY\pcl-afk-bot'
git switch local/v1.0.43
git status --short --branch
git log --oneline -5
npm.cmd run handoff:check
npm.cmd test
```

## 是否允许推送

否。长期默认仍禁止推送；项目所有者已在本轮明确给予一次性许可，仅覆盖当前 `v1.0.43` 候选向远端 `main` 的发布和必要发布收尾，不创建远端分支或标签，完成后立即失效。

## 最后更新时间

2026-08-04 16:14:39 +08:00

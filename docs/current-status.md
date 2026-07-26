# 当前项目状态

> 这是项目“现在做到哪里”的唯一权威入口。只保留当前事实；历史过程追加到 `docs/work-log.md`。

## 当前稳定版本

`v1.0.42`，业务代码发布点为 `8f37dde`；管理脚本版本同步和发布交接已推送到远端 `main`，当前缓存 `origin/main` 为 `3daf459`。

## 当前本地开发版本

`v1.0.43`，NPC 交互“协议重建图 + 图上选点 + 已知协议真实执行”已完成实现、桌面/窄屏浏览器验收和最终完整门禁，正在创建本地里程碑恢复点；恢复点完成后停止本轮迭代。`v1.0.41` 已作废且不复用。

## 当前本地分支

`local/v1.0.43`，纯本地开发分支，未设置远端跟踪；远端稳定业务仍为 `v1.0.42`。

## 当前目标

封存已通过完整验证的 `v1.0.43` NPC 交互可视化实现：保存本地 Git 恢复点并停止本轮迭代，等待项目所有者在真实服务器复验或提出下一项明确需求。

## 本轮需求和验收标准

- 标准窗口、CustomNPCs、DragonCore、聊天 `clickEvent` 或未知界面协议均能生成可见画面。
- 无法取得真实客户端像素时明确标记“协议重建图”，并显示可用原始协议信号，不伪称真人客户端截图。
- 图上点击显示画面坐标、归一化坐标和命中槽位/控件，允许确认左键或右键。
- 标准窗口选点转换为真实 `bot.clickWindow(slot, mouseButton, 0)`；CustomNPCs 选点发送真实选择包；聊天按钮发送已确认的命令协议。
- DragonCore 缺少 GUI 路径、action 名和 compose key 时只保存选点并明确报告未执行，不伪造成功。
- 使用稳定快照 ID 拒绝旧界面选点；动作后主动刷新快照，并单独返回本次命中坐标。
- 保留最长 16 KiB 可读协议文本，并为无可读文本的 DragonCore 信号保存有界 Base64 预览。
- 专项、维护、smoke、Dashboard/Minecraft 协议集成、完整测试与桌面/窄屏浏览器验证全部通过。
- 同步架构、决策、状态和工作日志，创建本地里程碑提交；未经明确许可不推送。

## 已完成事项

- 新增 `src/interaction-visual.js`：生成标准容器、CustomNPCs、DragonCore、聊天和未知协议画面，完成最新信号优先级、稳定快照 ID、坐标命中和输入校验。
- 新增 `src/interaction-visual-runtime.js`：标准窗口选点真实点击、CustomNPCs 真实选择、聊天命令执行，以及 DragonCore/未知协议安全不执行回执。
- 新增 `public/interaction-visual.js` 与 `public/interaction-visual.css`：Canvas 协议重建图、十字选点、坐标显示、左右键确认、原始协议详情和等比响应式缩放。
- 新增 `POST /api/window/click` 和 `interactionVisualClick` IPC；执行后主动请求最新窗口快照，并单独返回本次命中的 `selection`。
- 原始 DragonCore 可读载荷上限由 300 字符提升到 16 KiB；二进制界面信号保留有界 Base64 预览。
- 新模块已纳入 `package.json` 标准测试门禁；大型文件与 CSS 预算未提高，画布样式和槽位 DOM 绘制均拆入独立模块。
- 应用内浏览器桌面和 `390×844` 验收通过：画布等比、无页面横向溢出、按钮在视口内、原始协议可展开、槽位 11 可命中，页面真实左键返回成功并刷新。
- `docs/project-architecture.md` 和 `docs/decisions.md` 已同步协议重建图、API/IPC、真实执行边界和 DragonCore 安全限制。
- 交接、维护、安全、完整业务回归和 `git diff --check` 全部通过。

## 正在进行事项

仅剩创建本地 `v1.0.43` 里程碑提交并把提交 SHA 写回交接文档；没有继续开发新的功能。

## 下一步明确动作

创建本地 `fix: 增加 NPC 交互可视选点` 里程碑提交，把提交 SHA 写回当前状态和工作日志，然后停止本轮迭代；不推送远端。

## 已修改文件

- `docs/current-status.md`、`docs/project-architecture.md`、`docs/decisions.md`、`docs/work-log.md`、`package.json`
- `public/app.js`、`public/index.html`、`public/interaction-visual.css`、`public/interaction-visual.js`
- `src/api-route-boundary.js`、`src/dashboard.js`、`src/index.js`、`src/interaction-visual.js`、`src/interaction-visual-runtime.js`、`src/runtime-snapshot.js`、`src/session-state.js`
- `scripts/dashboard-protocol-test.js`、`scripts/interaction-visual-test.js`、`scripts/interaction-visual-runtime-test.js`、`scripts/runtime-snapshot-test.js`、`scripts/session-state-test.js`、`scripts/smoke-test.js`

以上修改均待纳入本地里程碑；当前没有计划中的额外业务代码修改。

## 未解决问题和阻塞项

- Mineflayer 没有游戏客户端帧缓冲，不能提供真人客户端像素截图；当前实现明确使用协议重建图。
- 真实服务器 DragonCore GUI 路径、action 名和 compose key 尚未从实际载荷取得；缺少这些字段时只显示并保存选点，不执行未知包。
- 自动化和协议夹具已通过，但仍需项目所有者在真实服务器复验最终交互体验。
- 依赖审计保留 6 个 Mineflayer 上游中危告警，本轮不做无关依赖变更。
- 当前推送许可为否。

## 最近测试结果

- `npm.cmd run handoff:check` 通过：`v1.0.42 -> v1.0.43`、分支 `local/v1.0.43`、推送许可为否。
- `npm.cmd run maintenance:check` 通过：API 数为 15，维护计数为 `src/index.js=2219/2225`、`public/app.js=1794/1800`、`public/styles.css=2413/2450`，未提高预算。
- `npm.cmd run security:audit` 通过：严重 0、高危 0；保留 6 个既有 Mineflayer 上游中危告警。
- `npm.cmd test` 全部通过，完整流程约 132 秒，包含交互画面、真实动作运行时、会话、快照、运行控制、smoke、协议集成和 Dashboard 鉴权等全部回归。
- `git diff --check` 通过；仅有 Git 对 3 个既有工作副本行尾转换的提示，没有空白错误。
- 应用内浏览器桌面与 `390×844` 通过；桌面和窄屏均无横向溢出，Canvas 比例与协议画面一致，窄屏槽位 11 命中且左右键控件可用，浏览器控制台无警告或错误。

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

否。只有项目所有者在当前任务中再次明确说“同意推送”后才可改变；本地提交不等于允许推送。

## 最后更新时间

2026-07-27 02:14:30 +08:00

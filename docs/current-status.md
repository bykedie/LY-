# 当前项目状态

> 这是项目“现在做到哪里”的唯一权威入口。只保留当前事实；历史过程追加到 `docs/work-log.md`。

## 当前稳定版本

`v1.0.42`，业务代码发布点为 `8f37dde`；远端 `origin/main` 已包含该发布点。

## 当前本地开发版本

`v1.0.43`，NPC 交互选项统一进入“操作点击窗口”的调整已完成并通过全部本地验证。已有恢复点 `2f817d6` 和 `877b326`。`v1.0.41` 已作废且不复用。

## 当前本地分支

`local/v1.0.43`，纯本地开发分支，未设置远端跟踪；从已发布的 `v1.0.42` 基线创建。

## 当前目标

把交互后所有可点击内容统一放入动作类型“操作点击窗口”的配置区域，不再显示独立协议按钮区；底层仍按标准窗口、DragonCore、聊天 `clickEvent` 或 CustomNPCs 真实协议执行。

## 本轮需求和验收标准

- “操作点击窗口”的下拉列表同时显示标准容器槽位、DragonCore 映射、聊天 `clickEvent` 和 CustomNPCs 对话选项。
- 聊天和 CustomNPCs 不再作为用户需要单独选择的动作类型；载入旧方案时仍能在“操作点击窗口”中正确回显。
- 选择列表项后，保存或立即执行时转换为对应真实动作类型和参数，不能把聊天或 NPC 对话伪装成窗口槽位包。
- 无法解析 CustomNPCs 同步定义或不支持的 `clickEvent` 时，在动作卡内显示明确诊断或禁用选项。
- 标准槽位网格仍可用于查看和快速选择，并把结果填入“操作点击窗口”动作卡。
- 增加界面位置与动作映射回归，并使用应用内浏览器验证桌面和 390×844 窄屏布局。
- 完成后运行交接、维护、安全和完整测试，再创建本地里程碑。
- 未经项目所有者明确说“同意推送”，禁止任何远端变更。

## 已完成事项

- AI 续接体系、单一当前状态、想法/决策/工作日志及自动交接校验已建立。
- `v1.0.42` 已由项目所有者授权发布到远端 `main`；当前稳定发布点为 `8f37dde`。
- 配置、存储、进程 IPC、Dashboard HTTP、安全和 Mineflayer 行为已完成多轮真实审计与回归修复。
- CSS 重复选择器、`!important` 和大型文件已建立不得继续增长的维护基线。
- NPC 交互数据链路、动作后最新快照和 CustomNPCs 1.12.2 真实选择协议已完成，代码恢复点为 `2f817d6`。
- 标准窗口、DragonCore、聊天按钮和 CustomNPCs 已统一进入“操作点击窗口”动作卡；旧聊天/NPC 动作载入时自动回显到统一入口。
- 独立协议按钮区以及聊天/CustomNPCs 独立动作类型已从用户界面移除。

## 正在进行事项

统一入口实现、专项/smoke 回归、浏览器验证和最终完整门禁均已完成；当前只待创建本地里程碑提交。

## 下一步明确动作

创建本地 `fix:` 里程碑，记录提交 SHA 后停止本轮迭代；不推送远端。

## 已修改文件

- `docs/current-status.md`
- `docs/project-architecture.md`
- `docs/work-log.md`
- `public/app.js`
- `public/index.html`
- `public/interaction-snapshot.js`
- `public/styles.css`
- `scripts/interaction-snapshot-test.js`
- `scripts/smoke-test.js`

## 未解决问题和阻塞项

- `src/index.js` 当前为 2224/2225，维护预算剩余很少；本轮没有修改执行端协议实现。
- CSS 历史基线仍有 80 个完全重复选择器和 12 个 `!important`；本轮只调整新交互区相关样式。
- `public/app.js` 当前为 1795/1800，接近维护上限；后续随具体功能优先小步提取。
- 依赖审计存在 6 个 Mineflayer 上游中危告警；当前无兼容自动修复，禁止破坏性降级。
- 真实生产服务器仍需用户复验其具体 Minecraft、CustomNPCs 或其他 NPC 插件版本。
- 当前无外部阻塞，推送许可为否。

## 最近测试结果

- 失败回归：旧实现缺少 `createOperateWindowAction` 导出，证明没有统一的动作卡选项与真实动作映射。
- 专项回归：`node scripts/interaction-snapshot-test.js` 通过，覆盖四类来源汇总、三种真实动作映射、旧方案回显、独立按钮区移除和诊断区域存在。
- smoke 回归：`node scripts/smoke-test.js` 通过，静态守卫确认统一入口存在、旧独立动作类型和按钮区不存在。
- 浏览器桌面验证：统一下拉显示标准窗口、DragonCore、聊天按钮、禁用的 `open_url` 和 CustomNPCs；页面外无独立交互按钮区，控制台无警告或错误。
- 浏览器动作验证：聊天选项发送 `clickChat`，CustomNPCs 发送 `clickNpcDialog 77/2`，标准槽位发送 `operateWindow slot 12`；协议映射正确。
- 浏览器 390×844 窄屏验证：页面、动作卡和统一下拉均无横向溢出；临时服务、页面和文件已清理。
- 最终完整门禁：`npm.cmd run handoff:check`、`npm.cmd run maintenance:check`、`npm.cmd run security:audit`、完整 `npm.cmd test` 和 `git diff --check` 全部通过，耗时约 131 秒。
- 维护基线：`src/index.js` 2224/2225、`public/app.js` 1795/1800、`src/dashboard.js` 612/800、CSS 重复选择器 80/80、`!important` 12/12。
- 安全审计：0 严重、0 高危、6 个 Mineflayer 上游中危告警。

## 恢复开发命令

```powershell
Set-Location 'C:\Users\Administrator\Documents\MCLY\pcl-afk-bot'
git switch local/v1.0.43
git status --short --branch
git log --oneline -5
node scripts/interaction-snapshot-test.js
node scripts/smoke-test.js
npm.cmd run handoff:check
```

## 是否允许推送

否。只有项目所有者在当前任务中明确说“同意推送”后才可改变；本地提交不等于允许推送。

## 最后更新时间

2026-07-26 18:07:47 +08:00

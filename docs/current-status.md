# 当前项目状态

> 这是项目“现在做到哪里”的唯一权威入口。只保留当前事实；历史过程追加到 `docs/work-log.md`。

## 当前稳定版本

`v1.0.42`，业务代码发布点为 `8f37dde`；远端 `origin/main` 已包含该发布点。

## 当前本地开发版本

`v1.0.43`，用于修复 NPC 左/右键交互后控制面板缺少可操作选项的问题。`v1.0.41` 已作废且不复用。

## 当前本地分支

`local/v1.0.43`，纯本地开发分支，未设置远端跟踪；从已发布的 `v1.0.42` 基线创建。

## 当前目标

让 NPC 左/右键交互后的标准容器、DragonCore 菜单和聊天 `clickEvent` 选项在控制面板中明确可见，并能直接填入对应后续动作。

## 本轮需求和验收标准

- 复现并定位 NPC 交互后控制面板没有选项的实际丢失环节。
- 标准容器槽位、DragonCore 映射选项和聊天 `clickEvent` 选项都必须渲染；没有可执行文本的 CustomNPCs 对话也必须显示明确诊断。
- 执行“寻找实体/NPC并交互”后，动作响应必须返回最新快照，不能复用交互前的旧缓存。
- 用户点击渲染出的容器/DragonCore 选项时填入操作窗口动作；点击聊天选项时填入点击聊天按钮动作。
- 增加前端行为回归和协议回归，并使用浏览器验证真实页面布局与交互。
- 所有改动完成后运行交接、维护、安全和完整测试，再创建本地里程碑。
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
- 配置档案非字符串、非法和不存在 ID 拒绝已修复，档案存储已从 Dashboard 提取，已保存为本地提交 `4ccc467`。
- `v1.0.42` 的 69 个本地提交已由项目所有者明确授权并快进发布到远端 `main`，发布点为 `8f37dde`。
- CSS 重复选择器、`!important` 和大型文件已建立不得继续增长的维护基线。

## 正在进行事项

NPC 交互界面根因修复、协议接入、专项回归、浏览器验证和最终完整门禁均已完成：标准容器与 DragonCore 保留槽位网格，聊天 `clickEvent` 与 CustomNPCs 真实选项进入独立按钮区；即时动作后强制请求新快照。当前只待创建本地里程碑提交。

## 下一步明确动作

创建本地 `fix:` 里程碑提交，记录提交 SHA 后停止本轮迭代；不推送远端。

## 已修改文件

- `docs/current-status.md`
- `docs/decisions.md`
- `docs/work-log.md`
- `docs/project-architecture.md`
- `package.json`
- `package-lock.json`
- `public/index.html`
- `public/styles.css`
- `public/app.js`
- `public/interaction-snapshot.js`
- `src/config-schema.js`
- `src/custom-npcs-protocol.js`
- `src/dashboard.js`
- `src/index.js`
- `src/runtime-snapshot.js`
- `src/session-state.js`
- `scripts/custom-npcs-protocol-test.js`
- `scripts/interaction-snapshot-test.js`
- `scripts/dashboard-fresh-snapshot-test.js`
- `scripts/dashboard-protocol-test.js`
- `scripts/runtime-snapshot-test.js`
- `scripts/session-state-test.js`
- `scripts/smoke-test.js`

## 未解决问题和阻塞项

- `src/dashboard.js` 已通过配置档案模块提取降至 612/800，不再贴近维护上限；后续仍按具体功能小步拆分。
- `src/index.js` 维护预算剩余很少，当前为 2224/2225；CustomNPCs 细节已提取到独立模块，后续继续优先小范围拆分。
- CSS 历史基线仍有 80 个完全重复选择器和 12 个 `!important`；守卫阻止增长，但存量尚未按具体界面清理。
- `public/app.js`、`src/dashboard.js` 和 `src/index.js` 仍是大型核心文件，需要随真实功能继续拆分。
- 依赖审计存在 6 个 Mineflayer 上游中危告警；当前无兼容自动修复，禁止破坏性降级。
- 具体界面重做范围尚未确认；不应自行全面改版。
- 当前无外部阻塞，推送许可为否。
- CustomNPCs `DIALOG` 基础包只包含实体 ID 和对话 ID；当前已解析 1.12.2 同步 NBT 与真实选择包，其他不兼容版本或缺失同步数据时会显示诊断而不猜测。
- 当前真实服务器版本由自动探测决定，`bot.config.json` 未固定 Minecraft 版本；协议适配必须保持多版本兼容。
- 真实生产服务器仍需用户在实际 NPC 上复验其具体插件/模组版本；本地协议集成已覆盖标准容器、DragonCore、聊天按钮和 CustomNPCs 1.12.2。

## 最近测试结果

- 最新真实复现：临时 Dashboard 创建合法档案后提交 `{ id: true, name: "Should Reject", config: ... }`；接口返回 200，档案从默认档案加 1 个自定义档案增长为默认档案加 2 个自定义档案，并新增对应 JSON 文件；临时进程和目录已清理。
- 配置档案修复前失败回归：`node scripts/smoke-test.js` 稳定失败于“保存接口没有拒绝非文本配置档案 ID”。
- 配置档案修复后专项：`node --check src/profile-store.js`、`node --check src/dashboard.js`、`node --check scripts/smoke-test.js` 和 `node scripts/smoke-test.js` 通过。
- 配置档案兼容回归覆盖空 ID 新建、合法 ID 原位更新、非文本/非法/不存在 ID 拒绝、列表与文件不增长、切换/删除、损坏索引恢复和多文件事务。
- 最新维护检查：通过；`src/dashboard.js` 从 769/800 降至 612/800，CSS 与其他大型文件基线未增长。
- 配置档案修复最终门禁：`npm.cmd run handoff:check`、`npm.cmd run maintenance:check`、`npm.cmd run security:audit` 和完整 `npm.cmd test` 全部通过；完整测试约 120 秒，所有业务、协议和集成场景通过。
- 最新本地代码里程碑：`4ccc467 fix: 校验配置档案 ID 类型`。
- 停止门禁专项：`node --check scripts/handoff-check.js` 和 `npm.cmd run handoff:check` 通过；续接提示语不再在无新需求时自动开启 bug 审计。
- 停止门禁完整验证：`npm.cmd run handoff:check`、`npm.cmd run maintenance:check`、`npm.cmd run security:audit` 和完整 `npm.cmd test` 全部通过；完整测试约 126 秒。
- 最新本地交接里程碑：`8beb5b6 docs: 阻止停止状态自动续做`。
- 发布核对：实时 `origin/main` 已从 `87be1a8` 快进为 `8f37dde`，与本地发布源 HEAD 一致；推送许可已恢复为否。
- 发布收尾完整验证：`handoff:check`、`maintenance:check`、`security:audit` 和完整 `npm.cmd test` 全部通过；交接校验确认 `v1.0.42 -> v1.0.42` 只允许出现在已完成且停止的状态。
- 最新发布收尾里程碑：`a3686e7 docs: 同步 v1.0.42 发布状态`。
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
- `npm.cmd run handoff:check`：发布前通过，确认 `v1.0.40 -> v1.0.42`、`local/v1.0.42`、推送许可为否。
- `npm.cmd run maintenance:check`：通过；`src/index.js` 2222/2225，`public/app.js` 1728/1800，`src/dashboard.js` 769/800，CSS 重复选择器 `80/80`、`!important` `12/12`。
- `npm.cmd run security:audit`：通过，0 严重、0 高危、6 个 Mineflayer 上游中危告警。
- 完整 `npm.cmd test`：通过，覆盖交接、维护、配置、Dashboard、前端、进程、协议、钓鱼、重生、防挂机、自动登录、账号校验和认证场景。
- 历史远端复核：2026-07-25 尝试 `git ls-remote` 时 GitHub 连接超时；当时本地缓存的 `origin/main` 与本地 `main` 均为 `87be1a8`。2026-07-26 已实时确认并成功发布到 `8f37dde`。
- NPC 界面链路审计：标准容器 `window`、DragonCore `protocolMenu`、CustomNPCs `protocolDialogs` 和聊天 `chatButtons` 均进入 API 快照；前端只传入前三者，`chatButtons` 在 `refreshWindowSnapshot` 与即时动作完成路径被遗漏。
- NPC 前端修复前失败回归：`node scripts/interaction-snapshot-test.js` 因 `public/interaction-snapshot.js` 不存在而失败，证明旧前端没有可独立验证的聊天/CustomNPCs 选项模型。
- NPC 最新快照修复前失败回归：`node scripts/dashboard-fresh-snapshot-test.js` 稳定失败于“即时动作返回了交互前的旧窗口缓存”，证明 `/api/lobby/action` 未主动请求动作后快照。
- NPC 专项修复后：`interaction-snapshot-test`、`dashboard-fresh-snapshot-test`、`custom-npcs-protocol-test`、`dashboard-protocol-test` 和 `smoke-test` 全部通过；集成测试确认服务器收到 `CustomNPCsPlayer` 的 `7/dialogId/optionId` 选择包。
- 浏览器桌面验证：标准槽位、DragonCore、聊天按钮、禁用的不支持 clickEvent 和 CustomNPCs 选项均可见；点击后分别填入 `clickChat` 与 `clickNpcDialog 77/2`，无按钮重叠或文字溢出。
- 浏览器 390×844 窄屏验证：页面和协议按钮区无横向溢出，槽位网格独立横向滚动，所有协议按钮保持在视口内；临时服务、页面和夹具已清理。
- NPC 修复最终门禁：`npm.cmd run handoff:check`、`npm.cmd run maintenance:check`、`npm.cmd run security:audit`、完整 `npm.cmd test` 和 `git diff --check` 全部通过；完整流程耗时约 128 秒。
- 最新维护检查：通过；`src/index.js` 2224/2225、`public/app.js` 1763/1800、`src/dashboard.js` 612/800、CSS 重复选择器 80/80、`!important` 12/12。
- 最新安全审计：0 严重、0 高危、6 个 Mineflayer 上游中危告警；没有兼容的自动修复，本轮不做破坏性依赖降级。

## 恢复开发命令

```powershell
Set-Location 'C:\Users\Administrator\Documents\MCLY\pcl-afk-bot'
git switch local/v1.0.43
git status --short --branch
git log --oneline -5
npm.cmd run handoff:check
npm.cmd run maintenance:check
```

## 是否允许推送

否。只有项目所有者在当前任务中明确说“同意推送”后才可改变；本地提交不等于允许推送。

## 最后更新时间

2026-07-26 17:02:25 +08:00

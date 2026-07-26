import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const port = Number(process.env.SMOKE_DASHBOARD_PORT || (32000 + Math.floor(Math.random() * 1000)));
const baseUrl = `http://127.0.0.1:${port}`;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-afk-smoke-'));
const configPath = path.join(tempDir, 'bot.config.json');
const exampleConfigPath = path.join(projectRoot, 'bot.config.example.json');
const startupRecoveryDir = path.join(tempDir, 'bot.config.profiles', 'recovery');

let dashboard = null;
let dashboardOutput = '';

try {
  createPendingStartupTransaction();
  dashboard = spawn(process.execPath, ['src/dashboard.js'], {
    cwd: projectRoot,
    env: { ...process.env, DASHBOARD_PORT: String(port), BOT_CONFIG_PATH: configPath },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  dashboard.stdout.on('data', (data) => {
    dashboardOutput += data.toString();
  });
  dashboard.stderr.on('data', (data) => {
    dashboardOutput += data.toString();
  });

  await waitForDashboard();
  const recoveredStartupConfig = await requestJson('/api/config');
  assert(recoveredStartupConfig.config.server.host === 'recovered-old.example', 'Dashboard 启动前没有回滚未完成配置事务');
  assert(fs.readdirSync(startupRecoveryDir).length === 0, 'Dashboard 启动恢复后仍遗留事务日志或备份');
  const initialStatus = await requestJson('/api/status');
  assert(initialStatus.logs.some((line) => line.includes('配置事务启动恢复完成：回滚 1 个')), 'Dashboard 日志没有报告启动事务回滚');
  assert(initialStatus.control === null, '未启动时不应该返回运行控制快照');
  assert(initialStatus.stopping === false, '未启动时不应该处于停止中状态');
  const stopWhileStopped = await requestJson('/api/stop', { method: 'POST', expectOk: false });
  assert(stopWhileStopped.ok === false && stopWhileStopped.message.includes('未启动'), '未运行时停止没有返回明确错误');
  const oversizedResponse = await request('/api/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target: 'all', message: 'x'.repeat(1024 * 1024) })
  });
  assert(oversizedResponse.statusCode === 413, '超大请求体没有返回 413');
  const oversizedJson = JSON.parse(oversizedResponse.body);
  assert(oversizedJson.ok === false && oversizedJson.message.includes('过大'), '超大请求体没有返回明确错误');
  const statusAfterOversizedBody = await requestJson('/api/status');
  assert(statusAfterOversizedBody.running === false, '拒绝超大请求后 Dashboard 无法继续响应');
  const missingJsonType = await request('/api/profiles/use', { method: 'POST', body: '{}' });
  assert(missingJsonType.statusCode === 415, '缺少 JSON Content-Type 没有返回 415');
  assert(JSON.parse(missingJsonType.body).message.includes('application/json'), '缺少 JSON Content-Type 的诊断不明确');
  const wrongJsonType = await request('/api/profiles/use', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: '{}'
  });
  assert(wrongJsonType.statusCode === 415, '错误 JSON Content-Type 没有返回 415');
  const emptyJsonBody = await request('/api/profiles/use', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  assert(emptyJsonBody.statusCode === 400, '空 JSON 正文没有返回 400');
  assert(JSON.parse(emptyJsonBody.body).message.includes('有效 JSON'), '空 JSON 正文泄露了解析器内部错误');
  const malformedJsonBody = await request('/api/profiles/use', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{bad'
  });
  assert(malformedJsonBody.statusCode === 400, '畸形 JSON 没有返回 400');
  assert(JSON.parse(malformedJsonBody.body).message.includes('有效 JSON'), '畸形 JSON 泄露了解析器内部错误');
  const nullJsonBody = await request('/api/profiles/use', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'null'
  });
  assert(nullJsonBody.statusCode === 400, 'null JSON 正文没有返回 400');
  assert(JSON.parse(nullJsonBody.body).message.includes('对象'), 'null JSON 正文泄露了属性访问错误');
  const charsetJsonBody = await request('/api/profiles/use', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: '{}'
  });
  assert(charsetJsonBody.statusCode === 400, '带 charset 的 JSON 没有进入业务校验');
  assert(JSON.parse(charsetJsonBody.body).message.includes('配置档案'), '带 charset 的 JSON 被错误拒绝为媒体类型');
  const oversizedChunkedResponse = await request('/api/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target: 'all', message: 'y'.repeat(1024 * 1024) }),
    omitContentLength: true
  });
  assert(oversizedChunkedResponse.statusCode === 413, '分块超大请求体没有返回 413');
  const traversalResponse = await request('/%2e%2e/package.json');
  assert(traversalResponse.statusCode !== 200, '静态文件服务允许路径穿越读取 package.json');
  assert(!traversalResponse.body.includes('mineflayer'), '路径穿越响应泄露项目文件内容');
  const stoppedLobbyAction = await requestJson('/api/lobby/action', {
    method: 'POST',
    body: JSON.stringify({ target: 'SmokeBot', action: { type: 'wait', delayMs: 100, enabled: true } }),
    expectOk: false
  });
  assert(stoppedLobbyAction.message.includes('挂机进程未启动'), '未启动时不应该接受大厅即时动作');
  const invalidLobbyActionShape = await requestJson('/api/lobby/action', {
    method: 'POST',
    body: JSON.stringify({ target: 'SmokeBot', action: 'wait' }),
    expectOk: false
  });
  assert(
    invalidLobbyActionShape.message.includes('动作') && invalidLobbyActionShape.message.includes('对象'),
    '非对象即时动作没有返回明确格式错误'
  );
  const invalidLobbyActionEnabled = await requestJson('/api/lobby/action', {
    method: 'POST',
    body: JSON.stringify({ target: 'SmokeBot', action: { type: 'wait', delayMs: 100, enabled: 'yes' } }),
    expectOk: false
  });
  assert(
    invalidLobbyActionEnabled.message.includes('启用开关'),
    '即时动作不应该在校验前覆盖非法 enabled 类型'
  );
  const emptyOptionalJson = await request('/api/lobby/action', { method: 'POST' });
  assert(emptyOptionalJson.statusCode === 400, '可选空 JSON 请求没有进入业务校验');
  assert(JSON.parse(emptyOptionalJson.body).message.includes('选择'), '可选空 JSON 请求被错误拒绝为媒体类型');

  const rejectedStaticPost = await request('/', { method: 'POST' });
  assert(rejectedStaticPost.statusCode === 405, 'POST / 不应返回静态控制台页面');
  assert(rejectedStaticPost.headers.allow === 'GET, HEAD', '静态资源错误方法响应缺少 Allow 头');
  assert(!rejectedStaticPost.body.includes('LY挂机控制台'), '静态资源错误方法响应泄露了页面正文');
  const missingApi = await request('/api/missing');
  assert(missingApi.statusCode === 404, '未知 API 没有返回 404');
  assert(missingApi.headers['content-type']?.includes('application/json'), '未知 API 没有返回 JSON');
  assert(JSON.parse(missingApi.body).message.includes('不存在'), '未知 API 缺少明确诊断');
  const rejectedConfigMethod = await request('/api/config', { method: 'PUT' });
  assert(rejectedConfigMethod.statusCode === 405, '配置 API 错误方法没有返回 405');
  assert(rejectedConfigMethod.headers.allow === 'GET, POST', '配置 API Allow 头不正确');
  assert(rejectedConfigMethod.headers['content-type']?.includes('application/json'), '配置 API 错误方法没有返回 JSON');
  const rejectedStatusMethod = await request('/api/status', { method: 'POST' });
  assert(rejectedStatusMethod.statusCode === 405, '状态 API 错误方法没有返回 405');
  assert(rejectedStatusMethod.headers.allow === 'GET', '状态 API Allow 头不正确');
  const page = await requestText('/');
  assert(page.includes('LY挂机控制台'), '页面默认标题没有改成 LY挂机控制台');
  assert(page.includes('sidebarToggle'), '页面缺少侧边栏收放按钮');
  assert(page.includes('data-section="settings"'), '侧边栏缺少设置入口');
  assert(page.includes('data-section="combat"') && page.includes('功能综合区'), '侧边栏缺少功能综合区');
  assert(!page.includes('data-section="movement"'), '移动辅助不应继续作为独立侧边栏入口');
  assert(!page.includes('data-section="chat"'), '智能交互不应继续作为独立侧边栏入口');
  assert(!page.includes('data-section="manage"'), '便捷管理不应再作为独立侧边栏入口');
  assert(!page.includes('data-section="architecture"'), '架构优势不应再作为独立侧边栏入口');
  assert(!page.includes('data-section="security"'), '安全可靠不应再作为独立侧边栏入口');
  assert(!page.includes('data-section="audience"'), '适用人群不应再作为独立侧边栏入口');
  assert(page.includes('uiTitleInput'), '设置页缺少界面名称输入框');
  assert(page.includes('sidebarPosition'), '设置页缺少侧边栏位置选择');
  assert(page.includes('showFieldNotes'), '设置页缺少参数注释显示开关');
  assert(page.includes('field-note'), '页面缺少参数注释');
  assert(page.includes('schedulerTaskTemplate'), '页面缺少定时任务模板');
  assert(page.includes('attackMode'), '页面缺少自动攻击参数');
  assert(page.includes('combat.autoRespawn'), '页面缺少自动重生开关');
  assert(page.includes('antiAfkMinDelayMs'), '页面缺少防挂机参数');
  assert(page.includes('antiAfkWalkRange'), '页面缺少防挂机随机走动范围');
  assert(page.includes('autoWalkToggle'), '页面缺少自动走路折叠入口');
  assert(page.includes('autoWalkBody'), '页面缺少自动走路参数折叠区域');
  assert(page.includes('profileSelect'), '页面缺少服务器配置档案选择');
  assert(page.includes('saveProfileBtn'), '页面缺少配置档案保存按钮');
  assert(page.includes('accountPoolList'), '页面缺少账号池列表');
  assert(page.includes('saveAccountsToPoolBtn'), '页面缺少保存账号到账号池按钮');
  assert(page.includes('account-note'), '页面缺少账号备注输入框');
  assert(page.includes('account-password" type="text"'), '注册密码预留不应该隐藏输入内容');
  assert(page.includes('duplicate-account'), '页面缺少复制账号按钮');
  assert(page.includes('move-account-to-pool'), '页面缺少移动账号到账号池按钮');
  assert(page.includes('presetSendList'), '页面缺少预设消息快捷发送区域');
  assert(page.includes('messageCooldownMs'), '页面缺少消息冷却配置');
  assert(page.includes('type="module" src="/app.js"'), '页面没有以模块方式加载前端脚本');
  assert(page.includes('resetBtn'), '页面缺少重置按钮');
  assert(page.includes('confirmResetBtn'), '页面缺少确认重置按钮');
  assert(page.includes('value="relativeWalk"'), '动作序列缺少按方向前进动作');
  assert(page.includes('value="findEntity"'), '动作序列缺少寻找实体/NPC 动作');
  assert(page.includes('value="moveSlot"'), '动作序列缺少移动背包槽位动作');
  assert(page.includes('value="clickItem"'), '动作序列缺少按物品名点击菜单动作');
  assert(page.includes('value="operateWindow"'), '动作序列缺少操作点击窗口动作');
  assert(page.includes('value="pressKey"'), '动作序列缺少按下按键动作');
  assert(page.includes('value="waitChat"'), '动作序列缺少等待聊天内容动作');
  assert(page.includes('value="clickChat"'), '动作序列缺少点击聊天按钮动作');
  assert(page.includes('positionSnapshotTitle'), '大厅功能缺少当前坐标显示');
  assert(!page.includes('entitySnapshotTitle'), '大厅功能不应再单独展示实体统计区');
  assert(!page.includes('entitySnapshotList'), '大厅功能不应再铺开实体卡片列表');
  assert(page.includes('windowGrid'), '大厅功能缺少 NPC 弹窗槽位列表');
  assert(!page.includes('windowContentList'), '大厅功能不应重复显示两套 NPC 弹窗内容');
  assert(!page.includes('chatMessageSnapshot'), '大厅功能不应继续显示最近对话');
  assert(page.includes('windowSnapshotToggle'), '大厅功能缺少协议快照收放按钮');
  assert(page.includes('saveAutomationBtn'), '大厅功能缺少自动化方案保存按钮');
  assert(page.includes('class="primary small execute-lobby-action"'), '大厅动作缺少即时执行按钮');
  assert(page.includes('<select class="lobby-action-entity">'), '寻找实体/NPC 没有使用扫描结果下拉框');
  assert(page.includes('<select class="lobby-action-item">'), '弹窗按钮没有使用协议窗口下拉框');
  assert(page.includes('class="lobby-action-key"'), '按下按键动作缺少按键输入框');
  assert(page.includes('class="lobby-action-response-timeout"'), '寻找 NPC 动作缺少交互响应等待参数');
  assert(page.includes('class="lobby-action-step-block"'), '大厅动作没有使用独立步骤块');
  assert(page.includes('class="lobby-action-connector"'), '大厅步骤之间缺少连接节点');
  assert(page.includes('class="insert-lobby-action"'), '每个大厅步骤后缺少加号动作按钮');
  assert(page.includes('aria-label="在此步骤后添加动作"'), '加号动作按钮缺少用途说明');

  const appScript = await requestText('/app.js');
  const apiClientScript = await requestText('/api-client.js');
  assert(appScript.includes("from './api-client.js'"), '前端入口没有导入统一 API 客户端');
  assert(appScript.includes('已加入执行端发送队列'), '前端发送成功提示没有准确表达队列接收语义');
  assert(appScript.includes('挂机初始化中'), '前端缺少执行端初始化状态提示');
  assert(apiClientScript.includes('export async function requestJson'), '统一 API 客户端静态资源不可用');
  assert(appScript.includes('slotIndex <= 80'), '交互窗口没有固定渲染 0-80 槽位网格');
  assert(appScript.includes('步骤已在 ${target} 执行完成'), '即时动作完成后没有刷新坐标和窗口');
  assert(appScript.includes('最近模组界面：'), '前端没有显示最近检测到的模组界面协议');
  assert(appScript.includes('data.protocolMenu || null'), '前端没有接收 DragonCore 菜单映射');
  assert(appScript.includes('dataset.protocolEntry'), '前端没有保留 DragonCore 按钮来源标记');
  assert(appScript.includes('当前模组界面：'), '前端没有显示 DragonCore 可选择按钮界面');
  assert(appScript.includes('block.after(createLobbyAction(defaultLobbyAction()))'), '步骤后的添加动作按钮没有按当前位置插入');
  assert(appScript.includes('配置已保存并实时应用；服务器和账号下次启动生效'), '运行中保存提示没有区分实时配置与下次启动配置');
  assert(appScript.includes('已重置为默认配置并实时应用'), '运行中重置提示没有表达实时应用结果');
  const dashboardSource = fs.readFileSync(path.join(projectRoot, 'src', 'dashboard.js'), 'utf8');
  const executionSource = fs.readFileSync(path.join(projectRoot, 'src', 'index.js'), 'utf8');
  assert(dashboardSource.includes("process.once('SIGINT'"), 'Dashboard 缺少 SIGINT 优雅退出处理');
  assert(dashboardSource.includes("process.once('SIGTERM'"), 'Dashboard 缺少 SIGTERM 优雅退出处理');
  assert(executionSource.includes("process.once('SIGINT'"), '执行端缺少 SIGINT 优雅退出处理');
  assert(executionSource.includes("process.once('SIGTERM'"), '执行端缺少 SIGTERM 优雅退出处理');

  const rendererScript = await requestText('/log-renderer.js');
  assert(rendererScript.includes('renderMinecraftText'), '缺少 MC 日志渲染模块');

  const workbenchStyles = await requestText('/workbench.css');
  assert(page.includes('/workbench.css'), '首页没有加载全新工作台视觉层');
  assert(page.includes('command-bar'), '全新工作台缺少顶部命令栏');
  assert(page.includes('sidebar-rail-label'), '全新工作台缺少品牌导航轨道');
  assert(workbenchStyles.includes('--wb-lime: #c8f135'), '工作台缺少荧光黄主操作色');
  assert(workbenchStyles.includes('grid-template-columns: 304px minmax(0, 1fr)'), '桌面端缺少双层导航工作台布局');
  assert(workbenchStyles.includes('grid-template-columns: 68px minmax(0,1fr)'), '手机端侧栏没有固定在左侧');
  assert(workbenchStyles.includes('@keyframes wb-page-in'), '工作台缺少页面进入动效');

  const styles = await requestText('/styles.css');
  const managerScript = fs.readFileSync(path.join(projectRoot, 'deploy', 'ly-afk-manager.sh'), 'utf8');
  const bootstrapScript = fs.readFileSync(path.join(projectRoot, 'deploy', 'bootstrap.sh'), 'utf8');
  assert(styles.includes('grid-template-columns: repeat(5, minmax(0, 1fr))'), '大厅步骤没有按每排五张卡片布局');
  assert(styles.includes('.lobby-action-step-block:nth-child(5n) .lobby-action-connector'), '每排第五张步骤卡缺少换行连接节点');
  assert(managerScript.includes('v1.0.40'), '管理脚本版本没有更新到 v1.0.40');
  assert(bootstrapScript.includes('EXPECTED_MANAGER_VERSION="v1.0.40"'), '启动脚本期望版本没有更新到 v1.0.40');
  assert(styles.includes('--accent: #ed6a5a'), '新视觉系统缺少珊瑚强调色');
  assert(styles.includes('grid-template-columns: 68px minmax(0, 1fr)'), '手机端侧栏没有固定在左侧');
  assert(styles.includes('@keyframes status-pulse'), '控制台在线状态缺少呼吸动效');
  assert(managerScript.includes('exec bash ./deploy/ly-afk-manager.sh'), '管理脚本生成的 j 快捷命令仍依赖执行权限');
  assert(bootstrapScript.includes('exec sudo bash ./deploy/ly-afk-manager.sh'), '启动脚本生成的 j 快捷命令没有通过 bash 启动');
  assert(bootstrapScript.includes('run_interactive $SUDO bash ./deploy/ly-afk-manager.sh'), '首次部署仍直接执行管理脚本');
  assert(managerScript.includes('start_or_restart_dashboard_service'), '管理脚本缺少按 .env 重新载入 PM2 的入口');
  assert(managerScript.includes('15. 修复公网 IP + 端口访问'), '管理脚本缺少公网端口修复菜单');
  assert(managerScript.includes('set_env_value "DASHBOARD_HOST" "0.0.0.0"'), '公网端口修复没有设置 0.0.0.0 监听');

  const exampleConfig = JSON.parse(fs.readFileSync(exampleConfigPath, 'utf8'));
  const testConfig = {
    ...exampleConfig,
    server: { ...exampleConfig.server, host: '127.0.0.1', port: 9, auth: 'offline' },
    runtime: {
      ...exampleConfig.runtime,
      connectIntervalMs: 1000,
      reconnect: false,
      reconnectDelayMs: 1000,
      idleActions: false
    },
    features: {
      ...exampleConfig.features,
      combat: {
        ...exampleConfig.features.combat,
        autoAttack: true,
        autoEat: true,
        autoFish: false,
        autoRespawn: true,
        attackRange: 4,
        eatThreshold: 16
      },
      movement: {
        ...exampleConfig.features.movement,
        antiAfk: true,
        antiAfkMinDelayMs: 1000,
        antiAfkMaxDelayMs: 1200,
        antiAfkWalk: true,
        antiAfkWalkRange: 3
      },
      chat: {
        ...exampleConfig.features.chat,
        keywordReply: true,
        remoteCommand: false,
        keywordRules: [{ keyword: 'ping', reply: 'pong {player}' }],
        presetMessagesList: ['/spawn', '大家好']
      },
      scheduler: {
        enabled: true,
        tasks: [{ name: 'smoke', trigger: 'login', intervalMs: 1000, action: '/spawn', enabled: true }]
      }
    },
    accounts: [{ username: 'SmokeBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: 'pass123' }]
  };

  await requestJson('/api/config', { method: 'POST', body: JSON.stringify(testConfig) });
  const saved = await requestJson('/api/config');
  assert(saved.config.features.scheduler.enabled === true, '配置保存后缺少 scheduler.enabled');
  const profilesBeforeSave = await requestJson('/api/profiles');
  assert(profilesBeforeSave.profiles.some((profile) => profile.id === 'default'), '配置档案缺少默认档案');
  const profilesDir = path.join(tempDir, 'bot.config.profiles');
  const outsideProfilePath = path.join(tempDir, 'outside.json');
  fs.writeFileSync(outsideProfilePath, JSON.stringify(testConfig), 'utf8');
  fs.writeFileSync(
    path.join(profilesDir, 'profiles.json'),
    JSON.stringify({
      activeProfileId: '../outside',
      profiles: [{ id: '../outside', name: 'Outside', updatedAt: new Date().toISOString() }]
    }),
    'utf8'
  );
  const sanitizedProfiles = await requestJson('/api/profiles');
  assert(!sanitizedProfiles.profiles.some((profile) => profile.id === '../outside'), '恶意档案 ID 没有从索引中过滤');
  assert(sanitizedProfiles.activeProfileId === 'default', '恶意当前档案 ID 没有回退到默认档案');
  const maliciousProfileUse = await requestJson('/api/profiles/use', {
    method: 'POST',
    body: JSON.stringify({ id: '../outside' }),
    expectOk: false
  });
  assert(maliciousProfileUse.ok === false && maliciousProfileUse.message.includes('找不到'), '恶意档案 ID 可以被载入');
  assert(fs.existsSync(outsideProfilePath), '恶意档案索引影响了档案目录外文件');
  fs.writeFileSync(path.join(profilesDir, 'profiles.json'), '{broken-index', 'utf8');
  const recoveredProfiles = await requestJson('/api/profiles');
  assert(recoveredProfiles.profiles.some((profile) => profile.id === 'default'), '损坏档案索引没有恢复默认档案');
  const recoveryDir = path.join(profilesDir, 'recovery');
  assert(
    fs.readdirSync(recoveryDir).some((name) => name.startsWith('profiles.json.') && name.endsWith('.corrupt.bak')),
    '损坏档案索引没有保留恢复备份'
  );
  const namedProfile = await requestJson('/api/profiles', {
    method: 'POST',
    body: JSON.stringify({ id: '', name: 'Smoke Profile', config: testConfig })
  });
  assert(namedProfile.activeProfileId !== 'default', '保存命名配置档案后没有切换到新档案');
  assert(namedProfile.profiles.some((profile) => profile.name === 'Smoke Profile'), '保存后配置档案列表缺少自定义名称');
  const updatedNamedProfile = await requestJson('/api/profiles', {
    method: 'POST',
    body: JSON.stringify({ id: namedProfile.activeProfileId, name: 'Updated Smoke Profile', config: testConfig })
  });
  assert(updatedNamedProfile.profiles.length === namedProfile.profiles.length, '合法配置档案 ID 更新时错误创建了副本');
  assert(
    updatedNamedProfile.profiles.some((profile) => profile.id === namedProfile.activeProfileId && profile.name === 'Updated Smoke Profile'),
    '合法配置档案 ID 没有更新原档案'
  );
  const profileFilesBeforeInvalidSave = fs.readdirSync(profilesDir).filter((name) => name.endsWith('.json')).sort();
  const invalidProfileIdType = await requestJson('/api/profiles', {
    method: 'POST',
    body: JSON.stringify({ id: true, name: 'Invalid ID Type', config: testConfig }),
    expectOk: false
  });
  assert(
    invalidProfileIdType.ok === false
      && invalidProfileIdType.message?.includes('ID')
      && invalidProfileIdType.message.includes('文本'),
    '保存接口没有拒绝非文本配置档案 ID'
  );
  const invalidProfileId = await requestJson('/api/profiles', {
    method: 'POST',
    body: JSON.stringify({ id: '../invalid', name: 'Invalid ID', config: testConfig }),
    expectOk: false
  });
  assert(invalidProfileId.ok === false && invalidProfileId.message.includes('ID 无效'), '保存接口没有拒绝非法配置档案 ID');
  const missingProfileId = await requestJson('/api/profiles', {
    method: 'POST',
    body: JSON.stringify({ id: 'profile-missing', name: 'Missing ID', config: testConfig }),
    expectOk: false
  });
  assert(missingProfileId.ok === false && missingProfileId.message.includes('找不到'), '保存接口没有拒绝不存在的配置档案 ID');
  const profilesAfterInvalidSave = await requestJson('/api/profiles');
  assert(profilesAfterInvalidSave.profiles.length === namedProfile.profiles.length, '非法配置档案 ID 错误创建了新档案');
  assert(
    JSON.stringify(fs.readdirSync(profilesDir).filter((name) => name.endsWith('.json')).sort()) === JSON.stringify(profileFilesBeforeInvalidSave),
    '非法配置档案 ID 错误创建了档案文件'
  );
  const loadedProfile = await requestJson('/api/profiles/use', {
    method: 'POST',
    body: JSON.stringify({ id: namedProfile.activeProfileId })
  });
  assert(loadedProfile.config.server.host === '127.0.0.1', '载入配置档案后服务器地址不正确');
  const disposableProfile = await requestJson('/api/profiles', {
    method: 'POST',
    body: JSON.stringify({ name: 'Disposable Profile', config: testConfig })
  });
  const deletedProfile = await requestJson('/api/profiles/delete', {
    method: 'POST',
    body: JSON.stringify({ id: disposableProfile.activeProfileId })
  });
  assert(
    !deletedProfile.profiles.some((profile) => profile.id === disposableProfile.activeProfileId),
    '删除配置档案后列表仍保留已删除档案'
  );
  const missingDeletedProfile = await requestJson('/api/profiles/use', {
    method: 'POST',
    body: JSON.stringify({ id: disposableProfile.activeProfileId }),
    expectOk: false
  });
  assert(missingDeletedProfile.ok === false && missingDeletedProfile.message.includes('找不到'), '已删除配置档案仍可载入');
  await requestJson('/api/profiles/use', {
    method: 'POST',
    body: JSON.stringify({ id: namedProfile.activeProfileId })
  });
  const automationPath = path.join(tempDir, 'bot.config.automations.json');
  const validStoredAutomation = {
    id: 'automation-valid',
    name: 'Valid Stored Automation',
    lobby: testConfig.features.lobby,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(
    automationPath,
    JSON.stringify({ version: 1, automations: [null, validStoredAutomation, { id: '../invalid' }, validStoredAutomation] }),
    'utf8'
  );
  const malformedAutomations = await requestJson('/api/automations');
  assert(malformedAutomations.automations.length === 1, '清理结构错误条目时没有保留唯一合法自动化方案');
  assert(malformedAutomations.automations[0].id === validStoredAutomation.id, '清理后保留的自动化方案不正确');
  const invalidAutomationId = await requestJson('/api/automations', {
    method: 'POST',
    body: JSON.stringify({ id: '../invalid', name: 'Invalid ID', lobby: testConfig.features.lobby }),
    expectOk: false
  });
  assert(invalidAutomationId.message.includes('ID 无效'), '保存接口没有拒绝非法自动化方案 ID');
  const invalidAutomationIdType = await requestJson('/api/automations', {
    method: 'POST',
    body: JSON.stringify({ id: true, name: 'Invalid ID Type', lobby: testConfig.features.lobby }),
    expectOk: false
  });
  assert(
    invalidAutomationIdType.ok === false
      && invalidAutomationIdType.message?.includes('ID')
      && invalidAutomationIdType.message.includes('文本'),
    '保存接口没有拒绝非文本自动化方案 ID'
  );
  const automationsAfterInvalidIdType = await requestJson('/api/automations');
  assert(automationsAfterInvalidIdType.automations.length === 1, '非文本自动化方案 ID 错误创建了新方案');
  fs.writeFileSync(automationPath, '{broken-automations', 'utf8');
  const recoveredAutomations = await requestJson('/api/automations');
  assert(recoveredAutomations.automations.length === 0, '损坏自动化库没有恢复为空方案库');
  assert(
    fs.readdirSync(recoveryDir).filter((name) => name.startsWith('bot.config.automations.json.') && name.endsWith('.corrupt.bak')).length >= 2,
    '结构错误和语法损坏的自动化库没有分别保留恢复备份'
  );
  const savedAutomation = await requestJson('/api/automations', {
    method: 'POST',
    body: JSON.stringify({
      id: '',
      name: 'Smoke Automation',
      lobby: {
        ...testConfig.features.lobby,
        actionSequence: true,
        actions: [
          { type: 'waitChat', chatText: '请选择商品', timeoutMs: 5000, enabled: true },
          { type: 'clickChat', chatButton: '确认购买', timeoutMs: 5000, enabled: true }
        ]
      }
    })
  });
  assert(savedAutomation.automations.some((item) => item.name === 'Smoke Automation'), '自动化方案保存后没有出现在列表中');
  const updatedAutomation = await requestJson('/api/automations', {
    method: 'POST',
    body: JSON.stringify({
      id: savedAutomation.activeAutomationId,
      name: 'Updated Smoke Automation',
      lobby: savedAutomation.automations.find((item) => item.id === savedAutomation.activeAutomationId).lobby
    })
  });
  assert(updatedAutomation.automations.length === 1, '合法自动化方案 ID 更新时错误创建了副本');
  assert(updatedAutomation.automations[0].name === 'Updated Smoke Automation', '合法自动化方案 ID 没有更新原方案');
  const automationList = await requestJson('/api/automations');
  assert(automationList.automations[0].lobby.actions[1].type === 'clickChat', '自动化方案重新读取后动作内容不正确');
  assert(fs.existsSync(automationPath), '自动化方案没有写入独立持久化文件');
  const deletedAutomation = await requestJson('/api/automations/delete', {
    method: 'POST',
    body: JSON.stringify({ id: updatedAutomation.activeAutomationId })
  });
  assert(deletedAutomation.automations.length === 0, '自动化方案删除后仍然存在');
  assert(saved.config.runtime.messageCooldownMs === 1000, '配置保存后 messageCooldownMs 不正确');
  assert(saved.config.features.combat.autoRespawn === true, '配置保存后 autoRespawn 不正确');
  assert(saved.config.features.movement.antiAfkWalkRange === 3, '配置保存后 antiAfkWalkRange 不正确');
  assert(saved.config.features.combat.attackRange === 4, '配置保存后 attackRange 不正确');
  assert(saved.config.features.chat.presetMessagesList.includes('/spawn'), '配置保存后缺少预设消息');
  assert(saved.config.features.lobby.actions.some((action) => action.type === 'findEntity'), '配置保存后缺少寻找实体动作');
  assert(saved.config.accounts.length === 1, '配置保存后账号数量不正确');
  await requestJson('/api/config', {
    method: 'POST',
    body: JSON.stringify({
      ...testConfig,
      accountPool: [{ username: 'RegisteredBot', registerPassword: 'pass-pool', note: '已注册账号' }]
    })
  });
  const savedPool = await requestJson('/api/config');
  assert(savedPool.config.accountPool[0].note === '已注册账号', '账号池备注没有保存');
  await requestJson('/api/config', { method: 'POST', body: JSON.stringify(testConfig) });

  const invalid = await requestJson('/api/config', {
    method: 'POST',
    body: JSON.stringify({ ...testConfig, server: { ...testConfig.server, port: 70000 } }),
    expectOk: false
  });
  assert(invalid.ok === false && invalid.message.includes('端口'), '非法端口没有被拒绝');
  await expectInvalidConfig(
    { ...testConfig, server: { ...testConfig.server, port: true } },
    '服务器端口必须是数字',
    '布尔值服务器端口没有被拒绝'
  );
  await expectInvalidConfig(
    { ...testConfig, runtime: { ...testConfig.runtime, messageCooldownMs: null } },
    '消息冷却必须是数字',
    '空值消息冷却没有被拒绝'
  );
  await expectInvalidConfig(
    {
      ...testConfig,
      features: {
        ...testConfig.features,
        chat: { ...testConfig.features.chat, keywordRules: [null] }
      }
    },
    '关键词规则第 1 条必须是对象',
    '空值关键词规则没有返回稳定错误'
  );
  await expectInvalidConfig(
    { ...testConfig, constructor: { prototype: { polluted: true } } },
    '配置包含不允许的字段',
    '特殊配置键没有被拒绝'
  );
  const deeplyNestedConfig = structuredClone(testConfig);
  let nestedValue = deeplyNestedConfig;
  for (let depth = 0; depth < 65; depth += 1) {
    nestedValue.extension = {};
    nestedValue = nestedValue.extension;
  }
  await expectInvalidConfig(
    deeplyNestedConfig,
    '配置嵌套层级不能超过 64 层',
    '过深配置没有被拒绝'
  );

  await expectInvalidConfig(
    { ...testConfig, server: { ...testConfig.server, host: '   ' } },
    '服务器地址不能为空',
    '空白服务器地址没有被拒绝'
  );
  await expectInvalidConfig(
    { ...testConfig, server: { ...testConfig.server, host: 127001 } },
    '服务器地址必须是文本',
    '非文本服务器地址没有被拒绝'
  );

  await requestJson('/api/config', {
    method: 'POST',
    body: JSON.stringify({
      ...testConfig,
      server: { ...testConfig.server, host: '  127.0.0.1  ', version: ' auto ' },
      features: {
        ...testConfig.features,
        movement: { ...testConfig.features.movement, antiAfkCommand: '  /ping  ' }
      }
    })
  });
  const normalizedStrings = await requestJson('/api/config');
  assert(normalizedStrings.config.server.host === '127.0.0.1', '服务器地址保存时没有去掉首尾空格');
  assert(normalizedStrings.config.server.version === false, 'auto 版本没有规范化为 false');
  assert(normalizedStrings.config.features.movement.antiAfkCommand === '/ping', '防挂机命令保存时没有去掉首尾空格');
  await requestJson('/api/config', { method: 'POST', body: JSON.stringify(testConfig) });

  await expectInvalidConfig(
    { ...testConfig, accounts: testConfig.accounts.map((account) => ({ ...account, enabled: false })) },
    '启用',
    '全部账号禁用时没有被拒绝'
  );
  await expectInvalidConfig(
    { ...testConfig, runtime: { ...testConfig.runtime, messageCooldownMs: -1 } },
    '消息冷却',
    '消息冷却为负数时没有被拒绝'
  );
  await expectInvalidConfig(
    {
      ...testConfig,
      features: {
        ...testConfig.features,
        lobby: { ...testConfig.features.lobby, actions: [{ type: 'findEntity', entity: '', interact: 'right', enabled: true }] }
      }
    },
    '实体/NPC 名',
    '寻找实体动作缺少名称时没有被拒绝'
  );
  await expectInvalidConfig(
    { ...testConfig, accounts: { username: 'NotArray' } },
    '至少需要填写一个账号',
    '账号列表不是数组时没有被拒绝'
  );
  await expectInvalidConfig(
    { ...testConfig, accounts: [{ username: 123, enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }] },
    '用户名必须是文本',
    '账号名不是文本时没有被拒绝'
  );
  await expectInvalidConfig(
    { ...testConfig, accounts: [{ username: '   ', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }] },
    '缺少用户名',
    '空白账号名没有被拒绝'
  );
  await expectInvalidConfig(
    { ...testConfig, accounts: [
      { username: 'SameBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' },
      { username: ' SameBot ', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }
    ] },
    '账号名重复',
    '重复账号名没有被拒绝'
  );
  await expectInvalidConfig(
    { ...testConfig, features: { ...testConfig.features, combat: { ...testConfig.features.combat, attackMode: 'random' } } },
    '攻击模式',
    '非法攻击模式没有被拒绝'
  );
  await expectInvalidConfig(
    { ...testConfig, features: { ...testConfig.features, combat: { ...testConfig.features.combat, entityList: 'zombie' } } },
    '实体名单',
    '实体名单不是数组时没有被拒绝'
  );
  await expectInvalidConfig(
    { ...testConfig, features: { ...testConfig.features, combat: null } },
    '战斗挂机配置',
    '战斗挂机配置为 null 时没有被拒绝'
  );
  await expectInvalidConfig(
    { ...testConfig, features: { ...testConfig.features, chat: { ...testConfig.features.chat, remoteCommand: 'false' } } },
    '发送游戏信息 / 指令开关',
    '字符串布尔值没有被拒绝'
  );
  await expectInvalidConfig(
    { ...testConfig, features: { ...testConfig.features, combat: { ...testConfig.features.combat, autoRespawn: 'true' } } },
    '自动重生开关',
    '自动重生开关不是布尔值时没有被拒绝'
  );
  await expectInvalidConfig(
    { ...testConfig, features: { ...testConfig.features, chat: { ...testConfig.features.chat, keywordRules: { keyword: 'ping', reply: 'pong' } } } },
    '关键词规则',
    '关键词规则不是数组时没有被拒绝'
  );
  await expectInvalidConfig(
    { ...testConfig, features: { ...testConfig.features, movement: { ...testConfig.features.movement, antiAfkMinDelayMs: 2000, antiAfkMaxDelayMs: 1000 } } },
    '最大延迟',
    '防挂机最大延迟小于最小延迟时没有被拒绝'
  );
  await expectInvalidConfig(
    { ...testConfig, features: { ...testConfig.features, movement: { ...testConfig.features.movement, antiAfkWalk: 'true' } } },
    '防挂机随机走动开关',
    '防挂机随机走动开关不是布尔值时没有被拒绝'
  );
  await expectInvalidConfig(
    { ...testConfig, features: { ...testConfig.features, movement: { ...testConfig.features.movement, antiAfkWalkRange: -1 } } },
    '防挂机随机走动范围',
    '防挂机随机走动范围为负数时没有被拒绝'
  );
  await expectInvalidConfig(
    { ...testConfig, features: { ...testConfig.features, lobby: { ...testConfig.features.lobby, heldSlot: 9 } } },
    '大厅快捷栏槽位',
    '大厅快捷栏槽位越界没有被拒绝'
  );
  await expectInvalidConfig(
    { ...testConfig, features: { ...testConfig.features, scheduler: { enabled: true, tasks: [{ name: 'bad', trigger: 'daily', intervalMs: 1000, action: '/spawn', enabled: true }] } } },
    '触发方式',
    '非法定时任务触发方式没有被拒绝'
  );

  await requestJson('/api/config', {
    method: 'POST',
    body: JSON.stringify({
      ...testConfig,
      accounts: [
        { username: 'true', enabled: true, chatOnJoin: '', auth: '', registerPassword: 'pass123' },
        { username: 'SmokeBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: 'pass123' }
      ]
    })
  });
  const invalidStartAccountElement = await requestJson('/api/start', {
    method: 'POST',
    body: JSON.stringify({ accounts: [true] }),
    expectOk: false
  });
  assert(
    invalidStartAccountElement.ok === false && invalidStartAccountElement.message.includes('账号名称') && invalidStartAccountElement.message.includes('文本'),
    '非文本启动账号元素没有被 Dashboard 明确拒绝'
  );
  await requestJson('/api/config', { method: 'POST', body: JSON.stringify(testConfig) });

  const invalidStartAccount = await requestJson('/api/start', {
    method: 'POST',
    body: JSON.stringify({ accounts: ['MissingBot'] }),
    expectOk: false
  });
  assert(invalidStartAccount.ok === false && invalidStartAccount.message.includes('不存在或未启用'), '不存在的启动账号没有被拒绝');

  const invalidStartAccountsShape = await requestJson('/api/start', {
    method: 'POST',
    body: JSON.stringify({ accounts: 'SmokeBot' }),
    expectOk: false
  });
  assert(invalidStartAccountsShape.ok === false && invalidStartAccountsShape.message.includes('账号列表'), '非数组启动账号列表没有被拒绝');

  fs.writeFileSync(
    configPath,
    JSON.stringify({ ...testConfig, server: { ...testConfig.server, port: 70000 } }, null, 2),
    'utf8'
  );
  const invalidStart = await requestJson('/api/start', { method: 'POST', expectOk: false });
  assert(invalidStart.ok === false && invalidStart.message.includes('端口'), '启动前没有重新校验磁盘配置');
  await requestJson('/api/config', { method: 'POST', body: JSON.stringify(testConfig) });

  await requestJson('/api/start', { method: 'POST' });
  const runningStatus = await waitForLog('读取到 1 个启用账号');
  const runningLogs = runningStatus.logs.join('\n');
  assert(runningStatus.running === true, '启动后进程未保持运行');
  assert(!runningLogs.includes('TypeError'), '启动日志出现 TypeError');
  assert(!runningLogs.includes('ReferenceError'), '启动日志出现 ReferenceError');

  const emptySend = await requestJson('/api/send', {
    method: 'POST',
    body: JSON.stringify({ target: 'all', message: '   ' }),
    expectOk: false
  });
  assert(emptySend.ok === false && emptySend.message.includes('不能为空'), '空发送内容没有被拒绝');

  const manualSend = await requestJson('/api/send', {
    method: 'POST',
    body: JSON.stringify({ target: 'all', message: '/spawn' }),
    expectOk: false
  });
  assert(manualSend.ok === false && manualSend.message.includes('不在线'), '离线账号手动发送没有返回明确失败');

  await requestJson('/api/config', {
    method: 'POST',
    body: JSON.stringify({
      ...testConfig,
      features: {
        ...testConfig.features,
        chat: { ...testConfig.features.chat, remoteCommand: true }
      }
    })
  });

  const stopResponseBeforeRestart = await requestJson('/api/stop', { method: 'POST' });
  assert(stopResponseBeforeRestart.stopping === true || stopResponseBeforeRestart.running === false, '停止响应没有表达停止中或已停止状态');
  const startWhileStopping = await requestJson('/api/start', { method: 'POST', expectOk: false });
  assert(startWhileStopping.ok === false && startWhileStopping.message.includes('正在停止'), '停止中再次启动没有被明确拒绝');
  const restartedFromSavedConfig = await waitForStopped();
  assert(restartedFromSavedConfig.running === false, '切换远程发送配置前旧进程没有停止');
  assert(restartedFromSavedConfig.stopping === false, '旧进程停止后仍处于停止中状态');

  await requestJson('/api/start', { method: 'POST' });
  const duplicateStart = await requestJson('/api/start', { method: 'POST', expectOk: false });
  assert(duplicateStart.ok === false && duplicateStart.message.includes('已经运行'), '重复启动没有返回明确错误');
  await waitForLog('读取到 1 个启用账号');

  const restartedOfflineSend = await requestJson('/api/send', {
    method: 'POST',
    body: JSON.stringify({ target: 'all', message: '/spawn' }),
    expectOk: false
  });
  assert(restartedOfflineSend.message.includes('不在线'), '重启后离线账号发送没有返回明确失败');
  const sendStatus = await waitForLog('发送失败：账号不在线');
  assert(sendStatus.logs.join('\n').includes('发送失败：账号不在线'), '发送指令没有到达挂机进程');

  const stopResponse = await requestJson('/api/stop', { method: 'POST' });
  assert(stopResponse.stopping === true || stopResponse.running === false, '停止响应没有表达停止中或已停止状态');
  const stopped = await waitForStopped();
  assert(stopped.running === false, '停止后进程仍在运行');
  assert(stopped.stopping === false, '停止后仍处于停止中状态');

  const reset = await requestJson('/api/reset', { method: 'POST' });
  assert(reset.config.accounts.length === exampleConfig.accounts.length, '重置配置没有返回默认账号');
  const reloadedResetProfile = await requestJson('/api/profiles/use', {
    method: 'POST',
    body: JSON.stringify({ id: namedProfile.activeProfileId })
  });
  assert(
    reloadedResetProfile.config.accounts.length === exampleConfig.accounts.length,
    '重置后重新载入当前档案恢复了重置前的旧账号配置'
  );

  console.log('smoke test ok');
} finally {
  if (dashboard) dashboard.kill('SIGINT');
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestText(pathname) {
  return request(pathname).then(({ body }) => body);
}

function requestJson(pathname, options = {}) {
  return request(pathname, {
    method: options.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body
  }).then(({ body }) => {
    const data = JSON.parse(body);
    if (options.expectOk !== false && !data.ok) throw new Error(data.message || '请求失败');
    return data;
  });
}

function request(pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body || '';
    const req = http.request(
      `${baseUrl}${pathname}`,
      {
        method: options.method || 'GET',
        headers: {
          ...(options.headers || {}),
          ...(body && !options.omitContentLength ? { 'Content-Length': Buffer.byteLength(body) } : {})
        }
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function expectInvalidConfig(config, messageText, assertMessage) {
  const result = await requestJson('/api/config', {
    method: 'POST',
    body: JSON.stringify(config),
    expectOk: false
  });
  assert(result.ok === false && result.message.includes(messageText), assertMessage);
}

async function waitForDashboard() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const status = await requestJson('/api/status');
      if (status.ok) return;
    } catch {
      await delay(250);
    }
  }
  throw new Error(`管理面板启动超时\n${dashboardOutput}`);
}

async function waitForLog(text) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const status = await requestJson('/api/status');
    if (status.logs.join('\n').includes(text)) return status;
    await delay(250);
  }
  throw new Error(`等待日志超时：${text}`);
}

async function waitForStopped() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const status = await requestJson('/api/status');
    if (!status.running && !status.starting && !status.stopping) return status;
    await delay(250);
  }
  throw new Error('等待停止超时');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createPendingStartupTransaction() {
  const transactionId = 'smoke-crash';
  const oldConfig = JSON.parse(fs.readFileSync(exampleConfigPath, 'utf8'));
  oldConfig.server.host = 'recovered-old.example';
  const newConfig = structuredClone(oldConfig);
  newConfig.server.host = 'partial-new.example';
  const backupPath = path.join(tempDir, `.bot.config.json.transaction-${transactionId}-0.bak`);
  const tempPath = path.join(tempDir, `.bot.config.json.transaction-${transactionId}-0.tmp`);
  fs.mkdirSync(startupRecoveryDir, { recursive: true });
  fs.writeFileSync(backupPath, `${JSON.stringify(oldConfig, null, 2)}\n`, 'utf8');
  fs.writeFileSync(configPath, `${JSON.stringify(newConfig, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    path.join(startupRecoveryDir, `.json-transaction-${transactionId}.journal.json`),
    `${JSON.stringify({
      version: 1,
      id: transactionId,
      phase: 'pending',
      items: [{ filePath: configPath, tempPath, backupPath, delete: false, hadOriginal: true }]
    }, null, 2)}\n`,
    'utf8'
  );
}

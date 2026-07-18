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

let dashboard = null;
let dashboardOutput = '';

try {
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
  const initialStatus = await requestJson('/api/status');
  assert(initialStatus.control === null, '未启动时不应该返回运行控制快照');
  assert(initialStatus.stopping === false, '未启动时不应该处于停止中状态');

  const page = await requestText('/');
  assert(page.includes('LY挂机控制台'), '页面默认标题没有改成 LY挂机控制台');
  assert(page.includes('sidebarToggle'), '页面缺少侧边栏收放按钮');
  assert(page.includes('data-section="settings"'), '侧边栏缺少设置入口');
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
  assert(page.includes('duplicate-account'), '页面缺少复制账号按钮');
  assert(page.includes('copy-account-config'), '页面缺少同步账号配置按钮');
  assert(page.includes('presetSendList'), '页面缺少预设消息快捷发送区域');
  assert(page.includes('messageCooldownMs'), '页面缺少消息冷却配置');
  assert(page.includes('type="module" src="/app.js"'), '页面没有以模块方式加载前端脚本');
  assert(page.includes('resetBtn'), '页面缺少重置按钮');

  const rendererScript = await requestText('/log-renderer.js');
  assert(rendererScript.includes('renderMinecraftText'), '缺少 MC 日志渲染模块');

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
  assert(saved.config.runtime.messageCooldownMs === 1000, '配置保存后 messageCooldownMs 不正确');
  assert(saved.config.features.combat.autoRespawn === true, '配置保存后 autoRespawn 不正确');
  assert(saved.config.features.movement.antiAfkWalkRange === 3, '配置保存后 antiAfkWalkRange 不正确');
  assert(saved.config.features.combat.attackRange === 4, '配置保存后 attackRange 不正确');
  assert(saved.config.features.chat.presetMessagesList.includes('/spawn'), '配置保存后缺少预设消息');
  assert(saved.config.accounts.length === 1, '配置保存后账号数量不正确');

  const invalid = await requestJson('/api/config', {
    method: 'POST',
    body: JSON.stringify({ ...testConfig, server: { ...testConfig.server, port: 70000 } }),
    expectOk: false
  });
  assert(invalid.ok === false && invalid.message.includes('端口'), '非法端口没有被拒绝');

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

  const disabledRemoteSend = await requestJson('/api/send', {
    method: 'POST',
    body: JSON.stringify({ target: 'all', message: '/spawn' }),
    expectOk: false
  });
  assert(disabledRemoteSend.ok === false && disabledRemoteSend.message.includes('未启用'), '远程发送关闭时没有被拒绝');

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
  const restartedFromSavedConfig = await waitForStopped();
  assert(restartedFromSavedConfig.running === false, '切换远程发送配置前旧进程没有停止');
  assert(restartedFromSavedConfig.stopping === false, '旧进程停止后仍处于停止中状态');

  await requestJson('/api/start', { method: 'POST' });
  await waitForLog('读取到 1 个启用账号');

  await requestJson('/api/send', {
    method: 'POST',
    body: JSON.stringify({ target: 'all', message: '/spawn' })
  });
  const sendStatus = await waitForLog('发送失败：账号不在线');
  assert(sendStatus.logs.join('\n').includes('发送失败：账号不在线'), '发送指令没有到达挂机进程');

  const stopResponse = await requestJson('/api/stop', { method: 'POST' });
  assert(stopResponse.stopping === true || stopResponse.running === false, '停止响应没有表达停止中或已停止状态');
  const stopped = await waitForStopped();
  assert(stopped.running === false, '停止后进程仍在运行');
  assert(stopped.stopping === false, '停止后仍处于停止中状态');

  const reset = await requestJson('/api/reset', { method: 'POST' });
  assert(reset.config.accounts.length === exampleConfig.accounts.length, '重置配置没有返回默认账号');

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
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
        }
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
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
    if (!status.running) return status;
    await delay(250);
  }
  throw new Error('等待停止超时');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

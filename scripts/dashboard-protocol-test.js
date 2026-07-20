import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mc = require('minecraft-protocol');
const mcData = require('minecraft-data')('1.16.4');
const Chunk = require('prismarine-chunk')('1.16.4');
const Vec3 = require('vec3');
const projectRoot = path.resolve(import.meta.dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-afk-dashboard-'));
const configPath = path.join(tempDir, 'bot.config.json');
const dashboardPort = 35000 + Math.floor(Math.random() * 4000);
const minecraftPort = 41000 + Math.floor(Math.random() * 4000);
const dashboardUrl = `http://127.0.0.1:${dashboardPort}`;
const receivedMessages = [];
const joinedUsers = [];
const dashboardOutput = [];

let dashboardProcess = null;
let minecraftServer = null;

try {
  minecraftServer = createMinecraftServer(minecraftPort);
  await once(minecraftServer, 'listening');

  dashboardProcess = spawn(process.execPath, ['src/dashboard.js'], {
    cwd: projectRoot,
    env: { ...process.env, DASHBOARD_PORT: String(dashboardPort), BOT_CONFIG_PATH: configPath },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  dashboardProcess.stdout.on('data', (data) => dashboardOutput.push(data.toString()));
  dashboardProcess.stderr.on('data', (data) => dashboardOutput.push(data.toString()));

  await waitForDashboard();
  await requestJson('/api/config', {
    method: 'POST',
    body: JSON.stringify(createDashboardConfig(minecraftPort))
  });

  await requestJson('/api/start', { method: 'POST' });
  await waitForJoinedUsers(['DashboardBotA', 'DashboardBotB']);
  const initialRunningStatus = await requestJson('/api/status');
  assert(initialRunningStatus.control?.remoteCommand === true, '运行控制快照缺少远程发送开关');
  assert(
    initialRunningStatus.control.accounts.map((account) => account.username).join(',') === 'DashboardBotA,DashboardBotB',
    '运行控制快照账号列表不正确'
  );
  assert(initialRunningStatus.control.presetMessagesList.includes('/home'), '运行控制快照缺少预设消息');
  assert(!joinedUsers.includes('DisabledBot'), '禁用账号不应该连接服务器');
  await waitForMessageFrom('DashboardBotA', '/register pass-a pass-a');
  await waitForMessageFrom('DashboardBotB', '/register pass-b pass-b');
  await waitForMessageFrom('DashboardBotA', '/spawn');
  await waitForMessageFrom('DashboardBotB', '/spawn');
  await waitForMessageFrom('DashboardBotA', 'pong Tester');
  await waitForMessageFrom('DashboardBotB', 'pong Tester');
  await waitForDashboardLog('§a§l彩色提示');

  await requestJson('/api/send', {
    method: 'POST',
    body: JSON.stringify({ target: 'DashboardBotA', message: '/home-a' })
  });
  await waitForMessageFrom('DashboardBotA', '/home-a');
  assert(!hasMessageFrom('DashboardBotB', '/home-a'), '定向发送不应该发到 DashboardBotB');

  const disabledTarget = await requestJson('/api/send', {
    method: 'POST',
    body: JSON.stringify({ target: 'DisabledBot', message: '/disabled' }),
    expectOk: false
  });
  assert(disabledTarget.ok === false && disabledTarget.message.includes('不存在或未启用'), '禁用账号目标没有被拒绝');

  await requestJson('/api/send', {
    method: 'POST',
    body: JSON.stringify({ target: 'all', message: '/home-all' })
  });
  await waitForMessageFrom('DashboardBotA', '/home-all');
  await waitForMessageFrom('DashboardBotB', '/home-all');

  const remoteDisabledAfterStart = createDashboardConfig(minecraftPort);
  remoteDisabledAfterStart.features.chat.remoteCommand = false;
  await requestJson('/api/config', {
    method: 'POST',
    body: JSON.stringify(remoteDisabledAfterStart)
  });
  const remoteDisabledSavedStatus = await requestJson('/api/status');
  assert(remoteDisabledSavedStatus.control?.remoteCommand === true, '运行中保存远程发送关闭不应该改变当前控制快照');
  await requestJson('/api/send', {
    method: 'POST',
    body: JSON.stringify({ target: 'DashboardBotB', message: '/still-running-remote' })
  });
  await waitForMessageFrom('DashboardBotB', '/still-running-remote');

  const changedAccountsAfterStart = createDashboardConfig(minecraftPort);
  changedAccountsAfterStart.accounts = [
    { username: 'NewConfigBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: 'pass-new' }
  ];
  await requestJson('/api/config', {
    method: 'POST',
    body: JSON.stringify(changedAccountsAfterStart)
  });
  const changedAccountsSavedStatus = await requestJson('/api/status');
  assert(
    changedAccountsSavedStatus.control.accounts.map((account) => account.username).join(',') === 'DashboardBotA,DashboardBotB',
    '运行中保存新账号列表不应该改变当前控制快照'
  );
  await requestJson('/api/send', {
    method: 'POST',
    body: JSON.stringify({ target: 'DashboardBotB', message: '/still-old-target' })
  });
  await waitForMessageFrom('DashboardBotB', '/still-old-target');

  const newConfigTarget = await requestJson('/api/send', {
    method: 'POST',
    body: JSON.stringify({ target: 'NewConfigBot', message: '/new-config-target' }),
    expectOk: false
  });
  assert(newConfigTarget.ok === false && newConfigTarget.message.includes('不存在或未启用'), '运行中保存的新账号不应该成为当前发送目标');

  const runningStatus = await requestJson('/api/status');
  assert(runningStatus.running === true, 'dashboard 启动后没有保持运行状态');
  assert(runningStatus.stopping === false, 'dashboard 启动后不应该处于停止中状态');
  const runningLogs = runningStatus.logs.join('\n');
  assert(runningLogs.includes('已进入服务器'), 'dashboard 日志没有收到执行端进服日志');
  assert(!runningLogs.includes('TypeError'), 'dashboard 日志包含 TypeError');
  assert(!runningLogs.includes('ReferenceError'), 'dashboard 日志包含 ReferenceError');

  const stopResponse = await requestJson('/api/stop', { method: 'POST' });
  assert(stopResponse.stopping === true || stopResponse.running === false, '停止响应没有表达停止中或已停止状态');
  const stoppedStatus = await waitForStopped();
  assert(stoppedStatus.running === false, 'dashboard 停止后执行端仍在运行');
  assert(stoppedStatus.stopping === false, 'dashboard 停止后仍处于停止中状态');
  assert(stoppedStatus.control === null, '停止后不应该保留运行控制快照');

  console.log('dashboard protocol test ok');
} finally {
  if (dashboardProcess && dashboardProcess.exitCode === null) {
    try {
      await requestJson('/api/stop', { method: 'POST' });
      await waitForStopped(3000);
    } catch {}
    dashboardProcess.kill('SIGINT');
  }
  if (minecraftServer) minecraftServer.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function createDashboardConfig(port) {
  return {
    server: {
      host: '127.0.0.1',
      port,
      version: '1.16.4',
      auth: 'offline'
    },
    runtime: {
      connectIntervalMs: 1000,
      reconnect: false,
      reconnectDelayMs: 1000,
      idleActions: false,
      idleIntervalMs: 45000,
      messageCooldownMs: 250,
      chatOnJoin: ''
    },
    features: {
      combat: {
        autoAttack: false,
        autoFish: false,
        autoEat: false,
        autoRespawn: true,
        attackMode: 'single',
        attackHostile: true,
        attackPassive: false,
        attackRange: 4,
        attackIntervalMs: 500,
        entityListMode: 'blacklist',
        entityList: ['armor_stand'],
        eatThreshold: 16,
        fishingStartDelayMs: 3000,
        fishingCastDelayMs: 1200,
        fishingTimeoutMs: 300000
      },
      movement: {
        autoWalk: false,
        antiAfk: false,
        switchHeldItem: false,
        antiAfkMinDelayMs: 1000,
        antiAfkMaxDelayMs: 1200,
        antiAfkCommand: '',
        antiAfkSneak: false,
        antiAfkWalk: true,
        antiAfkWalkRange: 3,
        walkTarget: { x: 0, y: 64, z: 0 },
        walkRange: 1,
        heldSlot: 0
      },
      chat: {
        keywordReply: true,
        presetMessages: true,
        remoteCommand: true,
        autoLogin: true,
        keywordRules: [{ keyword: 'ping', reply: 'pong {player}' }],
        presetMessagesList: ['/home']
      },
      lobby: {
        useItem: false,
        delayMs: 3000,
        heldSlot: 0,
        useCount: 1
      },
      scheduler: {
        enabled: true,
        tasks: [{ name: 'dashboard-login', trigger: 'login', intervalMs: 60000, action: '/spawn', enabled: true }]
      }
    },
    accounts: [
      { username: 'DashboardBotA', enabled: true, chatOnJoin: '', auth: '', registerPassword: 'pass-a' },
      { username: 'DashboardBotB', enabled: true, chatOnJoin: '', auth: '', registerPassword: 'pass-b' },
      { username: 'DisabledBot', enabled: false, chatOnJoin: '', auth: '', registerPassword: 'pass-disabled' }
    ]
  };
}

function createMinecraftServer(port) {
  const chunk = createFlatChunk();
  const server = mc.createServer({
    'online-mode': false,
    hideErrors: true,
    host: '127.0.0.1',
    port,
    version: '1.16.4',
    motd: 'pcl-afk-bot dashboard bridge'
  });

  server.on('playerJoin', (client) => {
    const username = getClientUsername(client);
    joinedUsers.push(username);

    client.write('login', {
      ...mcData.loginPacket,
      entityId: client.id,
      isHardcore: false,
      gameMode: 0,
      previousGameMode: 1,
      hashedSeed: [0, 0],
      maxPlayers: 10,
      viewDistance: 10,
      reducedDebugInfo: false,
      enableRespawnScreen: true,
      isDebug: false,
      isFlat: false
    });

    client.write('map_chunk', {
      x: 0,
      z: 0,
      groundUp: true,
      biomes: chunk.dumpBiomes ? chunk.dumpBiomes() : undefined,
      heightmaps: {
        type: 'compound',
        name: '',
        value: {}
      },
      bitMap: chunk.getMask(),
      chunkData: chunk.dump(),
      blockEntities: []
    });

    client.write('position', {
      x: 1,
      y: 64,
      z: 1,
      yaw: 0,
      pitch: 0,
      flags: 0
    });

    client.write('update_health', {
      health: 20,
      food: 20,
      foodSaturation: 5
    });

    client.on('chat', (packet) => {
      receivedMessages.push({ username, message: packet.message });
    });

    setTimeout(() => sendSystemChat(client, '[玩家系统] 请输入“/register <密码> <再输入一次以确定密码>”以注册'), 250);
    setTimeout(() => sendSystemChat(client, '[玩家系统] 请输入“/register <密码> <再输入一次以确定密码>”以注册'), 650);
    setTimeout(() => sendPlayerChat(client, 'Tester', 'ping'), 500);
    setTimeout(() => sendColoredSystemChat(client), 700);
  });

  return server;
}

function createFlatChunk() {
  const chunk = new Chunk();
  for (let x = 0; x < 16; x += 1) {
    for (let z = 0; z < 16; z += 1) {
      chunk.setBlockType(new Vec3(x, 63, z), mcData.blocksByName.grass_block.id);
      for (let y = 0; y < 256; y += 1) {
        chunk.setSkyLight(new Vec3(x, y, z), 15);
      }
    }
  }
  return chunk;
}

function sendSystemChat(client, text) {
  client.write('chat', {
    message: JSON.stringify({ text }),
    position: 0,
    sender: '00000000-0000-0000-0000-000000000000'
  });
}

function sendColoredSystemChat(client) {
  client.write('chat', {
    message: JSON.stringify({
      text: '彩色提示',
      color: 'green',
      bold: true,
      extra: [{ text: ' <unsafe>', color: 'red' }]
    }),
    position: 0,
    sender: '00000000-0000-0000-0000-000000000002'
  });
}

function sendPlayerChat(client, username, text) {
  client.write('chat', {
    message: JSON.stringify({
      translate: 'chat.type.text',
      with: [username, text]
    }),
    position: 0,
    sender: '00000000-0000-0000-0000-000000000001'
  });
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
  throw new Error(`dashboard 启动超时\n${dashboardOutput.join('')}`);
}

async function waitForJoinedUsers(expectedUsers) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (expectedUsers.every((username) => joinedUsers.includes(username))) return;
    await delay(100);
  }
  throw new Error(`等待批量账号进入服务器超时：${expectedUsers.join(', ')}\n已进入：${joinedUsers.join(', ')}\ndashboard 输出：${dashboardOutput.join('')}`);
}

async function waitForMessageFrom(username, expected) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (hasMessageFrom(username, expected)) return;
    await delay(100);
  }
  const formatted = receivedMessages.map((item) => `${item.username}: ${item.message}`).join(', ');
  throw new Error(`等待 MC 服务器收到消息超时：${username} -> ${expected}\n已收到：${formatted}\ndashboard 输出：${dashboardOutput.join('')}`);
}

async function waitForDashboardLog(expected) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const status = await requestJson('/api/status');
    if (status.logs.join('\n').includes(expected)) return status;
    await delay(100);
  }
  const status = await requestJson('/api/status');
  throw new Error(`等待 dashboard 日志超时：${expected}\n当前日志：${status.logs.join('\n')}\ndashboard 输出：${dashboardOutput.join('')}`);
}

function hasMessageFrom(username, expected) {
  return receivedMessages.some((item) => item.username === username && item.message === expected);
}

function getClientUsername(client) {
  return client.username || client.profile?.name || `client-${joinedUsers.length + 1}`;
}

async function waitForStopped(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await requestJson('/api/status');
    if (!status.running) return status;
    await delay(250);
  }
  throw new Error('等待 dashboard 停止执行端超时');
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
      `${dashboardUrl}${pathname}`,
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

function once(emitter, event, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`等待事件超时：${event}`));
    }, timeoutMs);
    const handler = (...args) => {
      cleanup();
      resolve(args);
    };
    const cleanup = () => {
      clearTimeout(timer);
      emitter.off(event, handler);
      emitter.off('error', errorHandler);
    };
    const errorHandler = (error) => {
      cleanup();
      reject(error);
    };
    emitter.once(event, handler);
    emitter.once('error', errorHandler);
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
const Item = require('prismarine-item')('1.16.4');
const Vec3 = require('vec3');
const projectRoot = path.resolve(import.meta.dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-afk-dashboard-'));
const configPath = path.join(tempDir, 'bot.config.json');
const dashboardPort = 35000 + Math.floor(Math.random() * 4000);
const minecraftPort = 41000 + Math.floor(Math.random() * 4000);
const dashboardUrl = `http://127.0.0.1:${dashboardPort}`;
const receivedMessages = [];
const receivedMovementPackets = [];
const receivedWindowClicks = [];
const receivedEntityInteractions = [];
const joinedUsers = [];
const disconnectedUsers = [];
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
  await waitForMessageFrom('DashboardBotA', '/daily-reward');
  await waitForMessageFrom('DashboardBotB', '/daily-reward');
  await waitForDashboardLog('§a§l彩色提示');
  await waitForDashboardLog('窗口按钮/菜单项 [选择服务器]');
  const protocolSnapshot = await requestJson('/api/window?target=DashboardBotA');
  assert(protocolSnapshot.position?.x === 1 && protocolSnapshot.position?.y === 64, '协议快照没有返回当前坐标');
  assert(protocolSnapshot.messages.some((item) => item.text.includes('领取奖励')), '协议快照没有返回最近聊天内容');
  assert(protocolSnapshot.chatButtons.some((item) => item.value === '/daily-reward'), '协议快照没有识别聊天 clickEvent 按钮');
  assert(protocolSnapshot.protocolDialogs.some((item) => item.packetType === 'DIALOG' && item.dialogId === 77), '协议快照没有识别 CustomNPCs 对话协议');
  assert(protocolSnapshot.protocolDialogs.some((item) => item.channel === 'dragoncore:main' && item.text.includes('新手福利')), '协议快照过滤掉了有效 DragonCore NPC 菜单内容');
  assert(!protocolSnapshot.protocolDialogs.some((item) => /更新数据|team_expand_|playertag_/i.test(item.text)), '协议快照没有过滤 DragonCore HUD 更新噪声');
  assert(protocolSnapshot.protocolMenu?.title === '选服', '协议快照没有解析 DragonCore 界面名称');
  assert(
    protocolSnapshot.protocolMenu?.entries.some((entry) => entry.name === '新手福利七日签到' && entry.slot === 20),
    '协议快照没有把 DragonCore 按钮名称映射到槽位'
  );
  await waitForDashboardLog('模组对话协议 [CustomNPCs]：实体 ID 9102，对话 ID 77');
  await waitForDashboardLog('DragonCore 界面 [选服]');
  assert(protocolSnapshot.window?.title === '选择服务器', '协议快照没有返回 NPC 交互窗口标题');
  assert(protocolSnapshot.window?.slots[11]?.displayName === '进入一号服务器', '协议快照没有解析菜单物品名称');
  assert(protocolSnapshot.window?.slots[11]?.lore.includes('点击进入'), '协议快照没有解析菜单 Lore 提示');
  const visibleEntityText = protocolSnapshot.entities.map((entity) => `${entity.name} ${entity.type}`).join(' | ').toLowerCase();
  assert(visibleEntityText.includes('zombie'), `协议快照没有保留普通实体：${visibleEntityText}`);
  assert(!visibleEntityText.replace(/[\s_-]/g, '').includes('armorstand'), '协议快照没有过滤 Armor Stand');
  const menuLogStatus = await requestJson('/api/status');
  const menuLogs = menuLogStatus.logs.join('\n');
  const initialMenuEntries = menuLogStatus.logs.filter((line) => line.includes('窗口按钮/菜单项 [选择服务器]'));
  assert(menuLogs.includes('窗口按钮/菜单项 [选择服务器] 1：槽位 11；进入一号服务器 x1；提示：点击进入 / 当前 12 人'), '运行日志缺少 NPC 菜单文字和提示');
  assert(initialMenuEntries.length === 1, `选择服务器菜单应该只输出一个有效按钮，实际输出 ${initialMenuEntries.length} 行`);
  assert(!menuLogs.includes('交互窗口：选择服务器，检测到'), '运行日志不应重复输出交互窗口统计摘要');
  assert(!menuLogs.includes('玩家背包测试物品'), '运行日志不应把玩家背包物品当成 NPC 菜单项');
  assert(!menuLogs.includes('Stained Glass Pane'), '运行日志不应输出没有自定义名称和提示的玻璃板装饰槽位');
  assert(!/更新数据|team_expand_|playertag_|YeeCombatView/i.test(menuLogs), '运行日志不应输出 DragonCore HUD、血条或玩家标签更新');
  assert(!menuLogs.includes('模组界面协议 [dragoncore:main]'), '运行日志不应逐条输出 DragonCore 原始载荷');
  assert(menuLogs.includes('DragonCore 界面 [选服]：识别到 1 个可操作项：槽位 20 新手福利七日签到'), '运行日志缺少精简后的 DragonCore 可操作按钮摘要');

  const rightInteractionStart = receivedEntityInteractions.length;
  const delayedWindowResult = await requestJson('/api/lobby/action', {
    method: 'POST',
    body: JSON.stringify({
      target: 'DashboardBotA',
      action: { type: 'findEntity', entity: 'zombie', entityId: 9102, range: 2, interact: 'right', responseTimeoutMs: 2500, enabled: true }
    })
  });
  await waitForEntityInteraction(rightInteractionStart, 9102, [0, 2]);
  assert(delayedWindowResult.window?.title === '邀请系统', 'NPC 交互后延迟打开的标准菜单没有被动作回执捕获');
  assert(delayedWindowResult.window?.slots[13]?.displayName === '邀请好友', '延迟打开的邀请系统菜单内容没有被解析');
  await waitForDashboardLog('窗口按钮/菜单项 [邀请系统] 2：槽位 13；邀请好友 x1；提示：点击选择在线玩家');

  const leftInteractionStart = receivedEntityInteractions.length;
  const restoredWindowResult = await requestJson('/api/lobby/action', {
    method: 'POST',
    body: JSON.stringify({
      target: 'DashboardBotA',
      action: { type: 'findEntity', entity: 'zombie', entityId: 9102, range: 2, interact: 'left', responseTimeoutMs: 1500, enabled: true }
    })
  });
  await waitForEntityInteraction(leftInteractionStart, 9102, [1]);
  assert(restoredWindowResult.window?.title === '选择服务器', '左键实体交互后没有捕获重新打开的标准菜单');

  const protocolClickStart = receivedWindowClicks.length;
  await requestJson('/api/lobby/action', {
    method: 'POST',
    body: JSON.stringify({
      target: 'DashboardBotA',
      action: {
        type: 'operateWindow',
        item: '新手福利七日签到',
        slot: 20,
        protocolEntry: true,
        button: 'left',
        count: 1,
        timeoutMs: 5000,
        enabled: true
      }
    })
  });
  await waitForWindowClick(protocolClickStart, 20, 0);

  const windowClickStart = receivedWindowClicks.length;
  const operateWindowResult = await requestJson('/api/lobby/action', {
    method: 'POST',
    body: JSON.stringify({
      target: 'DashboardBotA',
      action: { type: 'operateWindow', title: '选择服务器', item: '进入一号服务器', slot: 11, button: 'left', count: 1, timeoutMs: 5000, enabled: true }
    })
  });
  await waitForWindowClick(windowClickStart, 11, 0);
  assert(operateWindowResult.window?.title === '选择服务器', '操作点击窗口完成后没有自动返回最新窗口快照');

  const keyPosition = operateWindowResult.position;
  const keyMovementStart = receivedMovementPackets.length;
  const pressKeyResult = await requestJson('/api/lobby/action', {
    method: 'POST',
    body: JSON.stringify({ target: 'DashboardBotA', action: { type: 'pressKey', key: 'W', durationMs: 500, enabled: true } })
  });
  await waitForMovementAfter(keyMovementStart);
  assert(horizontalDistance(keyPosition, pressKeyResult.position) >= 0.1, '按下按键动作完成后坐标没有变化');

  const walkPosition = pressKeyResult.position;
  const walkMovementStart = receivedMovementPackets.length;
  const relativeWalkResult = await requestJson('/api/lobby/action', {
    method: 'POST',
    body: JSON.stringify({ target: 'DashboardBotA', action: { type: 'relativeWalk', direction: 'east', distance: 2, enabled: true } })
  });
  await waitForMovementAfter(walkMovementStart);
  assert(relativeWalkResult.position?.x > walkPosition.x + 1, '按方向前进没有向东产生足够位移');

  await requestJson('/api/send', {
    method: 'POST',
    body: JSON.stringify({ target: 'DashboardBotA', message: '/home-a' })
  });
  await waitForMessageFrom('DashboardBotA', '/home-a');
  assert(!hasMessageFrom('DashboardBotB', '/home-a'), '定向发送不应该发到 DashboardBotB');

  await requestJson('/api/lobby/action', {
    method: 'POST',
    body: JSON.stringify({
      target: 'DashboardBotA',
      action: { type: 'chat', message: '/manual-lobby-action', enabled: true }
    })
  });
  await waitForMessageFrom('DashboardBotA', '/manual-lobby-action');
  assert(!hasMessageFrom('DashboardBotB', '/manual-lobby-action'), '大厅即时动作不应该发给未选择账号');

  const allLobbyTarget = await requestJson('/api/lobby/action', {
    method: 'POST',
    body: JSON.stringify({ target: 'all', action: { type: 'wait', delayMs: 100, enabled: true } }),
    expectOk: false
  });
  assert(allLobbyTarget.message.includes('具体账号'), '大厅即时动作不应该接受全部账号目标');

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
  remoteDisabledAfterStart.features.chat.presetMessagesList = ['/new-live-preset'];
  await requestJson('/api/config', {
    method: 'POST',
    body: JSON.stringify(remoteDisabledAfterStart)
  });
  const remoteDisabledSavedStatus = await requestJson('/api/status');
  assert(remoteDisabledSavedStatus.control?.remoteCommand === false, '运行中保存后远程发送开关应该实时更新');
  assert(remoteDisabledSavedStatus.control.presetMessagesList.includes('/new-live-preset'), '运行中保存后预设消息应该实时更新');
  await requestJson('/api/send', {
    method: 'POST',
    body: JSON.stringify({ target: 'DashboardBotB', message: '/still-running-remote' })
  });
  await waitForMessageFrom('DashboardBotB', '/still-running-remote');

  const profileConfig = createDashboardConfig(minecraftPort);
  profileConfig.features.chat.remoteCommand = false;
  profileConfig.features.chat.presetMessagesList = ['/profile-live'];
  const liveProfile = await requestJson('/api/profiles', {
    method: 'POST',
    body: JSON.stringify({ name: 'Live Profile', config: profileConfig })
  });
  assert(liveProfile.liveApplied === true, '运行中保存配置档案没有报告实时应用');
  const liveProfileStatus = await requestJson('/api/status');
  assert(liveProfileStatus.control.presetMessagesList.includes('/profile-live'), '运行中保存配置档案没有更新控制快照');

  const reloadedDefaultProfile = await requestJson('/api/profiles/use', {
    method: 'POST',
    body: JSON.stringify({ id: 'default' })
  });
  assert(reloadedDefaultProfile.liveApplied === true, '运行中切换配置档案没有报告实时应用');
  const reloadedDefaultStatus = await requestJson('/api/status');
  assert(reloadedDefaultStatus.control.presetMessagesList.includes('/new-live-preset'), '运行中切换配置档案没有更新控制快照');

  const deletedLiveProfile = await requestJson('/api/profiles/delete', {
    method: 'POST',
    body: JSON.stringify({ id: liveProfile.activeProfileId })
  });
  assert(deletedLiveProfile.liveApplied === true, '运行中删除配置档案没有报告实时应用');

  const resetWhileRunning = await requestJson('/api/reset', { method: 'POST' });
  assert(resetWhileRunning.liveApplied === true, '运行中重置没有报告配置已实时应用');
  const resetRunningStatus = await requestJson('/api/status');
  const defaultConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'bot.config.example.json'), 'utf8'));
  assert(
    JSON.stringify(resetRunningStatus.control.presetMessagesList) === JSON.stringify(defaultConfig.features.chat.presetMessagesList),
    '运行中重置后控制快照没有恢复默认预设消息'
  );
  assert(
    resetRunningStatus.control.remoteCommand === Boolean(defaultConfig.features.chat.remoteCommand),
    '运行中重置后控制快照没有恢复默认远程命令开关'
  );

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

  dashboardProcess.kill('SIGINT');
  const dashboardExit = await waitForProcessExit(dashboardProcess, 8000);
  await waitForDisconnectedUsers(['DashboardBotA', 'DashboardBotB']);
  assert(
    dashboardExit.code === 0 || dashboardExit.signal === 'SIGINT',
    `Dashboard 退出结果不正确：code=${dashboardExit.code}, signal=${dashboardExit.signal}`
  );

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
        actionSequence: true,
        delayMs: 900,
        heldSlot: 0,
        useCount: 1,
        actions: [
          { type: 'waitChat', chatText: '领取奖励', timeoutMs: 5000, enabled: true },
          { type: 'clickChat', chatButton: '领取奖励', timeoutMs: 5000, enabled: true }
        ]
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
    let inviteMenuQueued = false;
    let selectMenuQueued = false;
    joinedUsers.push(username);
    client.on('end', () => disconnectedUsers.push(username));

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
    client.on('position', (packet) => {
      receivedMovementPackets.push({ username, packet });
    });
    client.on('position_look', (packet) => {
      receivedMovementPackets.push({ username, packet });
    });
    client.on('window_click', (packet) => {
      receivedWindowClicks.push({ username, packet });
      client.write('transaction', {
        windowId: packet.windowId,
        action: packet.action,
        accepted: true
      });
    });
    client.on('use_entity', (packet) => {
      receivedEntityInteractions.push({ username, packet });
      if (username !== 'DashboardBotA' || packet.target !== 9102) return;
      if ([0, 2].includes(packet.mouse) && !inviteMenuQueued) {
        inviteMenuQueued = true;
        setTimeout(() => sendInviteMenu(client), 700);
      }
      if (packet.mouse === 1 && !selectMenuQueued) {
        selectMenuQueued = true;
        setTimeout(() => sendNpcMenu(client, 3), 250);
      }
    });

    setTimeout(() => sendSystemChat(client, '[玩家系统] 请输入“/register <密码> <再输入一次以确定密码>”以注册'), 250);
    setTimeout(() => sendSystemChat(client, '[玩家系统] 请输入“/register <密码> <再输入一次以确定密码>”以注册'), 650);
    setTimeout(() => sendPlayerChat(client, 'Tester', 'ping'), 500);
    setTimeout(() => sendColoredSystemChat(client), 700);
    setTimeout(() => sendInteractiveSystemChat(client), 1200);
    if (username === 'DashboardBotA') {
      setTimeout(() => sendTestEntities(client), 900);
      setTimeout(() => sendDragonCorePayload(client, "team_expand_是否显示剩余时间hud false team_expand_是否显示伤害hud false"), 1250);
      setTimeout(() => sendDragonCorePayload(client, "YeeCombatView血条视图 方法.执行方法('更新数据')"), 1300);
      setTimeout(() => sendDragonCorePayload(client, 'playertag_player_op playertag_playerhealth_op 9.5 playertag_playermaxhealth_op 330'), 1350);
      setTimeout(() => sendCustomNpcsDialog(client), 1400);
      setTimeout(() => sendDragonCorePayload(client, 'NPC对话：1.新手福利食用图鉴 2.新手福利七日签到 3.新手福利等级奖励'), 1450);
      setTimeout(() => sendDragonCorePayload(client, 'craftx_entry_configName 选服 craftx_entry_functionName 新手福利七日签到 craftx_entry_right-click false craftx_entry_left-click false craftx_entry_shift-click false craftx_entry_inventory-action'), 1500);
      setTimeout(() => sendDragonCorePayload(client, 'craftx_slot-id_20 新手福利七日签到'), 1550);
      setTimeout(() => sendNpcMenu(client), 1600);
    }
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

function sendInteractiveSystemChat(client) {
  client.write('chat', {
    message: JSON.stringify({
      text: '每日任务：',
      extra: [{ text: '[领取奖励]', color: 'green', clickEvent: { action: 'run_command', value: '/daily-reward' } }]
    }),
    position: 0,
    sender: '00000000-0000-0000-0000-000000000003'
  });
}

function sendTestEntities(client) {
  sendLivingEntity(client, 9101, 'armor_stand', 2);
  sendLivingEntity(client, 9102, 'zombie', 3);
}

function sendLivingEntity(client, entityId, entityName, x) {
  client.write('spawn_entity_living', {
    entityId,
    entityUUID: `00000000-0000-0000-0000-${String(entityId).padStart(12, '0')}`,
    type: mcData.entitiesByName[entityName].id,
    x,
    y: 64,
    z: 1,
    yaw: 0,
    pitch: 0,
    headPitch: 0,
    velocity: { x: 0, y: 0, z: 0 }
  });
}

function sendNpcMenu(client, windowId = 1) {
  const items = Array.from({ length: 63 }, () => Item.toNotch(null));
  items[10] = createNamedItem('white_stained_glass_pane', 'Stained Glass Pane', []);
  items[11] = createNamedItem('paper', '进入一号服务器', ['点击进入', '当前 12 人']);
  items[30] = createNamedItem('stone', '玩家背包测试物品', []);
  client.write('open_window', {
    windowId,
    inventoryType: 2,
    windowTitle: JSON.stringify({ text: '选择服务器' })
  });
  client.write('window_items', { windowId, items });
}

function sendInviteMenu(client) {
  const items = Array.from({ length: 63 }, () => Item.toNotch(null));
  items[10] = createNamedItem('paper', '邀请记录', ['查看最近邀请']);
  items[13] = createNamedItem('compass', '邀请好友', ['点击选择在线玩家']);
  items[16] = createNamedItem('gold_ingot', '邀请奖励', ['领取邀请奖励']);
  client.write('open_window', {
    windowId: 2,
    inventoryType: 2,
    windowTitle: JSON.stringify({ text: '邀请系统' })
  });
  client.write('window_items', { windowId: 2, items });
}

function sendCustomNpcsDialog(client) {
  const data = Buffer.alloc(12);
  data.writeInt32BE(2, 0);
  data.writeInt32BE(9102, 4);
  data.writeInt32BE(77, 8);
  client.write('custom_payload', { channel: 'CustomNPCs', data });
}

function sendDragonCorePayload(client, text) {
  client.write('custom_payload', { channel: 'dragoncore:main', data: Buffer.from(text, 'utf8') });
}

function createNamedItem(itemName, displayName, lore) {
  const item = new Item(mcData.itemsByName[itemName].id, 1, 0);
  item.nbt = {
    type: 'compound',
    name: '',
    value: {
      display: {
        type: 'compound',
        value: {
          Name: { type: 'string', value: JSON.stringify({ text: displayName }) },
          Lore: {
            type: 'list',
            value: { type: 'string', value: lore.map((text) => JSON.stringify({ text })) }
          }
        }
      }
    }
  };
  return Item.toNotch(item);
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

async function waitForDisconnectedUsers(expectedUsers) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (expectedUsers.every((username) => disconnectedUsers.includes(username))) return;
    await delay(100);
  }
  throw new Error(`Dashboard 退出后账号未全部断开：${disconnectedUsers.join(', ')}\n输出：${dashboardOutput.join('')}`);
}

function waitForProcessExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`等待 Dashboard 退出超时\n${dashboardOutput.join('')}`)), timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
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

async function waitForEntityInteraction(startIndex, target, mouseValues) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const match = receivedEntityInteractions
      .slice(startIndex)
      .find(({ username, packet }) => username === 'DashboardBotA' && packet.target === target && mouseValues.includes(packet.mouse));
    if (match) return match;
    await delay(100);
  }
  throw new Error(`等待 NPC 实体交互包超时：target=${target}, mouse=${mouseValues.join('/')}`);
}

async function waitForWindowClick(startIndex, slot, mouseButton) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const match = receivedWindowClicks
      .slice(startIndex)
      .find(({ username, packet }) => username === 'DashboardBotA' && packet.slot === slot && packet.mouseButton === mouseButton);
    if (match) return match;
    await delay(100);
  }
  throw new Error(`等待窗口点击包超时：slot=${slot}, mouseButton=${mouseButton}`);
}

async function waitForMovementAfter(startIndex) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (receivedMovementPackets.slice(startIndex).some(({ username }) => username === 'DashboardBotA')) return;
    await delay(100);
  }
  throw new Error('等待动作产生移动坐标包超时');
}

function horizontalDistance(left, right) {
  if (!left || !right) return 0;
  return Math.hypot(Number(right.x) - Number(left.x), Number(right.z) - Number(left.z));
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

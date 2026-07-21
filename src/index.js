import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import mineflayer from 'mineflayer';
import pathfinderPackage from 'mineflayer-pathfinder';

const { pathfinder, Movements, goals } = pathfinderPackage;

/*
  PCL / Minecraft 批量登录挂机脚本

  你平时只需要改下面两块：
  1. USER_CONFIG：服务器地址、版本、登录间隔、重连、挂机动作。
  2. ACCOUNTS：账号列表。

  说明：
  - 默认不会进服发言，也不会提示“我是挂机机器人”。
  - 默认不会做跳跃/转头等挂机动作，需要时把 idleActions 改成 true。
  - 后面如果要加“注册/登录插件机器人”，可以继续在 ACCOUNTS 里补密码字段。
*/

// =========================
// 需要你填写的位置 1：服务器和运行配置
// =========================
const USER_CONFIG = {
  // 服务器 IP 或域名，例如：'play.example.com'
  host: '127.0.0.1',

  // 服务器端口，Java 版默认 25565。
  port: 25565,

  // 版本一般填 false 自动识别；如果进不去，可以填具体版本，例如：'1.20.1'
  version: false,

  // 登录模式：
  // offline：离线模式 / LAN / 自己开的离线服
  // microsoft：正版服务器，首次运行会按终端提示登录 Microsoft
  auth: 'offline',

  // 是否从 accounts.json 读取账号。
  // false：使用下面 ACCOUNTS 数组，最方便集中填写。
  // true：使用 accountsFile 指定的 JSON 文件。
  useAccountsFile: false,
  accountsFile: 'accounts.json',

  // 批量登录间隔。账号越多，建议间隔越大，避免瞬间给服务器压力。
  connectIntervalMs: 15000,

  // 断线后是否自动重连。
  reconnect: true,
  reconnectDelayMs: 30000,

  // 可选挂机动作。默认 false，只站在服务器里。
  // 只有服务器规则允许时再改成 true。
  idleActions: false,
  idleIntervalMs: 45000,

  // 参考 MCC MessageCooldown：同一账号两条聊天/指令之间的最小间隔，单位毫秒。
  // 设置为 0 表示不额外限速；批量账号建议保持 1000 或更高。
  messageCooldownMs: 1000,

  // 全局进服发言。默认空字符串，不发送任何消息。
  // 如果想所有账号进服都说一句，可以写：'已上线'
  chatOnJoin: ''
};

// =========================
// 需要你填写的位置 2：批量账号列表
// =========================
const ACCOUNTS = [
  {
    // 离线服务器里显示的名字，多个账号不能重复。
    username: 'Account_01',

    // true 表示启用，false 表示临时跳过这个账号。
    enabled: true,

    // 单个账号进服发言。留空就是不说话。
    chatOnJoin: '',

    // 可选：单个账号覆盖全局登录模式。不需要就留空。
    // auth: 'offline',

    // 预留：以后写注册/登录插件机器人时，可以在这里填服务器密码。
    // registerPassword: '你的注册密码'
  },
  {
    username: 'Account_02',
    enabled: true,
    chatOnJoin: ''
  },
  {
    username: 'Account_03',
    enabled: false,
    chatOnJoin: ''
  }
];

// =========================
// 下面是程序逻辑，一般不需要修改
// =========================

const FILE_CONFIG = loadMainConfigFromFile();
let ACTIVE_CONFIG = FILE_CONFIG ? createActiveConfig(FILE_CONFIG) : USER_CONFIG;
let ACTIVE_ACCOUNTS = FILE_CONFIG ? FILE_CONFIG.accounts : ACCOUNTS;
let ACTIVE_FEATURES = mergeFeatures(FILE_CONFIG?.features || {});
const sessions = new Map();
const FOOD_NAMES = new Set([
  'apple',
  'baked_potato',
  'beef',
  'beetroot',
  'beetroot_soup',
  'bread',
  'carrot',
  'chicken',
  'cooked_beef',
  'cooked_chicken',
  'cooked_cod',
  'cooked_mutton',
  'cooked_porkchop',
  'cooked_rabbit',
  'cooked_salmon',
  'cookie',
  'dried_kelp',
  'golden_apple',
  'golden_carrot',
  'melon_slice',
  'mushroom_stew',
  'mutton',
  'porkchop',
  'potato',
  'pumpkin_pie',
  'rabbit',
  'rabbit_stew',
  'salmon',
  'sweet_berries'
]);

function mergeFeatures(features) {
  return {
    combat: {
      autoAttack: false,
      autoFish: false,
      autoEat: false,
      autoRespawn: true,
      attackMode: 'single',
      attackHostile: true,
      attackPassive: false,
      attackRange: 4,
      attackIntervalMs: 1200,
      entityListMode: 'blacklist',
      entityList: ['armor_stand'],
      eatThreshold: 16,
      fishingStartDelayMs: 3000,
      fishingCastDelayMs: 1200,
      fishingTimeoutMs: 300000,
      ...(features.combat || {})
    },
    movement: {
      autoWalk: false,
      antiAfk: false,
      switchHeldItem: false,
      antiAfkMinDelayMs: 45000,
      antiAfkMaxDelayMs: 70000,
      antiAfkCommand: '',
      antiAfkSneak: false,
      antiAfkWalk: true,
      antiAfkWalkRange: 3,
      walkTarget: { x: 0, y: 64, z: 0 },
      walkRange: 1,
      heldSlot: 0,
      ...(features.movement || {}),
      relativeWalk: { enabled: false, direction: 'forward', distance: 0, ...(features.movement?.relativeWalk || {}) }
    },
    chat: {
      keywordReply: false,
      presetMessages: false,
      remoteCommand: false,
      autoLogin: false,
      keywordRules: [],
      presetMessagesList: [],
      ...(features.chat || {})
    },
    lobby: {
      useItem: false,
      actionSequence: false,
      delayMs: 3000,
      heldSlot: 0,
      useCount: 1,
      actions: [],
      ...(features.lobby || {})
    },
    scheduler: {
      enabled: false,
      tasks: [],
      ...(features.scheduler || {})
    }
  };
}

function createActiveConfig(fileConfig) {
  return {
    host: fileConfig.server.host,
    port: fileConfig.server.port,
    version: fileConfig.server.version,
    auth: fileConfig.server.auth,
    connectIntervalMs: fileConfig.runtime.connectIntervalMs,
    reconnect: fileConfig.runtime.reconnect,
    reconnectDelayMs: fileConfig.runtime.reconnectDelayMs,
    idleActions: fileConfig.runtime.idleActions,
    idleIntervalMs: fileConfig.runtime.idleIntervalMs,
    messageCooldownMs: fileConfig.runtime.messageCooldownMs,
    chatOnJoin: fileConfig.runtime.chatOnJoin,
    testExitAfterMs: fileConfig.runtime.testExitAfterMs
  };
}

function loadMainConfigFromFile() {
  const configPath = process.env.BOT_CONFIG_PATH
    ? path.resolve(process.env.BOT_CONFIG_PATH)
    : path.resolve(process.cwd(), 'bot.config.json');
  if (!fs.existsSync(configPath)) return null;

  const raw = fs.readFileSync(configPath, 'utf8');
  const fileConfig = JSON.parse(raw);

  if (!fileConfig.server || !fileConfig.runtime || !Array.isArray(fileConfig.accounts)) {
    throw new Error('bot.config.json 格式不正确，请参考 bot.config.example.json。');
  }

  normalizeFileConfig(fileConfig);
  return fileConfig;
}

function normalizeFileConfig(fileConfig) {
  if (typeof fileConfig.server.host !== 'string') {
    throw new Error('bot.config.json 里的 server.host 必须是文本。');
  }

  fileConfig.server.host = fileConfig.server.host.trim();
  if (!fileConfig.server.host) {
    throw new Error('bot.config.json 里的 server.host 不能为空。');
  }

  const port = Number(fileConfig.server.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('bot.config.json 里的 server.port 必须是 1 到 65535 之间的整数。');
  }
  fileConfig.server.port = port;

  if (fileConfig.server.version !== false && typeof fileConfig.server.version !== 'string') {
    throw new Error('bot.config.json 里的 server.version 必须是 false 或版本文本。');
  }

  if (typeof fileConfig.server.version === 'string') {
    fileConfig.server.version = fileConfig.server.version.trim();
    if (!fileConfig.server.version || fileConfig.server.version === 'false' || fileConfig.server.version === 'auto') {
      fileConfig.server.version = false;
    }
  }

  if (!['offline', 'microsoft'].includes(fileConfig.server.auth)) {
    throw new Error('bot.config.json 里的 server.auth 必须是 offline 或 microsoft。');
  }

  normalizeRuntimeConfig(fileConfig.runtime);

  if (fileConfig.features?.movement && typeof fileConfig.features.movement.antiAfkCommand === 'string') {
    fileConfig.features.movement.antiAfkCommand = fileConfig.features.movement.antiAfkCommand.trim();
  }
}

function normalizeRuntimeConfig(runtime) {
  requireRuntimeNumber(runtime.connectIntervalMs, 'runtime.connectIntervalMs', { min: 0 });
  requireRuntimeNumber(runtime.reconnectDelayMs, 'runtime.reconnectDelayMs', { min: 0 });
  requireRuntimeNumber(runtime.idleIntervalMs, 'runtime.idleIntervalMs', { min: 0 });
  requireRuntimeNumber(runtime.messageCooldownMs, 'runtime.messageCooldownMs', { min: 0 });

  if (typeof runtime.reconnect !== 'boolean') {
    throw new Error('bot.config.json 里的 runtime.reconnect 必须是真或假。');
  }
  if (typeof runtime.idleActions !== 'boolean') {
    throw new Error('bot.config.json 里的 runtime.idleActions 必须是真或假。');
  }
  if (typeof runtime.chatOnJoin !== 'string') {
    throw new Error('bot.config.json 里的 runtime.chatOnJoin 必须是文本。');
  }
}

function requireRuntimeNumber(value, key, options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`bot.config.json 里的 ${key} 必须是数字。`);
  }
  if (options.min !== undefined && number < options.min) {
    throw new Error(`bot.config.json 里的 ${key} 不能小于 ${options.min}。`);
  }
}

function log(accountName, message) {
  const prefix = accountName ? `[${accountName}]` : '[系统]';
  console.log(`[${new Date().toLocaleString()}] ${prefix} ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAccountsPath() {
  if (path.isAbsolute(USER_CONFIG.accountsFile)) return USER_CONFIG.accountsFile;
  return path.resolve(process.cwd(), USER_CONFIG.accountsFile);
}

function loadAccountsFromFile() {
  const accountsPath = getAccountsPath();

  if (!fs.existsSync(accountsPath)) {
    throw new Error(`找不到账号文件：${accountsPath}`);
  }

  const raw = fs.readFileSync(accountsPath, 'utf8');
  return JSON.parse(raw);
}

function loadAccounts() {
  const sourceAccounts = USER_CONFIG.useAccountsFile && !FILE_CONFIG ? loadAccountsFromFile() : ACTIVE_ACCOUNTS;
  const startAccountNames = getStartAccountNames();

  if (!Array.isArray(sourceAccounts) || sourceAccounts.length === 0) {
    throw new Error('账号列表必须是非空数组。');
  }

  const names = new Set();
  return sourceAccounts.map((account, index) => {
    if (!account || typeof account !== 'object' || Array.isArray(account)) {
      throw new Error(`第 ${index + 1} 个账号必须是对象。`);
    }

    if (typeof account.username !== 'string') {
      throw new Error(`第 ${index + 1} 个账号 username 必须是文本。`);
    }

    const username = account.username.trim();
    if (!username) {
      throw new Error(`第 ${index + 1} 个账号缺少 username。`);
    }
    if (names.has(username)) {
      throw new Error(`账号名重复：${username}`);
    }
    names.add(username);
    if (account.auth && !['offline', 'microsoft'].includes(account.auth)) {
      throw new Error(`第 ${index + 1} 个账号 auth 必须是 offline、microsoft 或留空。`);
    }
    if (account.enabled !== undefined && typeof account.enabled !== 'boolean') {
      throw new Error(`第 ${index + 1} 个账号 enabled 必须是真或假。`);
    }
    if (account.chatOnJoin !== undefined && typeof account.chatOnJoin !== 'string') {
      throw new Error(`第 ${index + 1} 个账号 chatOnJoin 必须是文本。`);
    }
    if (account.registerPassword !== undefined && typeof account.registerPassword !== 'string') {
      throw new Error(`第 ${index + 1} 个账号 registerPassword 必须是文本。`);
    }

    return {
      username,
      auth: account.auth || ACTIVE_CONFIG.auth,
      chatOnJoin: account.chatOnJoin ?? ACTIVE_CONFIG.chatOnJoin,
      registerPassword: account.registerPassword || '',
      enabled: account.enabled !== false
    };
  }).filter((account) => !startAccountNames || startAccountNames.has(account.username));
}

function getStartAccountNames() {
  const raw = process.env.START_ACCOUNT_NAMES;
  if (!raw) return null;

  try {
    const names = JSON.parse(raw);
    if (Array.isArray(names) && names.length > 0) {
      return new Set(names.map((name) => String(name).trim()).filter(Boolean));
    }
  } catch {}

  return null;
}

function getEnabledFeatures() {
  const names = [];
  const labels = {
    'combat.autoAttack': '自动攻击',
    'combat.autoFish': '自动钓鱼',
    'combat.autoEat': '自动进食',
    'combat.autoRespawn': '自动重生',
    'movement.autoWalk': '自动走路',
    'movement.antiAfk': '防挂机走动',
    'movement.switchHeldItem': '切换手持',
    'chat.keywordReply': '关键词自动回复',
    'chat.presetMessages': '预设消息',
    'chat.remoteCommand': '发送游戏信息 / 指令',
    'chat.autoLogin': '自动登录',
    'lobby.useItem': '大厅自动使用物品',
    'lobby.actionSequence': '大厅动作序列',
    'scheduler.enabled': '定时任务'
  };

  for (const [pathKey, label] of Object.entries(labels)) {
    const [group, key] = pathKey.split('.');
    if (ACTIVE_FEATURES[group]?.[key]) names.push(label);
  }

  return names;
}

function createBot(account) {
  let session = sessions.get(account.username);

  if (!session) {
    session = {
      bot: null,
      idleTimer: null,
      attackTimer: null,
      eatTimer: null,
      schedulerTimers: [],
      lobbyTimer: null,
      lastWindow: null,
      windowLogTimer: null,
      lastWindowLogSignature: '',
      recentMessages: [],
      chatButtons: [],
      chatQueue: [],
      chatQueueTimer: null,
      lastChatAt: 0,
      fishing: false,
      loginCommandSent: false,
      loginSuccessDetected: false,
      registerSingleCommandSent: false,
      registerConfirmCommandSent: false,
      manualLobbyActionRunning: false,
      reconnectTimer: null,
      reconnecting: false,
      stopped: false
    };
    sessions.set(account.username, session);
  }

  clearTimeout(session.reconnectTimer);
  session.reconnecting = false;
  session.lastWindow = null;
  clearTimeout(session.windowLogTimer);
  session.windowLogTimer = null;
  session.lastWindowLogSignature = '';
  session.recentMessages = [];
  session.chatButtons = [];

  const options = {
    host: ACTIVE_CONFIG.host,
    port: ACTIVE_CONFIG.port,
    username: account.username,
    auth: account.auth,
    respawn: Boolean(ACTIVE_FEATURES.combat.autoRespawn)
  };

  if (ACTIVE_CONFIG.version) {
    options.version = ACTIVE_CONFIG.version;
  }

  log(account.username, `正在连接 ${ACTIVE_CONFIG.host}:${ACTIVE_CONFIG.port}...`);
  session.bot = mineflayer.createBot(options);
  session.bot.loadPlugin(pathfinder);

  session.bot.once('spawn', () => {
    log(account.username, '已进入服务器。');
    session.loginCommandSent = false;
    session.loginSuccessDetected = false;
    session.registerSingleCommandSent = false;
    session.registerConfirmCommandSent = false;

    if (ACTIVE_CONFIG.idleActions || ACTIVE_FEATURES.movement.antiAfk) {
      startIdleActions(account.username);
    }

    startFeatureWorkers(account.username);

    if (account.chatOnJoin) {
      enqueueChat(account.username, account.chatOnJoin);
    }
  });

  session.bot.on('chat', (playerName, message) => {
    handleChat(account, playerName, message);
  });

  session.bot.on('message', (message) => {
    const text = logGameMessage(account.username, message);
    recordInteractiveMessage(session, message, text);
    handleServerMessage(account, text);
  });

  session.bot.on('windowOpen', (window) => {
    session.lastWindow = window;
    session.lastWindowLogSignature = '';
    logWindowContents(account.username, session, window);
    window.on('updateSlot', () => scheduleWindowContents(account.username, session, window));
    emitWindowSnapshot(account.username);
  });

  session.bot.on('windowClose', () => {
    clearTimeout(session.windowLogTimer);
    session.windowLogTimer = null;
    session.lastWindow = null;
    session.lastWindowLogSignature = '';
    emitWindowSnapshot(account.username);
  });

  session.bot.on('death', () => {
    log(account.username, ACTIVE_FEATURES.combat.autoRespawn ? '已死亡，正在自动重生。' : '已死亡，自动重生未启用。');
  });

  session.bot.on('respawn', () => {
    log(account.username, '已重生。');
  });

  session.bot.on('kicked', (reason) => {
    log(account.username, `被踢出：${formatReason(reason)}`);
  });

  session.bot.on('error', (error) => {
    log(account.username, `错误：${error.message}`);
  });

  session.bot.on('end', () => {
    log(account.username, '连接已断开。');
    stopFeatureWorkers(account.username);
    scheduleReconnect(account);
  });
}

function startFeatureWorkers(username) {
  const session = sessions.get(username);
  if (!session) return;

  stopAttackWorker(username);
  stopEatWorker(username);
  stopSchedulerWorkers(username);
  stopLobbyWorker(username);
  session.fishing = false;

  if (ACTIVE_FEATURES.movement.switchHeldItem) {
    switchHeldSlot(username, ACTIVE_FEATURES.movement.heldSlot);
  }

  if (ACTIVE_FEATURES.movement.autoWalk) {
    startAutoWalk(username);
  }

  if (ACTIVE_FEATURES.lobby.useItem || ACTIVE_FEATURES.lobby.actionSequence) {
    startLobbyWorker(username);
  }

  if (ACTIVE_FEATURES.scheduler.enabled) {
    startSchedulerWorkers(username);
  }

  if (ACTIVE_FEATURES.combat.autoAttack) {
    startAttackWorker(username);
  }

  if (ACTIVE_FEATURES.combat.autoEat) {
    startEatWorker(username);
  }

  if (ACTIVE_FEATURES.combat.autoFish) {
    runFishingLoop(username);
  }
}

function stopFeatureWorkers(username) {
  stopIdleActions(username);
  stopAttackWorker(username);
  stopEatWorker(username);
  stopSchedulerWorkers(username);
  stopLobbyWorker(username);
  clearChatQueue(username);

  const session = sessions.get(username);
  if (session) {
    session.fishing = false;
    session.bot?.pathfinder?.stop();
  }
}

function restartLiveFeatureWorkers(username) {
  stopIdleActions(username);
  stopAttackWorker(username);
  stopEatWorker(username);
  stopSchedulerWorkers(username);
  stopLobbyWorker(username);

  const session = sessions.get(username);
  if (!session) return;

  const wasFishing = session.fishing;
  if (!ACTIVE_FEATURES.combat.autoFish) {
    session.fishing = false;
  }
  session.bot?.pathfinder?.stop?.();

  if (ACTIVE_CONFIG.idleActions || ACTIVE_FEATURES.movement.antiAfk) {
    startIdleActions(username);
  }

  if (ACTIVE_FEATURES.movement.switchHeldItem) {
    switchHeldSlot(username, ACTIVE_FEATURES.movement.heldSlot);
  }

  if (ACTIVE_FEATURES.movement.autoWalk) {
    startAutoWalk(username);
  }

  if (ACTIVE_FEATURES.lobby.useItem || ACTIVE_FEATURES.lobby.actionSequence) {
    startLobbyWorker(username);
  }

  if (ACTIVE_FEATURES.scheduler.enabled) {
    startSchedulerWorkers(username);
  }

  if (ACTIVE_FEATURES.combat.autoAttack) {
    startAttackWorker(username);
  }

  if (ACTIVE_FEATURES.combat.autoEat) {
    startEatWorker(username);
  }

  if (ACTIVE_FEATURES.combat.autoFish && !wasFishing) {
    runFishingLoop(username);
  }
}

function startIdleActions(username) {
  const session = sessions.get(username);
  if (!session) return;

  stopIdleActions(username);

  const run = () => {
    const bot = session.bot;
    if (!bot?.entity) return;

    // 轻量保活动作示例：短跳一下，然后慢慢转头。
    if (ACTIVE_FEATURES.movement.antiAfkSneak) {
      bot.setControlState('sneak', true);
      setTimeout(() => bot?.setControlState('sneak', false), 800);
    }

    if (ACTIVE_FEATURES.movement.antiAfkCommand) {
      enqueueChat(username, ACTIVE_FEATURES.movement.antiAfkCommand);
    } else if (ACTIVE_FEATURES.movement.antiAfkWalk && startAntiAfkRandomWalk(username)) {
      // 随机走动已经发出移动目标；下方仍会转头以增加保活信号。
    } else {
      bot.setControlState('jump', true);
      setTimeout(() => bot?.setControlState('jump', false), 350);
    }

    const yaw = bot.entity.yaw + 0.4;
    bot.look(yaw, bot.entity.pitch, true);
    log(username, '已发送一次保活动作。');

    const delay = randomBetween(
      ACTIVE_FEATURES.movement.antiAfkMinDelayMs || ACTIVE_CONFIG.idleIntervalMs,
      ACTIVE_FEATURES.movement.antiAfkMaxDelayMs || ACTIVE_CONFIG.idleIntervalMs
    );
    session.idleTimer = setTimeout(run, delay);
  };

  session.idleTimer = setTimeout(run, 1000);
}

function startAntiAfkRandomWalk(username) {
  const session = sessions.get(username);
  const bot = session?.bot;
  if (!bot?.entity || !bot.pathfinder) return false;

  const range = Number(ACTIVE_FEATURES.movement.antiAfkWalkRange) || 0;
  if (range <= 0) return false;

  const origin = session.antiAfkOrigin || bot.entity.position.clone();
  session.antiAfkOrigin = origin;

  const offsetX = randomOffset(range);
  const offsetZ = randomOffset(range);
  const targetX = origin.x + offsetX;
  const targetY = origin.y;
  const targetZ = origin.z + offsetZ;

  try {
    bot.pathfinder.setMovements(new Movements(bot));
    bot.pathfinder.setGoal(new goals.GoalNear(targetX, targetY, targetZ, 0.8));
    log(username, `防挂机随机走动：前往 ${targetX.toFixed(1)}, ${targetY.toFixed(1)}, ${targetZ.toFixed(1)}`);
    return true;
  } catch (error) {
    log(username, `防挂机随机走动失败：${error.message}`);
    return false;
  }
}

function stopIdleActions(username) {
  const session = sessions.get(username);
  if (!session) return;

  if (session.idleTimer) {
    clearTimeout(session.idleTimer);
    session.idleTimer = null;
  }

  if (typeof session.bot?.clearControlStates === 'function') {
    session.bot.clearControlStates();
  }
}

function startAttackWorker(username) {
  const session = sessions.get(username);
  if (!session) return;

  session.attackTimer = setInterval(async () => {
    const bot = session.bot;
    if (!bot?.entity) return;

    const targets = Object.values(bot.entities)
      .filter((entity) => shouldAttackEntity(bot, entity))
      .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position));
    const selectedTargets = ACTIVE_FEATURES.combat.attackMode === 'multi' ? targets : targets.slice(0, 1);

    if (selectedTargets.length === 0) return;

    for (const target of selectedTargets) {
      try {
        await bot.lookAt(target.position.offset(0, target.height || 1, 0), true);
        bot.attack(target);
        log(username, `自动攻击：${target.name || target.displayName || target.type}`);
      } catch (error) {
        log(username, `自动攻击失败：${error.message}`);
      }
    }
  }, ACTIVE_FEATURES.combat.attackIntervalMs);
}

function shouldAttackEntity(bot, entity) {
  if (!entity?.position || !bot?.entity) return false;
  if (entity === bot.entity) return false;
  if (entity.type !== 'mob') return false;
  if (bot.entity.position.distanceTo(entity.position) > ACTIVE_FEATURES.combat.attackRange) return false;

  const entityName = String(entity.name || entity.displayName || '').toLowerCase();
  const list = (ACTIVE_FEATURES.combat.entityList || []).map((item) => String(item).toLowerCase());
  const listed = list.includes(entityName);

  if (ACTIVE_FEATURES.combat.entityListMode === 'whitelist' && !listed) return false;
  if (ACTIVE_FEATURES.combat.entityListMode === 'blacklist' && listed) return false;

  const hostile = isLikelyHostile(entityName);
  if (hostile && !ACTIVE_FEATURES.combat.attackHostile) return false;
  if (!hostile && !ACTIVE_FEATURES.combat.attackPassive) return false;
  return true;
}

function isLikelyHostile(entityName) {
  return [
    'blaze',
    'creeper',
    'drowned',
    'elder_guardian',
    'enderman',
    'endermite',
    'evoker',
    'ghast',
    'guardian',
    'hoglin',
    'husk',
    'magma_cube',
    'phantom',
    'piglin',
    'pillager',
    'ravager',
    'shulker',
    'silverfish',
    'skeleton',
    'slime',
    'spider',
    'stray',
    'vex',
    'vindicator',
    'warden',
    'witch',
    'wither_skeleton',
    'zoglin',
    'zombie',
    'zombie_villager',
    'zombified_piglin'
  ].includes(entityName);
}

function stopAttackWorker(username) {
  const session = sessions.get(username);
  if (!session?.attackTimer) return;
  clearInterval(session.attackTimer);
  session.attackTimer = null;
}

function startEatWorker(username) {
  const session = sessions.get(username);
  if (!session) return;

  session.eatTimer = setInterval(async () => {
    const bot = session.bot;
    if (!bot?.entity || bot.food === undefined || bot.food > ACTIVE_FEATURES.combat.eatThreshold) return;

    const food = bot.inventory.items().find((item) => FOOD_NAMES.has(item.name));
    if (!food) {
      log(username, '自动进食：背包里没有可识别食物。');
      return;
    }

    try {
      await bot.equip(food, 'hand');
      await bot.consume();
      log(username, `自动进食：${food.name}`);
    } catch (error) {
      log(username, `自动进食失败：${error.message}`);
    }
  }, 3000);
}

function stopEatWorker(username) {
  const session = sessions.get(username);
  if (!session?.eatTimer) return;
  clearInterval(session.eatTimer);
  session.eatTimer = null;
}

async function runFishingLoop(username) {
  const session = sessions.get(username);
  if (!session || session.fishing) return;

  session.fishing = true;
  await sleep(ACTIVE_FEATURES.combat.fishingStartDelayMs);

  while (session.fishing && session.bot?.entity) {
    const bot = session.bot;
    const rod = bot.inventory.items().find((item) => item.name === 'fishing_rod');

    if (!rod) {
      log(username, '自动钓鱼：背包里没有 fishing_rod。');
      await sleep(10000);
      continue;
    }

    try {
      await bot.equip(rod, 'hand');
      await withTimeout(bot.fish(), ACTIVE_FEATURES.combat.fishingTimeoutMs, '钓鱼等待超时');
      log(username, '自动钓鱼：完成一次收竿。');
      await sleep(ACTIVE_FEATURES.combat.fishingCastDelayMs);
    } catch (error) {
      log(username, `自动钓鱼失败：${error.message}`);
      await sleep(5000);
    }
  }
}

function switchHeldSlot(username, slot) {
  const session = sessions.get(username);
  const bot = session?.bot;
  if (!bot?.entity) return;

  const safeSlot = Math.max(0, Math.min(8, Number(slot) || 0));
  try {
    bot.setQuickBarSlot(safeSlot);
    log(username, `切换手持：快捷栏 ${safeSlot + 1}`);
  } catch (error) {
    log(username, `切换手持失败：${error.message}`);
  }
}

function startAutoWalk(username) {
  const session = sessions.get(username);
  const bot = session?.bot;
  if (!bot?.entity || !bot.pathfinder) return;

  const target = resolveWalkTarget(bot);
  const range = Number(ACTIVE_FEATURES.movement.walkRange) || 1;

  try {
    bot.pathfinder.setMovements(new Movements(bot));
    bot.pathfinder.setGoal(new goals.GoalNear(Number(target.x), Number(target.y), Number(target.z), range));
    log(username, `自动走路：前往 ${target.x}, ${target.y}, ${target.z}，范围 ${range}`);
  } catch (error) {
    log(username, `自动走路失败：${error.message}`);
  }
}

function resolveWalkTarget(bot) {
  const relativeWalk = ACTIVE_FEATURES.movement.relativeWalk || {};
  if (!relativeWalk.enabled) return ACTIVE_FEATURES.movement.walkTarget || { x: 0, y: 64, z: 0 };
  return resolveRelativeWalkTarget(bot, relativeWalk.direction, relativeWalk.distance);
}

function resolveRelativeWalkTarget(bot, direction, distanceValue) {
  const position = bot.entity.position;
  const distance = Math.max(0, Number(distanceValue) || 0);
  const vector = getDirectionVector(bot, direction);
  return {
    x: position.x + vector.x * distance,
    y: position.y,
    z: position.z + vector.z * distance
  };
}

function getDirectionVector(bot, direction) {
  const yaw = bot.entity.yaw || 0;
  const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const vectors = {
    forward,
    back: { x: -forward.x, z: -forward.z },
    left: { x: -right.x, z: -right.z },
    right,
    north: { x: 0, z: -1 },
    south: { x: 0, z: 1 },
    east: { x: 1, z: 0 },
    west: { x: -1, z: 0 }
  };
  return vectors[direction] || vectors.forward;
}

function startLobbyWorker(username) {
  const session = sessions.get(username);
  if (!session) return;

  stopLobbyWorker(username);
  session.lobbyTimer = setTimeout(async () => {
    const bot = session.bot;
    if (!bot?.entity) return;

    try {
      const actions = ACTIVE_FEATURES.lobby.actionSequence && Array.isArray(ACTIVE_FEATURES.lobby.actions)
        ? ACTIVE_FEATURES.lobby.actions.filter((action) => action.enabled !== false)
        : [];
      if (actions.length > 0) {
        await runLobbyActions(username, actions);
        return;
      }

      if (!ACTIVE_FEATURES.lobby.useItem) return;

      switchHeldSlot(username, ACTIVE_FEATURES.lobby.heldSlot);
      await runUseItemAction(username, { count: ACTIVE_FEATURES.lobby.useCount, delayMs: 600 });
    } catch (error) {
      log(username, `大厅动作序列失败：${error.message}`);
    }
  }, ACTIVE_FEATURES.lobby.delayMs);
}

async function runLobbyActions(username, actions) {
  for (const [index, action] of actions.entries()) {
    await runLobbyAction(username, action, index + 1);
    emitWindowSnapshot(username);
  }
}

async function runLobbyAction(username, action, index) {
  const type = action.type || 'wait';
  if (type === 'wait') {
    const delayMs = Math.max(0, Number(action.delayMs) || 0);
    log(username, `大厅动作 ${index}：等待 ${delayMs}ms`);
    await sleep(delayMs);
    return;
  }

  if (type === 'switchSlot') {
    const slot = Math.max(1, Math.min(9, Number(action.hotbarSlot) || 1));
    switchHeldSlot(username, slot - 1);
    return;
  }

  if (type === 'useItem') {
    await runUseItemAction(username, action, index);
    return;
  }

  if (type === 'waitWindow') {
    await waitForWindow(username, action.title, Number(action.timeoutMs) || 5000);
    return;
  }

  if (type === 'clickSlot') {
    await runClickSlotAction(username, action, index);
    return;
  }

  if (type === 'clickItem' || type === 'operateWindow') {
    await runClickItemAction(username, action, index);
    return;
  }

  if (type === 'relativeWalk') {
    await runRelativeWalkAction(username, action, index);
    return;
  }

  if (type === 'findEntity') {
    await runFindEntityAction(username, action, index);
    return;
  }

  if (type === 'pressKey') {
    await runPressKeyAction(username, action, index);
    return;
  }

  if (type === 'moveSlot') {
    await runMoveSlotAction(username, action, index);
    return;
  }

  if (type === 'chat') {
    enqueueChat(username, action.message, `大厅动作 ${index}：发送 ${action.message}`);
    return;
  }

  if (type === 'waitChat') {
    await waitForChatText(username, action.chatText, Number(action.timeoutMs) || 5000, index);
    return;
  }

  if (type === 'clickChat') {
    await runClickChatAction(username, action, index);
  }
}

async function runRelativeWalkAction(username, action, index) {
  const session = sessions.get(username);
  const bot = session?.bot;
  if (!bot?.entity || !bot.pathfinder) return;

  const distance = Number(action.distance);
  if (!(distance > 0)) throw new Error('按方向前进需要填写大于 0 的格数。');
  const start = bot.entity.position.clone();
  const target = resolveRelativeWalkTarget(bot, action.direction, distance);
  const range = Math.min(0.45, Math.max(0.15, distance * 0.1));
  const timeoutMs = Math.min(180000, Math.max(10000, distance * 2500));
  bot.pathfinder.setMovements(new Movements(bot));
  log(username, `大厅动作 ${index}：开始前进到 ${target.x.toFixed(1)}, ${target.y.toFixed(1)}, ${target.z.toFixed(1)}`);
  try {
    await withTimeout(bot.pathfinder.goto(new goals.GoalNear(target.x, target.y, target.z, range)), timeoutMs, '按方向前进超时');
  } catch (error) {
    bot.pathfinder.stop();
    throw error;
  }
  const moved = Math.hypot(bot.entity.position.x - start.x, bot.entity.position.z - start.z);
  if (moved < Math.min(0.25, distance * 0.4)) throw new Error(`按方向前进没有产生有效位移，当前只移动 ${moved.toFixed(2)} 格。`);
  log(username, `大厅动作 ${index}：已移动 ${moved.toFixed(1)} 格，当前坐标 ${formatPosition(bot.entity.position)}`);
}

async function runFindEntityAction(username, action, index) {
  const session = sessions.get(username);
  const bot = session?.bot;
  if (!bot?.entity || !bot.pathfinder) return;

  const entity = findEntityByName(bot, action.entity, action.entityId);
  if (!entity) throw new Error(`找不到实体/NPC：${action.entity || '未填写'}`);

  const range = Math.max(1, Number(action.range) || 2);
  bot.pathfinder.setMovements(new Movements(bot));
  log(username, `大厅动作 ${index}：寻找 ${getEntityLabel(entity)}，距离 ${bot.entity.position.distanceTo(entity.position).toFixed(1)}`);
  try {
    await withTimeout(
      bot.pathfinder.goto(new goals.GoalNear(entity.position.x, entity.position.y, entity.position.z, range)),
      60000,
      `寻找实体/NPC 超时：${getEntityLabel(entity)}`
    );
  } catch (error) {
    bot.pathfinder.stop();
    throw error;
  }
  const interactionEntity = findEntityByName(bot, action.entity, action.entityId);
  if (!interactionEntity) throw new Error(`到达后实体/NPC 已不可见：${action.entity}`);
  log(username, `大厅动作 ${index}：已靠近 ${getEntityLabel(interactionEntity)}，当前坐标 ${formatPosition(bot.entity.position)}`);
  await sleep(Math.max(0, Number(action.delayMs) || 0));

  if (action.interact === 'right' || action.interact === 'left') {
    const targetHeight = Math.max(0.5, Number(interactionEntity.height) || 1.8);
    await bot.lookAt(interactionEntity.position.offset(0, targetHeight * 0.65, 0), true);
    await sleep(80);
    if (action.interact === 'right') {
      await bot.activateEntity(interactionEntity);
      log(username, `大厅动作 ${index}：已朝向并右键交互 ${getEntityLabel(interactionEntity)}`);
    } else {
      await bot.attack(interactionEntity);
      log(username, `大厅动作 ${index}：已朝向并左键交互 ${getEntityLabel(interactionEntity)}`);
    }
    await sleep(250);
  }
}

async function runPressKeyAction(username, action, index) {
  const session = sessions.get(username);
  const bot = session?.bot;
  if (!bot?.entity) return;

  const requestedKey = String(action.key || '').trim();
  const control = resolveControlState(requestedKey);
  if (!control) throw new Error(`不支持的按键：${requestedKey}。可用 W/A/S/D/Space/Shift/Ctrl。`);
  const durationMs = Math.max(50, Math.min(60000, Number(action.durationMs) || 500));

  log(username, `大厅动作 ${index}：按下 ${requestedKey}，保持 ${durationMs}ms`);
  bot.setControlState(control, true);
  try {
    await sleep(durationMs);
  } finally {
    bot.setControlState(control, false);
  }
  log(username, `大厅动作 ${index}：已松开 ${requestedKey}，当前坐标 ${formatPosition(bot.entity.position)}`);
}

function resolveControlState(key) {
  const normalized = String(key || '').trim().toLowerCase().replace(/\s+/g, '');
  const controls = {
    w: 'forward',
    forward: 'forward',
    前进: 'forward',
    s: 'back',
    back: 'back',
    后退: 'back',
    a: 'left',
    left: 'left',
    左移: 'left',
    d: 'right',
    right: 'right',
    右移: 'right',
    space: 'jump',
    spacebar: 'jump',
    空格: 'jump',
    jump: 'jump',
    跳跃: 'jump',
    shift: 'sneak',
    sneak: 'sneak',
    潜行: 'sneak',
    ctrl: 'sprint',
    control: 'sprint',
    sprint: 'sprint',
    疾跑: 'sprint'
  };
  return controls[normalized] || '';
}

async function runMoveSlotAction(username, action, index) {
  const session = sessions.get(username);
  const bot = session?.bot;
  if (!bot?.entity) return;

  const fromSlot = resolveWindowSlot(action);
  const toSlot = Number(action.toSlot);
  if (!Number.isInteger(toSlot) || toSlot < 0) throw new Error('移动背包槽位需要填写目标槽位。');

  await bot.moveSlotItem(fromSlot, toSlot);
  log(username, `大厅动作 ${index}：移动槽位 ${fromSlot} -> ${toSlot}`);
}

function findEntityByName(bot, keyword, entityId) {
  const normalized = String(keyword || '').trim().toLowerCase();
  if (Number.isInteger(Number(entityId))) {
    const exactEntity = bot.entities?.[Number(entityId)];
    const exactName = exactEntity ? getEntityLabel(exactEntity).toLowerCase() : '';
    if (exactEntity && exactEntity !== bot.entity && exactEntity.position && (!normalized || exactName.includes(normalized))) return exactEntity;
  }
  if (!normalized) return null;

  return Object.values(bot.entities || {})
    .filter((entity) => entity && entity !== bot.entity && entity.position)
    .filter((entity) => getEntityLabel(entity).toLowerCase().includes(normalized))
    .sort((left, right) => bot.entity.position.distanceTo(left.position) - bot.entity.position.distanceTo(right.position))[0] || null;
}

function getEntityLabel(entity) {
  const candidates = [entity.username, entity.customName, entity.displayName, entity.name, entity.type];
  for (const candidate of candidates) {
    const text = getEntityText(candidate);
    if (text) return text;
  }
  return String(entity.id);
}

function getEntityText(value) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const directText = typeof value.text === 'string' ? value.text : '';
  const extraText = Array.isArray(value.extra) ? value.extra.map(getEntityText).join('') : '';
  return `${directText}${extraText}`.trim();
}

function formatPosition(position) {
  return `X ${position.x.toFixed(1)} / Y ${position.y.toFixed(1)} / Z ${position.z.toFixed(1)}`;
}

async function runUseItemAction(username, action, index = 0) {
  const session = sessions.get(username);
  const bot = session?.bot;
  if (!bot?.entity) return;

  const count = Math.max(1, Number(action.count) || 1);
  const delayMs = Math.max(0, Number(action.delayMs) || 600);
  for (let i = 0; i < count; i += 1) {
    if (action.button === 'left') {
      bot.swingArm('right');
    } else {
      bot.activateItem();
    }
    const buttonLabel = action.button === 'left' ? '左键' : '右键';
    log(username, index ? `大厅动作 ${index}：${buttonLabel}使用物品 ${i + 1}/${count}` : `大厅使用物品：第 ${i + 1} 次`);
    await sleep(delayMs);
  }
}

async function runClickSlotAction(username, action, index) {
  const session = sessions.get(username);
  const bot = session?.bot;
  if (!bot?.entity) return;

  const window = await waitForWindow(username, action.title, Number(action.timeoutMs) || 5000);
  const slot = resolveWindowSlot(action);
  const count = Math.max(1, Number(action.count) || 1);
  const delayMs = Math.max(0, Number(action.delayMs) || 500);
  const mouseButton = action.button === 'right' ? 1 : 0;

  for (let i = 0; i < count; i += 1) {
    await bot.clickWindow(slot, mouseButton, 0);
    log(username, `大厅动作 ${index}：${action.button === 'right' ? '右键' : '左键'}点击窗口 ${getWindowTitle(window) || '未命名窗口'} 槽位 ${slot} (${i + 1}/${count})`);
    await sleep(delayMs);
  }
}

async function runClickItemAction(username, action, index) {
  const session = sessions.get(username);
  const bot = session?.bot;
  if (!bot?.entity) return;

  const window = await waitForWindow(username, action.title, Number(action.timeoutMs) || 5000);
  const keyword = normalizeSearchText(action.item);
  const preferredSlot = Number(action.slot);
  const preferredItem = Number.isInteger(preferredSlot) ? window.slots?.[preferredSlot] : null;
  let slot = -1;
  if (preferredItem && (!keyword || getItemSearchText(preferredItem).includes(keyword))) {
    slot = preferredSlot;
  } else if (keyword) {
    slot = (window.slots || []).findIndex((item) => item && getItemSearchText(item).includes(keyword));
  }
  if (slot < 0) throw new Error(`窗口里找不到按钮/物品：${action.item || `槽位 ${preferredSlot}`}`);

  const count = Math.max(1, Number(action.count) || 1);
  const delayMs = Math.max(0, Number(action.delayMs) || 500);
  const mouseButton = action.button === 'right' ? 1 : 0;
  for (let i = 0; i < count; i += 1) {
    await bot.clickWindow(slot, mouseButton, 0);
    const actionLabel = action.type === 'operateWindow' ? '操作点击窗口' : '按物品名点击';
    log(username, `大厅动作 ${index}：${actionLabel} ${action.item || '已选按钮'}，槽位 ${slot}，${action.button === 'right' ? '右键' : '左键'} (${i + 1}/${count})`);
    await sleep(delayMs);
  }
}

function getItemSearchText(item) {
  return normalizeSearchText([
    getReadableComponentText(item.customName),
    item.displayName,
    item.name,
    ...getItemLore(item)
  ].filter(Boolean).join(' '));
}

function normalizeSearchText(value) {
  return String(value || '').replace(/§[0-9a-fk-or]/gi, '').trim().toLowerCase();
}

async function waitForChatText(username, text, timeoutMs, index = 0) {
  const session = sessions.get(username);
  const keyword = String(text || '').trim();
  const deadline = Date.now() + Math.max(100, timeoutMs);
  const earliest = Date.now() - 1000;
  while (Date.now() <= deadline) {
    const match = session?.recentMessages?.findLast((item) => item.at >= earliest && item.text.includes(keyword));
    if (match) {
      log(username, `大厅动作 ${index}：已匹配聊天内容 ${keyword}`);
      return match;
    }
    await sleep(100);
  }
  throw new Error(`等待聊天内容超时：${keyword}`);
}

async function runClickChatAction(username, action, index) {
  const session = sessions.get(username);
  const keyword = normalizeSearchText(action.chatButton);
  const deadline = Date.now() + Math.max(100, Number(action.timeoutMs) || 5000);
  let button = null;
  while (Date.now() <= deadline) {
    button = session?.chatButtons?.findLast((item) => normalizeSearchText(item.label).includes(keyword));
    if (button) break;
    await sleep(100);
  }
  if (!button) throw new Error(`找不到聊天按钮：${action.chatButton}`);
  if (!['run_command', 'suggest_command'].includes(button.action)) {
    throw new Error(`聊天按钮动作不支持自动执行：${button.action}`);
  }
  enqueueChat(username, button.value, `大厅动作 ${index}：点击聊天按钮 ${button.label} -> ${button.value}`);
}

function resolveWindowSlot(action) {
  if (action.slot !== undefined && action.slot !== '') {
    const slot = Number(action.slot);
    if (Number.isInteger(slot) && slot >= 0) return slot;
  }

  const row = Number(action.row);
  const column = Number(action.column);
  if (!Number.isInteger(row) || !Number.isInteger(column) || row < 1 || column < 1) {
    throw new Error('点击菜单槽位需要填写槽位，或填写行和列。');
  }

  return (row - 1) * 9 + (column - 1);
}

async function waitForWindow(username, titleText = '', timeoutMs = 5000) {
  const session = sessions.get(username);
  const title = String(titleText || '').trim();
  const deadline = Date.now() + Math.max(100, timeoutMs);

  while (Date.now() <= deadline) {
    const window = session?.bot?.currentWindow || session?.lastWindow;
    if (window && (!title || getWindowTitle(window).includes(title))) {
      log(username, `大厅动作：已匹配窗口 ${getWindowTitle(window) || '未命名窗口'}`);
      return window;
    }
    await sleep(100);
  }

  throw new Error(title ? `等待窗口超时：${title}` : '等待窗口超时');
}

function emitRuntimeEvent(event) {
  console.log(`::ly-event ${JSON.stringify(event)}`);
}

function emitWindowSnapshot(username) {
  const session = sessions.get(username);
  emitRuntimeEvent({
    type: 'windowSnapshot',
    username,
    window: getWindowSnapshot(session),
    position: getPositionSnapshot(session),
    entities: getEntitySnapshot(session),
    messages: getMessageSnapshot(session),
    chatButtons: getChatButtonSnapshot(session)
  });
}

function getMessageSnapshot(session) {
  return (session?.recentMessages || []).slice(-8).map((item) => ({ text: item.text, at: item.at }));
}

function getChatButtonSnapshot(session) {
  return (session?.chatButtons || []).slice(-20).map((item) => ({ ...item }));
}

function getPositionSnapshot(session) {
  const position = session?.bot?.entity?.position;
  if (!position) return null;
  return { x: position.x, y: position.y, z: position.z };
}

function getEntitySnapshot(session) {
  const bot = session?.bot;
  if (!bot?.entity) return [];

  return Object.values(bot.entities || {})
    .filter((entity) => entity && entity !== bot.entity && entity.position)
    .filter((entity) => !isArmorStandEntity(entity))
    .map((entity) => ({
      id: entity.id,
      type: entity.type || '',
      name: getEntityLabel(entity),
      username: entity.username || '',
      x: entity.position.x,
      y: entity.position.y,
      z: entity.position.z,
      distance: bot.entity.position.distanceTo(entity.position)
    }))
    .sort((left, right) => left.distance - right.distance);
}

function isArmorStandEntity(entity) {
  return [entity?.name, entity?.displayName, entity?.type]
    .map((value) => getEntityText(value).replace(/[\s_-]/g, '').toLowerCase())
    .includes('armorstand');
}

function getWindowSnapshot(session) {
  const window = session?.bot?.currentWindow || session?.lastWindow;
  if (!window) return null;

  return {
    title: getWindowTitle(window),
    type: window.type || '',
    inventoryStart: Number.isInteger(window.inventoryStart) ? window.inventoryStart : null,
    slots: (window.slots || []).map((item, slot) => serializeWindowSlot(slot, item))
  };
}

function getWindowMenuItems(window) {
  if (!window) return [];
  const slots = window.slots || [];
  const inventoryStart = Number.isInteger(window.inventoryStart) ? window.inventoryStart : slots.length;
  return slots
    .map((item, slot) => serializeWindowSlot(slot, item))
    .filter((item) => item.item && item.slot < inventoryStart);
}

function scheduleWindowContents(username, session, window) {
  clearTimeout(session.windowLogTimer);
  session.windowLogTimer = setTimeout(() => {
    session.windowLogTimer = null;
    if (session.lastWindow !== window) return;
    logWindowContents(username, session, window);
    emitWindowSnapshot(username);
  }, 150);
}

function logWindowContents(username, session, window) {
  const title = getWindowTitle(window) || '未命名窗口';
  const items = getWindowMenuItems(window);
  const signature = JSON.stringify({
    title,
    items: items.map((item) => [item.slot, item.name, item.displayName, item.count, item.lore])
  });
  if (signature === session.lastWindowLogSignature) return;
  session.lastWindowLogSignature = signature;

  if (items.length === 0) return;

  items.forEach((item, index) => {
    const name = item.displayName || item.name || '未命名物品';
    const lore = item.lore.length ? `；提示：${item.lore.join(' / ')}` : '';
    log(username, `窗口按钮/菜单项 [${title}] ${index + 1}：槽位 ${item.slot}；${name} x${item.count}${lore}`);
  });
}

function serializeWindowSlot(slot, item) {
  if (!item) return { slot, item: false, name: '', displayName: '', count: 0, lore: [] };
  return {
    slot,
    item: true,
    name: item.name || '',
    displayName: getReadableComponentText(item.customName) || item.displayName || item.name || '',
    count: item.count || 1,
    lore: getItemLore(item)
  };
}

function getItemLore(item) {
  const lore = Array.isArray(item?.customLore)
    ? item.customLore
    : (item?.customLore ? [item.customLore] : []);
  return lore
    .map((line) => getReadableComponentText(line))
    .filter(Boolean)
    .slice(0, 12);
}

function getReadableComponentText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return normalizeSearchDisplayText(getChatComponentText(value));
  const text = String(value);
  if (/^\s*[\[{]/.test(text)) {
    try {
      return normalizeSearchDisplayText(getChatComponentText(JSON.parse(text)));
    } catch {}
  }
  return normalizeSearchDisplayText(text);
}

function normalizeSearchDisplayText(value) {
  return String(value || '').replace(/§[0-9a-fk-or]/gi, '').trim();
}

function getWindowTitle(window) {
  if (!window) return '';
  const title = window.title ?? window.customTitle ?? window.type ?? '';
  const readableTitle = getReadableComponentText(title);
  if (readableTitle) return readableTitle;
  try {
    if (typeof title.toString === 'function') return normalizeSearchDisplayText(title.toString());
  } catch {}
  try {
    return JSON.stringify(title);
  } catch {
    return '';
  }
}

function stopLobbyWorker(username) {
  const session = sessions.get(username);
  if (!session?.lobbyTimer) return;
  clearTimeout(session.lobbyTimer);
  session.lobbyTimer = null;
}

function startSchedulerWorkers(username) {
  const session = sessions.get(username);
  if (!session) return;

  stopSchedulerWorkers(username);

  for (const task of ACTIVE_FEATURES.scheduler.tasks || []) {
    if (task.enabled === false || !task.action) continue;

    if (task.trigger === 'login') {
      sendScheduledAction(username, task);
    }

    if (task.trigger === 'interval') {
      const intervalMs = Math.max(1000, Number(task.intervalMs) || 60000);
      const timer = setInterval(() => sendScheduledAction(username, task), intervalMs);
      session.schedulerTimers.push(timer);
    }
  }
}

function stopSchedulerWorkers(username) {
  const session = sessions.get(username);
  if (!session?.schedulerTimers) return;
  for (const timer of session.schedulerTimers) clearInterval(timer);
  session.schedulerTimers = [];
}

function sendScheduledAction(username, task) {
  const session = sessions.get(username);
  if (!isBotInPlay(session?.bot)) return;

  try {
    enqueueChat(username, task.action, `定时任务 ${task.name || '未命名'}：${task.action}`);
  } catch (error) {
    log(username, `定时任务 ${task.name || '未命名'} 失败：${error.message}`);
  }
}

function handleChat(account, playerName, message) {
  if (!ACTIVE_FEATURES.chat.keywordReply) return;
  if (playerName === account.username) return;

  for (const rule of ACTIVE_FEATURES.chat.keywordRules || []) {
    if (!rule.keyword || !rule.reply) continue;
    if (!message.includes(rule.keyword)) continue;

    const session = sessions.get(account.username);
    const reply = rule.reply.replaceAll('{player}', playerName);
    enqueueChat(account.username, reply, `关键词回复：${rule.keyword} -> ${reply}`);
    return;
  }
}

function handleServerMessage(account, text) {
  if (!ACTIVE_FEATURES.chat.autoLogin || !account.registerPassword) return;

  const session = sessions.get(account.username);
  if (!session) return;

  const lowerText = text.toLowerCase();
  if (isLoggedInMessage(text)) {
    session.loginSuccessDetected = true;
    return;
  }

  const shouldRegister = lowerText.includes('/register') || lowerText.includes('register') || text.includes('注册');
  const shouldLogin = isLoginPrompt(text);

  if (!shouldRegister && !shouldLogin) return;

  if (shouldLogin) {
    if (session.loginCommandSent || session.loginSuccessDetected) return;

    session.loginCommandSent = true;
    enqueueChat(account.username, `/login ${account.registerPassword}`, `自动登录发送：/login ${account.registerPassword}`);
    return;
  }

  const shouldConfirmRegister = isRegisterConfirmPrompt(text);
  if (shouldConfirmRegister) {
    if (session.registerConfirmCommandSent) return;

    session.registerConfirmCommandSent = true;
    enqueueChat(account.username, `/register ${account.registerPassword} ${account.registerPassword}`, `自动登录发送：/register ${account.registerPassword} ${account.registerPassword}`);
    return;
  }

  if (!session.registerSingleCommandSent) {
    session.registerSingleCommandSent = true;
    enqueueChat(account.username, `/register ${account.registerPassword}`, `自动登录发送：/register ${account.registerPassword}`);
    return;
  }

  return;
}

function recordInteractiveMessage(session, message, text) {
  if (!session || !text) return;
  const now = Date.now();
  session.recentMessages.push({ text, at: now });
  session.recentMessages = session.recentMessages.slice(-50);

  const component = getChatComponentJson(message);
  const buttons = [];
  collectChatButtons(component, buttons, text);
  for (const button of buttons) {
    const key = `${button.action}:${button.value}`;
    session.chatButtons = session.chatButtons.filter((item) => `${item.action}:${item.value}` !== key);
    session.chatButtons.push({ ...button, at: now });
  }
  session.chatButtons = session.chatButtons.slice(-20);
}

function getChatComponentJson(message) {
  try {
    if (typeof message?.toJSON === 'function') return message.toJSON();
  } catch {}
  return message?.json || null;
}

function collectChatButtons(component, output, fallbackLabel = '') {
  if (!component) return;
  if (Array.isArray(component)) {
    component.forEach((item) => collectChatButtons(item, output, fallbackLabel));
    return;
  }
  if (typeof component !== 'object') return;

  const clickEvent = component.clickEvent;
  const action = clickEvent?.action;
  const value = clickEvent?.value ?? clickEvent?.command;
  if (typeof action === 'string' && typeof value === 'string' && value.trim()) {
    output.push({
      label: getChatComponentText(component) || fallbackLabel || value,
      action,
      value: value.trim()
    });
  }

  collectChatButtons(component.extra, output, fallbackLabel);
  collectChatButtons(component.with, output, fallbackLabel);
}

function getChatComponentText(component) {
  if (typeof component === 'string') return component;
  if (Array.isArray(component)) return component.map(getChatComponentText).join('');
  if (!component || typeof component !== 'object') return '';
  const text = typeof component.text === 'string' ? component.text : '';
  const translated = typeof component.translate === 'string' ? component.translate : '';
  const withText = getChatComponentText(component.with);
  const extraText = getChatComponentText(component.extra);
  return `${text}${translated && !text ? translated : ''}${withText}${extraText}`.trim();
}

function isRegisterConfirmPrompt(text) {
  return String(text || '').includes('请输入“/register <密码> <再输入一次以确定密码>”以注册');
}

function isLoginPrompt(text) {
  const value = String(text || '');
  const lowerValue = value.toLowerCase();
  return lowerValue.includes('/login')
    || lowerValue.includes('login password')
    || (value.includes('请输入') && value.includes('登录'));
}

function isLoggedInMessage(text) {
  const value = String(text || '');
  return value.includes('已成功登录')
    || value.includes('已帮你自动登录')
    || value.includes('已经登陆过了')
    || value.includes('已经登录过了')
    || value.includes('已登录')
    || value.includes('已登陆');
}

function logGameMessage(username, message) {
  const text = formatGameMessage(message);
  if (!text) return '';
  log(username, `游戏消息：${text}`);
  return text;
}

function formatGameMessage(message) {
  if (!message) return '';

  try {
    if (typeof message.toMotd === 'function') return message.toMotd();
  } catch {}

  return String(message);
}

function enqueueChat(username, message, successLog) {
  const session = sessions.get(username);
  if (!session) return false;

  const trimmedMessage = String(message || '').trim();
  if (!trimmedMessage) return false;

  session.chatQueue.push({ message: trimmedMessage, successLog });
  scheduleChatQueue(username);
  return true;
}

function scheduleChatQueue(username) {
  const session = sessions.get(username);
  if (!session || session.chatQueueTimer) return;

  const cooldownMs = Math.max(0, Number(ACTIVE_CONFIG.messageCooldownMs) || 0);
  const elapsedMs = Date.now() - (session.lastChatAt || 0);
  const delayMs = Math.max(0, cooldownMs - elapsedMs);

  session.chatQueueTimer = setTimeout(() => flushChatQueue(username), delayMs);
}

function flushChatQueue(username) {
  const session = sessions.get(username);
  if (!session) return;

  session.chatQueueTimer = null;
  const item = session.chatQueue.shift();
  if (!item) return;

  if (!isBotInPlay(session.bot)) {
    log(username, '发送失败：账号不在线。');
  } else {
    try {
      session.bot.chat(item.message);
      session.lastChatAt = Date.now();
      if (item.successLog) log(username, item.successLog);
    } catch (error) {
      log(username, `发送失败：${error.message}`);
    }
  }

  if (session.chatQueue.length > 0) {
    scheduleChatQueue(username);
  }
}

function clearChatQueue(username) {
  const session = sessions.get(username);
  if (!session) return;

  if (session.chatQueueTimer) {
    clearTimeout(session.chatQueueTimer);
    session.chatQueueTimer = null;
  }
  session.chatQueue = [];
}

function sendChatCommand(target, message) {
  if (!message) return;

  let matchedTarget = false;
  for (const [username, session] of sessions) {
    if (target !== 'all' && target !== username) continue;
    matchedTarget = true;
    if (!isBotInPlay(session.bot)) {
      log(username, '发送失败：账号不在线。');
      continue;
    }

    try {
      enqueueChat(username, message, `网页发送：${message}`);
    } catch (error) {
      log(username, `发送失败：${error.message}`);
    }
  }

  if (target !== 'all' && !matchedTarget) {
    log(null, `发送失败：找不到目标账号 ${target}。`);
  }
}

function isBotInPlay(bot) {
  return String(bot?._client?.state || '').toLowerCase() === 'play';
}

function randomBetween(min, max) {
  const safeMin = Number(min) || 0;
  const safeMax = Math.max(safeMin, Number(max) || safeMin);
  return Math.floor(safeMin + Math.random() * (safeMax - safeMin + 1));
}

function randomOffset(range) {
  const value = (Math.random() * 2 - 1) * range;
  if (Math.abs(value) >= 0.5) return value;
  return value < 0 ? -0.5 : 0.5;
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs))
  ]);
}

function scheduleReconnect(account) {
  const session = sessions.get(account.username);
  if (!session || !ACTIVE_CONFIG.reconnect || session.reconnecting || session.stopped) return;

  session.reconnecting = true;
  log(account.username, `${ACTIVE_CONFIG.reconnectDelayMs} 毫秒后自动重连...`);
  session.reconnectTimer = setTimeout(() => createBot(account), ACTIVE_CONFIG.reconnectDelayMs);
}

function formatReason(reason) {
  if (typeof reason === 'string') return reason;
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

async function startAllAccounts() {
  const accounts = loadAccounts().filter((account) => account.enabled);
  const enabledFeatures = getEnabledFeatures();

  if (accounts.length === 0) {
    throw new Error('至少需要启用一个账号。');
  }

  log(null, `读取到 ${accounts.length} 个启用账号。`);
  log(null, enabledFeatures.length ? `已启用功能：${enabledFeatures.join('、')}` : '未启用扩展功能。');

  for (const account of accounts) {
    createBot(account);
    await sleep(ACTIVE_CONFIG.connectIntervalMs);
  }

  if (ACTIVE_CONFIG.testExitAfterMs) {
    setTimeout(() => {
      log(null, `测试模式：${ACTIVE_CONFIG.testExitAfterMs} 毫秒后自动退出。`);
      stopAllAccounts();
      setTimeout(() => process.exit(0), 500);
    }, ACTIVE_CONFIG.testExitAfterMs);
  }
}

function stopAllAccounts() {
  log(null, '正在停止所有账号...');
  ACTIVE_CONFIG.reconnect = false;

  for (const [username, session] of sessions) {
    session.stopped = true;
    clearTimeout(session.reconnectTimer);
    stopFeatureWorkers(username);
    session.bot?.quit();
  }
}

function applyRuntimeConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('实时配置格式不正确');
  }

  const nextConfig = structuredClone(config);
  normalizeFileConfig(nextConfig);

  ACTIVE_CONFIG = createActiveConfig(nextConfig);
  ACTIVE_ACCOUNTS = nextConfig.accounts;
  ACTIVE_FEATURES = mergeFeatures(nextConfig.features || {});

  for (const [username, session] of sessions) {
    if (!session?.bot) continue;
    restartLiveFeatureWorkers(username);
  }

  const enabledFeatures = getEnabledFeatures();
  log(null, enabledFeatures.length ? `实时配置已应用，当前启用功能：${enabledFeatures.join('、')}` : '实时配置已应用，当前没有启用扩展功能。');
}

function listenDashboardCommands() {
  const input = readline.createInterface({ input: process.stdin });

  input.on('line', (line) => {
    try {
      const command = JSON.parse(line);

      if (command.type === 'chat') {
        sendChatCommand(command.target || 'all', command.message || '');
        return;
      }

      if (command.type === 'windowSnapshot') {
        emitWindowSnapshot(command.target || '');
        return;
      }

      if (command.type === 'lobbyAction') {
        void runManualLobbyAction(command.target || '', command.action || {}, command.requestId || '');
        return;
      }

      if (command.type === 'config') {
        applyRuntimeConfig(command.config);
      }
    } catch (error) {
      log(null, `控制台指令解析失败：${error.message}`);
    }
  });
}

async function runManualLobbyAction(username, action, requestId) {
  const session = sessions.get(username);
  let claimed = false;
  try {
    if (!session?.bot?.entity) throw new Error(`账号未在线：${username}`);
    if (session.manualLobbyActionRunning) throw new Error('上一个网页即时动作仍在执行。');
    session.manualLobbyActionRunning = true;
    claimed = true;
    log(username, `网页即时执行大厅动作：${action.type || '未知动作'}`);
    await runLobbyAction(username, { ...action, enabled: true }, '即时');
    await sleep(300);
    emitWindowSnapshot(username);
    log(username, '网页即时动作执行完成。');
    emitRuntimeEvent({
      type: 'lobbyActionResult',
      requestId,
      username,
      ok: true,
      message: '动作执行完成。'
    });
  } catch (error) {
    log(username || null, `网页即时动作失败：${error.message}`);
    emitRuntimeEvent({
      type: 'lobbyActionResult',
      requestId,
      username,
      ok: false,
      message: error.message
    });
  } finally {
    if (claimed) session.manualLobbyActionRunning = false;
  }
}

process.on('SIGINT', () => {
  stopAllAccounts();
  process.exit(0);
});

listenDashboardCommands();
startAllAccounts().catch((error) => {
  log(null, `启动失败：${error.message}`);
  process.exit(1);
});

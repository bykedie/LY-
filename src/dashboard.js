import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');
const configPath = process.env.BOT_CONFIG_PATH
  ? path.resolve(process.env.BOT_CONFIG_PATH)
  : path.join(projectRoot, 'bot.config.json');
const configBaseName = path.basename(configPath, path.extname(configPath));
const profilesDir = path.join(path.dirname(configPath), `${configBaseName}.profiles`);
const profilesIndexPath = path.join(profilesDir, 'profiles.json');
const exampleConfigPath = path.join(projectRoot, 'bot.config.example.json');
const port = Number(process.env.DASHBOARD_PORT || 30123);
const host = (process.env.DASHBOARD_HOST || '127.0.0.1').trim() || '127.0.0.1';
const dashboardUser = (process.env.DASHBOARD_USER || 'admin').trim() || 'admin';
const dashboardPassword = process.env.DASHBOARD_PASSWORD || '';

let botProcess = null;
let runningConfig = null;
let stopping = false;
let logs = [];
let botStdoutBuffer = '';
const runtimeSnapshots = new Map();
const defaultProfileId = 'default';
const defaultConfig = readJson(exampleConfigPath);
const requiredDependencyFiles = [
  'node_modules/dotenv/package.json',
  'node_modules/mineflayer/package.json',
  'node_modules/mineflayer-pathfinder/package.json'
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function readConfig() {
  if (!fs.existsSync(configPath)) {
    return defaultConfig;
  }

  return mergeDefaults(defaultConfig, readJson(configPath));
}

function saveConfig(config) {
  const normalizedConfig = mergeDefaults(defaultConfig, config);
  validateConfig(normalizedConfig);
  writeJson(configPath, normalizedConfig);
  saveActiveProfileConfig(normalizedConfig);
  return normalizedConfig;
}

function resetConfig() {
  const config = defaultConfig;
  writeJson(configPath, config);
  return config;
}

function ensureProfilesDir() {
  fs.mkdirSync(profilesDir, { recursive: true });
}

function profileConfigPath(profileId) {
  return path.join(profilesDir, `${profileId}.json`);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeProfileName(name) {
  const normalized = String(name || '').trim().slice(0, 60);
  if (!normalized) throw new Error('配置档案名称不能为空。');
  return normalized;
}

function createProfileId() {
  return `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readProfileIndex() {
  ensureProfilesDir();
  if (!fs.existsSync(profilesIndexPath)) {
    return { activeProfileId: defaultProfileId, profiles: [] };
  }

  const index = readJson(profilesIndexPath);
  return {
    activeProfileId: typeof index.activeProfileId === 'string' ? index.activeProfileId : defaultProfileId,
    profiles: Array.isArray(index.profiles) ? index.profiles : []
  };
}

function writeProfileIndex(index) {
  ensureProfilesDir();
  writeJson(profilesIndexPath, {
    activeProfileId: index.activeProfileId || defaultProfileId,
    profiles: index.profiles
  });
}

function ensureDefaultProfile(index = readProfileIndex()) {
  const profiles = [...index.profiles];
  const existing = profiles.find((profile) => profile.id === defaultProfileId);
  const updatedAt = fs.existsSync(configPath) ? fs.statSync(configPath).mtime.toISOString() : nowIso();

  if (!existing) {
    profiles.unshift({ id: defaultProfileId, name: '当前配置', updatedAt });
  }

  const defaultPath = profileConfigPath(defaultProfileId);
  if (!fs.existsSync(defaultPath)) {
    writeJson(defaultPath, readConfig());
  }

  const activeProfileId = profiles.some((profile) => profile.id === index.activeProfileId)
    ? index.activeProfileId
    : defaultProfileId;
  const nextIndex = { activeProfileId, profiles };
  writeProfileIndex(nextIndex);
  return nextIndex;
}

function listProfiles() {
  return ensureDefaultProfile(readProfileIndex());
}

function saveActiveProfileConfig(config) {
  const index = ensureDefaultProfile(readProfileIndex());
  const activeId = index.activeProfileId || defaultProfileId;
  writeJson(profileConfigPath(activeId), config);
  const profiles = index.profiles.map((profile) => profile.id === activeId ? { ...profile, updatedAt: nowIso() } : profile);
  writeProfileIndex({ ...index, profiles });
}

function saveProfile({ id, name, config }) {
  const normalizedConfig = mergeDefaults(defaultConfig, config);
  validateConfig(normalizedConfig);
  const index = ensureDefaultProfile(readProfileIndex());
  const knownProfile = index.profiles.find((profile) => profile.id === id);
  const profileId = knownProfile ? knownProfile.id : createProfileId();
  const profileName = normalizeProfileName(name || knownProfile?.name);
  const updatedAt = nowIso();
  const profiles = index.profiles.filter((profile) => profile.id !== profileId);
  profiles.push({ id: profileId, name: profileName, updatedAt });
  writeJson(profileConfigPath(profileId), normalizedConfig);
  writeJson(configPath, normalizedConfig);
  writeProfileIndex({ activeProfileId: profileId, profiles });
  return { activeProfileId: profileId, profiles, config: normalizedConfig };
}

function useProfile(id) {
  const index = ensureDefaultProfile(readProfileIndex());
  const profile = index.profiles.find((item) => item.id === id);
  if (!profile) throw new Error('找不到这个配置档案。');

  const config = mergeDefaults(defaultConfig, readJson(profileConfigPath(profile.id)));
  validateConfig(config);
  writeJson(configPath, config);
  writeProfileIndex({ ...index, activeProfileId: profile.id });
  return { activeProfileId: profile.id, profiles: index.profiles, config };
}

function deleteProfile(id) {
  if (!id || id === defaultProfileId) throw new Error('默认配置档案不能删除。');
  const index = ensureDefaultProfile(readProfileIndex());
  if (!index.profiles.some((profile) => profile.id === id)) throw new Error('找不到这个配置档案。');
  fs.rmSync(profileConfigPath(id), { force: true });
  const profiles = index.profiles.filter((profile) => profile.id !== id);
  const activeProfileId = index.activeProfileId === id ? defaultProfileId : index.activeProfileId;
  writeProfileIndex({ activeProfileId, profiles });
  return useProfile(activeProfileId);
}

function mergeDefaults(defaultValue, value) {
  if (value === undefined) return defaultValue;
  if (Array.isArray(defaultValue)) return value;
  if (!isPlainObject(defaultValue)) return value;
  if (!isPlainObject(value)) return value;

  const merged = {};
  for (const key of Object.keys(defaultValue)) {
    merged[key] = mergeDefaults(defaultValue[key], value?.[key]);
  }
  for (const key of Object.keys(value || {})) {
    if (!(key in merged)) merged[key] = value[key];
  }
  return merged;
}

function validateConfig(config) {
  requirePlainObject(config, '配置');
  requirePlainObject(config.server, '服务器配置');
  requirePlainObject(config.runtime, '运行配置');
  requirePlainObject(config.features, '功能配置');
  requirePlainObject(config.features.combat, '战斗挂机配置');
  requirePlainObject(config.features.movement, '移动辅助配置');
  requirePlainObject(config.features.movement.walkTarget, '自动走路目标');
  requirePlainObject(config.features.movement.relativeWalk, '按方向前进配置');
  requirePlainObject(config.features.chat, '智能交互配置');
  requirePlainObject(config.features.lobby, '大厅功能配置');
  requirePlainObject(config.features.scheduler, '定时任务配置');

  if (typeof config.server.host !== 'string') throw new Error('服务器地址必须是文本。');
  config.server.host = config.server.host.trim();
  if (!config.server.host) throw new Error('服务器地址不能为空。');
  requireNumber(config.server.port, '服务器端口', { min: 1, max: 65535, integer: true });
  if (config.server.version !== false && typeof config.server.version !== 'string') throw new Error('服务器版本必须是 false 或版本字符串。');
  if (typeof config.server.version === 'string') {
    config.server.version = config.server.version.trim();
    if (!config.server.version || config.server.version === 'false' || config.server.version === 'auto') {
      config.server.version = false;
    }
  }
  requireEnum(config.server.auth, '登录模式', ['offline', 'microsoft']);
  if (!Array.isArray(config.accounts) || config.accounts.length === 0) throw new Error('至少需要填写一个账号。');
  if (config.accountPool !== undefined) validateAccountPool(config.accountPool);

  requireNumber(config.runtime.connectIntervalMs, '批量登录间隔', { min: 1000 });
  requireBoolean(config.runtime.reconnect, '断线自动重连');
  requireNumber(config.runtime.reconnectDelayMs, '重连延迟', { min: 1000 });
  requireBoolean(config.runtime.idleActions, '跳跃/转头保活');
  requireNumber(config.runtime.idleIntervalMs, '保活间隔', { min: 5000 });
  requireNumber(config.runtime.messageCooldownMs, '消息冷却', { min: 0 });
  if (typeof config.runtime.chatOnJoin !== 'string') throw new Error('全局进服发言必须是文本。');

  requireBoolean(config.features.combat.autoAttack, '自动攻击开关');
  requireBoolean(config.features.combat.autoFish, '自动钓鱼开关');
  requireBoolean(config.features.combat.autoEat, '自动进食开关');
  requireBoolean(config.features.combat.autoRespawn, '自动重生开关');
  requireBoolean(config.features.combat.attackHostile, '攻击敌对生物开关');
  requireBoolean(config.features.combat.attackPassive, '攻击被动生物开关');
  requireEnum(config.features.combat.attackMode, '攻击模式', ['single', 'multi']);
  requireEnum(config.features.combat.entityListMode, '实体列表模式', ['blacklist', 'whitelist']);
  requireNumber(config.features.combat.attackRange, '攻击范围', { min: 1, max: 6 });
  requireNumber(config.features.combat.attackIntervalMs, '攻击间隔', { min: 250 });
  requireNumber(config.features.combat.eatThreshold, '进食阈值', { min: 1, max: 20 });
  requireNumber(config.features.combat.fishingStartDelayMs, '钓鱼启动延迟', { min: 0 });
  requireNumber(config.features.combat.fishingCastDelayMs, '收竿后延迟', { min: 0 });
  requireNumber(config.features.combat.fishingTimeoutMs, '钓鱼超时', { min: 10000 });
  validateStringList(config.features.combat.entityList, '实体名单');

  requireBoolean(config.features.movement.autoWalk, '自动走路开关');
  requireBoolean(config.features.movement.antiAfk, '防挂机走动开关');
  requireBoolean(config.features.movement.switchHeldItem, '切换手持开关');
  requireBoolean(config.features.movement.antiAfkSneak, '防挂机潜行开关');
  requireBoolean(config.features.movement.antiAfkWalk, '防挂机随机走动开关');
  requireNumber(config.features.movement.antiAfkMinDelayMs, '防挂机最小延迟', { min: 1000 });
  requireNumber(config.features.movement.antiAfkMaxDelayMs, '防挂机最大延迟', { min: 1000 });
  if (config.features.movement.antiAfkMaxDelayMs < config.features.movement.antiAfkMinDelayMs) throw new Error('防挂机最大延迟不能小于最小延迟。');
  requireNumber(config.features.movement.antiAfkWalkRange, '防挂机随机走动范围', { min: 0 });
  requireNumber(config.features.movement.heldSlot, '移动快捷栏槽位', { min: 0, max: 8, integer: true });
  requireNumber(config.features.movement.walkRange, '自动走路到达范围', { min: 0 });
  requireBoolean(config.features.movement.relativeWalk.enabled, '按方向前进开关');
  requireEnum(config.features.movement.relativeWalk.direction, '按方向前进方向', ['forward', 'back', 'left', 'right', 'north', 'south', 'east', 'west']);
  requireNumber(config.features.movement.relativeWalk.distance, '按方向前进格数', { min: 0 });
  for (const axis of ['x', 'y', 'z']) {
    requireNumber(config.features.movement.walkTarget?.[axis], `自动走路目标 ${axis.toUpperCase()}`);
  }
  if (typeof config.features.movement.antiAfkCommand !== 'string') throw new Error('防挂机命令必须是文本。');
  config.features.movement.antiAfkCommand = config.features.movement.antiAfkCommand.trim();

  requireBoolean(config.features.chat.keywordReply, '关键词自动回复开关');
  requireBoolean(config.features.chat.presetMessages, '预设消息开关');
  requireBoolean(config.features.chat.remoteCommand, '发送游戏信息 / 指令开关');
  requireBoolean(config.features.chat.autoLogin, '自动登录开关');
  validateRuleList(config.features.chat.keywordRules, '关键词规则');
  validateStringList(config.features.chat.presetMessagesList, '预设消息');

  requireBoolean(config.features.lobby.useItem, '大厅自动使用物品开关');
  requireBoolean(config.features.lobby.actionSequence, '大厅动作序列开关');
  requireNumber(config.features.lobby.delayMs, '大厅执行延迟', { min: 0 });
  requireNumber(config.features.lobby.heldSlot, '大厅快捷栏槽位', { min: 0, max: 8, integer: true });
  requireNumber(config.features.lobby.useCount, '大厅使用次数', { min: 1, integer: true });
  validateLobbyActions(config.features.lobby.actions || []);

  requireBoolean(config.features.scheduler.enabled, '定时任务开关');
  validateSchedulerTasks(config.features.scheduler.tasks);

  const names = new Set();
  let enabledCount = 0;
  for (const [index, account] of config.accounts.entries()) {
    requirePlainObject(account, `第 ${index + 1} 个账号`);
    if (typeof account.username !== 'string') throw new Error(`第 ${index + 1} 个账号用户名必须是文本。`);
    const username = account.username.trim();
    if (!username) throw new Error(`第 ${index + 1} 个账号缺少用户名。`);
    if (names.has(username)) throw new Error(`账号名重复：${username}`);
    account.username = username;
    if (account.auth && !['offline', 'microsoft'].includes(account.auth)) throw new Error(`第 ${index + 1} 个账号登录模式必须是 offline、microsoft 或留空。`);
    if (account.enabled !== undefined) requireBoolean(account.enabled, `第 ${index + 1} 个账号启用开关`);
    if (typeof account.chatOnJoin !== 'string') throw new Error(`第 ${index + 1} 个账号进服发言必须是文本。`);
    if (typeof account.registerPassword !== 'string') throw new Error(`第 ${index + 1} 个账号注册密码必须是文本。`);
    if (account.note !== undefined && typeof account.note !== 'string') throw new Error(`第 ${index + 1} 个账号备注必须是文本。`);
    if (account.enabled !== false) enabledCount += 1;
    names.add(username);
  }
  if (enabledCount === 0) throw new Error('至少需要启用一个账号。');
}

function requireEnum(value, label, allowedValues) {
  if (!allowedValues.includes(value)) {
    throw new Error(`${label}必须是：${allowedValues.join('、')}。`);
  }
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') throw new Error(`${label}必须是真或假。`);
}

function requirePlainObject(value, label) {
  if (!isPlainObject(value)) throw new Error(`${label}必须是对象。`);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireNumber(value, label, options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label}必须是数字。`);
  if (options.integer && !Number.isInteger(number)) throw new Error(`${label}必须是整数。`);
  if (options.min !== undefined && number < options.min) throw new Error(`${label}不能小于 ${options.min}。`);
  if (options.max !== undefined && number > options.max) throw new Error(`${label}不能大于 ${options.max}。`);
}

function validateStringList(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label}必须是数组。`);
  if (!value.every((item) => typeof item === 'string')) throw new Error(`${label}里只能填写文本。`);
}

function validateAccountPool(value) {
  if (!Array.isArray(value)) throw new Error('账号池必须是数组。');
  for (const [index, account] of value.entries()) {
    requirePlainObject(account, `账号池第 ${index + 1} 个账号`);
    if (typeof account.username !== 'string') throw new Error(`账号池第 ${index + 1} 个账号名必须是文本。`);
    account.username = account.username.trim();
    if (typeof account.registerPassword !== 'string') throw new Error(`账号池第 ${index + 1} 个密码必须是文本。`);
    if (account.note !== undefined && typeof account.note !== 'string') throw new Error(`账号池第 ${index + 1} 个备注必须是文本。`);
    if (typeof account.note === 'string') account.note = account.note.trim();
  }
}

function validateRuleList(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label}必须是数组。`);
  for (const [index, rule] of value.entries()) {
    if (typeof rule.keyword !== 'string') throw new Error(`${label}第 ${index + 1} 条关键词必须是文本。`);
    if (typeof rule.reply !== 'string') throw new Error(`${label}第 ${index + 1} 条回复必须是文本。`);
  }
}

function validateLobbyActions(actions) {
  if (!Array.isArray(actions)) throw new Error('大厅动作序列必须是数组。');
  for (const [index, action] of actions.entries()) {
    requirePlainObject(action, `第 ${index + 1} 个大厅动作`);
    requireEnum(action.type, `第 ${index + 1} 个大厅动作类型`, ['wait', 'switchSlot', 'useItem', 'waitWindow', 'clickSlot', 'relativeWalk', 'findEntity', 'moveSlot', 'chat']);
    if (action.button !== undefined) requireEnum(action.button, `第 ${index + 1} 个大厅动作鼠标键`, ['left', 'right']);
    if (action.direction !== undefined) requireEnum(action.direction, `第 ${index + 1} 个大厅动作方向`, ['forward', 'back', 'left', 'right', 'north', 'south', 'east', 'west']);
    if (action.interact !== undefined) requireEnum(action.interact, `第 ${index + 1} 个大厅动作交互方式`, ['approach', 'left', 'right']);
    if (action.enabled !== undefined) requireBoolean(action.enabled, `第 ${index + 1} 个大厅动作启用开关`);
    if (action.delayMs !== undefined) requireNumber(action.delayMs, `第 ${index + 1} 个大厅动作延迟`, { min: 0 });
    if (action.timeoutMs !== undefined) requireNumber(action.timeoutMs, `第 ${index + 1} 个大厅动作超时`, { min: 100 });
    if (action.hotbarSlot !== undefined) requireNumber(action.hotbarSlot, `第 ${index + 1} 个大厅动作快捷栏`, { min: 1, max: 9, integer: true });
    if (action.count !== undefined) requireNumber(action.count, `第 ${index + 1} 个大厅动作次数`, { min: 1, integer: true });
    if (action.distance !== undefined) requireNumber(action.distance, `第 ${index + 1} 个大厅动作距离`, { min: 0 });
    if (action.range !== undefined) requireNumber(action.range, `第 ${index + 1} 个大厅动作范围`, { min: 0 });
    if (action.row !== undefined) requireNumber(action.row, `第 ${index + 1} 个大厅动作行`, { min: 1, max: 6, integer: true });
    if (action.column !== undefined) requireNumber(action.column, `第 ${index + 1} 个大厅动作列`, { min: 1, max: 9, integer: true });
    if (action.slot !== undefined) requireNumber(action.slot, `第 ${index + 1} 个大厅动作槽位`, { min: 0, integer: true });
    if (action.toSlot !== undefined) requireNumber(action.toSlot, `第 ${index + 1} 个大厅动作目标槽位`, { min: 0, integer: true });
    if (action.title !== undefined && typeof action.title !== 'string') throw new Error(`第 ${index + 1} 个大厅动作窗口标题必须是文本。`);
    if (typeof action.title === 'string') action.title = action.title.trim();
    if (action.entity !== undefined && typeof action.entity !== 'string') throw new Error(`第 ${index + 1} 个大厅动作实体/NPC 名必须是文本。`);
    if (typeof action.entity === 'string') action.entity = action.entity.trim();
    if (action.message !== undefined && typeof action.message !== 'string') throw new Error(`第 ${index + 1} 个大厅动作聊天/指令必须是文本。`);
    if (typeof action.message === 'string') action.message = action.message.trim();

    const actionLabel = `第 ${index + 1} 个大厅动作`;
    if (action.type === 'switchSlot' && action.hotbarSlot === undefined) throw new Error(`${actionLabel}需要填写快捷栏 1-9。`);
    if (action.type === 'relativeWalk' && action.distance === undefined) throw new Error(`${actionLabel}需要填写前进格数。`);
    if (action.type === 'findEntity' && !action.entity) throw new Error(`${actionLabel}需要填写实体/NPC 名。`);
    if (action.type === 'moveSlot') {
      if (action.slot === undefined || action.toSlot === undefined) throw new Error(`${actionLabel}需要填写来源槽位和目标槽位。`);
      if (action.slot === action.toSlot) throw new Error(`${actionLabel}的来源槽位和目标槽位不能相同。`);
    }
    if (action.type === 'chat' && !action.message) throw new Error(`${actionLabel}需要填写聊天内容或指令。`);
    if (action.type === 'clickSlot' && action.slot === undefined && (action.row === undefined || action.column === undefined)) {
      throw new Error(`${actionLabel}需要填写槽位，或者同时填写行和列。`);
    }
  }
}
function validateSchedulerTasks(tasks) {
  if (!Array.isArray(tasks)) throw new Error('定时任务必须是数组。');
  for (const [index, task] of tasks.entries()) {
    if (task.name !== undefined && typeof task.name !== 'string') throw new Error(`第 ${index + 1} 个定时任务名称必须是文本。`);
    requireEnum(task.trigger, `第 ${index + 1} 个定时任务触发方式`, ['login', 'interval']);
    requireNumber(task.intervalMs, `第 ${index + 1} 个定时任务间隔`, { min: 1000 });
    if (typeof task.action !== 'string') throw new Error(`第 ${index + 1} 个定时任务动作必须是文本。`);
    if (task.enabled !== undefined) requireBoolean(task.enabled, `第 ${index + 1} 个定时任务启用开关`);
    if (task.enabled !== false && !task.action.trim()) throw new Error(`第 ${index + 1} 个定时任务动作不能为空。`);
  }
}

function addLog(line) {
  const lines = String(line)
    .split(/\r?\n/)
    .map((item) => item.trimEnd())
    .filter(Boolean);

  for (const item of lines) {
    const hasTimestamp = /^\[\d{4}[/.-]\d{1,2}[/.-]\d{1,2}/.test(item);
    const text = hasTimestamp ? item : `[${new Date().toLocaleString()}] ${item}`;
    logs.push(text);
    console.log(text);
  }

  if (logs.length > 500) logs = logs.slice(-500);
}

function dependenciesReady() {
  return requiredDependencyFiles.every((filePath) => fs.existsSync(path.join(projectRoot, filePath)));
}

function ensureProjectDependencies() {
  if (dependenciesReady()) return;

  addLog('检测到项目依赖缺失，正在自动安装 npm 依赖...');
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['install', '--omit=dev'], {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8'
  });

  if (result.stdout) addLog(result.stdout.trimEnd());
  if (result.stderr) addLog(result.stderr.trimEnd());
  if (result.error) throw new Error(`自动安装 npm 依赖失败：${result.error.message}`);
  if (result.status !== 0) throw new Error(`自动安装 npm 依赖失败，退出码：${result.status}`);
  if (!dependenciesReady()) throw new Error('npm 依赖安装完成后仍缺少必要依赖，请在服务器执行 npm install 后重试。');

  addLog('项目依赖安装完成，继续启动挂机进程。');
}

function startBot(startAccountNames = []) {
  if (botProcess) return;

  ensureProjectDependencies();

  const config = readConfig();
  validateConfig(config);
  const selectedAccountNames = normalizeStartAccountNames(startAccountNames, config.accounts);
  runningConfig = structuredClone(config);
  if (selectedAccountNames.length > 0) {
    const selected = new Set(selectedAccountNames);
    runningConfig.accounts = runningConfig.accounts.filter((account) => selected.has(account.username));
  }
  stopping = false;
  logs = [];
  runtimeSnapshots.clear();
  botProcess = spawn(process.execPath, ['src/index.js'], {
    cwd: projectRoot,
    env: { ...process.env, BOT_CONFIG_PATH: configPath, START_ACCOUNT_NAMES: JSON.stringify(selectedAccountNames) },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  addLog('挂机进程已启动。');
  botProcess.stdout.on('data', (data) => handleBotStdout(data.toString()));
  botProcess.stderr.on('data', (data) => addLog(data.toString().trimEnd()));
  botProcess.on('exit', (code) => {
    addLog(`挂机进程已退出，退出码：${code}`);
    botProcess = null;
    runningConfig = null;
    stopping = false;
  });
}

function handleBotStdout(chunk) {
  botStdoutBuffer += chunk;
  const lines = botStdoutBuffer.split(/\r?\n/);
  botStdoutBuffer = lines.pop() || '';

  for (const line of lines) {
    if (!line) continue;
    if (handleBotEventLine(line)) continue;
    addLog(line);
  }
}

function handleBotEventLine(line) {
  const prefix = '::ly-event ';
  if (!line.startsWith(prefix)) return false;

  try {
    const event = JSON.parse(line.slice(prefix.length));
    if (event.type === 'windowSnapshot' && event.username) {
      runtimeSnapshots.set(event.username, {
        window: event.window || null,
        position: event.position || null,
        entities: Array.isArray(event.entities) ? event.entities : []
      });
    }
  } catch (error) {
    addLog(`解析运行事件失败：${error.message}`);
  }
  return true;
}

function normalizeStartAccountNames(startAccountNames, accounts) {
  if (!Array.isArray(startAccountNames) || startAccountNames.length === 0) return [];

  const enabledAccounts = new Set(
    accounts
      .filter((account) => account.enabled !== false)
      .map((account) => account.username)
  );
  const selected = [...new Set(startAccountNames.map((name) => String(name || '').trim()).filter(Boolean))];
  const invalid = selected.filter((name) => !enabledAccounts.has(name));
  if (invalid.length > 0) throw new Error(`启动账号不存在或未启用：${invalid.join(', ')}`);
  if (selected.length === 0) throw new Error('至少需要选择一个启动账号。');
  return selected;
}

function stopBot() {
  if (!botProcess) return;
  stopping = true;
  botProcess.kill('SIGINT');
  addLog('已发送停止指令。');
}

function sendBotCommand(command) {
  if (!botProcess?.stdin?.writable) {
    throw new Error('挂机进程未启动。');
  }

  if (stopping) {
    throw new Error('挂机进程正在停止，不能发送新指令。');
  }

  if (!String(command.message || '').trim()) {
    throw new Error('发送内容不能为空。');
  }

  const config = runningConfig;
  if (!config) {
    throw new Error('找不到当前运行配置，请重启挂机进程。');
  }

  if (command.target !== 'all') {
    const enabledAccountNames = new Set(
      config.accounts
        .filter((account) => account.enabled !== false)
        .map((account) => account.username)
    );
    if (!enabledAccountNames.has(command.target)) {
      throw new Error(`发送目标不存在或未启用：${command.target}`);
    }
  }

  botProcess.stdin.write(`${JSON.stringify(command)}\n`);
}

async function requestWindowSnapshot(target) {
  runtimeSnapshots.delete(target);
  sendBotCommand({ type: 'windowSnapshot', target, message: '__window_snapshot__' });
  const deadline = Date.now() + 800;
  while (Date.now() < deadline) {
    if (runtimeSnapshots.has(target)) return runtimeSnapshots.get(target) || { window: null, position: null, entities: [] };
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return { window: null, position: null, entities: [] };
}

function sendRuntimeConfigUpdate(config) {
  if (!botProcess?.stdin?.writable || !runningConfig || stopping) return false;

  const runningAccounts = runningConfig.accounts;
  const runningServer = runningConfig.server;
  runningConfig = {
    ...structuredClone(config),
    server: runningServer,
    accounts: runningAccounts
  };
  botProcess.stdin.write(`${JSON.stringify({ type: 'config', config: runningConfig })}\n`);
  addLog('运行中配置已实时下发，功能参数将立即生效；服务器地址和账号列表仍需下次启动生效。');
  return true;
}

function getRunningControlState() {
  if (!runningConfig) return null;

  const chat = runningConfig.features?.chat || {};
  return {
    remoteCommand: Boolean(chat.remoteCommand),
    presetMessages: Boolean(chat.presetMessages),
    presetMessagesList: Array.isArray(chat.presetMessagesList) ? chat.presetMessagesList : [],
    accounts: Array.isArray(runningConfig.accounts)
      ? runningConfig.accounts
          .filter((account) => account.enabled !== false)
          .map((account) => ({ username: account.username }))
      : []
  };
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

function isDashboardAuthEnabled() {
  return Boolean(dashboardPassword);
}

function isAuthorized(req) {
  if (!isDashboardAuthEnabled()) return true;

  const authHeader = req.headers.authorization || '';
  const [scheme, credentials] = authHeader.split(' ');
  if (scheme !== 'Basic' || !credentials) return false;

  try {
    const decoded = Buffer.from(credentials, 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) return false;

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);
    return username === dashboardUser && password === dashboardPassword;
  } catch {
    return false;
  }
}

function sendUnauthorized(res) {
  res.writeHead(401, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'WWW-Authenticate': 'Basic realm="LY Dashboard"'
  });
  res.end('Authentication required');
}

function sendStatic(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);
  const safePath = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = path.normalize(path.join(publicDir, safePath));

  if (!isInsideDirectory(publicDir, filePath)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath);
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8'
  };

  res.writeHead(200, {
    'Content-Type': contentTypes[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(filePath).pipe(res);
}

function isInsideDirectory(rootDir, candidatePath) {
  const relativePath = path.relative(rootDir, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (req, res) => {
  try {
    if (!isAuthorized(req)) {
      sendUnauthorized(res);
      return;
    }

    const url = new URL(req.url, `http://localhost:${port}`);

    if (req.method === 'GET' && url.pathname === '/api/config') {
      sendJson(res, 200, { ok: true, config: readConfig() });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/profiles') {
      sendJson(res, 200, { ok: true, ...listProfiles() });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/profiles') {
      const body = JSON.parse(await readBody(req));
      const result = saveProfile({ id: body.id, name: body.name, config: body.config });
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/profiles/use') {
      const body = JSON.parse(await readBody(req));
      const result = useProfile(body.id);
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/profiles/delete') {
      const body = JSON.parse(await readBody(req));
      const result = deleteProfile(body.id);
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/config') {
      const config = JSON.parse(await readBody(req));
      const normalizedConfig = saveConfig(config);
      const liveApplied = sendRuntimeConfigUpdate(normalizedConfig);
      sendJson(res, 200, { ok: true, liveApplied });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/reset') {
      const config = resetConfig();
      sendJson(res, 200, { ok: true, config });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      sendJson(res, 200, {
        ok: true,
        running: Boolean(botProcess),
        stopping,
        control: getRunningControlState(),
        logs
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/start') {
      const body = JSON.parse(await readBody(req) || '{}');
      startBot(body.accounts || []);
      sendJson(res, 200, { ok: true, running: Boolean(botProcess), stopping });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/stop') {
      stopBot();
      sendJson(res, 200, { ok: true, running: Boolean(botProcess), stopping });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/window') {
      const target = url.searchParams.get('target') || '';
      if (!target) throw new Error('请选择要读取窗口的账号。');
      const snapshot = await requestWindowSnapshot(target);
      sendJson(res, 200, { ok: true, ...snapshot });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/send') {
      const body = JSON.parse(await readBody(req));
      sendBotCommand({
        type: 'chat',
        target: body.target || 'all',
        message: body.message || ''
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    sendStatic(req, res);
  } catch (error) {
    sendJson(res, 400, { ok: false, message: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`管理面板已启动：http://${host}:${port}`);
});

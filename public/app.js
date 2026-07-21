import { renderLogLines } from './log-renderer.js';

const state = {
  config: null,
  statusTimer: null,
  running: false,
  stopping: false,
  control: null,
  uiSettings: null,
  profiles: [],
  automations: [],
  activeAutomationId: '',
  activeProfileId: 'default',
  nearbyEntities: [],
  windowItems: [],
  logSelectionActive: false,
  resetConfirmTimer: null
};

const $ = (selector) => document.querySelector(selector);
const UI_SETTINGS_KEY = 'lyDashboardUiSettings';

const defaultUiSettings = {
  title: 'LY挂机控制台',
  subtitle: '浏览器远程管理 Minecraft 角色',
  sidebarPosition: 'left',
  showFieldNotes: true
};

const sectionTitles = {
  overview: ['平台概览', '云端自动挂机平台的信息、功能和配置集中在这里。'],
  combat: ['功能综合区', '战斗、移动、智能交互集中配置。'],
  lobby: ['大厅功能', '进入大厅后自动执行复杂操作。'],
  scheduler: ['定时任务', '登录后执行或按间隔执行聊天/指令。'],
  config: ['服务器配置', '先填服务器，再填账号，最后保存并启动。'],
  accounts: ['批量账号', '账号名、启用状态、注册密码预留都在这里。'],
  runtime: ['运行控制', '启动、停止以及查看挂机进程日志。'],
  settings: ['设置', '调整界面名称、侧边栏位置和参数注释显示。']
};

const defaultFeatures = {
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
    fishingTimeoutMs: 300000
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
    relativeWalk: { enabled: false, direction: 'forward', distance: 0 },
    heldSlot: 0
  },
  chat: { keywordReply: false, presetMessages: false, remoteCommand: false, autoLogin: false, keywordRules: [], presetMessagesList: [] },
  lobby: { useItem: false, actionSequence: false, delayMs: 3000, heldSlot: 0, useCount: 1, actions: [] },
  scheduler: { enabled: false, tasks: [] }
};

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.message || '请求失败');
  return data;
}

function loadUiSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(UI_SETTINGS_KEY) || '{}');
    state.uiSettings = normalizeUiSettings(saved);
  } catch {
    state.uiSettings = { ...defaultUiSettings };
  }
}

function normalizeUiSettings(settings = {}) {
  const title = typeof settings.title === 'string' && settings.title.trim()
    ? settings.title.trim()
    : defaultUiSettings.title;
  const subtitle = typeof settings.subtitle === 'string'
    ? settings.subtitle.trim()
    : defaultUiSettings.subtitle;
  const sidebarPosition = settings.sidebarPosition === 'right' ? 'right' : 'left';
  const showFieldNotes = settings.showFieldNotes !== false;

  return {
    title,
    subtitle: subtitle || defaultUiSettings.subtitle,
    sidebarPosition,
    showFieldNotes
  };
}

function saveUiSettings(settings) {
  state.uiSettings = normalizeUiSettings(settings);
  localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(state.uiSettings));
  applyUiSettings();
}

function resetUiSettings() {
  localStorage.removeItem(UI_SETTINGS_KEY);
  state.uiSettings = { ...defaultUiSettings };
  applyUiSettings();
}

function applyUiSettings() {
  const settings = state.uiSettings || defaultUiSettings;
  document.title = settings.title;
  $('#brandTitle').textContent = settings.title;
  $('#brandSubtitle').textContent = settings.subtitle;
  $('#appShell').classList.toggle('sidebar-right', settings.sidebarPosition === 'right');
  document.body.classList.toggle('hide-notes', !settings.showFieldNotes);

  if ($('#uiTitleInput')) $('#uiTitleInput').value = settings.title;
  if ($('#uiSubtitleInput')) $('#uiSubtitleInput').value = settings.subtitle;
  if ($('#sidebarPosition')) $('#sidebarPosition').value = settings.sidebarPosition;
  if ($('#showFieldNotes')) $('#showFieldNotes').checked = settings.showFieldNotes;
}

function setSection(sectionId) {
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.section === sectionId);
  });

  document.querySelectorAll('.page-section').forEach((section) => {
    section.classList.toggle('active', section.id === sectionId);
  });

  $('#pageTitle').textContent = sectionTitles[sectionId][0];
  $('#pageSub').textContent = sectionTitles[sectionId][1];
}

function setSidebarCollapsed(collapsed) {
  const shell = $('#appShell');
  const toggle = $('#sidebarToggle');
  shell.classList.toggle('sidebar-collapsed', collapsed);
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.title = collapsed ? '展开侧边栏' : '收起侧边栏';
  localStorage.setItem('sidebarCollapsed', collapsed ? 'true' : 'false');
}

function fillForm(config) {
  const normalized = normalizeConfig(config);
  $('#host').value = normalized.server.host;
  $('#port').value = normalized.server.port;
  $('#version').value = normalized.server.version || 'false';
  $('#auth').value = normalized.server.auth || 'offline';
  $('#connectIntervalMs').value = normalized.runtime.connectIntervalMs;
  $('#reconnectDelayMs').value = normalized.runtime.reconnectDelayMs;
  $('#idleIntervalMs').value = normalized.runtime.idleIntervalMs;
  $('#messageCooldownMs').value = normalized.runtime.messageCooldownMs ?? 1000;
  $('#reconnect').checked = Boolean(normalized.runtime.reconnect);
  $('#idleActions').checked = Boolean(normalized.runtime.idleActions);
  $('#chatOnJoin').value = normalized.runtime.chatOnJoin || '';
  fillFeatures(normalized.features);
  fillFeatureParams(normalized.features);
  renderKeywordRules(normalized.features.chat.keywordRules);
  $('#presetMessagesList').value = normalized.features.chat.presetMessagesList.join('\n');
  renderPresetSendList(normalized.features.chat.presetMessagesList);
  renderSchedulerTasks(normalized.features.scheduler.tasks);
  renderAccounts(normalized.accounts);
  renderAccountPool(normalized.accountPool || []);
  updateRuntimeControlState();
}

function normalizeConfig(config) {
  return {
    ...config,
    features: mergeFeatures(config.features || {}),
    accountPool: Array.isArray(config.accountPool) ? config.accountPool : []
  };
}

function mergeFeatures(features) {
  return {
    combat: { ...defaultFeatures.combat, ...(features.combat || {}) },
    movement: {
      ...defaultFeatures.movement,
      ...(features.movement || {}),
      relativeWalk: { ...defaultFeatures.movement.relativeWalk, ...(features.movement?.relativeWalk || {}) }
    },
    chat: { ...defaultFeatures.chat, ...(features.chat || {}) },
    lobby: { ...defaultFeatures.lobby, ...(features.lobby || {}) },
    scheduler: { ...defaultFeatures.scheduler, ...(features.scheduler || {}) }
  };
}

function fillFeatures(features) {
  document.querySelectorAll('[data-feature]').forEach((input) => {
    const [group, key] = input.dataset.feature.split('.');
    input.checked = Boolean(features[group]?.[key]);
  });
}

function fillFeatureParams(features) {
  $('#attackMode').value = features.combat.attackMode;
  $('#attackRange').value = features.combat.attackRange;
  $('#attackIntervalMs').value = features.combat.attackIntervalMs;
  $('#entityListMode').value = features.combat.entityListMode;
  $('#eatThreshold').value = features.combat.eatThreshold;
  $('#fishingTimeoutMs').value = features.combat.fishingTimeoutMs;
  $('#attackHostile').checked = Boolean(features.combat.attackHostile);
  $('#attackPassive').checked = Boolean(features.combat.attackPassive);
  $('#fishingStartDelayMs').value = features.combat.fishingStartDelayMs;
  $('#fishingCastDelayMs').value = features.combat.fishingCastDelayMs;
  $('#entityList').value = features.combat.entityList.join('\n');

  $('#antiAfkMinDelayMs').value = features.movement.antiAfkMinDelayMs;
  $('#antiAfkMaxDelayMs').value = features.movement.antiAfkMaxDelayMs;
  $('#movementHeldSlot').value = Number(features.movement.heldSlot) + 1;
  $('#walkTargetX').value = features.movement.walkTarget.x;
  $('#walkTargetY').value = features.movement.walkTarget.y;
  $('#walkTargetZ').value = features.movement.walkTarget.z;
  $('#walkRange').value = features.movement.walkRange;
  $('#relativeWalkEnabled').checked = Boolean(features.movement.relativeWalk?.enabled);
  $('#relativeWalkDirection').value = features.movement.relativeWalk?.direction || 'forward';
  $('#relativeWalkDistance').value = features.movement.relativeWalk?.distance ?? 0;
  $('#antiAfkCommand').value = features.movement.antiAfkCommand;
  $('#antiAfkSneak').checked = Boolean(features.movement.antiAfkSneak);
  $('#antiAfkWalk').checked = Boolean(features.movement.antiAfkWalk);
  $('#antiAfkWalkRange').value = features.movement.antiAfkWalkRange;

  $('#lobbyDelayMs').value = features.lobby.delayMs;
  $('#lobbyHeldSlot').value = Number(features.lobby.heldSlot) + 1;
  $('#lobbyUseCount').value = features.lobby.useCount;
  renderLobbyActions(features.lobby.actions);
}

function readFeatures() {
  const features = mergeFeatures({});
  document.querySelectorAll('[data-feature]').forEach((input) => {
    const [group, key] = input.dataset.feature.split('.');
    features[group][key] = input.checked;
  });
  features.chat.keywordRules = readKeywordRules();
  features.chat.presetMessagesList = $('#presetMessagesList').value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  features.combat.attackMode = $('#attackMode').value;
  features.combat.attackRange = Number($('#attackRange').value);
  features.combat.attackIntervalMs = Number($('#attackIntervalMs').value);
  features.combat.entityListMode = $('#entityListMode').value;
  features.combat.eatThreshold = Number($('#eatThreshold').value);
  features.combat.fishingTimeoutMs = Number($('#fishingTimeoutMs').value);
  features.combat.attackHostile = $('#attackHostile').checked;
  features.combat.attackPassive = $('#attackPassive').checked;
  features.combat.fishingStartDelayMs = Number($('#fishingStartDelayMs').value);
  features.combat.fishingCastDelayMs = Number($('#fishingCastDelayMs').value);
  features.combat.entityList = readLines('#entityList');

  features.movement.antiAfkMinDelayMs = Number($('#antiAfkMinDelayMs').value);
  features.movement.antiAfkMaxDelayMs = Number($('#antiAfkMaxDelayMs').value);
  features.movement.antiAfkCommand = $('#antiAfkCommand').value.trim();
  features.movement.antiAfkSneak = $('#antiAfkSneak').checked;
  features.movement.antiAfkWalk = $('#antiAfkWalk').checked;
  features.movement.antiAfkWalkRange = Number($('#antiAfkWalkRange').value);
  features.movement.walkTarget = {
    x: Number($('#walkTargetX').value),
    y: Number($('#walkTargetY').value),
    z: Number($('#walkTargetZ').value)
  };
  features.movement.walkRange = Number($('#walkRange').value);
  features.movement.relativeWalk = {
    enabled: $('#relativeWalkEnabled').checked,
    direction: $('#relativeWalkDirection').value,
    distance: Number($('#relativeWalkDistance').value)
  };
  features.movement.heldSlot = uiSlotToIndex($('#movementHeldSlot').value);

  features.lobby.delayMs = Number($('#lobbyDelayMs').value);
  features.lobby.heldSlot = uiSlotToIndex($('#lobbyHeldSlot').value);
  features.lobby.useCount = Number($('#lobbyUseCount').value);
  features.lobby.actions = readLobbyActions();
  features.scheduler.tasks = readSchedulerTasks();
  return features;
}

function readLines(selector) {
  return $(selector).value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isFeatureEnabled(pathKey) {
  return Boolean(document.querySelector(`[data-feature="${pathKey}"]`)?.checked);
}

function updateRuntimeControlState() {
  const runningControl = state.running ? state.control : null;
  const commandEnabled = Boolean(state.running && !state.stopping);
  const presetMessagesEnabled = runningControl
    ? Boolean(runningControl.presetMessages)
    : isFeatureEnabled('chat.presetMessages');
  const presetMessages = runningControl
    ? runningControl.presetMessagesList || []
    : readLines('#presetMessagesList');

  renderStartAccounts(runningControl?.accounts || readAccounts());
  renderCommandTargets(runningControl?.accounts || readAccounts());
  $('#commandTarget').disabled = !commandEnabled;
  $('#commandMessage').disabled = !commandEnabled;
  $('#sendCommandBtn').disabled = !commandEnabled;
  $('#presetSendList').classList.toggle('is-disabled', !commandEnabled);
  renderPresetSendList(presetMessages, { presetMessagesEnabled, commandEnabled });
}

function renderPresetSendList(messages = [], options = {}) {
  const list = $('#presetSendList');
  list.innerHTML = '';

  const presetMessagesEnabled = options.presetMessagesEnabled ?? isFeatureEnabled('chat.presetMessages');
  const commandEnabled = options.commandEnabled ?? Boolean(state.running && !state.stopping);
  if (!presetMessagesEnabled) return;

  for (const message of messages.filter(Boolean)) {
    const button = document.createElement('button');
    button.className = 'preset-send';
    button.type = 'button';
    button.textContent = message;
    button.title = commandEnabled ? message : '请先启动挂机进程';
    button.disabled = !commandEnabled;
    button.addEventListener('click', () => sendGameMessage(message));
    list.appendChild(button);
  }
}

async function sendGameMessage(message) {
  if (!message) {
    showToast('请输入要发送的聊天内容或指令');
    return;
  }

  try {
    await requestJson('/api/send', {
      method: 'POST',
      body: JSON.stringify({
        target: $('#commandTarget').value,
        message
      })
    });
    $('#commandMessage').value = '';
    showToast('已发送到挂机进程');
  } catch (error) {
    showToast(error.message);
  }
}

function uiSlotToIndex(value) {
  return Math.max(0, Math.min(8, Number(value || 1) - 1));
}

function readForm() {
  return {
    server: {
      host: $('#host').value.trim(),
      port: Number($('#port').value),
      version: normalizeVersion($('#version').value.trim()),
      auth: $('#auth').value
    },
    runtime: {
      connectIntervalMs: Number($('#connectIntervalMs').value),
      reconnect: $('#reconnect').checked,
      reconnectDelayMs: Number($('#reconnectDelayMs').value),
      idleActions: $('#idleActions').checked,
      idleIntervalMs: Number($('#idleIntervalMs').value),
      messageCooldownMs: Number($('#messageCooldownMs').value),
      chatOnJoin: $('#chatOnJoin').value
    },
    features: readFeatures(),
    accounts: readAccounts(),
    accountPool: readAccountPool()
  };
}

function normalizeVersion(value) {
  if (!value || value === 'false' || value === 'auto') return false;
  return value;
}

function renderAccounts(accounts) {
  const list = $('#accountList');
  list.innerHTML = '';
  accounts.forEach((account) => list.appendChild(createAccountCard(account)));
  renderCommandTargets(accounts);
  renderStartAccounts(accounts);
}

function renderAccountPool(accountPool = []) {
  const list = $('#accountPoolList');
  if (!list) return;

  list.innerHTML = '';
  for (const account of accountPool) {
    list.appendChild(createAccountPoolCard(account));
  }
}

function createAccountPoolCard(account = {}) {
  const fragment = $('#accountPoolTemplate').content.cloneNode(true);
  const card = fragment.querySelector('.account-pool-card');
  card.querySelector('.pool-username').value = account.username || '';
  card.querySelector('.pool-password').value = account.registerPassword || '';
  card.querySelector('.pool-note').value = account.note || '';
  card.querySelector('.use-pool-account').addEventListener('click', () => addAccountFromPool(card).catch((error) => showToast(error.message)));
  card.querySelector('.remove-pool-account').addEventListener('click', () => card.remove());
  return fragment;
}

async function addAccountFromPool(card) {
  const account = readAccountPoolCard(card);
  if (!account.username) {
    showToast('账号池里的账号名不能为空');
    return;
  }
  const existing = new Set(readAccounts().map((item) => item.username));
  $('#accountList').appendChild(createAccountCard({
    username: existing.has(account.username) ? nextCopyName(account.username) : account.username,
    enabled: true,
    note: account.note,
    chatOnJoin: '',
    auth: '',
    registerPassword: account.registerPassword
  }));
  card.remove();
  updateRuntimeControlState();
  await saveConfig();
  showToast('已移动到账号列表并保存');
}

async function saveEnabledAccountsToPool() {
  const pool = readAccountPool();
  const existing = new Map(pool.map((account) => [account.username, account]));
  let addedCount = 0;

  for (const account of readAccounts()) {
    if (!account.enabled || !account.username) continue;
    if (!existing.has(account.username)) addedCount += 1;
    existing.set(account.username, {
      username: account.username,
      registerPassword: account.registerPassword,
      note: account.note || existing.get(account.username)?.note || ''
    });
  }

  renderAccountPool([...existing.values()]);
  await saveConfig();
  showToast(addedCount ? `已保存 ${addedCount} 个新账号到账号池` : '账号池已更新并保存');
}

function addBlankPoolAccount() {
  $('#accountPoolList').appendChild(createAccountPoolCard({}));
}

function readAccountPool() {
  return [...document.querySelectorAll('.account-pool-card')]
    .map((card) => readAccountPoolCard(card))
    .filter((account) => account.username || account.registerPassword || account.note);
}

function readAccountPoolCard(card) {
  return {
    username: card.querySelector('.pool-username').value.trim(),
    registerPassword: card.querySelector('.pool-password').value,
    note: card.querySelector('.pool-note').value.trim()
  };
}

function createAccountCard(account = {}) {
  const fragment = $('#accountTemplate').content.cloneNode(true);
  const card = fragment.querySelector('.account-card');
  card.querySelector('.account-username').value = account.username || '';
  card.querySelector('.account-note').value = account.note || '';
  card.querySelector('.account-auth').value = account.auth || '';
  card.querySelector('.account-chat').value = account.chatOnJoin || '';
  card.querySelector('.account-password').value = account.registerPassword || '';
  card.querySelector('.account-enabled').checked = account.enabled !== false;
  card.querySelector('.account-username').addEventListener('input', () => updateRuntimeControlState());
  card.querySelector('.account-enabled').addEventListener('change', () => updateRuntimeControlState());
  card.querySelector('.duplicate-account').addEventListener('click', () => {
    const copy = readAccountCard(card);
    copy.username = nextCopyName(copy.username || 'Account');
    card.after(createAccountCard(copy));
    updateRuntimeControlState();
  });
  card.querySelector('.move-account-to-pool').addEventListener('click', () => moveAccountToPool(card).catch((error) => showToast(error.message)));
  card.querySelector('.remove-account').addEventListener('click', () => {
    card.remove();
    updateRuntimeControlState();
  });
  return fragment;
}

async function moveAccountToPool(sourceCard) {
  const source = readAccountCard(sourceCard);
  if (!source.username) {
    showToast('账号名不能为空');
    return;
  }

  const existingPool = readAccountPool();
  const nextPool = existingPool.filter((account) => account.username !== source.username);
  nextPool.push({
    username: source.username,
    registerPassword: source.registerPassword,
    note: source.note
  });
  renderAccountPool(nextPool);
  sourceCard.remove();
  updateRuntimeControlState();
  await saveConfig();
  showToast('已移动到账号池并保存');
}

function readAccounts() {
  return [...document.querySelectorAll('.account-card')].map((card) => readAccountCard(card));
}

function readAccountCard(card) {
  return {
    username: card.querySelector('.account-username').value.trim(),
    enabled: card.querySelector('.account-enabled').checked,
    note: card.querySelector('.account-note').value.trim(),
    chatOnJoin: card.querySelector('.account-chat').value,
    auth: card.querySelector('.account-auth').value,
    registerPassword: card.querySelector('.account-password').value
  };
}

function nextCopyName(baseName) {
  const existing = new Set(readAccounts().map((account) => account.username));
  let index = 2;
  let name = `${baseName}_copy`;
  while (existing.has(name)) {
    name = `${baseName}_copy${index}`;
    index += 1;
  }
  return name;
}

function renderKeywordRules(rules = []) {
  const list = $('#keywordRuleList');
  list.innerHTML = '';

  if (rules.length === 0) {
    list.appendChild(createKeywordRule({}));
    return;
  }

  rules.forEach((rule) => list.appendChild(createKeywordRule(rule)));
}

function createKeywordRule(rule = {}) {
  const fragment = $('#keywordRuleTemplate').content.cloneNode(true);
  const card = fragment.querySelector('.keyword-rule');
  card.querySelector('.keyword-input').value = rule.keyword || '';
  card.querySelector('.reply-input').value = rule.reply || '';
  card.querySelector('.remove-keyword-rule').addEventListener('click', () => card.remove());
  return fragment;
}

function readKeywordRules() {
  return [...document.querySelectorAll('.keyword-rule')]
    .map((card) => ({
      keyword: card.querySelector('.keyword-input').value.trim(),
      reply: card.querySelector('.reply-input').value.trim()
    }))
    .filter((rule) => rule.keyword && rule.reply);
}

function defaultLobbyAction() {
  return { type: 'wait', delayMs: 500, enabled: true };
}

function lobbyServerSelectorExampleActions() {
  return [
    { type: 'switchSlot', hotbarSlot: 1, enabled: true },
    { type: 'useItem', button: 'right', count: 1, delayMs: 600, enabled: true },
    { type: 'waitWindow', title: '选择服务器', timeoutMs: 5000, enabled: true },
    { type: 'clickSlot', title: '选择服务器', row: 3, column: 3, button: 'left', delayMs: 500, count: 1, enabled: true }
  ];
}

function npcTradeExampleActions() {
  return [
    { type: 'findEntity', entity: '商店', range: 2, interact: 'right', enabled: true },
    { type: 'waitWindow', title: '商店', timeoutMs: 5000, enabled: true },
    { type: 'operateWindow', title: '商店', item: '确认购买', button: 'left', count: 1, timeoutMs: 5000, enabled: true },
    { type: 'waitChat', chatText: '成功', timeoutMs: 5000, enabled: true }
  ];
}

function renderLobbyActions(actions = []) {
  const list = $('#lobbyActionList');
  if (!list) return;
  list.innerHTML = '';
  actions.forEach((action) => list.appendChild(createLobbyAction(action)));
  refreshLobbyActionOrder();
}

function createLobbyAction(action = {}) {
  const fragment = $('#lobbyActionTemplate').content.cloneNode(true);
  const card = fragment.querySelector('.lobby-action-card');
  card.querySelector('.lobby-action-type').value = action.type || 'wait';
  card.querySelector('.lobby-action-delay').value = action.delayMs ?? action.timeoutMs ?? '';
  card.querySelector('.lobby-action-hotbar').value = action.hotbarSlot || '';
  card.querySelector('.lobby-action-title').value = action.title || '';
  card.querySelector('.lobby-action-row').value = action.row || '';
  card.querySelector('.lobby-action-column').value = action.column || '';
  card.querySelector('.lobby-action-slot').value = action.slot ?? '';
  card.querySelector('.lobby-action-count').value = action.count || '';
  card.querySelector('.lobby-action-button').value = action.button === 'left' ? 'left' : 'right';
  card.querySelector('.lobby-action-direction').value = action.direction || 'forward';
  card.querySelector('.lobby-action-distance').value = action.distance ?? action.range ?? '';
  populateEntitySelect(card.querySelector('.lobby-action-entity'), action.entity || '');
  card.querySelector('.lobby-action-interact').value = action.interact || 'approach';
  card.querySelector('.lobby-action-key').value = action.key || '';
  card.querySelector('.lobby-action-key-duration').value = action.durationMs ?? '';
  card.querySelector('.lobby-action-to-slot').value = action.toSlot ?? '';
  card.querySelector('.lobby-action-message').value = action.message || '';
  populateWindowItemSelect(card.querySelector('.lobby-action-item'), action.item || '', action.slot);
  card.querySelector('.lobby-action-chat-text').value = action.chatText || '';
  card.querySelector('.lobby-action-chat-button').value = action.chatButton || '';
  card.querySelector('.lobby-action-type').addEventListener('change', () => updateLobbyActionFields(card));
  card.querySelector('.execute-lobby-action').addEventListener('click', () => executeLobbyAction(card));
  card.querySelector('.remove-lobby-action').addEventListener('click', () => {
    card.remove();
    refreshLobbyActionOrder();
  });
  card.querySelector('.move-lobby-action-up').addEventListener('click', () => moveLobbyAction(card, -1));
  card.querySelector('.move-lobby-action-down').addEventListener('click', () => moveLobbyAction(card, 1));
  updateLobbyActionFields(card);
  return fragment;
}

function moveLobbyAction(card, direction) {
  const sibling = direction < 0 ? card.previousElementSibling : card.nextElementSibling;
  if (!sibling) return;
  if (direction < 0) card.parentElement.insertBefore(card, sibling);
  else card.parentElement.insertBefore(sibling, card);
  refreshLobbyActionOrder();
}

function refreshLobbyActionOrder() {
  const cards = [...document.querySelectorAll('.lobby-action-card')];
  cards.forEach((card, index) => {
    card.querySelector('.lobby-action-step').textContent = `步骤 ${index + 1}`;
    card.querySelector('.move-lobby-action-up').disabled = index === 0;
    card.querySelector('.move-lobby-action-down').disabled = index === cards.length - 1;
  });
}

function updateLobbyActionFields(card) {
  const type = card.querySelector('.lobby-action-type').value;
  card.querySelectorAll('[data-action-types]').forEach((field) => {
    const types = field.dataset.actionTypes.split(',');
    field.classList.toggle('action-field-hidden', !types.includes(type));
  });
}

function readLobbyActions() {
  return [...document.querySelectorAll('.lobby-action-card')]
    .map((card) => readLobbyActionCard(card))
    .filter((action) => action.type);
}

function readLobbyActionCard(card, { includeRuntimeReference = false } = {}) {
  const type = card.querySelector('.lobby-action-type').value;
  const action = { type, enabled: true };

  const delayValue = Number(card.querySelector('.lobby-action-delay').value);
  if (Number.isFinite(delayValue) && delayValue > 0) {
    action[['waitWindow', 'clickItem', 'operateWindow', 'waitChat', 'clickChat'].includes(type) ? 'timeoutMs' : 'delayMs'] = delayValue;
  }
  if (type === 'switchSlot') {
    const hotbarSlot = card.querySelector('.lobby-action-hotbar').value;
    if (hotbarSlot !== '') action.hotbarSlot = Number(hotbarSlot);
  }
  if (['waitWindow', 'clickSlot', 'clickItem', 'operateWindow'].includes(type)) action.title = card.querySelector('.lobby-action-title').value.trim();
  if (type === 'clickSlot') {
    const row = card.querySelector('.lobby-action-row').value;
    const column = card.querySelector('.lobby-action-column').value;
    const slot = card.querySelector('.lobby-action-slot').value;
    if (row !== '') action.row = Number(row);
    if (column !== '') action.column = Number(column);
    if (slot !== '') action.slot = Number(slot);
  }
  if (['useItem', 'clickSlot', 'clickItem', 'operateWindow'].includes(type)) {
    action.button = card.querySelector('.lobby-action-button').value;
    action.count = Number(card.querySelector('.lobby-action-count').value) || 1;
  }
  if (type === 'relativeWalk') {
    action.direction = card.querySelector('.lobby-action-direction').value;
    const distance = card.querySelector('.lobby-action-distance').value;
    if (distance !== '') action.distance = Number(distance);
  }
  if (type === 'findEntity') {
    const select = card.querySelector('.lobby-action-entity');
    action.entity = select.value.trim();
    action.interact = card.querySelector('.lobby-action-interact').value;
    action.range = Number(card.querySelector('.lobby-action-distance').value) || 2;
    const entityId = Number(select.selectedOptions[0]?.dataset.entityId);
    if (includeRuntimeReference && Number.isInteger(entityId)) action.entityId = entityId;
  }
  if (type === 'pressKey') {
    action.key = card.querySelector('.lobby-action-key').value.trim();
    action.durationMs = Number(card.querySelector('.lobby-action-key-duration').value) || 500;
  }
  if (type === 'moveSlot') {
    const slot = card.querySelector('.lobby-action-slot').value;
    const toSlot = card.querySelector('.lobby-action-to-slot').value;
    if (slot !== '') action.slot = Number(slot);
    if (toSlot !== '') action.toSlot = Number(toSlot);
  }
  if (type === 'chat') action.message = card.querySelector('.lobby-action-message').value.trim();
  if (['clickItem', 'operateWindow'].includes(type)) {
    const select = card.querySelector('.lobby-action-item');
    action.item = select.value.trim();
    const slot = Number(select.selectedOptions[0]?.dataset.slot);
    if (Number.isInteger(slot)) action.slot = slot;
  }
  if (type === 'waitChat') action.chatText = card.querySelector('.lobby-action-chat-text').value.trim();
  if (type === 'clickChat') action.chatButton = card.querySelector('.lobby-action-chat-button').value.trim();
  return action;
}
function renderSchedulerTasks(tasks = []) {
  const list = $('#schedulerTaskList');
  list.innerHTML = '';

  if (tasks.length === 0) {
    list.appendChild(createSchedulerTask({ trigger: 'login', intervalMs: 60000, enabled: true }));
    return;
  }

  tasks.forEach((task) => list.appendChild(createSchedulerTask(task)));
}

function createSchedulerTask(task = {}) {
  const fragment = $('#schedulerTaskTemplate').content.cloneNode(true);
  const card = fragment.querySelector('.scheduler-task');
  card.querySelector('.scheduler-name').value = task.name || '';
  card.querySelector('.scheduler-trigger').value = task.trigger || 'login';
  card.querySelector('.scheduler-interval').value = task.intervalMs || 60000;
  card.querySelector('.scheduler-action').value = task.action || '';
  card.querySelector('.scheduler-enabled').checked = task.enabled !== false;
  card.querySelector('.remove-scheduler-task').addEventListener('click', () => card.remove());
  return fragment;
}

function readSchedulerTasks() {
  return [...document.querySelectorAll('.scheduler-task')]
    .map((card) => ({
      name: card.querySelector('.scheduler-name').value.trim(),
      trigger: card.querySelector('.scheduler-trigger').value,
      intervalMs: Number(card.querySelector('.scheduler-interval').value),
      action: card.querySelector('.scheduler-action').value.trim(),
      enabled: card.querySelector('.scheduler-enabled').checked
    }))
    .filter((task) => task.action);
}

function renderCommandTargets(accounts = []) {
  const select = $('#commandTarget');
  const previousValue = select.value || 'all';
  select.innerHTML = '<option value="all">全部账号</option>';

  for (const account of accounts) {
    if (account.enabled === false) continue;
    const option = document.createElement('option');
    option.value = account.username;
    option.textContent = account.username;
    select.appendChild(option);
  }

  select.value = [...select.options].some((option) => option.value === previousValue) ? previousValue : 'all';
  renderWindowSnapshotTargets(accounts);
}

function renderWindowSnapshotTargets(accounts = []) {
  const select = $('#windowSnapshotTarget');
  if (!select) return;

  const previousValue = select.value;
  select.innerHTML = '';
  for (const account of accounts) {
    if (account.enabled === false || !account.username) continue;
    const option = document.createElement('option');
    option.value = account.username;
    option.textContent = account.username;
    select.appendChild(option);
  }
  select.value = [...select.options].some((option) => option.value === previousValue) ? previousValue : (select.options[0]?.value || '');
}

async function refreshWindowSnapshot() {
  const target = $('#windowSnapshotTarget')?.value || '';
  if (!target) {
    showToast('请先选择一个正在运行的账号');
    return;
  }

  const data = await requestJson(`/api/window?target=${encodeURIComponent(target)}`);
  renderWindowSnapshot(data.window);
  renderPositionSnapshot(data.position, data.entities || []);
  setWindowSnapshotCollapsed(false);
}

function setWindowSnapshotCollapsed(collapsed) {
  const panel = $('#windowSnapshotPanel');
  const toggle = $('#windowSnapshotToggle');
  if (!panel || !toggle) return;
  panel.classList.toggle('snapshot-collapsed', collapsed);
  toggle.setAttribute('aria-expanded', String(!collapsed));
  localStorage.setItem('windowSnapshotCollapsed', collapsed ? 'true' : 'false');
}

function renderPositionSnapshot(position, entities = []) {
  const positionTitle = $('#positionSnapshotTitle');
  if (positionTitle) {
    positionTitle.textContent = position
      ? `当前坐标：X ${formatNumber(position.x)} / Y ${formatNumber(position.y)} / Z ${formatNumber(position.z)}`
      : '当前坐标：未读取';
  }
  state.nearbyEntities = entities.filter((entity) => !isArmorStandSnapshot(entity));
  document.querySelectorAll('.lobby-action-entity').forEach((select) => populateEntitySelect(select, select.value));
}

function isArmorStandSnapshot(entity) {
  return [entity?.name, entity?.username, entity?.type]
    .some((value) => String(value || '').replace(/[\s_-]/g, '').toLowerCase() === 'armorstand');
}

function populateEntitySelect(select, selectedValue = '') {
  if (!select) return;
  const current = selectedValue || select.value || '';
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = state.nearbyEntities.length ? '请选择全部实体中的目标' : '请先刷新全部实体';
  select.appendChild(placeholder);
  state.nearbyEntities.forEach((entity, index) => {
    const name = entity.name || entity.username || entity.type || `ID ${entity.id}`;
    const option = document.createElement('option');
    option.value = name;
    option.dataset.entityId = String(entity.id);
    option.textContent = `${index + 1}. ${name}（${formatNumber(entity.distance)} 格，X ${formatNumber(entity.x)} / Y ${formatNumber(entity.y)} / Z ${formatNumber(entity.z)}）`;
    select.appendChild(option);
  });
  if (current && ![...select.options].some((option) => option.value === current)) {
    const saved = document.createElement('option');
    saved.value = current;
    saved.textContent = `已保存：${current}`;
    select.appendChild(saved);
  }
  select.value = current;
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(1) : '-';
}

function renderWindowSnapshot(windowSnapshot) {
  const title = $('#windowSnapshotTitle');
  const grid = $('#windowGrid');
  if (!title || !grid) return;

  state.windowItems = [];
  grid.innerHTML = '';
  if (!windowSnapshot) {
    title.textContent = '当前交互窗口：没有检测到已打开的窗口';
    document.querySelectorAll('.lobby-action-item').forEach((select) => (
      populateWindowItemSelect(select, select.value, select.selectedOptions[0]?.dataset.slot)
    ));
    return;
  }

  const inventoryStart = windowSnapshot.inventoryStart;
  state.windowItems = windowSnapshot.slots.filter((slot) => (
    slot.item && (!Number.isInteger(inventoryStart) || slot.slot < inventoryStart)
  ));
  title.textContent = `当前交互窗口：${windowSnapshot.title || '未命名窗口'}`;

  const slotsByIndex = new Map(windowSnapshot.slots.map((slot) => [slot.slot, slot]));
  for (let slotIndex = 0; slotIndex <= 80; slotIndex += 1) {
    const slot = slotsByIndex.get(slotIndex) || { slot: slotIndex, item: false, name: '', displayName: '', count: 0, lore: [] };
    const name = slot.displayName || slot.name || '';
    const button = document.createElement('button');
    button.className = `window-slot${slot.item ? ' has-item' : ' is-empty'}`;
    button.type = 'button';
    const loreLines = (slot.lore || []).filter(Boolean);
    const loreText = loreLines.length ? `\n提示：${loreLines.join(' / ')}` : '';
    button.title = slot.item ? `槽位 ${slot.slot}：${name || '未命名物品'} x${slot.count}${loreText}` : `槽位 ${slot.slot}：空`;
    button.innerHTML = `<strong>${slot.slot}</strong>${slot.item ? `<span>${escapeHtml(name || '物品')}</span>` : ''}`;
    if (slot.item && (!Number.isInteger(inventoryStart) || slot.slot < inventoryStart)) {
      button.addEventListener('click', () => fillSelectedWindowItem(slot));
    } else {
      button.disabled = true;
    }
    grid.appendChild(button);
  }
  document.querySelectorAll('.lobby-action-item').forEach((select) => (
    populateWindowItemSelect(select, select.value, select.selectedOptions[0]?.dataset.slot)
  ));
}

function populateWindowItemSelect(select, selectedValue = '', selectedSlot) {
  if (!select) return;
  const current = selectedValue || select.value || '';
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = state.windowItems.length ? '请选择弹窗按钮/物品' : '请先与 NPC 交互并刷新窗口';
  select.appendChild(placeholder);
  state.windowItems.forEach((slot, index) => {
    const name = slot.displayName || slot.name || `槽位 ${slot.slot}`;
    const lore = (slot.lore || []).filter(Boolean).join(' / ');
    const option = document.createElement('option');
    option.value = name;
    option.dataset.slot = String(slot.slot);
    option.textContent = `${index + 1}. 槽位 ${slot.slot}：${name}${lore ? ` | ${lore}` : ''}`;
    select.appendChild(option);
  });
  if (current && ![...select.options].some((option) => option.value === current)) {
    const saved = document.createElement('option');
    saved.value = current;
    if (selectedSlot !== undefined && selectedSlot !== null && selectedSlot !== '' && Number.isInteger(Number(selectedSlot))) {
      saved.dataset.slot = String(Number(selectedSlot));
    }
    saved.textContent = `已保存：${current}`;
    select.appendChild(saved);
  }
  const selectedSlotOption = selectedSlot !== undefined && selectedSlot !== null && selectedSlot !== '' && Number.isInteger(Number(selectedSlot))
    ? [...select.options].find((option) => Number(option.dataset.slot) === Number(selectedSlot) && (!current || option.value === current))
    : null;
  if (selectedSlotOption) selectedSlotOption.selected = true;
  else select.value = current;
}

function fillSelectedEntity(name) {
  const cards = [...document.querySelectorAll('.lobby-action-card')];
  let targetCard = cards.find((card) => card.querySelector('.lobby-action-type').value === 'findEntity');
  if (!targetCard) {
    $('#lobbyActionList').appendChild(createLobbyAction({ type: 'findEntity', entity: name, range: 2, interact: 'right', enabled: true }));
    refreshLobbyActionOrder();
    showToast(`已新增寻找实体动作：${name}`);
    return;
  }
  populateEntitySelect(targetCard.querySelector('.lobby-action-entity'), name);
  updateLobbyActionFields(targetCard);
  showToast(`已选择实体/NPC：${name}`);
}

function fillSelectedWindowItem(slot) {
  const name = slot.displayName || slot.name;
  const cards = [...document.querySelectorAll('.lobby-action-card')];
  let targetCard = cards.find((card) => card.querySelector('.lobby-action-type').value === 'operateWindow');
  if (!targetCard) {
    $('#lobbyActionList').appendChild(createLobbyAction({ type: 'operateWindow', item: name, slot: slot.slot, button: 'left', count: 1, timeoutMs: 5000, enabled: true }));
    refreshLobbyActionOrder();
    showToast(`已新增操作窗口动作：槽位 ${slot.slot} ${name}`);
    return;
  }
  populateWindowItemSelect(targetCard.querySelector('.lobby-action-item'), name, slot.slot);
  updateLobbyActionFields(targetCard);
  showToast(`已选择窗口按钮：槽位 ${slot.slot} ${name}`);
}

async function executeLobbyAction(card) {
  const target = $('#windowSnapshotTarget')?.value || '';
  if (!target) {
    showToast('请先在动作序列上方选择一个正在运行的账号');
    return;
  }
  const button = card.querySelector('.execute-lobby-action');
  button.disabled = true;
  button.textContent = '执行中';
  try {
    const data = await requestJson('/api/lobby/action', {
      method: 'POST',
      body: JSON.stringify({ target, action: readLobbyActionCard(card, { includeRuntimeReference: true }) })
    });
    renderWindowSnapshot(data.window);
    renderPositionSnapshot(data.position, data.entities || []);
    setWindowSnapshotCollapsed(false);
    showToast(`步骤已在 ${target} 执行完成，坐标和窗口已刷新`);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = '执行';
  }
}

function fillSelectedChatButton(label) {
  const cards = [...document.querySelectorAll('.lobby-action-card')];
  let targetCard = cards.find((card) => card.querySelector('.lobby-action-type').value === 'clickChat');
  if (!targetCard) {
    $('#lobbyActionList').appendChild(createLobbyAction({ type: 'clickChat', chatButton: label, timeoutMs: 5000, enabled: true }));
    refreshLobbyActionOrder();
    showToast(`已新增聊天按钮动作：${label}`);
    return;
  }
  targetCard.querySelector('.lobby-action-chat-button').value = label;
  updateLobbyActionFields(targetCard);
  showToast(`已填入聊天按钮：${label}`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

function renderStartAccounts(accounts = []) {
  const list = $('#startAccountList');
  if (!list) return;

  const previousSelection = new Set(readSelectedStartAccounts({ allowEmpty: true }));
  const hasPreviousSelection = previousSelection.size > 0;
  const enabledAccounts = accounts.filter((account) => account.enabled !== false && account.username);
  list.innerHTML = '';

  if (enabledAccounts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'start-account-empty';
    empty.textContent = '没有可启动的启用账号';
    list.appendChild(empty);
    return;
  }

  for (const account of enabledAccounts) {
    const label = document.createElement('label');
    label.className = 'start-account-option';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = account.username;
    input.checked = hasPreviousSelection ? previousSelection.has(account.username) : true;
    input.disabled = Boolean(state.running || state.stopping);
    label.classList.toggle('selected', input.checked);
    input.addEventListener('change', () => label.classList.toggle('selected', input.checked));

    const name = document.createElement('span');
    name.textContent = account.note ? `${account.username} - ${account.note}` : account.username;

    label.append(input, name);
    list.appendChild(label);
  }
}

function readSelectedStartAccounts(options = {}) {
  const selected = [...document.querySelectorAll('#startAccountList input[type="checkbox"]:checked')]
    .map((input) => input.value)
    .filter(Boolean);
  if (!options.allowEmpty && selected.length === 0) {
    throw new Error('请至少选择一个本次启动账号');
  }
  return selected;
}

function renderProfiles() {
  const select = $('#profileSelect');
  if (!select) return;

  select.innerHTML = '';
  for (const profile of state.profiles) {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name;
    select.appendChild(option);
  }

  select.value = state.profiles.some((profile) => profile.id === state.activeProfileId)
    ? state.activeProfileId
    : (state.profiles[0]?.id || 'default');
  syncSelectedProfileName();
}

function renderAutomations() {
  const select = $('#automationSelect');
  if (!select) return;
  select.innerHTML = '';
  if (state.automations.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '暂无已保存方案';
    select.appendChild(option);
  } else {
    for (const automation of state.automations) {
      const option = document.createElement('option');
      option.value = automation.id;
      option.textContent = automation.name;
      select.appendChild(option);
    }
  }
  select.value = state.automations.some((item) => item.id === state.activeAutomationId)
    ? state.activeAutomationId
    : (state.automations[0]?.id || '');
  state.activeAutomationId = select.value;
  syncAutomationName();
}

function syncAutomationName() {
  const selected = state.automations.find((item) => item.id === $('#automationSelect')?.value);
  if ($('#automationName')) $('#automationName').value = selected?.name || '';
  if ($('#deleteAutomationBtn')) $('#deleteAutomationBtn').disabled = !selected;
  if ($('#loadAutomationBtn')) $('#loadAutomationBtn').disabled = !selected;
}

async function loadAutomations() {
  const data = await requestJson('/api/automations');
  state.automations = data.automations || [];
  renderAutomations();
}

function readLobbyAutomation() {
  return {
    useItem: Boolean(document.querySelector('[data-feature="lobby.useItem"]')?.checked),
    actionSequence: true,
    delayMs: Number($('#lobbyDelayMs').value),
    heldSlot: Math.max(0, Number($('#lobbyHeldSlot').value) - 1),
    useCount: Number($('#lobbyUseCount').value),
    actions: readLobbyActions()
  };
}

async function saveAutomation() {
  const name = $('#automationName').value.trim();
  if (!name) throw new Error('请先填写自动化方案名称。');
  const selected = state.automations.find((item) => item.id === $('#automationSelect').value);
  const data = await requestJson('/api/automations', {
    method: 'POST',
    body: JSON.stringify({ id: selected?.name === name ? selected.id : undefined, name, lobby: readLobbyAutomation() })
  });
  state.automations = data.automations || [];
  state.activeAutomationId = data.activeAutomationId || '';
  renderAutomations();
  showToast('自动化方案已独立保存，更新项目后仍会保留');
}

function loadSelectedAutomation() {
  const selected = state.automations.find((item) => item.id === $('#automationSelect').value);
  if (!selected) throw new Error('请选择要载入的自动化方案。');
  const lobby = selected.lobby;
  document.querySelector('[data-feature="lobby.useItem"]').checked = Boolean(lobby.useItem);
  document.querySelector('[data-feature="lobby.actionSequence"]').checked = true;
  $('#lobbyDelayMs').value = lobby.delayMs;
  $('#lobbyHeldSlot').value = Number(lobby.heldSlot) + 1;
  $('#lobbyUseCount').value = lobby.useCount;
  renderLobbyActions(lobby.actions || []);
  showToast(`已载入自动化方案：${selected.name}`);
}

async function deleteSelectedAutomation() {
  const id = $('#automationSelect').value;
  if (!id) return;
  const data = await requestJson('/api/automations/delete', {
    method: 'POST',
    body: JSON.stringify({ id })
  });
  state.automations = data.automations || [];
  state.activeAutomationId = '';
  renderAutomations();
  showToast('自动化方案已删除');
}

function syncSelectedProfileName() {
  const select = $('#profileSelect');
  const selected = state.profiles.find((profile) => profile.id === select.value);
  $('#profileName').value = selected?.name || '';
  $('#deleteProfileBtn').disabled = select.value === 'default' || state.profiles.length === 0;
}

async function loadProfiles() {
  const data = await requestJson('/api/profiles');
  state.profiles = data.profiles || [];
  state.activeProfileId = data.activeProfileId || 'default';
  renderProfiles();
}

async function saveProfile() {
  const config = readForm();
  const selectedId = $('#profileSelect').value || 'default';
  const name = $('#profileName').value.trim();
  const selected = state.profiles.find((profile) => profile.id === selectedId);
  const profileId = selectedId === 'default' && name && name !== selected?.name ? undefined : selectedId;
  const data = await requestJson('/api/profiles', {
    method: 'POST',
    body: JSON.stringify({ id: profileId, name, config })
  });
  state.config = normalizeConfig(data.config);
  state.profiles = data.profiles || [];
  state.activeProfileId = data.activeProfileId || selectedId;
  fillForm(state.config);
  renderProfiles();
  await refreshStatus();
  showToast('配置档案已保存');
}

async function loadSelectedProfile() {
  const id = $('#profileSelect').value;
  const data = await requestJson('/api/profiles/use', {
    method: 'POST',
    body: JSON.stringify({ id })
  });
  state.config = normalizeConfig(data.config);
  state.profiles = data.profiles || [];
  state.activeProfileId = data.activeProfileId || id;
  fillForm(state.config);
  renderProfiles();
  await refreshStatus();
  showToast(state.running ? '配置档案已载入，下次启动生效' : '配置档案已载入');
}

async function deleteSelectedProfile() {
  const id = $('#profileSelect').value;
  if (!id || id === 'default') return;
  const data = await requestJson('/api/profiles/delete', {
    method: 'POST',
    body: JSON.stringify({ id })
  });
  state.config = normalizeConfig(data.config);
  state.profiles = data.profiles || [];
  state.activeProfileId = data.activeProfileId || 'default';
  fillForm(state.config);
  renderProfiles();
  showToast('配置档案已删除');
}

function isSelectingLogText() {
  if (state.logSelectionActive) return true;
  const logs = $('#logs');
  const selection = window.getSelection?.();
  if (!logs || !selection || selection.isCollapsed) return false;
  return [...Array(selection.rangeCount)].some((_, index) => {
    const range = selection.getRangeAt(index);
    return logs.contains(range.commonAncestorContainer);
  });
}

function setAutoWalkCollapsed(collapsed) {
  const panel = $('#autoWalkPanel');
  const toggle = $('#autoWalkToggle');
  if (!panel || !toggle) return;
  panel.classList.toggle('open', !collapsed);
  toggle.setAttribute('aria-expanded', String(!collapsed));
  localStorage.setItem('autoWalkCollapsed', collapsed ? 'true' : 'false');
}

function mergeCombinedFeatureSections() {
  const target = $('#combat');
  if (!target) return;

  for (const sectionId of ['movement', 'chat']) {
    const section = document.getElementById(sectionId);
    if (!section) continue;
    const wrapper = document.createElement('div');
    wrapper.className = 'combined-feature-block';
    while (section.firstChild) wrapper.appendChild(section.firstChild);
    target.appendChild(wrapper);
    section.remove();
  }
}

function organizeFeaturePanels() {
  enhanceFeaturePanel('combat.autoAttack', [
    createGrid('three', ['#attackMode', '#attackRange', '#attackIntervalMs', '#entityListMode']),
    createToggleRow(['#attackHostile', '#attackPassive']),
    fieldLabel('#entityList')
  ]);
  enhanceFeaturePanel('combat.autoFish', [
    createGrid('three', ['#fishingStartDelayMs', '#fishingCastDelayMs', '#fishingTimeoutMs'])
  ]);
  enhanceFeaturePanel('combat.autoEat', [createGrid('two', ['#eatThreshold'])]);
  enhanceFeaturePanel('combat.autoRespawn', [createPanelNote('角色死亡后自动请求重生，无额外参数。')]);

  enhanceFeaturePanel('movement.antiAfk', [
    createGrid('three', ['#antiAfkMinDelayMs', '#antiAfkMaxDelayMs', '#antiAfkCommand']),
    createGrid('two', ['#antiAfkWalkRange']),
    createToggleRow(['#antiAfkSneak', '#antiAfkWalk'])
  ]);
  enhanceFeaturePanel('movement.switchHeldItem', [createGrid('two', ['#movementHeldSlot'])]);

  enhanceFeaturePanel('chat.keywordReply', [nodeFromSelector('#keywordRuleList'), nodeFromSelector('#addKeywordRuleBtn')]);
  enhanceFeaturePanel('chat.presetMessages', [fieldLabel('#presetMessagesList')]);
  enhanceFeaturePanel('chat.remoteCommand', [
    fieldLabel('#chatOnJoin'),
    createPanelNote('启用后可以在“运行控制”里远程发送聊天内容或 / 指令。')
  ]);
  enhanceFeaturePanel('chat.autoLogin', [createPanelNote('启用后，账号需要填写“注册密码预留”。看到 /register 提示会发送 /register 密码 密码；看到 /login 提示会发送 /login 密码。')]);

  enhanceFeaturePanel('lobby.useItem', [
    createGrid('three', ['#lobbyDelayMs', '#lobbyHeldSlot', '#lobbyUseCount'])
  ]);
  enhanceFeaturePanel('lobby.actionSequence', [
    nodeFromSelector('.action-sequence-head'),
    nodeFromSelector('#automationLibrary'),
    nodeFromSelector('#windowSnapshotPanel'),
    nodeFromSelector('#lobbyActionList')
  ]);
  enhanceFeaturePanel('scheduler.enabled', [nodeFromSelector('#schedulerTaskList'), nodeFromSelector('#addSchedulerTaskBtn')]);
  removeEmptySubPanels();
}

function enhanceFeaturePanel(pathKey, bodyNodes = []) {
  const input = document.querySelector(`[data-feature="${pathKey}"]`);
  const article = input?.closest('article');
  if (!article) return;

  article.classList.add('feature-disclosure');
  const titleBlock = article.querySelector('div');
  let toggle = article.querySelector('.feature-disclosure-toggle');
  let body = article.querySelector('.feature-disclosure-body');

  if (!toggle && titleBlock) {
    toggle = document.createElement('button');
    toggle.className = 'feature-disclosure-toggle';
    toggle.type = 'button';
    toggle.innerHTML = '<span class="disclosure-arrow" aria-hidden="true">▾</span>'; 
    toggle.appendChild(titleBlock);
    article.insertBefore(toggle, article.firstChild);
  }

  if (!body) {
    body = document.createElement('div');
    body.className = 'feature-disclosure-body';
    article.appendChild(body);
  }

  bodyNodes.filter(Boolean).forEach((item) => body.appendChild(item));
  if (!body.childElementCount) body.appendChild(createPanelNote('此功能暂无额外参数。'));

  const collapsedKey = `featureCollapsed:${pathKey}`;
  const collapsed = localStorage.getItem(collapsedKey) === 'true';
  article.classList.toggle('open', !collapsed);
  toggle?.setAttribute('aria-expanded', String(!collapsed));
  toggle?.addEventListener('click', () => {
    const nextCollapsed = article.classList.contains('open');
    article.classList.toggle('open', !nextCollapsed);
    toggle.setAttribute('aria-expanded', String(!nextCollapsed));
    localStorage.setItem(collapsedKey, nextCollapsed ? 'true' : 'false');
  });
}

function createGrid(size, selectors) {
  const grid = document.createElement('div');
  grid.className = `grid ${size}`;
  selectors.map(fieldLabel).filter(Boolean).forEach((item) => grid.appendChild(item));
  return grid.childElementCount ? grid : null;
}

function createToggleRow(selectors) {
  const row = document.createElement('div');
  row.className = 'toggle-row';
  selectors.map(fieldLabel).filter(Boolean).forEach((item) => row.appendChild(item));
  return row.childElementCount ? row : null;
}

function fieldLabel(selector) {
  return document.querySelector(selector)?.closest('label') || null;
}

function nodeFromSelector(selector) {
  return document.querySelector(selector) || null;
}

function createPanelNote(text) {
  const note = document.createElement('p');
  note.className = 'field-note disclosure-note';
  note.textContent = text;
  return note;
}

function removeEmptySubPanels() {
  document.querySelectorAll('.sub-panel').forEach((panel) => {
    if (panel.classList.contains('deploy-help') || panel.classList.contains('account-pool-panel')) return;
    if (!panel.querySelector('input, select, textarea, button, .keyword-list, .scheduler-list')) panel.remove();
  });
}

async function loadConfig() {
  const data = await requestJson('/api/config');
  state.config = normalizeConfig(data.config);
  fillForm(state.config);
  await Promise.all([loadProfiles(), loadAutomations()]);
  showToast('配置已读取');
}

async function saveConfig() {
  const config = readForm();
  await requestJson('/api/config', {
    method: 'POST',
    body: JSON.stringify(config)
  });
  state.config = config;
  await loadProfiles();
  await refreshStatus();
  showToast(state.running ? '配置已保存，下次启动生效' : '配置已保存');
}

async function resetConfig() {
  const data = await requestJson('/api/reset', { method: 'POST' });
  state.config = normalizeConfig(data.config);
  fillForm(state.config);
  await loadProfiles();
  showToast('已重置为默认配置');
}

function beginResetConfirmation() {
  const confirmButton = $('#confirmResetBtn');
  const confirmText = confirmButton.querySelector('.nav-text');
  clearInterval(state.resetConfirmTimer);
  confirmButton.classList.remove('hidden');
  confirmButton.disabled = true;
  let remainingSeconds = 5;
  confirmText.textContent = `确认重置 ${remainingSeconds}s`;
  showToast('重置会清空当前服务器配置和账号列表，请等待 5 秒后确认');

  state.resetConfirmTimer = setInterval(() => {
    remainingSeconds -= 1;
    if (remainingSeconds > 0) {
      confirmText.textContent = `确认重置 ${remainingSeconds}s`;
      return;
    }

    clearInterval(state.resetConfirmTimer);
    state.resetConfirmTimer = null;
    confirmButton.disabled = false;
    confirmText.textContent = '确认重置';
  }, 1000);
}

async function confirmResetConfig() {
  const confirmButton = $('#confirmResetBtn');
  if (confirmButton.disabled) return;
  await resetConfig();
  confirmButton.classList.add('hidden');
  confirmButton.disabled = true;
  confirmButton.querySelector('.nav-text').textContent = '确认重置 5s';
}

async function refreshStatus() {
  const data = await requestJson('/api/status');
  state.running = Boolean(data.running);
  state.stopping = Boolean(data.stopping);
  state.control = data.control || null;
  $('#statusDot').classList.toggle('running', data.running);
  $('#statusText').textContent = data.stopping ? '挂机停止中' : (data.running ? '挂机运行中' : '挂机未启动');
  updateRuntimeControlState();
  if (isSelectingLogText()) return;
  if (data.logs.length) {
    $('#logs').innerHTML = renderLogLines(data.logs);
  } else {
    $('#logs').textContent = '等待日志...';
  }
}

function bindEvents() {
  mergeCombinedFeatureSections();
  organizeFeaturePanels();
  const compactViewport = window.matchMedia('(max-width: 980px)').matches;
  setSidebarCollapsed(compactViewport || localStorage.getItem('sidebarCollapsed') === 'true');
  setAutoWalkCollapsed(localStorage.getItem('autoWalkCollapsed') === 'true');
  setWindowSnapshotCollapsed(localStorage.getItem('windowSnapshotCollapsed') === 'true');

  $('#sidebarToggle').addEventListener('click', () => {
    setSidebarCollapsed(!$('#appShell').classList.contains('sidebar-collapsed'));
  });

  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => {
      setSection(button.dataset.section);
      if (window.matchMedia('(max-width: 980px)').matches) setSidebarCollapsed(true);
    });
  });

  $('#autoWalkToggle').addEventListener('click', () => {
    setAutoWalkCollapsed($('#autoWalkPanel').classList.contains('open'));
  });

  $('#profileSelect').addEventListener('change', () => syncSelectedProfileName());
  $('#saveProfileBtn').addEventListener('click', () => saveProfile().catch((error) => showToast(error.message)));
  $('#loadProfileBtn').addEventListener('click', () => loadSelectedProfile().catch((error) => showToast(error.message)));
  $('#deleteProfileBtn').addEventListener('click', () => deleteSelectedProfile().catch((error) => showToast(error.message)));
  $('#automationSelect')?.addEventListener('change', () => {
    state.activeAutomationId = $('#automationSelect').value;
    syncAutomationName();
  });
  $('#saveAutomationBtn')?.addEventListener('click', () => saveAutomation().catch((error) => showToast(error.message)));
  $('#loadAutomationBtn')?.addEventListener('click', () => {
    try {
      loadSelectedAutomation();
    } catch (error) {
      showToast(error.message);
    }
  });
  $('#deleteAutomationBtn')?.addEventListener('click', () => deleteSelectedAutomation().catch((error) => showToast(error.message)));
  $('#saveAccountsToPoolBtn').addEventListener('click', () => saveEnabledAccountsToPool().catch((error) => showToast(error.message)));
  $('#addPoolAccountBtn').addEventListener('click', () => addBlankPoolAccount());
  $('#logs').addEventListener('mousedown', () => {
    state.logSelectionActive = true;
  });
  document.addEventListener('mouseup', () => {
    setTimeout(() => {
      state.logSelectionActive = false;
    }, 300);
  });

  $('#addAccountBtn').addEventListener('click', () => {
    $('#accountList').appendChild(createAccountCard({ enabled: true }));
    updateRuntimeControlState();
  });

  $('#addKeywordRuleBtn').addEventListener('click', () => {
    $('#keywordRuleList').appendChild(createKeywordRule({}));
  });

  $('#presetMessagesList').addEventListener('input', () => {
    updateRuntimeControlState();
  });

  document.querySelectorAll('[data-feature]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.dataset.feature === 'chat.presetMessages' || input.dataset.feature === 'chat.remoteCommand') {
        updateRuntimeControlState();
      }
    });
  });

  $('#addSchedulerTaskBtn').addEventListener('click', () => {
    $('#schedulerTaskList').appendChild(createSchedulerTask({ trigger: 'login', intervalMs: 60000, enabled: true }));
  });

  $('#addLobbyActionBtn')?.addEventListener('click', () => {
    $('#lobbyActionList').appendChild(createLobbyAction(defaultLobbyAction()));
    refreshLobbyActionOrder();
  });

  $('#addLobbyExampleActionBtn')?.addEventListener('click', () => {
    renderLobbyActions(lobbyServerSelectorExampleActions());
  });

  $('#addNpcTradeExampleBtn')?.addEventListener('click', () => {
    renderLobbyActions(npcTradeExampleActions());
  });

  $('#refreshWindowSnapshotBtn')?.addEventListener('click', () => refreshWindowSnapshot().catch((error) => showToast(error.message)));
  $('#windowSnapshotToggle')?.addEventListener('click', () => {
    setWindowSnapshotCollapsed(!$('#windowSnapshotPanel').classList.contains('snapshot-collapsed'));
  });

  $('#saveUiSettingsBtn').addEventListener('click', () => {
    saveUiSettings({
      title: $('#uiTitleInput').value,
      subtitle: $('#uiSubtitleInput').value,
      sidebarPosition: $('#sidebarPosition').value,
      showFieldNotes: $('#showFieldNotes').checked
    });
    showToast('界面设置已保存');
  });

  $('#resetUiSettingsBtn').addEventListener('click', () => {
    resetUiSettings();
    showToast('界面设置已恢复默认');
  });

  $('#reloadBtn').addEventListener('click', () => loadConfig().catch((error) => showToast(error.message)));
  $('#saveBtn').addEventListener('click', () => saveConfig().catch((error) => showToast(error.message)));
  $('#resetBtn').addEventListener('click', () => beginResetConfirmation());
  $('#confirmResetBtn').addEventListener('click', () => confirmResetConfig().catch((error) => showToast(error.message)));
  $('#selectAllStartAccounts').addEventListener('click', () => {
    document.querySelectorAll('#startAccountList input[type="checkbox"]').forEach((input) => {
      input.checked = true;
      input.closest('.start-account-option')?.classList.add('selected');
    });
  });
  $('#clearStartAccounts').addEventListener('click', () => {
    document.querySelectorAll('#startAccountList input[type="checkbox"]').forEach((input) => {
      input.checked = false;
      input.closest('.start-account-option')?.classList.remove('selected');
    });
  });
  $('#startBtn').addEventListener('click', async () => {
    try {
      const accounts = readSelectedStartAccounts();
      await saveConfig();
      await requestJson('/api/start', { method: 'POST', body: JSON.stringify({ accounts }) });
      await refreshStatus();
      showToast('挂机已启动');
    } catch (error) {
      showToast(error.message);
    }
  });
  $('#stopBtn').addEventListener('click', async () => {
    try {
      await requestJson('/api/stop', { method: 'POST' });
      await refreshStatus();
      showToast('停止指令已发送');
    } catch (error) {
      showToast(error.message);
    }
  });
  $('#sendCommandBtn').addEventListener('click', async () => {
    const messageInput = $('#commandMessage');
    const message = messageInput.value.trim();
    await sendGameMessage(message);
  });
}

loadUiSettings();
bindEvents();
applyUiSettings();
loadConfig().catch((error) => showToast(error.message));
refreshStatus().catch(() => {});
state.statusTimer = setInterval(() => refreshStatus().catch(() => {}), 2000);

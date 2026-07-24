const blockedConfigKeys = new Set(['__proto__', 'prototype', 'constructor']);

export function mergeDefaults(defaultValue, value) {
  assertSafeConfigTree(value);
  return mergeDefaultValue(defaultValue, value);
}

function mergeDefaultValue(defaultValue, value) {
  if (value === undefined) return defaultValue;
  if (Array.isArray(defaultValue)) return value;
  if (!isPlainObject(defaultValue)) return value;
  if (!isPlainObject(value)) return value;

  const merged = {};
  for (const key of Object.keys(defaultValue)) {
    merged[key] = mergeDefaultValue(defaultValue[key], value[key]);
  }
  for (const key of Object.keys(value)) {
    if (!blockedConfigKeys.has(key) && !Object.hasOwn(merged, key)) merged[key] = value[key];
  }
  return merged;
}

function assertSafeConfigTree(value) {
  const pending = [{ value, depth: 0 }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current.value || typeof current.value !== 'object') continue;
    if (current.depth > 64) throw new Error('配置嵌套层级不能超过 64 层。');
    for (const key of Object.keys(current.value)) {
      if (blockedConfigKeys.has(key)) throw new Error(`配置包含不允许的字段：${key}。`);
      pending.push({ value: current.value[key], depth: current.depth + 1 });
    }
  }
}

export function validateConfig(config) {
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
    requireNumber(config.features.movement.walkTarget[axis], `自动走路目标 ${axis.toUpperCase()}`);
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

export function validateAutomationLobby(lobby) {
  requirePlainObject(lobby, '自动化方案');
  requireBoolean(lobby.useItem, '大厅自动使用物品开关');
  requireBoolean(lobby.actionSequence, '大厅动作序列开关');
  requireNumber(lobby.delayMs, '大厅执行延迟', { min: 0 });
  requireNumber(lobby.heldSlot, '大厅快捷栏槽位', { min: 0, max: 8, integer: true });
  requireNumber(lobby.useCount, '大厅使用次数', { min: 1, integer: true });
  validateLobbyActions(lobby.actions);
}

export function validateLobbyActions(actions) {
  if (!Array.isArray(actions)) throw new Error('大厅动作序列必须是数组。');
  for (const [index, action] of actions.entries()) {
    requirePlainObject(action, `第 ${index + 1} 个大厅动作`);
    requireEnum(action.type, `第 ${index + 1} 个大厅动作类型`, ['wait', 'switchSlot', 'useItem', 'waitWindow', 'clickSlot', 'clickItem', 'operateWindow', 'relativeWalk', 'findEntity', 'pressKey', 'moveSlot', 'chat', 'waitChat', 'clickChat']);
    if (action.button !== undefined) requireEnum(action.button, `第 ${index + 1} 个大厅动作鼠标键`, ['left', 'right']);
    if (action.direction !== undefined) requireEnum(action.direction, `第 ${index + 1} 个大厅动作方向`, ['forward', 'back', 'left', 'right', 'north', 'south', 'east', 'west']);
    if (action.interact !== undefined) requireEnum(action.interact, `第 ${index + 1} 个大厅动作交互方式`, ['approach', 'left', 'right']);
    if (action.enabled !== undefined) requireBoolean(action.enabled, `第 ${index + 1} 个大厅动作启用开关`);
    if (action.protocolEntry !== undefined) requireBoolean(action.protocolEntry, `第 ${index + 1} 个大厅动作模组槽位标记`);
    if (action.delayMs !== undefined) requireNumber(action.delayMs, `第 ${index + 1} 个大厅动作延迟`, { min: 0 });
    if (action.timeoutMs !== undefined) requireNumber(action.timeoutMs, `第 ${index + 1} 个大厅动作超时`, { min: 100 });
    if (action.responseTimeoutMs !== undefined) requireNumber(action.responseTimeoutMs, `第 ${index + 1} 个大厅动作交互响应等待`, { min: 0, max: 15000 });
    if (action.hotbarSlot !== undefined) requireNumber(action.hotbarSlot, `第 ${index + 1} 个大厅动作快捷栏`, { min: 1, max: 9, integer: true });
    if (action.count !== undefined) requireNumber(action.count, `第 ${index + 1} 个大厅动作次数`, { min: 1, integer: true });
    if (action.distance !== undefined) requireNumber(action.distance, `第 ${index + 1} 个大厅动作距离`, { min: 0 });
    if (action.range !== undefined) requireNumber(action.range, `第 ${index + 1} 个大厅动作范围`, { min: 0 });
    if (action.durationMs !== undefined) requireNumber(action.durationMs, `第 ${index + 1} 个大厅动作按键时间`, { min: 50, max: 60000 });
    if (action.row !== undefined) requireNumber(action.row, `第 ${index + 1} 个大厅动作行`, { min: 1, max: 6, integer: true });
    if (action.column !== undefined) requireNumber(action.column, `第 ${index + 1} 个大厅动作列`, { min: 1, max: 9, integer: true });
    if (action.slot !== undefined) requireNumber(action.slot, `第 ${index + 1} 个大厅动作槽位`, { min: 0, integer: true });
    if (action.toSlot !== undefined) requireNumber(action.toSlot, `第 ${index + 1} 个大厅动作目标槽位`, { min: 0, integer: true });
    if (action.entityId !== undefined) requireNumber(action.entityId, `第 ${index + 1} 个大厅动作实体 ID`, { min: 0, integer: true });
    if (action.title !== undefined && typeof action.title !== 'string') throw new Error(`第 ${index + 1} 个大厅动作窗口标题必须是文本。`);
    if (typeof action.title === 'string') action.title = action.title.trim();
    if (action.entity !== undefined && typeof action.entity !== 'string') throw new Error(`第 ${index + 1} 个大厅动作实体/NPC 名必须是文本。`);
    if (typeof action.entity === 'string') action.entity = action.entity.trim();
    if (action.message !== undefined && typeof action.message !== 'string') throw new Error(`第 ${index + 1} 个大厅动作聊天/指令必须是文本。`);
    if (typeof action.message === 'string') action.message = action.message.trim();
    if (action.item !== undefined && typeof action.item !== 'string') throw new Error(`第 ${index + 1} 个大厅动作菜单物品名必须是文本。`);
    if (typeof action.item === 'string') action.item = action.item.trim();
    if (action.key !== undefined && typeof action.key !== 'string') throw new Error(`第 ${index + 1} 个大厅动作按键必须是文本。`);
    if (typeof action.key === 'string') action.key = action.key.trim();
    if (action.chatText !== undefined && typeof action.chatText !== 'string') throw new Error(`第 ${index + 1} 个大厅动作聊天文本必须是文本。`);
    if (typeof action.chatText === 'string') action.chatText = action.chatText.trim();
    if (action.chatButton !== undefined && typeof action.chatButton !== 'string') throw new Error(`第 ${index + 1} 个大厅动作聊天按钮必须是文本。`);
    if (typeof action.chatButton === 'string') action.chatButton = action.chatButton.trim();

    const actionLabel = `第 ${index + 1} 个大厅动作`;
    if (action.type === 'switchSlot' && action.hotbarSlot === undefined) throw new Error(`${actionLabel}需要填写快捷栏 1-9。`);
    if (action.type === 'relativeWalk' && !(action.distance > 0)) throw new Error(`${actionLabel}需要填写大于 0 的前进格数。`);
    if (action.type === 'findEntity' && !action.entity) throw new Error(`${actionLabel}需要填写实体/NPC 名。`);
    if (action.type === 'pressKey' && !action.key) throw new Error(`${actionLabel}需要填写要按下的按键。`);
    if (action.type === 'moveSlot') {
      if (action.slot === undefined || action.toSlot === undefined) throw new Error(`${actionLabel}需要填写来源槽位和目标槽位。`);
      if (action.slot === action.toSlot) throw new Error(`${actionLabel}的来源槽位和目标槽位不能相同。`);
    }
    if (action.type === 'chat' && !action.message) throw new Error(`${actionLabel}需要填写聊天内容或指令。`);
    if (action.type === 'clickItem' && !action.item) throw new Error(`${actionLabel}需要填写菜单物品名。`);
    if (action.type === 'operateWindow' && !action.item && action.slot === undefined) throw new Error(`${actionLabel}需要从当前窗口选择按钮。`);
    if (action.type === 'waitChat' && !action.chatText) throw new Error(`${actionLabel}需要填写等待的聊天文本。`);
    if (action.type === 'clickChat' && !action.chatButton) throw new Error(`${actionLabel}需要填写聊天按钮文字。`);
    if (action.type === 'clickSlot' && action.slot === undefined && (action.row === undefined || action.column === undefined)) {
      throw new Error(`${actionLabel}需要填写槽位，或者同时填写行和列。`);
    }
  }
}

function requireEnum(value, label, allowedValues) {
  if (!allowedValues.includes(value)) throw new Error(`${label}必须是：${allowedValues.join('、')}。`);
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
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label}必须是数字。`);
  if (options.integer && !Number.isInteger(value)) throw new Error(`${label}必须是整数。`);
  if (options.min !== undefined && value < options.min) throw new Error(`${label}不能小于 ${options.min}。`);
  if (options.max !== undefined && value > options.max) throw new Error(`${label}不能大于 ${options.max}。`);
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
    requirePlainObject(rule, `${label}第 ${index + 1} 条`);
    if (typeof rule.keyword !== 'string') throw new Error(`${label}第 ${index + 1} 条关键词必须是文本。`);
    if (typeof rule.reply !== 'string') throw new Error(`${label}第 ${index + 1} 条回复必须是文本。`);
  }
}

function validateSchedulerTasks(tasks) {
  if (!Array.isArray(tasks)) throw new Error('定时任务必须是数组。');
  for (const [index, task] of tasks.entries()) {
    requirePlainObject(task, `第 ${index + 1} 个定时任务`);
    if (task.name !== undefined && typeof task.name !== 'string') throw new Error(`第 ${index + 1} 个定时任务名称必须是文本。`);
    requireEnum(task.trigger, `第 ${index + 1} 个定时任务触发方式`, ['login', 'interval']);
    requireNumber(task.intervalMs, `第 ${index + 1} 个定时任务间隔`, { min: 1000 });
    if (typeof task.action !== 'string') throw new Error(`第 ${index + 1} 个定时任务动作必须是文本。`);
    if (task.enabled !== undefined) requireBoolean(task.enabled, `第 ${index + 1} 个定时任务启用开关`);
    if (task.enabled !== false && !task.action.trim()) throw new Error(`第 ${index + 1} 个定时任务动作不能为空。`);
  }
}

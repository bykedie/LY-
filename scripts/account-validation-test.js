import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const botScript = path.join(projectRoot, 'src', 'index.js');

await expectStartupFailure({
  name: 'duplicate',
  accounts: [
    { username: 'SameBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' },
    { username: 'SameBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }
  ],
  expected: '账号名重复：SameBot'
});

await expectStartupFailure({
  name: 'blank-name',
  accounts: [{ username: '   ', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }],
  expected: '缺少用户名'
});

await expectStartupFailure({
  name: 'not-object',
  accounts: ['BadBot'],
  expected: '必须是对象'
});

await expectStartupFailure({
  name: 'not-string-name',
  accounts: [{ username: 123, enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }],
  expected: '用户名必须是文本'
});

await expectStartupFailure({
  name: 'bad-auth',
  accounts: [{ username: 'BadAuthBot', enabled: true, chatOnJoin: '', auth: 'yggdrasil', registerPassword: '' }],
  expected: '登录模式必须是 offline'
});

await expectStartupFailure({
  name: 'bad-enabled',
  accounts: [{ username: 'BadEnabledBot', enabled: 'true', chatOnJoin: '', auth: '', registerPassword: '' }],
  expected: '启用开关必须是真或假'
});

await expectStartupFailure({
  name: 'all-disabled',
  accounts: [
    { username: 'DisabledA', enabled: false, chatOnJoin: '', auth: '', registerPassword: '' },
    { username: 'DisabledB', enabled: false, chatOnJoin: '', auth: '', registerPassword: '' }
  ],
  expected: '至少需要启用一个账号'
});

await expectStartupFailure({
  name: 'blank-host',
  accounts: [{ username: 'HostBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }],
  configPatch: { server: { host: '   ' } },
  expected: 'server.host 不能为空'
});

await expectStartupFailure({
  name: 'bad-host',
  accounts: [{ username: 'HostBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }],
  configPatch: { server: { host: 127001 } },
  expected: 'server.host 必须是文本'
});

await expectStartupFailure({
  name: 'bad-port',
  accounts: [{ username: 'PortBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }],
  configPatch: { server: { port: 70000 } },
  expected: 'server.port 必须是 1 到 65535'
});

await expectStartupFailure({
  name: 'boolean-port',
  accounts: [{ username: 'PortBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }],
  configPatch: { server: { port: true } },
  expected: 'server.port 必须是 1 到 65535'
});

await expectStartupFailure({
  name: 'bad-global-auth',
  accounts: [{ username: 'GlobalAuthBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }],
  configPatch: { server: { auth: 'yggdrasil' } },
  expected: 'server.auth 必须是 offline 或 microsoft'
});

await expectStartupFailure({
  name: 'bad-runtime-boolean',
  accounts: [{ username: 'RuntimeBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }],
  configPatch: { runtime: { reconnect: 'true' } },
  expected: 'runtime.reconnect 必须是真或假'
});

await expectStartupFailure({
  name: 'bad-runtime-number',
  accounts: [{ username: 'RuntimeBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }],
  configPatch: { runtime: { messageCooldownMs: -1 } },
  expected: 'runtime.messageCooldownMs 不能小于 0'
});

await expectStartupFailure({
  name: 'null-runtime-number',
  accounts: [{ username: 'RuntimeBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }],
  configPatch: { runtime: { messageCooldownMs: null } },
  expected: 'runtime.messageCooldownMs 必须是数字'
});

await expectStartupFailure({
  name: 'invalid-feature-type',
  accounts: [{ username: 'FeatureBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }],
  configPatch: { features: { combat: { autoAttack: 'yes' } } },
  expected: '自动攻击开关必须是真或假'
});

await expectStartupFailure({
  name: 'null-lobby-action',
  accounts: [{ username: 'ActionBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }],
  configPatch: { features: { lobby: { actions: [null] } } },
  expected: '第 1 个大厅动作必须是对象'
});

await expectStartupFailure({
  name: 'null-keyword-rule',
  accounts: [{ username: 'RuleBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }],
  configPatch: { features: { chat: { keywordRules: [null] } } },
  expected: '关键词规则第 1 条必须是对象'
});

await expectStartupFailure({
  name: 'null-account-pool',
  accounts: [{ username: 'PoolBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }],
  configPatch: { accountPool: null },
  expected: '账号池必须是数组'
});

await expectLegacyStartupSuccess();

console.log('account validation test ok');

async function expectLegacyStartupSuccess() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-afk-account-legacy-'));
  let child = null;

  try {
    const config = createConfig([{ username: 'LegacyBot', enabled: true }]);
    delete config.features;
    delete config.accountPool;
    config.server.port = 9;
    config.runtime.reconnect = false;
    config.runtime.testExitAfterMs = 50;
    fs.writeFileSync(path.join(tempDir, 'bot.config.json'), JSON.stringify(config, null, 2), 'utf8');

    const output = [];
    child = spawn(process.execPath, [botScript], { cwd: tempDir, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (data) => output.push(data.toString()));
    child.stderr.on('data', (data) => output.push(data.toString()));

    const [exitCode] = await once(child, 'exit', 10000);
    const text = output.join('');
    assert(exitCode === 0, `旧配置补齐默认值后启动失败：${exitCode}\n${text}`);
    assert(text.includes('读取到 1 个启用账号'), `旧配置没有成功加载账号：\n${text}`);
  } finally {
    if (child && child.exitCode === null) child.kill('SIGINT');
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function expectStartupFailure({ name, accounts, expected, configPatch = {} }) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pcl-afk-account-${name}-`));
  let child = null;

  try {
    fs.writeFileSync(
      path.join(tempDir, 'bot.config.json'),
      JSON.stringify(createConfig(accounts, configPatch), null, 2),
      'utf8'
    );

    const output = [];
    child = spawn(process.execPath, [botScript], {
      cwd: tempDir,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', (data) => output.push(data.toString()));
    child.stderr.on('data', (data) => output.push(data.toString()));

    const [exitCode] = await once(child, 'exit', 10000);
    const text = output.join('');
    assert(exitCode !== 0, `${name} 场景应该启动失败，实际退出码：${exitCode}\n${text}`);
    assert(text.includes(expected), `${name} 场景错误信息不正确，期望包含：${expected}\n实际输出：${text}`);
  } finally {
    if (child && child.exitCode === null) child.kill('SIGINT');
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function createConfig(accounts, patch = {}) {
  const config = {
    server: {
      host: '127.0.0.1',
      port: 25565,
      version: '1.16.4',
      auth: 'offline'
    },
    runtime: {
      connectIntervalMs: 1000,
      reconnect: false,
      reconnectDelayMs: 1000,
      idleActions: false,
      idleIntervalMs: 45000,
      messageCooldownMs: 100,
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
        heldSlot: 0
      },
      chat: {
        keywordReply: false,
        presetMessages: false,
        remoteCommand: false,
        autoLogin: false,
        keywordRules: [],
        presetMessagesList: []
      },
      lobby: {
        useItem: false,
        delayMs: 3000,
        heldSlot: 0,
        useCount: 1
      },
      scheduler: {
        enabled: false,
        tasks: []
      }
    },
    accounts
  };
  return mergeConfig(config, patch);
}

function mergeConfig(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = mergeConfig({ ...(target[key] || {}) }, value);
    } else {
      target[key] = value;
    }
  }
  return target;
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

import fs from 'node:fs';
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
const botScript = path.join(projectRoot, 'src', 'index.js');

await runAutoLoginScenario({
  name: 'register',
  prompt: 'Please use /register password password',
  password: 'secret-a',
  expected: ['/register secret-a', '/register secret-a secret-a']
});

await runAutoLoginScenario({
  name: 'zh-register-confirm',
  prompt: '[玩家系统] 请输入“/register <密码> <再输入一次以确定密码>”以注册',
  password: 'secret-zh',
  expected: ['/register secret-zh', '/register secret-zh secret-zh']
});

await runAutoLoginScenario({
  name: 'zh-register-two-step',
  prompts: [
    '[玩家系统] 请输入“/register <密码>”以注册',
    '[玩家系统] 请输入“/register <密码> <再输入一次以确定密码>”以注册'
  ],
  password: 'secret-step',
  expected: ['/register secret-step', '/register secret-step secret-step']
});

await runAutoLoginScenario({
  name: 'login',
  prompt: 'Please use /login password',
  password: 'secret-b',
  expected: ['/login secret-b']
});

await runAutoLoginScenario({
  name: 'missing-password',
  prompt: 'Please use /login password',
  password: '',
  expected: []
});

console.log('auto login integration test ok');

async function runAutoLoginScenario({ name, prompt, prompts, password, expected }) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pcl-afk-auto-login-${name}-`));
  const serverPort = 43000 + Math.floor(Math.random() * 4000);
  const receivedMessages = [];
  const botOutput = [];
  const testExitAfterMs = expected.length > 1 ? 7000 : 1800;
  let botProcess = null;
  let server = null;

  try {
    server = createTestServer(serverPort, prompts || [prompt], receivedMessages);
    await once(server, 'listening');

    fs.writeFileSync(
      path.join(tempDir, 'bot.config.json'),
      JSON.stringify(createTestConfig({ port: serverPort, username: `AutoLogin${name}`, password, testExitAfterMs }), null, 2),
      'utf8'
    );

    botProcess = spawn(process.execPath, [botScript], {
      cwd: tempDir,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    botProcess.stdout.on('data', (data) => botOutput.push(data.toString()));
    botProcess.stderr.on('data', (data) => botOutput.push(data.toString()));

    for (const message of expected) {
      await waitForMessage(receivedMessages, message, botOutput);
    }

    const [exitCode] = await once(botProcess, 'exit', 10000);
    assert(exitCode === 0, `自动登录测试进程退出码异常：${exitCode}\n${botOutput.join('')}`);

    if (expected.length === 0) {
      assert(receivedMessages.length === 0, `未配置密码时不应该发送登录指令，实际收到：${receivedMessages.join(', ')}`);
    } else {
      assert(receivedMessages.length === expected.length, `自动登录应只发送一次指令，实际收到：${receivedMessages.join(', ')}`);
    }
  } finally {
    if (botProcess && botProcess.exitCode === null) botProcess.kill('SIGINT');
    if (server) server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function createTestConfig({ port, username, password, testExitAfterMs }) {
  return {
    server: {
      host: '127.0.0.1',
      port,
      version: '1.16.4',
      auth: 'offline'
    },
    runtime: {
      connectIntervalMs: 100,
      reconnect: false,
      reconnectDelayMs: 1000,
      idleActions: false,
      idleIntervalMs: 45000,
      messageCooldownMs: 100,
      chatOnJoin: '',
      testExitAfterMs
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
        autoLogin: true,
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
    accounts: [{ username, enabled: true, note: '', chatOnJoin: '', auth: '', registerPassword: password }],
    accountPool: []
  };
}

function createTestServer(port, prompts, receivedMessages) {
  const chunk = createFlatChunk();
  const server = mc.createServer({
    'online-mode': false,
    host: '127.0.0.1',
    port,
    version: '1.16.4',
    motd: 'pcl-afk-bot auto login'
  });

  server.on('playerJoin', (client) => {
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

    client.on('chat', (packet) => {
      receivedMessages.push(packet.message);
    });

    prompts.forEach((prompt, index) => {
      setTimeout(() => sendSystemChat(client, prompt), 250 + index * 650);
    });
    if (prompts.length === 1) {
      setTimeout(() => sendSystemChat(client, prompts[0]), 650);
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

async function waitForMessage(receivedMessages, expected, botOutput) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (receivedMessages.includes(expected)) return;
    await delay(100);
  }
  throw new Error(`等待服务端收到自动登录指令超时：${expected}\n已收到：${receivedMessages.join(', ')}\n机器人输出：${botOutput.join('')}`);
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

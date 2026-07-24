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

await runAntiAfkScenario({
  username: 'AntiAfkWalkBot',
  antiAfkCommand: '',
  expectRandomWalk: true
});
await runAntiAfkScenario({
  username: 'AntiAfkCommandBot',
  antiAfkCommand: '/ping',
  expectRandomWalk: false
});
await runReconnectOriginScenario();

console.log('anti-afk movement test ok');

async function runAntiAfkScenario({ username, antiAfkCommand, expectRandomWalk }) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pcl-afk-anti-afk-${expectRandomWalk ? 'walk' : 'cmd'}-`));
  const serverPort = 45000 + Math.floor(Math.random() * 3000);
  const receivedMessages = [];
  const receivedPackets = [];
  const botOutput = [];
  let botProcess = null;
  let server = null;

  try {
    server = createAntiAfkServer(serverPort, receivedMessages, receivedPackets);
    await once(server, 'listening');

    fs.writeFileSync(
      path.join(tempDir, 'bot.config.json'),
      JSON.stringify(createAntiAfkConfig({ port: serverPort, username, antiAfkCommand }), null, 2),
      'utf8'
    );

    botProcess = spawn(process.execPath, [botScript], {
      cwd: tempDir,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    botProcess.stdout.on('data', (data) => botOutput.push(data.toString()));
    botProcess.stderr.on('data', (data) => botOutput.push(data.toString()));

    if (expectRandomWalk) {
      await waitForOutput(botOutput, '防挂机随机走动');
      await waitForMovementProgress(receivedPackets);
    } else {
      await waitForMessage(receivedMessages, '/ping');
      await delay(1000);
      assert(!botOutput.join('').includes('防挂机随机走动'), '命令保活模式不应该触发随机走动');
    }

    const exitCode = await once(botProcess, 'exit', 10000);
    assert(exitCode[0] === 0, `机器人进程退出码异常：${exitCode[0]}\n${botOutput.join('')}`);
    assert(!botOutput.join('').includes('TypeError'), '输出包含 TypeError');
    assert(!botOutput.join('').includes('ReferenceError'), '输出包含 ReferenceError');
  } finally {
    if (botProcess && botProcess.exitCode === null) botProcess.kill('SIGINT');
    if (server) server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function runReconnectOriginScenario() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-afk-anti-afk-reconnect-'));
  const serverPort = 48000 + Math.floor(Math.random() * 1000);
  const botOutput = [];
  let botProcess = null;
  let server = null;
  let joinCount = 0;
  let secondJoinOutputOffset = -1;

  try {
    server = createAntiAfkServer(serverPort, [], [], {
      spawnX: () => (++joinCount === 1 ? 1 : 10),
      disconnectAfterFirstMove: true,
      onPlayerJoin: (spawnX) => {
        if (spawnX === 10) secondJoinOutputOffset = botOutput.join('').length;
      }
    });
    await once(server, 'listening');
    const config = createAntiAfkConfig({ port: serverPort, username: 'AntiAfkReconnectBot', antiAfkCommand: '' });
    config.runtime.reconnect = true;
    config.runtime.reconnectDelayMs = 250;
    config.runtime.testExitAfterMs = 7500;
    fs.writeFileSync(path.join(tempDir, 'bot.config.json'), JSON.stringify(config, null, 2), 'utf8');

    botProcess = spawn(process.execPath, [botScript], { cwd: tempDir, stdio: ['ignore', 'pipe', 'pipe'] });
    botProcess.stdout.on('data', (data) => botOutput.push(data.toString()));
    botProcess.stderr.on('data', (data) => botOutput.push(data.toString()));

    await waitForSecondJoinTarget(botOutput, () => secondJoinOutputOffset);
    assert(joinCount >= 2 && secondJoinOutputOffset >= 0, '防挂机重连场景没有建立第二次连接');
    const secondConnectionOutput = botOutput.join('').slice(secondJoinOutputOffset);
    const targetMatch = secondConnectionOutput.match(/防挂机随机走动：前往 (-?\d+(?:\.\d+)?),/);
    const secondTargetX = Number(targetMatch?.[1]);
    assert(secondTargetX > 6, `重连后随机走动仍围绕旧出生点：${secondTargetX}`);

    const exitCode = await once(botProcess, 'exit', 12000);
    assert(exitCode[0] === 0, `重连防挂机进程退出码异常：${exitCode[0]}\n${botOutput.join('')}`);
  } finally {
    if (botProcess && botProcess.exitCode === null) {
      const exited = once(botProcess, 'exit', 5000).catch(() => null);
      botProcess.kill('SIGINT');
      await exited;
    }
    if (server) server.close();
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function createAntiAfkConfig({ port, username, antiAfkCommand }) {
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
      messageCooldownMs: 250,
      chatOnJoin: '',
      testExitAfterMs: 4500
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
        antiAfk: true,
        switchHeldItem: false,
        antiAfkMinDelayMs: 1000,
        antiAfkMaxDelayMs: 1000,
        antiAfkCommand,
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
    accounts: [{ username, enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }]
  };
}

function createAntiAfkServer(port, receivedMessages, receivedPackets, options = {}) {
  const chunk = createFlatChunk();
  const server = mc.createServer({
    'online-mode': false,
    host: '127.0.0.1',
    port,
    version: '1.16.4',
    motd: 'pcl-afk-bot anti-afk movement'
  });

  server.on('playerJoin', (client) => {
    const spawnX = options.spawnX ? options.spawnX() : 1;
    options.onPlayerJoin?.(spawnX);
    let disconnected = false;
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
      x: spawnX,
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
      receivedMessages.push(packet.message);
    });
    const recordMovement = (name, packet) => {
      receivedPackets.push({ name, packet });
      const movedDistance = Math.hypot(Number(packet.x) - spawnX, Number(packet.z) - 1);
      if (options.disconnectAfterFirstMove && spawnX === 1 && !disconnected && movedDistance >= 0.5) {
        disconnected = true;
        client.end('reconnect test');
      }
    };
    client.on('position', (packet) => recordMovement('position', packet));
    client.on('position_look', (packet) => recordMovement('position_look', packet));
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

async function waitForOutput(botOutput, expected) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (botOutput.join('').includes(expected)) return;
    await delay(100);
  }
  throw new Error(`等待机器人输出超时：${expected}\n机器人输出：${botOutput.join('')}`);
}

async function waitForSecondJoinTarget(botOutput, getOffset) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const offset = getOffset();
    if (offset >= 0 && botOutput.join('').slice(offset).includes('防挂机随机走动：前往')) return;
    await delay(100);
  }
  throw new Error(`等待重连后的防挂机随机走动目标超时\n机器人输出：${botOutput.join('')}`);
}

async function waitForMessage(receivedMessages, expected) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (receivedMessages.includes(expected)) return;
    await delay(100);
  }
  throw new Error(`等待服务端收到消息超时：${expected}\n已收到：${receivedMessages.join(', ')}`);
}

async function waitForMovementProgress(receivedPackets) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const moved = receivedPackets.some(({ name, packet }) => {
      if (name !== 'position' && name !== 'position_look') return false;
      const dx = Number(packet.x) - 1;
      const dz = Number(packet.z) - 1;
      return Math.hypot(dx, dz) >= 0.5;
    });
    if (moved) return;
    await delay(100);
  }

  const movementPackets = receivedPackets
    .filter(({ name }) => name === 'position' || name === 'position_look')
    .map(({ packet }) => `(${Number(packet.x).toFixed(2)}, ${Number(packet.z).toFixed(2)})`)
    .join(', ');
  throw new Error(`等待防挂机随机走动位移超时\n已收到坐标：${movementPackets}`);
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

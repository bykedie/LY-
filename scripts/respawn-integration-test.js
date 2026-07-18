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

await runRespawnScenario({ autoRespawn: true, shouldSendRespawn: true, username: 'RespawnBotOn' });
await runRespawnScenario({ autoRespawn: false, shouldSendRespawn: false, username: 'RespawnBotOff' });

console.log('respawn integration test ok');

async function runRespawnScenario({ autoRespawn, shouldSendRespawn, username }) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pcl-afk-respawn-${autoRespawn ? 'on' : 'off'}-`));
  const serverPort = 42000 + Math.floor(Math.random() * 3000);
  const receivedPackets = [];
  const botOutput = [];
  let botProcess = null;
  let server = null;

  try {
    server = createRespawnServer(serverPort, receivedPackets);
    await once(server, 'listening');

    fs.writeFileSync(
      path.join(tempDir, 'bot.config.json'),
      JSON.stringify(createRespawnConfig({ port: serverPort, autoRespawn, username }), null, 2),
      'utf8'
    );

    botProcess = spawn(process.execPath, [botScript], {
      cwd: tempDir,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    botProcess.stdout.on('data', (data) => botOutput.push(data.toString()));
    botProcess.stderr.on('data', (data) => botOutput.push(data.toString()));

    if (shouldSendRespawn) {
      await waitForPacket(receivedPackets, 'client_command');
    } else {
      await waitForOutput(botOutput, '自动重生未启用');
      await delay(1000);
      assert(!receivedPackets.some((packet) => packet.name === 'client_command'), '关闭自动重生时不应该发送重生请求');
    }

    const exitCode = await once(botProcess, 'exit', 10000);
    assert(exitCode[0] === 0, `机器人进程退出码异常：${exitCode[0]}\n${botOutput.join('')}`);

    const output = botOutput.join('');
    assert(output.includes('已死亡'), '死亡日志缺失');
    assert(!output.includes('TypeError'), '输出包含 TypeError');
    assert(!output.includes('ReferenceError'), '输出包含 ReferenceError');
  } finally {
    if (botProcess && botProcess.exitCode === null) botProcess.kill('SIGINT');
    if (server) server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function createRespawnConfig({ port, autoRespawn, username }) {
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
      testExitAfterMs: 2500
    },
    features: {
      combat: {
        autoAttack: false,
        autoFish: false,
        autoEat: false,
        autoRespawn,
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

function createRespawnServer(port, receivedPackets) {
  const chunk = createFlatChunk();
  const server = mc.createServer({
    'online-mode': false,
    host: '127.0.0.1',
    port,
    version: '1.16.4',
    motd: 'pcl-afk-bot respawn integration'
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

    client.write('update_health', {
      health: 20,
      food: 20,
      foodSaturation: 5
    });

    client.on('client_command', (packet) => {
      receivedPackets.push({ name: 'client_command', packet });
    });

    setTimeout(() => {
      client.write('update_health', {
        health: 0,
        food: 0,
        foodSaturation: 0
      });
    }, 350);
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

async function waitForPacket(receivedPackets, expected) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (receivedPackets.some((packet) => packet.name === expected)) return;
    await delay(100);
  }
  throw new Error(`等待数据包超时：${expected}\n已收到：${receivedPackets.map((packet) => packet.name).join(', ')}`);
}

async function waitForOutput(botOutput, expected) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (botOutput.join('').includes(expected)) return;
    await delay(100);
  }
  throw new Error(`等待机器人输出超时：${expected}\n机器人输出：${botOutput.join('')}`);
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

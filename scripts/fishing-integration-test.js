import fs from 'node:fs';
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
const botScript = path.join(projectRoot, 'src', 'index.js');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-afk-fishing-'));
const serverPort = 34000 + Math.floor(Math.random() * 1000);
const receivedPackets = [];
const botOutput = [];

let botProcess = null;
let server = null;
let fishingCastHandled = false;

try {
  server = createFishingServer(serverPort);
  await once(server, 'listening');

  fs.writeFileSync(
    path.join(tempDir, 'bot.config.json'),
    JSON.stringify(createFishingConfig(serverPort), null, 2),
    'utf8'
  );

  botProcess = spawn(process.execPath, [botScript], {
    cwd: tempDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  botProcess.stdout.on('data', (data) => botOutput.push(data.toString()));
  botProcess.stderr.on('data', (data) => botOutput.push(data.toString()));

  await waitForUseItemCount(2);
  await waitForOutput('自动钓鱼：完成一次收竿。');

  const exitCode = await once(botProcess, 'exit', 10000);
  assert(exitCode[0] === 0, `机器人进程退出码异常：${exitCode[0]}\n${botOutput.join('')}`);

  const output = botOutput.join('');
  assert(output.includes('已启用功能：自动钓鱼'), '自动钓鱼没有出现在启用功能日志里');
  assert(!output.includes('TypeError'), '输出包含 TypeError');
  assert(!output.includes('ReferenceError'), '输出包含 ReferenceError');

  console.log('fishing integration test ok');
} finally {
  if (botProcess && botProcess.exitCode === null) botProcess.kill('SIGINT');
  if (server) server.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function createFishingConfig(port) {
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
      testExitAfterMs: 5000
    },
    features: {
      combat: {
        autoAttack: false,
        autoFish: true,
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
        fishingStartDelayMs: 300,
        fishingCastDelayMs: 1000,
        fishingTimeoutMs: 4000
      },
      movement: {
        autoWalk: false,
        antiAfk: false,
        switchHeldItem: false,
        antiAfkMinDelayMs: 600,
        antiAfkMaxDelayMs: 700,
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
    accounts: [{ username: 'FishingBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }]
  };
}

function createFishingServer(port) {
  const chunk = createFlatChunk();
  const testServer = mc.createServer({
    'online-mode': false,
    host: '127.0.0.1',
    port,
    version: '1.16.4',
    motd: 'pcl-afk-bot fishing integration'
  });

  testServer.on('playerJoin', (client) => {
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
    setTimeout(() => giveItem(client, 36, 'fishing_rod', 1), 100);

    client.on('use_item', (packet) => {
      receivedPackets.push({ name: 'use_item', packet });
      if (fishingCastHandled) return;
      fishingCastHandled = true;
      setTimeout(() => spawnFishingBobber(client), 150);
      setTimeout(() => sendFishingParticles(client), 450);
    });
  });

  return testServer;
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

function giveItem(client, slot, name, count = 1) {
  const itemDefinition = mcData.itemsByName[name];
  assert(itemDefinition, `找不到测试物品：${name}`);
  client.write('set_slot', {
    windowId: 0,
    slot,
    item: Item.toNotch(new Item(itemDefinition.id, count, 0))
  });
}

function spawnFishingBobber(client) {
  client.write('spawn_entity', {
    entityId: 888,
    objectUUID: '00000000-0000-0000-0000-000000000888',
    type: mcData.entitiesByName.fishing_bobber.id,
    x: 2,
    y: 64,
    z: 2,
    pitch: 0,
    yaw: 0,
    objectData: client.id,
    velocity: { x: 0, y: 0, z: 0 }
  });
}

function sendFishingParticles(client) {
  client.write('world_particles', {
    particleId: mcData.particlesByName.fishing.id,
    longDistance: false,
    x: 2,
    y: 64,
    z: 2,
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    particleData: 0,
    particles: 6,
    data: []
  });
}

async function waitForUseItemCount(count) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (receivedPackets.filter((packet) => packet.name === 'use_item').length >= count) return;
    await delay(100);
  }
  throw new Error(`等待钓鱼 use_item 包超时\n已收到：${receivedPackets.map((packet) => packet.name).join(', ')}\n机器人输出：${botOutput.join('')}`);
}

async function waitForOutput(expected) {
  const deadline = Date.now() + 10000;
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

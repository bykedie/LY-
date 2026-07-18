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
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-afk-bot-'));
const serverPort = 33000 + Math.floor(Math.random() * 1000);
const receivedMessages = [];
const receivedPackets = [];
const botOutput = [];
const hostileEntityId = 777;

let botProcess = null;
let server = null;

try {
  server = createTestServer(serverPort);
  await once(server, 'listening');

  fs.writeFileSync(
    path.join(tempDir, 'bot.config.json'),
    JSON.stringify(createTestConfig(serverPort), null, 2),
    'utf8'
  );

  botProcess = spawn(process.execPath, [botScript], {
    cwd: tempDir,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  botProcess.stdout.on('data', (data) => botOutput.push(data.toString()));
  botProcess.stderr.on('data', (data) => botOutput.push(data.toString()));

  await waitForMessage('/register pass123 pass123');
  await waitForMessage('pong Tester');
  await waitForMessage('/spawn');
  await waitForMessage('/ping');
  await waitForPacket('held_item_slot');
  await waitForPacket('use_entity', (packet) => packet.target === hostileEntityId && packet.mouse === 1);
  await waitForMovementProgress({ minX: 4, minZ: 4 });
  await waitForOutput('自动进食：bread');

  botProcess.stdin.write(`${JSON.stringify({ type: 'chat', target: 'IntegrationBot', message: '/home' })}\n`);
  await waitForMessage('/home');

  const exitCode = await once(botProcess, 'exit', 10000);
  assert(exitCode[0] === 0, `机器人进程退出码异常：${exitCode[0]}\n${botOutput.join('')}`);

  const output = botOutput.join('');
  assert(output.includes('已进入服务器'), '机器人没有进入服务器');
  assert(output.includes('游戏消息：<Tester> ping'), '游戏聊天日志缺失');
  assert(output.includes('自动登录：已发送 /register 指令'), '自动注册日志缺失');
  assert(output.includes('关键词回复：ping -> pong Tester'), '关键词回复日志缺失');
  assert(output.includes('定时任务 smoke-login：/spawn'), '定时任务日志缺失');
  assert(output.includes('切换手持：快捷栏 3'), '切换手持日志缺失');
  assert(output.includes('自动走路：前往 5, 64, 5，范围 1'), '自动走路日志缺失');
  assert(output.includes('自动攻击：zombie'), '自动攻击日志缺失');
  assert(output.includes('大厅使用物品：第 1 次'), '大厅使用物品日志缺失');
  assert(output.includes('已发送一次保活动作'), '防挂机日志缺失');
  assert(!output.includes('TypeError'), '输出包含 TypeError');
  assert(!output.includes('ReferenceError'), '输出包含 ReferenceError');

  console.log('protocol integration test ok');
} finally {
  if (botProcess && botProcess.exitCode === null) botProcess.kill('SIGINT');
  if (server) server.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function createTestConfig(port) {
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
      testExitAfterMs: 6500
    },
    features: {
      combat: {
        autoAttack: true,
        autoFish: false,
        autoEat: true,
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
        autoWalk: true,
        antiAfk: true,
        switchHeldItem: true,
        antiAfkMinDelayMs: 600,
        antiAfkMaxDelayMs: 700,
        antiAfkCommand: '/ping',
        antiAfkSneak: false,
        antiAfkWalk: true,
        antiAfkWalkRange: 3,
        walkTarget: { x: 5, y: 64, z: 5 },
        walkRange: 1,
        heldSlot: 2
      },
      chat: {
        keywordReply: true,
        presetMessages: false,
        remoteCommand: true,
        autoLogin: true,
        keywordRules: [{ keyword: 'ping', reply: 'pong {player}' }],
        presetMessagesList: []
      },
      lobby: {
        useItem: true,
        delayMs: 800,
        heldSlot: 2,
        useCount: 1
      },
      scheduler: {
        enabled: true,
        tasks: [{ name: 'smoke-login', trigger: 'login', intervalMs: 60000, action: '/spawn', enabled: true }]
      }
    },
    accounts: [{ username: 'IntegrationBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: 'pass123' }]
  };
}

function createTestServer(port) {
  const chunk = createFlatChunk();
  const testServer = mc.createServer({
    'online-mode': false,
    host: '127.0.0.1',
    port,
    version: '1.16.4',
    motd: 'pcl-afk-bot integration'
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
      food: 10,
      foodSaturation: 0
    });
    setTimeout(() => giveItem(client, 36, 'bread', 3), 200);

    client.on('chat', (packet) => {
      receivedMessages.push(packet.message);
    });
    client.on('held_item_slot', (packet) => {
      receivedPackets.push({ name: 'held_item_slot', packet });
    });
    client.on('use_entity', (packet) => {
      receivedPackets.push({ name: 'use_entity', packet });
    });
    client.on('position', (packet) => {
      receivedPackets.push({ name: 'position', packet });
    });
    client.on('position_look', (packet) => {
      receivedPackets.push({ name: 'position_look', packet });
    });
    client.on('block_place', (packet) => {
      receivedPackets.push({ name: 'block_place', packet });
    });
    client.on('use_item', (packet) => {
      receivedPackets.push({ name: 'use_item', packet });
      setTimeout(() => {
        client.write('entity_status', {
          entityId: client.id,
          entityStatus: 9
        });
      }, 250);
    });
    client.on('arm_animation', (packet) => {
      receivedPackets.push({ name: 'arm_animation', packet });
    });

    setTimeout(() => sendSystemChat(client, '请使用 /register 密码 密码 完成注册'), 250);
    setTimeout(() => sendPlayerChat(client, 'Tester', 'ping'), 500);
    setTimeout(() => spawnHostileMob(client), 700);
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

function spawnHostileMob(client) {
  client.write('spawn_entity_living', {
    entityId: hostileEntityId,
    entityUUID: '00000000-0000-0000-0000-000000000777',
    type: mcData.entitiesByName.zombie.id,
    x: 2,
    y: 64,
    z: 1,
    yaw: 0,
    pitch: 0,
    headPitch: 0,
    velocity: { x: 0, y: 0, z: 0 }
  });
}

function sendSystemChat(client, text) {
  client.write('chat', {
    message: JSON.stringify({ text }),
    position: 0,
    sender: '00000000-0000-0000-0000-000000000000'
  });
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

async function waitForMessage(expected) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (receivedMessages.includes(expected)) return;
    await delay(100);
  }
  throw new Error(`等待服务端收到消息超时：${expected}\n已收到：${receivedMessages.join(', ')}\n机器人输出：${botOutput.join('')}`);
}

async function waitForOutput(expected) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (botOutput.join('').includes(expected)) return;
    await delay(100);
  }
  throw new Error(`等待机器人输出超时：${expected}\n机器人输出：${botOutput.join('')}`);
}

async function waitForPacket(expected, predicate = () => true) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (receivedPackets.some((packet) => packet.name === expected && predicate(packet.packet))) return;
    await delay(100);
  }
  throw new Error(`等待服务端收到数据包超时：${expected}\n已收到：${receivedPackets.map((packet) => packet.name).join(', ')}\n机器人输出：${botOutput.join('')}`);
}

async function waitForMovementProgress({ minX, minZ }) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const moved = receivedPackets.some(({ name, packet }) => {
      if (name !== 'position' && name !== 'position_look') return false;
      return Number(packet.x) >= minX && Number(packet.z) >= minZ;
    });
    if (moved) return;
    await delay(100);
  }

  const movementPackets = receivedPackets
    .filter(({ name }) => name === 'position' || name === 'position_look')
    .map(({ packet }) => `(${Number(packet.x).toFixed(2)}, ${Number(packet.y).toFixed(2)}, ${Number(packet.z).toFixed(2)})`)
    .join(', ');
  throw new Error(`等待自动走路位移超时\n已收到坐标：${movementPackets}\n机器人输出：${botOutput.join('')}`);
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

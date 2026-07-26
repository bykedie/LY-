import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-afk-fresh-snapshot-'));
const configPath = path.join(tempRoot, 'bot.config.json');
const dashboardPort = 43000 + Math.floor(Math.random() * 2000);
const baseUrl = `http://127.0.0.1:${dashboardPort}`;
let dashboard = null;
let output = '';

try {
  fs.cpSync(path.join(projectRoot, 'src'), path.join(tempRoot, 'src'), { recursive: true });
  fs.cpSync(path.join(projectRoot, 'public'), path.join(tempRoot, 'public'), { recursive: true });
  fs.copyFileSync(path.join(projectRoot, 'package.json'), path.join(tempRoot, 'package.json'));
  fs.copyFileSync(path.join(projectRoot, 'bot.config.example.json'), path.join(tempRoot, 'bot.config.example.json'));
  fs.symlinkSync(
    path.join(projectRoot, 'node_modules'),
    path.join(tempRoot, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir'
  );
  fs.writeFileSync(path.join(tempRoot, 'src', 'index.js'), fakeExecutorSource(), 'utf8');

  dashboard = spawn(process.execPath, ['src/dashboard.js'], {
    cwd: tempRoot,
    env: { ...process.env, DASHBOARD_PORT: String(dashboardPort), BOT_CONFIG_PATH: configPath },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  dashboard.stdout.on('data', (data) => { output += data.toString(); });
  dashboard.stderr.on('data', (data) => { output += data.toString(); });

  await waitForDashboard();
  await requestJson('/api/config', {
    method: 'POST',
    body: JSON.stringify(createConfig())
  });
  await requestJson('/api/start', { method: 'POST' });

  const staleSnapshot = await requestJson('/api/window?target=SnapshotBot');
  assert(staleSnapshot.window?.title === '交互前窗口', '测试夹具没有建立交互前缓存');

  const actionResult = await requestJson('/api/lobby/action', {
    method: 'POST',
    body: JSON.stringify({
      target: 'SnapshotBot',
      action: { type: 'wait', delayMs: 100, enabled: true }
    })
  });
  assert(actionResult.window?.title === '交互后窗口', '即时动作返回了交互前的旧窗口缓存');
  assert(
    actionResult.chatButtons?.some((button) => button.value === '/after-action'),
    '即时动作没有主动请求并返回交互后的聊天选项'
  );

  console.log('dashboard fresh snapshot test ok');
} finally {
  if (dashboard?.exitCode === null) {
    dashboard.kill('SIGINT');
    const exited = await waitForExit(dashboard, 3000);
    if (!exited && dashboard.exitCode === null) {
      dashboard.kill('SIGKILL');
      await waitForExit(dashboard, 3000);
    }
  }
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function createConfig() {
  const config = JSON.parse(fs.readFileSync(path.join(projectRoot, 'bot.config.example.json'), 'utf8'));
  config.server = { host: '127.0.0.1', port: 9, version: '1.16.4', auth: 'offline' };
  config.runtime.reconnect = false;
  config.accounts = [
    { username: 'SnapshotBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }
  ];
  return config;
}

function fakeExecutorSource() {
  return `
import readline from 'node:readline';

console.log('::ly-event ' + JSON.stringify({
  type: 'executionReady',
  requestId: process.env.DASHBOARD_START_REQUEST_ID,
  ok: true,
  message: '模拟执行端初始化完成。'
}));

let snapshotRequests = 0;
const input = readline.createInterface({ input: process.stdin });
input.on('line', (line) => {
  const command = JSON.parse(line);
  if (command.type === 'lobbyAction') {
    console.log('::ly-event ' + JSON.stringify({
      type: 'lobbyActionResult',
      requestId: command.requestId,
      username: command.target,
      ok: true,
      message: '模拟执行端已完成即时动作。'
    }));
    return;
  }
  if (command.type !== 'windowSnapshot') return;
  snapshotRequests += 1;
  const fresh = snapshotRequests > 1;
  console.log('::ly-event ' + JSON.stringify({
    type: 'windowSnapshot',
    requestId: command.requestId,
    username: command.target,
    window: { title: fresh ? '交互后窗口' : '交互前窗口', slots: [] },
    position: null,
    entities: [],
    messages: [],
    chatButtons: fresh ? [{ label: '继续', action: 'run_command', value: '/after-action' }] : [],
    protocolDialogs: [],
    protocolMenu: null
  }));
});
`;
}

function requestJson(pathname, options = {}) {
  return request(pathname, options).then(({ body }) => {
    const data = JSON.parse(body);
    if (!data.ok) throw new Error(data.message || '请求失败');
    return data;
  });
}

function request(pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body || '';
    const request = http.request(
      `${baseUrl}${pathname}`,
      {
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
        }
      },
      (response) => {
        let data = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => resolve({ statusCode: response.statusCode, body: data }));
      }
    );
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

async function waitForDashboard() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const status = await requestJson('/api/status');
      if (status.ok) return;
    } catch {
      await delay(100);
    }
  }
  throw new Error(`管理面板启动超时\n${output}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve(true);
  return Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    delay(timeoutMs).then(() => false)
  ]);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

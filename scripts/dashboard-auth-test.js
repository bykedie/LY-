import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const port = 36000 + Math.floor(Math.random() * 3000);
const baseUrl = `http://127.0.0.1:${port}`;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-afk-auth-'));
const configPath = path.join(tempDir, 'bot.config.json');
const dashboardOutput = [];

let dashboard = null;

try {
  const envPath = path.join(tempDir, '.env');
  fs.writeFileSync(
    envPath,
    [
      `DASHBOARD_PORT=${port}`,
      'DASHBOARD_USER=root',
      'DASHBOARD_PASSWORD=secret-pass'
    ].join('\n'),
    'utf8'
  );

  dashboard = spawn(process.execPath, ['src/dashboard.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      BOT_CONFIG_PATH: configPath,
      DOTENV_CONFIG_PATH: envPath
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  dashboard.stdout.on('data', (data) => dashboardOutput.push(data.toString()));
  dashboard.stderr.on('data', (data) => dashboardOutput.push(data.toString()));

  await waitForDashboard();

  const anonymousStatus = await request('/api/status');
  assert(anonymousStatus.statusCode === 401, '未登录访问 /api/status 应该被拒绝');
  assert(
    anonymousStatus.headers['www-authenticate']?.includes('Basic'),
    '未登录响应应该带 WWW-Authenticate Basic 头'
  );

  const wrongPasswordStatus = await request('/api/status', {
    headers: { Authorization: basicAuth('root', 'wrong-pass') }
  });
  assert(wrongPasswordStatus.statusCode === 401, '密码错误时应该被拒绝');

  const wrongUserStatus = await request('/api/status', {
    headers: { Authorization: basicAuth('admin', 'secret-pass') }
  });
  assert(wrongUserStatus.statusCode === 401, '用户名错误时应该被拒绝');

  const authorizedStatus = await request('/api/status', {
    headers: { Authorization: basicAuth('root', 'secret-pass') }
  });
  assert(authorizedStatus.statusCode === 200, '密码正确时应该允许访问 /api/status');
  const statusJson = JSON.parse(authorizedStatus.body);
  assert(statusJson.ok === true && statusJson.running === false, '认证后状态响应不正确');

  const unauthorizedStop = await request('/api/stop', { method: 'POST' });
  assert(unauthorizedStop.statusCode === 401, '未登录 POST /api/stop 应该被拒绝');
  const anonymousMissingApi = await request('/api/missing');
  assert(anonymousMissingApi.statusCode === 401, '未登录未知 API 泄露了路由存在性');
  const anonymousWrongMethod = await request('/api/config', { method: 'PUT' });
  assert(anonymousWrongMethod.statusCode === 401, '未登录错误方法 API 泄露了允许方法');
  const authorizedMissingApi = await request('/api/missing', {
    headers: { Authorization: basicAuth('root', 'secret-pass') }
  });
  assert(authorizedMissingApi.statusCode === 404, '认证后未知 API 没有返回 404');
  assert(JSON.parse(authorizedMissingApi.body).ok === false, '认证后未知 API 没有返回 JSON 错误');
  const authorizedWrongMethod = await request('/api/config', {
    method: 'PUT',
    headers: { Authorization: basicAuth('root', 'secret-pass') }
  });
  assert(authorizedWrongMethod.statusCode === 405, '认证后错误方法 API 没有返回 405');
  assert(authorizedWrongMethod.headers.allow === 'GET, POST', '认证后错误方法 API Allow 头不正确');

  const authorizedPage = await request('/', {
    headers: { Authorization: basicAuth('root', 'secret-pass') }
  });
  assert(authorizedPage.statusCode === 200, '密码正确时应该允许访问页面');
  assert(authorizedPage.body.includes('LY挂机控制台'), '认证后的页面内容不正确');

  console.log('dashboard auth test ok');
} finally {
  if (dashboard && dashboard.exitCode === null) dashboard.kill('SIGINT');
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function basicAuth(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

function request(pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body || '';
    const req = http.request(
      `${baseUrl}${pathname}`,
      {
        method: options.method || 'GET',
        headers: {
          ...(options.headers || {}),
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
        }
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function waitForDashboard() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await request('/api/status');
      if (response.statusCode) return;
    } catch {
      await delay(250);
    }
  }
  throw new Error(`管理面板启动超时\n${dashboardOutput.join('')}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

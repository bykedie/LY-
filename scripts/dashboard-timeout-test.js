import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHttpServerOptions } from '../src/http-server-listener.js';

const projectRoot = path.resolve(import.meta.dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-afk-timeout-'));
const port = 39000 + Math.floor(Math.random() * 1000);
const output = { stdout: '', stderr: '' };
const dashboard = spawn(process.execPath, ['src/dashboard.js'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    DASHBOARD_PORT: String(port),
    DASHBOARD_REQUEST_TIMEOUT_MS: '200',
    BOT_CONFIG_PATH: path.join(tempDir, 'bot.config.json')
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
dashboard.stdout.on('data', (chunk) => { output.stdout += chunk; });
dashboard.stderr.on('data', (chunk) => { output.stderr += chunk; });

try {
  const defaults = createHttpServerOptions({});
  assert(defaults.requestTimeout === 30000 && defaults.headersTimeout === 15000, 'HTTP 超时默认值不正确');
  const bounded = createHttpServerOptions({
    DASHBOARD_REQUEST_TIMEOUT_MS: '100',
    DASHBOARD_HEADERS_TIMEOUT_MS: '1000'
  });
  assert(bounded.headersTimeout === 100 && bounded.connectionsCheckingInterval === 50, '请求头超时没有受请求超时约束');
  await waitForDashboard();
  const timeoutResponse = await sendPartialRequest();
  assert(timeoutResponse.includes('408 Request Timeout'), '慢速未完成请求没有收到 HTTP 408');
  assert(dashboard.exitCode === null, '慢速请求超时导致 Dashboard 退出');
  const status = await requestStatus();
  assert(status.statusCode === 200, '慢速请求超时后 Dashboard 无法继续响应');
  assert(!output.stderr.includes('Unhandled'), '慢速请求超时产生未处理错误');
  console.log('dashboard timeout test ok');
} finally {
  if (dashboard.exitCode === null) dashboard.kill('SIGINT');
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function sendPartialRequest() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let response = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('等待慢速请求超时关闭连接失败'));
    }, 2000);
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => { response += chunk; });
    socket.once('connect', () => {
      socket.write(
        'POST /api/config HTTP/1.1\r\n'
        + 'Host: 127.0.0.1\r\n'
        + 'Content-Type: application/json\r\n'
        + 'Content-Length: 1000\r\n\r\n{'
      );
    });
    socket.once('error', reject);
    socket.once('close', () => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

function requestStatus() {
  return new Promise((resolve, reject) => {
    const request = http.get(`http://127.0.0.1:${port}/api/status`, (response) => {
      response.resume();
      response.once('end', () => resolve({ statusCode: response.statusCode }));
    });
    request.once('error', reject);
  });
}

async function waitForDashboard() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (dashboard.exitCode !== null) throw new Error(`Dashboard 提前退出：${output.stderr}`);
    try {
      const status = await requestStatus();
      if (status.statusCode === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`等待 Dashboard 启动超时：${output.stdout}${output.stderr}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

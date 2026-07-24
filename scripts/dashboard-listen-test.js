import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { formatListenError } from '../src/http-server-listener.js';

const projectRoot = path.resolve(import.meta.dirname, '..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-afk-listen-'));
const holder = http.createServer((_req, res) => res.end('holder'));
let dashboard = null;

try {
  assert(
    formatListenError({ code: 'EACCES' }, { host: '127.0.0.1', port: 80 }).includes('没有权限'),
    '权限错误缺少可操作诊断'
  );
  assert(
    formatListenError({ code: 'EADDRNOTAVAIL' }, { host: '192.0.2.1', port: 30123 }).includes('监听地址在本机不可用'),
    '无效本机地址缺少可操作诊断'
  );
  await listen(holder, 0);
  const port = holder.address().port;
  const output = { stdout: '', stderr: '' };
  dashboard = spawn(process.execPath, ['src/dashboard.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DASHBOARD_HOST: '127.0.0.1',
      DASHBOARD_PORT: String(port),
      BOT_CONFIG_PATH: path.join(tempDir, 'bot.config.json')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  dashboard.stdout.on('data', (chunk) => { output.stdout += chunk; });
  dashboard.stderr.on('data', (chunk) => { output.stderr += chunk; });

  const exit = await waitForExit(dashboard, 5000);
  assert(exit.code !== 0, '监听失败时 Dashboard 应以非零退出码结束');
  assert(exit.signal === null, '监听失败时 Dashboard 不应依赖外部信号退出');
  assert(output.stderr.includes(`http://127.0.0.1:${port}`), '监听失败诊断缺少实际端点');
  assert(output.stderr.includes('EADDRINUSE'), '监听失败诊断缺少错误码');
  assert(output.stderr.includes('地址或端口已被占用'), '监听失败诊断缺少可操作说明');
  assert(!output.stderr.includes("Unhandled 'error' event"), '监听失败仍输出未处理 error 事件堆栈');

  await close(holder);
  const probe = http.createServer();
  await listen(probe, port);
  await close(probe);
  console.log('dashboard listen test ok');
} finally {
  if (dashboard && dashboard.exitCode === null) dashboard.kill('SIGKILL');
  if (holder.listening) await close(holder);
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('等待 Dashboard 监听失败退出超时')), timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

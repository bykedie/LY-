import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createLineReader } from '../src/line-reader.js';
import { writeJsonLine } from '../src/process-ipc.js';

const projectRoot = path.resolve(import.meta.dirname, '..');

await expectDashboardToWaitForConfigResult();
await expectExecutorToReportConfigRejection();
console.log('runtime config protocol test ok');

async function expectDashboardToWaitForConfigResult() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-afk-config-protocol-'));
  const configPath = path.join(tempRoot, 'bot.config.json');
  const dashboardPort = 39000 + Math.floor(Math.random() * 2000);
  let dashboard = null;

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
    let output = '';
    dashboard.stdout.on('data', (data) => { output += data.toString(); });
    dashboard.stderr.on('data', (data) => { output += data.toString(); });

    const baseUrl = `http://127.0.0.1:${dashboardPort}`;
    await waitForDashboard(baseUrl, () => output);
    const initialConfig = createConfig('/initial');
    await requestJson(baseUrl, '/api/config', { method: 'POST', body: JSON.stringify(initialConfig) });
    await requestJson(baseUrl, '/api/start', { method: 'POST' });

    const rejectedConfig = createConfig('/reject');
    const rejectedAt = Date.now();
    const rejected = await requestJson(baseUrl, '/api/config', {
      method: 'POST',
      body: JSON.stringify(rejectedConfig)
    });
    assert(rejected.ok === true, '执行端拒绝实时配置时不应撤销已成功的磁盘保存');
    assert(rejected.liveApplied === false, '执行端拒绝实时配置时 Dashboard 错误报告 liveApplied=true');
    assert(Date.now() - rejectedAt < 1000, '执行端明确拒绝后 Dashboard 没有立即结束等待');
    const rejectedStatus = await requestJson(baseUrl, '/api/status');
    assert(rejectedStatus.control.presetMessagesList.includes('/initial'), '执行端拒绝配置后 Dashboard 错误更新了运行快照');
    assert(rejectedStatus.logs.join('\n').includes('模拟执行端拒绝配置'), 'Dashboard 日志缺少执行端配置拒绝原因');

    const accepted = await requestJson(baseUrl, '/api/config', {
      method: 'POST',
      body: JSON.stringify(createConfig('/accept'))
    });
    assert(accepted.liveApplied === true, '执行端确认配置后 Dashboard 没有报告实时应用成功');
    const acceptedStatus = await requestJson(baseUrl, '/api/status');
    assert(acceptedStatus.control.presetMessagesList.includes('/accept'), '执行端确认配置后 Dashboard 没有更新运行快照');

    const timeoutAt = Date.now();
    const timedOut = await requestJson(baseUrl, '/api/config', {
      method: 'POST',
      body: JSON.stringify(createConfig('/ignore'))
    });
    const timeoutElapsed = Date.now() - timeoutAt;
    assert(timedOut.liveApplied === false, '执行端不回执时 Dashboard 错误报告实时应用成功');
    assert(timeoutElapsed >= 1000 && timeoutElapsed < 5000, `配置回执超时边界异常：${timeoutElapsed}ms`);
    const timeoutStatus = await requestJson(baseUrl, '/api/status');
    assert(timeoutStatus.control.presetMessagesList.includes('/accept'), '配置回执超时后 Dashboard 错误更新了运行快照');
    assert(timeoutStatus.logs.join('\n').includes('等待执行端确认实时配置超时'), 'Dashboard 日志缺少配置回执超时原因');

    const exitAt = Date.now();
    const exited = await requestJson(baseUrl, '/api/config', {
      method: 'POST',
      body: JSON.stringify(createConfig('/exit'))
    });
    assert(exited.liveApplied === false, '执行端退出时 Dashboard 错误报告实时应用成功');
    assert(Date.now() - exitAt < 1000, '执行端退出后 Dashboard 没有立即结束配置等待');
    const exitedStatus = await requestJson(baseUrl, '/api/status');
    assert(exitedStatus.running === false, '执行端退出后 Dashboard 仍报告运行中');
  } finally {
    await stopProcess(dashboard);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function expectExecutorToReportConfigRejection() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-afk-config-executor-'));
  const configPath = path.join(tempDir, 'bot.config.json');
  const requestId = 'config-invalid-test';
  let executor = null;
  let output = '';

  try {
    fs.writeFileSync(configPath, `${JSON.stringify(createConfig('/initial'), null, 2)}\n`, 'utf8');
    executor = spawn(process.execPath, ['src/index.js'], {
      cwd: projectRoot,
      env: { ...process.env, BOT_CONFIG_PATH: configPath },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const resultPromise = waitForRuntimeEvent(executor, requestId, (text) => { output += text; });
    executor.stderr.on('data', (data) => { output += data.toString(); });
    await writeJsonLine(executor.stdin, { type: 'config', requestId, config: null });
    const result = await resultPromise;
    assert(result.ok === false, '执行端拒绝非法实时配置时返回了成功回执');
    assert(result.message.includes('实时配置格式不正确'), `执行端拒绝原因不明确：${result.message}`);
  } catch (error) {
    throw new Error(`${error.message}\n执行端输出：\n${output}`);
  } finally {
    await stopProcess(executor);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function waitForRuntimeEvent(child, requestId, onOutput) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('等待执行端配置拒绝回执超时')), 3000);
    const reader = createLineReader((line) => {
      onOutput(`${line}\n`);
      if (!line.startsWith('::ly-event ')) return;
      const event = JSON.parse(line.slice('::ly-event '.length));
      if (event.type !== 'configApplyResult' || event.requestId !== requestId) return;
      clearTimeout(timer);
      resolve(event);
    });
    child.stdout.on('data', reader.push);
    child.stdout.once('end', reader.end);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`执行端在返回配置回执前退出：${code}`));
    });
  });
}

function createConfig(preset) {
  const config = JSON.parse(fs.readFileSync(path.join(projectRoot, 'bot.config.example.json'), 'utf8'));
  config.server = { host: '127.0.0.1', port: 9, version: '1.16.4', auth: 'offline' };
  config.runtime.reconnect = false;
  config.features.chat.presetMessagesList = [preset];
  config.accounts = [{ username: 'ConfigProtocolBot', enabled: true, chatOnJoin: '', auth: '', registerPassword: '' }];
  return config;
}

function fakeExecutorSource() {
  return `
import readline from 'node:readline';

const input = readline.createInterface({ input: process.stdin });
input.on('line', (line) => {
  const command = JSON.parse(line);
  if (command.type !== 'config') return;
  const marker = command.config?.features?.chat?.presetMessagesList?.[0];
  if (marker === '/ignore') return;
  if (marker === '/exit') {
    process.exit(7);
  }
  const ok = marker === '/accept';
  console.log('::ly-event ' + JSON.stringify({
    type: 'configApplyResult',
    requestId: command.requestId,
    ok,
    message: ok ? '模拟执行端已应用配置。' : '模拟执行端拒绝配置。'
  }));
});
`;
}

async function waitForDashboard(baseUrl, getOutput) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      await requestJson(baseUrl, '/api/status');
      return;
    } catch {
      await sleep(50);
    }
  }
  throw new Error(`等待 Dashboard 启动超时：\n${getOutput()}`);
}

async function requestJson(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.message || `HTTP ${response.status}`);
  return data;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGINT');
  await Promise.race([exited, sleep(3000)]);
  if (child.exitCode === null) {
    const killed = once(child, 'exit');
    child.kill('SIGKILL');
    await Promise.race([killed, sleep(3000)]);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

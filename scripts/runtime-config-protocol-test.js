import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createLineReader } from '../src/line-reader.js';
import { writeJsonLine } from '../src/process-ipc.js';

const projectRoot = path.resolve(import.meta.dirname, '..');

await expectDashboardToWaitForConfigResult();
await expectDashboardToHideExecutorBootstrapFailure();
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
      env: {
        ...process.env,
        DASHBOARD_PORT: String(dashboardPort),
        BOT_CONFIG_PATH: configPath,
        DASHBOARD_START_READY_TIMEOUT_MS: '1000'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    dashboard.stdout.on('data', (data) => { output += data.toString(); });
    dashboard.stderr.on('data', (data) => { output += data.toString(); });

    const baseUrl = `http://127.0.0.1:${dashboardPort}`;
    await waitForDashboard(baseUrl, () => output);
    await requestJson(baseUrl, '/api/config', {
      method: 'POST',
      body: JSON.stringify(createConfig('/startup-exit'))
    });
    const failedStart = await requestJson(baseUrl, '/api/start', { method: 'POST', expectOk: false });
    assert(failedStart.ok === false, '执行端初始化后立即退出时 Dashboard 错误返回启动成功');
    assert(failedStart.message.includes('初始化') || failedStart.message.includes('退出'), `执行端初始化失败原因不明确：${failedStart.message}`);
    const failedStartStatus = await requestJson(baseUrl, '/api/status');
    assert(failedStartStatus.running === false, '执行端初始化失败后 Dashboard 仍报告运行中');

    await requestJson(baseUrl, '/api/config', {
      method: 'POST',
      body: JSON.stringify(createConfig('/startup-ignore'))
    });
    const startupWaitAt = Date.now();
    const timedOutStart = await requestJson(baseUrl, '/api/start', { method: 'POST', expectOk: false });
    const startupTimeoutElapsed = Date.now() - startupWaitAt;
    assert(timedOutStart.ok === false, '执行端不返回初始化回执时 Dashboard 错误返回启动成功');
    assert(timedOutStart.message.includes('初始化完成超时'), `执行端初始化超时原因不明确：${timedOutStart.message}`);
    assert(startupTimeoutElapsed >= 150 && startupTimeoutElapsed < 3000, `执行端初始化超时边界异常：${startupTimeoutElapsed}ms`);
    const timedOutStartStatus = await requestJson(baseUrl, '/api/status');
    assert(timedOutStartStatus.running === false, '执行端初始化超时后仍有残留运行进程');

    await requestJson(baseUrl, '/api/config', {
      method: 'POST',
      body: JSON.stringify(createConfig('/startup-delay'))
    });
    const delayedStartPromise = requestJson(baseUrl, '/api/start', { method: 'POST' });
    delayedStartPromise.catch(() => {});
    await sleep(50);
    const initializingStatus = await requestJson(baseUrl, '/api/status');
    assert(initializingStatus.starting === true, '执行端等待 ready 时状态没有标记为初始化中');
    assert(initializingStatus.running === false, '执行端等待 ready 时错误报告为运行中');
    assert(initializingStatus.control === null, '执行端等待 ready 时错误开放运行控制快照');
    const duplicateInitializingStart = await requestJson(baseUrl, '/api/start', { method: 'POST', expectOk: false });
    assert(duplicateInitializingStart.message.includes('正在初始化'), '执行端初始化中重复启动没有返回明确错误');
    const initializingSend = await requestJson(baseUrl, '/api/send', {
      method: 'POST',
      body: JSON.stringify({ target: 'ConfigProtocolBot', message: '/too-early' }),
      expectOk: false
    });
    assert(initializingSend.message.includes('正在初始化'), '执行端初始化中发送命令没有被明确拒绝');
    await delayedStartPromise;
    const initializedStatus = await requestJson(baseUrl, '/api/status');
    assert(initializedStatus.starting === false && initializedStatus.running === true, '执行端 ready 后没有从初始化中切换为运行中');
    await requestJson(baseUrl, '/api/stop', { method: 'POST' });
    await waitForStopped(baseUrl);

    const initialConfig = createConfig('/initial');
    await requestJson(baseUrl, '/api/config', { method: 'POST', body: JSON.stringify(initialConfig) });
    await requestJson(baseUrl, '/api/start', { method: 'POST' });

    const rejectedChat = await requestJson(baseUrl, '/api/send', {
      method: 'POST',
      body: JSON.stringify({ target: 'ConfigProtocolBot', message: '/chat-reject' }),
      expectOk: false
    });
    assert(rejectedChat.ok === false && rejectedChat.message.includes('模拟执行端拒绝发送'), '执行端拒绝发送时 Dashboard 错误返回成功');

    const acceptedChat = await requestJson(baseUrl, '/api/send', {
      method: 'POST',
      body: JSON.stringify({ target: 'ConfigProtocolBot', message: '/chat-accept' })
    });
    assert(acceptedChat.queuedTargets?.join(',') === 'ConfigProtocolBot', '执行端确认发送后 Dashboard 没有返回成功入队目标');
    assert(acceptedChat.failedTargets?.length === 0, '执行端确认发送后 Dashboard 错误返回失败目标');

    const chatTimeoutAt = Date.now();
    const timedOutChat = await requestJson(baseUrl, '/api/send', {
      method: 'POST',
      body: JSON.stringify({ target: 'ConfigProtocolBot', message: '/chat-ignore' }),
      expectOk: false
    });
    const chatTimeoutElapsed = Date.now() - chatTimeoutAt;
    assert(timedOutChat.ok === false && timedOutChat.message.includes('确认发送命令超时'), '执行端不返回发送回执时 Dashboard 错误返回成功');
    assert(chatTimeoutElapsed >= 1000 && chatTimeoutElapsed < 5000, `发送回执超时边界异常：${chatTimeoutElapsed}ms`);

    const emptySnapshot = await requestJson(baseUrl, '/api/window?target=ConfigProtocolBot');
    assert(emptySnapshot.ok === true && emptySnapshot.window === null, '执行端返回的合法空窗口快照不应被当成失败');
    const ignoredSnapshotAt = Date.now();
    const ignoredSnapshot = await requestJson(baseUrl, '/api/window?target=ConfigProtocolBot', { expectOk: false });
    const ignoredSnapshotElapsed = Date.now() - ignoredSnapshotAt;
    assert(ignoredSnapshot.ok === false, '执行端忽略窗口快照命令时 Dashboard 错误返回成功');
    assert(ignoredSnapshot.message.includes('等待执行端返回窗口快照超时'), `窗口快照超时原因不明确：${ignoredSnapshot.message}`);
    assert(ignoredSnapshotElapsed >= 500 && ignoredSnapshotElapsed < 3000, `窗口快照超时边界异常：${ignoredSnapshotElapsed}ms`);

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

    await requestJson(baseUrl, '/api/config', {
      method: 'POST',
      body: JSON.stringify(createConfig('/initial'))
    });
    await requestJson(baseUrl, '/api/start', { method: 'POST' });
    const chatExitAt = Date.now();
    const exitedChat = await requestJson(baseUrl, '/api/send', {
      method: 'POST',
      body: JSON.stringify({ target: 'ConfigProtocolBot', message: '/chat-exit' }),
      expectOk: false
    });
    assert(exitedChat.ok === false && exitedChat.message.includes('退出'), `执行端退出时发送失败原因不明确：${exitedChat.message}`);
    assert(Date.now() - chatExitAt < 1000, '执行端退出后 Dashboard 没有立即结束发送等待');
    const exitedChatStatus = await requestJson(baseUrl, '/api/status');
    assert(exitedChatStatus.running === false, '发送等待期间执行端退出后 Dashboard 仍报告运行中');
  } finally {
    await stopProcess(dashboard);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function expectDashboardToHideExecutorBootstrapFailure() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-afk-bootstrap-failure-'));
  const configPath = path.join(tempRoot, 'bot.config.json');
  const examplePath = path.join(tempRoot, 'bot.config.example.json');
  const dashboardPort = 41000 + Math.floor(Math.random() * 2000);
  let dashboard = null;
  let output = '';

  try {
    fs.cpSync(path.join(projectRoot, 'src'), path.join(tempRoot, 'src'), { recursive: true });
    fs.cpSync(path.join(projectRoot, 'public'), path.join(tempRoot, 'public'), { recursive: true });
    fs.copyFileSync(path.join(projectRoot, 'package.json'), path.join(tempRoot, 'package.json'));
    fs.copyFileSync(path.join(projectRoot, 'bot.config.example.json'), examplePath);
    fs.symlinkSync(
      path.join(projectRoot, 'node_modules'),
      path.join(tempRoot, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );

    fs.writeFileSync(configPath, `${JSON.stringify(createConfig('/bootstrap-failure'), null, 2)}\n`, 'utf8');
    dashboard = spawn(process.execPath, ['src/dashboard.js'], {
      cwd: tempRoot,
      env: {
        ...process.env,
        DASHBOARD_PORT: String(dashboardPort),
        BOT_CONFIG_PATH: configPath,
        DASHBOARD_START_READY_TIMEOUT_MS: '1200'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    dashboard.stdout.on('data', (data) => { output += data.toString(); });
    dashboard.stderr.on('data', (data) => { output += data.toString(); });

    const baseUrl = `http://127.0.0.1:${dashboardPort}`;
    await waitForDashboard(baseUrl, () => output);
    fs.unlinkSync(examplePath);

    const failedStart = await requestJson(baseUrl, '/api/start', { method: 'POST', expectOk: false });
    assert(failedStart.ok === false, '执行端启动配置缺失时 Dashboard 错误返回成功');
    assert(failedStart.message.includes('bot.config.example.json'), `执行端启动失败原因不明确：${failedStart.message}`);
    await sleep(100);
    const failedStatus = await requestJson(baseUrl, '/api/status');
    assert(failedStatus.running === false, '执行端启动失败后 Dashboard 仍报告运行中');
    assert(failedStatus.starting === false, '执行端启动失败后 Dashboard 仍报告初始化中');
    assert(failedStatus.stopping === false, '执行端启动失败后 Dashboard 仍报告停止中');
    assert(!failedStatus.logs.join('\n').includes('退出码：null'), `执行端启动失败日志包含含糊退出码：\n${failedStatus.logs.join('\n')}`);

    const diagnosticText = `${failedStart.message}\n${failedStatus.logs.join('\n')}\n${output}`;
    assert(!containsInternalDiagnostic(diagnosticText), `执行端启动失败泄露了内部诊断：\n${diagnosticText}`);
    assert(diagnosticText.includes('bot.config.example.json') || diagnosticText.includes('执行端初始化'), '执行端启动失败缺少可操作中文诊断');
    assert(dashboard.exitCode === null, '执行端启动失败导致 Dashboard 退出');

    fs.copyFileSync(path.join(projectRoot, 'bot.config.example.json'), examplePath);
    const retry = await requestJson(baseUrl, '/api/start', { method: 'POST' });
    assert(retry.running === true && retry.starting === false, '恢复示例配置后 Dashboard 无法再次启动执行端');
    await requestJson(baseUrl, '/api/stop', { method: 'POST' });
    await waitForStopped(baseUrl);
  } finally {
    await stopProcess(dashboard);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function containsInternalDiagnostic(text) {
  return /file:\/\/\/|node:internal|\n\s+at\s|node:fs:|readFileUtf8|pcl-afk-bootstrap-failure-|(^|[\s'\"])[A-Za-z]:[\\/]/.test(text);
}

async function expectExecutorToReportConfigRejection() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcl-afk-config-executor-'));
  const configPath = path.join(tempDir, 'bot.config.json');
  const startRequestId = 'execution-ready-test';
  let executor = null;
  let output = '';

  try {
    fs.writeFileSync(configPath, `${JSON.stringify(createConfig('/initial'), null, 2)}\n`, 'utf8');
    executor = spawn(process.execPath, ['src/index.js'], {
      cwd: projectRoot,
      env: { ...process.env, BOT_CONFIG_PATH: configPath, DASHBOARD_START_REQUEST_ID: startRequestId },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    executor.stderr.on('data', (data) => { output += data.toString(); });
    const invalidShapeId = 'config-invalid-shape';
    const invalidShapePromise = waitForRuntimeEvent(executor, invalidShapeId, (text) => { output += text; });
    await writeJsonLine(executor.stdin, { type: 'config', requestId: invalidShapeId, config: null });
    const result = await invalidShapePromise;
    assert(output.includes(`\"type\":\"executionReady\"`) && output.includes(`\"requestId\":\"${startRequestId}\"`), '真实执行端没有返回匹配的初始化完成回执');
    assert(result.ok === false, '执行端拒绝非法实时配置时返回了成功回执');
    assert(result.message.includes('实时配置格式不正确'), `执行端拒绝原因不明确：${result.message}`);

    const invalidFeature = createConfig('/invalid-feature');
    invalidFeature.features.combat.autoAttack = 'yes';
    const invalidFeatureId = 'config-invalid-feature';
    const invalidFeaturePromise = waitForRuntimeEvent(executor, invalidFeatureId, (text) => { output += text; });
    await writeJsonLine(executor.stdin, { type: 'config', requestId: invalidFeatureId, config: invalidFeature });
    const invalidFeatureResult = await invalidFeaturePromise;
    assert(invalidFeatureResult.ok === false, '执行端错误接受了非法功能配置类型');
    assert(invalidFeatureResult.message.includes('自动攻击开关必须是真或假'), `非法功能配置拒绝原因不明确：${invalidFeatureResult.message}`);
    assert(executor.exitCode === null, '执行端拒绝非法功能配置后退出');

    const validConfigId = 'config-valid-after-rejection';
    const validConfigPromise = waitForRuntimeEvent(executor, validConfigId, (text) => { output += text; });
    await writeJsonLine(executor.stdin, { type: 'config', requestId: validConfigId, config: createConfig('/valid-after-rejection') });
    const validConfigResult = await validConfigPromise;
    assert(validConfigResult.ok === true, '执行端拒绝非法功能配置后无法应用合法配置');
  } catch (error) {
    throw new Error(`${error.message}\n执行端输出：\n${output}`);
  } finally {
    await stopProcess(executor);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function waitForRuntimeEvent(child, requestId, onOutput) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(reject, new Error('等待执行端配置拒绝回执超时')), 3000);
    const reader = createLineReader((line) => {
      onOutput(`${line}\n`);
      if (!line.startsWith('::ly-event ')) return;
      const event = JSON.parse(line.slice('::ly-event '.length));
      if (event.type !== 'configApplyResult' || event.requestId !== requestId) return;
      finish(resolve, event);
    });
    const onExit = (code) => finish(reject, new Error(`执行端在返回配置回执前退出：${code}`));
    child.stdout.on('data', reader.push);
    child.stdout.once('end', reader.end);
    child.once('exit', onExit);

    function finish(callback, value) {
      clearTimeout(timer);
      child.stdout.off('data', reader.push);
      child.stdout.off('end', reader.end);
      child.off('exit', onExit);
      callback(value);
    }
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
import fs from 'node:fs';
import readline from 'node:readline';

const startupConfig = JSON.parse(fs.readFileSync(process.env.BOT_CONFIG_PATH, 'utf8'));
const startupMarker = startupConfig.features?.chat?.presetMessagesList?.[0];
if (startupMarker === '/startup-exit') {
  setImmediate(() => process.exit(9));
} else if (startupMarker !== '/startup-ignore') {
  const ready = () => console.log('::ly-event ' + JSON.stringify({
      type: 'executionReady',
      requestId: process.env.DASHBOARD_START_REQUEST_ID,
      ok: true,
      message: '模拟执行端初始化完成。'
    }));
  if (startupMarker === '/startup-delay') setTimeout(ready, 150);
  else ready();
}

let snapshotRequests = 0;
const input = readline.createInterface({ input: process.stdin });
input.on('line', (line) => {
  const command = JSON.parse(line);
  if (command.type === 'windowSnapshot') {
    snapshotRequests += 1;
    if (snapshotRequests > 1) return;
    console.log('::ly-event ' + JSON.stringify({
      type: 'windowSnapshot',
      requestId: command.requestId,
      username: command.target,
      window: null,
      position: null,
      entities: [],
      messages: [],
      chatButtons: [],
      protocolDialogs: [],
      protocolMenu: null
    }));
    return;
  }
  if (command.type === 'chat') {
    if (command.message === '/chat-ignore') return;
    if (command.message === '/chat-exit') process.exit(8);
    const ok = command.message === '/chat-accept';
    console.log('::ly-event ' + JSON.stringify({
      type: 'chatCommandResult',
      requestId: command.requestId,
      ok,
      queuedTargets: ok ? [command.target] : [],
      failedTargets: ok ? [] : [{ username: command.target, message: '模拟执行端拒绝发送。' }],
      message: ok ? '模拟执行端已加入发送队列。' : '模拟执行端拒绝发送。'
    }));
    return;
  }
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

async function waitForStopped(baseUrl) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const status = await requestJson(baseUrl, '/api/status');
    if (!status.running && !status.starting && !status.stopping) return;
    await sleep(50);
  }
  throw new Error('等待执行端停止超时');
}

async function requestJson(baseUrl, pathname, options = {}) {
  const { expectOk = true, ...requestOptions } = options;
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...requestOptions,
    headers: { 'Content-Type': 'application/json', ...(requestOptions.headers || {}) }
  });
  const data = await response.json();
  if (expectOk && (!response.ok || data.ok === false)) throw new Error(data.message || `HTTP ${response.status}`);
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

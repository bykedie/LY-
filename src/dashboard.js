import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readJson, recoverJsonTransactions } from './json-store.js';
import { requestProcessStop, waitForProcessExit, waitForProcessSpawn } from './process-lifecycle.js';
import { writeJsonLine } from './process-ipc.js';
import { serveStaticFile } from './static-server.js';
import { createAutomationStore } from './automation-store.js';
import { createProfileStore } from './profile-store.js';
import { createLineReader } from './line-reader.js';
import { createRuntimeRequestId, createRuntimeRequestTracker } from './runtime-request-tracker.js';
import { createRuntimeSnapshot } from './runtime-snapshot.js';
import { createHttpServerOptions, listenHttpServer } from './http-server-listener.js';
import { sendApiRouteFallback } from './api-route-boundary.js';
import { readJsonRequest } from './json-request.js';
import { mergeDefaults, validateAutomationLobby, validateConfig } from './config-schema.js';
import { normalizeRuntimeChatCommand } from './runtime-chat-command.js';
import { normalizeRuntimeLobbyAction } from './runtime-lobby-action.js';
import { normalizeStartAccountNames } from './runtime-start-accounts.js';
import { normalizeSpecificRuntimeTarget } from './runtime-target.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');
const configPath = process.env.BOT_CONFIG_PATH
  ? path.resolve(process.env.BOT_CONFIG_PATH)
  : path.join(projectRoot, 'bot.config.json');
const configBaseName = path.basename(configPath, path.extname(configPath));
const profilesDir = path.join(path.dirname(configPath), `${configBaseName}.profiles`);
const recoveryDir = path.join(profilesDir, 'recovery');
const automationsPath = path.join(path.dirname(configPath), `${configBaseName}.automations.json`);
const exampleConfigPath = path.join(projectRoot, 'bot.config.example.json');
const portInput = process.env.DASHBOARD_PORT || '30123';
const port = Number(portInput);
const host = (process.env.DASHBOARD_HOST || '127.0.0.1').trim() || '127.0.0.1';
const dashboardUser = (process.env.DASHBOARD_USER || 'admin').trim() || 'admin';
const dashboardPassword = process.env.DASHBOARD_PASSWORD || '';
const executionReadyTimeoutMs = positiveNumber(process.env.DASHBOARD_START_READY_TIMEOUT_MS, 10000);

let botProcess = null;
let runningConfig = null;
let starting = false;
let stopping = false;
let logs = [];
let shuttingDown = false;
const runtimeSnapshots = new Map();
const runtimeRequests = createRuntimeRequestTracker();
const failedExecutionReadyRequests = new Set();
const defaultConfig = readJson(exampleConfigPath);
const requiredDependencyFiles = [
  'node_modules/dotenv/package.json',
  'node_modules/mineflayer/package.json',
  'node_modules/mineflayer-pathfinder/package.json'
];

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

const transactionRecovery = recoverJsonTransactions(recoveryDir, {
  allowedFiles: [configPath],
  allowedRoots: [profilesDir]
});
if (transactionRecovery.rolledBack > 0 || transactionRecovery.cleaned > 0) {
  addLog(`配置事务启动恢复完成：回滚 ${transactionRecovery.rolledBack} 个，清理 ${transactionRecovery.cleaned} 个。`);
}

const { readConfig, saveConfig, resetConfig, listProfiles, saveProfile, useProfile, deleteProfile } = createProfileStore({
  configPath,
  profilesDir,
  recoveryDir,
  defaultConfig,
  mergeDefaults,
  validateConfig,
  addLog
});

const { readAutomations, saveAutomation, deleteAutomation } = createAutomationStore({
  filePath: automationsPath,
  recoveryDir,
  validateLobby: validateAutomationLobby,
  addLog
});

function addLog(line) {
  const lines = String(line)
    .split(/\r?\n/)
    .map((item) => item.trimEnd())
    .filter(Boolean);

  for (const item of lines) {
    const hasTimestamp = /^\[\d{4}[/.-]\d{1,2}[/.-]\d{1,2}/.test(item);
    const text = hasTimestamp ? item : `[${new Date().toLocaleString()}] ${item}`;
    logs.push(text);
    console.log(text);
  }

  if (logs.length > 500) logs = logs.slice(-500);
}

function dependenciesReady() {
  return requiredDependencyFiles.every((filePath) => fs.existsSync(path.join(projectRoot, filePath)));
}

function ensureProjectDependencies() {
  if (dependenciesReady()) return;

  addLog('检测到项目依赖缺失，正在自动安装 npm 依赖...');
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['install', '--omit=dev'], {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8'
  });

  if (result.stdout) addLog(result.stdout.trimEnd());
  if (result.stderr) addLog(result.stderr.trimEnd());
  if (result.error) throw new Error(`自动安装 npm 依赖失败：${result.error.message}`);
  if (result.status !== 0) throw new Error(`自动安装 npm 依赖失败，退出码：${result.status}`);
  if (!dependenciesReady()) throw new Error('npm 依赖安装完成后仍缺少必要依赖，请在服务器执行 npm install 后重试。');

  addLog('项目依赖安装完成，继续启动挂机进程。');
}

async function startBot(startAccountNames = []) {
  if (stopping) throw new Error('挂机进程正在停止，请等待停止完成后再启动。');
  if (starting) throw new Error('挂机进程正在初始化，请等待完成后再启动。');
  if (botProcess) throw new Error('挂机进程已经运行。');

  ensureProjectDependencies();

  const config = readConfig();
  validateConfig(config);
  const selectedAccountNames = normalizeStartAccountNames(startAccountNames, config.accounts);
  runningConfig = structuredClone(config);
  if (selectedAccountNames.length > 0) {
    const selected = new Set(selectedAccountNames);
    runningConfig.accounts = runningConfig.accounts.filter((account) => selected.has(account.username));
  }
  stopping = false;
  logs = [];
  runtimeSnapshots.clear();
  const startRequestId = createRuntimeRequestId('start');
  const readyResult = runtimeRequests.wait(startRequestId, executionReadyTimeoutMs, '等待执行端初始化完成超时。');
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      BOT_CONFIG_PATH: configPath,
      START_ACCOUNT_NAMES: JSON.stringify(selectedAccountNames),
      DASHBOARD_START_REQUEST_ID: startRequestId
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  starting = true;
  botProcess = child;
  const stdoutReader = createLineReader((line) => {
    if (!line) return;
    if (!handleBotEventLine(line)) addLog(line);
  });

  child.stdout.on('data', stdoutReader.push);
  child.stdout.once('end', stdoutReader.end);
  child.stderr.on('data', (data) => addLog(data.toString().trimEnd()));
  child.stdin.on('error', (error) => addLog(`执行进程通信失败：${error.message}`));
  child.on('error', (error) => addLog(`执行进程错误：${error.message}`));
  child.on('exit', (code, signal) => {
    const exitMessage = formatProcessExit(code, signal);
    if (!failedExecutionReadyRequests.delete(startRequestId)) addLog(exitMessage);
    runtimeRequests.rejectAll(new Error(exitMessage));
    if (botProcess === child) {
      botProcess = null;
      runningConfig = null;
      starting = false;
      stopping = false;
    }
  });

  try {
    await waitForProcessSpawn(child);
  } catch (error) {
    runtimeRequests.cancel(startRequestId, error);
    readyResult.catch(() => {});
    if (botProcess === child) {
      botProcess = null;
      runningConfig = null;
      starting = false;
      stopping = false;
    }
    throw new Error(`挂机进程启动失败：${error.message}`);
  }

  try {
    await readyResult;
    if (botProcess !== child || child.exitCode !== null || child.signalCode !== null) {
      throw new Error('执行进程在初始化完成后已退出。');
    }
  } catch (error) {
    runtimeRequests.cancel(startRequestId, error);
    if (child.exitCode === null && child.signalCode === null) {
      stopping = true;
      const exited = waitForProcessExit(child, 3000);
      requestProcessStop(child, { forceAfterMs: 1000 });
      try {
        await exited;
      } catch (cleanupError) {
        addLog(`初始化失败后的执行进程清理失败：${cleanupError.message}`);
      }
    }
    if (botProcess === child && (child.exitCode !== null || child.signalCode !== null)) {
      botProcess = null;
      runningConfig = null;
      starting = false;
      stopping = false;
    }
    throw new Error(`挂机进程初始化失败：${error.message}`);
  }
  starting = false;
  addLog('挂机进程初始化完成。');
}

function handleBotEventLine(line) {
  const prefix = '::ly-event ';
  if (!line.startsWith(prefix)) return false;

  try {
    const event = JSON.parse(line.slice(prefix.length));
    if (event.type === 'windowSnapshot' && event.username) {
      if (event.requestId && event.ok === false) {
        runtimeRequests.settle(event, '窗口快照读取失败。');
      } else {
        const snapshot = createRuntimeSnapshot(event);
        runtimeSnapshots.set(event.username, snapshot);
        if (event.requestId) {
          runtimeRequests.settle({ ...event, ok: true, snapshot }, '窗口快照读取失败。');
        }
      }
    }
    if (event.type === 'lobbyActionResult' && event.requestId) {
      runtimeRequests.settle(event, '大厅动作执行失败。');
    }
    if (event.type === 'configApplyResult' && event.requestId) {
      runtimeRequests.settle(event, '实时配置应用失败。');
    }
    if (event.type === 'executionReady' && event.requestId) {
      if (event.ok === false) failedExecutionReadyRequests.add(event.requestId);
      runtimeRequests.settle(event, '执行端初始化失败。');
    }
    if (event.type === 'chatCommandResult' && event.requestId) {
      runtimeRequests.settle(event, '发送命令执行失败。');
    }
  } catch (error) {
    addLog(`解析运行事件失败：${error.message}`);
  }
  return true;
}

function stopBot() {
  if (!botProcess) throw new Error('挂机进程未启动。');
  if (stopping) return;
  stopping = true;
  requestProcessStop(botProcess);
  addLog('已发送停止指令；若 5 秒内未退出将强制停止。');
}

function shutdownDashboard(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  addLog(`管理面板收到 ${signal}，正在停止挂机进程并退出。`);
  server.close();
  runtimeRequests.rejectAll(new Error('管理面板正在退出。'));

  if (!botProcess) {
    process.exit(0);
    return;
  }

  stopping = true;
  const child = botProcess;
  child.once('exit', () => process.exit(0));
  requestProcessStop(child);
}

async function sendBotCommand(command) {
  if (!botProcess?.stdin?.writable) {
    throw new Error('挂机进程未启动。');
  }

  if (stopping) {
    throw new Error('挂机进程正在停止，不能发送新指令。');
  }
  if (starting) {
    throw new Error('挂机进程正在初始化，不能发送新指令。');
  }

  if (command.type === 'chat') command = normalizeRuntimeChatCommand(command);

  const config = runningConfig;
  if (!config) {
    throw new Error('找不到当前运行配置，请重启挂机进程。');
  }

  if (command.target && command.target !== 'all') {
    const enabledAccountNames = new Set(
      config.accounts
        .filter((account) => account.enabled !== false)
        .map((account) => account.username)
    );
    if (!enabledAccountNames.has(command.target)) {
      throw new Error(`发送目标不存在或未启用：${command.target}`);
    }
  }

  await writeJsonLine(botProcess.stdin, command);
}

async function requestWindowSnapshot(target) {
  const result = await requestBotCommandResult(
    'window',
    { type: 'windowSnapshot', target, message: '__window_snapshot__' },
    800,
    '等待执行端返回窗口快照超时。'
  );
  return result.snapshot;
}

async function requestBotCommandResult(prefix, command, timeoutMs, timeoutMessage) {
  const requestId = createRuntimeRequestId(prefix);
  const result = runtimeRequests.wait(requestId, timeoutMs, timeoutMessage);
  try {
    await sendBotCommand({ ...command, requestId });
    return await result;
  } catch (error) {
    runtimeRequests.cancel(requestId, error);
    result.catch(() => {});
    throw error;
  }
}

function getLobbyActionTimeout(action) {
  const movementEstimateMs = action?.type === 'relativeWalk'
    ? Math.max(0, Number(action.distance) || 0) * 3000
    : (action?.type === 'findEntity' ? 60000 : 0);
  const requestedMs = Math.max(
    Number(action?.delayMs) || 0,
    Number(action?.timeoutMs) || 0,
    Number(action?.responseTimeoutMs) || 0,
    Number(action?.durationMs) || 0,
    movementEstimateMs
  );
  return Math.min(300000, Math.max(15000, requestedMs + 10000));
}

async function sendRuntimeConfigUpdate(config) {
  if (!botProcess?.stdin?.writable || !runningConfig || starting || stopping) return false;

  const nextRunningConfig = {
    ...structuredClone(config),
    server: runningConfig.server,
    accounts: runningConfig.accounts
  };
  try {
    await requestBotCommandResult(
      'config',
      { type: 'config', config: nextRunningConfig },
      1500,
      '等待执行端确认实时配置超时。'
    );
  } catch (error) {
    addLog(`运行中配置实时应用失败：${error.message}`);
    return false;
  }
  runningConfig = nextRunningConfig;
  addLog('运行中配置已由执行端确认应用；服务器地址和账号列表仍需下次启动生效。');
  return true;
}

function getRunningControlState() {
  if (!runningConfig) return null;

  const chat = runningConfig.features?.chat || {};
  return {
    remoteCommand: Boolean(chat.remoteCommand),
    presetMessages: Boolean(chat.presetMessages),
    presetMessagesList: Array.isArray(chat.presetMessagesList) ? chat.presetMessagesList : [],
    accounts: Array.isArray(runningConfig.accounts)
      ? runningConfig.accounts
          .filter((account) => account.enabled !== false)
          .map((account) => ({ username: account.username }))
      : []
  };
}

function getBotProcessStatus() {
  return { running: Boolean(botProcess) && !starting && !stopping, starting: Boolean(botProcess) && starting, stopping };
}

function formatProcessExit(code, signal) {
  if (code !== null && code !== undefined) return `挂机进程已退出，退出码：${code}`;
  if (signal) return `挂机进程已退出，信号：${signal}`;
  return '挂机进程已退出。';
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

function isDashboardAuthEnabled() {
  return Boolean(dashboardPassword);
}

function isAuthorized(req) {
  if (!isDashboardAuthEnabled()) return true;

  const authHeader = req.headers.authorization || '';
  const [scheme, credentials] = authHeader.split(' ');
  if (scheme !== 'Basic' || !credentials) return false;

  try {
    const decoded = Buffer.from(credentials, 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) return false;

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);
    return username === dashboardUser && password === dashboardPassword;
  } catch {
    return false;
  }
}

function sendUnauthorized(res) {
  res.writeHead(401, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'WWW-Authenticate': 'Basic realm="LY Dashboard"'
  });
  res.end('Authentication required');
}

function requestError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

const server = http.createServer(createHttpServerOptions(), async (req, res) => {
  try {
    if (!isAuthorized(req)) {
      sendUnauthorized(res);
      return;
    }

    const url = new URL(req.url, `http://localhost:${port}`);

    if (req.method === 'GET' && url.pathname === '/api/config') {
      sendJson(res, 200, { ok: true, config: readConfig() });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/profiles') {
      sendJson(res, 200, { ok: true, ...listProfiles() });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/profiles') {
      const body = await readJsonRequest(req);
      const result = saveProfile({ id: body.id, name: body.name, config: body.config });
      const liveApplied = await sendRuntimeConfigUpdate(result.config);
      sendJson(res, 200, { ok: true, ...result, liveApplied });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/profiles/use') {
      const body = await readJsonRequest(req);
      const result = useProfile(body.id);
      const liveApplied = await sendRuntimeConfigUpdate(result.config);
      sendJson(res, 200, { ok: true, ...result, liveApplied });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/profiles/delete') {
      const body = await readJsonRequest(req);
      const result = deleteProfile(body.id);
      const liveApplied = await sendRuntimeConfigUpdate(result.config);
      sendJson(res, 200, { ok: true, ...result, liveApplied });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/automations') {
      sendJson(res, 200, { ok: true, automations: readAutomations() });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/automations') {
      const body = await readJsonRequest(req);
      sendJson(res, 200, { ok: true, ...saveAutomation(body) });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/automations/delete') {
      const body = await readJsonRequest(req);
      sendJson(res, 200, { ok: true, ...deleteAutomation(body.id) });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/config') {
      const config = await readJsonRequest(req);
      const normalizedConfig = saveConfig(config);
      const liveApplied = await sendRuntimeConfigUpdate(normalizedConfig);
      sendJson(res, 200, { ok: true, liveApplied });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/reset') {
      const config = resetConfig();
      const liveApplied = await sendRuntimeConfigUpdate(config);
      sendJson(res, 200, { ok: true, config, liveApplied });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      const processStatus = getBotProcessStatus();
      sendJson(res, 200, {
        ok: true,
        ...processStatus,
        control: processStatus.running ? getRunningControlState() : null,
        logs
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/start') {
      const body = await readJsonRequest(req, { allowEmpty: true });
      const startAccounts = body.accounts === undefined ? [] : body.accounts;
      if (!Array.isArray(startAccounts)) throw new Error('本次启动账号列表必须是数组。');
      await startBot(startAccounts);
      sendJson(res, 200, { ok: true, ...getBotProcessStatus() });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/stop') {
      stopBot();
      sendJson(res, 200, { ok: true, ...getBotProcessStatus() });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/window') {
      const target = normalizeSpecificRuntimeTarget(url.searchParams.get('target') ?? undefined, '读取窗口');
      const snapshot = await requestWindowSnapshot(target);
      sendJson(res, 200, { ok: true, ...snapshot });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/lobby/action') {
      const body = await readJsonRequest(req, { allowEmpty: true });
      const target = normalizeSpecificRuntimeTarget(body.target, '立即执行动作');
      const action = normalizeRuntimeLobbyAction(body.action);
      await requestBotCommandResult(
        'lobby',
        {
          type: 'lobbyAction',
          target,
          action,
          message: '__lobby_action__'
        },
        getLobbyActionTimeout(action),
        '等待大厅动作执行结果超时。'
      );
      const snapshot = runtimeSnapshots.get(target) || await requestWindowSnapshot(target);
      sendJson(res, 200, { ok: true, target, ...snapshot });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/send') {
      const body = await readJsonRequest(req);
      const message = body.message === undefined ? '' : body.message;
      const result = await requestBotCommandResult(
        'chat',
        { type: 'chat', target: body.target, message },
        1500,
        '等待执行端确认发送命令超时。'
      );
      sendJson(res, 200, {
        ok: true,
        queuedTargets: Array.isArray(result.queuedTargets) ? result.queuedTargets : [],
        failedTargets: Array.isArray(result.failedTargets) ? result.failedTargets : []
      });
      return;
    }

    if (sendApiRouteFallback(req, res, url.pathname)) return;
    const requestPath = decodeURIComponent(url.pathname);
    await serveStaticFile(requestPath, res, { publicDir, method: req.method });
  } catch (error) {
    sendJson(res, Number(error.statusCode) || 400, { ok: false, message: error.message });
  }
});

listenHttpServer(server, { host, port, portInput, onListening: () => {
  console.log(`管理面板已启动：http://${host}:${port}`);
} });

process.once('SIGINT', () => shutdownDashboard('SIGINT'));
process.once('SIGTERM', () => shutdownDashboard('SIGTERM'));

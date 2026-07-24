import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeDefaults, validateConfig } from './config-schema.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadExecutionConfig(configPath) {
  if (!fs.existsSync(configPath)) return null;
  const defaultFileConfig = readDefaultConfig();
  const parsedConfig = readConfigFile(configPath);
  if (!parsedConfig.server || !parsedConfig.runtime || !Array.isArray(parsedConfig.accounts)) {
    throw new Error('bot.config.json 格式不正确，请参考 bot.config.example.json。');
  }

  normalizeCoreConfig(parsedConfig);
  const fileConfig = mergeDefaults(defaultFileConfig, parsedConfig);
  validateConfig(fileConfig);
  return fileConfig;
}

function readDefaultConfig() {
  const defaultConfigPath = path.join(projectRoot, 'bot.config.example.json');
  try {
    return JSON.parse(fs.readFileSync(defaultConfigPath, 'utf8'));
  } catch {
    throw new Error('执行端默认配置 bot.config.example.json 无法读取，请确认项目文件完整后重试。');
  }
}

function readConfigFile(configPath) {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    throw new Error('bot.config.json 无法读取或不是合法 JSON，请检查配置文件后重试。');
  }
}

function normalizeCoreConfig(fileConfig) {
  if (typeof fileConfig.server.host !== 'string') {
    throw new Error('bot.config.json 里的 server.host 必须是文本。');
  }

  fileConfig.server.host = fileConfig.server.host.trim();
  if (!fileConfig.server.host) {
    throw new Error('bot.config.json 里的 server.host 不能为空。');
  }

  const port = fileConfig.server.port;
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('bot.config.json 里的 server.port 必须是 1 到 65535 之间的整数。');
  }

  if (fileConfig.server.version !== false && typeof fileConfig.server.version !== 'string') {
    throw new Error('bot.config.json 里的 server.version 必须是 false 或版本文本。');
  }

  if (typeof fileConfig.server.version === 'string') {
    fileConfig.server.version = fileConfig.server.version.trim();
    if (!fileConfig.server.version || fileConfig.server.version === 'false' || fileConfig.server.version === 'auto') {
      fileConfig.server.version = false;
    }
  }

  if (!['offline', 'microsoft'].includes(fileConfig.server.auth)) {
    throw new Error('bot.config.json 里的 server.auth 必须是 offline 或 microsoft。');
  }

  normalizeRuntimeConfig(fileConfig.runtime);
  if (fileConfig.features?.movement && typeof fileConfig.features.movement.antiAfkCommand === 'string') {
    fileConfig.features.movement.antiAfkCommand = fileConfig.features.movement.antiAfkCommand.trim();
  }
}

function normalizeRuntimeConfig(runtime) {
  requireRuntimeNumber(runtime.connectIntervalMs, 'runtime.connectIntervalMs', { min: 0 });
  requireRuntimeNumber(runtime.reconnectDelayMs, 'runtime.reconnectDelayMs', { min: 0 });
  requireRuntimeNumber(runtime.idleIntervalMs, 'runtime.idleIntervalMs', { min: 0 });
  requireRuntimeNumber(runtime.messageCooldownMs, 'runtime.messageCooldownMs', { min: 0 });

  if (typeof runtime.reconnect !== 'boolean') {
    throw new Error('bot.config.json 里的 runtime.reconnect 必须是真或假。');
  }
  if (typeof runtime.idleActions !== 'boolean') {
    throw new Error('bot.config.json 里的 runtime.idleActions 必须是真或假。');
  }
  if (typeof runtime.chatOnJoin !== 'string') {
    throw new Error('bot.config.json 里的 runtime.chatOnJoin 必须是文本。');
  }
}

function requireRuntimeNumber(value, key, options = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`bot.config.json 里的 ${key} 必须是数字。`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new Error(`bot.config.json 里的 ${key} 不能小于 ${options.min}。`);
  }
}

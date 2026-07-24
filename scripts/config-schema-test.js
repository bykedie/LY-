import fs from 'node:fs';
import path from 'node:path';
import { mergeDefaults, validateConfig } from '../src/config-schema.js';

const projectRoot = path.resolve(import.meta.dirname, '..');
const defaults = JSON.parse(fs.readFileSync(path.join(projectRoot, 'bot.config.example.json'), 'utf8'));

const partial = mergeDefaults(defaults, {
  server: { host: 'example.test' },
  extension: { enabled: true }
});
assert(partial.server.host === 'example.test', '配置合并没有保留覆盖值');
assert(partial.server.port === defaults.server.port, '配置合并没有补齐默认值');
assert(partial.extension.enabled === true, '配置合并错误删除普通未知字段');

expectFailure(() => mergeDefaults(defaults, JSON.parse('{"__proto__":{"polluted":true}}')), '不允许的字段');
expectFailure(() => mergeDefaults(defaults, { extension: { constructor: {} } }), '不允许的字段');

const deep = {};
let current = deep;
for (let depth = 0; depth < 65; depth += 1) {
  current.extension = {};
  current = current.extension;
}
expectFailure(() => mergeDefaults(defaults, deep), '不能超过 64 层');

for (const invalidValue of [true, null, '', '25565']) {
  const config = structuredClone(defaults);
  config.server.port = invalidValue;
  expectFailure(() => validateConfig(config), '服务器端口必须是数字');
}

const invalidRule = structuredClone(defaults);
invalidRule.features.chat.keywordRules = [null];
expectFailure(() => validateConfig(invalidRule), '关键词规则第 1 条必须是对象');

const valid = structuredClone(defaults);
validateConfig(valid);
assert(valid.server.port === 25565, '合法数字配置被意外修改');
const legacyAccounts = structuredClone(defaults);
legacyAccounts.accounts = [{ username: 'LegacyBot', enabled: true }];
legacyAccounts.accountPool = [{ username: 'LegacyPoolBot' }];
validateConfig(legacyAccounts);
assert(legacyAccounts.accounts[0].chatOnJoin === '', '旧账号缺失进服消息时没有补齐默认值');
assert(legacyAccounts.accounts[0].registerPassword === '', '旧账号缺失注册密码时没有补齐默认值');
assert(legacyAccounts.accountPool[0].registerPassword === '', '旧账号池缺失密码时没有补齐默认值');
console.log('config schema test ok');

function expectFailure(callback, expectedMessage) {
  try {
    callback();
  } catch (error) {
    assert(error.message.includes(expectedMessage), `错误信息不正确：${error.message}`);
    return;
  }
  throw new Error(`预期失败但实际成功：${expectedMessage}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

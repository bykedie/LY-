import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJson, writeJson } from '../src/json-store.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ly-json-store-'));

try {
  const nestedPath = path.join(tempDir, 'profiles', 'current.json');
  writeJson(nestedPath, { version: 1, accounts: ['A'] });
  assert(fs.existsSync(nestedPath), '原子 JSON 写入没有创建目标文件');
  assert(readJson(nestedPath).accounts[0] === 'A', 'JSON 写入后无法正确读取');

  writeJson(nestedPath, { version: 2, accounts: ['B'] });
  const replaced = readJson(nestedPath);
  assert(replaced.version === 2 && replaced.accounts[0] === 'B', '原子 JSON 写入没有替换旧内容');

  const leftovers = fs.readdirSync(path.dirname(nestedPath)).filter((name) => name.endsWith('.tmp'));
  assert(leftovers.length === 0, '原子 JSON 写入遗留临时文件');

  console.log('json store test ok');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

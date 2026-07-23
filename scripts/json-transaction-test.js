import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeJsonTransaction } from '../src/json-store.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ly-json-transaction-'));
try {
  const firstPath = path.join(tempDir, 'first.json');
  const secondPath = path.join(tempDir, 'second.json');
  fs.writeFileSync(firstPath, '{"value":"old-first"}\n', 'utf8');
  fs.writeFileSync(secondPath, '{"value":"old-second"}\n', 'utf8');

  let renameCount = 0;
  let failure = null;
  try {
    writeJsonTransaction([
      { filePath: firstPath, data: { value: 'new-first' } },
      { filePath: secondPath, data: { value: 'new-second' } },
      { filePath: path.join(tempDir, 'created.json'), data: { value: 'new-created' } }
    ], {
      renameSync(source, target) {
        renameCount += 1;
        if (renameCount === 4) throw new Error('injected second commit failure');
        fs.renameSync(source, target);
      }
    });
  } catch (error) {
    failure = error;
  }

  assert(failure?.message.includes('injected'), '注入的事务失败没有返回调用方');
  assert(JSON.parse(fs.readFileSync(firstPath, 'utf8')).value === 'old-first', '事务失败后第一个旧文件没有回滚');
  assert(JSON.parse(fs.readFileSync(secondPath, 'utf8')).value === 'old-second', '事务失败后第二个旧文件被破坏');
  assert(!fs.existsSync(path.join(tempDir, 'created.json')), '事务失败后新文件没有删除');
  assert(fs.readdirSync(tempDir).every((name) => !name.includes('.transaction-')), '事务失败后遗留临时或备份文件');

  const rollbackDir = path.join(tempDir, 'rollback-failure');
  fs.mkdirSync(rollbackDir);
  const rollbackFirst = path.join(rollbackDir, 'first.json');
  const rollbackSecond = path.join(rollbackDir, 'second.json');
  fs.writeFileSync(rollbackFirst, '{"value":"old-first"}\n', 'utf8');
  fs.writeFileSync(rollbackSecond, '{"value":"old-second"}\n', 'utf8');
  let rollbackRenameCount = 0;
  let rollbackFailure = null;
  try {
    writeJsonTransaction([
      { filePath: rollbackFirst, data: { value: 'new-first' } },
      { filePath: rollbackSecond, data: { value: 'new-second' } }
    ], {
      renameSync(sourcePath, targetPath) {
        rollbackRenameCount += 1;
        if (rollbackRenameCount === 4 || rollbackRenameCount === 5) throw new Error('injected rollback failure');
        fs.renameSync(sourcePath, targetPath);
      }
    });
  } catch (error) {
    rollbackFailure = error;
  }
  assert(rollbackFailure?.message.includes('回滚失败'), '回滚失败没有附加到原始错误');
  assert(fs.readdirSync(rollbackDir).some((name) => name.endsWith('.bak')), '回滚失败后恢复备份没有保留');

  writeJsonTransaction([
    { filePath: firstPath, data: { value: 'committed-first' } },
    { filePath: secondPath, data: { value: 'committed-second' } }
  ]);
  assert(JSON.parse(fs.readFileSync(firstPath, 'utf8')).value === 'committed-first', '事务成功后第一个文件未更新');
  assert(JSON.parse(fs.readFileSync(secondPath, 'utf8')).value === 'committed-second', '事务成功后第二个文件未更新');
  assert(fs.readdirSync(tempDir).every((name) => !name.includes('.transaction-')), '事务成功后遗留旧备份或临时文件');

  console.log('json transaction test ok');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

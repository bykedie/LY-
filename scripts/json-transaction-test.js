import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recoverJsonTransactions, writeJsonTransaction } from '../src/json-store.js';

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
  const rollbackRecoveryDir = path.join(rollbackDir, 'recovery');
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
      journalDir: rollbackRecoveryDir,
      renameSync(sourcePath, targetPath) {
        rollbackRenameCount += 1;
        if (rollbackRenameCount === 5 || rollbackRenameCount === 6) throw new Error('injected rollback failure');
        fs.renameSync(sourcePath, targetPath);
      }
    });
  } catch (error) {
    rollbackFailure = error;
  }
  assert(rollbackFailure?.message.includes('回滚失败'), '回滚失败没有附加到原始错误');
  assert(fs.readdirSync(rollbackDir).some((name) => name.endsWith('.bak')), '回滚失败后恢复备份没有保留');
  const retryRecovery = recoverJsonTransactions(rollbackRecoveryDir, { allowedRoots: [rollbackDir] });
  assert(retryRecovery.rolledBack === 1, '启动恢复没有重试运行中未完成的回滚');
  assert(JSON.parse(fs.readFileSync(rollbackFirst, 'utf8')).value === 'old-first', '启动恢复没有保留已回滚的第一个旧文件');
  assert(JSON.parse(fs.readFileSync(rollbackSecond, 'utf8')).value === 'old-second', '启动恢复没有还原回滚失败的第二个旧文件');
  assert(transactionArtifacts(rollbackDir).length === 0, '启动重试回滚后仍遗留事务工件');

  writeJsonTransaction([
    { filePath: firstPath, data: { value: 'committed-first' } },
    { filePath: secondPath, data: { value: 'committed-second' } }
  ], { journalDir: path.join(tempDir, 'live-journal') });
  assert(JSON.parse(fs.readFileSync(firstPath, 'utf8')).value === 'committed-first', '事务成功后第一个文件未更新');
  assert(JSON.parse(fs.readFileSync(secondPath, 'utf8')).value === 'committed-second', '事务成功后第二个文件未更新');
  assert(fs.readdirSync(tempDir).every((name) => !name.includes('.transaction-')), '事务成功后遗留旧备份或临时文件');
  assert(fs.readdirSync(path.join(tempDir, 'live-journal')).length === 0, '事务成功后遗留恢复日志');

  const crashDir = path.join(tempDir, 'crash-recovery');
  const recoveryDir = path.join(crashDir, 'recovery');
  fs.mkdirSync(recoveryDir, { recursive: true });
  const pendingId = 'pending-crash';
  const pendingFirst = path.join(crashDir, 'first.json');
  const pendingSecond = path.join(crashDir, 'second.json');
  const pendingCreated = path.join(crashDir, 'created.json');
  const pendingFirstBackup = artifactPath(pendingFirst, pendingId, 0, 'bak');
  const pendingSecondBackup = artifactPath(pendingSecond, pendingId, 1, 'bak');
  const pendingSecondTemp = artifactPath(pendingSecond, pendingId, 1, 'tmp');
  fs.writeFileSync(pendingFirst, '{"value":"old-first"}\n', 'utf8');
  fs.writeFileSync(pendingSecond, '{"value":"old-second"}\n', 'utf8');
  fs.renameSync(pendingFirst, pendingFirstBackup);
  fs.writeFileSync(pendingFirst, '{"value":"new-first"}\n', 'utf8');
  fs.renameSync(pendingSecond, pendingSecondBackup);
  fs.writeFileSync(pendingSecondTemp, '{"value":"new-second"}\n', 'utf8');
  fs.writeFileSync(pendingCreated, '{"value":"new-created"}\n', 'utf8');
  writeJournal(recoveryDir, {
    version: 1,
    id: pendingId,
    phase: 'pending',
    items: [
      journalItem(pendingFirst, pendingId, 0, true),
      journalItem(pendingSecond, pendingId, 1, true),
      journalItem(pendingCreated, pendingId, 2, false)
    ]
  });

  const pendingRecovery = recoverJsonTransactions(recoveryDir, { allowedRoots: [crashDir] });
  assert(pendingRecovery.rolledBack === 1, '启动恢复没有回滚 pending 事务');
  assert(JSON.parse(fs.readFileSync(pendingFirst, 'utf8')).value === 'old-first', 'pending 恢复没有还原第一个旧文件');
  assert(JSON.parse(fs.readFileSync(pendingSecond, 'utf8')).value === 'old-second', 'pending 恢复没有还原第二个旧文件');
  assert(!fs.existsSync(pendingCreated), 'pending 恢复没有删除事务创建的新文件');
  assert(transactionArtifacts(crashDir).length === 0, 'pending 恢复后遗留事务文件');
  assert(recoverJsonTransactions(recoveryDir, { allowedRoots: [crashDir] }).rolledBack === 0, '事务恢复重复执行不幂等');

  const committedId = 'committed-crash';
  const committedPath = path.join(crashDir, 'committed.json');
  const committedBackup = artifactPath(committedPath, committedId, 0, 'bak');
  fs.writeFileSync(committedPath, '{"value":"old"}\n', 'utf8');
  fs.renameSync(committedPath, committedBackup);
  fs.writeFileSync(committedPath, '{"value":"new"}\n', 'utf8');
  writeJournal(recoveryDir, {
    version: 1,
    id: committedId,
    phase: 'committed',
    items: [journalItem(committedPath, committedId, 0, true)]
  });
  const committedRecovery = recoverJsonTransactions(recoveryDir, { allowedRoots: [crashDir] });
  assert(committedRecovery.cleaned === 1, '启动恢复没有清理 committed 事务');
  assert(JSON.parse(fs.readFileSync(committedPath, 'utf8')).value === 'new', 'committed 恢复错误回滚了新文件');
  assert(transactionArtifacts(crashDir).length === 0, 'committed 恢复后遗留事务文件');

  const missingPendingDir = path.join(crashDir, 'missing-pending');
  fs.mkdirSync(missingPendingDir, { recursive: true });
  const missingPendingPath = path.join(crashDir, 'missing-old.json');
  writeJournal(missingPendingDir, {
    version: 1,
    id: 'missing-pending',
    phase: 'pending',
    items: [journalItem(missingPendingPath, 'missing-pending', 0, true)]
  });
  const missingPendingError = capture(() => recoverJsonTransactions(missingPendingDir, { allowedRoots: [crashDir] }));
  assert(missingPendingError?.message.includes('目标和备份均不存在'), 'pending 原文件丢失被错误报告为恢复成功');
  assert(fs.existsSync(path.join(missingPendingDir, '.json-transaction-missing-pending.journal.json')), '恢复失败后 pending 日志没有保留');

  const missingCommittedDir = path.join(crashDir, 'missing-committed');
  fs.mkdirSync(missingCommittedDir, { recursive: true });
  const missingCommittedPath = path.join(crashDir, 'missing-new.json');
  writeJournal(missingCommittedDir, {
    version: 1,
    id: 'missing-committed',
    phase: 'committed',
    items: [journalItem(missingCommittedPath, 'missing-committed', 0, false)]
  });
  const missingCommittedError = capture(() => recoverJsonTransactions(missingCommittedDir, { allowedRoots: [crashDir] }));
  assert(missingCommittedError?.message.includes('缺少目标文件'), 'committed 新文件丢失被错误报告为清理成功');
  assert(fs.existsSync(path.join(missingCommittedDir, '.json-transaction-missing-committed.journal.json')), '校验失败后 committed 日志没有保留');

  const outsidePath = path.join(tempDir, 'outside.json');
  const invalidRecoveryDir = path.join(crashDir, 'invalid-recovery');
  fs.mkdirSync(invalidRecoveryDir, { recursive: true });
  fs.writeFileSync(outsidePath, '{"value":"safe"}\n', 'utf8');
  writeJournal(invalidRecoveryDir, {
    version: 1,
    id: 'malicious',
    phase: 'pending',
    items: [journalItem(outsidePath, 'malicious', 0, true)]
  });
  const invalidError = capture(() => recoverJsonTransactions(invalidRecoveryDir, { allowedRoots: [crashDir] }));
  assert(invalidError?.message.includes('允许范围'), '事务恢复没有拒绝越界文件路径');
  assert(JSON.parse(fs.readFileSync(outsidePath, 'utf8')).value === 'safe', '越界事务日志修改了外部文件');

  const corruptRecoveryDir = path.join(crashDir, 'corrupt-recovery');
  fs.mkdirSync(corruptRecoveryDir, { recursive: true });
  fs.writeFileSync(path.join(corruptRecoveryDir, '.json-transaction-corrupt.journal.json'), '{broken', 'utf8');
  const corruptError = capture(() => recoverJsonTransactions(corruptRecoveryDir, { allowedRoots: [crashDir] }));
  assert(corruptError?.message.includes('恢复日志损坏'), '损坏事务日志被静默忽略');

  console.log('json transaction test ok');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function artifactPath(filePath, transactionId, index, extension) {
  return path.join(path.dirname(filePath), `.${path.basename(filePath)}.transaction-${transactionId}-${index}.${extension}`);
}

function journalItem(filePath, transactionId, index, hadOriginal) {
  return {
    filePath,
    tempPath: artifactPath(filePath, transactionId, index, 'tmp'),
    backupPath: artifactPath(filePath, transactionId, index, 'bak'),
    delete: false,
    hadOriginal
  };
}

function writeJournal(recoveryDir, journal) {
  fs.writeFileSync(
    path.join(recoveryDir, `.json-transaction-${journal.id}.journal.json`),
    `${JSON.stringify(journal, null, 2)}\n`,
    'utf8'
  );
}

function transactionArtifacts(rootDir) {
  return fs.readdirSync(rootDir, { recursive: true })
    .filter((name) => name.includes('.transaction-') || name.includes('.json-transaction-'));
}

function capture(operation) {
  try {
    operation();
  } catch (error) {
    return error;
  }
  return null;
}

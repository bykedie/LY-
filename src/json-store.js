import fs from 'node:fs';
import path from 'node:path';

export function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`JSON 文件损坏：${path.basename(filePath)}。原文件未修改，请恢复备份或修正 JSON 格式。`, { cause: error });
    }
    throw error;
  }
}

export function writeJson(filePath, data) {
  const directory = path.dirname(filePath);
  const tempPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.mkdirSync(directory, { recursive: true });
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    fs.renameSync(tempPath, filePath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

export function writeJsonTransaction(entries, options = {}) {
  const { journalDir, ...overrides } = options;
  const operations = { ...fs, ...overrides };
  const transactionId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const journalPath = journalDir
    ? path.join(path.resolve(journalDir), `.json-transaction-${transactionId}.journal.json`)
    : '';
  const seenPaths = new Set();
  const staged = entries.map((entry, index) => {
    const filePath = path.resolve(entry.filePath);
    if (seenPaths.has(filePath)) throw new Error(`JSON 事务包含重复路径：${filePath}`);
    seenPaths.add(filePath);
    const directory = path.dirname(filePath);
    const baseName = path.basename(filePath);
    operations.mkdirSync(directory, { recursive: true });
    return {
      filePath,
      delete: entry.delete === true,
      data: entry.data,
      tempPath: path.join(directory, `.${baseName}.transaction-${transactionId}-${index}.tmp`),
      backupPath: path.join(directory, `.${baseName}.transaction-${transactionId}-${index}.bak`),
      hadOriginal: operations.existsSync(filePath),
      backupCreated: false,
      backupRestored: false,
      targetInstalled: false
    };
  });

  let committed = false;
  let rollbackComplete = false;
  try {
    if (journalPath) {
      writeTransactionJournal(journalPath, createTransactionJournal(transactionId, 'pending', staged), operations);
    }
    for (const item of staged) {
      if (!item.delete) operations.writeFileSync(item.tempPath, `${JSON.stringify(item.data, null, 2)}\n`, 'utf8');
    }
    for (const item of staged) {
      if (item.hadOriginal) {
        operations.renameSync(item.filePath, item.backupPath);
        item.backupCreated = true;
      }
      if (!item.delete) {
        operations.renameSync(item.tempPath, item.filePath);
        item.targetInstalled = true;
      }
    }
    if (journalPath) {
      writeTransactionJournal(journalPath, createTransactionJournal(transactionId, 'committed', staged), operations);
    }
    committed = true;
  } catch (error) {
    const rollbackErrors = rollbackActiveTransaction(staged, operations);
    rollbackComplete = rollbackErrors.length === 0;
    if (rollbackErrors.length > 0) error.message += `；回滚失败：${rollbackErrors.join('；')}`;
    throw error;
  } finally {
    if (committed || rollbackComplete) {
      try {
        cleanupTransactionArtifacts(staged, operations);
        if (journalPath) operations.rmSync(journalPath, { force: true });
        if (journalPath) operations.rmSync(`${journalPath}.tmp`, { force: true });
      } catch {}
    }
  }
}

export function recoverJsonTransactions(journalDir, options = {}) {
  const { allowedRoots = [], allowedFiles = [], ...overrides } = options;
  const operations = { ...fs, ...overrides };
  const resolvedJournalDir = path.resolve(journalDir);
  const resolvedRoots = allowedRoots.map((root) => path.resolve(root));
  const resolvedFiles = new Set(allowedFiles.map((filePath) => path.resolve(filePath)));
  const result = { rolledBack: 0, cleaned: 0 };
  if (!operations.existsSync(resolvedJournalDir)) return result;

  const journalNames = operations.readdirSync(resolvedJournalDir)
    .filter((name) => /^\.json-transaction-[a-z0-9-]+\.journal\.json$/.test(name))
    .sort();
  for (const journalName of journalNames) {
    const journalPath = path.join(resolvedJournalDir, journalName);
    const journal = readTransactionJournal(journalPath, operations);
    const staged = validateTransactionJournal(journal, journalName, resolvedRoots, resolvedFiles);
    if (journal.phase === 'pending') {
      rollbackRecoveredTransaction(staged, operations);
      result.rolledBack += 1;
    } else {
      validateCommittedTransaction(staged, operations);
      result.cleaned += 1;
    }
    cleanupTransactionArtifacts(staged, operations);
    operations.rmSync(journalPath, { force: true });
    operations.rmSync(`${journalPath}.tmp`, { force: true });
  }

  for (const name of operations.readdirSync(resolvedJournalDir)) {
    if (/^\.json-transaction-[a-z0-9-]+\.journal\.json\.tmp$/.test(name)) {
      operations.rmSync(path.join(resolvedJournalDir, name), { force: true });
    }
  }
  return result;
}

function createTransactionJournal(id, phase, staged) {
  return {
    version: 1,
    id,
    phase,
    items: staged.map((item) => ({
      filePath: item.filePath,
      tempPath: item.tempPath,
      backupPath: item.backupPath,
      delete: item.delete,
      hadOriginal: item.hadOriginal
    }))
  };
}

function writeTransactionJournal(journalPath, journal, operations) {
  const tempPath = `${journalPath}.tmp`;
  operations.mkdirSync(path.dirname(journalPath), { recursive: true });
  operations.writeFileSync(tempPath, `${JSON.stringify(journal, null, 2)}\n`, 'utf8');
  operations.renameSync(tempPath, journalPath);
}

function readTransactionJournal(journalPath, operations) {
  try {
    return JSON.parse(operations.readFileSync(journalPath, 'utf8'));
  } catch (error) {
    throw new Error(`JSON 事务恢复日志损坏：${journalPath}：${error.message}`, { cause: error });
  }
}

function validateTransactionJournal(journal, journalName, allowedRoots, allowedFiles) {
  if (allowedRoots.length === 0 && allowedFiles.size === 0) throw new Error('JSON 事务恢复缺少允许范围。');
  if (!journal || typeof journal !== 'object' || Array.isArray(journal)) throw new Error('JSON 事务恢复日志格式无效。');
  if (journal.version !== 1 || !/^[a-z0-9-]+$/.test(journal.id || '')) throw new Error('JSON 事务恢复日志版本或 ID 无效。');
  if (journalName !== `.json-transaction-${journal.id}.journal.json`) throw new Error('JSON 事务恢复日志文件名与 ID 不一致。');
  if (journal.phase !== 'pending' && journal.phase !== 'committed') throw new Error('JSON 事务恢复日志阶段无效。');
  if (!Array.isArray(journal.items) || journal.items.length === 0) throw new Error('JSON 事务恢复日志没有文件条目。');

  const seenPaths = new Set();
  return journal.items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('JSON 事务恢复文件条目无效。');
    const filePath = path.resolve(String(item.filePath || ''));
    const tempPath = path.resolve(String(item.tempPath || ''));
    const backupPath = path.resolve(String(item.backupPath || ''));
    const fileAllowed = allowedFiles.has(filePath) || isInAllowedRoots(filePath, allowedRoots);
    const artifactsAllowed = [tempPath, backupPath].every((candidate) => isInAllowedRoots(candidate, allowedRoots) || path.dirname(candidate) === path.dirname(filePath));
    if (!fileAllowed || !artifactsAllowed) {
      throw new Error(`JSON 事务恢复路径超出允许范围：${filePath}`);
    }
    if (seenPaths.has(filePath)) throw new Error(`JSON 事务恢复包含重复路径：${filePath}`);
    seenPaths.add(filePath);
    const baseName = path.basename(filePath);
    const expectedTemp = path.join(path.dirname(filePath), `.${baseName}.transaction-${journal.id}-${index}.tmp`);
    const expectedBackup = path.join(path.dirname(filePath), `.${baseName}.transaction-${journal.id}-${index}.bak`);
    if (tempPath !== expectedTemp || backupPath !== expectedBackup) throw new Error('JSON 事务恢复工件路径无效。');
    if (typeof item.hadOriginal !== 'boolean' || typeof item.delete !== 'boolean') throw new Error('JSON 事务恢复文件状态无效。');
    return { filePath, tempPath, backupPath, hadOriginal: item.hadOriginal, delete: item.delete };
  });
}

function rollbackActiveTransaction(staged, operations) {
  const rollbackErrors = [];
  for (const item of [...staged].reverse()) {
    try {
      if (item.targetInstalled) operations.rmSync(item.filePath, { force: true });
      if (item.backupCreated) {
        operations.renameSync(item.backupPath, item.filePath);
        item.backupRestored = true;
      }
    } catch (rollbackError) {
      const recoveryHint = item.backupCreated && !item.backupRestored ? `；恢复备份：${item.backupPath}` : '';
      rollbackErrors.push(`${rollbackError.message}${recoveryHint}`);
    }
  }
  return rollbackErrors;
}

function rollbackRecoveredTransaction(staged, operations) {
  for (const item of [...staged].reverse()) {
    if (operations.existsSync(item.backupPath)) {
      operations.rmSync(item.filePath, { force: true });
      operations.renameSync(item.backupPath, item.filePath);
    } else if (!item.hadOriginal) {
      operations.rmSync(item.filePath, { force: true });
    } else if (!operations.existsSync(item.filePath)) {
      throw new Error(`JSON 事务无法恢复原文件，目标和备份均不存在：${item.filePath}`);
    }
    operations.rmSync(item.tempPath, { force: true });
  }
}

function validateCommittedTransaction(staged, operations) {
  for (const item of staged) {
    const targetExists = operations.existsSync(item.filePath);
    if (!item.delete && !targetExists) {
      throw new Error(`JSON 已提交事务缺少目标文件：${item.filePath}`);
    }
    if (item.delete && targetExists) {
      throw new Error(`JSON 已提交删除事务仍存在目标文件：${item.filePath}`);
    }
  }
}

function cleanupTransactionArtifacts(staged, operations) {
  for (const item of staged) {
    operations.rmSync(item.tempPath, { force: true });
    operations.rmSync(item.backupPath, { force: true });
  }
}

function isInAllowedRoots(candidatePath, allowedRoots) {
  return allowedRoots.some((root) => {
    const relativePath = path.relative(root, candidatePath);
    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
  });
}

export function backupCorruptJson(filePath, recoveryDir) {
  fs.mkdirSync(recoveryDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(recoveryDir, `${path.basename(filePath)}.${timestamp}.corrupt.bak`);
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

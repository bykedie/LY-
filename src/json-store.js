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
export function writeJsonTransaction(entries, overrides = {}) {
  const operations = { ...fs, ...overrides };
  const transactionId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
      hadOriginal: false,
      backupCreated: false,
      backupRestored: false,
      targetInstalled: false
    };
  });

  let committed = false;
  try {
    for (const item of staged) {
      if (!item.delete) operations.writeFileSync(item.tempPath, `${JSON.stringify(item.data, null, 2)}\n`, 'utf8');
    }
    for (const item of staged) {
      item.hadOriginal = operations.existsSync(item.filePath);
      if (item.hadOriginal) {
        operations.renameSync(item.filePath, item.backupPath);
        item.backupCreated = true;
      }
      if (!item.delete) {
        operations.renameSync(item.tempPath, item.filePath);
        item.targetInstalled = true;
      }
    }
    committed = true;
  } catch (error) {
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
    if (rollbackErrors.length > 0) error.message += `；回滚失败：${rollbackErrors.join('；')}`;
    throw error;
  } finally {
    for (const item of staged) {
      operations.rmSync(item.tempPath, { force: true });
      if (committed || !item.backupCreated || item.backupRestored || !operations.existsSync(item.backupPath)) {
        operations.rmSync(item.backupPath, { force: true });
      }
    }
  }
}

export function backupCorruptJson(filePath, recoveryDir) {
  fs.mkdirSync(recoveryDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(recoveryDir, `${path.basename(filePath)}.${timestamp}.corrupt.bak`);
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

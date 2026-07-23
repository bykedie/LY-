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
export function backupCorruptJson(filePath, recoveryDir) {
  fs.mkdirSync(recoveryDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(recoveryDir, `${path.basename(filePath)}.${timestamp}.corrupt.bak`);
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

import fs from 'node:fs';
import { backupCorruptJson, readJson, writeJson } from './json-store.js';

export function createAutomationStore({ filePath, recoveryDir, validateLobby, addLog = () => {} }) {
  function normalizeId(id) {
    const normalized = String(id || '').trim();
    if (/^automation-[a-z0-9-]+$/.test(normalized)) return normalized;
    throw new Error('自动化方案 ID 无效。');
  }

  function normalizeName(name) {
    const normalized = String(name || '').trim().slice(0, 60);
    if (!normalized) throw new Error('自动化方案名称不能为空。');
    return normalized;
  }

  function normalizeAutomation(item) {
    if (!isPlainObject(item)) throw new Error('自动化方案条目无效。');
    const lobby = structuredClone(item.lobby);
    validateLobby(lobby);
    return {
      id: normalizeId(item.id),
      name: normalizeName(item.name),
      lobby,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString()
    };
  }

  function readAutomations() {
    if (!fs.existsSync(filePath)) return [];
    try {
      const data = readJson(filePath);
      if (!isPlainObject(data) || !Array.isArray(data.automations)) throw new Error('自动化方案库结构无效。');
      const automations = [];
      const seenIds = new Set();
      let changed = false;
      for (const item of data.automations) {
        try {
          const automation = normalizeAutomation(item);
          if (seenIds.has(automation.id)) {
            changed = true;
            continue;
          }
          seenIds.add(automation.id);
          automations.push(automation);
        } catch {
          changed = true;
        }
      }
      if (changed) {
        const backupPath = backupCorruptJson(filePath, recoveryDir);
        addLog(`自动化方案库包含无效条目，原文件已备份到 ${backupPath}，无效条目已清理。`);
        writeJson(filePath, { version: 1, automations });
      }
      return automations;
    } catch (error) {
      if (!error.message.startsWith('JSON 文件损坏：') && error.message !== '自动化方案库结构无效。') throw error;
      const backupPath = backupCorruptJson(filePath, recoveryDir);
      addLog(`自动化方案库损坏，原文件已备份到 ${backupPath}，正在恢复为空方案库。`);
      writeJson(filePath, { version: 1, automations: [] });
      return [];
    }
  }

  function saveAutomation({ id, name, lobby }) {
    const automationId = typeof id === 'string' && id.trim() ? normalizeId(id) : createId();
    const automationName = normalizeName(name || '未命名自动化');
    const normalizedLobby = structuredClone(lobby);
    validateLobby(normalizedLobby);
    const automations = readAutomations().filter((item) => item.id !== automationId);
    automations.push({
      id: automationId,
      name: automationName,
      lobby: normalizedLobby,
      updatedAt: new Date().toISOString()
    });
    writeJson(filePath, { version: 1, automations });
    return { automations, activeAutomationId: automationId };
  }

  function deleteAutomation(id) {
    if (typeof id !== 'string' || !id.trim()) throw new Error('请选择要删除的自动化方案。');
    const automationId = normalizeId(id);
    const automations = readAutomations();
    if (!automations.some((item) => item.id === automationId)) throw new Error('找不到这个自动化方案。');
    const nextAutomations = automations.filter((item) => item.id !== automationId);
    writeJson(filePath, { version: 1, automations: nextAutomations });
    return { automations: nextAutomations };
  }

  return { readAutomations, saveAutomation, deleteAutomation };
}

function createId() {
  return `automation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

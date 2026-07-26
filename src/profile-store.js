import fs from 'node:fs';
import path from 'node:path';
import { backupCorruptJson, readJson, writeJsonTransaction } from './json-store.js';

const defaultProfileId = 'default';

export function createProfileStore({
  configPath,
  profilesDir,
  recoveryDir,
  defaultConfig,
  mergeDefaults,
  validateConfig,
  addLog = () => {}
}) {
  const profilesIndexPath = path.join(profilesDir, 'profiles.json');

  function writeConfigTransaction(entries) {
    writeJsonTransaction(entries, { journalDir: recoveryDir });
  }

  function readConfig() {
    if (!fs.existsSync(configPath)) return defaultConfig;
    return mergeDefaults(defaultConfig, readJson(configPath));
  }

  function saveConfig(config) {
    const normalizedConfig = mergeDefaults(defaultConfig, config);
    validateConfig(normalizedConfig);
    const index = ensureDefaultProfile(readProfileIndex());
    const activeId = index.activeProfileId || defaultProfileId;
    const profiles = index.profiles.map((profile) => profile.id === activeId
      ? { ...profile, updatedAt: nowIso() }
      : profile);
    writeConfigTransaction([
      { filePath: configPath, data: normalizedConfig },
      { filePath: profileConfigPath(activeId), data: normalizedConfig },
      { filePath: profilesIndexPath, data: { activeProfileId: activeId, profiles } }
    ]);
    return normalizedConfig;
  }

  function resetConfig() {
    return saveConfig(structuredClone(defaultConfig));
  }

  function normalizeProfileId(profileId) {
    if (typeof profileId !== 'string') throw new Error('配置档案 ID 必须是文本。');
    const normalized = profileId.trim();
    if (normalized === defaultProfileId || /^profile-[a-z0-9-]+$/.test(normalized)) return normalized;
    throw new Error('配置档案 ID 无效。');
  }

  function profileConfigPath(profileId) {
    return path.join(profilesDir, `${normalizeProfileId(profileId)}.json`);
  }

  function normalizeProfileName(name) {
    const normalized = String(name || '').trim().slice(0, 60);
    if (!normalized) throw new Error('配置档案名称不能为空。');
    return normalized;
  }

  function readProfileIndex() {
    fs.mkdirSync(profilesDir, { recursive: true });
    if (!fs.existsSync(profilesIndexPath)) {
      return { activeProfileId: defaultProfileId, profiles: [] };
    }

    let index;
    try {
      index = readJson(profilesIndexPath);
    } catch (error) {
      if (!error.message.startsWith('JSON 文件损坏：')) throw error;
      const backupPath = backupCorruptJson(profilesIndexPath, recoveryDir);
      addLog(`配置档案索引损坏，原文件已备份到 ${backupPath}，正在重建索引。`);
      index = { activeProfileId: defaultProfileId, profiles: [] };
    }

    const profiles = [];
    const seenIds = new Set();
    for (const profile of Array.isArray(index.profiles) ? index.profiles : []) {
      if (!profile || typeof profile !== 'object') continue;
      try {
        const id = normalizeProfileId(profile.id);
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        profiles.push({
          id,
          name: normalizeProfileName(profile.name || (id === defaultProfileId ? '当前配置' : '未命名配置')),
          updatedAt: typeof profile.updatedAt === 'string' ? profile.updatedAt : nowIso()
        });
      } catch {}
    }
    const activeProfileId = profiles.some((profile) => profile.id === index.activeProfileId)
      ? index.activeProfileId
      : defaultProfileId;
    return { activeProfileId, profiles };
  }

  function ensureDefaultProfile(index = readProfileIndex()) {
    const profiles = [...index.profiles];
    const existing = profiles.find((profile) => profile.id === defaultProfileId);
    const updatedAt = fs.existsSync(configPath) ? fs.statSync(configPath).mtime.toISOString() : nowIso();
    if (!existing) profiles.unshift({ id: defaultProfileId, name: '当前配置', updatedAt });

    const defaultPath = profileConfigPath(defaultProfileId);
    const activeProfileId = profiles.some((profile) => profile.id === index.activeProfileId)
      ? index.activeProfileId
      : defaultProfileId;
    const nextIndex = { activeProfileId, profiles };
    const entries = [{ filePath: profilesIndexPath, data: nextIndex }];
    if (!fs.existsSync(defaultPath)) entries.unshift({ filePath: defaultPath, data: readConfig() });
    writeConfigTransaction(entries);
    return nextIndex;
  }

  function listProfiles() {
    return ensureDefaultProfile(readProfileIndex());
  }

  function saveProfile({ id, name, config }) {
    const normalizedConfig = mergeDefaults(defaultConfig, config);
    validateConfig(normalizedConfig);
    const index = ensureDefaultProfile(readProfileIndex());
    const profileId = resolveSaveProfileId(id, index.profiles);
    const knownProfile = index.profiles.find((profile) => profile.id === profileId);
    const profileName = normalizeProfileName(name || knownProfile?.name);
    const profiles = index.profiles.filter((profile) => profile.id !== profileId);
    profiles.push({ id: profileId, name: profileName, updatedAt: nowIso() });
    writeConfigTransaction([
      { filePath: profileConfigPath(profileId), data: normalizedConfig },
      { filePath: configPath, data: normalizedConfig },
      { filePath: profilesIndexPath, data: { activeProfileId: profileId, profiles } }
    ]);
    return { activeProfileId: profileId, profiles, config: normalizedConfig };
  }

  function useProfile(id) {
    const index = ensureDefaultProfile(readProfileIndex());
    const profile = index.profiles.find((item) => item.id === id);
    if (!profile) throw new Error('找不到这个配置档案。');
    const config = mergeDefaults(defaultConfig, readJson(profileConfigPath(profile.id)));
    validateConfig(config);
    writeConfigTransaction([
      { filePath: configPath, data: config },
      { filePath: profilesIndexPath, data: { ...index, activeProfileId: profile.id } }
    ]);
    return { activeProfileId: profile.id, profiles: index.profiles, config };
  }

  function deleteProfile(id) {
    if (!id || id === defaultProfileId) throw new Error('默认配置档案不能删除。');
    const index = ensureDefaultProfile(readProfileIndex());
    if (!index.profiles.some((profile) => profile.id === id)) throw new Error('找不到这个配置档案。');
    const profiles = index.profiles.filter((profile) => profile.id !== id);
    const activeProfileId = index.activeProfileId === id ? defaultProfileId : index.activeProfileId;
    const config = mergeDefaults(defaultConfig, readJson(profileConfigPath(activeProfileId)));
    validateConfig(config);
    writeConfigTransaction([
      { filePath: profileConfigPath(id), delete: true },
      { filePath: configPath, data: config },
      { filePath: profilesIndexPath, data: { activeProfileId, profiles } }
    ]);
    return { activeProfileId, profiles, config };
  }

  return { readConfig, saveConfig, resetConfig, listProfiles, saveProfile, useProfile, deleteProfile };
}

function resolveSaveProfileId(id, profiles) {
  if (id === undefined || (typeof id === 'string' && !id.trim())) return createProfileId();
  if (typeof id !== 'string') throw new Error('配置档案 ID 必须是文本。');
  const normalized = id.trim();
  if (normalized !== defaultProfileId && !/^profile-[a-z0-9-]+$/.test(normalized)) {
    throw new Error('配置档案 ID 无效。');
  }
  if (!profiles.some((profile) => profile.id === normalized)) throw new Error('找不到这个配置档案。');
  return normalized;
}

function createProfileId() {
  return `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

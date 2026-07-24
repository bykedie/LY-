export function normalizeStartAccountNames(startAccountNames, accounts) {
  if (!Array.isArray(startAccountNames) || startAccountNames.length === 0) return [];

  const enabledAccounts = new Set(
    accounts
      .filter((account) => account.enabled !== false)
      .map((account) => account.username)
  );
  const selected = [...new Set(startAccountNames.map(normalizeStartAccountName).filter(Boolean))];
  const invalid = selected.filter((name) => !enabledAccounts.has(name));
  if (invalid.length > 0) throw new Error(`启动账号不存在或未启用：${invalid.join(', ')}`);
  if (selected.length === 0) throw new Error('至少需要选择一个启动账号。');
  return selected;
}

function normalizeStartAccountName(name) {
  if (typeof name !== 'string') throw new Error('本次启动账号名称必须是文本。');
  return name.trim();
}

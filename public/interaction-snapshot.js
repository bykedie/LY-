const SUPPORTED_CHAT_ACTIONS = new Set(['run_command', 'suggest_command']);

export function createInteractionSnapshotModel(snapshot = {}) {
  const options = [];
  const notices = [];

  for (const button of Array.isArray(snapshot.chatButtons) ? snapshot.chatButtons : []) {
    const action = String(button?.action || '').trim();
    const value = String(button?.value || '').trim();
    if (!action || !value) continue;
    options.push({
      kind: 'chat',
      label: String(button.label || value).trim() || value,
      action,
      value,
      supported: SUPPORTED_CHAT_ACTIONS.has(action)
    });
  }

  const npcDialog = snapshot.npcDialog;
  if (npcDialog && Number.isInteger(npcDialog.dialogId)) {
    for (const option of Array.isArray(npcDialog.options) ? npcDialog.options : []) {
      if (!Number.isInteger(option?.optionId)) continue;
      options.push({
        kind: 'customNpcs',
        label: String(option.title || `选项 ${option.optionId}`).trim(),
        supported: option.optionType !== 2,
        dialogId: npcDialog.dialogId,
        optionId: option.optionId,
        optionType: option.optionType,
        nextDialogId: option.nextDialogId,
        command: option.command || ''
      });
    }
    if (npcDialog.resolved === false) {
      notices.push(`检测到 CustomNPCs 对话 ID ${npcDialog.dialogId}，但尚未收到对应同步定义，无法安全构造选项。`);
    } else if (!npcDialog.options?.length) {
      notices.push(`CustomNPCs 对话 ID ${npcDialog.dialogId} 已解析，但没有可显示的对话选项。`);
    }
  } else {
    const unresolved = (Array.isArray(snapshot.protocolDialogs) ? snapshot.protocolDialogs : [])
      .findLast((item) => String(item?.channel || '').toLowerCase() === 'customnpcs' && item.packetType === 'DIALOG');
    if (unresolved && Number.isInteger(unresolved.dialogId)) {
      notices.push(`检测到 CustomNPCs 对话 ID ${unresolved.dialogId}，但快照中没有同步定义，无法安全构造选项。`);
    }
  }

  const unsupportedCount = options.filter((option) => !option.supported).length;
  if (unsupportedCount > 0) notices.push(`另有 ${unsupportedCount} 个协议选项当前只能显示，不能自动执行。`);

  return { options: deduplicateOptions(options), notices };
}

export function createOperateWindowEntries(windowItems = [], interactionModel = { options: [] }) {
  const windowEntries = windowItems.map((slot) => ({
    id: `window:${slot.protocolEntry ? 1 : 0}:${slot.slot}`,
    kind: 'window',
    label: String(slot.displayName || slot.name || `槽位 ${slot.slot}`),
    slot: slot.slot,
    protocolEntry: slot.protocolEntry === true,
    lore: Array.isArray(slot.lore) ? slot.lore : [],
    supported: true
  }));
  const interactionEntries = interactionModel.options.map((option) => ({
    ...option,
    id: option.kind === 'chat'
      ? `chat:${option.action}:${option.value}`
      : `customNpcs:${option.dialogId}:${option.optionId}`
  }));
  return [...windowEntries, ...interactionEntries];
}

export function createOperateWindowAction(entry, defaults = {}) {
  if (!entry) return { type: 'operateWindow', enabled: true, ...defaults };
  if (entry.kind === 'chat') {
    return { type: 'clickChat', chatButton: entry.label, timeoutMs: defaults.timeoutMs, enabled: true };
  }
  if (entry.kind === 'customNpcs') {
    return { type: 'clickNpcDialog', dialogId: entry.dialogId, optionId: entry.optionId, enabled: true };
  }
  return {
    type: 'operateWindow',
    title: defaults.title || '',
    item: entry.label,
    slot: entry.slot,
    protocolEntry: entry.protocolEntry === true,
    button: defaults.button || 'left',
    count: defaults.count || 1,
    timeoutMs: defaults.timeoutMs,
    enabled: true
  };
}

export function createOperateWindowEntryFromAction(action = {}) {
  if (action.type === 'clickChat' && action.chatButton) {
    return { id: `saved:chat:${action.chatButton}`, kind: 'chat', label: action.chatButton, supported: true };
  }
  if (action.type === 'clickNpcDialog' && Number.isInteger(action.dialogId) && Number.isInteger(action.optionId)) {
    return {
      id: `customNpcs:${action.dialogId}:${action.optionId}`,
      kind: 'customNpcs',
      label: `对话 ${action.dialogId} / 选项 ${action.optionId}`,
      dialogId: action.dialogId,
      optionId: action.optionId,
      supported: true
    };
  }
  if (action.type === 'operateWindow' && (Number.isInteger(action.slot) || action.item)) {
    return {
      id: `window:${action.protocolEntry ? 1 : 0}:${action.slot ?? 'saved'}`,
      kind: 'window',
      label: action.item || `槽位 ${action.slot}`,
      slot: action.slot,
      protocolEntry: action.protocolEntry === true,
      supported: true
    };
  }
  return null;
}

function deduplicateOptions(options) {
  const seen = new Set();
  return options.filter((option) => {
    const key = option.kind === 'chat'
      ? `${option.kind}:${option.action}:${option.value}`
      : `${option.kind}:${option.dialogId}:${option.optionId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

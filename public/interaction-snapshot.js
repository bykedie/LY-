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

export function renderInteractionSnapshot(model, { list, notice, onChat, onCustomNpcs }) {
  if (!list || !notice) return;
  list.innerHTML = '';
  notice.innerHTML = '';
  list.hidden = model.options.length === 0;
  notice.hidden = model.notices.length === 0;

  for (const text of model.notices) {
    const item = document.createElement('p');
    item.textContent = text;
    notice.appendChild(item);
  }
  for (const option of model.options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `interaction-option is-${option.kind}`;
    button.disabled = !option.supported;
    const source = option.kind === 'chat' ? `聊天 ${option.action}` : `CustomNPCs 选项 ${option.optionId}`;
    button.innerHTML = `<strong>${escapeHtml(option.label)}</strong><span>${escapeHtml(source)}</span>`;
    button.title = option.supported ? `选择：${option.label}` : `当前不支持自动执行：${source}`;
    if (option.supported) {
      button.addEventListener('click', () => {
        if (option.kind === 'chat') onChat?.(option);
        else onCustomNpcs?.(option);
      });
    }
    list.appendChild(button);
  }
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

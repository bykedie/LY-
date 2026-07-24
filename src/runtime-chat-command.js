export function normalizeRuntimeChatCommand(command) {
  return {
    ...command,
    target: normalizeChatTarget(command.target),
    message: normalizeChatMessage(command.message)
  };
}

function normalizeChatTarget(target) {
  if (target === undefined) return 'all';
  if (typeof target !== 'string') throw new Error('发送目标必须是文本。');
  return target.trim() || 'all';
}

function normalizeChatMessage(message) {
  if (typeof message !== 'string') throw new Error('发送内容必须是文本。');
  const normalized = message.trim();
  if (!normalized) throw new Error('发送内容不能为空。');
  return normalized;
}

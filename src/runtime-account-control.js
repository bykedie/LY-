export function stopRuntimeAccount(username, options) {
  const activeAccountNames = options.activeAccountNames || [];
  if (!activeAccountNames.includes(username)) throw new Error(`找不到当前运行账号：${username}`);

  const session = options.sessions.get(username);
  if (session) {
    session.stopped = true;
    session.reconnecting = false;
    clearTimeout(session.reconnectTimer);
    options.stopFeatureWorkers(username);
    const bot = session.bot;
    session.bot = null;
    options.clearConnectionSnapshot(session);
    options.emitWindowSnapshot(username);
    bot?.quit();
  }
  return activeAccountNames.filter((name) => name !== username);
}

export function handleStopRuntimeAccountCommand(command, options) {
  try {
    const username = String(command.target || '').trim();
    const activeAccountNames = stopRuntimeAccount(username, options);
    options.log(username, '已按网页指令停止挂机，不再自动重连。');
    options.emitRuntimeEvent({ type: 'accountStopResult', requestId: command.requestId, username, ok: true });
    return activeAccountNames;
  } catch (error) {
    options.emitRuntimeEvent({ type: 'accountStopResult', requestId: command.requestId, ok: false, message: error.message });
    return options.activeAccountNames;
  }
}

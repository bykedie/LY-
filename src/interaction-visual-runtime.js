import { selectCustomNpcsDialogOption } from './custom-npcs-protocol.js';
import { normalizeInteractionVisualClick, resolveInteractionVisualClick } from './interaction-visual.js';

export async function runInteractionVisualClick(command, context) {
  const username = String(command?.target || '');
  const requestId = String(command?.requestId || '');
  const session = context.sessions.get(username);
  let claimed = false;
  try {
    if (!session?.bot?.entity) throw new Error(`账号未在线：${username}`);
    if (session.manualLobbyActionRunning) throw new Error('上一个网页即时动作仍在执行。');
    session.manualLobbyActionRunning = true;
    claimed = true;

    const click = normalizeInteractionVisualClick(command.click);
    const visual = context.getInteractionVisual(session);
    const resolved = resolveInteractionVisualClick(visual, click);
    session.interactionVisualSelection = resolved.selection;
    const result = await executeResolvedAction(username, session, resolved.action, click.button, context);
    if (result.executed) await delay(300);
    context.emitWindowSnapshot(username);
    context.log(username, result.message);
    context.emitRuntimeEvent({
      type: 'interactionVisualClickResult',
      requestId,
      username,
      ok: true,
      executed: result.executed,
      selection: resolved.selection,
      message: result.message
    });
  } catch (error) {
    context.emitWindowSnapshot(username);
    context.log(username || null, `界面选点执行失败：${error.message}`);
    context.emitRuntimeEvent({
      type: 'interactionVisualClickResult',
      requestId,
      username,
      ok: false,
      executed: false,
      message: error.message
    });
  } finally {
    if (claimed) session.manualLobbyActionRunning = false;
  }
}

async function executeResolvedAction(username, session, action, button, context) {
  if (!action) {
    return notExecuted('选点已保存，但当前协议没有可安全执行的控件动作。');
  }
  if (action.kind === 'windowSlot') {
    const window = session.bot.currentWindow || session.lastWindow;
    if (!window) throw new Error('选点对应的标准窗口已经关闭，请刷新后重试。');
    await session.bot.clickWindow(action.slot, button === 'right' ? 1 : 0, 0);
    return {
      executed: true,
      message: `界面选点：${button === 'right' ? '右键' : '左键'}点击真实窗口槽位 ${action.slot}`
    };
  }
  if (action.kind === 'customNpcs') {
    if (button !== 'left') return notExecuted('选点已保存；CustomNPCs 选择协议不支持右键，请改用左键。');
    const result = selectCustomNpcsDialogOption(session.customNpcs, session.bot._client, action.dialogId, action.optionId);
    return { executed: true, message: `界面选点：选择 CustomNPCs 对话 ${result.dialogId} 的选项 ${result.optionId} ${result.option.title}` };
  }
  if (action.kind === 'chat') {
    if (button !== 'left') return notExecuted('选点已保存；聊天 clickEvent 不支持右键，请改用左键。');
    if (!['run_command', 'suggest_command'].includes(action.action) || !action.value) {
      return notExecuted(`选点已保存；聊天按钮动作不支持自动执行：${action.action || '未知动作'}`);
    }
    context.enqueueChat(username, action.value, `界面选点：点击聊天按钮 ${action.label || action.value}`);
    return { executed: true, message: `界面选点：已执行聊天按钮 ${action.label || action.value}` };
  }
  if (action.kind === 'dragoncore') {
    return notExecuted('选点已保存；DragonCore 真实点击需要 GUI 路径、动作名和组件 key，当前载荷不足，未伪造执行成功。');
  }
  return notExecuted(`选点已保存；暂不支持该界面动作：${action.kind || '未知协议'}`);
}

function notExecuted(message) {
  return { executed: false, message };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

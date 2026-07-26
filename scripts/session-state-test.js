import { clearConnectionSnapshot, createSessionState } from '../src/session-state.js';

const session = createSessionState();
assert(session.bot === null, '新会话的机器人实例必须为空');
assert(Array.isArray(session.schedulerTimers) && session.schedulerTimers.length === 0, '新会话的定时任务列表不正确');
assert(Array.isArray(session.recentMessages) && session.recentMessages.length === 0, '新会话的消息快照不正确');

let windowTimerFired = false;
let protocolTimerFired = false;
session.antiAfkOrigin = { x: 1, y: 64, z: 1 };
session.lastWindow = { title: 'old window' };
session.lastWindowOpenedAt = Date.now();
session.windowLogTimer = setTimeout(() => { windowTimerFired = true; }, 10);
session.lastWindowLogSignature = 'old-window';
session.recentMessages = [{ text: 'old message' }];
session.chatButtons = [{ label: 'old button' }];
session.protocolDialogs = [{ text: 'old dialog' }];
session.protocolMenu = { title: 'old menu' };
session.customNpcs.dialogs.set(77, { dialogId: 77 });
session.customNpcs.pendingDialogs = new Map([[88, { dialogId: 88 }]]);
session.customNpcs.currentDialog = { dialogId: 77, options: [] };
session.protocolMenuLogTimer = setTimeout(() => { protocolTimerFired = true; }, 10);
session.lastProtocolMenuLogSignature = 'old-menu';
session.lastProtocolDialogSignature = 'old-dialog';
session.lastProtocolDialogAt = Date.now();

clearConnectionSnapshot(session);
await new Promise((resolve) => setTimeout(resolve, 25));

assert(session.antiAfkOrigin === null, '断线后没有清理防挂机原点');
assert(session.lastWindow === null && session.lastWindowOpenedAt === 0, '断线后没有清理窗口快照');
assert(session.windowLogTimer === null && !windowTimerFired, '断线后窗口日志定时器仍在运行');
assert(session.lastWindowLogSignature === '', '断线后没有清理窗口日志签名');
assert(session.recentMessages.length === 0, '断线后没有清理最近消息');
assert(session.chatButtons.length === 0, '断线后没有清理聊天按钮');
assert(session.protocolDialogs.length === 0, '断线后没有清理协议对话');
assert(session.protocolMenu === null, '断线后没有清理协议菜单');
assert(session.customNpcs.dialogs.size === 0, '断线后没有清理 CustomNPCs 同步对话定义');
assert(session.customNpcs.pendingDialogs === null && session.customNpcs.currentDialog === null, '断线后没有清理 CustomNPCs 当前对话状态');
assert(session.protocolMenuLogTimer === null && !protocolTimerFired, '断线后协议菜单定时器仍在运行');
assert(session.lastProtocolMenuLogSignature === '', '断线后没有清理协议菜单签名');
assert(session.lastProtocolDialogSignature === '' && session.lastProtocolDialogAt === 0, '断线后没有清理协议对话签名');
console.log('session state test ok');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

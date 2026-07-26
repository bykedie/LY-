import { clearCustomNpcsProtocolState, createCustomNpcsProtocolState } from './custom-npcs-protocol.js';

export function createSessionState() {
  return {
    bot: null,
    idleTimer: null,
    antiAfkOrigin: null,
    attackTimer: null,
    eatTimer: null,
    schedulerTimers: [],
    lobbyTimer: null,
    lastWindow: null,
    lastWindowOpenedAt: 0,
    windowLogTimer: null,
    lastWindowLogSignature: '',
    recentMessages: [],
    chatButtons: [],
    protocolDialogs: [],
    protocolMenu: null,
    interactionVisualSelection: null,
    customNpcs: createCustomNpcsProtocolState(),
    protocolMenuLogTimer: null,
    lastProtocolMenuLogSignature: '',
    lastProtocolDialogSignature: '',
    lastProtocolDialogAt: 0,
    chatQueue: [],
    chatQueueTimer: null,
    lastChatAt: 0,
    fishing: false,
    loginCommandSent: false,
    loginSuccessDetected: false,
    registerSingleCommandSent: false,
    registerConfirmCommandSent: false,
    manualLobbyActionRunning: false,
    reconnectTimer: null,
    reconnecting: false,
    stopped: false
  };
}

export function clearConnectionSnapshot(session) {
  session.antiAfkOrigin = null;
  session.lastWindow = null;
  session.lastWindowOpenedAt = 0;
  clearTimeout(session.windowLogTimer);
  session.windowLogTimer = null;
  session.lastWindowLogSignature = '';
  session.recentMessages = [];
  session.chatButtons = [];
  session.protocolDialogs = [];
  session.protocolMenu = null;
  session.interactionVisualSelection = null;
  clearCustomNpcsProtocolState(session.customNpcs);
  clearTimeout(session.protocolMenuLogTimer);
  session.protocolMenuLogTimer = null;
  session.lastProtocolMenuLogSignature = '';
  session.lastProtocolDialogSignature = '';
  session.lastProtocolDialogAt = 0;
}

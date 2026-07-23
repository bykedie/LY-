export function createRuntimeSnapshot(event = {}) {
  return {
    window: event.window || null,
    position: event.position || null,
    entities: Array.isArray(event.entities) ? event.entities : [],
    messages: Array.isArray(event.messages) ? event.messages : [],
    chatButtons: Array.isArray(event.chatButtons) ? event.chatButtons : [],
    protocolDialogs: Array.isArray(event.protocolDialogs) ? event.protocolDialogs : [],
    protocolMenu: event.protocolMenu || null
  };
}

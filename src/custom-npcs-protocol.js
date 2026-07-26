import { gunzipSync } from 'node:zlib';
import nbt from 'prismarine-nbt';

const CLIENT_PACKETS = [
  'CHAT', 'MESSAGE', 'DIALOG', 'QUEST_COMPLETION', 'EDIT_NPC', 'PLAY_SOUND', 'PLAY_MUSIC', 'UPDATE_NPC',
  'ROLE', 'GUI', 'PARTICLE', 'DELETE_ENTITY', 'SCROLL_LIST', 'SCROLL_DATA', 'SCROLL_DATA_PART', 'SCROLL_SELECTED',
  'GUI_DATA', 'GUI_ERROR', 'GUI_CLOSE', 'VILLAGER_LIST', 'CHATBUBBLE', 'CLONE', 'DIALOG_DUMMY', 'CONFIG',
  'EYE_BLINK', 'SYNC_ADD', 'SYNC_END', 'SYNC_UPDATE', 'SYNC_REMOVE', 'MARK_DATA', 'UPDATE_ITEM', 'GUI_UPDATE',
  'CHEST_NAME'
];

export function createCustomNpcsProtocolState() {
  return { dialogs: new Map(), pendingDialogs: null, currentDialog: null };
}

export function clearCustomNpcsProtocolState(state) {
  state.dialogs.clear();
  state.pendingDialogs = null;
  state.currentDialog = null;
}

export function handleCustomNpcsPayload(state, channel, input) {
  if (String(channel || '').toLowerCase() !== 'customnpcs') return null;
  const data = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  if (data.length < 4) return { packetType: 'INVALID', error: 'CustomNPCs 载荷长度不足。' };

  const packetIndex = data.readInt32BE(0);
  const packetType = CLIENT_PACKETS[packetIndex] || `UNKNOWN_${packetIndex}`;
  try {
    if (packetType === 'DIALOG') return openDialog(state, channel, data);
    if (packetType === 'SYNC_ADD' || packetType === 'SYNC_END') {
      return applySyncBatch(state, packetType, data);
    }
    if (packetType === 'SYNC_UPDATE') return applySyncUpdate(state, data);
    if (packetType === 'SYNC_REMOVE') return applySyncRemove(state, data);
    return { packetType };
  } catch (error) {
    return { packetType, error: error.message, sync: packetType.startsWith('SYNC_'), changed: false };
  }
}

export function getCustomNpcsDialogSnapshot(state) {
  const dialog = state?.currentDialog;
  if (!dialog) return null;
  return { ...dialog, options: dialog.options.map((option) => ({ ...option })) };
}

export function createCustomNpcsDialogChoicePacket(dialogId, optionId) {
  if (!Number.isInteger(dialogId) || dialogId < 0) throw new Error('CustomNPCs 对话 ID 必须是非负整数。');
  if (!Number.isInteger(optionId) || optionId < 0) throw new Error('CustomNPCs 选项 ID 必须是非负整数。');
  const data = Buffer.alloc(12);
  data.writeInt32BE(7, 0);
  data.writeInt32BE(dialogId, 4);
  data.writeInt32BE(optionId, 8);
  return data;
}

export function selectCustomNpcsDialogOption(state, client, dialogIdInput, optionIdInput) {
  const dialogId = Number(dialogIdInput);
  const optionId = Number(optionIdInput);
  const dialog = state?.currentDialog;
  if (!dialog || dialog.dialogId !== dialogId) throw new Error(`当前没有 CustomNPCs 对话：${dialogId}`);
  const option = dialog.options.find((item) => item.optionId === optionId);
  if (!option || option.optionType === 2) throw new Error(`当前 CustomNPCs 对话没有可执行选项：${optionId}`);
  client.write('custom_payload', {
    channel: 'CustomNPCsPlayer',
    data: createCustomNpcsDialogChoicePacket(dialogId, optionId)
  });
  state.currentDialog = null;
  return { dialogId, optionId, option };
}

function openDialog(state, channel, data) {
  if (data.length < 12) throw new Error('CustomNPCs DIALOG 载荷长度不足。');
  const entityId = data.readInt32BE(4);
  const dialogId = data.readInt32BE(8);
  const definition = state.dialogs.get(dialogId);
  state.currentDialog = definition
    ? { ...definition, channel, entityId, resolved: true, at: Date.now(), options: definition.options.map((option) => ({ ...option })) }
    : { channel, entityId, dialogId, title: '', text: '', resolved: false, at: Date.now(), options: [] };
  return { packetType: 'DIALOG', entityId, dialogId, dialog: state.currentDialog };
}

function applySyncBatch(state, packetType, data) {
  if (data.length < 12) throw new Error(`CustomNPCs ${packetType} 载荷长度不足。`);
  const syncType = data.readInt32BE(4);
  if (syncType !== 5) return { packetType, syncType, sync: true, changed: false };
  const value = readCompressedNbt(data, 8);
  if (packetType === 'SYNC_ADD') {
    state.pendingDialogs ||= new Map();
    collectDialogs(value, state.pendingDialogs);
    return { packetType, syncType, sync: true, changed: false };
  }
  const nextDialogs = state.pendingDialogs || new Map();
  collectDialogs(value, nextDialogs);
  state.dialogs = nextDialogs;
  state.pendingDialogs = null;
  return { packetType, syncType, sync: true, changed: true, dialogCount: state.dialogs.size };
}

function applySyncUpdate(state, data) {
  if (data.length < 12) throw new Error('CustomNPCs SYNC_UPDATE 载荷长度不足。');
  const syncType = data.readInt32BE(4);
  if (syncType !== 4 && syncType !== 5) return { packetType: 'SYNC_UPDATE', syncType, sync: true, changed: false };
  const value = readCompressedNbt(data, 8);
  const dialogs = new Map();
  collectDialogs(value, dialogs);
  for (const [dialogId, dialog] of dialogs) state.dialogs.set(dialogId, dialog);
  return { packetType: 'SYNC_UPDATE', syncType, sync: true, changed: dialogs.size > 0, dialogCount: state.dialogs.size };
}

function applySyncRemove(state, data) {
  if (data.length < 12) throw new Error('CustomNPCs SYNC_REMOVE 载荷长度不足。');
  const syncType = data.readInt32BE(4);
  const id = data.readInt32BE(8);
  const changed = syncType === 4 ? state.dialogs.delete(id) : false;
  if (state.currentDialog?.dialogId === id) state.currentDialog = null;
  return { packetType: 'SYNC_REMOVE', syncType, sync: true, changed };
}

function readCompressedNbt(data, offset) {
  const size = data.readInt32BE(offset);
  const start = offset + 4;
  if (size < 0 || size > 2 * 1024 * 1024 || start + size > data.length) {
    throw new Error(`CustomNPCs NBT 长度无效：${size}。`);
  }
  const parsed = nbt.parseUncompressed(gunzipSync(data.subarray(start, start + size)), 'big');
  return nbt.simplify(parsed);
}

function collectDialogs(value, output) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectDialogs(item, output));
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Number.isInteger(value.DialogId)) {
    const dialog = normalizeDialog(value);
    output.set(dialog.dialogId, dialog);
    return;
  }
  Object.values(value).forEach((item) => collectDialogs(item, output));
}

function normalizeDialog(value) {
  const options = (Array.isArray(value.Options) ? value.Options : [])
    .map((entry) => normalizeOption(entry))
    .filter(Boolean)
    .sort((left, right) => left.optionId - right.optionId);
  return {
    dialogId: value.DialogId,
    title: String(value.DialogTitle || ''),
    text: String(value.DialogText || ''),
    options
  };
}

function normalizeOption(entry) {
  const optionId = Number(entry?.OptionSlot);
  const option = entry?.Option;
  if (!Number.isInteger(optionId) || optionId < 0 || !option || typeof option !== 'object') return null;
  return {
    optionId,
    title: String(option.Title || `选项 ${optionId}`),
    optionType: Number.isInteger(option.OptionType) ? option.OptionType : 0,
    nextDialogId: Number.isInteger(option.Dialog) ? option.Dialog : -1,
    color: Number.isInteger(option.DialogColor) ? option.DialogColor : 0,
    command: String(option.DialogCommand || '')
  };
}

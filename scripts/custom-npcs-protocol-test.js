import { gzipSync } from 'node:zlib';
import nbt from 'prismarine-nbt';
import {
  createCustomNpcsDialogChoicePacket,
  createCustomNpcsProtocolState,
  getCustomNpcsDialogSnapshot,
  handleCustomNpcsPayload,
  selectCustomNpcsDialogOption
} from '../src/custom-npcs-protocol.js';

const state = createCustomNpcsProtocolState();
const dialog = nbt.comp({
  DialogId: nbt.int(77),
  DialogTitle: nbt.string('新手向导'),
  DialogText: nbt.string('请选择下一步'),
  Options: nbt.list(nbt.comp([
    {
      OptionSlot: nbt.int(2),
      Option: nbt.comp({
        Title: nbt.string('领取新手礼包'),
        OptionType: nbt.int(0),
        Dialog: nbt.int(-1),
        DialogColor: nbt.int(14737632),
        DialogCommand: nbt.string('')
      })
    }
  ]))
});
const category = nbt.comp({ Dialogs: nbt.list(nbt.comp([dialog.value])) });

const addResult = handleCustomNpcsPayload(state, 'CustomNPCs', createSyncPacket(25, category));
assert(addResult.sync === true && addResult.changed === false, 'SYNC_ADD 没有进入待完成同步状态');
const endResult = handleCustomNpcsPayload(state, 'CustomNPCs', createSyncPacket(26, nbt.comp({})));
assert(endResult.changed === true && endResult.dialogCount === 1, 'SYNC_END 没有提交同步对话定义');

const dialogResult = handleCustomNpcsPayload(state, 'CustomNPCs', createDialogPacket(9102, 77));
assert(dialogResult.dialog?.resolved === true, 'DIALOG 没有匹配同步定义');
const snapshot = getCustomNpcsDialogSnapshot(state);
assert(snapshot.title === '新手向导' && snapshot.text === '请选择下一步', '对话标题或正文解析错误');
assert(snapshot.options[0]?.optionId === 2 && snapshot.options[0]?.title === '领取新手礼包', '对话选项解析错误');

const writes = [];
const selected = selectCustomNpcsDialogOption(state, { write: (name, packet) => writes.push({ name, packet }) }, 77, 2);
assert(selected.option.title === '领取新手礼包', '选择结果缺少真实选项');
assert(writes[0]?.name === 'custom_payload' && writes[0]?.packet.channel === 'CustomNPCsPlayer', '选择包频道错误');
assert(writes[0].packet.data.equals(createCustomNpcsDialogChoicePacket(77, 2)), '选择包编号内容错误');
assert(state.currentDialog === null, '选择后没有清理当前对话，可能重复点击旧选项');

handleCustomNpcsPayload(state, 'CustomNPCs', createDialogPacket(9102, 77));
assertThrows(
  () => selectCustomNpcsDialogOption(state, { write: () => { throw new Error('write failed'); } }, 77, 2),
  'write failed',
  '协议发送失败没有返回底层错误'
);
assert(state.currentDialog?.dialogId === 77, '协议发送失败后错误清理了当前对话，无法重试');

const malformed = handleCustomNpcsPayload(state, 'CustomNPCs', Buffer.from([0, 0, 0, 25]));
assert(malformed.sync === true && malformed.error, '损坏同步包没有安全降级为诊断');

console.log('custom npcs protocol test ok');

function createSyncPacket(packetType, compound) {
  const compressed = gzipSync(nbt.writeUncompressed(compound));
  const data = Buffer.alloc(12 + compressed.length);
  data.writeInt32BE(packetType, 0);
  data.writeInt32BE(5, 4);
  data.writeInt32BE(compressed.length, 8);
  compressed.copy(data, 12);
  return data;
}

function createDialogPacket(entityId, dialogId) {
  const data = Buffer.alloc(12);
  data.writeInt32BE(2, 0);
  data.writeInt32BE(entityId, 4);
  data.writeInt32BE(dialogId, 8);
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertThrows(callback, expectedText, message) {
  try {
    callback();
  } catch (error) {
    assert(error.message.includes(expectedText), `${message}：${error.message}`);
    return;
  }
  throw new Error(message);
}

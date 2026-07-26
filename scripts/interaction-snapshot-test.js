import { readFile } from 'node:fs/promises';
import {
  createInteractionSnapshotModel,
  createOperateWindowEntries,
  createOperateWindowAction,
  createOperateWindowEntryFromAction
} from '../public/interaction-snapshot.js';

const model = createInteractionSnapshotModel({
  chatButtons: [
    { label: '领取奖励', action: 'run_command', value: '/daily-reward', at: 10 },
    { label: '打开网页', action: 'open_url', value: 'https://example.invalid', at: 11 }
  ],
  npcDialog: {
    channel: 'CustomNPCs',
    entityId: 9102,
    dialogId: 77,
    title: '新手向导',
    text: '请选择下一步',
    options: [
      { optionId: 2, title: '领取新手礼包', optionType: 0 }
    ]
  }
});

const chatOption = model.options.find((option) => option.kind === 'chat' && option.value === '/daily-reward');
assert(chatOption?.supported === true, 'run_command 聊天按钮没有成为可操作选项');
assert(chatOption.label === '领取奖励', '聊天按钮标签没有保留');

const unsupportedChatOption = model.options.find((option) => option.kind === 'chat' && option.action === 'open_url');
assert(unsupportedChatOption?.supported === false, '不支持的聊天 clickEvent 没有被禁用');

const npcOption = model.options.find((option) => option.kind === 'customNpcs');
assert(npcOption?.dialogId === 77 && npcOption.optionId === 2, 'CustomNPCs 对话选项缺少真实协议编号');
assert(npcOption.label === '领取新手礼包', 'CustomNPCs 对话选项文字没有保留');

const entries = createOperateWindowEntries([
  { slot: 12, item: true, name: 'emerald', displayName: '确认购买', protocolEntry: false },
  { slot: 4, item: true, name: '选择一区', displayName: '选择一区', protocolEntry: true }
], model);
const windowEntry = entries.find((entry) => entry.kind === 'window' && entry.slot === 12);
const dragonCoreEntry = entries.find((entry) => entry.kind === 'window' && entry.protocolEntry);
const chatEntry = entries.find((entry) => entry.kind === 'chat' && entry.supported);
const customNpcsEntry = entries.find((entry) => entry.kind === 'customNpcs');
assert(windowEntry && dragonCoreEntry && chatEntry && customNpcsEntry, '操作点击窗口没有汇总全部可点击来源');
assert(
  createOperateWindowAction(windowEntry, { title: '商店', button: 'left', count: 1, timeoutMs: 5000 }).type === 'operateWindow',
  '标准窗口选项没有映射为 operateWindow 动作'
);
assert(createOperateWindowAction(chatEntry, { timeoutMs: 5000 }).type === 'clickChat', '聊天选项没有映射为 clickChat 动作');
const npcAction = createOperateWindowAction(customNpcsEntry);
assert(npcAction.type === 'clickNpcDialog' && npcAction.dialogId === 77 && npcAction.optionId === 2, 'NPC 选项没有映射为真实对话动作');
assert(createOperateWindowEntryFromAction({ type: 'clickChat', chatButton: '领取奖励' })?.kind === 'chat', '旧聊天动作没有回显到操作点击窗口');
assert(
  createOperateWindowEntryFromAction({ type: 'clickNpcDialog', dialogId: 77, optionId: 2 })?.kind === 'customNpcs',
  '旧 CustomNPCs 动作没有回显到操作点击窗口'
);

const unresolved = createInteractionSnapshotModel({
  protocolDialogs: [{ channel: 'CustomNPCs', packetType: 'DIALOG', entityId: 9102, dialogId: 88 }]
});
assert(
  unresolved.notices.some((notice) => notice.includes('对话 ID 88') && notice.includes('同步定义')),
  '只有 CustomNPCs 对话编号时没有显示明确诊断'
);

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
assert(!html.includes('id="interactionOptionList"'), '交互选项仍显示在动作卡之外的独立按钮区');
assert(!html.includes('<option value="clickChat">'), '聊天按钮仍要求用户选择独立动作类型');
assert(!html.includes('<option value="clickNpcDialog">'), 'CustomNPCs 仍要求用户选择独立动作类型');
assert(html.includes('lobby-action-interaction-notice'), '操作点击窗口动作卡缺少协议诊断区域');

console.log('interaction snapshot test ok');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

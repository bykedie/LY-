import { createInteractionSnapshotModel } from '../public/interaction-snapshot.js';

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

const unresolved = createInteractionSnapshotModel({
  protocolDialogs: [{ channel: 'CustomNPCs', packetType: 'DIALOG', entityId: 9102, dialogId: 88 }]
});
assert(
  unresolved.notices.some((notice) => notice.includes('对话 ID 88') && notice.includes('同步定义')),
  '只有 CustomNPCs 对话编号时没有显示明确诊断'
);

console.log('interaction snapshot test ok');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

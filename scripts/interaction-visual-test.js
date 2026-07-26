import { readFile } from 'node:fs/promises';
import {
  createInteractionVisualSnapshot,
  extractProtocolPayloadText,
  normalizeInteractionVisualClick,
  resolveInteractionVisualClick
} from '../src/interaction-visual.js';
import { getInteractionVisualPoint, hitTestInteractionVisual } from '../public/interaction-visual.js';

const longPayload = Buffer.from(`dragoncore:main ${'界面字段'.repeat(300)}`);
const extracted = extractProtocolPayloadText(longPayload);
assert(extracted.length > 300, 'DragonCore 可读载荷仍被截断到 300 字符');
assert(extracted.includes('界面字段'.repeat(100)), 'DragonCore 长载荷没有保留后续界面字段');

const slots = Array.from({ length: 63 }, (_, slot) => ({
  slot,
  item: slot === 20,
  name: slot === 20 ? 'emerald' : '',
  displayName: slot === 20 ? '确认进入' : '',
  count: slot === 20 ? 1 : 0,
  lore: slot === 20 ? ['点击确认'] : []
}));
const container = createInteractionVisualSnapshot({
  window: { title: '三行菜单', type: 'generic_9x3', inventoryStart: 27, slots, at: 100 }
});
assert(container.kind === 'container' && container.mode === 'protocol-reconstruction', '标准窗口没有生成协议重建图');
assert(container.elements.filter((element) => element.group === 'container').length === 27, '三行标准窗口没有生成 27 个真实容器槽位');
const slot20 = container.elements.find((element) => element.slot === 20);
assert(slot20?.label === '确认进入', '协议重建图没有保留槽位文字');
const containerClick = resolveInteractionVisualClick(container, {
  visualId: container.id,
  x: slot20.x + slot20.width / 2,
  y: slot20.y + slot20.height / 2,
  button: 'left'
});
assert(containerClick.action?.kind === 'windowSlot' && containerClick.action.slot === 20, '图上选点没有映射到真实窗口槽位');
assert(containerClick.selection.normalizedX > 0 && containerClick.selection.normalizedX < 1, '图上选点没有生成归一化坐标');

const npc = createInteractionVisualSnapshot({
  npcDialog: {
    dialogId: 77,
    title: '新手向导',
    text: '请选择下一步',
    resolved: true,
    at: 200,
    options: [{ optionId: 2, optionType: 0, title: '领取礼包', command: '' }]
  }
});
const npcOption = npc.elements[0];
const npcClick = resolveInteractionVisualClick(npc, {
  visualId: npc.id,
  x: npcOption.x + 10,
  y: npcOption.y + 10,
  button: 'right'
});
assert(npcClick.action?.kind === 'customNpcs' && npcClick.action.optionId === 2, 'CustomNPCs 图上选点没有映射到真实选项协议');

const newestNpc = createInteractionVisualSnapshot({
  window: { title: '旧窗口', type: 'generic_9x1', inventoryStart: 9, slots: [], at: 100 },
  npcDialog: {
    dialogId: 78,
    title: '最新对话',
    resolved: true,
    at: 200,
    options: [{ optionId: 1, optionType: 0, title: '继续' }]
  }
});
assert(newestNpc.kind === 'custom-npcs' && newestNpc.title === '最新对话', '旧标准窗口遮住了更新的 NPC 模组界面');

const newestContainer = createInteractionVisualSnapshot({
  window: { title: '最新窗口', type: 'generic_9x1', inventoryStart: 9, slots: [], at: 300 },
  protocolMenu: { title: '旧模组界面', at: 200, entries: [{ name: '旧按钮', slot: 1 }] }
});
assert(newestContainer.kind === 'container' && newestContainer.title === '最新窗口', '最新标准窗口被旧模组信号遮住');

const unknown = createInteractionVisualSnapshot({
  protocolDialogs: [{ channel: 'unknown:gui', packetType: 'GUI', text: '未识别界面数据', size: 900, at: 300 }]
});
const unknownClick = resolveInteractionVisualClick(unknown, { visualId: unknown.id, x: 240, y: 160, button: 'left' });
assert(unknown.kind === 'protocol' && unknown.rawSignals[0].text.includes('未识别界面数据'), '未知模组信号没有生成可见画面和原始数据');
assert(unknownClick.action === null && unknownClick.selection.x === 240, '未知模组选点没有保存坐标或错误生成了动作');

const dragonCore = createInteractionVisualSnapshot({
  protocolMenu: { title: '选服', at: 400, entries: [{ name: '一区', slot: 20, lore: [] }] }
});
assert(dragonCore.elements[0].supported === false && dragonCore.elements[0].action.kind === 'dragoncore', '无底层窗口的 DragonCore 控件没有保持安全拒绝边界');

assertThrows(
  () => resolveInteractionVisualClick(container, { visualId: 'stale', x: 10, y: 10, button: 'left' }),
  '界面已经变化'
);
assertThrows(() => normalizeInteractionVisualClick({ visualId: container.id, x: -1, y: 10, button: 'left' }), '超出允许范围');

const canvas = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 320, height: 200 }) };
const point = getInteractionVisualPoint({ clientX: 170, clientY: 120 }, canvas, { width: 640, height: 400 });
assert(point.x === 320 && point.y === 200 && point.normalizedX === 0.5 && point.normalizedY === 0.5, '浏览器选点没有按画面比例换算坐标');
assert(hitTestInteractionVisual(container, slot20.x + 1, slot20.y + 1)?.id === slot20.id, '前端命中测试没有识别槽位');

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
assert(html.includes('id="interactionVisualCanvas"'), '页面下方缺少交互界面画布');
assert(html.includes('id="interactionVisualLeftBtn"') && html.includes('id="interactionVisualRightBtn"'), '交互界面缺少左右键确认控件');
assert(html.includes('id="interactionVisualSelection"'), '交互界面缺少选点坐标显示');
const css = await readFile(new URL('../public/interaction-visual.css', import.meta.url), 'utf8');
assert(/#interactionVisualCanvas\s*\{[^}]*width:\s*min\(100%, 900px\);[^}]*height:\s*auto;/s.test(css), '交互画布没有保持等比缩放');

console.log('interaction visual test ok');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertThrows(run, text) {
  try {
    run();
  } catch (error) {
    assert(error.message.includes(text), `错误信息不正确：${error.message}`);
    return;
  }
  throw new Error(`预期抛出错误：${text}`);
}

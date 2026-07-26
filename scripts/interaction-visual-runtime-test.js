import { runInteractionVisualClick } from '../src/interaction-visual-runtime.js';
import { createInteractionVisualSnapshot } from '../src/interaction-visual.js';

const clicks = [];
const events = [];
const logs = [];
let snapshotCount = 0;
const session = {
  bot: {
    entity: {},
    currentWindow: { title: '测试菜单' },
    clickWindow: async (slot, button, mode) => clicks.push({ slot, button, mode })
  },
  lastWindow: null,
  manualLobbyActionRunning: false,
  interactionVisualSelection: null
};
const windowVisual = createInteractionVisualSnapshot({
  window: {
    title: '测试菜单',
    type: 'generic_9x1',
    inventoryStart: 9,
    slots: Array.from({ length: 9 }, (_, slot) => ({ slot, item: slot === 4, displayName: slot === 4 ? '确认' : '' })),
    at: 100
  }
});
const slot = windowVisual.elements.find((element) => element.slot === 4);

await runInteractionVisualClick({
  target: 'VisualBot',
  requestId: 'click-1',
  click: { visualId: windowVisual.id, x: slot.x + 1, y: slot.y + 1, button: 'right' }
}, createContext(() => windowVisual));

assert(clicks.length === 1 && clicks[0].slot === 4 && clicks[0].button === 1 && clicks[0].mode === 0, '标准窗口图上选点没有执行真实右键槽位点击');
assert(events.at(-1)?.ok === true && events.at(-1)?.executed === true, '真实槽位点击回执没有标记已执行');
assert(events.at(-1)?.selection?.hitId === 'slot:4', '真实槽位点击回执缺少本次选点');
assert(session.interactionVisualSelection?.hitId === 'slot:4', '真实槽位点击后没有保存选点和命中槽位');

const unknownVisual = createInteractionVisualSnapshot({
  protocolDialogs: [{ channel: 'unknown:gui', packetType: 'GUI', text: '未知界面', at: 200 }]
});
await runInteractionVisualClick({
  target: 'VisualBot',
  requestId: 'click-2',
  click: { visualId: unknownVisual.id, x: 100, y: 120, button: 'left' }
}, createContext(() => unknownVisual));

assert(events.at(-1)?.ok === true && events.at(-1)?.executed === false, '未知协议选点不应伪造执行成功');
assert(events.at(-1)?.message.includes('选点已保存'), '未知协议选点没有返回明确安全边界');
assert(session.interactionVisualSelection?.x === 100, '未知协议选点没有保存坐标');
assert(snapshotCount >= 2 && logs.some((line) => line.includes('真实窗口槽位 4')), '运行模块没有刷新快照或记录真实点击日志');

console.log('interaction visual runtime test ok');

function createContext(getInteractionVisual) {
  return {
    sessions: new Map([['VisualBot', session]]),
    getInteractionVisual,
    emitWindowSnapshot: () => { snapshotCount += 1; },
    emitRuntimeEvent: (event) => events.push(event),
    log: (_username, message) => logs.push(message),
    enqueueChat: () => {}
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

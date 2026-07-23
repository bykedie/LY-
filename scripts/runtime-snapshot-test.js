import { createRuntimeSnapshot } from '../src/runtime-snapshot.js';

const empty = createRuntimeSnapshot({ entities: null, messages: 'bad' });
assert(empty.window === null && empty.position === null, '空快照没有规范化窗口和坐标');
assert(empty.entities.length === 0 && empty.messages.length === 0, '空快照没有规范化列表字段');

const source = {
  window: { title: 'Menu' },
  position: { x: 1, y: 2, z: 3 },
  entities: [{ id: 1 }],
  messages: [{ text: 'hello' }],
  chatButtons: [{ label: 'run' }],
  protocolDialogs: [{ channel: 'test' }],
  protocolMenu: { title: 'Protocol' }
};
const snapshot = createRuntimeSnapshot(source);
assert(snapshot.window === source.window && snapshot.position === source.position, '有效快照丢失窗口或坐标');
assert(snapshot.entities === source.entities && snapshot.protocolMenu === source.protocolMenu, '有效快照丢失列表或协议菜单');
console.log('runtime snapshot test ok');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

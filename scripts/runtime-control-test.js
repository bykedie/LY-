import { collapseAccountLogs, renderRuntimeLogs, shouldFollowLogTail } from '../public/runtime-control.js';

const collapsed = collapseAccountLogs([
  '[7/26/2026, 7:00:00 PM] [BotA] 已进入服务器。',
  '[7/26/2026, 7:00:01 PM] [BotB] 已进入服务器。',
  '[7/26/2026, 7:00:02 PM] [BotC] 已进入服务器。',
  '[7/26/2026, 7:00:03 PM] [系统] 挂机进程初始化完成。',
  '[7/26/2026, 7:00:04 PM] [BotA] 连接已断开。',
  '[7/26/2026, 7:00:05 PM] [BotA] 连接已断开。'
]);
assert(collapsed.length === 4, `相同账号日志没有折叠，实际 ${collapsed.length} 行`);
assert(collapsed[0].includes('[BotA、BotB、BotC] 已进入服务器。'), '折叠日志没有列出全部账号');
assert(collapsed[1].includes('[系统] 挂机进程初始化完成。'), '系统日志不应被账号折叠改变');
assert(collapsed[2] !== collapsed[3], '同一账号重复日志不应伪装成多账号合并');

assert(shouldFollowLogTail({ scrollTop: 700, scrollHeight: 1000, clientHeight: 300 }), '位于底部时没有启用自动跟随');
assert(!shouldFollowLogTail({ scrollTop: 500, scrollHeight: 1000, clientHeight: 300 }), '用户上翻后仍被判断为自动跟随');

const followingElement = createLogElement({ scrollTop: 700, scrollHeight: 1000, clientHeight: 300 });
renderRuntimeLogs(followingElement, collapsed, (lines) => lines.join('\n'));
assert(followingElement.scrollTop === followingElement.scrollHeight, '日志刷新后没有自动滚动到底部');

const readingElement = createLogElement({ scrollTop: 400, scrollHeight: 1000, clientHeight: 300 });
renderRuntimeLogs(readingElement, collapsed, (lines) => lines.join('\n'));
assert(readingElement.scrollTop === 400, '用户上翻阅读时日志刷新抢走了滚动位置');

console.log('runtime control test ok');

function createLogElement({ scrollTop, scrollHeight, clientHeight }) {
  return {
    scrollTop,
    scrollHeight,
    clientHeight,
    set innerHTML(value) {
      this.value = value;
      this.scrollHeight = 1200;
    },
    set textContent(value) {
      this.value = value;
      this.scrollHeight = 1200;
    }
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

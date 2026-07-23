import { EventEmitter } from 'node:events';
import { requestProcessStop } from '../src/process-lifecycle.js';

await testForcedStop();
await testGracefulExitCancelsForce();
testMissingChild();
console.log('process lifecycle test ok');

async function testForcedStop() {
  const child = fakeChild();
  requestProcessStop(child, { forceAfterMs: 20 });
  assert(child.signals.join(',') === 'SIGINT', '停止请求没有先发送 SIGINT');
  await delay(50);
  assert(child.signals.join(',') === 'SIGINT,SIGKILL', '停止超时没有发送 SIGKILL');
}

async function testGracefulExitCancelsForce() {
  const child = fakeChild();
  requestProcessStop(child, { forceAfterMs: 30 });
  child.exitCode = 0;
  child.emit('exit', 0, null);
  await delay(60);
  assert(child.signals.join(',') === 'SIGINT', '正常退出后仍发送了 SIGKILL');
}

function testMissingChild() {
  assert(requestProcessStop(null) === null, '空子进程应该返回 null');
}

function fakeChild() {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.signals = [];
  child.kill = (signal) => {
    child.signals.push(signal);
    return true;
  };
  return child;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

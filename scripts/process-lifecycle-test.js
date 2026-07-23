import { EventEmitter } from 'node:events';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { requestProcessStop, waitForProcessSpawn } from '../src/process-lifecycle.js';

await testForcedStop();
await testGracefulExitCancelsForce();
await testSpawnSuccess();
await testSpawnFailure();
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

async function testSpawnSuccess() {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 50)']);
  const exited = once(child, 'exit');
  await waitForProcessSpawn(child);
  child.kill('SIGINT');
  await exited;
}

async function testSpawnFailure() {
  const missingExecutable = path.join(os.tmpdir(), `missing-node-${process.pid}-${Date.now()}.exe`);
  const child = spawn(missingExecutable, []);
  const error = await capture(waitForProcessSpawn(child));
  assert(error.code === 'ENOENT', `缺失可执行文件没有返回 ENOENT：${error.code || error.message}`);
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

async function capture(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('预期进程启动失败，但实际成功');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

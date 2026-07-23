import { EventEmitter } from 'node:events';
import { writeJsonLine } from '../src/process-ipc.js';

await expectSuccess();
await expectAsyncFailure();
await expectStreamError();
await expectSyncFailure();
await expectClosedStream();
console.log('process ipc test ok');

async function expectSuccess() {
  const stream = fakeStream((data, callback) => {
    stream.writes.push(data);
    queueMicrotask(() => callback());
    return true;
  });
  await writeJsonLine(stream, { type: 'chat', message: '/spawn' });
  assert(stream.writes[0] === '{"type":"chat","message":"/spawn"}\n', 'IPC 没有写入单行 JSON');
}

async function expectAsyncFailure() {
  const stream = fakeStream((_data, callback) => {
    queueMicrotask(() => callback(Object.assign(new Error('broken pipe'), { code: 'EPIPE' })));
    return true;
  });
  const error = await capture(() => writeJsonLine(stream, { type: 'chat' }));
  assert(error.message.includes('broken pipe'), '异步 IPC 写入错误没有返回调用方');
}

async function expectStreamError() {
  const stream = fakeStream((_data, callback) => {
    queueMicrotask(() => stream.emit('error', new Error('stream closed')));
    queueMicrotask(() => callback());
    return true;
  });
  const error = await capture(() => writeJsonLine(stream, { type: 'chat' }));
  assert(error.message.includes('stream closed'), 'IPC 流 error 事件没有返回调用方');
}

async function expectSyncFailure() {
  const stream = fakeStream(() => { throw new Error('write after end'); });
  const error = await capture(() => writeJsonLine(stream, { type: 'chat' }));
  assert(error.message.includes('write after end'), '同步 IPC 写入错误没有返回调用方');
}

async function expectClosedStream() {
  const stream = fakeStream(() => true);
  stream.writable = false;
  const error = await capture(() => writeJsonLine(stream, { type: 'chat' }));
  assert(error.message.includes('不可写'), '关闭的 IPC 流没有被拒绝');
}

function fakeStream(write) {
  const stream = new EventEmitter();
  stream.writable = true;
  stream.destroyed = false;
  stream.writes = [];
  stream.write = write;
  return stream;
}

async function capture(operation) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('预期 IPC 写入失败，但实际成功');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

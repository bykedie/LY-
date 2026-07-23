import { createRuntimeRequestTracker } from '../src/runtime-request-tracker.js';

await expectSuccessResult();
await expectFailureResult();
await expectTimeout();
await expectCancel();
await expectRejectAll();
console.log('runtime request tracker test ok');

async function expectSuccessResult() {
  const tracker = createRuntimeRequestTracker();
  const result = tracker.wait('success', 100, 'timeout');
  assert(tracker.settle({ requestId: 'success', ok: true, value: 42 }, 'failed'), '成功回执没有匹配等待请求');
  assert((await result).value === 42, '成功回执内容没有返回调用方');
  assert(!tracker.settle({ requestId: 'missing', ok: true }, 'failed'), '未知回执不应该报告已匹配');
}

async function expectFailureResult() {
  const tracker = createRuntimeRequestTracker();
  const result = tracker.wait('failure', 100, 'timeout');
  tracker.settle({ requestId: 'failure', ok: false, message: 'executor rejected' }, 'fallback');
  const error = await capture(result);
  assert(error.message === 'executor rejected', '失败回执原因没有返回调用方');
}

async function expectTimeout() {
  const tracker = createRuntimeRequestTracker();
  const error = await capture(tracker.wait('timeout', 10, 'request timed out'));
  assert(error.message === 'request timed out', '等待超时没有返回指定错误');
  assert(!tracker.cancel('timeout', new Error('late cancel')), '超时请求没有从等待表清理');
}

async function expectCancel() {
  const tracker = createRuntimeRequestTracker();
  const result = tracker.wait('cancel', 100, 'timeout');
  assert(tracker.cancel('cancel', new Error('write failed')), '取消没有匹配等待请求');
  const error = await capture(result);
  assert(error.message === 'write failed', '取消原因没有返回调用方');
}

async function expectRejectAll() {
  const tracker = createRuntimeRequestTracker();
  const first = tracker.wait('first', 100, 'timeout');
  const second = tracker.wait('second', 100, 'timeout');
  tracker.rejectAll(new Error('process exited'));
  const [firstError, secondError] = await Promise.all([capture(first), capture(second)]);
  assert(firstError.message === 'process exited' && secondError.message === 'process exited', '进程退出没有拒绝全部等待请求');
}

async function capture(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('预期请求失败，但实际成功');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

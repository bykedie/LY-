export function createRuntimeRequestTracker() {
  const pending = new Map();

  function wait(requestId, timeoutMs, timeoutMessage) {
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(timeoutMessage));
      }, timeoutMs);
      pending.set(requestId, { resolve, reject, timer });
    });
    result.catch(() => {});
    return result;
  }

  function settle(event, failureMessage) {
    const request = pending.get(event?.requestId);
    if (!request) return false;
    clearTimeout(request.timer);
    pending.delete(event.requestId);
    if (event.ok) request.resolve(event);
    else request.reject(new Error(event.message || failureMessage));
    return true;
  }

  function cancel(requestId, error) {
    const request = pending.get(requestId);
    if (!request) return false;
    clearTimeout(request.timer);
    pending.delete(requestId);
    request.reject(error);
    return true;
  }

  function rejectAll(error) {
    for (const [requestId, request] of pending) {
      clearTimeout(request.timer);
      pending.delete(requestId);
      request.reject(error);
    }
  }

  return { wait, settle, cancel, rejectAll };
}

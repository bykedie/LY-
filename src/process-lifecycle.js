export function requestProcessStop(child, options = {}) {
  if (!child || typeof child.kill !== 'function') return null;

  const gracefulSignal = options.gracefulSignal || 'SIGINT';
  const forceSignal = options.forceSignal || 'SIGKILL';
  const forceAfterMs = Number(options.forceAfterMs ?? 5000);
  let settled = false;

  const forceTimer = setTimeout(() => {
    if (settled || child.exitCode !== null || child.signalCode !== null) return;
    child.kill(forceSignal);
  }, forceAfterMs);

  const cleanup = () => {
    if (settled) return;
    settled = true;
    clearTimeout(forceTimer);
  };
  child.once('exit', cleanup);
  child.kill(gracefulSignal);

  return { cancel: cleanup };
}

export function waitForProcessSpawn(child) {
  return new Promise((resolve, reject) => {
    if (!child || typeof child.once !== 'function') {
      reject(new Error('执行进程对象无效。'));
      return;
    }

    const cleanup = () => {
      child.off('spawn', onSpawn);
      child.off('error', onError);
    };
    const onSpawn = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };

    child.once('spawn', onSpawn);
    child.once('error', onError);
  });
}

export function waitForProcessExit(child, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (!child || typeof child.once !== 'function') {
      reject(new Error('执行进程对象无效。'));
      return;
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }

    const cleanup = () => {
      clearTimeout(timer);
      child.off('exit', onExit);
    };
    const onExit = (code, signal) => {
      cleanup();
      resolve({ code, signal });
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('等待执行进程退出超时。'));
    }, timeoutMs);

    child.once('exit', onExit);
  });
}

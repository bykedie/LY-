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

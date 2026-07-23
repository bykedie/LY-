export function writeJsonLine(stream, value) {
  return new Promise((resolve, reject) => {
    if (!stream?.writable || stream.destroyed) {
      reject(new Error('执行进程通信流不可写。'));
      return;
    }

    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      stream.off?.('error', onError);
      if (error) reject(error);
      else resolve();
    };
    const onError = (error) => finish(error);
    stream.once?.('error', onError);

    try {
      stream.write(`${JSON.stringify(value)}\n`, (error) => finish(error));
    } catch (error) {
      finish(error);
    }
  });
}

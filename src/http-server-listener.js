const listenErrorReasons = {
  EADDRINUSE: '地址或端口已被占用',
  EACCES: '没有权限监听该地址或端口',
  EADDRNOTAVAIL: '监听地址在本机不可用',
  ENOTFOUND: '无法解析监听地址'
};

export function formatListenError(error, { host, port }) {
  const code = error?.code || 'UNKNOWN';
  const reason = listenErrorReasons[code] || error?.message || '未知错误';
  return `管理面板启动失败：无法监听 http://${host}:${port}（${code}：${reason}）。`;
}

export function listenHttpServer(server, { host, port, portInput = String(port), onListening }) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`管理面板启动失败：DASHBOARD_PORT=${portInput} 无效，必须是 1 到 65535 之间的整数。`);
    process.exitCode = 1;
    return;
  }

  let started = false;
  server.on('error', (error) => {
    console.error(formatListenError(error, { host, port }));
    if (!started) process.exitCode = 1;
  });
  server.listen(port, host, () => {
    started = true;
    onListening();
  });
}

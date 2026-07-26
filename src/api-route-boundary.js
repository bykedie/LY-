export const apiRouteMethods = new Map([
  ['/api/config', ['GET', 'POST']],
  ['/api/profiles', ['GET', 'POST']],
  ['/api/profiles/use', ['POST']],
  ['/api/profiles/delete', ['POST']],
  ['/api/automations', ['GET', 'POST']],
  ['/api/automations/delete', ['POST']],
  ['/api/reset', ['POST']],
  ['/api/status', ['GET']],
  ['/api/start', ['POST']],
  ['/api/stop', ['POST']],
  ['/api/accounts/stop', ['POST']],
  ['/api/window', ['GET']],
  ['/api/lobby/action', ['POST']],
  ['/api/send', ['POST']]
]);

export function sendApiRouteFallback(request, response, pathname) {
  if (pathname !== '/api' && !pathname.startsWith('/api/')) return false;
  const methods = apiRouteMethods.get(pathname);
  const statusCode = methods ? 405 : 404;
  if (methods) response.setHeader('Allow', methods.join(', '));
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify({
    ok: false,
    message: methods ? `请求方法 ${request.method} 不允许。` : 'API 接口不存在。'
  }));
  return true;
}

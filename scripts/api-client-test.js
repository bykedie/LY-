import { requestJson } from '../public/api-client.js';

await expectSuccess();
await expectBusinessError();
await expectUnauthorizedHtml();
await expectProxyHtml();
await expectBrokenJson();
await expectNetworkError();
console.log('api client test ok');

async function expectSuccess() {
  const data = await requestJson('/ok', {}, async () => response(200, 'application/json', { ok: true, value: 1 }));
  assert(data.value === 1, '正常 JSON 响应解析失败');
}

async function expectBusinessError() {
  const error = await capture(() => requestJson('/bad', {}, async () => response(400, 'application/json', { ok: false, message: '配置错误' })));
  assert(error.message === '配置错误', '业务错误没有保留后端消息');
}

async function expectUnauthorizedHtml() {
  const error = await capture(() => requestJson('/auth', {}, async () => response(401, 'text/html', '<h1>Unauthorized</h1>')));
  assert(error.message.includes('登录已失效'), '401 HTML 没有转成登录失效提示');
}

async function expectProxyHtml() {
  const error = await capture(() => requestJson('/proxy', {}, async () => response(502, 'text/html', '<h1>Bad Gateway</h1>')));
  assert(error.message.includes('非 JSON 响应') && error.message.includes('502'), '代理 HTML 错误没有明确状态码');
}

async function expectBrokenJson() {
  const error = await capture(() => requestJson('/json', {}, async () => brokenJsonResponse()));
  assert(error.message.includes('损坏的 JSON'), '损坏 JSON 没有明确错误');
}

async function expectNetworkError() {
  const error = await capture(() => requestJson('/offline', {}, async () => { throw new Error('connection refused'); }));
  assert(error.message.includes('无法连接管理面板'), '网络错误没有明确连接提示');
}

function response(status, contentType, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => contentType },
    json: async () => body,
    text: async () => typeof body === 'string' ? body : JSON.stringify(body)
  };
}

function brokenJsonResponse() {
  return {
    ok: false,
    status: 500,
    headers: { get: () => 'application/json' },
    json: async () => { throw new Error('broken'); },
    text: async () => ''
  };
}

async function capture(operation) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('预期操作失败，但实际成功');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

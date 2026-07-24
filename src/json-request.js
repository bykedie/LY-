const defaultMaxBytes = 1024 * 1024;

export async function readJsonRequest(request, options = {}) {
  const text = await readRequestBody(request, options.maxBytes || defaultMaxBytes);
  if (!text.trim() && options.allowEmpty) return {};

  const mediaType = String(request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    throw requestError(415, '请求 Content-Type 必须是 application/json。');
  }
  if (!text.trim()) throw requestError(400, '请求正文必须是有效 JSON 对象。');

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw requestError(400, '请求正文必须是有效 JSON 对象。');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw requestError(400, '请求正文必须是 JSON 对象。');
  }
  return data;
}

async function readRequestBody(request, maxBytes) {
  const contentLength = Number(request.headers['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    request.resume();
    throw requestError(413, '请求内容过大，最大允许 1 MiB。');
  }

  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      request.resume();
      throw requestError(413, '请求内容过大，最大允许 1 MiB。');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, totalBytes).toString('utf8');
}

function requestError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

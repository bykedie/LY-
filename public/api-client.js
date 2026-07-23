export async function requestJson(url, options = {}, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
  } catch (error) {
    throw new Error(`无法连接管理面板：${error.message}`);
  }

  const contentType = response.headers?.get?.('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      throw new Error(`管理面板返回了损坏的 JSON（HTTP ${response.status}）。`);
    }
  } else {
    const text = await response.text().catch(() => '');
    if (response.status === 401) throw new Error('管理面板登录已失效，请重新输入账号密码。');
    const summary = text.trim().replace(/\s+/g, ' ').slice(0, 120);
    throw new Error(`管理面板返回了非 JSON 响应（HTTP ${response.status}）${summary ? `：${summary}` : '。'}`);
  }

  if (!response.ok || !data?.ok) {
    throw new Error(data?.message || `请求失败（HTTP ${response.status}）。`);
  }
  return data;
}

export async function onRequestGet(context) {
  const { request } = context;
  const authHeader = request.headers.get('Authorization') || '';
  
  if (!authHeader.startsWith('Bearer ')) {
    return json({ valid: false }, 401);
  }
  
  // 简单验证：token 存在即认为有效（生产环境可结合 KV 存储会话）
  return json({ valid: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

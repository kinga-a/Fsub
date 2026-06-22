export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json();
  
  const accessCode = env.ACCESS_CODE || 'admin';
  
  if (body.code !== accessCode) {
    return new Response(JSON.stringify({ success: false, message: '访问码错误' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // 生成简单 token
  const token = await hashString(accessCode);
  
  return new Response(JSON.stringify({ success: true, token }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function onRequestGet(context) {
  // 验证 token 有效性
  const { request, env } = context;
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ valid: false }), { status: 401 });
  }
  
  const token = authHeader.slice(7);
  const expectedToken = await hashString(env.ACCESS_CODE || 'admin');
  
  return new Response(JSON.stringify({ valid: token === expectedToken }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str + '_salt_edgeone_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

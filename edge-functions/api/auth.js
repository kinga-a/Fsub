// 统一的 hash 函数，前后端使用相同的算法
async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str + '_salt_edgeone_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const body = await request.json();
    const accessCode = env.ACCESS_CODE || 'admin';
    
    if (body.code !== accessCode) {
      return json({ success: false, message: '访问码错误' }, 401);
    }
    
    const token = await hashString(accessCode);
    return json({ success: true, token });
  } catch (e) {
    return json({ success: false, message: '请求格式错误' }, 400);
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return json({ valid: false }, 401);
  }
  
  const token = authHeader.slice(7);
  const expectedToken = await hashString(env.ACCESS_CODE || 'admin');
  
  return json({ valid: token === expectedToken });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

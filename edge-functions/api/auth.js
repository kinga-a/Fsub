// 环境变量访问辅助函数
function getEnv(context, key, defaultValue) {
  if (context && context.env && context.env[key] !== undefined) {
    return context.env[key];
  }
  if (typeof env !== 'undefined' && env[key] !== undefined) {
    return env[key];
  }
  return defaultValue;
}

export async function onRequestPost(context) {
  const { request } = context;
  const body = await request.json();

  const accessCode = getEnv(context, 'ACCESS_CODE', 'admin');

  if (body.code === accessCode) {
    const token = await hashString(accessCode + '_salt_' + Date.now());
    return json({ success: true, token });
  }

  return json({ success: false, message: '访问码错误' }, 401);
}

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

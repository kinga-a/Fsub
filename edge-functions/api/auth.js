export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json();

  const accessCode = env.ACCESS_CODE || 'admin';

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

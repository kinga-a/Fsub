export async function onRequestGet(context) {
  const { request } = context;
  const cookie = request.headers.get('Cookie') || '';
  const tokenMatch = cookie.match(/sub_token=([^;]+)/);

  if (!tokenMatch) {
    return json({ valid: false }, 401);
  }

  const token = tokenMatch[1];
  if (!token || token.length < 10) {
    return json({ valid: false }, 401);
  }

  return json({ valid: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

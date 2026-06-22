export function middleware(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  
  // 公开路径直接放行
  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/api/auth') {
    return next();
  }
  
  // 只对 API 路径做验证
  if (url.pathname.startsWith('/api/')) {
    const authHeader = request.headers.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const token = authHeader.slice(7);
    const expectedToken = hashSync(context.env.ACCESS_CODE || 'admin');
    
    if (token !== expectedToken) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  return next();
}

export const config = {
  matcher: ['/:path*']
};

function hashSync(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'tok_' + Math.abs(hash).toString(36);
}

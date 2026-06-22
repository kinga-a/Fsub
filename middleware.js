export function middleware(context) {
  const { request, next, redirect } = context;
  const url = new URL(request.url);
  
  // 公开路径放行
  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/api/auth') {
    return next();
  }
  
  // API 路径需要验证
  if (url.pathname.startsWith('/api/')) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
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

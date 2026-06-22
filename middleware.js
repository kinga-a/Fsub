export function middleware(context) {
  const { request, next, redirect } = context;
  const url = new URL(request.url);
  
  // 静态资源和登录接口放行
  const publicPaths = ['/', '/index.html', '/api/auth'];
  if (publicPaths.includes(url.pathname)) {
    return next();
  }
  
  // 验证 Token
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return redirect('/', 307);
  }
  
  const token = authHeader.slice(7);
  const expectedToken = hashSync(context.env.ACCESS_CODE || 'admin');
  
  if (token !== expectedToken) {
    return redirect('/', 307);
  }
  
  return next();
}

export const config = {
  matcher: ['/:path*']
};

// 同步哈希（Edge Functions 支持 Web Crypto，这里用简单实现）
function hashSync(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'tok_' + Math.abs(hash).toString(36);
}

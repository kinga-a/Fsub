export function middleware(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  // 静态资源放行
  if (url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
    return next();
  }

  // API 请求直接放行（由 Edge Functions 处理认证）
  if (url.pathname.startsWith('/api/')) {
    return next();
  }

  // 检查 Cookie 中的 token
  const cookie = request.headers.get('Cookie') || '';
  const tokenMatch = cookie.match(/sub_token=([^;]+)/);

  if (!tokenMatch) {
    // 未登录，返回登录页
    return new Response(LOGIN_HTML, {
      headers: { 
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }

  // 已登录，继续处理（返回 index.html）
  return next();
}

// 配置匹配器（可选，默认匹配所有路由）
export const config = {
  matcher: ['/:path*'],
};

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RenewHelper | 登录</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', sans-serif;
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .login-box {
      background: white;
      padding: 48px 40px;
      border-radius: 20px;
      box-shadow: 0 25px 80px rgba(0,0,0,0.3);
      width: 90%;
      max-width: 420px;
      text-align: center;
    }
    .brand-icon { font-size: 48px; margin-bottom: 16px; }
    .login-box h1 { font-size: 24px; margin-bottom: 4px; color: #1e293b; font-weight: 700; }
    .login-box .subtitle { color: #64748b; margin-bottom: 32px; font-size: 14px; letter-spacing: 2px; }
    .input-group { margin-bottom: 20px; text-align: left; }
    .input-group label {
      display: block;
      margin-bottom: 8px;
      font-size: 13px;
      font-weight: 600;
      color: #475569;
    }
    .input-group input {
      width: 100%;
      padding: 14px 16px;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      font-size: 16px;
      transition: all 0.3s;
      font-family: inherit;
    }
    .input-group input:focus {
      outline: none;
      border-color: #4f46e5;
      box-shadow: 0 0 0 4px rgba(79,70,229,0.1);
    }
    .btn {
      width: 100%;
      padding: 14px;
      background: #4f46e5;
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      font-family: inherit;
    }
    .btn:hover { background: #4338ca; transform: translateY(-1px); }
    .btn:active { transform: translateY(0); }
    .error {
      color: #ef4444;
      font-size: 14px;
      margin-top: 16px;
      display: none;
      padding: 12px;
      background: #fef2f2;
      border-radius: 10px;
      border: 1px solid #fee2e2;
      font-weight: 500;
    }
    .error.show { display: block; }
    .footer { margin-top: 24px; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="login-box">
    <div class="brand-icon">🔔</div>
    <h1>RenewHelper</h1>
    <div class="subtitle">时序 · 守望</div>
    <div class="input-group">
      <label>访问码</label>
      <input type="password" id="code" placeholder="请输入访问码" autofocus>
    </div>
    <button class="btn" onclick="login()">进入系统</button>
    <div class="error" id="error">访问码错误，请重试</div>
    <div class="footer">RenewHelper v2.0 · 分布式云资产全周期托管</div>
  </div>
  <script>
    async function login() {
      const code = document.getElementById('code').value;
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      if (res.ok) {
        const data = await res.json();
        document.cookie = 'sub_token=' + data.token + '; path=/; max-age=86400; SameSite=Strict';
        location.reload();
      } else {
        document.getElementById('error').classList.add('show');
        document.getElementById('code').value = '';
      }
    }
    document.getElementById('code').addEventListener('keypress', e => {
      if (e.key === 'Enter') login();
    });
  </script>
</body>
</html>`;

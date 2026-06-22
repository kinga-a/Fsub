export function middleware(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  // 静态资源放行
  if (url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
    return next();
  }

  // API 请求直接放行（Edge Functions 会处理）
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
  
  // 已登录，继续处理
  return next();
}

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>订阅管理中心 - 登录</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
      max-width: 400px;
      text-align: center;
    }
    .login-box h1 { font-size: 28px; margin-bottom: 8px; color: #1a202c; }
    .login-box p { color: #718096; margin-bottom: 32px; font-size: 15px; }
    .input-group { margin-bottom: 20px; text-align: left; }
    .input-group label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: 500;
      color: #4a5568;
    }
    .input-group input {
      width: 100%;
      padding: 14px 16px;
      border: 2px solid #e2e8f0;
      border-radius: 10px;
      font-size: 16px;
      transition: all 0.3s;
    }
    .input-group input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102,126,234,0.1);
    }
    .btn {
      width: 100%;
      padding: 14px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
    }
    .btn:hover { background: #5a67d8; transform: translateY(-1px); }
    .btn:active { transform: translateY(0); }
    .error {
      color: #e53e3e;
      font-size: 14px;
      margin-top: 16px;
      display: none;
      padding: 10px;
      background: #fff5f5;
      border-radius: 8px;
      border: 1px solid #fed7d7;
    }
    .error.show { display: block; }
    .icon { font-size: 48px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="login-box">
    <div class="icon">🔐</div>
    <h1>订阅管理中心</h1>
    <p>请输入访问码以进入系统</p>
    <div class="input-group">
      <label>访问码</label>
      <input type="password" id="code" placeholder="请输入访问码" autofocus>
    </div>
    <button class="btn" onclick="login()">进入系统</button>
    <div class="error" id="error">访问码错误，请重试</div>
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

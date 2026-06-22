// ============================================================
// 订阅管理应用 - EdgeOne Pages Edge Functions
// 功能：访问码验证、订阅CRUD、通知接口配置、定时通知
// KV存储：SUB_KV（全局变量，非env.SUB_KV）
// 环境变量：ACCESS_CODE（在控制台设置）
// ============================================================

// ==================== 工具函数 ====================

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function getCookieValue(cookieStr, name) {
  if (!cookieStr) return null;
  const match = cookieStr.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

// ==================== 配置管理 ====================

async function getConfig() {
  try {
    const data = await SUB_KV.get('config', 'json');
    return data || {};
  } catch (e) {
    return {};
  }
}

async function saveConfig(config) {
  await SUB_KV.put('config', JSON.stringify(config));
}

// ==================== 访问码验证 ====================

async function verifyAccessCode(code, env) {
  // 环境变量通过 env 对象访问
  const accessCode = env.ACCESS_CODE || 'admin';
  return code === accessCode;
}

async function createToken(accessCode) {
  return await hashString(accessCode + '_edgeone_' + Date.now());
}

async function verifyToken(token, env) {
  if (!token) return false;
  const stored = await SUB_KV.get('auth_tokens', 'json') || [];
  return stored.includes(token);
}

async function storeToken(token) {
  const stored = await SUB_KV.get('auth_tokens', 'json') || [];
  stored.push(token);
  if (stored.length > 100) stored.shift();
  await SUB_KV.put('auth_tokens', JSON.stringify(stored));
}

// ==================== 通知发送函数 ====================

async function sendTelegramNotification(message, config) {
  try {
    if (!config.TG_BOT_TOKEN || !config.TG_CHAT_ID) {
      console.error('[Telegram] 缺少配置');
      return false;
    }
    const url = 'https://api.telegram.org/bot' + config.TG_BOT_TOKEN + '/sendMessage';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.TG_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });
    const result = await response.json();
    return result.ok;
  } catch (error) {
    console.error('[Telegram] 发送失败:', error);
    return false;
  }
}

async function sendNotifyXNotification(title, content, description, config) {
  try {
    if (!config.NOTIFYX_API_KEY) {
      console.error('[NotifyX] 缺少配置');
      return false;
    }
    const url = 'https://www.notifyx.cn/api/v1/send/' + config.NOTIFYX_API_KEY;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, description: description || '' })
    });
    const result = await response.json();
    return result.status === 'queued';
  } catch (error) {
    console.error('[NotifyX] 发送失败:', error);
    return false;
  }
}

async function sendWebhookNotification(title, content, config, metadata = {}) {
  try {
    if (!config.WEBHOOK_URL) {
      console.error('[Webhook] 缺少URL');
      return false;
    }
    let headers = { 'Content-Type': 'application/json' };
    if (config.WEBHOOK_HEADERS) {
      try { headers = { ...headers, ...JSON.parse(config.WEBHOOK_HEADERS) }; }
      catch (e) { console.warn('[Webhook] 自定义请求头格式错误'); }
    }
    const timestamp = new Date().toISOString();
    const formattedMessage = [title, content, '发送时间：' + timestamp].filter(Boolean).join('\n\n');
    let requestBody;
    if (config.WEBHOOK_TEMPLATE) {
      try {
        const template = JSON.parse(config.WEBHOOK_TEMPLATE);
        const templateStr = JSON.stringify(template);
        const replaced = templateStr.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
          const map = { title, content, timestamp, formattedMessage, message: formattedMessage };
          return JSON.stringify(String(map[key] || '')).slice(1, -1);
        });
        requestBody = JSON.parse(replaced);
      } catch (e) {
        requestBody = { title, content, timestamp, message: formattedMessage };
      }
    } else {
      requestBody = { title, content, timestamp, message: formattedMessage };
    }
    const response = await fetch(config.WEBHOOK_URL, {
      method: config.WEBHOOK_METHOD || 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });
    return response.ok;
  } catch (error) {
    console.error('[Webhook] 发送失败:', error);
    return false;
  }
}

async function sendWechatBotNotification(title, content, config) {
  try {
    if (!config.WECHATBOT_WEBHOOK) {
      console.error('[企业微信机器人] 缺少Webhook');
      return false;
    }
    const msgType = config.WECHATBOT_MSG_TYPE || 'text';
    let messageData;
    if (msgType === 'markdown') {
      messageData = { msgtype: 'markdown', markdown: { content: '# ' + title + '\n\n' + content } };
    } else {
      messageData = { msgtype: 'text', text: { content: title + '\n\n' + content } };
    }
    if (config.WECHATBOT_AT_ALL === 'true') {
      if (msgType === 'text') messageData.text.mentioned_list = ['@all'];
    } else if (config.WECHATBOT_AT_MOBILES) {
      const mobiles = config.WECHATBOT_AT_MOBILES.split(',').map(m => m.trim()).filter(Boolean);
      if (mobiles.length > 0 && msgType === 'text') messageData.text.mentioned_mobile_list = mobiles;
    }
    const response = await fetch(config.WECHATBOT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messageData)
    });
    const result = await response.json();
    return result.errcode === 0;
  } catch (error) {
    console.error('[企业微信机器人] 发送失败:', error);
    return false;
  }
}

async function sendDingTalkNotification(title, content, config) {
  try {
    if (!config.DINGTALK_WEBHOOK) {
      console.error('[钉钉] 缺少Webhook');
      return false;
    }
    const msgType = config.DINGTALK_MSG_TYPE || 'text';
    let messageData;
    if (msgType === 'markdown') {
      messageData = { msgtype: 'markdown', markdown: { title, text: '# ' + title + '\n\n' + content } };
    } else {
      messageData = { msgtype: 'text', text: { content: title + '\n\n' + content } };
    }
    if (config.DINGTALK_AT_ALL === 'true') {
      messageData.at = { isAtAll: true };
    } else if (config.DINGTALK_AT_MOBILES) {
      const mobiles = config.DINGTALK_AT_MOBILES.split(',').map(m => m.trim()).filter(Boolean);
      if (mobiles.length > 0) messageData.at = { atMobiles: mobiles };
    }
    let webhookUrl = config.DINGTALK_WEBHOOK;
    if (config.DINGTALK_SECRET) {
      const timestamp = Date.now();
      const stringToSign = timestamp + '\n' + config.DINGTALK_SECRET;
      const encoder = new TextEncoder();
      const keyData = encoder.encode(config.DINGTALK_SECRET);
      const messageDataSign = encoder.encode(stringToSign);
      const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageDataSign);
      const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
      const sep = webhookUrl.includes('?') ? '&' : '?';
      webhookUrl = webhookUrl + sep + 'timestamp=' + timestamp + '&sign=' + encodeURIComponent(signatureBase64);
    }
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messageData)
    });
    const result = await response.json();
    return result.errcode === 0;
  } catch (error) {
    console.error('[钉钉] 发送失败:', error);
    return false;
  }
}

async function sendFeishuNotification(title, content, config) {
  try {
    if (!config.FEISHU_WEBHOOK) {
      console.error('[飞书] 缺少Webhook');
      return false;
    }
    const msgType = config.FEISHU_MSG_TYPE || 'text';
    let messageData;
    if (msgType === 'post') {
      messageData = {
        msg_type: 'post',
        content: { post: { zh_cn: { title, content: [[{ tag: 'text', text: content }]] } } }
      };
    } else {
      messageData = { msg_type: 'text', content: { text: title + '\n\n' + content } };
    }
    let headers = { 'Content-Type': 'application/json' };
    if (config.FEISHU_SECRET) {
      const timestamp = Math.floor(Date.now() / 1000);
      const stringToSign = timestamp + '\n' + config.FEISHU_SECRET;
      const encoder = new TextEncoder();
      const keyData = encoder.encode(config.FEISHU_SECRET);
      const messageDataSign = encoder.encode(stringToSign);
      const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageDataSign);
      const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
      headers['X-Lark-Request-Timestamp'] = timestamp.toString();
      headers['X-Lark-Signature'] = signatureBase64;
    }
    const response = await fetch(config.FEISHU_WEBHOOK, {
      method: 'POST',
      headers,
      body: JSON.stringify(messageData)
    });
    const result = await response.json();
    return result.code === 0;
  } catch (error) {
    console.error('[飞书] 发送失败:', error);
    return false;
  }
}

async function sendBarkNotification(title, content, config) {
  try {
    if (!config.BARK_DEVICE_KEY) {
      console.error('[Bark] 缺少设备Key');
      return false;
    }
    const serverUrl = config.BARK_SERVER || 'https://api.day.app';
    const payload = { title, body: content, device_key: config.BARK_DEVICE_KEY };
    if (config.BARK_IS_ARCHIVE === 'true') payload.isArchive = 1;
    const response = await fetch(serverUrl + '/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    return result.code === 200;
  } catch (error) {
    console.error('[Bark] 发送失败:', error);
    return false;
  }
}

async function sendEmailNotification(title, content, config) {
  try {
    if (!config.RESEND_API_KEY || !config.EMAIL_FROM || !config.EMAIL_TO) {
      console.error('[邮件] 缺少配置');
      return false;
    }
    const htmlContent = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + title + '</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:0;background:#f5f5f5}.container{max-width:600px;margin:0 auto;background:#fff}.header{background:linear-gradient(135deg,#667eea,#764ba2);padding:30px;text-align:center}.header h1{color:#fff;margin:0;font-size:24px}.content{padding:30px 20px}.content p{color:#666;line-height:1.6}.footer{background:#f8f9fa;padding:20px;text-align:center;color:#666;font-size:14px}.highlight{background:#e3f2fd;padding:15px;border-radius:8px;margin:20px 0}</style></head><body><div class="container"><div class="header"><h1>订阅提醒</h1></div><div class="content"><h2>' + title + '</h2><div class="highlight"><p>' + content.replace(/\n/g, '<br>') + '</p></div></div><div class="footer"><p>本邮件由订阅管理系统自动发送</p></div></div></body></html>';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.RESEND_API_KEY
      },
      body: JSON.stringify({
        from: (config.EMAIL_FROM_NAME ? config.EMAIL_FROM_NAME + ' ' : '') + '<' + config.EMAIL_FROM + '>',
        to: config.EMAIL_TO,
        subject: title,
        html: htmlContent
      })
    });
    const result = await response.json();
    return response.ok && result.id;
  } catch (error) {
    console.error('[邮件] 发送失败:', error);
    return false;
  }
}

async function sendNotificationToAllChannels(title, commonContent, config, logPrefix, options) {
  options = options || {};
  const metadata = options.metadata || {};
  const notifiers = config.ENABLED_NOTIFIERS || [];
  if (!notifiers.length) {
    console.log(logPrefix + ' 未启用任何通知渠道');
    return [];
  }
  const results = [];
  const plainContent = commonContent.replace(/[*#`]/g, '');

  if (notifiers.includes('notifyx')) {
    const success = await sendNotifyXNotification(title, '## ' + title + '\n\n' + commonContent, '订阅提醒', config);
    console.log(logPrefix + ' NotifyX: ' + (success ? '成功' : '失败'));
    results.push({ channel: 'notifyx', success });
  }
  if (notifiers.includes('telegram')) {
    const success = await sendTelegramNotification('*' + title + '*\n\n' + commonContent, config);
    console.log(logPrefix + ' Telegram: ' + (success ? '成功' : '失败'));
    results.push({ channel: 'telegram', success });
  }
  if (notifiers.includes('webhook')) {
    const success = await sendWebhookNotification(title, plainContent, config, metadata);
    console.log(logPrefix + ' Webhook: ' + (success ? '成功' : '失败'));
    results.push({ channel: 'webhook', success });
  }
  if (notifiers.includes('wechatbot')) {
    const success = await sendWechatBotNotification(title, plainContent, config);
    console.log(logPrefix + ' 企业微信机器人: ' + (success ? '成功' : '失败'));
    results.push({ channel: 'wechatbot', success });
  }
  if (notifiers.includes('dingtalk')) {
    const success = await sendDingTalkNotification(title, plainContent, config);
    console.log(logPrefix + ' 钉钉: ' + (success ? '成功' : '失败'));
    results.push({ channel: 'dingtalk', success });
  }
  if (notifiers.includes('feishu')) {
    const success = await sendFeishuNotification(title, plainContent, config);
    console.log(logPrefix + ' 飞书: ' + (success ? '成功' : '失败'));
    results.push({ channel: 'feishu', success });
  }
  if (notifiers.includes('bark')) {
    const success = await sendBarkNotification(title, plainContent, config);
    console.log(logPrefix + ' Bark: ' + (success ? '成功' : '失败'));
    results.push({ channel: 'bark', success });
  }
  if (notifiers.includes('email')) {
    const success = await sendEmailNotification(title, plainContent, config);
    console.log(logPrefix + ' 邮件: ' + (success ? '成功' : '失败'));
    results.push({ channel: 'email', success });
  }
  return results;
}

// ==================== 订阅数据操作 ====================

async function getSubscriptions() {
  try {
    const data = await SUB_KV.get('subscriptions', 'json');
    return data || [];
  } catch (e) {
    return [];
  }
}

async function saveSubscriptions(subs) {
  await SUB_KV.put('subscriptions', JSON.stringify(subs));
}

// ==================== 通知检查与发送 ====================

async function checkAndSendNotifications() {
  const config = await getConfig();
  const notifiers = config.ENABLED_NOTIFIERS || [];
  if (!notifiers.length) return;

  const subs = await getSubscriptions();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const notifiedKey = 'notified_' + today;
  const alreadyNotified = await SUB_KV.get(notifiedKey, 'json') || [];

  const toNotify = [];
  for (const sub of subs) {
    if (!sub.notifyEnabled) continue;
    const nextDate = new Date(sub.nextDate);
    const daysDiff = Math.ceil((nextDate - now) / (1000 * 60 * 60 * 24));
    const notifyDays = sub.notifyDays || 3;
    if (daysDiff <= notifyDays && daysDiff >= 0 && !alreadyNotified.includes(sub.id)) {
      toNotify.push({ ...sub, daysDiff });
    }
  }

  if (!toNotify.length) return;

  for (const sub of toNotify) {
    const title = '订阅到期提醒：' + sub.name;
    const content = '服务：' + sub.name + '\n价格：' + (sub.currency === 'CNY' ? '¥' : sub.currency) + sub.price.toFixed(2) + '/' + sub.cycle + '\n到期日期：' + sub.nextDate + '\n剩余天数：' + sub.daysDiff + ' 天\n备注：' + (sub.note || '无');
    await sendNotificationToAllChannels(title, content, config, '[到期提醒]');
    alreadyNotified.push(sub.id);
  }

  await SUB_KV.put(notifiedKey, JSON.stringify(alreadyNotified));
}

// ==================== 前端页面 HTML ====================

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>订阅管理中心 - 登录</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:100vh;display:flex;align-items:center;justify-content:center}
.box{background:#fff;padding:48px 40px;border-radius:20px;box-shadow:0 25px 80px rgba(0,0,0,0.3);width:90%;max-width:400px;text-align:center}
.box h1{font-size:28px;margin-bottom:8px;color:#1a202c}
.box p{color:#718096;margin-bottom:32px;font-size:15px}
label{display:block;text-align:left;margin-bottom:8px;font-size:14px;font-weight:500;color:#4a5568}
input{width:100%;padding:14px 16px;border:2px solid #e2e8f0;border-radius:10px;font-size:16px;transition:all .3s;margin-bottom:20px}
input:focus{outline:none;border-color:#667eea;box-shadow:0 0 0 3px rgba(102,126,234,0.1)}
button{width:100%;padding:14px;background:#667eea;color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;transition:all .3s}
button:hover{background:#5a67d8;transform:translateY(-1px)}
.error{color:#e53e3e;font-size:14px;margin-top:16px;display:none;padding:10px;background:#fff5f5;border-radius:8px;border:1px solid #fed7d7}
.error.show{display:block}
.icon{font-size:48px;margin-bottom:16px}
</style>
</head>
<body>
<div class="box">
<div class="icon">&#128272;</div>
<h1>订阅管理中心</h1>
<p>请输入访问码以进入系统</p>
<label>访问码</label>
<input type="password" id="code" placeholder="请输入访问码" autofocus>
<button onclick="login()">进入系统</button>
<div class="error" id="error">访问码错误，请重试</div>
</div>
<script>
async function login(){
const code=document.getElementById('code').value;
const res=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
if(res.ok){
document.cookie='sub_token=1; path=/; max-age=86400; SameSite=Strict';
location.href='/';
}else{
document.getElementById('error').classList.add('show');
document.getElementById('code').value='';
}
}
document.getElementById('code').addEventListener('keypress',e=>{if(e.key==='Enter')login()});
</script>
</body>
</html>`;

const APP_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>订阅管理中心</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f7fafc;color:#2d3748;line-height:1.6}
.container{max-width:1200px;margin:0 auto;padding:20px}
.header{background:#fff;padding:24px;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,0.1);margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}
.header h1{font-size:26px}
.header p{color:#718096;font-size:14px;margin-top:4px}
.nav{display:flex;gap:12px;flex-wrap:wrap}
.nav a{color:#667eea;text-decoration:none;padding:8px 16px;border-radius:8px;font-size:14px;font-weight:500;transition:all .2s}
.nav a:hover{background:#edf2f7}
.nav a.active{background:#667eea;color:#fff}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;margin-bottom:24px}
.stat-card{background:#fff;padding:24px;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,0.1)}
.stat-card h3{font-size:13px;color:#718096;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
.stat-card .value{font-size:36px;font-weight:700}
.stat-card .value.active{color:#48bb78}
.stat-card .value.warning{color:#ed8936}
.stat-card .value.danger{color:#e53e3e}
.stat-card .value.info{color:#667eea}
.toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;gap:16px;flex-wrap:wrap}
.btn{padding:10px 20px;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;transition:all .2s;display:inline-flex;align-items:center;gap:8px}
.btn-primary{background:#667eea;color:#fff}
.btn-primary:hover{background:#5a67d8}
.btn-secondary{background:#edf2f7;color:#4a5568}
.btn-secondary:hover{background:#e2e8f0}
.btn-danger{background:#fc8181;color:#fff}
.btn-danger:hover{background:#f56565}
.search-box{padding:10px 16px;border:1px solid #e2e8f0;border-radius:10px;width:280px;font-size:14px;transition:border-color .3s}
.search-box:focus{outline:none;border-color:#667eea}
.table-wrap{background:#fff;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,0.1);overflow:hidden}
table{width:100%;border-collapse:collapse}
th,td{padding:16px;text-align:left}
th{background:#f7fafc;font-weight:600;font-size:13px;color:#4a5568;text-transform:uppercase;letter-spacing:.5px}
tr{border-bottom:1px solid #edf2f7;transition:background .2s}
tr:hover{background:#f7fafc}
tr:last-child{border-bottom:none}
.tag{padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;display:inline-block}
.tag-active{background:#c6f6d5;color:#22543d}
.tag-warning{background:#fefcbf;color:#744210}
.tag-expired{background:#fed7d7;color:#742a2a}
.price{font-weight:700;color:#2d3748}
.cycle{color:#718096;font-size:13px}
.actions{display:flex;gap:6px}
.icon-btn{width:34px;height:34px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;transition:all .2s}
.icon-btn:hover{background:#edf2f7;border-color:#cbd5e0}
.empty{text-align:center;padding:80px 20px;color:#a0aec0}
.empty h3{color:#4a5568;margin-bottom:8px}
.modal-bg{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:none;align-items:center;justify-content:center;z-index:100;backdrop-filter:blur(4px)}
.modal-bg.open{display:flex}
.modal{background:#fff;border-radius:20px;width:90%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 25px 80px rgba(0,0,0,0.3)}
.modal-header{padding:24px;border-bottom:1px solid #edf2f7;display:flex;justify-content:space-between;align-items:center}
.modal-header h3{font-size:18px}
.modal-body{padding:24px}
.form-group{margin-bottom:20px}
.form-group label{display:block;margin-bottom:8px;font-weight:600;font-size:14px;color:#4a5568}
.form-group input,.form-group select{width:100%;padding:12px 14px;border:1px solid #e2e8f0;border-radius:10px;font-size:15px;transition:border-color .3s}
.form-group input:focus,.form-group select:focus{outline:none;border-color:#667eea}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.modal-footer{padding:20px 24px;border-top:1px solid #edf2f7;display:flex;justify-content:flex-end;gap:12px}
.toast{position:fixed;bottom:24px;right:24px;padding:14px 24px;border-radius:12px;color:#fff;font-weight:600;transform:translateY(120px);transition:transform .3s cubic-bezier(0.34,1.56,0.64,1);z-index:200;box-shadow:0 10px 40px rgba(0,0,0,0.2)}
.toast.show{transform:translateY(0)}
.toast.success{background:#48bb78}
.toast.error{background:#e53e3e}
.notify-check{display:flex;align-items:center;gap:8px;margin-top:8px}
.notify-check input{width:auto}
.notify-check label{margin:0;font-weight:normal}
.config-section{display:none;margin-top:16px;padding:16px;background:#f7fafc;border-radius:12px}
.config-section.active{display:block}
.config-section h4{font-size:15px;margin-bottom:12px;color:#2d3748}
.config-section input,.config-section select{margin-bottom:12px}
.config-section .hint{font-size:12px;color:#718096;margin-top:-8px;margin-bottom:12px}
.checkbox-group{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px}
.checkbox-group label{display:flex;align-items:center;gap:6px;font-weight:normal;cursor:pointer}
.checkbox-group input{width:auto}
@media(max-width:768px){
.stats{grid-template-columns:1fr 1fr}
.toolbar{flex-direction:column;align-items:stretch}
.search-box{width:100%}
.form-row{grid-template-columns:1fr}
th,td{padding:12px 8px;font-size:14px}
.header{flex-direction:column;gap:16px;text-align:center}
}
</style>
</head>
<body>
<div class="container">
<div class="header">
<div>
<h1>&#128202; 订阅管理中心</h1>
<p>管理你的所有订阅服务</p>
</div>
<div class="nav">
<a href="/" class="active" id="navHome">订阅列表</a>
<a href="/settings" id="navSettings">&#9881; 通知设置</a>
<a href="/api/logout">&#128682; 退出</a>
</div>
</div>

<div id="pageHome">
<div class="stats">
<div class="stat-card"><h3>活跃订阅</h3><div class="value active" id="statActive">0</div></div>
<div class="stat-card"><h3>即将到期</h3><div class="value warning" id="statSoon">0</div></div>
<div class="stat-card"><h3>月付总额</h3><div class="value info" id="statMonthly">0</div></div>
<div class="stat-card"><h3>总订阅数</h3><div class="value" id="statTotal" style="color:#4a5568">0</div></div>
</div>
<div class="toolbar">
<button class="btn btn-primary" onclick="openModal()"><span>+</span> 新增订阅</button>
<input type="text" class="search-box" id="search" placeholder="&#128269; 搜索订阅..." oninput="render()">
</div>
<div class="table-wrap" id="tableWrap">
<div class="empty" id="empty">
<h3>暂无订阅</h3>
<p>点击上方按钮添加你的第一个订阅</p>
</div>
<table id="table" style="display:none">
<thead><tr><th>服务</th><th>价格</th><th>周期</th><th>下次扣费</th><th>状态</th><th>通知</th><th>备注</th><th>操作</th></tr></thead>
<tbody id="tbody"></tbody>
</table>
</div>
</div>

<div id="pageSettings" style="display:none">
<div class="table-wrap" style="padding:24px">
<h2 style="margin-bottom:20px">&#128276; 通知接口设置</h2>
<div class="form-group">
<label>启用通知渠道（多选）</label>
<div class="checkbox-group">
<label><input type="checkbox" id="enTelegram" value="telegram"> Telegram</label>
<label><input type="checkbox" id="enNotifyX" value="notifyx"> NotifyX</label>
<label><input type="checkbox" id="enWebhook" value="webhook"> Webhook</label>
<label><input type="checkbox" id="enWechatBot" value="wechatbot"> 企业微信机器人</label>
<label><input type="checkbox" id="enDingTalk" value="dingtalk"> 钉钉</label>
<label><input type="checkbox" id="enFeishu" value="feishu"> 飞书</label>
<label><input type="checkbox" id="enBark" value="bark"> Bark</label>
<label><input type="checkbox" id="enEmail" value="email"> 邮件</label>
</div>
</div>
<div id="cfgTelegram" class="config-section"><h4>Telegram 配置</h4><label>Bot Token</label><input type="text" id="tgBotToken" placeholder="从 @BotFather 获取"><label>Chat ID</label><input type="text" id="tgChatId" placeholder="可从 @userinfobot 获取"></div>
<div id="cfgNotifyX" class="config-section"><h4>NotifyX 配置</h4><label>API Key</label><input type="text" id="notifyxApiKey" placeholder="从 NotifyX 平台获取"></div>
<div id="cfgWebhook" class="config-section"><h4>Webhook 配置</h4><label>URL</label><input type="url" id="webhookUrl" placeholder="https://your-webhook.com"><label>请求方法</label><select id="webhookMethod"><option value="POST">POST</option><option value="GET">GET</option><option value="PUT">PUT</option></select><label>自定义请求头 (JSON)</label><input type="text" id="webhookHeaders" placeholder='{"Authorization":"Bearer xxx"}'><label>消息模板 (JSON)</label><input type="text" id="webhookTemplate" placeholder='{"title":"{{title}}","content":"{{content}}"}'></div>
<div id="cfgWechatBot" class="config-section"><h4>企业微信机器人配置</h4><label>Webhook URL</label><input type="url" id="wechatbotWebhook" placeholder="https://qyapi.weixin.qq.com/..."><label>消息类型</label><select id="wechatbotMsgType"><option value="text">文本</option><option value="markdown">Markdown</option></select><label>@手机号 (逗号分隔)</label><input type="text" id="wechatbotAtMobiles" placeholder="13800138000"><label class="notify-check"><input type="checkbox" id="wechatbotAtAll"> @所有人</label></div>
<div id="cfgDingTalk" class="config-section"><h4>钉钉配置</h4><label>Webhook URL</label><input type="url" id="dingtalkWebhook" placeholder="https://oapi.dingtalk.com/..."><label>签名密钥 (可选)</label><input type="text" id="dingtalkSecret" placeholder="SECxxx"><label>消息类型</label><select id="dingtalkMsgType"><option value="text">文本</option><option value="markdown">Markdown</option></select><label>@手机号 (逗号分隔)</label><input type="text" id="dingtalkAtMobiles" placeholder="13800138000"><label class="notify-check"><input type="checkbox" id="dingtalkAtAll"> @所有人</label></div>
<div id="cfgFeishu" class="config-section"><h4>飞书配置</h4><label>Webhook URL</label><input type="url" id="feishuWebhook" placeholder="https://open.feishu.cn/..."><label>签名密钥 (可选)</label><input type="text" id="feishuSecret" placeholder="签名密钥"><label>消息类型</label><select id="feishuMsgType"><option value="text">文本</option><option value="post">富文本</option></select></div>
<div id="cfgBark" class="config-section"><h4>Bark 配置</h4><label>服务器地址</label><input type="url" id="barkServer" placeholder="https://api.day.app" value="https://api.day.app"><label>设备Key</label><input type="text" id="barkDeviceKey" placeholder="从 Bark App 获取"><label class="notify-check"><input type="checkbox" id="barkIsArchive"> 保存到历史记录</label></div>
<div id="cfgEmail" class="config-section"><h4>邮件配置 (Resend)</h4><label>API Key</label><input type="text" id="resendApiKey" placeholder="re_xxxxxxxx"><label>发件人邮箱</label><input type="email" id="emailFrom" placeholder="noreply@yourdomain.com"><label>发件人名称</label><input type="text" id="emailFromName" placeholder="订阅提醒系统"><label>收件人邮箱</label><input type="email" id="emailTo" placeholder="user@example.com"></div>
<div style="display:flex;gap:12px;justify-content:flex-end;margin-top:20px">
<button class="btn btn-secondary" onclick="testAllNotifications()">&#129514; 测试所有渠道</button>
<button class="btn btn-primary" onclick="saveSettings()">&#128190; 保存设置</button>
</div>
</div>
</div>
</div>

<div class="modal-bg" id="modalBg">
<div class="modal">
<div class="modal-header"><h3 id="modalTitle">新增订阅</h3><button class="icon-btn" onclick="closeModal()">&#10005;</button></div>
<div class="modal-body">
<div class="form-group"><label>服务名称 *</label><input type="text" id="mName" placeholder="例如：Netflix、Spotify"></div>
<div class="form-row">
<div class="form-group"><label>价格 *</label><input type="number" id="mPrice" placeholder="29.99" step="0.01"></div>
<div class="form-group"><label>货币</label><select id="mCurrency"><option value="CNY">CNY &#165;</option><option value="USD">USD &#36;</option><option value="EUR">EUR &#8364;</option><option value="GBP">GBP &#163;</option><option value="JPY">JPY &#165;</option></select></div>
</div>
<div class="form-row">
<div class="form-group"><label>付费周期 *</label><select id="mCycle"><option value="monthly">月付</option><option value="quarterly">季付</option><option value="yearly">年付</option><option value="weekly">周付</option></select></div>
<div class="form-group"><label>下次扣费日期 *</label><input type="date" id="mNextDate"></div>
</div>
<div class="form-group"><label>提前通知天数</label><input type="number" id="mNotifyDays" placeholder="3" value="3" min="0" max="30"></div>
<div class="form-group"><label class="notify-check"><input type="checkbox" id="mNotifyEnabled" checked> 启用到期通知</label></div>
<div class="form-group"><label>备注</label><input type="text" id="mNote" placeholder="可选"></div>
</div>
<div class="modal-footer"><button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="save()">保存</button></div>
</div>
</div>

<div class="toast" id="toast"></div>

<script>
let subs=[];let editingId=null;
const sym={CNY:'&#165;',USD:'&#36;',EUR:'&#8364;',GBP:'&#163;',JPY:'&#165;'};
const cycleMap={weekly:'周付',monthly:'月付',quarterly:'季付',yearly:'年付'};

function showPage(page){
document.getElementById('pageHome').style.display=page==='home'?'block':'none';
document.getElementById('pageSettings').style.display=page==='settings'?'block':'none';
document.getElementById('navHome').className=page==='home'?'active':'';
document.getElementById('navSettings').className=page==='settings'?'active':'';
if(page==='home')load();else loadSettings();
}
document.getElementById('navHome').onclick=function(e){e.preventDefault();showPage('home')};
document.getElementById('navSettings').onclick=function(e){e.preventDefault();showPage('settings')};
if(location.hash==='#settings')showPage('settings');

async function load(){
const res=await fetch('/api/subscriptions');
if(!res.ok)return location.reload();
subs=await res.json();
render();stats();
}

function render(){
const q=document.getElementById('search').value.toLowerCase();
const filtered=subs.filter(s=>s.name.toLowerCase().includes(q)||(s.note&&s.note.toLowerCase().includes(q)));
const empty=document.getElementById('empty');
const table=document.getElementById('table');
const tbody=document.getElementById('tbody');
if(filtered.length===0){empty.style.display='block';table.style.display='none';return;}
empty.style.display='none';table.style.display='table';
tbody.innerHTML=filtered.map(s=>{
const st=getStatus(s.nextDate);
return '<tr><td><strong>'+esc(s.name)+'</strong></td><td class="price">'+(sym[s.currency]||s.currency)+s.price.toFixed(2)+'</td><td class="cycle">'+(cycleMap[s.cycle]||s.cycle)+'</td><td>'+fmtDate(s.nextDate)+'</td><td><span class="tag tag-'+st.cls+'">'+st.text+'</span></td><td>'+(s.notifyEnabled?'&#9989;':'&#10060;')+'</td><td>'+esc(s.note||'-')+'</td><td><div class="actions"><button class="icon-btn" onclick="edit(\''+s.id+'\')" title="编辑">&#9999;</button><button class="icon-btn" onclick="del(\''+s.id+'\')" title="删除">&#128465;</button></div></td></tr>';
}).join('');
}

function stats(){
const now=new Date();
const soon=new Date();soon.setDate(soon.getDate()+7);
const active=subs.filter(s=>new Date(s.nextDate)>=now).length;
const soonCount=subs.filter(s=>{const d=new Date(s.nextDate);return d>=now&&d<=soon;}).length;
let monthly=0;
const rate={weekly:4.33,monthly:1,quarterly:1/3,yearly:1/12};
const fx={CNY:1,USD:7.2,EUR:7.8,GBP:9.1,JPY:0.05};
subs.forEach(s=>{monthly+=s.price*(rate[s.cycle]||1)*(fx[s.currency]||1);});
document.getElementById('statActive').textContent=active;
document.getElementById('statSoon').textContent=soonCount;
document.getElementById('statMonthly').textContent='&#165;'+monthly.toFixed(0);
document.getElementById('statTotal').textContent=subs.length;
}

function getStatus(dateStr){
const d=new Date(dateStr);
const now=new Date();
const soon=new Date();soon.setDate(soon.getDate()+7);
if(d<now)return{cls:'expired',text:'已过期'};
if(d<=soon)return{cls:'warning',text:'即将到期'};
return{cls:'active',text:'活跃'};
}

function fmtDate(d){return new Date(d).toLocaleDateString('zh-CN');}
function esc(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML;}

function openModal(){editingId=null;document.getElementById('modalTitle').textContent='新增订阅';['mName','mPrice','mNote'].forEach(id=>document.getElementById(id).value='');document.getElementById('mCurrency').value='CNY';document.getElementById('mCycle').value='monthly';document.getElementById('mNextDate').value='';document.getElementById('mNotifyDays').value='3';document.getElementById('mNotifyEnabled').checked=true;document.getElementById('modalBg').classList.add('open');}
function closeModal(){document.getElementById('modalBg').classList.remove('open');}

async function save(){
const data={name:document.getElementById('mName').value,price:parseFloat(document.getElementById('mPrice').value),currency:document.getElementById('mCurrency').value,cycle:document.getElementById('mCycle').value,nextDate:document.getElementById('mNextDate').value,notifyDays:parseInt(document.getElementById('mNotifyDays').value)||3,notifyEnabled:document.getElementById('mNotifyEnabled').checked,note:document.getElementById('mNote').value};
if(!data.name||!data.price||!data.nextDate){toast('请填写必填项','error');return;}
const url=editingId?'/api/subscriptions/'+editingId:'/api/subscriptions';
const method=editingId?'PUT':'POST';
const res=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
if(res.ok){closeModal();load();toast(editingId?'更新成功':'添加成功','success');}else{toast('操作失败','error');}
}

function edit(id){
const s=subs.find(x=>x.id===id);if(!s)return;editingId=id;
document.getElementById('modalTitle').textContent='编辑订阅';
document.getElementById('mName').value=s.name;
document.getElementById('mPrice').value=s.price;
document.getElementById('mCurrency').value=s.currency;
document.getElementById('mCycle').value=s.cycle;
document.getElementById('mNextDate').value=s.nextDate;
document.getElementById('mNotifyDays').value=s.notifyDays||3;
document.getElementById('mNotifyEnabled').checked=s.notifyEnabled!==false;
document.getElementById('mNote').value=s.note||'';
document.getElementById('modalBg').classList.add('open');
}

async function del(id){if(!confirm('确定删除？'))return;const res=await fetch('/api/subscriptions/'+id,{method:'DELETE'});if(res.ok){load();toast('删除成功','success');}}

function toast(msg,type){
const t=document.getElementById('toast');t.textContent=msg;t.className='toast '+type;
setTimeout(()=>t.classList.add('show'),10);
setTimeout(()=>t.classList.remove('show'),3000);
}

const channels=['telegram','notifyx','webhook','wechatbot','dingtalk','feishu','bark','email'];
channels.forEach(ch=>{
document.getElementById('en'+ch.charAt(0).toUpperCase()+ch.slice(1)).addEventListener('change',toggleConfigSections);
});
function toggleConfigSections(){
channels.forEach(ch=>{
const cb=document.getElementById('en'+ch.charAt(0).toUpperCase()+ch.slice(1));
document.getElementById('cfg'+ch.charAt(0).toUpperCase()+ch.slice(1)).className=cb.checked?'config-section active':'config-section';
});
}

async function loadSettings(){
const res=await fetch('/api/config');
if(!res.ok)return;
const cfg=await res.json();
const enabled=cfg.ENABLED_NOTIFIERS||[];
channels.forEach(ch=>{
document.getElementById('en'+ch.charAt(0).toUpperCase()+ch.slice(1)).checked=enabled.includes(ch);
});
toggleConfigSections();
if(cfg.TG_BOT_TOKEN)document.getElementById('tgBotToken').value=cfg.TG_BOT_TOKEN;
if(cfg.TG_CHAT_ID)document.getElementById('tgChatId').value=cfg.TG_CHAT_ID;
if(cfg.NOTIFYX_API_KEY)document.getElementById('notifyxApiKey').value=cfg.NOTIFYX_API_KEY;
if(cfg.WEBHOOK_URL)document.getElementById('webhookUrl').value=cfg.WEBHOOK_URL;
if(cfg.WEBHOOK_METHOD)document.getElementById('webhookMethod').value=cfg.WEBHOOK_METHOD;
if(cfg.WEBHOOK_HEADERS)document.getElementById('webhookHeaders').value=cfg.WEBHOOK_HEADERS;
if(cfg.WEBHOOK_TEMPLATE)document.getElementById('webhookTemplate').value=cfg.WEBHOOK_TEMPLATE;
if(cfg.WECHATBOT_WEBHOOK)document.getElementById('wechatbotWebhook').value=cfg.WECHATBOT_WEBHOOK;
if(cfg.WECHATBOT_MSG_TYPE)document.getElementById('wechatbotMsgType').value=cfg.WECHATBOT_MSG_TYPE;
if(cfg.WECHATBOT_AT_MOBILES)document.getElementById('wechatbotAtMobiles').value=cfg.WECHATBOT_AT_MOBILES;
if(cfg.WECHATBOT_AT_ALL)document.getElementById('wechatbotAtAll').checked=cfg.WECHATBOT_AT_ALL==='true';
if(cfg.DINGTALK_WEBHOOK)document.getElementById('dingtalkWebhook').value=cfg.DINGTALK_WEBHOOK;
if(cfg.DINGTALK_SECRET)document.getElementById('dingtalkSecret').value=cfg.DINGTALK_SECRET;
if(cfg.DINGTALK_MSG_TYPE)document.getElementById('dingtalkMsgType').value=cfg.DINGTALK_MSG_TYPE;
if(cfg.DINGTALK_AT_MOBILES)document.getElementById('dingtalkAtMobiles').value=cfg.DINGTALK_AT_MOBILES;
if(cfg.DINGTALK_AT_ALL)document.getElementById('dingtalkAtAll').checked=cfg.DINGTALK_AT_ALL==='true';
if(cfg.FEISHU_WEBHOOK)document.getElementById('feishuWebhook').value=cfg.FEISHU_WEBHOOK;
if(cfg.FEISHU_SECRET)document.getElementById('feishuSecret').value=cfg.FEISHU_SECRET;
if(cfg.FEISHU_MSG_TYPE)document.getElementById('feishuMsgType').value=cfg.FEISHU_MSG_TYPE;
if(cfg.BARK_SERVER)document.getElementById('barkServer').value=cfg.BARK_SERVER;
if(cfg.BARK_DEVICE_KEY)document.getElementById('barkDeviceKey').value=cfg.BARK_DEVICE_KEY;
if(cfg.BARK_IS_ARCHIVE)document.getElementById('barkIsArchive').checked=cfg.BARK_IS_ARCHIVE==='true';
if(cfg.RESEND_API_KEY)document.getElementById('resendApiKey').value=cfg.RESEND_API_KEY;
if(cfg.EMAIL_FROM)document.getElementById('emailFrom').value=cfg.EMAIL_FROM;
if(cfg.EMAIL_FROM_NAME)document.getElementById('emailFromName').value=cfg.EMAIL_FROM_NAME;
if(cfg.EMAIL_TO)document.getElementById('emailTo').value=cfg.EMAIL_TO;
}

async function saveSettings(){
const enabled=channels.filter(ch=>document.getElementById('en'+ch.charAt(0).toUpperCase()+ch.slice(1)).checked);
if(enabled.length===0){toast('请至少选择一种通知渠道','error');return;}
const cfg={
ENABLED_NOTIFIERS:enabled,
TG_BOT_TOKEN:document.getElementById('tgBotToken').value.trim(),
TG_CHAT_ID:document.getElementById('tgChatId').value.trim(),
NOTIFYX_API_KEY:document.getElementById('notifyxApiKey').value.trim(),
WEBHOOK_URL:document.getElementById('webhookUrl').value.trim(),
WEBHOOK_METHOD:document.getElementById('webhookMethod').value,
WEBHOOK_HEADERS:document.getElementById('webhookHeaders').value.trim(),
WEBHOOK_TEMPLATE:document.getElementById('webhookTemplate').value.trim(),
WECHATBOT_WEBHOOK:document.getElementById('wechatbotWebhook').value.trim(),
WECHATBOT_MSG_TYPE:document.getElementById('wechatbotMsgType').value,
WECHATBOT_AT_MOBILES:document.getElementById('wechatbotAtMobiles').value.trim(),
WECHATBOT_AT_ALL:document.getElementById('wechatbotAtAll').checked.toString(),
DINGTALK_WEBHOOK:document.getElementById('dingtalkWebhook').value.trim(),
DINGTALK_SECRET:document.getElementById('dingtalkSecret').value.trim(),
DINGTALK_MSG_TYPE:document.getElementById('dingtalkMsgType').value,
DINGTALK_AT_MOBILES:document.getElementById('dingtalkAtMobiles').value.trim(),
DINGTALK_AT_ALL:document.getElementById('dingtalkAtAll').checked.toString(),
FEISHU_WEBHOOK:document.getElementById('feishuWebhook').value.trim(),
FEISHU_SECRET:document.getElementById('feishuSecret').value.trim(),
FEISHU_MSG_TYPE:document.getElementById('feishuMsgType').value,
BARK_SERVER:document.getElementById('barkServer').value.trim()||'https://api.day.app',
BARK_DEVICE_KEY:document.getElementById('barkDeviceKey').value.trim(),
BARK_IS_ARCHIVE:document.getElementById('barkIsArchive').checked.toString(),
RESEND_API_KEY:document.getElementById('resendApiKey').value.trim(),
EMAIL_FROM:document.getElementById('emailFrom').value.trim(),
EMAIL_FROM_NAME:document.getElementById('emailFromName').value.trim(),
EMAIL_TO:document.getElementById('emailTo').value.trim()
};
const res=await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cfg)});
if(res.ok){toast('设置保存成功','success');}else{toast('保存失败','error');}
}

async function testAllNotifications(){
toast('正在测试所有启用的通知渠道...','success');
const res=await fetch('/api/test-notify',{method:'POST'});
const data=await res.json();
if(data.success){toast('测试完成，请查看各渠道','success');}else{toast('测试失败: '+data.message,'error');}
}

document.getElementById('modalBg').addEventListener('click',e=>{if(e.target===document.getElementById('modalBg'))closeModal();});
load();
</script>
</body>
</html>`;

// ==================== Edge Functions 路由 ====================

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // 1. 静态页面路由 - 检查访问码
  if (path === '/' || path === '/index.html' || path === '/settings') {
    const cookie = request.headers.get('Cookie') || '';
    const token = getCookieValue(cookie, 'sub_token');

    if (!token || !(await verifyToken(token, env))) {
      return new Response(LOGIN_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    return new Response(APP_HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  // 2. API 路由
  if (path === '/api/auth' && method === 'POST') {
    const body = await request.json();
    const isValid = await verifyAccessCode(body.code, env);
    if (isValid) {
      const token = await createToken(body.code);
      await storeToken(token);
      return json({ success: true });
    }
    return json({ success: false, message: '访问码错误' }, 401);
  }

  if (path === '/api/logout') {
    return new Response('', {
      status: 302,
      headers: {
        'Location': '/',
        'Set-Cookie': 'sub_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict'
      }
    });
  }

  // 后续 API 需要验证
  const cookie = request.headers.get('Cookie') || '';
  const token = getCookieValue(cookie, 'sub_token');
  if (!token || !(await verifyToken(token, env))) {
    return json({ error: '未授权' }, 401);
  }

  // 订阅 CRUD
  if (path === '/api/subscriptions') {
    if (method === 'GET') {
      const data = await getSubscriptions();
      return json(data);
    }
    if (method === 'POST') {
      const body = await request.json();
      const subs = await getSubscriptions();
      const newSub = {
        id: generateId(),
        ...body,
        createdAt: new Date().toISOString()
      };
      subs.push(newSub);
      await saveSubscriptions(subs);
      return json(newSub, 201);
    }
  }

  const subMatch = path.match(/^\/api\/subscriptions\/(.+)$/);
  if (subMatch) {
    const id = subMatch[1];
    let subs = await getSubscriptions();

    if (method === 'PUT') {
      const body = await request.json();
      const index = subs.findIndex(s => s.id === id);
      if (index === -1) return json({ error: '不存在' }, 404);
      subs[index] = { ...subs[index], ...body, updatedAt: new Date().toISOString() };
      await saveSubscriptions(subs);
      return json(subs[index]);
    }

    if (method === 'DELETE') {
      subs = subs.filter(s => s.id !== id);
      await saveSubscriptions(subs);
      return json({ success: true });
    }
  }

  // 配置 API
  if (path === '/api/config') {
    if (method === 'GET') {
      const cfg = await getConfig();
      const safe = { ...cfg };
      delete safe.ACCESS_CODE;
      return json(safe);
    }
    if (method === 'POST') {
      const body = await request.json();
      const cfg = await getConfig();
      const updated = { ...cfg, ...body };
      await saveConfig(updated);
      return json({ success: true });
    }
  }

  // 测试通知
  if (path === '/api/test-notify' && method === 'POST') {
    const cfg = await getConfig();
    const title = '测试通知';
    const content = '这是一条测试通知，用于验证通知渠道是否正常工作。\n\n发送时间：' + new Date().toLocaleString('zh-CN');
    const results = await sendNotificationToAllChannels(title, content, cfg, '[测试]');
    return json({ success: true, results });
  }

  // 手动触发通知检查
  if (path === '/api/check-notify' && method === 'POST') {
    await checkAndSendNotifications();
    return json({ success: true, message: '通知检查完成' });
  }

  return json({ error: 'Not Found' }, 404);
}

// 获取通知配置
export async function onRequestGet(context) {
  const { env } = context;
  const kv = env.SUB_KV;
  
  if (!kv) {
    return json({ error: 'KV 存储未配置' }, 500);
  }
  
  try {
    const config = await kv.get('notify_config', 'json') || {
      dingtalk: { enabled: false, webhook: '', secret: '' },
      feishu: { enabled: false, webhook: '', secret: '' },
      wecom: { enabled: false, webhook: '', key: '' },
      email: { enabled: false, smtpHost: '', smtpPort: 587, username: '', password: '', to: '' }
    };
    // 返回时隐藏敏感信息
    const safeConfig = {
      dingtalk: { enabled: config.dingtalk?.enabled || false, webhook: maskUrl(config.dingtalk?.webhook) },
      feishu: { enabled: config.feishu?.enabled || false, webhook: maskUrl(config.feishu?.webhook) },
      wecom: { enabled: config.wecom?.enabled || false, webhook: maskUrl(config.wecom?.webhook) },
      email: { enabled: config.email?.enabled || false, smtpHost: config.email?.smtpHost || '', smtpPort: config.email?.smtpPort || 587, username: config.email?.username || '', to: config.email?.to || '' }
    };
    return json(safeConfig);
  } catch (e) {
    return json({ error: '读取失败: ' + e.message }, 500);
  }
}

// 保存通知配置
export async function onRequestPost(context) {
  const { request, env } = context;
  const kv = env.SUB_KV;
  
  if (!kv) {
    return json({ error: 'KV 存储未配置' }, 500);
  }
  
  try {
    const body = await request.json();
    
    // 获取现有配置（保留密码等敏感字段）
    const existing = await kv.get('notify_config', 'json') || {};
    
    const config = {
      dingtalk: {
        enabled: body.dingtalk?.enabled || false,
        webhook: body.dingtalk?.webhook || existing.dingtalk?.webhook || '',
        secret: body.dingtalk?.secret || existing.dingtalk?.secret || ''
      },
      feishu: {
        enabled: body.feishu?.enabled || false,
        webhook: body.feishu?.webhook || existing.feishu?.webhook || '',
        secret: body.feishu?.secret || existing.feishu?.secret || ''
      },
      wecom: {
        enabled: body.wecom?.enabled || false,
        webhook: body.wecom?.webhook || existing.wecom?.webhook || '',
        key: body.wecom?.key || existing.wecom?.key || ''
      },
      email: {
        enabled: body.email?.enabled || false,
        smtpHost: body.email?.smtpHost || existing.email?.smtpHost || '',
        smtpPort: body.email?.smtpPort || existing.email?.smtpPort || 587,
        username: body.email?.username || existing.email?.username || '',
        password: body.email?.password || existing.email?.password || '',
        to: body.email?.to || existing.email?.to || ''
      }
    };
    
    await kv.put('notify_config', JSON.stringify(config));
    return json({ success: true });
  } catch (e) {
    return json({ error: '保存失败: ' + e.message }, 500);
  }
}

// 测试发送通知
export async function onRequestPut(context) {
  const { request, env } = context;
  const kv = env.SUB_KV;
  
  if (!kv) {
    return json({ error: 'KV 存储未配置' }, 500);
  }
  
  try {
    const { type } = await request.json();
    const config = await kv.get('notify_config', 'json');
    
    if (!config || !config[type]?.enabled) {
      return json({ error: '该通知渠道未启用' }, 400);
    }
    
    const testMsg = {
      title: '🔔 订阅管理中心 - 测试通知',
      content: '这是一条测试通知消息，如果你收到说明配置正确！'
    };
    
    let result;
    switch (type) {
      case 'dingtalk':
        result = await sendDingTalk(config.dingtalk, testMsg);
        break;
      case 'feishu':
        result = await sendFeishu(config.feishu, testMsg);
        break;
      case 'wecom':
        result = await sendWecom(config.wecom, testMsg);
        break;
      case 'email':
        result = await sendEmail(config.email, testMsg, env);
        break;
      default:
        return json({ error: '未知的通知类型' }, 400);
    }
    
    return json({ success: true, result });
  } catch (e) {
    return json({ error: '发送失败: ' + e.message }, 500);
  }
}

// 发送钉钉通知
async function sendDingTalk(config, msg) {
  const timestamp = Date.now();
  const sign = await generateDingSign(timestamp, config.secret);
  
  const url = config.webhook + (config.secret ? `&timestamp=${timestamp}&sign=${sign}` : '');
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'markdown',
      markdown: {
        title: msg.title,
        text: `### ${msg.title}\n${msg.content}`
      }
    })
  });
  
  return await res.json();
}

// 发送飞书通知
async function sendFeishu(config, msg) {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = await generateFeishuSign(timestamp, config.secret);
  
  const res = await fetch(config.webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msg_type: 'interactive',
      card: {
        header: {
          title: { tag: 'plain_text', content: msg.title }
        },
        elements: [{
          tag: 'div',
          text: { tag: 'lark_md', content: msg.content }
        }]
      },
      timestamp: timestamp.toString(),
      sign: sign
    })
  });
  
  return await res.json();
}

// 发送企业微信通知
async function sendWecom(config, msg) {
  const url = config.webhook || `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${config.key}`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'markdown',
      markdown: {
        content: `**${msg.title}**\n${msg.content}`
      }
    })
  });
  
  return await res.json();
}

// 发送邮件（简化版，实际生产建议使用第三方邮件服务）
async function sendEmail(config, msg, env) {
  // 这里仅返回配置信息，实际邮件发送需要在 Cloud Functions 中实现
  // Edge Functions 不支持直接发送 SMTP 邮件
  return { message: '邮件发送功能需要在 Cloud Functions 中实现', config: { to: config.to } };
}

// 生成钉钉签名
async function generateDingSign(timestamp, secret) {
  if (!secret) return '';
  const str = timestamp + '\n' + secret;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(str));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// 生成飞书签名
async function generateFeishuSign(timestamp, secret) {
  if (!secret) return '';
  const str = timestamp + '\n' + secret;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(str));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function maskUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.origin + '/****';
  } catch {
    return url.substring(0, 20) + '****';
  }
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

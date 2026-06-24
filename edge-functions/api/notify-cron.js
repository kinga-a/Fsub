// KV 访问辅助函数 - 兼容全局变量和 context.env 两种方式
function getKV(context) {
  if (typeof SUB_KV !== 'undefined') {
    return SUB_KV;
  }
  if (context && context.env && context.env.SUB_KV) {
    return context.env.SUB_KV;
  }
  if (typeof env !== 'undefined' && env.SUB_KV) {
    return env.SUB_KV;
  }
  throw new Error('SUB_KV 未定义，请检查 KV 命名空间是否已绑定到项目');
}

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

  // 验证 Cron 密钥
  const authHeader = request.headers.get('Authorization') || '';
  const cronToken = getEnv(context, 'CRON_TOKEN', 'your-cron-secret');
  if (!authHeader.includes(cronToken)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const kv = getKV(context);
    const subs = await kv.get('subscriptions', 'json') || [];
    const config = await kv.get('notify_config', 'json') || {};
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    let sent = 0;
    let skipped = 0;

    for (const sub of subs) {
      if (sub.enabled === false) {
        skipped++;
        continue;
      }

      const nextDate = new Date(sub.nextDate);
      const notifyDate = new Date(nextDate);
      notifyDate.setDate(notifyDate.getDate() - (sub.notifyDays || 3));

      const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
      const notifyDateStart = new Date(notifyDate); notifyDateStart.setHours(0,0,0,0);

      if (todayStart < notifyDateStart || todayStart > nextDate) {
        skipped++;
        continue;
      }

      const [notifyHour, notifyMinute] = (sub.notifyTime || '11:00').split(':').map(Number);
      if (currentHour !== notifyHour || currentMinute > 5) {
        skipped++;
        continue;
      }

      const todayKey = `notified_${sub.id}_${now.toISOString().split('T')[0]}`;
      const alreadyNotified = await kv.get(todayKey);
      if (alreadyNotified) {
        skipped++;
        continue;
      }

      const msg = {
        title: `🔔 ${sub.name} 即将到期`,
        content: `服务：**${sub.name}**
类型：**${sub.type || '未分类'}**
下次到期：**${sub.nextDate}**
价格：${sub.price === 0 ? '免费' : sub.price + ' ' + sub.currency}

请及时处理或续费！`
      };

      const channels = sub.notifyChannels || [];
      const results = [];
      const targetChannels = channels.length > 0 ? channels : ['dingtalk', 'feishu', 'wecom', 'email'];

      for (const ch of targetChannels) {
        if (ch === 'dingtalk' && config.dingtalk?.enabled) {
          results.push(await sendDingTalk(config.dingtalk, msg));
        }
        if (ch === 'feishu' && config.feishu?.enabled) {
          results.push(await sendFeishu(config.feishu, msg));
        }
        if (ch === 'wecom' && config.wecom?.enabled) {
          results.push(await sendWecom(config.wecom, msg));
        }
        if (ch === 'email' && config.email?.enabled) {
          results.push(await sendEmail(config.email, msg));
        }
      }

      await kv.put(todayKey, '1', { expirationTtl: 86400 });
      sent++;
    }

    return json({ success: true, sent, skipped, checked: subs.length });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

async function sendDingTalk(config, msg) {
  try {
    const timestamp = Date.now();
    const sign = await generateDingSign(timestamp, config.secret);
    const url = config.webhook + (config.secret ? `&timestamp=${timestamp}&sign=${sign}` : '');

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { title: msg.title, text: `### ${msg.title}
${msg.content}` }
      })
    });
    return { channel: 'dingtalk', success: res.ok, result: await res.json() };
  } catch (e) {
    return { channel: 'dingtalk', success: false, error: e.message };
  }
}

async function sendFeishu(config, msg) {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = await generateFeishuSign(timestamp, config.secret);

    const res = await fetch(config.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msg_type: 'interactive',
        card: {
          header: { title: { tag: 'plain_text', content: msg.title } },
          elements: [{ tag: 'div', text: { tag: 'lark_md', content: msg.content } }]
        },
        timestamp: timestamp.toString(),
        sign: sign
      })
    });
    return { channel: 'feishu', success: res.ok, result: await res.json() };
  } catch (e) {
    return { channel: 'feishu', success: false, error: e.message };
  }
}

async function sendWecom(config, msg) {
  try {
    const url = config.webhook || `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${config.key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { content: `**${msg.title}**
${msg.content}` }
      })
    });
    return { channel: 'wecom', success: res.ok, result: await res.json() };
  } catch (e) {
    return { channel: 'wecom', success: false, error: e.message };
  }
}

async function sendEmail(config, msg) {
  return { channel: 'email', success: false, message: '邮件发送功能需要在 Cloud Functions 中实现' };
}

async function generateDingSign(timestamp, secret) {
  if (!secret) return '';
  const str = timestamp + '
' + secret;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(str));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function generateFeishuSign(timestamp, secret) {
  if (!secret) return '';
  const str = timestamp + '
' + secret;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(str));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

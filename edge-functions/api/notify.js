export async function onRequestGet(context) {
  try {
    const config = await SUB_KV.get('notify_config', 'json') || {
      dingtalk: { enabled: false, webhook: '', secret: '' },
      feishu: { enabled: false, webhook: '', secret: '' },
      wecom: { enabled: false, webhook: '', key: '' },
      email: { enabled: false, smtpHost: '', smtpPort: 587, username: '', password: '', to: '' }
    };
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

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 根据路径判断：/api/notify-cron 是定时任务，/api/notify 是保存配置
  if (url.pathname === '/api/notify-cron' || url.pathname.endsWith('/notify-cron')) {
    return handleCron(context);
  }

  // 保存配置
  try {
    const body = await request.json();
    const existing = await SUB_KV.get('notify_config', 'json') || {};

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

    await SUB_KV.put('notify_config', JSON.stringify(config));
    return json({ success: true });
  } catch (e) {
    return json({ error: '保存失败: ' + e.message }, 500);
  }
}

export async function onRequestPut(context) {
  const { request } = context;

  try {
    const { type, subId } = await request.json();
    const config = await SUB_KV.get('notify_config', 'json');

    if (!config || !config[type]?.enabled) {
      return json({ error: '该通知渠道未启用' }, 400);
    }

    let testMsg = {
      title: '🔔 订阅管理中心 - 测试通知',
      content: '这是一条测试通知消息，如果你收到说明配置正确！'
    };

    if (subId) {
      const subs = await SUB_KV.get('subscriptions', 'json') || [];
      const sub = subs.find(s => s.id === subId);
      if (sub) {
        testMsg = {
          title: `🔔 ${sub.name} - 测试通知`,
          content: `服务：**${sub.name}**\n到期日：**${sub.nextDate}**\n价格：${sub.price === 0 ? '免费' : sub.price + ' ' + sub.currency}\n\n这是一条手动测试通知。`
        };
      }
    }

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
        result = await sendEmail(config.email, testMsg);
        break;
      default:
        return json({ error: '未知的通知类型' }, 400);
    }

    return json({ success: true, result });
  } catch (e) {
    return json({ error: '发送失败: ' + e.message }, 500);
  }
}

// ========== Cron 定时通知 ==========
async function handleCron(context) {
  const { request, env } = context;

  // 验证 Cron 密钥（防止被恶意调用）
  const authHeader = request.headers.get('Authorization') || '';
  const cronToken = env.CRON_TOKEN || 'your-cron-secret';
  if (!authHeader.includes(cronToken)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const subs = await SUB_KV.get('subscriptions', 'json') || [];
    const config = await SUB_KV.get('notify_config', 'json') || {};
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    let sent = 0;
    let skipped = 0;
    const results = [];

    for (const sub of subs) {
      if (sub.enabled === false) {
        skipped++;
        continue;
      }

      const nextDate = new Date(sub.nextDate);
      const notifyDays = sub.notifyDays || 3;
      const notifyDate = new Date(nextDate);
      notifyDate.setDate(notifyDate.getDate() - notifyDays);

      const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
      const notifyDateStart = new Date(notifyDate); notifyDateStart.setHours(0,0,0,0);

      // 今天是否在提醒窗口内（notifyDate <= today <= nextDate）
      if (todayStart < notifyDateStart || todayStart > nextDate) {
        skipped++;
        continue;
      }

      // 时间匹配：允许前后5分钟容错（与之前可用版本一致）
      const [notifyHour, notifyMinute] = (sub.notifyTime || '11:00').split(':').map(Number);
      if (currentHour !== notifyHour || currentMinute > 5) {
        skipped++;
        continue;
      }

      // 检查今天是否已经通知过
      const todayKey = `notified_${sub.id}_${now.toISOString().split('T')[0]}`;
      const alreadyNotified = await SUB_KV.get(todayKey);
      if (alreadyNotified) {
        skipped++;
        continue;
      }

      const msg = {
        title: `🔔 ${sub.name} 即将到期`,
        content: `服务：**${sub.name}**\n类型：**${sub.type || '未分类'}**\n下次到期：**${sub.nextDate}**\n价格：${sub.price === 0 ? '免费' : sub.price + ' ' + sub.currency}\n\n请及时处理或续费！`
      };

      // 兼容新旧字段：优先使用 notifyChannels 数组，否则回退到旧布尔字段
      let channels = [];
      if (sub.notifyChannels && Array.isArray(sub.notifyChannels) && sub.notifyChannels.length > 0) {
        channels = sub.notifyChannels;
      } else {
        if (sub.notifyDingtalk) channels.push('dingtalk');
        if (sub.notifyFeishu) channels.push('feishu');
        if (sub.notifyWecom) channels.push('wecom');
        if (sub.notifyEmail) channels.push('email');
      }

      const targetChannels = channels.length > 0 ? channels : ['dingtalk', 'feishu', 'wecom', 'email'];
      const channelResults = [];

      for (const ch of targetChannels) {
        if (ch === 'dingtalk' && config.dingtalk?.enabled) {
          channelResults.push(await sendDingTalk(config.dingtalk, msg));
        }
        if (ch === 'feishu' && config.feishu?.enabled) {
          channelResults.push(await sendFeishu(config.feishu, msg));
        }
        if (ch === 'wecom' && config.wecom?.enabled) {
          channelResults.push(await sendWecom(config.wecom, msg));
        }
        if (ch === 'email' && config.email?.enabled) {
          channelResults.push(await sendEmail(config.email, msg));
        }
      }

      await SUB_KV.put(todayKey, '1', { expirationTtl: 86400 });
      sent++;
      results.push({
        sub: sub.name,
        channels: channelResults
      });
    }

    return json({ success: true, sent, skipped, checked: subs.length, results });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ========== 通知发送函数 ==========
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
        markdown: { title: msg.title, text: `### ${msg.title}\n${msg.content}` }
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
        markdown: { content: `**${msg.title}**\n${msg.content}` }
      })
    });
    return { channel: 'wecom', success: res.ok, result: await res.json() };
  } catch (e) {
    return { channel: 'wecom', success: false, error: e.message };
  }
}

async function sendEmail(config, msg) {
  return { channel: 'email', success: false, message: '邮件发送功能需要在 Cloud Functions 中实现', config: { to: config.to } };
}

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
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const authHeader = request.headers.get('Authorization') || '';
  const cronToken = env.CRON_TOKEN || 'your-cron-secret';
  const expectedToken = 'Bearer ' + cronToken;

  if (authHeader !== expectedToken) {
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

      // 时间匹配：允许前后15分钟容错
      const [notifyHour, notifyMinute] = (sub.notifyTime || '11:00').split(':').map(Number);
      const hourDiff = Math.abs(currentHour - notifyHour);
      const minuteDiff = hourDiff * 60 + Math.abs(currentMinute - notifyMinute);

      // 如果小时不同，跳过；如果同小时但超过15分钟，跳过
      if (hourDiff > 0 || minuteDiff > 15) {
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

      const channels = sub.notifyChannels || [];
      const channelResults = [];
      const targetChannels = channels.length > 0 ? channels : ['dingtalk', 'feishu', 'wecom', 'email'];

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
  return { channel: 'email', success: false, message: '邮件发送功能需要在 Cloud Functions 中实现' };
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

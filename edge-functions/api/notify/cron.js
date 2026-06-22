export async function onRequestPost(context) {
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
    
    for (const sub of subs) {
      // 检查是否需要通知
      const nextDate = new Date(sub.nextDate);
      const notifyDate = new Date(nextDate);
      notifyDate.setDate(notifyDate.getDate() - (sub.notifyDays || 7));
      
      // 检查是否到了通知日期
      if (now < notifyDate || now > nextDate) {
        skipped++;
        continue;
      }
      
      // 检查是否到了通知时间（小时:分钟）
      const [notifyHour, notifyMinute] = (sub.notifyTime || '08:00').split(':').map(Number);
      if (currentHour !== notifyHour || currentMinute > 5) {
        skipped++;
        continue;
      }
      
      // 检查今天是否已经发送过（避免重复）
      const todayKey = `notified_${sub.id}_${now.toISOString().split('T')[0]}`;
      const alreadyNotified = await SUB_KV.get(todayKey);
      if (alreadyNotified) {
        skipped++;
        continue;
      }
      
      // 发送通知
      const msg = {
        title: `🔔 ${sub.name} 即将到期`,
        content: `服务：**${sub.name}**\n下次扣费：**${sub.nextDate}**\n价格：${sub.price === 0 ? '免费' : sub.price + ' ' + sub.currency}\n\n请及时处理或续费！`
      };
      
      const results = [];
      if (sub.notifyDingtalk && config.dingtalk?.enabled) {
        results.push(await sendDingTalk(config.dingtalk, msg));
      }
      if (sub.notifyFeishu && config.feishu?.enabled) {
        results.push(await sendFeishu(config.feishu, msg));
      }
      if (sub.notifyWecom && config.wecom?.enabled) {
        results.push(await sendWecom(config.wecom, msg));
      }
      if (sub.notifyEmail && config.email?.enabled) {
        results.push(await sendEmail(config.email, msg));
      }
      
      // 标记今天已通知
      await SUB_KV.put(todayKey, '1', { expirationTtl: 86400 });
      sent++;
    }
    
    return json({ success: true, sent, skipped, checked: subs.length });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// 复用通知发送函数（从 notify.js 复制）
async function sendDingTalk(config, msg) { /* ... */ }
async function sendFeishu(config, msg) { /* ... */ }
async function sendWecom(config, msg) { /* ... */ }
async function sendEmail(config, msg) { /* ... */ }

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

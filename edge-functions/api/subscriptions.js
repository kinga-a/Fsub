export async function onRequestGet(context) {
  try {
    const data = await SUB_KV.get('subscriptions', 'json') || [];
    return json(data);
  } catch (e) {
    return json({ error: 'KV 读取失败: ' + e.message }, 500);
  }
}

export async function onRequestPost(context) {
  const { request } = context;
  const body = await request.json();

  if (!body.name || !body.startDate) {
    return json({ error: '缺少必填字段（名称、开始日期）' }, 400);
  }

  // 价格允许为0
  const price = parseFloat(body.price);
  if (isNaN(price) || price < 0) {
    return json({ error: '价格不能为负数' }, 400);
  }

  try {
    const data = await SUB_KV.get('subscriptions', 'json') || [];

    const newSub = {
      id: generateId(),
      name: body.name,
      price: price,
      currency: body.currency || 'CNY',
      cycle: body.cycle || 'monthly',
      startDate: body.startDate,
      nextDate: body.nextDate || calcNextDate(body.startDate, body.cycle),
      notifyDays: parseInt(body.notifyDays) || 7,
      notifyDingtalk: body.notifyDingtalk || false,
      notifyFeishu: body.notifyFeishu || false,
      notifyWecom: body.notifyWecom || false,
      notifyEmail: body.notifyEmail || false,
      notifyFreq: body.notifyFreq || 'daily',
      note: body.note || '',
      createdAt: new Date().toISOString()
    };

    data.push(newSub);
    await SUB_KV.put('subscriptions', JSON.stringify(data));

    return json(newSub, 201);
  } catch (e) {
    return json({ error: 'KV 写入失败: ' + e.message }, 500);
  }
}

function calcNextDate(startDate, cycle) {
  const start = new Date(startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let next = new Date(start);
  while (next <= today) {
    switch(cycle) {
      case 'weekly': next.setDate(next.getDate() + 7); break;
      case 'monthly': next.setMonth(next.getMonth() + 1); break;
      case 'quarterly': next.setMonth(next.getMonth() + 3); break;
      case 'yearly': next.setFullYear(next.getFullYear() + 1); break;
      default: next.setMonth(next.getMonth() + 1);
    }
  }
  return next.toISOString().split('T')[0];
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
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

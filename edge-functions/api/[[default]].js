export async function onRequestPut(context) {
  const { request } = context;

  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  if (!id) {
    return json({ error: '缺少订阅 ID' }, 400);
  }

  try {
    const body = await request.json();

    if (body.price !== undefined) {
      const price = parseFloat(body.price);
      if (isNaN(price) || price < 0) {
        return json({ error: '价格不能为负数' }, 400);
      }
      body.price = price;
    }

    let data = await SUB_KV.get('subscriptions', 'json') || [];
    const index = data.findIndex(s => s.id === id);

    if (index === -1) {
      return json({ error: '订阅不存在' }, 404);
    }

    // 如果修改了周期或上次续费日期，重新计算下次到期日
    if (body.lastRenewDate || body.cycleValue || body.cycleUnit || body.mode) {
      const cycleValue = parseInt(body.cycleValue) || data[index].cycleValue || 1;
      const cycleUnit = body.cycleUnit || data[index].cycleUnit || 'month';
      const lastRenewDate = body.lastRenewDate || data[index].lastRenewDate || data[index].startDate;
      body.nextDate = calcNextDate(lastRenewDate, cycleValue, cycleUnit);
    }

    data[index] = {
      ...data[index],
      ...body,
      id: data[index].id,
      updatedAt: new Date().toISOString()
    };

    await SUB_KV.put('subscriptions', JSON.stringify(data));
    return json(data[index]);
  } catch (e) {
    return json({ error: '更新失败: ' + e.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request } = context;
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  if (!id) {
    return json({ error: '缺少订阅 ID' }, 400);
  }

  try {
    let data = await SUB_KV.get('subscriptions', 'json') || [];
    const originalLength = data.length;
    data = data.filter(s => s.id !== id);

    if (data.length === originalLength) {
      return json({ error: '订阅不存在' }, 404);
    }

    await SUB_KV.put('subscriptions', JSON.stringify(data));
    return json({ success: true });
  } catch (e) {
    return json({ error: '删除失败: ' + e.message }, 500);
  }
}

// PATCH /api/subscriptions/renew/:id - 续订功能
export async function onRequestPatch(context) {
  const { request } = context;
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  if (!id) {
    return json({ error: '缺少订阅 ID' }, 400);
  }

  try {
    let data = await SUB_KV.get('subscriptions', 'json') || [];
    const index = data.findIndex(s => s.id === id);

    if (index === -1) {
      return json({ error: '订阅不存在' }, 404);
    }

    const sub = data[index];
    const cycleValue = parseInt(sub.cycleValue) || 1;
    const cycleUnit = sub.cycleUnit || 'month';
    const currentNextDate = sub.nextDate || sub.startDate;

    // 基于当前到期日计算新的到期日
    const newNextDate = calcNextDate(currentNextDate, cycleValue, cycleUnit);
    const today = new Date().toISOString().split('T')[0];

    data[index] = {
      ...sub,
      lastRenewDate: today,
      nextDate: newNextDate,
      updatedAt: new Date().toISOString()
    };

    await SUB_KV.put('subscriptions', JSON.stringify(data));
    return json({ success: true, nextDate: newNextDate, sub: data[index] });
  } catch (e) {
    return json({ error: '续订失败: ' + e.message }, 500);
  }
}

function calcNextDate(baseDate, cycleValue, cycleUnit) {
  const base = new Date(baseDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let next = new Date(base);

  // 如果基准日期在未来，直接作为下次到期日
  if (next > today) {
    return next.toISOString().split('T')[0];
  }

  // 循环累加周期，直到超过今天
  while (next <= today) {
    switch(cycleUnit) {
      case 'day': next.setDate(next.getDate() + cycleValue); break;
      case 'week': next.setDate(next.getDate() + (cycleValue * 7)); break;
      case 'month': next.setMonth(next.getMonth() + cycleValue); break;
      case 'quarter': next.setMonth(next.getMonth() + (cycleValue * 3)); break;
      case 'year': next.setFullYear(next.getFullYear() + cycleValue); break;
      default: next.setMonth(next.getMonth() + cycleValue);
    }
  }
  return next.toISOString().split('T')[0];
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

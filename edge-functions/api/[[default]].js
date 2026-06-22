export async function onRequestPut(context) {
  const { request } = context;

  // 从 URL 路径中提取 ID
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  if (!id) {
    return json({ error: '缺少订阅 ID' }, 400);
  }

  try {
    const body = await request.json();

    // 价格允许为0
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

    // 如果周期或开始日期变了，重新计算下次扣费日期
    if (body.cycle || body.startDate) {
      const cycle = body.cycle || data[index].cycle;
      const startDate = body.startDate || data[index].startDate;
      body.nextDate = calcNextDate(startDate, cycle);
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
  // 从 URL 路径中提取 ID
  const url = new URL(context.request.url);
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

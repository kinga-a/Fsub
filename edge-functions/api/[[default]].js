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

    const kv = getKV(context);
    let data = await kv.get('subscriptions', 'json') || [];
    const index = data.findIndex(s => s.id === id);

    if (index === -1) {
      return json({ error: '订阅不存在' }, 404);
    }

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

    await kv.put('subscriptions', JSON.stringify(data));
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
    const kv = getKV(context);
    let data = await kv.get('subscriptions', 'json') || [];
    const originalLength = data.length;
    data = data.filter(s => s.id !== id);

    if (data.length === originalLength) {
      return json({ error: '订阅不存在' }, 404);
    }

    await kv.put('subscriptions', JSON.stringify(data));
    return json({ success: true });
  } catch (e) {
    return json({ error: '删除失败: ' + e.message }, 500);
  }
}

export async function onRequestPatch(context) {
  const { request } = context;
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  if (!id) {
    return json({ error: '缺少订阅 ID' }, 400);
  }

  try {
    const kv = getKV(context);
    let data = await kv.get('subscriptions', 'json') || [];
    const index = data.findIndex(s => s.id === id);

    if (index === -1) {
      return json({ error: '订阅不存在' }, 404);
    }

    const sub = data[index];
    const cycleValue = parseInt(sub.cycleValue) || 1;
    const cycleUnit = sub.cycleUnit || 'month';
    const currentNextDate = sub.nextDate || sub.startDate;

    const newNextDate = calcNextDate(currentNextDate, cycleValue, cycleUnit);
    const today = new Date().toISOString().split('T')[0];

    data[index] = {
      ...sub,
      lastRenewDate: today,
      nextDate: newNextDate,
      updatedAt: new Date().toISOString()
    };

    await kv.put('subscriptions', JSON.stringify(data));
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

  if (next > today) {
    return next.toISOString().split('T')[0];
  }

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

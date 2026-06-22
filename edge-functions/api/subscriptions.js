export async function onRequestGet(context) {
  // 检查 SUB_KV 是否定义
  if (typeof SUB_KV === 'undefined') {
    return json({ error: 'KV not bound: SUB_KV is undefined' }, 500);
  }
  
  try {
    const data = await SUB_KV.get('subscriptions', 'json');
    return json(data || []);
  } catch (e) {
    return json({ error: 'KV read failed: ' + e.message }, 500);
  }
}

export async function onRequestPost(context) {
  if (typeof SUB_KV === 'undefined') {
    return json({ error: 'KV not bound: SUB_KV is undefined' }, 500);
  }
  
  const { request } = context;
  
  try {
    const body = await request.json();
    
    if (!body.name || body.name.trim() === '') {
      return json({ error: '服务名称不能为空' }, 400);
    }
    if (!body.price || isNaN(parseFloat(body.price))) {
      return json({ error: '价格必须为有效数字' }, 400);
    }
    if (!body.nextDate) {
      return json({ error: '下次扣费日期不能为空' }, 400);
    }
    
    let data = [];
    try {
      const stored = await SUB_KV.get('subscriptions', 'json');
      if (stored) data = stored;
    } catch (e) {
      data = [];
    }
    
    const newSub = {
      id: generateId(),
      name: body.name.trim(),
      price: parseFloat(body.price),
      currency: body.currency || 'CNY',
      cycle: body.cycle || 'monthly',
      nextDate: body.nextDate,
      note: (body.note || '').trim(),
      createdAt: new Date().toISOString()
    };
    
    data.push(newSub);
    await SUB_KV.put('subscriptions', JSON.stringify(data));
    
    return json(newSub, 201);
  } catch (e) {
    return json({ error: 'KV write failed: ' + e.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

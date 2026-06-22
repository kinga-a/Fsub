export async function onRequestGet(context) {
  // 直接使用全局变量 SUB_KV
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
  
  if (!body.name || !body.price || !body.nextDate) {
    return json({ error: '缺少必填字段（名称、价格、下次扣费日期）' }, 400);
  }
  
  try {
    const data = await SUB_KV.get('subscriptions', 'json') || [];
    
    const newSub = {
      id: generateId(),
      name: body.name,
      price: parseFloat(body.price),
      currency: body.currency || 'CNY',
      cycle: body.cycle || 'monthly',
      nextDate: body.nextDate,
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

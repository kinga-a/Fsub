// EdgeOne 主站控制台：KV 作为全局变量绑定，直接使用 SUB_KV
// 无需通过 env，在控制台绑定后作为全局变量注入

export async function onRequestGet(context) {
  // 直接使用全局变量 SUB_KV，不是 env.SUB_KV
  try {
    const data = await SUB_KV.get('subscriptions', 'json');
    return json(data || []);
  } catch (e) {
    return json({ error: 'KV read failed: ' + e.message }, 500);
  }
}

export async function onRequestPost(context) {
  const { request } = context;
  
  try {
    const body = await request.json();
    
    if (!body.name || !body.price || !body.nextDate) {
      return json({ error: '缺少必填字段 (name, price, nextDate)' }, 400);
    }
    
    let data = await SUB_KV.get('subscriptions', 'json') || [];
    
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

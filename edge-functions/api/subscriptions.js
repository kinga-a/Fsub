export async function onRequestGet(context) {
  const { env } = context;
  const kv = env.SUB_KV;
  
  if (!kv) {
    return json({ error: 'KV 存储未配置' }, 500);
  }
  
  const data = await kv.get('subscriptions', 'json') || [];
  return json(data);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const kv = env.SUB_KV;
  
  if (!kv) {
    return json({ error: 'KV 存储未配置' }, 500);
  }
  
  const body = await request.json();
  
  if (!body.name || !body.price || !body.nextDate) {
    return json({ error: '缺少必填字段' }, 400);
  }
  
  const data = await kv.get('subscriptions', 'json') || [];
  
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
  await kv.put('subscriptions', JSON.stringify(data));
  
  return json(newSub, 201);
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

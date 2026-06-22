export async function onRequestGet(context) {
  // KV 作为全局变量直接使用，不是 env.SUB_KV
  const data = await SUB_KV.get('subscriptions', 'json') || [];
  return json(data);
}

export async function onRequestPost(context) {
  const body = await context.request.json();
  
  // 校验必填字段
  if (!body.name || !body.price || !body.nextDate) {
    return json({ error: '缺少必填字段' }, 400);
  }
  
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
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

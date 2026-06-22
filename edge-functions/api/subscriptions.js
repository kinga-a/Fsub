// 订阅数据 CRUD API
export async function onRequestGet(context) {
  const { env } = context;
  const data = await env.SUB_KV.get('subscriptions', 'json') || [];
  return json(data);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json();
  
  // 数据校验
  if (!body.name || !body.price || !body.nextDate) {
    return json({ error: '缺少必填字段' }, 400);
  }
  
  let data = await env.SUB_KV.get('subscriptions', 'json') || [];
  
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
  await env.SUB_KV.put('subscriptions', JSON.stringify(data));
  
  return json(newSub, 201);
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const id = params.id;
  const body = await request.json();
  
  let data = await env.SUB_KV.get('subscriptions', 'json') || [];
  const index = data.findIndex(s => s.id === id);
  
  if (index === -1) {
    return json({ error: '订阅不存在' }, 404);
  }
  
  data[index] = {
    ...data[index],
    ...body,
    id: data[index].id,
    updatedAt: new Date().toISOString()
  };
  
  await env.SUB_KV.put('subscriptions', JSON.stringify(data));
  return json(data[index]);
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = params.id;
  
  let data = await env.SUB_KV.get('subscriptions', 'json') || [];
  const exists = data.some(s => s.id === id);
  
  if (!exists) {
    return json({ error: '订阅不存在' }, 404);
  }
  
  data = data.filter(s => s.id !== id);
  await env.SUB_KV.put('subscriptions', JSON.stringify(data));
  
  return json({ success: true });
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

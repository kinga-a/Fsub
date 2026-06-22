export async function onRequestPut(context) {
  const { params, request, env } = context;
  const id = params.id;
  const kv = env.SUB_KV;
  
  if (!kv) {
    return json({ error: 'KV 存储未配置' }, 500);
  }
  
  const body = await request.json();
  
  let data = await kv.get('subscriptions', 'json') || [];
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
  
  await kv.put('subscriptions', JSON.stringify(data));
  return json(data[index]);
}

export async function onRequestDelete(context) {
  const { params, env } = context;
  const id = params.id;
  const kv = env.SUB_KV;
  
  if (!kv) {
    return json({ error: 'KV 存储未配置' }, 500);
  }
  
  let data = await kv.get('subscriptions', 'json') || [];
  const originalLength = data.length;
  data = data.filter(s => s.id !== id);
  
  if (data.length === originalLength) {
    return json({ error: '订阅不存在' }, 404);
  }
  
  await kv.put('subscriptions', JSON.stringify(data));
  return json({ success: true });
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

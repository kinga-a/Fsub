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
    headers: { 'Content-Type': 'application/json' }
  });
}

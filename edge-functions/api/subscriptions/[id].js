export async function onRequestPut(context) {
  const { params, request } = context;
  const id = params.id;
  const body = await request.json();
  
  let data = await SUB_KV.get('subscriptions', 'json') || [];
  const index = data.findIndex(s => s.id === id);
  
  if (index === -1) {
    return json({ error: '订阅不存在' }, 404);
  }
  
  data[index] = {
    ...data[index],
    ...body,
    id: data[index].id, // 保护 ID 不被修改
    updatedAt: new Date().toISOString()
  };
  
  await SUB_KV.put('subscriptions', JSON.stringify(data));
  return json(data[index]);
}

export async function onRequestDelete(context) {
  const { params } = context;
  const id = params.id;
  
  let data = await SUB_KV.get('subscriptions', 'json') || [];
  const originalLength = data.length;
  data = data.filter(s => s.id !== id);
  
  if (data.length === originalLength) {
    return json({ error: '订阅不存在' }, 404);
  }
  
  await SUB_KV.put('subscriptions', JSON.stringify(data));
  return json({ success: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

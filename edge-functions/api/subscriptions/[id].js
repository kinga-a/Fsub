// EdgeOne 主站控制台：KV 作为全局变量绑定，直接使用 SUB_KV

export async function onRequestPut(context) {
  const { request, params } = context;
  const id = params.id;
  
  try {
    const body = await request.json();
    let data = await SUB_KV.get('subscriptions', 'json') || [];
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
    
    await SUB_KV.put('subscriptions', JSON.stringify(data));
    return json(data[index]);
  } catch (e) {
    return json({ error: 'KV update failed: ' + e.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const { params } = context;
  const id = params.id;
  
  try {
    let data = await SUB_KV.get('subscriptions', 'json') || [];
    const exists = data.some(s => s.id === id);
    
    if (!exists) {
      return json({ error: '订阅不存在' }, 404);
    }
    
    data = data.filter(s => s.id !== id);
    await SUB_KV.put('subscriptions', JSON.stringify(data));
    
    return json({ success: true });
  } catch (e) {
    return json({ error: 'KV delete failed: ' + e.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

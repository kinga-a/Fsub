export async function onRequestPut(context) {
  const { params, request } = context;
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
    return json({ error: '更新失败: ' + e.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const { params } = context;
  const id = params.id;
  
  try {
    let data = await SUB_KV.get('subscriptions', 'json') || [];
    const originalLength = data.length;
    data = data.filter(s => s.id !== id);
    
    if (data.length === originalLength) {
      return json({ error: '订阅不存在' }, 404);
    }
    
    await SUB_KV.put('subscriptions', JSON.stringify(data));
    return json({ success: true });
  } catch (e) {
    return json({ error: '删除失败: ' + e.message }, 500);
  }
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

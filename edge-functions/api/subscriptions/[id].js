export async function onRequestPut(context) {
  const { request, env, params } = context;
  const id = params.id;
  
  if (!env.SUB_KV) {
    return json({ error: 'KV not bound' }, 500);
  }
  
  try {
    const body = await request.json();
    let data = [];
    
    try {
      const stored = await env.SUB_KV.get('subscriptions', 'json');
      if (stored) data = stored;
    } catch (e) {
      data = [];
    }
    
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
  } catch (e) {
    return json({ error: 'KV update failed: ' + e.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const id = params.id;
  
  if (!env.SUB_KV) {
    return json({ error: 'KV not bound' }, 500);
  }
  
  try {
    let data = [];
    
    try {
      const stored = await env.SUB_KV.get('subscriptions', 'json');
      if (stored) data = stored;
    } catch (e) {
      data = [];
    }
    
    const exists = data.some(s => s.id === id);
    if (!exists) {
      return json({ error: '订阅不存在' }, 404);
    }
    
    data = data.filter(s => s.id !== id);
    await env.SUB_KV.put('subscriptions', JSON.stringify(data));
    
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

// KV 访问辅助函数 - 兼容全局变量和 context.env 两种方式
function getKV(context) {
  // 方式1：全局变量（EdgeOne Pages 绑定后注入）
  if (typeof SUB_KV !== 'undefined') {
    return SUB_KV;
  }
  // 方式2：通过 context.env 访问
  if (context && context.env && context.env.SUB_KV) {
    return context.env.SUB_KV;
  }
  // 方式3：通过全局 env 访问（某些环境）
  if (typeof env !== 'undefined' && env.SUB_KV) {
    return env.SUB_KV;
  }
  throw new Error('SUB_KV 未定义，请检查 KV 命名空间是否已绑定到项目');
}

// 环境变量访问辅助函数
function getEnv(context, key, defaultValue) {
  // 方式1：通过 context.env 访问
  if (context && context.env && context.env[key] !== undefined) {
    return context.env[key];
  }
  // 方式2：全局变量
  if (typeof env !== 'undefined' && env[key] !== undefined) {
    return env[key];
  }
  return defaultValue;
}

export async function onRequestGet(context) {
  try {
    const kv = getKV(context);
    const data = await kv.get('subscriptions', 'json') || [];
    return json(data);
  } catch (e) {
    return json({ error: 'KV 读取失败: ' + e.message }, 500);
  }
}

export async function onRequestPost(context) {
  const { request } = context;
  const body = await request.json();

  if (!body.name || !body.startDate || !body.nextDate) {
    return json({ error: '缺少必填字段（名称、创建时间、到期日期）' }, 400);
  }

  const price = parseFloat(body.price);
  if (isNaN(price) || price < 0) {
    return json({ error: '价格不能为负数' }, 400);
  }

  try {
    const kv = getKV(context);
    const data = await kv.get('subscriptions', 'json') || [];

    const newSub = {
      id: generateId(),
      name: body.name,
      type: body.type || '软件订阅',
      tags: body.tags || [],
      price: price,
      currency: body.currency || 'CNY',
      mode: body.mode || 'recurring',
      cycleValue: parseInt(body.cycleValue) || 1,
      cycleUnit: body.cycleUnit || 'month',
      startDate: body.startDate,
      lastRenewDate: body.lastRenewDate || body.startDate,
      nextDate: body.nextDate,
      showLunar: body.showLunar !== false,
      lunarCycle: body.lunarCycle || false,
      notifyDays: parseInt(body.notifyDays) || 3,
      notifyTime: body.notifyTime || '11:00',
      notifyChannels: body.notifyChannels || [],
      enabled: body.enabled !== false,
      autoRenew: body.autoRenew || false,
      expiredRenewDays: parseInt(body.expiredRenewDays) || 3,
      note: body.note || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    data.push(newSub);
    await kv.put('subscriptions', JSON.stringify(data));

    return json(newSub, 201);
  } catch (e) {
    return json({ error: 'KV 写入失败: ' + e.message }, 500);
  }
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

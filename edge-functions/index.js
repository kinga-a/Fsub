// API 请求封装
async function api(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            'Authorization': 'Bearer ' + token,
            ...(options.headers || {})
        }
    });
    
    // 只有 401 才退出登录，其他错误显示 toast
    if (res.status === 401) {
        logout();
        throw new Error('Unauthorized');
    }
    
    return res;
}

// 加载数据
async function loadData() {
    try {
        const res = await api('/api/subscriptions');
        
        // 检查是否返回错误
        if (!res.ok) {
            const err = await res.json();
            showToast(err.error || '加载失败 (' + res.status + ')', 'error');
            return;
        }
        
        subscriptions = await res.json();
        renderList();
        updateStats();
    } catch (e) {
        if (e.message !== 'Unauthorized') {
            showToast('加载数据失败: ' + e.message, 'error');
        }
    }
}

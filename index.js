export function onRequest(context) {
  return new Response(HTML_CONTENT, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>订阅管理中心</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f0f2f5; 
            color: #1f2937;
            line-height: 1.6;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        
        .login-overlay {
            position: fixed; inset: 0;
            background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
            display: flex; align-items: center; justify-content: center;
            z-index: 1000;
            transition: opacity 0.4s ease;
        }
        .login-box {
            background: white; padding: 48px 40px; border-radius: 20px;
            box-shadow: 0 25px 80px rgba(0,0,0,0.3);
            width: 90%; max-width: 420px;
            text-align: center;
        }
        .login-box .icon { font-size: 48px; margin-bottom: 16px; }
        .login-box h2 { font-size: 24px; margin-bottom: 8px; }
        .login-box p { color: #6b7280; margin-bottom: 32px; font-size: 15px; }
        .login-input {
            width: 100%; padding: 14px 18px; border: 2px solid #e5e7eb;
            border-radius: 12px; font-size: 16px; margin-bottom: 20px;
            transition: all 0.3s;
        }
        .login-input:focus { 
            outline: none; 
            border-color: #4f46e5; 
            box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1);
        }
        .login-btn {
            width: 100%; padding: 14px; background: #4f46e5;
            color: white; border: none; border-radius: 12px;
            font-size: 16px; font-weight: 600; cursor: pointer;
            transition: all 0.3s;
        }
        .login-btn:hover { background: #4338ca; }
        .error-msg { 
            color: #dc2626; 
            margin-top: 12px; 
            font-size: 14px; 
            display: none;
            padding: 8px 12px;
            background: #fef2f2;
            border-radius: 8px;
        }
        
        .app { display: none; }
        .header {
            background: white; padding: 24px; border-radius: 16px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 24px;
            display: flex; justify-content: space-between; align-items: center;
        }
        .header h1 { font-size: 26px; font-weight: 700; }
        .header p { color: #6b7280; font-size: 14px; margin-top: 4px; }
        .logout-btn {
            padding: 10px 20px; border: 1px solid #e5e7eb;
            background: white; color: #4b5563; border-radius: 10px;
            cursor: pointer; font-size: 14px;
        }
        .logout-btn:hover { background: #f9fafb; }
        
        .stats {
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 20px; 
            margin-bottom: 28px;
        }
        .stat-card {
            background: white; padding: 24px; border-radius: 16px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }
        .stat-card h3 { 
            font-size: 13px; 
            color: #6b7280; 
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: 600;
        }
        .stat-card .value { 
            font-size: 36px; 
            font-weight: 800; 
            line-height: 1;
        }
        .stat-card .value.active { color: #10b981; }
        .stat-card .value.soon { color: #f59e0b; }
        .stat-card .value.monthly { color: #4f46e5; }
        
        .toolbar {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 24px; gap: 16px;
        }
        .btn {
            padding: 12px 24px; border: none; border-radius: 12px;
            cursor: pointer; font-size: 14px; font-weight: 600;
            transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px;
        }
        .btn-primary { 
            background: #4f46e5; 
            color: white; 
        }
        .btn-primary:hover { background: #4338ca; }
        .btn-secondary { background: white; color: #4b5563; border: 1px solid #e5e7eb; }
        
        .search-box {
            padding: 12px 18px; border: 1px solid #e5e7eb;
            border-radius: 12px; width: 320px; font-size: 14px;
        }
        
        .table-container {
            background: white; border-radius: 16px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden;
        }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 18px 20px; text-align: left; }
        th { 
            background: #f9fafb; 
            font-weight: 600; 
            color: #374151; 
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        tr { border-bottom: 1px solid #f3f4f6; }
        tr:hover { background: #fafafa; }
        .service-name { font-weight: 700; font-size: 15px; }
        .tag {
            padding: 5px 14px; border-radius: 20px; font-size: 12px;
            font-weight: 600; display: inline-block;
        }
        .tag-active { background: #d1fae5; color: #065f46; }
        .tag-expired { background: #fee2e2; color: #991b1b; }
        .tag-soon { background: #fef3c7; color: #92400e; }
        
        .price { font-weight: 700; font-size: 15px; }
        .cycle { color: #6b7280; font-size: 13px; }
        .note { color: #6b7280; font-size: 13px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        
        .actions { display: flex; gap: 8px; }
        .icon-btn {
            width: 36px; height: 36px; border-radius: 10px;
            border: 1px solid #e5e7eb; background: white;
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            font-size: 14px;
        }
        .icon-btn:hover { background: #f3f4f6; }
        
        .modal-overlay {
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.5); 
            display: none;
            align-items: center; justify-content: center; 
            z-index: 100;
        }
        .modal-overlay.active { display: flex; }
        .modal {
            background: white; border-radius: 20px; width: 92%;
            max-width: 520px; max-height: 90vh; overflow-y: auto;
            box-shadow: 0 25px 80px rgba(0,0,0,0.3);
        }
        .modal-header {
            padding: 28px; 
            border-bottom: 1px solid #f3f4f6;
            display: flex; justify-content: space-between; align-items: center;
        }
        .modal-body { padding: 28px; }
        .form-group { margin-bottom: 22px; }
        .form-group label {
            display: block; margin-bottom: 8px;
            font-weight: 600; color: #374151; font-size: 14px;
        }
        .form-group input, .form-group select {
            width: 100%; padding: 13px 16px; border: 1px solid #e5e7eb;
            border-radius: 12px; font-size: 15px;
        }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .modal-footer {
            padding: 24px 28px; 
            border-top: 1px solid #f3f4f6;
            display: flex; justify-content: flex-end; gap: 12px;
        }
        
        .empty-state { text-align: center; padding: 80px 20px; }
        .empty-icon {
            width: 80px; height: 80px;
            background: #f3f4f6;
            border-radius: 24px;
            display: flex; align-items: center; justify-content: center;
            margin: 0 auto 24px;
            font-size: 36px;
        }
        
        @media (max-width: 768px) {
            .stats { grid-template-columns: repeat(2, 1fr); }
            .toolbar { flex-direction: column; align-items: stretch; }
            .search-box { width: 100%; }
            .form-row { grid-template-columns: 1fr; }
        }
        
        .toast {
            position: fixed; bottom: 28px; right: 28px;
            padding: 16px 24px; border-radius: 12px; color: white;
            font-weight: 600; font-size: 14px;
            transform: translateY(120px);
            transition: transform 0.4s;
            z-index: 1001;
        }
        .toast.show { transform: translateY(0); }
        .toast.success { background: #10b981; }
        .toast.error { background: #ef4444; }
    </style>
</head>
<body>
    <div class="login-overlay" id="loginOverlay">
        <div class="login-box">
            <div class="icon">🔐</div>
            <h2>订阅管理中心</h2>
            <p>请输入访问码以继续管理你的订阅</p>
            <input type="password" class="login-input" id="accessCode" placeholder="访问码" autofocus autocomplete="off">
            <button class="login-btn" onclick="doLogin()">进入系统</button>
            <div class="error-msg" id="loginError">访问码错误</div>
        </div>
    </div>

    <div class="app" id="app">
        <div class="container">
            <div class="header">
                <div>
                    <h1>📊 订阅管理中心</h1>
                    <p>追踪和管理你的所有订阅服务</p>
                </div>
                <button class="logout-btn" onclick="logout()">退出登录</button>
            </div>

            <div class="stats">
                <div class="stat-card">
                    <h3>活跃订阅</h3>
                    <div class="value active" id="statActive">0</div>
                </div>
                <div class="stat-card">
                    <h3>即将到期</h3>
                    <div class="value soon" id="statSoon">0</div>
                </div>
                <div class="stat-card">
                    <h3>月付总额</h3>
                    <div class="value monthly" id="statMonthly">¥0</div>
                </div>
                <div class="stat-card">
                    <h3>总订阅数</h3>
                    <div class="value" id="statTotal">0</div>
                </div>
            </div>

            <div class="toolbar">
                <button class="btn btn-primary" onclick="openModal()">
                    <span>+</span> 新增订阅
                </button>
                <input type="text" class="search-box" id="searchInput" placeholder="搜索订阅服务..." oninput="renderList()">
            </div>

            <div class="table-container" id="tableContainer">
                <div class="empty-state" id="emptyState">
                    <div class="empty-icon">📋</div>
                    <h3>暂无订阅</h3>
                    <p>点击上方按钮添加你的第一个订阅服务</p>
                </div>
                <table id="subTable" style="display:none;">
                    <thead>
                        <tr>
                            <th>服务名称</th>
                            <th>价格</th>
                            <th>周期</th>
                            <th>下次扣费</th>
                            <th>状态</th>
                            <th>备注</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody id="subList"></tbody>
                </table>
            </div>
        </div>
    </div>

    <div class="modal-overlay" id="modal">
        <div class="modal">
            <div class="modal-header">
                <h3 id="modalTitle">新增订阅</h3>
                <button class="icon-btn" onclick="closeModal()" style="border:none; font-size:18px;">✕</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>服务名称 *</label>
                    <input type="text" id="mName" placeholder="例如：Netflix、Spotify">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>价格 *</label>
                        <input type="number" id="mPrice" placeholder="29.99" step="0.01" min="0">
                    </div>
                    <div class="form-group">
                        <label>货币</label>
                        <select id="mCurrency">
                            <option value="CNY">CNY (¥)</option>
                            <option value="USD">USD ($)</option>
                            <option value="EUR">EUR (€)</option>
                            <option value="GBP">GBP (£)</option>
                            <option value="JPY">JPY (¥)</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>付费周期 *</label>
                        <select id="mCycle">
                            <option value="monthly">月付</option>
                            <option value="quarterly">季付</option>
                            <option value="yearly">年付</option>
                            <option value="weekly">周付</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>下次扣费日期 *</label>
                        <input type="date" id="mNextDate">
                    </div>
                </div>
                <div class="form-group">
                    <label>备注</label>
                    <input type="text" id="mNote" placeholder="可选：账号信息、共享人数等">
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal()">取消</button>
                <button class="btn btn-primary" onclick="saveSub()">保存</button>
            </div>
        </div>
    </div>

    <div class="toast" id="toast"></div>

    <script>
        let subscriptions = [];
        let editingId = null;
        let token = localStorage.getItem('sub_token');

        document.addEventListener('DOMContentLoaded', () => {
            if (token) verifyToken();
        });

        async function doLogin() {
            const code = document.getElementById('accessCode').value.trim();
            if (!code) {
                showError('请输入访问码');
                return;
            }
            
            const btn = document.querySelector('.login-btn');
            btn.textContent = '验证中...';
            btn.disabled = true;
            
            try {
                const res = await fetch('/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code })
                });
                const data = await res.json();
                
                if (data.success) {
                    token = data.token;
                    localStorage.setItem('sub_token', token);
                    showApp();
                } else {
                    showError(data.message || '访问码错误');
                }
            } catch (e) {
                showError('网络错误，请重试');
            } finally {
                btn.textContent = '进入系统';
                btn.disabled = false;
            }
        }

        function showError(msg) {
            const err = document.getElementById('loginError');
            err.textContent = msg;
            err.style.display = 'block';
            setTimeout(() => err.style.display = 'none', 3000);
        }

        async function verifyToken() {
            try {
                const res = await fetch('/api/auth', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                const data = await res.json();
                if (data.valid) {
                    showApp();
                } else {
                    throw new Error('Invalid');
                }
            } catch (e) {
                localStorage.removeItem('sub_token');
                token = null;
            }
        }

        function showApp() {
            const overlay = document.getElementById('loginOverlay');
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.style.display = 'none';
                document.getElementById('app').style.display = 'block';
            }, 400);
            loadData();
        }

        function logout() {
            localStorage.removeItem('sub_token');
            token = null;
            location.reload();
        }

        async function api(url, options = {}) {
            const res = await fetch(url, {
                ...options,
                headers: {
                    'Authorization': 'Bearer ' + token,
                    ...(options.headers || {})
                }
            });
            
            if (res.status === 401) {
                logout();
                throw new Error('Unauthorized');
            }
            
            return res;
        }

        async function loadData() {
            try {
                const res = await api('/api/subscriptions');
                
                if (!res.ok) {
                    const err = await res.json();
                    showToast(err.error || '加载失败', 'error');
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

        async function saveSub() {
            const data = {
                name: document.getElementById('mName').value.trim(),
                price: parseFloat(document.getElementById('mPrice').value),
                currency: document.getElementById('mCurrency').value,
                cycle: document.getElementById('mCycle').value,
                nextDate: document.getElementById('mNextDate').value,
                note: document.getElementById('mNote').value.trim()
            };
            
            if (!data.name) { showToast('请输入服务名称', 'error'); return; }
            if (!data.price || data.price <= 0) { showToast('请输入有效价格', 'error'); return; }
            if (!data.nextDate) { showToast('请选择下次扣费日期', 'error'); return; }

            const url = editingId ? '/api/subscriptions/' + editingId : '/api/subscriptions';
            const method = editingId ? 'PUT' : 'POST';
            
            try {
                const res = await api(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                if (res.ok) {
                    closeModal();
                    await loadData();
                    showToast(editingId ? '更新成功' : '添加成功', 'success');
                } else {
                    const err = await res.json();
                    showToast(err.error || '操作失败', 'error');
                }
            } catch (e) {
                showToast('操作失败', 'error');
            }
        }

        async function deleteSub(id) {
            if (!confirm('确定要删除这个订阅吗？')) return;
            
            try {
                const res = await api('/api/subscriptions/' + id, { method: 'DELETE' });
                if (res.ok) {
                    await loadData();
                    showToast('删除成功', 'success');
                }
            } catch (e) {
                showToast('删除失败', 'error');
            }
        }

        function editSub(id) {
            const sub = subscriptions.find(s => s.id === id);
            if (!sub) return;
            
            editingId = id;
            document.getElementById('modalTitle').textContent = '编辑订阅';
            document.getElementById('mName').value = sub.name;
            document.getElementById('mPrice').value = sub.price;
            document.getElementById('mCurrency').value = sub.currency || 'CNY';
            document.getElementById('mCycle').value = sub.cycle || 'monthly';
            document.getElementById('mNextDate').value = sub.nextDate;
            document.getElementById('mNote').value = sub.note || '';
            document.getElementById('modal').classList.add('active');
        }

        function renderList() {
            const search = document.getElementById('searchInput').value.toLowerCase().trim();
            const filtered = search 
                ? subscriptions.filter(s => 
                    s.name.toLowerCase().includes(search) ||
                    (s.note && s.note.toLowerCase().includes(search))
                  )
                : subscriptions;

            const emptyState = document.getElementById('emptyState');
            const table = document.getElementById('subTable');
            const tbody = document.getElementById('subList');
            
            if (filtered.length === 0) {
                emptyState.style.display = 'block';
                table.style.display = 'none';
                return;
            }
            
            emptyState.style.display = 'none';
            table.style.display = 'table';
            
            tbody.innerHTML = filtered.map(sub => {
                const status = getStatus(sub.nextDate);
                const currencySymbols = { CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥' };
                const symbol = currencySymbols[sub.currency] || sub.currency;
                
                return \`
                    <tr>
                        <td><span class="service-name">\${escapeHtml(sub.name)}</span></td>
                        <td class="price">\${symbol}\${sub.price.toFixed(2)}</td>
                        <td class="cycle">\${cycleText(sub.cycle)}</td>
                        <td>\${formatDate(sub.nextDate)}</td>
                        <td><span class="tag tag-\${status.type}">\${status.text}</span></td>
                        <td class="note" title="\${escapeHtml(sub.note || '')}">\${escapeHtml(sub.note || '-')}</td>
                        <td>
                            <div class="actions">
                                <button class="icon-btn" onclick="editSub('\${sub.id}')" title="编辑">✏️</button>
                                <button class="icon-btn" onclick="deleteSub('\${sub.id}')" title="删除">🗑️</button>
                            </div>
                        </td>
                    </tr>
                \`;
            }).join('');
        }

        function updateStats() {
            const now = new Date();
            const soon = new Date(); 
            soon.setDate(soon.getDate() + 7);
            
            const active = subscriptions.filter(s => new Date(s.nextDate) >= now).length;
            const soonCount = subscriptions.filter(s => {
                const d = new Date(s.nextDate);
                return d >= now && d <= soon;
            }).length;
            
            let monthlyTotal = 0;
            const rates = { CNY: 1, USD: 7.2, EUR: 7.8, GBP: 9.1, JPY: 0.05 };
            const multipliers = { weekly: 4.33, monthly: 1, quarterly: 1/3, yearly: 1/12 };
            
            subscriptions.forEach(sub => {
                const rate = rates[sub.currency] || 1;
                const mult = multipliers[sub.cycle] || 1;
                monthlyTotal += sub.price * rate * mult;
            });
            
            document.getElementById('statActive').textContent = active;
            document.getElementById('statSoon').textContent = soonCount;
            document.getElementById('statMonthly').textContent = '¥' + monthlyTotal.toFixed(0);
            document.getElementById('statTotal').textContent = subscriptions.length;
        }

        function getStatus(dateStr) {
            const date = new Date(dateStr);
            const now = new Date();
            now.setHours(0,0,0,0);
            const soon = new Date(now);
            soon.setDate(soon.getDate() + 7);
            
            if (date < now) return { type: 'expired', text: '已过期' };
            if (date <= soon) return { type: 'soon', text: '即将到期' };
            return { type: 'active', text: '活跃' };
        }

        function cycleText(cycle) {
            const map = { weekly: '周付', monthly: '月付', quarterly: '季付', yearly: '年付' };
            return map[cycle] || cycle;
        }

        function formatDate(dateStr) {
            const d = new Date(dateStr);
            return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function openModal() {
            editingId = null;
            document.getElementById('modalTitle').textContent = '新增订阅';
            document.getElementById('mName').value = '';
            document.getElementById('mPrice').value = '';
            document.getElementById('mCurrency').value = 'CNY';
            document.getElementById('mCycle').value = 'monthly';
            document.getElementById('mNextDate').value = '';
            document.getElementById('mNote').value = '';
            document.getElementById('modal').classList.add('active');
        }

        function closeModal() {
            document.getElementById('modal').classList.remove('active');
        }

        document.getElementById('accessCode')?.addEventListener('keypress', e => {
            if (e.key === 'Enter') doLogin();
        });

        function showToast(msg, type) {
            const toast = document.getElementById('toast');
            toast.innerHTML = (type === 'success' ? '✓ ' : '✕ ') + msg;
            toast.className = 'toast ' + type;
            requestAnimationFrame(() => toast.classList.add('show'));
            setTimeout(() => toast.classList.remove('show'), 3000);
        }

        document.getElementById('modal')?.addEventListener('click', e => {
            if (e.target === document.getElementById('modal')) closeModal();
        });
        
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') closeModal();
        });
    </script>
</body>
</html>`;

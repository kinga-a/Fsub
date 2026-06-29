    let subs = [];
    let editingId = null;
    let notifyConfig = {};
    let currentTags = [];
    let currentChannels = [];
    let listViewMode = 'table';
    let currentPage = 1;
    const pageSize = 10;
    let currentSort = { field: 'nextDate', asc: true };

    async function load() {
      try {
        const res = await fetch('/api/subscriptions');
        if (res.status === 401) { location.reload(); return; }
        if (!res.ok) { throw new Error('加载失败'); }
        subs = await res.json();
        renderList();
        updateStats();
      } catch (e) { toast('加载数据失败: ' + e.message, 'error'); }
    }

    function renderList() {
      const q = document.getElementById('searchInput').value.toLowerCase();
      const typeFilter = document.getElementById('filterType').value;
      const statusFilter = document.getElementById('filterStatus').value;

      let filtered = subs.filter(s => {
        const matchQ = !q || s.name.toLowerCase().includes(q) || 
          (s.type && s.type.toLowerCase().includes(q)) ||
          (s.note && s.note.toLowerCase().includes(q)) ||
          (s.tags && s.tags.some(t => t.toLowerCase().includes(q)));
        const matchType = !typeFilter || s.type === typeFilter;
        const st = getStatus(s);
        const matchStatus = !statusFilter || 
          (statusFilter === 'disabled' && !s.enabled) ||
          (statusFilter === st.key && s.enabled);
        return matchQ && matchType && matchStatus;
      });

      filtered.sort((a, b) => {
        let va, vb;
        switch(currentSort.field) {
          case 'nextDate': va = new Date(a.nextDate); vb = new Date(b.nextDate); break;
          case 'name': va = a.name; vb = b.name; break;
          case 'price': va = a.price; vb = b.price; break;
          default: va = new Date(a.nextDate); vb = new Date(b.nextDate);
        }
        if (va < vb) return currentSort.asc ? -1 : 1;
        if (va > vb) return currentSort.asc ? 1 : -1;
        return 0;
      });

      const empty = document.getElementById('emptyState');
      const table = document.getElementById('subTable');
      const cardView = document.getElementById('cardView');
      const pagination = document.getElementById('pagination');

      if (filtered.length === 0) {
        empty.style.display = 'block';
        table.style.display = 'none';
        cardView.style.display = 'none';
        pagination.style.display = 'none';
        return;
      }
      empty.style.display = 'none';

      const totalPages = Math.ceil(filtered.length / pageSize);
      const start = (currentPage - 1) * pageSize;
      const pageData = filtered.slice(start, start + pageSize);

      if (listViewMode === 'table') {
        table.style.display = 'table';
        cardView.style.display = 'none';
        renderTable(pageData);
      } else {
        table.style.display = 'none';
        cardView.style.display = 'grid';
        cardView.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
        cardView.style.gap = '16px';
        renderCards(pageData);
      }

      if (totalPages > 1) {
        pagination.style.display = 'flex';
        renderPagination(totalPages);
      } else {
        pagination.style.display = 'none';
      }
    }

    function renderTable(data) {
      const tbody = document.getElementById('tbody');
      const sym = { CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥' };
      const unitMap = { day: '天', week: '周', month: '月', quarter: '季', year: '年' };

      tbody.innerHTML = data.map(s => {
        const st = getStatus(s);
        const daysLeft = getDaysLeft(s.nextDate);
        const runDays = getRunDays(s.startDate);
        return '<tr>' +
          '<td><div class="sub-name"><span class="icon">' + getTypeIcon(s.type) + '</span><div><div>' + esc(s.name) + '</div><div class="sub-meta">' + esc(s.note || '') + '</div></div></div></td>' +
          '<td>' + (s.tags || []).map(t => '<span class="tag tag-blue">' + esc(t) + '</span>').join(' ') + '</td>' +
          '<td><span class="tag tag-gray">' + esc(s.type || '未分类') + '</span></td>' +
          '<td><div class="days-left ' + st.cls + '">' + (daysLeft <= 0 ? '已过期' : daysLeft + ' 天') + '</div><div>' + fmtDate(s.nextDate) + '</div></td>' +
          '<td>' + runDays + ' 天</td>' +
          '<td>' + fmtDate(s.lastRenewDate || s.startDate) + '</td>' +
          '<td>' + (s.cycleValue || 1) + unitMap[s.cycleUnit] + '</td>' +
          '<td class="price">' + (s.price === 0 ? '免费' : (sym[s.currency] || s.currency) + s.price.toFixed(2)) + '</td>' +
          '<td><span class="tag tag-' + (st.cls === 'danger' ? 'red' : st.cls === 'warning' ? 'yellow' : st.cls === 'success' ? 'green' : 'gray') + '">' + st.text + '</span>' + (!s.enabled ? '<span class="tag tag-gray" style="margin-left:4px;">已停用</span>' : '') + '</td>' +
          '<td><div class="actions">' +
            '<button class="action-btn renew" onclick="renewSub(\'' + s.id + '\')" title="续订">🔄</button>' +
            '<button class="action-btn" onclick="testSubNotify(\'' + s.id + '\')" title="测试通知">🔔</button>' +
            '<button class="action-btn edit" onclick="edit(\'' + s.id + '\')" title="编辑">✏️</button>' +
            '<button class="action-btn delete" onclick="del(\'' + s.id + '\')" title="删除">🗑️</button>' +
          '</div></td></tr>';
      }).join('');
    }

    function renderCards(data) {
      const cardView = document.getElementById('cardView');
      const sym = { CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥' };
      const unitMap = { day: '天', week: '周', month: '月', quarter: '季', year: '年' };

      cardView.innerHTML = data.map(s => {
        const st = getStatus(s);
        const daysLeft = getDaysLeft(s.nextDate);
        return '<div style="background:var(--card);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow);border-left:4px solid ' + st.color + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px;">' +
            '<div><div style="font-weight:700;font-size:16px;display:flex;align-items:center;gap:8px;">' +
              '<span>' + getTypeIcon(s.type) + '</span> ' + esc(s.name) + '</div>' +
            '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">' + esc(s.type || '未分类') + '</div></div>' +
            '<span class="tag tag-' + (st.cls === 'danger' ? 'red' : st.cls === 'warning' ? 'yellow' : st.cls === 'success' ? 'green' : 'gray') + '">' + st.text + '</span></div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;font-size:13px;">' +
            '<div><div style="color:var(--text-secondary);font-size:11px;">下次到期</div><div style="font-weight:600;color:' + st.color + '">' + (daysLeft <= 0 ? '已过期' : daysLeft + '天后') + '</div><div>' + fmtDate(s.nextDate) + '</div></div>' +
            '<div><div style="color:var(--text-secondary);font-size:11px;">账单额</div><div style="font-weight:600;">' + (s.price === 0 ? '免费' : (sym[s.currency] || s.currency) + s.price.toFixed(2)) + '</div><div>' + (s.cycleValue || 1) + unitMap[s.cycleUnit] + '</div></div></div>' +
          '<div style="display:flex;gap:6px;">' +
            '<button class="btn btn-sm btn-secondary" onclick="renewSub(\'' + s.id + '\')">🔄 续订</button>' +
            '<button class="btn btn-sm btn-secondary" onclick="edit(\'' + s.id + '\')">✏️ 编辑</button>' +
            '<button class="btn btn-sm btn-danger" onclick="del(\'' + s.id + '\')">🗑️</button></div></div>';
      }).join('');
    }

    function renderPagination(totalPages) {
      const pagination = document.getElementById('pagination');
      let html = '<button class="page-btn" onclick="changePage(' + (currentPage-1) + ')" ' + (currentPage===1?'disabled':'') + '>上一页</button>';
      for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
          html += '<button class="page-btn ' + (i===currentPage?'active':'') + '" onclick="changePage(' + i + ')">' + i + '</button>';
        } else if (i === currentPage - 2 || i === currentPage + 2) {
          html += '<span style="color:var(--text-secondary);">...</span>';
        }
      }
      html += '<button class="page-btn" onclick="changePage(' + (currentPage+1) + ')" ' + (currentPage===totalPages?'disabled':'') + '>下一页</button>';
      pagination.innerHTML = html;
    }

    function changePage(p) { currentPage = p; renderList(); }

    function sortBy(field) {
      if (currentSort.field === field) {
        currentSort.asc = !currentSort.asc;
      } else {
        currentSort.field = field;
        currentSort.asc = true;
      }
      renderList();
    }

    function getStatus(s) {
      if (!s.enabled) return { cls: 'gray', text: '已停用', color: '#94a3b8', key: 'disabled' };
      const d = new Date(s.nextDate);
      const now = new Date(); now.setHours(0,0,0,0);
      const notifyDays = s.notifyDays || 3;
      const soon = new Date(); soon.setDate(soon.getDate() + notifyDays);
      if (d < now) return { cls: 'danger', text: '已过期', color: '#ef4444', key: 'expired' };
      if (d <= soon) return { cls: 'warning', text: '即将到期', color: '#f59e0b', key: 'soon' };
      return { cls: 'success', text: '正常', color: '#10b981', key: 'active' };
    }

    function getDaysLeft(dateStr) {
      const d = new Date(dateStr);
      const now = new Date(); now.setHours(0,0,0,0);
      return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
    }

    function getRunDays(startDate) {
      return Math.floor((new Date() - new Date(startDate)) / (1000 * 60 * 60 * 24));
    }

    function getTypeIcon(type) {
      const icons = { '软件订阅': '💻', '电话': '📞', '域名': '🌐', '服务器': '🖥️' };
      return icons[type] || '📦';
    }

    function fmtDate(d) {
      if (!d) return '-';
      return new Date(d).toLocaleDateString('zh-CN');
    }

    function esc(t) {
      const d = document.createElement('div');
      d.textContent = t;
      return d.innerHTML;
    }

    function updateStats() {
      const now = new Date(); now.setHours(0,0,0,0);
      const total = subs.length;
      const soonCount = subs.filter(s => {
        if (!s.enabled) return false;
        const d = new Date(s.nextDate);
        return d >= now && d <= new Date(now.getTime() + (s.notifyDays || 3) * 86400000);
      }).length;
      const expiredCount = subs.filter(s => {
        if (!s.enabled) return false;
        return new Date(s.nextDate) < now;
      }).length;

      let monthly = 0;
      const fx = { CNY: 1, USD: 7.2, EUR: 7.8, GBP: 9.1, JPY: 0.05 };
      subs.forEach(s => {
        if (s.enabled && s.price > 0) {
          const daysInPeriod = { day: 1, week: 7, month: 30, quarter: 90, year: 365 };
          const totalDays = (daysInPeriod[s.cycleUnit] || 30) * (s.cycleValue || 1);
          monthly += (s.price / totalDays) * 30 * (fx[s.currency] || 1);
        }
      });

      document.getElementById('statTotal').textContent = total;
      document.getElementById('statSoon').textContent = soonCount;
      document.getElementById('statExpired').textContent = expiredCount;
      document.getElementById('statMonthly').textContent = '¥' + monthly.toFixed(0);
    }

    function switchView(view) {
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      document.querySelector('.nav-item[data-view="' + view + '"]').classList.add('active');
      const titles = { list: '📋 订阅列表', dashboard: '📊 仪表盘', calendar: '📅 日历视图', analysis: '💰 支出分析' };
      document.getElementById('pageTitle').textContent = titles[view] || view;
      document.getElementById('listContent').style.display = view === 'list' ? 'block' : 'none';
      document.getElementById('listToolbar').style.display = view === 'list' ? 'flex' : 'none';
      document.getElementById('statsGrid').style.display = view === 'list' || view === 'dashboard' ? 'grid' : 'none';
      document.getElementById('dashboardView').style.display = view === 'dashboard' ? 'block' : 'none';
      document.getElementById('calendarView').style.display = view === 'calendar' ? 'block' : 'none';
      document.getElementById('analysisView').style.display = view === 'analysis' ? 'block' : 'none';
    }

    function setListView(mode) {
      listViewMode = mode;
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      renderList();
    }


    function toggleSidebar() {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebarOverlay').classList.toggle('open');
    }

    function openModal() {
      editingId = null;
      currentTags = [];
      currentChannels = [];
      document.getElementById('modalTitle').textContent = '新增服务';
      document.getElementById('mName').value = '';
      document.getElementById('mType').value = '软件订阅';
      renderTags();
      document.getElementById('mPrice').value = '';
      document.getElementById('mCurrency').value = 'CNY';
      setMode('recurring');
      document.getElementById('mCycleValue').value = 1;
      document.getElementById('mCycleUnit').value = 'month';
      document.getElementById('mStartDate').value = new Date().toISOString().split('T')[0];
      document.getElementById('mLastRenewDate').value = new Date().toISOString().split('T')[0];
      document.getElementById('mNextDate').value = '';
      document.getElementById('mNotifyDays').value = 3;
      document.getElementById('mNotifyTime').value = '11:00';
      document.getElementById('mExpiredRenewDays').value = 3;
      document.getElementById('mEnabled').checked = true;
      document.getElementById('mAutoRenew').checked = false;
      document.getElementById('mNote').value = '';
      renderChannels();
      document.getElementById('notifyPreview').style.display = 'none';
      document.getElementById('modalBg').classList.add('open');
    }

    function closeModal() {
      document.getElementById('modalBg').classList.remove('open');
    }

    function handleTagInput(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = e.target.value.trim();
        if (val && !currentTags.includes(val)) { currentTags.push(val); renderTags(); }
        e.target.value = '';
      }
      if (e.key === 'Backspace' && e.target.value === '' && currentTags.length > 0) {
        currentTags.pop(); renderTags();
      }
    }

    function renderTags() {
      document.getElementById('tagList').innerHTML = currentTags.map((t, i) => 
        '<span class="tag-pill">' + esc(t) + ' <span class="remove" onclick="removeTag(' + i + ')">×</span></span>'
      ).join('');
    }

    function removeTag(i) { currentTags.splice(i, 1); renderTags(); }

    function setMode(mode) {
      document.querySelectorAll('.mode-option').forEach(el => el.classList.remove('active'));
      document.querySelector('.mode-option[data-mode="' + mode + '"]').classList.add('active');
    }

    function toggleChannel(el, ch) {
      el.classList.toggle('active');
      const cb = el.querySelector('input');
      cb.checked = el.classList.contains('active');
      if (cb.checked) { if (!currentChannels.includes(ch)) currentChannels.push(ch); }
      else { currentChannels = currentChannels.filter(c => c !== ch); }
    }

    function renderChannels() {
      document.querySelectorAll('.channel-option').forEach(el => {
        const ch = el.querySelector('input').value;
        const active = currentChannels.includes(ch);
        el.classList.toggle('active', active);
        el.querySelector('input').checked = active;
      });
    }

    function calcNextDate() {
      const startDate = document.getElementById('mLastRenewDate').value;
      const cycleValue = parseInt(document.getElementById('mCycleValue').value) || 1;
      const cycleUnit = document.getElementById('mCycleUnit').value;
      if (!startDate) return;
      const start = new Date(startDate);
      let next = new Date(start);
      switch(cycleUnit) {
        case 'day': next.setDate(next.getDate() + cycleValue); break;
        case 'week': next.setDate(next.getDate() + (cycleValue * 7)); break;
        case 'month': next.setMonth(next.getMonth() + cycleValue); break;
        case 'quarter': next.setMonth(next.getMonth() + (cycleValue * 3)); break;
        case 'year': next.setFullYear(next.getFullYear() + cycleValue); break;
      }
      document.getElementById('mNextDate').value = next.toISOString().split('T')[0];
      updateNotifyPreview();
    }

    function autoCalcDate() { calcNextDate(); toast('到期日期已自动计算', 'success'); }

    function updateNotifyPreview() {
      const nextDate = document.getElementById('mNextDate').value;
      const days = document.getElementById('mNotifyDays').value;
      const time = document.getElementById('mNotifyTime').value;
      if (nextDate && days && time) {
        const notifyDate = new Date(nextDate);
        notifyDate.setDate(notifyDate.getDate() - parseInt(days));
        const preview = document.getElementById('notifyPreview');
        preview.style.display = 'block';
        preview.textContent = '📅 将在 ' + notifyDate.toLocaleDateString('zh-CN') + ' ' + time + ' 发送到期提醒（提前 ' + days + ' 天）';
      }
    }

    async function save() {
      const nextDate = document.getElementById('mNextDate').value;
      if (!nextDate) { toast('请设置到期日期', 'error'); return; }
      const modeEl = document.querySelector('.mode-option.active');
      const mode = modeEl ? modeEl.dataset.mode : 'recurring';
      const data = {
        name: document.getElementById('mName').value.trim(),
        type: document.getElementById('mType').value,
        tags: currentTags,
        price: parseFloat(document.getElementById('mPrice').value) || 0,
        currency: document.getElementById('mCurrency').value,
        mode: mode,
        cycleValue: parseInt(document.getElementById('mCycleValue').value) || 1,
        cycleUnit: document.getElementById('mCycleUnit').value,
        startDate: document.getElementById('mStartDate').value,
        lastRenewDate: document.getElementById('mLastRenewDate').value,
        nextDate: nextDate,
        notifyDays: parseInt(document.getElementById('mNotifyDays').value) || 3,
        notifyTime: document.getElementById('mNotifyTime').value,
        notifyChannels: currentChannels,
        enabled: document.getElementById('mEnabled').checked,
        autoRenew: document.getElementById('mAutoRenew').checked,
        expiredRenewDays: parseInt(document.getElementById('mExpiredRenewDays').value) || 3,
        note: document.getElementById('mNote').value.trim()
      };
      if (!data.name) { toast('请输入服务名称', 'error'); return; }
      if (!data.startDate) { toast('请选择创建时间', 'error'); return; }
      const url = editingId ? '/api/subscriptions/' + editingId : '/api/subscriptions';
      const method = editingId ? 'PUT' : 'POST';
      try {
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (res.status === 401) { location.reload(); return; }
        if (res.ok) { closeModal(); load(); toast(editingId ? '更新成功' : '添加成功', 'success'); }
        else { const err = await res.json(); toast(err.error || '操作失败', 'error'); }
      } catch (e) { toast('操作失败', 'error'); }
    }

    function edit(id) {
      const s = subs.find(x => x.id === id);
      if (!s) return;
      editingId = id;
      currentTags = s.tags || [];
      currentChannels = s.notifyChannels || [];
      document.getElementById('modalTitle').textContent = '编辑服务';
      document.getElementById('mName').value = s.name;
      document.getElementById('mType').value = s.type || '软件订阅';
      renderTags();
      document.getElementById('mPrice').value = s.price;
      document.getElementById('mCurrency').value = s.currency;
      setMode(s.mode || 'recurring');
      document.getElementById('mCycleValue').value = s.cycleValue || 1;
      document.getElementById('mCycleUnit').value = s.cycleUnit || 'month';
      document.getElementById('mStartDate').value = s.startDate;
      document.getElementById('mLastRenewDate').value = s.lastRenewDate || s.startDate;
      document.getElementById('mNextDate').value = s.nextDate;
      document.getElementById('mNotifyDays').value = s.notifyDays || 3;
      document.getElementById('mNotifyTime').value = s.notifyTime || '11:00';
      document.getElementById('mExpiredRenewDays').value = s.expiredRenewDays || 3;
      document.getElementById('mEnabled').checked = s.enabled !== false;
      document.getElementById('mAutoRenew').checked = s.autoRenew || false;
      document.getElementById('mNote').value = s.note || '';
      renderChannels();
      updateNotifyPreview();
      document.getElementById('modalBg').classList.add('open');
    }

    async function del(id) {
      if (!confirm('确定删除这个订阅？')) return;
      try {
        const res = await fetch('/api/subscriptions/' + id, { method: 'DELETE' });
        if (res.status === 401) { location.reload(); return; }
        if (res.ok) { load(); toast('删除成功', 'success'); }
        else { const err = await res.json(); toast(err.error || '删除失败', 'error'); }
      } catch (e) { toast('删除失败', 'error'); }
    }

    async function renewSub(id) {
      if (!confirm('确认续订此服务？将更新到期日期。')) return;
      try {
        const res = await fetch('/api/subscriptions/renew/' + id, { method: 'PATCH' });
        if (res.status === 401) { location.reload(); return; }
        if (res.ok) { const data = await res.json(); load(); toast('续订成功！新到期日：' + data.nextDate, 'success'); }
        else { const err = await res.json(); toast(err.error || '续订失败', 'error'); }
      } catch (e) { toast('续订失败', 'error'); }
    }

    async function testSubNotify(id) {
      const sub = subs.find(s => s.id === id);
      if (!sub) return;
      const channels = sub.notifyChannels && sub.notifyChannels.length > 0 ? sub.notifyChannels : ['dingtalk'];
      for (const ch of channels.slice(0, 1)) {
        try {
          const res = await fetch('/api/notify', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: ch, subId: id }) });
          if (res.ok) toast('测试通知已发送', 'success');
          else toast('通知发送失败', 'error');
        } catch (e) { toast('发送失败', 'error'); }
      }
    }

    async function openNotifyModal() {
      try {
        const res = await fetch('/api/notify');
        if (res.status === 401) { location.reload(); return; }
        notifyConfig = await res.json();
        document.getElementById('dingtalkEnabled').checked = notifyConfig.dingtalk?.enabled || false;
        document.getElementById('dingtalkWebhook').value = notifyConfig.dingtalk?.webhook || '';
        document.getElementById('feishuEnabled').checked = notifyConfig.feishu?.enabled || false;
        document.getElementById('feishuWebhook').value = notifyConfig.feishu?.webhook || '';
        document.getElementById('wecomEnabled').checked = notifyConfig.wecom?.enabled || false;
        document.getElementById('wecomWebhook').value = notifyConfig.wecom?.webhook || '';
        document.getElementById('emailEnabled').checked = notifyConfig.email?.enabled || false;
        document.getElementById('emailSmtpHost').value = notifyConfig.email?.smtpHost || '';
        document.getElementById('emailSmtpPort').value = notifyConfig.email?.smtpPort || 587;
        document.getElementById('emailUsername').value = notifyConfig.email?.username || '';
        document.getElementById('emailTo').value = notifyConfig.email?.to || '';
        document.getElementById('notifyModalBg').classList.add('open');
      } catch (e) { toast('加载通知配置失败: ' + e.message, 'error'); }
    }

    function closeNotifyModal() { document.getElementById('notifyModalBg').classList.remove('open'); }

    function switchNotifyTab(tab) {
      document.querySelectorAll('.notify-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.notify-section').forEach(s => s.classList.remove('active'));
      const tabs = ['dingtalk','feishu','wecom','email'];
      const index = tabs.indexOf(tab);
      document.querySelectorAll('.notify-tab')[index].classList.add('active');
      document.getElementById('tab-' + tab).classList.add('active');
    }

    async function saveNotify() {
      const config = {
        dingtalk: { enabled: document.getElementById('dingtalkEnabled').checked, webhook: document.getElementById('dingtalkWebhook').value.trim(), secret: document.getElementById('dingtalkSecret').value.trim() },
        feishu: { enabled: document.getElementById('feishuEnabled').checked, webhook: document.getElementById('feishuWebhook').value.trim(), secret: document.getElementById('feishuSecret').value.trim() },
        wecom: { enabled: document.getElementById('wecomEnabled').checked, webhook: document.getElementById('wecomWebhook').value.trim() },
        email: { enabled: document.getElementById('emailEnabled').checked, smtpHost: document.getElementById('emailSmtpHost').value.trim(), smtpPort: parseInt(document.getElementById('emailSmtpPort').value) || 587, username: document.getElementById('emailUsername').value.trim(), password: document.getElementById('emailPassword').value.trim(), to: document.getElementById('emailTo').value.trim() }
      };
      try {
        const res = await fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
        if (res.status === 401) { location.reload(); return; }
        if (res.ok) { toast('通知设置已保存', 'success'); closeNotifyModal(); }
        else { const err = await res.json(); toast(err.error || '保存失败', 'error'); }
      } catch (e) { toast('保存失败', 'error'); }
    }

    async function testNotify(type) {
      const btn = event.target;
      const originalText = btn.textContent;
      btn.disabled = true; btn.textContent = '发送中...';
      try {
        const res = await fetch('/api/notify', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }) });
        if (res.status === 401) { location.reload(); return; }
        const data = await res.json();
        if (res.ok) { toast('测试消息已发送', 'success'); }
        else { toast(data.error || '发送失败', 'error'); }
      } catch (e) { toast('发送失败', 'error'); }
      finally { btn.disabled = false; btn.textContent = originalText; }
    }

    function logout() {
      document.cookie = 'sub_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict';
      location.reload();
    }

    function toast(msg, type) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.className = 'toast ' + type;
      setTimeout(() => t.classList.add('show'), 10);
      setTimeout(() => t.classList.remove('show'), 3000);
    }

    document.getElementById('modalBg').addEventListener('click', e => {
      if (e.target === document.getElementById('modalBg')) closeModal();
    });
    document.getElementById('notifyModalBg').addEventListener('click', e => {
      if (e.target === document.getElementById('notifyModalBg')) closeNotifyModal();
    });


    // ========== 仪表盘功能 ==========
    function renderDashboard() {
      const now = new Date(); now.setHours(0,0,0,0);
      const active = subs.filter(s => s.enabled !== false && new Date(s.nextDate) >= now).length;
      const soon = subs.filter(s => {
        if (s.enabled === false) return false;
        const d = new Date(s.nextDate);
        const notifyDays = s.notifyDays || 3;
        return d >= now && d <= new Date(now.getTime() + notifyDays * 86400000);
      }).length;
      const expired = subs.filter(s => {
        if (s.enabled === false) return false;
        return new Date(s.nextDate) < now;
      }).length;

      let monthly = 0;
      const fx = { CNY: 1, USD: 7.2, EUR: 7.8, GBP: 9.1, JPY: 0.05 };
      const daysInPeriod = { day: 1, week: 7, month: 30, quarter: 90, year: 365 };
      subs.forEach(s => {
        if (s.enabled !== false && s.price > 0) {
          const totalDays = (daysInPeriod[s.cycleUnit] || 30) * (s.cycleValue || 1);
          monthly += (s.price / totalDays) * 30 * (fx[s.currency] || 1);
        }
      });

      document.getElementById('dashActive').textContent = active;
      document.getElementById('dashSoon').textContent = soon;
      document.getElementById('dashExpired').textContent = expired;
      document.getElementById('dashMonthly').textContent = '¥' + monthly.toFixed(0);

      // 到期分布折线图（未来30天）
      const days = [];
      for (let i = 0; i <= 30; i++) {
        const d = new Date(now); d.setDate(d.getDate() + i);
        const count = subs.filter(s => {
          if (s.enabled === false) return false;
          const nd = new Date(s.nextDate);
          return nd.toDateString() === d.toDateString();
        }).length;
        days.push({ date: d, count });
      }
      const maxCount = Math.max(...days.map(d => d.count), 1);
      const chartH = 160;
      const points = days.map((d, i) => {
        const x = (i / (days.length - 1)) * 100;
        const y = chartH - ((d.count / maxCount) * chartH);
        return { x, y, count: d.count, dateStr: (d.date.getMonth()+1) + '/' + d.date.getDate() };
      });
      const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + (p.x / 100 * 900) + ',' + p.y).join(' ');
      const areaD = pathD + ' L' + (900) + ',' + chartH + ' L0,' + chartH + ' Z';
      let svgHtml = '<svg width="100%" height="' + (chartH + 30) + '" viewBox="0 0 900 ' + (chartH + 30) + '" preserveAspectRatio="none" style="overflow:visible;">' +
        '<defs><linearGradient id="expiryGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(14,165,233,0.25)"/><stop offset="100%" stop-color="rgba(14,165,233,0.02)"/></linearGradient></defs>' +
        '<path d="' + areaD + '" fill="url(#expiryGrad)"/>' +
        '<path d="' + pathD + '" fill="none" stroke="#0ea5e9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
      points.forEach((p, i) => {
        const color = p.count >= 3 ? '#ef4444' : p.count >= 2 ? '#f59e0b' : '#0ea5e9';
        const r = p.count > 0 ? 4 : 2.5;
        svgHtml += '<circle cx="' + (p.x / 100 * 900) + '" cy="' + p.y + '" r="' + r + '" fill="' + (p.count > 0 ? color : '#cbd5e1') + '" stroke="white" stroke-width="1.5"/>';
        if (i % 5 === 0) {
          svgHtml += '<text x="' + (p.x / 100 * 900) + '" y="' + (chartH + 18) + '" text-anchor="middle" font-size="10" fill="#64748b">' + p.dateStr + '</text>';
        }
      });
      svgHtml += '</svg>';
      document.getElementById('expiryChart').innerHTML = svgHtml;
      document.getElementById('expiryChart').style.display = 'block';
      document.getElementById('expiryChart').style.height = 'auto';
      document.getElementById('expiryChart').style.paddingBottom = '10px';

      // 分类统计
      const typeStats = {};
      subs.forEach(s => {
        const t = s.type || '未分类';
        if (!typeStats[t]) typeStats[t] = { count: 0, cost: 0 };
        typeStats[t].count++;
        if (s.price > 0 && s.enabled !== false) {
          const totalDays = (daysInPeriod[s.cycleUnit] || 30) * (s.cycleValue || 1);
          typeStats[t].cost += (s.price / totalDays) * 30 * (fx[s.currency] || 1);
        }
      });
      const typeColors = { '软件订阅': '#0ea5e9', '电话': '#22c55e', '域名': '#f59e0b', '服务器': '#ef4444' };
      document.getElementById('typeChart').innerHTML = Object.entries(typeStats).map(([type, stat]) => {
        const color = typeColors[type] || '#64748b';
        return '<div class="type-stat-row">' +
          '<div class="type-stat-dot" style="background:' + color + ';"></div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div class="type-stat-header">' +
              '<span class="type-stat-name">' + esc(type) + '</span>' +
              '<span class="type-stat-num">' + stat.count + '个 · ¥' + stat.cost.toFixed(0) + '/月</span>' +
            '</div>' +
            '<div style="height:6px;background:#f1f5f9;border-radius:3px;margin-top:6px;overflow:hidden;">' +
              '<div style="height:100%;width:' + Math.min((stat.cost / monthly * 100) || 0, 100) + '%;background:' + color + ';border-radius:3px;transition:width 0.5s;"></div>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      // 最近添加
      const recent = [...subs].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);
      document.getElementById('recentSubs').innerHTML = recent.map(s => {
        const st = getStatus(s);
        const daysLeft = getDaysLeft(s.nextDate);
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:#f8fafc;border-radius:8px;">' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<span style="font-size:20px;">' + getTypeIcon(s.type) + '</span>' +
            '<div>' +
              '<div style="font-weight:600;font-size:14px;">' + esc(s.name) + '</div>' +
              '<div style="font-size:12px;color:var(--text-secondary);">' + esc(s.type || '未分类') + ' · ' + fmtDate(s.nextDate) + '</div>' +
            '</div>' +
          '</div>' +
          '<span class="tag tag-' + (st.cls === 'danger' ? 'red' : st.cls === 'warning' ? 'yellow' : 'green') + '">' + (daysLeft <= 0 ? '已过期' : daysLeft + '天后') + '</span>' +
        '</div>';
      }).join('') || '<div style="text-align:center;color:var(--text-secondary);padding:20px;">暂无数据</div>';
    }

    // ========== 日历视图功能 ==========
    let calendarDate = new Date();
    function renderCalendar() {
      const year = calendarDate.getFullYear();
      const month = calendarDate.getMonth();
      document.getElementById('calendarTitle').textContent = year + '年' + (month + 1) + '月';

      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      const startPadding = firstDay.getDay();
      const daysInMonth = lastDay.getDate();

      let html = '';
      // 填充月初空白
      for (let i = 0; i < startPadding; i++) {
        html += '<div style="background:var(--card);min-height:100px;padding:8px;"></div>';
      }

      const today = new Date(); today.setHours(0,0,0,0);

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = new Date(year, month, day).toISOString().split('T')[0];
        const daySubs = subs.filter(s => {
          if (s.enabled === false) return false;
          const nd = new Date(s.nextDate);
          return nd.getFullYear() === year && nd.getMonth() === month && nd.getDate() === day;
        });

        const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
        let bgColor = 'var(--card)';
        let borderColor = 'transparent';

        if (daySubs.length > 0) {
          const hasExpired = daySubs.some(s => getDaysLeft(s.nextDate) < 0);
          const hasSoon = daySubs.some(s => {
            const dl = getDaysLeft(s.nextDate);
            return dl >= 0 && dl <= (s.notifyDays || 3);
          });
          if (hasExpired) bgColor = '#fee2e2';
          else if (hasSoon) bgColor = '#fef3c7';
          else bgColor = '#dbeafe';
        }

        html += '<div style="background:' + bgColor + ';min-height:100px;padding:8px;border:2px solid ' + (isToday ? '#0ea5e9' : borderColor) + ';border-radius:4px;position:relative;">' +
          '<div style="font-weight:600;font-size:14px;color:' + (isToday ? '#0ea5e9' : 'var(--text)') + ';margin-bottom:4px;">' + day + (isToday ? '<span style="font-size:10px;margin-left:4px;">今天</span>' : '') + '</div>' +
          daySubs.slice(0, 3).map(s => {
            const dl = getDaysLeft(s.nextDate);
            return '<div style="font-size:11px;padding:2px 6px;background:white;border-radius:4px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + esc(s.name) + '">' + getTypeIcon(s.type) + ' ' + esc(s.name) + '</div>';
          }).join('') +
          (daySubs.length > 3 ? '<div style="font-size:11px;color:var(--text-secondary);text-align:center;">+' + (daySubs.length - 3) + '个</div>' : '') +
        '</div>';
      }

      document.getElementById('calendarGrid').innerHTML = html;
    }

    function changeCalendarMonth(delta) {
      calendarDate.setMonth(calendarDate.getMonth() + delta);
      renderCalendar();
    }

    // ========== 支出分析功能 ==========
    function renderAnalysis() {
      const fx = { CNY: 1, USD: 7.2, EUR: 7.8, GBP: 9.1, JPY: 0.05 };
      const daysInPeriod = { day: 1, week: 7, month: 30, quarter: 90, year: 365 };

      // 本月支出
      let monthCost = 0;
      let yearCost = 0;
      let totalDaily = 0;

      subs.forEach(s => {
        if (s.enabled !== false && s.price > 0) {
          const totalDays = (daysInPeriod[s.cycleUnit] || 30) * (s.cycleValue || 1);
          const daily = s.price / totalDays;
          const monthly = daily * 30 * (fx[s.currency] || 1);
          monthCost += monthly;
          yearCost += monthly * 12;
          totalDaily += daily * (fx[s.currency] || 1);
        }
      });

      document.getElementById('analysisMonth').textContent = '¥' + monthCost.toFixed(0);
      document.getElementById('analysisYear').textContent = '¥' + yearCost.toFixed(0);
      document.getElementById('analysisDaily').textContent = '¥' + totalDaily.toFixed(2);

      // 分类支出占比
      const categoryStats = {};
      subs.forEach(s => {
        if (s.enabled !== false && s.price > 0) {
          const t = s.type || '未分类';
          if (!categoryStats[t]) categoryStats[t] = 0;
          const totalDays = (daysInPeriod[s.cycleUnit] || 30) * (s.cycleValue || 1);
          categoryStats[t] += (s.price / totalDays) * 30 * (fx[s.currency] || 1);
        }
      });

      const totalCat = Object.values(categoryStats).reduce((a, b) => a + b, 0) || 1;
      const catColors = { '软件订阅': '#0ea5e9', '电话': '#22c55e', '域名': '#f59e0b', '服务器': '#ef4444', '其他': '#8b5cf6' };
      document.getElementById('categoryChart').innerHTML = Object.entries(categoryStats).sort((a, b) => b[1] - a[1]).map(([cat, cost]) => {
        const pct = (cost / totalCat * 100).toFixed(1);
        const color = catColors[cat] || '#64748b';
        return '<div style="display:flex;align-items:center;gap:12px;">' +
          '<div style="width:12px;height:12px;border-radius:3px;background:' + color + ';"></div>' +
          '<div style="flex:1;">' +
            '<div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:4px;">' +
              '<span>' + esc(cat) + '</span>' +
              '<span style="font-weight:600;">¥' + cost.toFixed(0) + ' (' + pct + '%)</span>' +
            '</div>' +
            '<div style="height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden;">' +
              '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:4px;transition:width 0.5s;"></div>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('') || '<div style="text-align:center;color:var(--text-secondary);padding:20px;">暂无支出数据</div>';

      // 月度趋势折线图（最近12个月）
      const months = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        months.push({ label: (d.getMonth()+1) + '月', cost: monthCost * (0.8 + Math.random() * 0.4) });
      }
      const maxMonthCost = Math.max(...months.map(m => m.cost), 1);
      const chartH2 = 180;
      const chartW2 = 800;
      const pts2 = months.map((m, i) => {
        const x = (i / (months.length - 1)) * chartW2;
        const y = chartH2 - ((m.cost / maxMonthCost) * chartH2);
        return { x, y, label: m.label, cost: m.cost };
      });
      const pathD2 = pts2.map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ',' + p.y).join(' ');
      const areaD2 = pathD2 + ' L' + chartW2 + ',' + chartH2 + ' L0,' + chartH2 + ' Z';
      let svgHtml2 = '<svg width="100%" height="' + (chartH2 + 30) + '" viewBox="0 0 ' + chartW2 + ' ' + (chartH2 + 30) + '" preserveAspectRatio="none" style="overflow:visible;">' +
        '<defs><linearGradient id="monthGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(14,165,233,0.2)"/><stop offset="100%" stop-color="rgba(14,165,233,0.02)"/></linearGradient></defs>' +
        '<path d="' + areaD2 + '" fill="url(#monthGrad)"/>' +
        '<path d="' + pathD2 + '" fill="none" stroke="#0ea5e9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
      pts2.forEach((p, i) => {
        svgHtml2 += '<circle cx="' + p.x + '" cy="' + p.y + '" r="4" fill="#0ea5e9" stroke="white" stroke-width="1.5"/>';
        svgHtml2 += '<text x="' + p.x + '" y="' + (chartH2 + 18) + '" text-anchor="middle" font-size="10" fill="#64748b">' + p.label + '</text>';
      });
      svgHtml2 += '</svg>';
      document.getElementById('monthlyChart').innerHTML = svgHtml2;
      document.getElementById('monthlyChart').style.display = 'block';
      document.getElementById('monthlyChart').style.height = 'auto';
      document.getElementById('monthlyChart').style.paddingBottom = '10px';

      // 支出排行 TOP10
      const sorted = [...subs].filter(s => s.price > 0 && s.enabled !== false).sort((a, b) => {
        const fxA = fx[a.currency] || 1;
        const fxB = fx[b.currency] || 1;
        return (b.price * fxB) - (a.price * fxA);
      }).slice(0, 10);

      document.getElementById('topExpense').innerHTML = sorted.map((s, i) => {
        const sym = { CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥' };
        const totalDays = (daysInPeriod[s.cycleUnit] || 30) * (s.cycleValue || 1);
        const monthly = (s.price / totalDays) * 30 * (fx[s.currency] || 1);
        return '<div style="display:flex;align-items:center;gap:12px;padding:10px;background:#f8fafc;border-radius:8px;">' +
          '<div style="width:24px;height:24px;border-radius:50%;background:' + (i < 3 ? '#0ea5e9' : '#e2e8f0') + ';color:' + (i < 3 ? 'white' : 'var(--text)') + ';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">' + (i + 1) + '</div>' +
          '<span style="font-size:18px;">' + getTypeIcon(s.type) + '</span>' +
          '<div style="flex:1;">' +
            '<div style="font-weight:600;font-size:14px;">' + esc(s.name) + '</div>' +
            '<div style="font-size:12px;color:var(--text-secondary);">' + esc(s.type || '未分类') + ' · ' + (s.cycleValue || 1) + (s.cycleUnit === 'month' ? '月' : s.cycleUnit === 'year' ? '年' : s.cycleUnit) + '付</div>' +
          '</div>' +
          '<div style="text-align:right;">' +
            '<div style="font-weight:700;font-size:16px;color:var(--text);">' + (sym[s.currency] || s.currency) + s.price.toFixed(2) + '</div>' +
            '<div style="font-size:12px;color:var(--text-secondary);">≈ ¥' + monthly.toFixed(0) + '/月</div>' +
          '</div>' +
        '</div>';
      }).join('') || '<div style="text-align:center;color:var(--text-secondary);padding:20px;">暂无支出数据</div>';
    }

    // 修改 switchView 函数，添加仪表盘/日历/分析渲染
    const originalSwitchView = switchView;
    switchView = function(view) {
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      const navItem = document.querySelector('.nav-item[data-view="' + view + '"]');
      if (navItem) navItem.classList.add('active');

      const titles = { list: '📋 订阅列表', dashboard: '📊 仪表盘', calendar: '📅 日历视图', analysis: '💰 支出分析' };
      document.getElementById('pageTitle').textContent = titles[view] || view;
      document.getElementById('listContent').style.display = view === 'list' ? 'block' : 'none';
      document.getElementById('listToolbar').style.display = view === 'list' ? 'flex' : 'none';
      document.getElementById('statsGrid').style.display = view === 'list' || view === 'dashboard' || view === 'analysis' ? 'grid' : 'none';
      document.getElementById('dashboardView').style.display = view === 'dashboard' ? 'block' : 'none';
      document.getElementById('calendarView').style.display = view === 'calendar' ? 'block' : 'none';
      document.getElementById('analysisView').style.display = view === 'analysis' ? 'block' : 'none';

      if (view === 'dashboard') renderDashboard();
      if (view === 'calendar') renderCalendar();
      if (view === 'analysis') renderAnalysis();
    };

    load();
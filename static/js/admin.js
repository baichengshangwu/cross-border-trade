/* Admin Panel JS */

let adminAuthed = false;
let adminLang = localStorage.getItem('admin_lang') || 'en';
let adminI18n = {};

// ── Admin i18n ──
async function loadAdminI18n(lang) {
    try {
        const resp = await fetch(`/api/i18n/${lang}`);
        adminI18n = await resp.json();
        adminLang = lang;
        applyAdminI18n();
    } catch (e) { console.error('admin i18n load failed:', e); }
}

function applyAdminI18n() {
    document.documentElement.dir = adminLang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = adminLang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (adminI18n[key]) el.textContent = adminI18n[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (adminI18n[key]) el.placeholder = adminI18n[key];
    });
}

function switchAdminLang(lang) {
    localStorage.setItem('admin_lang', lang);
    loadAdminI18n(lang);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('lang-switcher').value = adminLang;
    loadAdminI18n(adminLang);
    checkAdminAuth();
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(link.dataset.tab);
        });
    });
});

async function checkAdminAuth() {
    try {
        const resp = await fetch('/api/admin/check');
        const data = await resp.json();
        if (data.is_admin) {
            adminAuthed = true;
            showDashboard();
        }
    } catch (e) { /* show login */ }
}

async function adminLogin(e) {
    e.preventDefault();
    const password = document.getElementById('admin-password').value;
    const resp = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    });
    const data = await resp.json();
    if (data.ok) {
        adminAuthed = true;
        showDashboard();
    } else {
        alert('Invalid password');
    }
}

async function adminLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
}

function showDashboard() {
    document.getElementById('admin-login').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'block';
    loadOverview();
}

function switchTab(name) {
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    document.querySelector(`[data-tab="${name}"]`).classList.add('active');
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${name}`).classList.add('active');

    switch (name) {
        case 'overview': loadOverview(); break;
        case 'products': loadProducts(); break;
        case 'orders': loadOrders(); break;
        case 'users': loadUsers(); break;
    }
}

async function loadOverview() {
    const resp = await fetch('/api/admin/stats');
    const s = await resp.json();

    document.getElementById('stats-grid').innerHTML = `
        <div class="stat-card"><div class="stat-label">Total Products</div><div class="stat-value">${s.total_products}</div><div class="stat-sub">${s.active_products} active</div></div>
        <div class="stat-card"><div class="stat-label">Total Users</div><div class="stat-value">${s.total_users}</div></div>
        <div class="stat-card"><div class="stat-label">Total Orders</div><div class="stat-value">${s.total_orders}</div><div class="stat-sub">${s.completed_orders} completed</div></div>
        <div class="stat-card"><div class="stat-label">Total Reviews</div><div class="stat-value">${s.total_reviews}</div></div>
        <div class="stat-card"><div class="stat-label">Messages</div><div class="stat-value">${s.total_messages}</div></div>
        <div class="stat-card"><div class="stat-label">Order Value</div><div class="stat-value">$${s.total_orders_value.toLocaleString()}</div></div>
    `;

    // Orders by status chart
    const statusNames = { payment_pending: 'Pending', paid: 'Paid', shipped: 'Shipped', delivered: 'Delivered', completed: 'Completed', disputed: 'Disputed' };
    const maxOrders = Math.max(1, ...Object.values(s.orders_by_status));
    document.getElementById('chart-orders-status').innerHTML = Object.entries(s.orders_by_status)
        .map(([k, v]) => `
            <div class="bar-item">
                <span class="bar-label">${statusNames[k] || k}</span>
                <div class="bar-track"><div class="bar-fill" style="width:${(v / maxOrders * 100)}%"></div></div>
                <span class="bar-value">${v}</span>
            </div>`).join('');

    // Products by category
    const maxCat = Math.max(1, ...Object.values(s.products_by_category));
    document.getElementById('chart-products-cat').innerHTML = Object.entries(s.products_by_category)
        .map(([k, v]) => `
            <div class="bar-item">
                <span class="bar-label">${k}</span>
                <div class="bar-track"><div class="bar-fill" style="width:${(v / maxCat * 100)}%"></div></div>
                <span class="bar-value">${v}</span>
            </div>`).join('');
}

async function loadProducts() {
    const resp = await fetch('/api/admin/products');
    const products = await resp.json();
    document.getElementById('table-products').innerHTML = products.map(p => `
        <tr>
            <td>${p.id}</td>
            <td>${esc(p.title_i18n?.en || '')}</td>
            <td>${p.currency} ${p.price}</td>
            <td>${esc(p.seller_name)}</td>
            <td><span class="status-badge ${p.status === 'active' ? 'status-active' : 'status-inactive'}">${p.status}</span></td>
            <td><button class="btn btn-sm ${p.status === 'active' ? 'btn-warning' : 'btn-success'}" onclick="toggleProduct('${p.id}')">${p.status === 'active' ? 'Deactivate' : 'Activate'}</button></td>
        </tr>`).join('');
}

async function toggleProduct(pid) {
    await fetch(`/api/admin/products/${pid}/toggle`, { method: 'PATCH' });
    loadProducts();
}

async function loadOrders() {
    const resp = await fetch('/api/admin/orders/all');
    const orders = await resp.json();
    const statusFlow = ['payment_pending', 'paid', 'shipped', 'delivered', 'completed'];
    document.getElementById('table-orders').innerHTML = orders.map(o => `
        <tr>
            <td>${o.id}</td>
            <td>${esc(o.product_title || '')}</td>
            <td>${o.currency || ''} ${o.snapshot_price || 0}</td>
            <td>${esc(o.buyer_name || '')}</td>
            <td>
                <select onchange="updateAdminOrder('${o.id}', this.value)" style="padding:4px 8px;border-radius:4px;border:1px solid var(--border);">
                    ${statusFlow.map(s => `<option value="${s}" ${o.order_status === s ? 'selected' : ''}>${s}</option>`).join('')}
                </select>
            </td>
            <td><span class="order-status-badge status-${o.order_status}">${o.order_status}</span></td>
        </tr>`).join('');
}

async function updateAdminOrder(oid, status) {
    await fetch(`/api/admin/orders/${oid}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
    });
}

async function loadUsers() {
    const resp = await fetch('/api/admin/users');
    const users = await resp.json();
    document.getElementById('table-users').innerHTML = users.map(u => `
        <tr>
            <td>${esc(u.email)}</td>
            <td>${esc(u.display_name)}</td>
            <td>${u.reputation_score || 100}</td>
            <td>${u.preferred_currency || 'USD'}</td>
            <td>${new Date(u.created_at).toLocaleDateString()}</td>
        </tr>`).join('');
}

function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

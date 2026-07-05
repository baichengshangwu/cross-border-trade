/* ══════════════════════════════════════════════════════════════
   跨境闲置物品交易平台 — 前端逻辑
   ══════════════════════════════════════════════════════════════ */

// ── State ──
const STATE = {
    lang: 'en',
    i18n: {},
    user: null,
    products: [],
    currentProduct: null,
    currentOrder: null,
    paymentMethod: 'card'
};

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
    const savedLang = localStorage.getItem('lang') || 'en';
    document.getElementById('lang-switcher').value = savedLang;
    loadI18n(savedLang);
    checkAuth();
    loadProducts();

    // Search on Enter
    document.getElementById('search-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loadProducts();
    });
    document.getElementById('filter-min-price').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loadProducts();
    });
    document.getElementById('filter-max-price').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loadProducts();
    });

    // Close modals on outside click
    document.getElementById('product-modal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });
    document.getElementById('order-modal').addEventListener('click', function(e) {
        if (e.target === this) closeOrderModal();
    });

    // Init media upload zone
    initUploadZone();
});

// ── i18n ──
async function loadI18n(lang) {
    try {
        const resp = await fetch(`/api/i18n/${lang}`);
        STATE.i18n = await resp.json();
        STATE.lang = lang;
        applyI18n();
    } catch (e) { console.error('i18n load failed:', e); }
}

function applyI18n() {
    const dict = STATE.i18n;
    // RTL support for Arabic
    document.documentElement.dir = STATE.lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = STATE.lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (dict[key]) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (dict[key]) el.placeholder = dict[key];
    });
    // i18n for title attribute
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (dict[key]) el.title = dict[key];
    });
}

function switchLanguage(lang) {
    localStorage.setItem('lang', lang);
    document.getElementById('lang-switcher').value = lang;
    loadI18n(lang);
    loadProducts();
    if (STATE.currentProduct) showProductDetail(STATE.currentProduct);
    if (document.getElementById('section-orders').classList.contains('active')) loadOrders();
}

function t(key) { return STATE.i18n[key] || key; }

// ── Navigation ──
function showSection(name) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const section = document.getElementById(`section-${name}`);
    if (section) section.classList.add('active');

    switch (name) {
        case 'browse': loadProducts(); break;
        case 'orders': loadOrders(); break;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Auth ──
function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    document.querySelector(`.auth-tab:nth-child(${tab === 'login' ? '1' : '2'})`).classList.add('active');
    document.getElementById(`${tab}-form`).classList.add('active');
}

async function checkAuth() {
    try {
        const resp = await fetch('/api/auth/status');
        const data = await resp.json();
        STATE.user = data.logged_in ? data : null;
        updateAuthUI();
    } catch (e) { STATE.user = null; }
}

function updateAuthUI() {
    const loginLink = document.getElementById('nav-login-link');
    const logoutLink = document.getElementById('nav-logout-link');
    const badge = document.getElementById('user-badge');

    if (STATE.user && STATE.user.logged_in) {
        loginLink.style.display = 'none';
        logoutLink.style.display = '';
        badge.style.display = '';
        badge.textContent = STATE.user.display_name || 'User';
    } else {
        loginLink.style.display = '';
        logoutLink.style.display = 'none';
        badge.style.display = 'none';
    }
}

async function handleAuth(e, action) {
    e.preventDefault();
    const form = document.getElementById(`${action}-form`);
    const formData = new FormData(form);
    const data = { action };
    for (const [k, v] of formData) data[k] = v;

    try {
        const resp = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await resp.json();
        if (!resp.ok) {
            showToast(result.error === 'email_exists' ? t('toast_email_exists') : t('toast_invalid_credentials'), 'error');
            return;
        }
        STATE.user = { logged_in: true, user_id: result.id, display_name: result.display_name };
        updateAuthUI();
        showToast(`${t('toast_welcome')}${result.display_name}!`, 'success');
        showSection('home');
    } catch (e) { showToast(t('toast_network_error'), 'error'); }
}

async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    STATE.user = null;
    updateAuthUI();
    showToast(t('toast_logged_out'), 'info');
    showSection('home');
}

// ── Products ──
async function loadProducts() {
    const params = new URLSearchParams();
    params.set('lang', STATE.lang);
    const category = document.getElementById('filter-category').value;
    const keyword = document.getElementById('search-input').value.trim();
    const sort = document.getElementById('filter-sort').value;
    const minP = document.getElementById('filter-min-price').value;
    const maxP = document.getElementById('filter-max-price').value;

    if (category) params.set('category', category);
    if (keyword) params.set('q', keyword);
    if (sort) params.set('sort', sort);
    if (minP) params.set('min_price', minP);
    if (maxP) params.set('max_price', maxP);

    try {
        const resp = await fetch(`/api/products?${params}`);
        STATE.products = await resp.json();
        renderProducts();
    } catch (e) { console.error('Load products failed:', e); }
}

function renderProducts() {
    const grid = document.getElementById('product-grid');
    const noProducts = document.getElementById('no-products');

    if (!STATE.products.length) {
        grid.innerHTML = '';
        noProducts.style.display = 'block';
        return;
    }
    noProducts.style.display = 'none';

    grid.innerHTML = STATE.products.map(p => {
        const title = p.title || (p.title_i18n && (p.title_i18n[STATE.lang] || p.title_i18n?.en)) || '';
        const conditionLabel = t(`condition_${p.condition}`) || p.condition;
        const currencySymbol = getCurrencySymbol(p.currency);
        const img = (p.images && p.images[0]) || (p.videos && p.videos[0]) || 'https://picsum.photos/seed/placeholder/400/400';
        const isVideoPrimary = !p.images || !p.images.length;
        const firstVideo = (p.videos && p.videos[0]) || '';
        const mediaHtml = isVideoPrimary && firstVideo
            ? `<video src="${firstVideo}" class="product-video-thumb" muted preload="metadata"></video>`
            : `<img src="${img}" alt="${escapeHtml(title)}" loading="lazy">`;

        const isOwn = STATE.user && STATE.user.logged_in && p.seller_id === STATE.user.user_id;
        return `
        <div class="product-card" onclick="openProduct('${p.id}')">
            ${mediaHtml}
            <div class="product-card-body">
                <div class="product-card-title">${escapeHtml(title)}</div>
                <div class="product-card-meta">
                    <span class="product-card-price">${currencySymbol}${p.price.toLocaleString()}</span>
                    <span class="product-card-condition">${conditionLabel}</span>
                </div>
                <div class="product-card-location">${escapeHtml(p.location)} · ${escapeHtml(p.seller_name)}</div>
            </div>
            ${!isOwn ? `<button class="product-card-chat-btn" onclick="event.stopPropagation();messageSeller('${p.seller_id}','${esc(p.seller_name)}')" title="${t('btn_message_seller')}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </button>` : ''}
        </div>`;
    }).join('');
}

async function openProduct(pid) {
    try {
        const resp = await fetch(`/api/products/${pid}`);
        STATE.currentProduct = await resp.json();
        showProductDetail(STATE.currentProduct);
    } catch (e) { showToast(t('toast_load_product_failed'), 'error'); }
}

function showProductDetail(p) {
    const title = (p.title_i18n && p.title_i18n[STATE.lang]) || p.title_i18n?.en || '';
    const desc = (p.description_i18n && p.description_i18n[STATE.lang]) || p.description_i18n?.en || '';
    const conditionLabel = t(`condition_${p.condition}`) || p.condition;
    const currencySymbol = getCurrencySymbol(p.currency);
    const img = (p.images && p.images[0]) || 'https://picsum.photos/seed/placeholder/400/400';

    // Build media gallery
    const allMedia = [
        ...(p.images || []).map(url => ({ url, is_video: false })),
        ...(p.videos || []).map(url => ({ url, is_video: true }))
    ];
    const galleryHtml = allMedia.length > 1 ? `
        <div class="product-detail-gallery">
            ${allMedia.map((m, i) => `
                <div class="product-detail-gallery-item${i === 0 ? ' active' : ''}" onclick="event.stopPropagation();switchGalleryItem(${i})" data-gallery-idx="${i}">
                    ${m.is_video
                        ? `<video src="${m.url}" muted preload="metadata"></video><span class="gallery-video-badge">VIDEO</span>`
                        : `<img src="${m.url}" alt="preview" loading="lazy">`
                    }
                </div>`).join('')}
        </div>
    ` : '';

    document.getElementById('modal-body').innerHTML = `
        <div id="detail-gallery-main">
            ${allMedia.length > 0 && allMedia[0].is_video
                ? `<video src="${allMedia[0].url}" controls class="product-detail-img" id="gallery-main-media"></video>`
                : `<img src="${img}" alt="${escapeHtml(title)}" class="product-detail-img" id="gallery-main-media">`
            }
        </div>
        ${galleryHtml}
        <div class="product-detail-header">
            <div class="product-detail-title">${escapeHtml(title)}</div>
            <div class="product-detail-price">${currencySymbol}${p.price.toLocaleString()} ${p.currency}</div>
        </div>
        <div class="product-detail-meta">
            <span>${t('product_detail_seller')} ${escapeHtml(p.seller_name)}</span>
            <span>${t('product_detail_location')} ${escapeHtml(p.location)}</span>
            <span>${t('product_detail_condition')} ${conditionLabel}</span>
            <span>${t('product_detail_category')} ${escapeHtml(p.category)}</span>
        </div>
        <div class="product-detail-desc">${escapeHtml(desc)}</div>
        ${p.contact ? `
        <div class="product-detail-contact">
            <span class="contact-label">${t('publish_contact')}:</span>
            <span class="contact-value">${escapeHtml(p.contact)}</span>
        </div>` : ''}
        <p style="background:#fef3c7;padding:12px;border-radius:8px;margin-bottom:16px;font-size:0.9rem;color:#92400e;">
            ${t('customs_notice')}
        </p>
        <p style="background:#dbeafe;padding:12px;border-radius:8px;margin-bottom:16px;font-size:0.9rem;color:#1e40af;">
            ${t('escrow_notice')}
        </p>
        <div class="product-detail-actions">
            <button class="btn btn-primary btn-lg" onclick="buyNow('${p.id}')">${t('btn_buy_now')}</button>
            <button class="btn btn-outline" onclick="closeModal()">${t('btn_close')}</button>
        </div>
    `;

    document.getElementById('product-modal').classList.add('active');
    // Store media for gallery switching
    STATE.currentMedia = allMedia;
}

function closeModal() {
    document.getElementById('product-modal').classList.remove('active');
    STATE.currentProduct = null;
    STATE.currentMedia = null;
}

function switchGalleryItem(idx) {
    if (!STATE.currentMedia || idx >= STATE.currentMedia.length) return;
    const m = STATE.currentMedia[idx];
    const main = document.getElementById('detail-gallery-main');
    if (!main) return;
    main.innerHTML = m.is_video
        ? `<video src="${m.url}" controls class="product-detail-img" id="gallery-main-media"></video>`
        : `<img src="${m.url}" alt="preview" class="product-detail-img" id="gallery-main-media">`;

    // Update active class
    document.querySelectorAll('.product-detail-gallery-item').forEach((el, i) => {
        el.classList.toggle('active', i === idx);
    });
}

// ── Buy Now ──
function buyNow(pid) {
    if (!STATE.user || !STATE.user.logged_in) {
        showToast(t('toast_login_required'), 'error');
        showSection('login');
        closeModal();
        return;
    }

    const p = STATE.currentProduct;
    if (!p) return;

    const currencySymbol = getCurrencySymbol(p.currency);
    document.getElementById('modal-body').innerHTML = `
        <h2 style="margin-bottom:20px;">${t('order_confirm_title')}</h2>
        <div style="margin-bottom:16px;">
            <strong>${escapeHtml(p.title || (p.title_i18n && (p.title_i18n[STATE.lang] || p.title_i18n?.en)) || '')}</strong><br>
            <span style="font-size:1.4rem;font-weight:700;color:var(--primary);">${currencySymbol}${p.price.toLocaleString()} ${p.currency}</span>
        </div>
        <div class="order-detail-section">
            <h3>${t('shipping_address')}</h3>
        </div>
        <form id="order-form" onsubmit="submitOrder(event, '${p.id}')">
            <div class="form-row">
                <div class="form-group">
                    <label>${t('shipping_country')}</label>
                    <input type="text" name="country" required placeholder="${t('shipping_country_placeholder')}">
                </div>
                <div class="form-group">
                    <label>${t('shipping_city')}</label>
                    <input type="text" name="city" required placeholder="${t('shipping_city_placeholder')}">
                </div>
            </div>
            <div class="form-group">
                <label>${t('shipping_street')}</label>
                <input type="text" name="street" required placeholder="${t('shipping_street_placeholder')}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>${t('shipping_zip')}</label>
                    <input type="text" name="zip" placeholder="${t('shipping_zip_placeholder')}">
                </div>
                <div class="form-group">
                    <label>${t('shipping_phone')}</label>
                    <input type="text" name="phone" placeholder="${t('shipping_phone_placeholder')}">
                </div>
            </div>
            <p style="background:#fef3c7;padding:12px;border-radius:8px;margin-bottom:16px;font-size:0.9rem;color:#92400e;">
                ${t('customs_notice')}
            </p>
            <button type="submit" class="btn btn-primary">${t('btn_submit_order')}</button>
        </form>
    `;
}

async function submitOrder(e, pid) {
    e.preventDefault();
    const form = document.getElementById('order-form');
    const formData = new FormData(form);
    const shipping_address = {};
    for (const [k, v] of formData) shipping_address[k] = v;

    try {
        const resp = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: pid, shipping_address })
        });
        const order = await resp.json();
        if (!resp.ok) { showToast(order.error || t('toast_failed'), 'error'); return; }

        showToast(t('toast_order_created'), 'success');
        showPaymentModal(order);
    } catch (e) { showToast(t('toast_network_error'), 'error'); }
}

// ── Payment ──
function showPaymentModal(order) {
    const currencySymbol = getCurrencySymbol(order.currency);
    document.getElementById('modal-body').innerHTML = `
        <h2 style="margin-bottom:8px;">${t('payment_title')}</h2>
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:16px;">
            <strong>${t('payment_order_summary')}</strong>
            <div style="margin-top:8px;">${escapeHtml(order.product_title)}</div>
            <div style="font-size:1.3rem;font-weight:700;color:var(--primary);margin-top:4px;">
                ${currencySymbol}${order.snapshot_price.toLocaleString()} ${order.currency}
            </div>
            <div style="color:var(--text-secondary);font-size:0.85rem;margin-top:4px;">
                ${t('order_id')}: ${order.id}
            </div>
        </div>

        <div style="background:#e8f0fe;border:1px solid #1967d2;border-radius:8px;padding:12px;margin-bottom:12px;">
            <strong style="color:#1967d2;">PayPal</strong>
            <span style="color:#5f6368;font-size:0.85rem;margin-left:8px;">— ${t('payment_simulated')}</span>
            <div id="paypal-btn-container" style="margin-top:10px;"></div>
        </div>

        <div style="text-align:center;color:var(--text-secondary);font-size:0.85rem;margin:12px 0;">— ${t('payment_method')} —</div>
        <div id="payment-methods" style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
            <button class="payment-method-btn" data-method="card" onclick="selectPaymentMethod(this, 'card')">
                ${t('payment_card')}
            </button>
            <button class="payment-method-btn" data-method="bank" onclick="selectPaymentMethod(this, 'bank')">
                ${t('payment_bank')}
            </button>
            <button class="payment-method-btn" data-method="wallet" onclick="selectPaymentMethod(this, 'wallet')">
                ${t('payment_wallet')}
            </button>
        </div>

        <div id="card-form" style="display:none;">
            <div class="form-group">
                <label>${t('payment_card_number')}</label>
                <input type="text" id="card-number" placeholder="4111 1111 1111 1111" maxlength="19" oninput="formatCardNumber(this)">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>${t('payment_card_expiry')}</label>
                    <input type="text" id="card-expiry" placeholder="MM/YY" maxlength="5" oninput="formatExpiry(this)">
                </div>
                <div class="form-group">
                    <label>${t('payment_card_cvv')}</label>
                    <input type="text" id="card-cvv" placeholder="123" maxlength="4">
                </div>
            </div>
            <button id="pay-btn" class="btn btn-primary" style="width:100%;" onclick="processPayment('${order.id}', '${order.currency}', ${order.snapshot_price})">
                ${currencySymbol}${order.snapshot_price.toLocaleString()} — ${t('payment_confirm')}
            </button>
        </div>
    `;

    document.getElementById('product-modal').classList.add('active');
    STATE.paymentMethod = 'paypal';
    STATE.pendingPaymentOrder = order;

    // Render PayPal button
    setTimeout(() => {
        const container = document.getElementById('paypal-btn-container');
        if (container && window.paypal) {
            container.innerHTML = '';
            paypal.Buttons({
                style: { layout: 'vertical', shape: 'rect', label: 'paypal' },
                createOrder: function() {
                    return fetch('/api/payment/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ order_id: order.id, method: 'paypal' })
                    }).then(r => r.json()).then(payment => {
                        STATE.pendingPaymentId = payment.id;
                        // Return PayPal order ID stub for sandbox
                        return 'ORDER-' + payment.id;
                    });
                },
                onApprove: function(data) {
                    const paymentId = STATE.pendingPaymentId;
                    if (!paymentId) return;
                    return fetch(`/api/payment/${paymentId}/confirm`, { method: 'POST' })
                        .then(() => {
                            showToast(t('payment_success'), 'success');
                            closeModal();
                            setTimeout(() => showSection('orders'), 800);
                        });
                },
                onError: function(err) {
                    showToast(t('payment_failed'), 'error');
                }
            }).render("#paypal-btn-container");
        }
    }, 600);
}

function selectPaymentMethod(btn, method) {
    document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    STATE.paymentMethod = method;
    const cardForm = document.getElementById('card-form');
    if (cardForm) cardForm.style.display = 'block';
}

function formatCardNumber(input) {
    input.value = input.value.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
}

function formatExpiry(input) {
    input.value = input.value.replace(/\D/g, '').replace(/^(\d{2})(\d)/, '$1/$2');
}

async function processPayment(orderId, currency, amount) {
    const btn = document.getElementById('pay-btn');
    btn.disabled = true;
    btn.textContent = t('payment_processing');

    try {
        const createResp = await fetch('/api/payment/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId, method: STATE.paymentMethod })
        });
        const payment = await createResp.json();
        if (!createResp.ok) { showToast(payment.error, 'error'); btn.disabled = false; btn.textContent = `${getCurrencySymbol(currency)}${amount.toLocaleString()} — ${t('payment_confirm')}`; return; }

        // Simulate payment processing delay
        await new Promise(r => setTimeout(r, 1500));

        const confirmResp = await fetch(`/api/payment/${payment.id}/confirm`, { method: 'POST' });
        const result = await confirmResp.json();
        if (!confirmResp.ok) { showToast(t('payment_failed'), 'error'); btn.disabled = false; btn.textContent = `${getCurrencySymbol(currency)}${amount.toLocaleString()} — ${t('payment_confirm')}`; return; }

        showToast(t('payment_success'), 'success');
        closeModal();
        showSection('orders');
    } catch (e) {
        showToast(t('payment_failed'), 'error');
        btn.disabled = false;
        btn.textContent = `${getCurrencySymbol(currency)}${amount.toLocaleString()} — ${t('payment_confirm')}`;
    }
}

// ── Orders ──
async function loadOrders() {
    if (!STATE.user || !STATE.user.logged_in) {
        document.getElementById('orders-list').innerHTML =
            `<p style="text-align:center;padding:40px;color:var(--text-secondary);">${t('order_please_login')}</p>`;
        return;
    }
    try {
        const resp = await fetch('/api/orders');
        const orders = await resp.json();
        renderOrders(orders);
    } catch (e) { console.error('Load orders failed:', e); }
}

function renderOrders(orders) {
    const container = document.getElementById('orders-list');
    if (!orders.length) {
        container.innerHTML = `<p style="text-align:center;padding:40px;color:var(--text-secondary);">${t('order_empty')}</p>`;
        return;
    }

    container.innerHTML = orders.map(o => {
        const statusKey = `order_status_${o.order_status}`;
        const statusLabel = t(statusKey) || o.order_status;
        const currencySymbol = getCurrencySymbol(o.currency);
        const dateStr = new Date(o.created_at).toLocaleDateString();

        return `
        <div class="order-card" onclick="openOrderDetail('${o.id}')">
            <div class="order-card-left">
                <div class="order-card-title">${escapeHtml(o.product_title)}</div>
                <div class="order-card-meta">
                    ${t('order_id')}: ${o.id} · ${t('order_date')}: ${dateStr} · ${escapeHtml(o.buyer_name || '')}
                </div>
            </div>
            <div class="order-card-right">
                <div class="order-card-amount">${currencySymbol}${o.snapshot_price.toLocaleString()}</div>
                <span class="order-status-badge status-${o.order_status}">${statusLabel}</span>
            </div>
        </div>`;
    }).join('');
}

async function openOrderDetail(oid) {
    try {
        const resp = await fetch('/api/orders');
        const orders = await resp.json();
        const order = orders.find(o => o.id === oid);
        if (!order) return;
        STATE.currentOrder = order;
        showOrderDetail(order);
    } catch (e) { console.error(e); }
}

function showOrderDetail(order) {
    const statusFlow = ['payment_pending', 'paid', 'shipped', 'delivered', 'completed'];
    const currentIdx = statusFlow.indexOf(order.order_status);
    const statusLabel = t(`order_status_${order.order_status}`) || order.order_status;
    const currencySymbol = getCurrencySymbol(order.currency);
    const dateStr = new Date(order.created_at).toLocaleDateString();

    const timeline = statusFlow.map((s, i) => {
        let cls = '';
        if (order.order_status === 'disputed') {
            cls = i <= 2 ? 'done' : '';
        } else if (i < currentIdx) {
            cls = 'done';
        } else if (i === currentIdx && order.order_status !== 'disputed') {
            cls = 'current';
        }
        return `<span class="step ${cls}">${t(`order_status_${s}`)}</span>`;
    }).join(' → ');

    let actionBtn = '';
    if (order.order_status === 'paid' && order.buyer_id === STATE.user?.user_id) {
        // Seller ships — but for simplicity, we let buyer simulate steps
    }
    if (order.order_status === 'payment_pending' && order.buyer_id === STATE.user?.user_id) {
        actionBtn = `<button class="btn btn-success" onclick="document.getElementById('order-modal').classList.remove('active'); showPaymentModal({id:'${order.id}', product_title:'${esc(order.product_title)}', snapshot_price:${order.snapshot_price}, currency:'${order.currency}'})">${t('btn_pay')}</button>`;
    }
    if (order.order_status === 'paid' && order.seller_id === STATE.user?.user_id) {
        actionBtn = `<button class="btn btn-primary" onclick="promptTracking('${order.id}')">${t('btn_mark_shipped')}</button>`;
    }
    if (order.order_status === 'shipped' && order.buyer_id === STATE.user?.user_id) {
        actionBtn = `<button class="btn btn-primary" onclick="updateOrderStatus('${order.id}', 'delivered')">${t('btn_mark_delivered')}</button>`;
    }
    if (order.order_status === 'delivered' && order.buyer_id === STATE.user?.user_id) {
        actionBtn = `<button class="btn btn-success" onclick="updateOrderStatus('${order.id}', 'completed')">${t('btn_confirm_receipt')}</button>`;
    }
    if (order.order_status === 'completed') {
        actionBtn = `<button class="btn btn-outline" onclick="showReviewForm('${order.id}')">${t('btn_submit_review')}</button>`;
    }

    document.getElementById('order-modal-body').innerHTML = `
        <h2 style="margin-bottom:8px;">${escapeHtml(order.product_title)}</h2>
        <div class="order-detail-meta" style="color:var(--text-secondary);margin-bottom:16px;">
            ${t('order_id')}: ${order.id} · ${t('order_date')}: ${dateStr}
        </div>
        <div style="font-size:1.4rem;font-weight:700;color:var(--primary);margin-bottom:16px;">
            ${currencySymbol}${order.snapshot_price.toLocaleString()} ${order.currency}
        </div>
        <div class="order-detail-section">
            <h3>${t('order_status_label')}</h3>
            <div class="order-detail-timeline">${timeline}</div>
            <span class="order-status-badge status-${order.order_status}">${statusLabel}</span>
        </div>
        <div class="order-detail-section">
            <h3>${t('shipping_address')}</h3>
            <p>${escapeHtml(order.shipping_address?.street || '')}, ${escapeHtml(order.shipping_address?.city || '')}, ${escapeHtml(order.shipping_address?.country || '')}</p>
        </div>
        ${order.tracking_number ? `<div class="order-detail-section"><h3>${t('tracking_label')}</h3><p>${escapeHtml(order.carrier)}: ${escapeHtml(order.tracking_number)}</p></div>` : ''}
        <div style="margin-top:16px;">${actionBtn}</div>
    `;

    document.getElementById('order-modal').classList.add('active');
}

function closeOrderModal() {
    document.getElementById('order-modal').classList.remove('active');
    STATE.currentOrder = null;
}

async function updateOrderStatus(oid, newStatus) {
    try {
        const resp = await fetch(`/api/orders/${oid}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        if (!resp.ok) { showToast(t('toast_failed_update'), 'error'); return; }
        showToast(t('toast_status_updated'), 'success');
        closeOrderModal();
        loadOrders();
    } catch (e) { showToast(t('toast_network_error'), 'error'); }
}

function promptTracking(oid) {
    const tracking = prompt(t('prompt_tracking_number'));
    const carrier = prompt(t('prompt_carrier'));
    if (!tracking) return;
    fetch(`/api/orders/${oid}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'shipped', tracking_number: tracking, carrier: carrier || 'Standard' })
    }).then(r => r.json()).then(() => {
        showToast(t('toast_marked_shipped'), 'success');
        closeOrderModal();
        loadOrders();
    });
}

// ── Review ──
function showReviewForm(orderId) {
    const order = STATE.currentOrder;
    document.getElementById('order-modal-body').innerHTML = `
        <h2>${t('review_title')}</h2>
        <p style="margin-bottom:16px;color:var(--text-secondary);">${escapeHtml(order.product_title)}</p>
        <form onsubmit="submitReview(event, '${orderId}', '${order.seller_id}')">
            <div class="form-group">
                <label>${t('review_rating')} (1-5)</label>
                <select name="rating" required>
                    <option value="5">${t('review_star_5')}</option>
                    <option value="4">${t('review_star_4')}</option>
                    <option value="3">${t('review_star_3')}</option>
                    <option value="2">${t('review_star_2')}</option>
                    <option value="1">${t('review_star_1')}</option>
                </select>
            </div>
            <div class="form-group">
                <label>${t('review_tags')}</label>
                <input type="text" name="tags" placeholder="${t('review_tags_placeholder')}">
            </div>
            <div class="form-group">
                <label>${t('review_comment')}</label>
                <textarea name="comment" rows="3"></textarea>
            </div>
            <button type="submit" class="btn btn-primary">${t('btn_submit_review')}</button>
        </form>
    `;
}

async function submitReview(e, orderId, targetUserId) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const data = {
        order_id: orderId,
        target_user_id: targetUserId,
        rating: parseInt(formData.get('rating')),
        tags: formData.get('tags') ? formData.get('tags').split(',').map(s => s.trim()) : [],
        comment: formData.get('comment')
    };

    try {
        const resp = await fetch('/api/reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!resp.ok) { showToast(t('toast_review_failed'), 'error'); return; }
        showToast(t('toast_review_submitted'), 'success');
        closeOrderModal();
        loadOrders();
    } catch (e) { showToast(t('toast_network_error'), 'error'); }
}

// ── Media Upload ──
let pendingUploads = []; // { file, url, is_video, uploading }

function initUploadZone() {
    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('media-input');
    if (!zone || !input) return;

    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
        if (input.files.length) addFiles(input.files);
        input.value = '';
    });

    // Drag & drop
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });
}

function addFiles(fileList) {
    const allowed = ['image/jpeg','image/png','image/gif','image/webp','image/bmp',
                     'video/mp4','video/webm','video/quicktime','video/x-msvideo','video/x-matroska'];
    const maxSize = 50 * 1024 * 1024;

    for (const f of fileList) {
        if (!allowed.includes(f.type) && !f.type.startsWith('image/') && !f.type.startsWith('video/')) {
            showToast(t('toast_unsupported_format'), 'error');
            continue;
        }
        if (f.size > maxSize) {
            showToast(t('toast_file_too_large'), 'error');
            continue;
        }
        pendingUploads.push({ file: f, url: null, is_video: f.type.startsWith('video/'), uploading: true });
        uploadFile(pendingUploads[pendingUploads.length - 1]);
    }
    renderMediaPreview();
}

async function uploadFile(item) {
    const fd = new FormData();
    fd.append('files', item.file);
    try {
        const resp = await fetch('/api/upload', { method: 'POST', body: fd });
        const result = await resp.json();
        if (result.files && result.files.length) {
            item.url = result.files[0].url;
            item.is_video = result.files[0].is_video;
        } else if (result.errors && result.errors.length) {
            showToast(result.errors[0].error, 'error');
        }
    } catch (e) {
        showToast(t('toast_network_error'), 'error');
    }
    item.uploading = false;
    renderMediaPreview();
}

function renderMediaPreview() {
    const grid = document.getElementById('media-preview');
    if (!grid) return;
    grid.innerHTML = pendingUploads.map((item, i) => {
        if (item.uploading) {
            return `<div class="media-preview-item"><div class="preview-loading" data-i18n="uploading">Uploading...</div></div>`;
        }
        if (item.url) {
            const mediaTag = item.is_video
                ? `<video src="${item.url}" muted playsinline></video><span class="preview-video-badge">VIDEO</span>`
                : `<img src="${item.url}" alt="preview">`;
            return `<div class="media-preview-item">
                ${mediaTag}
                <button class="preview-remove" onclick="removeUpload(${i})" title="Remove">&times;</button>
            </div>`;
        }
        return '';
    }).join('');
}

function removeUpload(index) {
    pendingUploads.splice(index, 1);
    renderMediaPreview();
}

// ── Publish Product ──
async function publishProduct(e) {
    e.preventDefault();
    if (!STATE.user || !STATE.user.logged_in) {
        showToast(t('toast_login_required'), 'error');
        showSection('login');
        return;
    }

    const form = document.getElementById('sell-form');
    const formData = new FormData(form);
    const data = {};
    for (const [k, v] of formData) data[k] = v;

    // Collect uploaded media
    const uploadedUrls = pendingUploads.filter(p => p.url && !p.uploading);
    if (!uploadedUrls.length && !data.image_url) {
        showToast(t('toast_media_required'), 'error');
        return;
    }
    data.images = uploadedUrls.filter(p => !p.is_video).map(p => p.url);
    data.videos = uploadedUrls.filter(p => p.is_video).map(p => p.url);
    // If there's also an image_url from OCR group, push it too
    if (data.image_url && data.image_url.trim()) {
        data.images.push(data.image_url.trim());
    }
    delete data.image_url;

    try {
        const resp = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await resp.json();
        if (!resp.ok) { showToast(result.error || t('toast_failed'), 'error'); return; }
        showToast(t('toast_item_published'), 'success');
        form.reset();
        pendingUploads = [];
        renderMediaPreview();
        loadProducts();
        showSection('browse');
    } catch (e) { showToast(t('toast_network_error'), 'error'); }
}

// ── Utilities ──
function getCurrencySymbol(currency) {
    const symbols = { USD: '$', CNY: '¥', EUR: '€', GBP: '£', JPY: '¥', AED: 'د.إ', KRW: '₩', BRL: 'R$' };
    return symbols[currency] || currency + ' ';
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
const esc = escapeHtml;

function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ══════════════════════════════════════════════════════════════
// ── Module: 即时通讯 (IM Chat) ──
// ══════════════════════════════════════════════════════════════

let chatPanelOpen = false;
let chatPartner = null;          // {user_id, name}
let chatPartnerName = '';
let chatEventSource = null;
let chatUnread = 0;

function toggleChat() {
    if (!STATE.user || !STATE.user.logged_in) {
        showToast(t('toast_login_required'), 'error');
        return;
    }
    chatPanelOpen = !chatPanelOpen;
    document.getElementById('chat-panel').classList.toggle('open', chatPanelOpen);
    if (chatPanelOpen) {
        showConversations();
        connectSSE();
    } else {
        disconnectSSE();
    }
}

function connectSSE() {
    if (chatEventSource) return;
    chatEventSource = new EventSource('/api/chat/stream');
    chatEventSource.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'ping') return;
        // New message received
        if (chatPartner && (data.sender_id === chatPartner.user_id || data.receiver_id === chatPartner.user_id)) {
            appendChatMessage(data);
        } else {
            chatUnread++;
            updateUnreadBadge();
            if (!chatPanelOpen) playNotificationSound();
        }
    };
    chatEventSource.onerror = () => {
        disconnectSSE();
        setTimeout(() => { if (chatPanelOpen) connectSSE(); }, 3000);
    };
}

function disconnectSSE() {
    if (chatEventSource) { chatEventSource.close(); chatEventSource = null; }
}

function updateUnreadBadge() {
    const badge = document.getElementById('chat-unread-badge');
    if (chatUnread > 0) {
        badge.style.display = 'flex';
        badge.textContent = chatUnread > 99 ? '99+' : chatUnread;
    } else {
        badge.style.display = 'none';
    }
}

function playNotificationSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 800; gain.gain.value = 0.1;
        osc.start(); osc.stop(ctx.currentTime + 0.15);
    } catch (e) { /* ignore */ }
}

async function showConversations() {
    chatPartner = null;
    document.getElementById('chat-conversations').style.display = 'flex';
    document.getElementById('chat-messages').style.display = 'none';
    document.getElementById('chat-input-area').style.display = 'none';
    document.getElementById('chat-back-btn').style.display = 'none';
    document.querySelector('.chat-translate-all-btn').style.display = 'none';

    try {
        const resp = await fetch('/api/chat/conversations');
        const convs = await resp.json();
        const container = document.getElementById('chat-conversations');
        if (!convs.length) {
            container.innerHTML = `<div class="chat-no-conv">${t('chat_empty')}<br>${t('chat_empty_tip')}</div>`;
            return;
        }
        container.innerHTML = convs.map(c => `
            <div class="chat-conv-item" onclick="openConversation('${c.user_id}', '${esc(c.name)}')">
                <div class="conv-name">${esc(c.name)}</div>
                <div class="conv-preview">${esc(c.last_msg)}</div>
            </div>`).join('');
    } catch (e) { console.error(e); }
}

async function openConversation(userId, name) {
    chatPartner = { user_id: userId, name: name };
    chatPartnerName = name;
    chatUnread = Math.max(0, chatUnread - 1);
    updateUnreadBadge();

    document.getElementById('chat-conversations').style.display = 'none';
    document.getElementById('chat-messages').style.display = 'flex';
    document.getElementById('chat-input-area').style.display = 'flex';
    document.getElementById('chat-back-btn').style.display = 'block';
    document.querySelector('.chat-translate-all-btn').style.display = 'inline-block';

    // Load history
    try {
        const resp = await fetch(`/api/chat/history?with=${userId}`);
        const msgs = await resp.json();
        const container = document.getElementById('chat-messages');
        container.innerHTML = msgs.map(m => renderChatBubble(m)).join('');
        container.scrollTop = container.scrollHeight;
    } catch (e) { console.error(e); }
}

function appendChatMessage(msg) {
    const container = document.getElementById('chat-messages');
    container.insertAdjacentHTML('beforeend', renderChatBubble(msg));
    container.scrollTop = container.scrollHeight;
}

function renderChatBubble(msg) {
    const isMine = msg.sender_id === (STATE.user?.user_id || '');
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgId = msg.id || ('msg-' + Math.random().toString(36).slice(2, 8));
    return `<div class="chat-msg ${isMine ? 'mine' : 'theirs'}" data-msg-id="${msgId}" data-msg-text="${esc(msg.content).replace(/"/g, '&quot;')}">
        <div class="msg-original">${esc(msg.content)}</div>
        <div class="msg-translated" style="display:none"></div>
        <div class="msg-actions">
            <button class="msg-translate-btn" onclick="translateMsg(this)" data-i18n="chat_translate">Translate</button>
        </div>
        <div class="msg-time">${time}</div>
    </div>`;
}

async function translateMsg(btn) {
    const msgDiv = btn.closest('.chat-msg');
    // 从 data 属性取值，需解码 HTML 实体
    const htmlText = msgDiv.getAttribute('data-msg-text');
    const text = new DOMParser().parseFromString(htmlText, 'text/html').documentElement.textContent;
    const translatedDiv = msgDiv.querySelector('.msg-translated');
    
    if (translatedDiv.style.display === 'block') {
        translatedDiv.style.display = 'none';
        btn.textContent = t('chat_translate') || 'Translate';
        return;
    }

    const cacheKey = `tr_${text}_${STATE.lang}`;
    let translated = sessionStorage.getItem(cacheKey);

    if (!translated) {
        btn.textContent = '...';
        btn.disabled = true;
        try {
            const resp = await fetch('/api/chat/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text, target: STATE.lang })
            });
            const data = await resp.json();
            if (resp.ok && data.translated) {
                translated = data.translated;
                sessionStorage.setItem(cacheKey, translated);
            } else {
                btn.textContent = t('chat_translate_fail') || 'Failed';
                btn.disabled = false;
                return;
            }
        } catch (e) {
            btn.textContent = t('chat_translate_fail') || 'Failed';
            btn.disabled = false;
            return;
        }
    }

    translatedDiv.textContent = translated;
    translatedDiv.style.display = 'block';
    btn.textContent = t('chat_show_original') || 'Original';
    btn.disabled = false;
}

async function translateAllMessages() {
    const allBtns = document.querySelectorAll('#chat-messages .msg-translate-btn');
    for (const btn of allBtns) {
        const translatedDiv = btn.closest('.chat-msg').querySelector('.msg-translated');
        if (translatedDiv.style.display !== 'block') {
            await translateMsg(btn);
        }
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const content = input.value.trim();
    if (!content || !chatPartner) return;

    try {
        const resp = await fetch('/api/chat/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ receiver_id: chatPartner.user_id, content: content, receiver_name: chatPartnerName })
        });
        const msg = await resp.json();
        if (resp.ok) {
            appendChatMessage(msg);
            input.value = '';
        }
    } catch (e) { console.error(e); }
}

// Message seller from product detail
function messageSeller(sellerId, sellerName) {
    closeModal(); // close product modal
    if (!STATE.user || !STATE.user.logged_in) {
        showToast(t('toast_login_required'), 'error');
        return;
    }
    chatPanelOpen = true;
    document.getElementById('chat-panel').classList.add('open');
    connectSSE();
    openConversation(sellerId, sellerName);
}

// ══════════════════════════════════════════════════════════════
// ── Module: 物流追踪 (Logistics) ──
// ══════════════════════════════════════════════════════════════

async function showTracking(orderId) {
    try {
        const resp = await fetch(`/api/logistics/${orderId}`);
        if (!resp.ok) {
            showToast('No tracking available for this order', 'info');
            return;
        }
        const tracking = await resp.json();

        document.getElementById('order-modal-body').innerHTML += `
            <div class="order-detail-section" style="margin-top:24px;border-top:1px solid var(--border);padding-top:20px;">
                <div class="tracking-detail-header">
                    <h3>Package Tracking</h3>
                    <span style="font-size:0.85rem;color:var(--text-secondary);">${esc(tracking.carrier)}: ${esc(tracking.tracking_number)}</span>
                </div>
                <div class="tracking-timeline">
                    ${tracking.events.map((ev, i) => {
                        const isLast = i === tracking.events.length - 1;
                        const isPast = new Date(ev.timestamp) <= new Date();
                        let cls = '';
                        if (isPast && !isLast) cls = 'done';
                        else if (isPast && isLast) cls = 'current';
                        return `
                        <div class="tracking-node ${cls}">
                            <div class="track-status">${ev.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>
                            <div class="track-location">${esc(ev.location)}</div>
                            <div class="track-message" style="font-size:0.8rem;color:var(--text-secondary);">${esc(ev.message)}</div>
                            <div class="track-time">${new Date(ev.timestamp).toLocaleString()}</div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
    } catch (e) { console.error(e); }
}

// Patch order detail to include tracking button
const origShowOrderDetail = showOrderDetail;
showOrderDetail = function(order) {
    origShowOrderDetail(order);

    // Add tracking button if tracking exists
    if (order.tracking_number) {
        const btnContainer = document.getElementById('order-modal-body');
        const trackingBtn = document.createElement('button');
        trackingBtn.className = 'btn btn-outline btn-sm';
        trackingBtn.textContent = t('btn_track_package');
        trackingBtn.style.marginTop = '12px';
        trackingBtn.onclick = () => showTracking(order.id);
        btnContainer.appendChild(trackingBtn);
    }

    // Add "Message Seller" button in order detail
    if (STATE.user && order.seller_id !== STATE.user.user_id) {
        const btnContainer = document.getElementById('order-modal-body');
        const msgBtn = document.createElement('button');
        msgBtn.className = 'btn btn-outline btn-sm';
        msgBtn.textContent = t('btn_message_seller');
        msgBtn.style.marginTop = '8px';
        msgBtn.style.marginLeft = '8px';
        msgBtn.onclick = () => { closeOrderModal(); messageSeller(order.seller_id, order.seller_name); };
        btnContainer.appendChild(msgBtn);
    }
};

// ══════════════════════════════════════════════════════════════
// ── Module: OCR 图片识别分类 ──
// ══════════════════════════════════════════════════════════════

async function ocrAnalyze() {
    const urlInput = document.getElementById('sell-image-url');
    const imageUrl = urlInput.value.trim();
    if (!imageUrl) {
        showToast(t('ocr_no_url'), 'error');
        return;
    }

    const btn = document.getElementById('btn-ocr');
    btn.textContent = t('ocr_analyzing');
    btn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('image_url', imageUrl);
        const resp = await fetch('/api/ocr/analyze', { method: 'POST', body: formData });
        const result = await resp.json();

        const resultDiv = document.getElementById('ocr-result');
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `
            <strong>${t('ocr_detected')}</strong> ${t('cat_' + result.category) || result.category.replace(/_/g, ' ')} 
            (${t('ocr_confidence')}: ${(result.confidence * 100).toFixed(0)}%)<br>
            <span style="font-size:0.8rem;color:var(--text-secondary);">${result._note || ''}</span>`;

        // Auto-fill category if confidence is high
        if (result.confidence >= 0.8 && result.category !== 'other') {
            const catSelect = document.querySelector('select[name="category"]');
            if (catSelect) {
                catSelect.value = result.category;
                showToast(t('ocr_category_set') + ': ' + (t('cat_' + result.category) || result.category), 'success');
            }
        }
    } catch (e) {
        showToast(t('ocr_failed'), 'error');
    } finally {
        btn.textContent = t('btn_ocr');
        btn.disabled = false;
    }
}

// Add "Message Seller" to product detail modal
const origShowProductDetail = showProductDetail;
showProductDetail = function(p) {
    origShowProductDetail(p);

    if (STATE.user && STATE.user.logged_in && p.seller_id !== STATE.user.user_id) {
        const actionsDiv = document.querySelector('.product-detail-actions');
        if (actionsDiv) {
            const msgBtn = document.createElement('button');
            msgBtn.className = 'btn btn-outline';
            msgBtn.textContent = t('btn_message_seller');
            msgBtn.onclick = () => messageSeller(p.seller_id, p.seller_name);
            actionsDiv.insertBefore(msgBtn, actionsDiv.lastChild);
        }
    }
};

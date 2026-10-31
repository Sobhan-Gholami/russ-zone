/* ===================== RUSS ZONE — Frontend SPA ===================== */
const state = { user: null, categories: [], cart: [], products: [] };

/* ---------- API helper ---------- */
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    body: opts.body instanceof FormData ? opts.body : (opts.body ? JSON.stringify(opts.body) : undefined),
    credentials: 'include'
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(data.error || 'خطایی رخ داد');
  return data;
}

function money(n) { return Number(n || 0).toLocaleString('fa-IR') + ' تومان'; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function toast(msg, ok = false) {
  const host = document.getElementById('toastHost');
  const el = document.createElement('div');
  el.className = 'toast' + (ok ? ' ok' : '');
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ---------- Router ---------- */
const routes = {};
function route(path, handler) { routes[path] = handler; }
function navigate(hash) { window.location.hash = hash; }

async function router() {
  const hash = window.location.hash.replace('#', '') || '/';
  const [pathPart, query] = hash.split('?');
  const params = new URLSearchParams(query || '');
  const isAdmin = pathPart.startsWith('/admin');
  document.body.classList.toggle('admin-mode', isAdmin);
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading-spin"></div>';

  const matched = Object.keys(routes).find(r => matchRoute(r, pathPart));
  if (!matched) { app.innerHTML = notFoundView(); if (!isAdmin) renderChrome(); return; }
  try {
    const paramNames = matched.split('/').filter(p => p.startsWith(':')).map(p => p.slice(1));
    const paramValues = extractParams(matched, pathPart);
    const routeParams = {}; paramNames.forEach((n, i) => routeParams[n] = paramValues[i]);
    await routes[matched]({ params: routeParams, query: params, app });
  } catch (e) {
    app.innerHTML = `<div class="empty-state"><span class="bolt">✕</span>${esc(e.message)}</div>`;
  }
  if (!isAdmin) renderChrome();
  window.scrollTo(0, 0);
}
function matchRoute(pattern, path) {
  const pParts = pattern.split('/').filter(Boolean);
  const uParts = path.split('/').filter(Boolean);
  if (pParts.length !== uParts.length) return false;
  return pParts.every((p, i) => p.startsWith(':') || p === uParts[i]);
}
function extractParams(pattern, path) {
  const pParts = pattern.split('/').filter(Boolean);
  const uParts = path.split('/').filter(Boolean);
  return pParts.map((p, i) => p.startsWith(':') ? uParts[i] : null).filter(x => x !== null);
}
window.addEventListener('hashchange', router);

/* ---------- Chrome (nav/header) ---------- */
function renderChrome() {
  const hash = window.location.hash.replace('#', '') || '/';
  const navItems = [
    { href: '#/', label: 'فروشگاه' },
  ];
  if (state.user?.role === 'admin') navItems.push({ href: '#/admin', label: 'پنل مدیریت' });

  const nav = document.getElementById('mainNav');
  nav.innerHTML = navItems.map(i => `<a href="${i.href}" class="${hash === i.href.slice(1) ? 'active' : ''}">${i.label}</a>`).join('');

  const actions = document.getElementById('topbarActions');
  const cartCount = state.cart.reduce((s, i) => s + i.quantity, 0);
  if (state.user) {
    actions.innerHTML = `
      <a href="#/cart" class="icon-btn" title="سبد خرید">🛒${cartCount ? `<span class="badge">${cartCount}</span>` : ''}</a>
      <a href="#/profile" class="icon-btn" title="پروفایل">👤</a>
      <button class="btn btn-ghost btn-sm" id="logoutBtn">خروج</button>
    `;
    document.getElementById('logoutBtn').onclick = async () => {
      await api('/auth/logout', { method: 'POST' });
      state.user = null; state.cart = [];
      navigate('/'); router();
      toast('با موفقیت خارج شدید', true);
    };
  } else {
    actions.innerHTML = `
      <a href="#/login" class="btn btn-ghost btn-sm">ورود</a>
      <a href="#/register" class="btn btn-primary btn-sm">ثبت‌نام</a>
    `;
  }

  const mobileNav = document.getElementById('mobileNav');
  mobileNav.innerHTML = navItems.map(i => `<a href="${i.href}">${i.label}</a>`).join('') +
    (state.user
      ? `<a href="#/cart">سبد خرید${cartCount ? ` (${cartCount})` : ''}</a><a href="#/profile">پروفایل</a><button id="mLogout">خروج</button>`
      : `<a href="#/login">ورود</a><a href="#/register">ثبت‌نام</a>`);
  document.getElementById('burgerBtn').onclick = () => mobileNav.classList.toggle('open');
  mobileNav.querySelectorAll('a').forEach(a => a.onclick = () => mobileNav.classList.remove('open'));
  const mLogout = document.getElementById('mLogout');
  if (mLogout) mLogout.onclick = () => document.getElementById('logoutBtn').click();

  renderCatTicker();
  bindSearch();
}

function renderCatTicker() {
  const wrap = document.getElementById('catTickerWrap');
  if (!wrap) return;
  if (!state.categories.length) { wrap.innerHTML = ''; return; }
  const items = state.categories.map(c => `<a href="#/products?category=${c.slug}" class="cat-ticker-item"><span class="dot"></span>${esc(c.name)}</a>`).join('');
  // duplicate the list so the CSS animation (-50%) loops seamlessly
  wrap.innerHTML = `<div class="cat-ticker-track">${items}${items}</div>`;
}

function bindSearch() {
  const form = document.getElementById('searchForm');
  if (!form) return;
  form.onsubmit = (e) => {
    e.preventDefault();
    const q = document.getElementById('searchInput').value.trim();
    if (q) navigate('/search?q=' + encodeURIComponent(q));
  };
}

function notFoundView() {
  return `<div class="empty-state"><span class="bolt">✕</span>صفحه مورد نظر یافت نشد<br><a href="#/" class="btn btn-primary" style="margin-top:16px;display:inline-block;">بازگشت به فروشگاه</a></div>`;
}

/* ---------- Data bootstrapping ---------- */
async function loadCategories() {
  const { categories } = await api('/products/categories');
  state.categories = categories;
}
async function loadCart() {
  if (!state.user) { state.cart = []; return; }
  const { items } = await api('/cart');
  state.cart = items;
}
async function tryRestoreSession() {
  try {
    const { user } = await api('/auth/me');
    state.user = user;
    await loadCart();
  } catch (e) { state.user = null; }
}

/* ===================== VIEWS ===================== */

route('/', async ({ app }) => {
  const { products } = await api('/products');
  const featured = products.slice(0, 8);
  app.innerHTML = `
    <section class="hero">
      <div class="hero-inner">
        <span class="hero-eyebrow">روس زون · استایل روسی</span>
        <h1><em>کالای اصل، از روسیه</em><br>مستقیم به دستت می‌رسه</h1>
        <p>مجموعه‌ای منتخب از کالای مردانه، زنانه و اکسسوری با کیفیت تضمینی. سفارش بده، از طریق تلگرام هماهنگ می‌کنیم.</p>
        <div class="hero-actions">
          <a href="#/products" class="btn btn-primary">مشاهده محصولات</a>
          <a href="#/register" class="btn btn-ghost">${state.user ? '' : 'ساخت حساب کاربری'}</a>
        </div>
      </div>
    </section>

    <div class="section-head">
      <div class="section-title"><span class="bolt">✦</span>دسته‌بندی‌ها</div>
    </div>
    <div class="cat-scroll">
      ${state.categories.map(c => `<a href="#/products?category=${c.slug}" class="cat-chip">${esc(c.name)}</a>`).join('')}
    </div>

    <div class="section-head">
      <div class="section-title"><span class="bolt">✦</span>کالاهای جدید</div>
      <a href="#/products" class="nav-link">مشاهده همه ←</a>
    </div>
    <div class="grid">${featured.map(productCard).join('') || emptyProducts()}</div>
  `;
  bindProductCards(app);
});

route('/products', async ({ app, query }) => {
  const activeCat = query.get('category') || '';
  const { products } = await api('/products' + (activeCat ? `?category=${activeCat}` : ''));
  app.innerHTML = `
    <div class="section-head"><div class="section-title"><span class="bolt">✦</span>همه کالاها</div></div>
    <div class="cat-scroll">
      <a href="#/products" class="cat-chip ${!activeCat ? 'active' : ''}">همه</a>
      ${state.categories.map(c => `<a href="#/products?category=${c.slug}" class="cat-chip ${activeCat === c.slug ? 'active' : ''}">${esc(c.name)}</a>`).join('')}
    </div>
    <div class="grid" style="margin-top:22px;">${products.map(productCard).join('') || emptyProducts()}</div>
  `;
  bindProductCards(app);
});

route('/search', async ({ app, query }) => {
  const q = (query.get('q') || '').trim();
  const { products } = await api('/products');
  const filtered = q
    ? products.filter(p =>
        p.name.toLowerCase().includes(q.toLowerCase()) ||
        (p.description || '').toLowerCase().includes(q.toLowerCase()) ||
        (p.categories || []).some(c => c.name.toLowerCase().includes(q.toLowerCase())))
    : products;
  app.innerHTML = `
    <div class="section-head"><div class="section-title"><span class="bolt">✦</span>نتایج جستجو برای «${esc(q)}»</div></div>
    <div class="grid">${filtered.map(productCard).join('') || emptyProducts()}</div>
  `;
  bindProductCards(app);
  const input = document.getElementById('searchInput');
  if (input) input.value = q;
});

function emptyProducts() {
  return `<div class="empty-state" style="grid-column:1/-1;"><span class="bolt">✦</span>در حال حاضر کالایی در این دسته موجود نیست</div>`;
}

function productCard(p) {
  return `
    <div class="card" data-id="${p.id}">
      <a href="#/product/${p.id}" class="card-media">
        ${p.categories && p.categories.length ? `<span class="card-cat-tag">${esc(p.categories.map(c => c.name).join('، '))}</span>` : ''}
        ${p.image ? `<img src="${p.image}" alt="${esc(p.name)}">` : `<span class="ph">RZ</span>`}
      </a>
      <div class="card-body">
        <a href="#/product/${p.id}" class="card-name">${esc(p.name)}</a>
        <div class="card-desc">${esc(p.description || '')}</div>
        <div class="card-footer">
          <span class="price">${money(p.price)}</span>
          <button class="btn btn-primary btn-sm add-cart-btn" data-id="${p.id}">افزودن</button>
        </div>
      </div>
    </div>
  `;
}
function bindProductCards(app) {
  app.querySelectorAll('.add-cart-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.preventDefault();
      if (!state.user) { toast('برای افزودن به سبد ابتدا وارد شوید'); navigate('/login'); return; }
      try {
        const { items } = await api('/cart', { method: 'POST', body: { product_id: Number(btn.dataset.id), quantity: 1 } });
        state.cart = items;
        renderChrome();
        toast('به سبد خرید اضافه شد', true);
      } catch (e) { toast(e.message); }
    };
  });
}

route('/product/:id', async ({ app, params }) => {
  const { product } = await api('/products/' + params.id);
  const images = (product.images && product.images.length) ? product.images : (product.image ? [{ url: product.image }] : []);
  app.innerHTML = `
    <div class="product-detail">
      <div class="product-gallery">
        <div class="card-media product-gallery-main" style="border:1px solid var(--line);">
          ${images.length ? `<img src="${images[0].url}" alt="${esc(product.name)}" id="mainProductImg">` : `<span class="ph">RZ</span>`}
        </div>
        ${images.length > 1 ? `
          <div class="product-thumbs">
            ${images.map((im, idx) => `<button class="product-thumb ${idx === 0 ? 'active' : ''}" data-url="${im.url}"><img src="${im.url}" alt=""></button>`).join('')}
          </div>
        ` : ''}
      </div>
      <div>
        ${product.categories && product.categories.length ? product.categories.map(c => `<span class="hero-eyebrow" style="margin-left:6px;">${esc(c.name)}</span>`).join('') : ''}
        <h1 style="font-size:28px;font-weight:900;margin:14px 0;">${esc(product.name)}</h1>
        <p style="color:var(--ink-dim);line-height:1.9;">${esc(product.description || 'بدون توضیحات')}</p>
        <div class="price" style="font-size:26px;margin:20px 0;">${money(product.price)}</div>
        <button class="btn btn-primary btn-block" id="addToCartBtn">افزودن به سبد خرید</button>
      </div>
    </div>
  `;
  app.querySelectorAll('.product-thumb').forEach(btn => btn.onclick = () => {
    document.getElementById('mainProductImg').src = btn.dataset.url;
    app.querySelectorAll('.product-thumb').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
  document.getElementById('addToCartBtn').onclick = async () => {
    if (!state.user) { toast('برای افزودن به سبد ابتدا وارد شوید'); navigate('/login'); return; }
    try {
      const { items } = await api('/cart', { method: 'POST', body: { product_id: product.id, quantity: 1 } });
      state.cart = items; renderChrome();
      toast('به سبد خرید اضافه شد', true);
    } catch (e) { toast(e.message); }
  };
});

/* ---------- Auth views ---------- */
route('/login', async ({ app }) => {
  if (state.user) return navigate('/');
  app.innerHTML = `
    <div class="auth-scene">
      <div class="auth-blob b1"></div>
      <div class="auth-blob b2"></div>
      <div class="auth-blob b3"></div>
      <div class="auth-wrap">
        <div class="auth-card glass">
          <h2 class="auth-title">ورود به حساب کاربری</h2>
          <p class="auth-sub">با شماره تماس و رمز عبور خود وارد شوید</p>
          <div id="authError"></div>
          <form id="loginForm">
            <div class="field"><label>شماره تماس</label><input name="phone" placeholder="09xxxxxxxxx" required></div>
            <div class="field"><label>رمز عبور</label><input type="password" name="password" required></div>
            <button class="btn btn-primary btn-block" type="submit">ورود</button>
          </form>
          <div class="auth-switch">حساب کاربری ندارید؟ <a href="#/register">ثبت‌نام کنید</a></div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const { user } = await api('/auth/login', { method: 'POST', body: Object.fromEntries(fd) });
      state.user = user;
      await Promise.all([loadCart()]);
      toast(`خوش آمدید ${user.first_name}`, true);
      navigate('/');
    } catch (err) {
      document.getElementById('authError').innerHTML = `<div class="form-error">${esc(err.message)}</div>`;
    }
  };
});

route('/register', async ({ app }) => {
  if (state.user) return navigate('/');
  app.innerHTML = `
    <div class="auth-scene">
      <div class="auth-blob b1"></div>
      <div class="auth-blob b2"></div>
      <div class="auth-blob b3"></div>
      <div class="auth-wrap">
        <div class="auth-card glass">
          <h2 class="auth-title">ساخت حساب کاربری</h2>
          <p class="auth-sub">با شماره تماس خود در روس زون عضو شوید</p>
          <div id="authError"></div>
          <form id="regForm">
            <div class="field-row">
              <div class="field"><label>نام</label><input name="first_name" required></div>
              <div class="field"><label>نام خانوادگی</label><input name="last_name" required></div>
            </div>
            <div class="field"><label>شماره تماس</label><input name="phone" placeholder="09xxxxxxxxx" required></div>
            <div class="field"><label>رمز عبور</label><input type="password" name="password" required></div>
            <div class="field"><label>تکرار رمز عبور</label><input type="password" name="confirm_password" required></div>
            <button class="btn btn-primary btn-block" type="submit">ثبت‌نام</button>
          </form>
          <div class="auth-switch">قبلا ثبت‌نام کرده‌اید؟ <a href="#/login">ورود</a></div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('regForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const { user } = await api('/auth/register', { method: 'POST', body: Object.fromEntries(fd) });
      state.user = user;
      toast(`${user.first_name} عزیز، خوش آمدید`, true);
      navigate('/');
    } catch (err) {
      document.getElementById('authError').innerHTML = `<div class="form-error">${esc(err.message)}</div>`;
    }
  };
});

/* ---------- Cart & checkout ---------- */
route('/cart', async ({ app }) => {
  if (!state.user) { navigate('/login'); return; }
  await loadCart();
  const total = state.cart.reduce((s, i) => s + i.price * i.quantity, 0);
  app.innerHTML = `
    <div class="section-head"><div class="section-title"><span class="bolt">✦</span>سبد خرید شما</div></div>
    ${state.cart.length === 0 ? `<div class="empty-state"><span class="bolt">🛒</span>سبد خرید شما خالی است<br><a href="#/products" class="btn btn-primary" style="margin-top:16px;display:inline-block;">مشاهده کالاها</a></div>` : `
    <div>${state.cart.map(cartRow).join('')}</div>
    <div class="cart-summary">
      <div class="row"><span>تعداد کالا</span><span>${state.cart.reduce((s,i)=>s+i.quantity,0)} عدد</span></div>
      <div class="row total"><span>مبلغ قابل پرداخت</span><span>${money(total)}</span></div>
      <button class="btn btn-primary btn-block" id="checkoutBtn" style="margin-top:16px;">ثبت سفارش و اتصال به پشتیبانی</button>
      <div class="notice-box">⚠ این فروشگاه درگاه پرداخت آنلاین ندارد. پس از ثبت سفارش، جهت پرداخت و هماهنگی ارسال با پشتیبانی تلگرام <a href="https://t.me/your_support_username" target="_blank" style="color:var(--blue-deep);font-weight:800;">@your_support_username</a> در تماس باشید.</div>
    </div>
    `}
  `;
  app.querySelectorAll('.cart-remove-btn').forEach(btn => {
    btn.onclick = async () => {
      try {
        const { items } = await api('/cart/' + btn.dataset.id, { method: 'DELETE' });
        state.cart = items; router();
        toast('از سبد خرید حذف شد', true);
      } catch (e) { toast(e.message); }
    };
  });
  const checkoutBtn = document.getElementById('checkoutBtn');
  if (checkoutBtn) checkoutBtn.onclick = async () => {
    checkoutBtn.disabled = true;
    try {
      const result = await api('/orders', { method: 'POST' });
      state.cart = [];
      app.innerHTML = `
        <div class="empty-state">
          <span class="bolt">✓</span>
          <h2 style="margin:10px 0;color:var(--ink);">سفارش شما ثبت شد</h2>
          <div class="order-code-chip">${result.orderCode}</div>
          <p style="color:var(--ink-dim);max-width:420px;margin:16px auto 20px;">مبلغ کل: ${money(result.total)}<br>سفارش شما در وضعیت «پرداخت نشده! در حال انتظار» است. بعد از تایید ادمین، به تلگرام پیام دهید تا پرداخت و ارسال هماهنگ شود.</p>
          <a href="https://t.me/${result.supportUsername}" target="_blank" class="btn btn-primary">اتصال به پشتیبانی تلگرام ✆</a>
        </div>
      `;
      renderChrome();
    } catch (e) { toast(e.message); checkoutBtn.disabled = false; }
  };
});
function cartRow(item) {
  return `
    <div class="cart-item">
      ${item.image ? `<img src="${item.image}" alt="">` : `<div class="ph-sm">RZ</div>`}
      <div class="cart-item-info">
        <div class="name">${esc(item.name)}</div>
        <div class="meta">${money(item.price)} × ${item.quantity} = ${money(item.price * item.quantity)}</div>
      </div>
      <button class="btn btn-danger btn-sm cart-remove-btn" data-id="${item.cart_item_id}">حذف</button>
    </div>
  `;
}

/* ---------- Profile ---------- */
route('/profile', async ({ app }) => {
  if (!state.user) { navigate('/login'); return; }
  const { orders } = await api('/orders/mine');
  app.innerHTML = `
    <div class="section-head"><div class="section-title"><span class="bolt">✦</span>پروفایل من</div></div>
    <div class="profile-card">
      <div class="profile-avatar">${esc((state.user.first_name || ' ')[0])}</div>
      <div style="font-weight:800;font-size:17px;margin-bottom:4px;">${esc(state.user.first_name)} ${esc(state.user.last_name)}</div>
      <div style="color:var(--ink-dim);font-size:13.5px;margin-bottom:6px;">${esc(state.user.phone)}</div>
      <span class="tag ${state.user.role === 'admin' ? 'tag-admin' : 'tag-member'}">${state.user.role === 'admin' ? 'ادمین' : 'کاربر عادی'}</span>

      <div class="divider"></div>
      <h3 style="font-size:15px;margin:0 0 16px;">تغییر رمز عبور</h3>
      <div id="pwMsg"></div>
      <form id="pwForm">
        <div class="field"><label>رمز عبور فعلی</label><input type="password" name="current_password" required></div>
        <div class="field"><label>رمز عبور جدید</label><input type="password" name="new_password" required></div>
        <div class="field"><label>تکرار رمز جدید</label><input type="password" name="confirm_password" required></div>
        <button class="btn btn-primary btn-block" type="submit">به‌روزرسانی رمز عبور</button>
      </form>
    </div>

    <div class="section-head"><div class="section-title"><span class="bolt">✦</span>سفارش‌های من</div></div>
    <div class="orders-list">
      ${orders.map(orderCardHtml).join('') || `<div class="empty-state">هنوز سفارشی ثبت نکرده‌اید</div>`}
    </div>
  `;
  document.getElementById('pwForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/auth/change-password', { method: 'POST', body: Object.fromEntries(fd) });
      document.getElementById('pwMsg').innerHTML = `<div class="form-ok">رمز عبور با موفقیت تغییر کرد</div>`;
      e.target.reset();
    } catch (err) {
      document.getElementById('pwMsg').innerHTML = `<div class="form-error">${esc(err.message)}</div>`;
    }
  };
});

function orderCardHtml(o) {
  const isConfirmed = o.status === 'confirmed';
  const isCancelled = o.status === 'cancelled';
  const statusLabel = isConfirmed ? 'ثبت‌شده' : isCancelled ? 'لغو شده' : 'پرداخت نشده! در حال انتظار';
  const statusClass = isConfirmed ? 'tag-confirmed' : isCancelled ? 'tag-cancelled' : 'tag-pending';
  return `
    <div class="order-card ${isCancelled ? 'is-cancelled' : ''}">
      <div class="order-card-head">
        <span class="order-code-chip sm">${esc(o.order_code || ('#' + o.id))}</span>
        <span class="tag ${statusClass}">${statusLabel}</span>
      </div>
      <div class="order-card-items">${o.items.map(i => `${esc(i.name)} ×${i.quantity}`).join('، ')}</div>
      ${isCancelled && o.cancel_reason ? `<div class="cancel-reason-box">دلیل لغو: ${esc(o.cancel_reason)}</div>` : ''}
      <div class="order-card-foot">
        <span class="price">${money(o.total)}</span>
        <span class="order-date">${new Date(o.created_at).toLocaleDateString('fa-IR')}</span>
      </div>
    </div>
  `;
}

/* ===================== ADMIN (standalone dashboard) ===================== */
route('/admin', async ({ app }) => adminRouter({ app, tab: 'overview' }));
route('/admin/:tab', async ({ app, params }) => adminRouter({ app, tab: params.tab }));

const ADMIN_TABS = [
  { id: 'overview', label: 'نمای کلی', icon: '◆' },
  { id: 'products', label: 'کالاها', icon: '▤' },
  { id: 'categories', label: 'دسته‌بندی‌ها', icon: '▦' },
  { id: 'orders', label: 'سفارش‌ها', icon: '✎' },
  { id: 'carts', label: 'سبدخرید کاربران', icon: '⛁' },
  { id: 'users', label: 'مخاطبین و کاربران', icon: '☺' },
  { id: 'logs', label: 'لاگ اتفاقات', icon: '≡' },
  { id: 'backup', label: 'پشتیبان‌گیری', icon: '⇅' },
];

async function adminRouter({ app, tab }) {
  if (!state.user || state.user.role !== 'admin') {
    document.body.classList.remove('admin-mode');
    app.innerHTML = `<div class="empty-state"><span class="bolt">✕</span>دسترسی محدود به ادمین است<br><a href="#/" class="btn btn-primary" style="margin-top:16px;display:inline-block;">بازگشت به فروشگاه</a></div>`;
    return;
  }
  app.innerHTML = `
    <div class="admin-shell">
      <aside class="admin-sidebar">
        <a href="#/" class="admin-logo">
          <span class="logo-mark">R</span>
          <span>روس زون<small>پنل مدیریت</small></span>
        </a>
        <nav class="admin-side-nav">
          ${ADMIN_TABS.map(t => `<a href="#/admin/${t.id}" class="${tab === t.id ? 'active' : ''}"><span class="ic">${t.icon}</span>${t.label}</a>`).join('')}
        </nav>
        <a href="#/" class="admin-exit">← بازگشت به سایت</a>
      </aside>
      <div class="admin-main">
        <div class="admin-topbar">
          <div class="admin-topbar-title">${ADMIN_TABS.find(t => t.id === tab)?.label || ''}</div>
          <div class="admin-topbar-user">
            <span>${esc(state.user.first_name)} ${esc(state.user.last_name)}</span>
            <span class="tag tag-admin">ادمین</span>
          </div>
        </div>
        <div class="admin-content" id="adminContent"><div class="loading-spin"></div></div>
      </div>
    </div>
  `;
  const content = document.getElementById('adminContent');
  const renderers = {
    overview: renderAdminOverview, products: renderAdminProducts, categories: renderAdminCategories,
    orders: renderAdminOrders, carts: renderAdminCarts, users: renderAdminUsers, logs: renderAdminLogs,
    backup: renderAdminBackup
  };
  (renderers[tab] || renderAdminOverview)(content);
}

async function renderAdminOverview(content) {
  const [{ products }, { orders }, { users }, { logs }] = await Promise.all([
    api('/products'), api('/orders'), api('/admin/users'), api('/admin/logs')
  ]);
  const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
  const pendingCount = orders.filter(o => o.status === 'pending').length;
  const stats = [
    { label: 'تعداد کالاها', value: products.length, tone: 'orange' },
    { label: 'سفارش‌های پرداخت‌نشده', value: pendingCount, tone: 'blue' },
    { label: 'کاربران عضو', value: users.length, tone: 'green' },
    { label: 'مجموع فروش', value: money(totalRevenue), tone: 'orange' },
  ];
  content.innerHTML = `
    <div class="stat-grid">
      ${stats.map(s => `<div class="stat-card tone-${s.tone}"><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>`).join('')}
    </div>
    <div class="section-head" style="margin-top:34px;"><div class="section-title"><span class="bolt">✦</span>آخرین رویدادها</div><a href="#/admin/logs" class="nav-link">مشاهده همه ←</a></div>
    <div>${logs.slice(0, 6).map(logItemHtml).join('') || `<div class="empty-state">لاگی ثبت نشده</div>`}</div>
  `;
}

async function renderAdminProducts(content) {
  const { products } = await api('/products');
  content.innerHTML = `
    <div class="admin-panel-head">
      <span style="color:var(--ink-dim);font-size:13px;">${products.length} کالا</span>
      <button class="btn btn-primary btn-sm" id="newProductBtn">+ افزودن کالای جدید</button>
    </div>
    <div class="grid">${products.map(p => `
      <div class="card">
        <div class="card-media">
          ${p.categories.length ? `<span class="card-cat-tag">${p.categories.map(c => esc(c.name)).join('، ')}</span>` : ''}
          ${p.image ? `<img src="${p.image}">` : `<span class="ph">RZ</span>`}
        </div>
        <div class="card-body">
          <div class="card-name">${esc(p.name)}</div>
          <div class="card-desc">${esc(p.description || '')}</div>
          <div class="card-footer">
            <span class="price">${money(p.price)}</span>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button class="btn btn-ghost btn-sm edit-p" data-id="${p.id}" style="flex:1;">ویرایش</button>
            <button class="btn btn-danger btn-sm del-p" data-id="${p.id}" style="flex:1;">حذف</button>
          </div>
        </div>
      </div>
    `).join('') || emptyProducts()}</div>
  `;
  content.querySelectorAll('.del-p').forEach(btn => btn.onclick = async () => {
    if (!confirm('از حذف این کالا مطمئن هستید؟')) return;
    await api('/products/' + btn.dataset.id, { method: 'DELETE' });
    toast('کالا حذف شد', true);
    renderAdminProducts(content);
  });
  content.querySelectorAll('.edit-p').forEach(btn => btn.onclick = () => {
    const p = products.find(x => x.id == btn.dataset.id);
    openProductModal(p, () => renderAdminProducts(content));
  });
  document.getElementById('newProductBtn').onclick = () => openProductModal(null, () => renderAdminProducts(content));
}

function openProductModal(product, onSaved) {
  const isEdit = !!product;
  const selectedIds = isEdit ? product.categories.map(c => c.id) : [];
  const existingImages = isEdit ? (product.images || []) : [];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <button class="modal-close" id="closeModal">×</button>
      <h3 class="modal-title">${isEdit ? 'ویرایش کالا' : 'افزودن کالای جدید'}</h3>
      <div id="modalError"></div>
      <form id="productForm">
        <div class="field"><label>نام کالا</label><input name="name" value="${isEdit ? esc(product.name) : ''}" required></div>
        <div class="field"><label>توضیحات</label><textarea name="description" rows="3">${isEdit ? esc(product.description || '') : ''}</textarea></div>
        <div class="field"><label>قیمت (تومان)</label><input type="number" name="price" value="${isEdit ? product.price : ''}" required></div>
        <div class="field">
          <label>دسته‌بندی‌ها (می‌توانید چند مورد انتخاب کنید)</label>
          <div class="cat-checkbox-group">
            ${state.categories.map(c => `
              <label class="cat-checkbox">
                <input type="checkbox" name="category_ids" value="${c.id}" ${selectedIds.includes(c.id) ? 'checked' : ''}>
                <span>${esc(c.name)}</span>
              </label>
            `).join('') || '<span style="color:var(--ink-dim);font-size:13px;">ابتدا یک دسته‌بندی بساز</span>'}
          </div>
        </div>
        ${isEdit && existingImages.length ? `
          <div class="field">
            <label>عکس‌های فعلی (${existingImages.length} عکس)</label>
            <div class="existing-thumbs">${existingImages.map(im => `<img src="${im.url}" alt="">`).join('')}</div>
          </div>
        ` : ''}
        <div class="field">
          <label>عکس‌های کالا — یک عکس الزامی، حداکثر ۱۰ عکس${isEdit ? ' (در صورت انتخاب، جایگزین گالری فعلی می‌شود)' : ''}</label>
          <input type="file" name="images" accept="image/*" multiple ${isEdit ? '' : 'required'} id="productImagesInput">
          <div id="imageCountHint" style="font-size:12px;color:var(--ink-dim);margin-top:6px;"></div>
        </div>
        <button class="btn btn-primary btn-block" type="submit">${isEdit ? 'ذخیره تغییرات' : 'افزودن کالا'}</button>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('closeModal').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const imgInput = document.getElementById('productImagesInput');
  const hint = document.getElementById('imageCountHint');
  imgInput.onchange = () => {
    const n = imgInput.files.length;
    if (n > 10) {
      hint.innerHTML = `<span style="color:#b7331f;">حداکثر ۱۰ عکس مجاز است — الان ${n} عکس انتخاب شده</span>`;
    } else if (n > 0) {
      hint.textContent = `${n} عکس انتخاب شد`;
    } else {
      hint.textContent = '';
    }
  };

  document.getElementById('productForm').onsubmit = async (e) => {
    e.preventDefault();
    if (imgInput.files.length > 10) {
      document.getElementById('modalError').innerHTML = `<div class="form-error">حداکثر ۱۰ عکس مجاز است، لطفا تعداد را کم کنید</div>`;
      return;
    }
    const fd = new FormData(e.target);
    try {
      if (isEdit) await api('/products/' + product.id, { method: 'PUT', body: fd });
      else await api('/products', { method: 'POST', body: fd });
      toast(isEdit ? 'کالا به‌روزرسانی شد' : 'کالا افزوده شد', true);
      overlay.remove();
      onSaved();
    } catch (err) {
      document.getElementById('modalError').innerHTML = `<div class="form-error">${esc(err.message)}</div>`;
    }
  };
}

async function renderAdminCategories(content) {
  await loadCategories();
  content.innerHTML = `
    <div class="admin-panel-head">
      <span style="color:var(--ink-dim);font-size:13px;">${state.categories.length} دسته‌بندی</span>
      <button class="btn btn-primary btn-sm" id="newCatBtn">+ افزودن دسته‌بندی</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>نام</th><th>اسلاگ</th><th></th></tr></thead>
        <tbody>
          ${state.categories.map(c => `
            <tr>
              <td>${esc(c.name)}</td>
              <td>${esc(c.slug)}</td>
              <td style="display:flex;gap:6px;">
                <button class="btn btn-ghost btn-sm edit-cat" data-id="${c.id}">ویرایش</button>
                <button class="btn btn-danger btn-sm del-cat" data-id="${c.id}">حذف</button>
              </td>
            </tr>
          `).join('') || `<tr><td colspan="3" style="text-align:center;color:var(--ink-dim);">دسته‌بندی‌ای ثبت نشده</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  content.querySelectorAll('.del-cat').forEach(btn => btn.onclick = async () => {
    if (!confirm('حذف این دسته‌بندی؟ (از محصولاتی که این دسته را دارند هم حذف می‌شود)')) return;
    await api('/products/categories/' + btn.dataset.id, { method: 'DELETE' });
    toast('دسته‌بندی حذف شد', true);
    renderAdminCategories(content);
  });
  content.querySelectorAll('.edit-cat').forEach(btn => btn.onclick = () => {
    const cat = state.categories.find(c => c.id == btn.dataset.id);
    openCategoryModal(cat, () => renderAdminCategories(content));
  });
  document.getElementById('newCatBtn').onclick = () => openCategoryModal(null, () => renderAdminCategories(content));
}

function openCategoryModal(cat, onSaved) {
  const isEdit = !!cat;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <button class="modal-close" id="closeModal">×</button>
      <h3 class="modal-title">${isEdit ? 'ویرایش دسته‌بندی' : 'افزودن دسته‌بندی جدید'}</h3>
      <div id="modalError"></div>
      <form id="catForm">
        <div class="field"><label>نام (فارسی)</label><input name="name" required placeholder="مثال: مردانه" value="${isEdit ? esc(cat.name) : ''}"></div>
        <div class="field"><label>اسلاگ (انگلیسی، بدون فاصله)</label><input name="slug" required placeholder="mens" value="${isEdit ? esc(cat.slug) : ''}"></div>
        <button class="btn btn-primary btn-block" type="submit">${isEdit ? 'ذخیره تغییرات' : 'افزودن'}</button>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('closeModal').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.getElementById('catForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    try {
      if (isEdit) await api('/products/categories/' + cat.id, { method: 'PUT', body: fd });
      else await api('/products/categories', { method: 'POST', body: fd });
      toast(isEdit ? 'دسته‌بندی به‌روزرسانی شد' : 'دسته‌بندی افزوده شد', true);
      overlay.remove();
      onSaved();
    } catch (err) {
      document.getElementById('modalError').innerHTML = `<div class="form-error">${esc(err.message)}</div>`;
    }
  };
}

async function renderAdminOrders(content) {
  const { orders } = await api('/orders');
  const pending = orders.filter(o => o.status === 'pending');
  const confirmed = orders.filter(o => o.status === 'confirmed');
  const cancelled = orders.filter(o => o.status === 'cancelled');
  content.innerHTML = `
    <div class="admin-panel-head">
      <span style="color:var(--ink-dim);font-size:13px;">${pending.length} پرداخت‌نشده · ${confirmed.length} ثبت‌شده · ${cancelled.length} لغوشده</span>
    </div>
    <div class="order-subtabs">
      <button class="order-subtab active" data-tab="pending">پرداخت نشده! در انتظار (${pending.length})</button>
      <button class="order-subtab" data-tab="confirmed">ثبت‌شده (${confirmed.length})</button>
      <button class="order-subtab" data-tab="cancelled">لغو شده (${cancelled.length})</button>
    </div>
    <div id="ordersTableWrap"></div>
  `;
  const wrap = document.getElementById('ordersTableWrap');

  function renderTable(mode) {
    const list = mode === 'pending' ? pending : mode === 'confirmed' ? confirmed : cancelled;
    const lastColLabel = mode === 'pending' ? '' : mode === 'confirmed' ? 'تایید توسط' : 'دلیل لغو';
    wrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>کد سفارش</th><th>مشتری</th><th>شماره تماس</th><th>اقلام</th><th>مبلغ</th><th>تاریخ</th><th>${lastColLabel}</th></tr></thead>
          <tbody>
          ${list.map(o => `
            <tr>
              <td><span class="order-code-chip sm">${esc(o.order_code || ('#' + o.id))}</span></td>
              <td>${esc(o.first_name)} ${esc(o.last_name)}</td>
              <td dir="ltr" style="text-align:right;">${esc(o.phone)}</td>
              <td class="wrap-cell">${o.items.map(i => `${esc(i.name)} ×${i.quantity}`).join('، ')}</td>
              <td>${money(o.total)}</td>
              <td>${new Date(o.created_at).toLocaleString('fa-IR')}</td>
              ${mode === 'pending'
                ? `<td style="display:flex;gap:6px;"><button class="btn btn-primary btn-sm confirm-order-btn" data-id="${o.id}">تایید</button><button class="btn btn-danger btn-sm cancel-order-btn" data-id="${o.id}" data-code="${esc(o.order_code || ('#' + o.id))}">لغو سفارش</button></td>`
                : mode === 'confirmed'
                  ? `<td>${esc(o.confirmed_by || '—')}</td>`
                  : `<td class="wrap-cell">${esc(o.cancel_reason || '—')}</td>`}
            </tr>
          `).join('') || `<tr><td colspan="7" style="text-align:center;color:var(--ink-dim);">سفارشی در این بخش نیست</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
    if (mode === 'pending') {
      wrap.querySelectorAll('.confirm-order-btn').forEach(btn => btn.onclick = async () => {
        if (!confirm('این سفارش تایید و به بخش سفارش‌های ثبت‌شده منتقل شود؟')) return;
        try {
          await api('/orders/' + btn.dataset.id + '/confirm', { method: 'POST' });
          toast('سفارش تایید شد', true);
          renderAdminOrders(content);
        } catch (e) { toast(e.message); }
      });
      wrap.querySelectorAll('.cancel-order-btn').forEach(btn => btn.onclick = () => {
        openCancelOrderModal(btn.dataset.id, btn.dataset.code, () => renderAdminOrders(content));
      });
    }
  }
  renderTable('pending');
  content.querySelectorAll('.order-subtab').forEach(btn => btn.onclick = () => {
    content.querySelectorAll('.order-subtab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTable(btn.dataset.tab);
  });
}

function openCancelOrderModal(orderId, orderCode, onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <button class="modal-close" id="closeModal">×</button>
      <h3 class="modal-title">لغو سفارش ${esc(orderCode)}</h3>
      <p style="color:var(--ink-dim);font-size:13px;margin:-8px 0 16px;">دلیلی که وارد می‌کنید مستقیماً به مشتری نمایش داده می‌شود.</p>
      <div id="modalError"></div>
      <form id="cancelOrderForm">
        <div class="field"><label>دلیل لغو سفارش</label><textarea name="reason" rows="3" required placeholder="مثال: کالا موجود نیست"></textarea></div>
        <button class="btn btn-danger btn-block" type="submit">لغو قطعی سفارش</button>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('closeModal').onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.getElementById('cancelOrderForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    try {
      await api('/orders/' + orderId + '/cancel', { method: 'POST', body: fd });
      toast('سفارش لغو شد', true);
      overlay.remove();
      onDone();
    } catch (err) {
      document.getElementById('modalError').innerHTML = `<div class="form-error">${esc(err.message)}</div>`;
    }
  };
}

async function renderAdminCarts(content) {
  const { users } = await api('/admin/users');
  content.innerHTML = `
    <div class="admin-panel-head"><span style="color:var(--ink-dim);font-size:13px;">انتخاب کاربر برای مشاهده سبد خرید</span></div>
    <div class="field" style="max-width:340px;"><select id="userSelect"><option value="">انتخاب کاربر...</option>${users.map(u => `<option value="${u.id}">${esc(u.first_name)} ${esc(u.last_name)} — ${esc(u.phone)}</option>`).join('')}</select></div>
    <div id="userCartResult"></div>
  `;
  document.getElementById('userSelect').onchange = async (e) => {
    const uid = e.target.value;
    const result = document.getElementById('userCartResult');
    if (!uid) { result.innerHTML = ''; return; }
    const { items } = await api('/cart/user/' + uid);
    result.innerHTML = items.length === 0
      ? `<div class="empty-state">سبد خرید این کاربر خالی است</div>`
      : `<div style="margin-top:20px;">${items.map(i => `
          <div class="cart-item">
            ${i.image ? `<img src="${i.image}">` : `<div class="ph-sm">RZ</div>`}
            <div class="cart-item-info"><div class="name">${esc(i.name)}</div><div class="meta">${money(i.price)} × ${i.quantity}</div></div>
            <button class="btn btn-danger btn-sm admin-cart-del" data-id="${i.cart_item_id}">حذف</button>
          </div>`).join('')}</div>`;
    result.querySelectorAll('.admin-cart-del').forEach(btn => btn.onclick = async () => {
      await api('/cart/admin/' + btn.dataset.id, { method: 'DELETE' });
      toast('آیتم از سبد کاربر حذف شد', true);
      document.getElementById('userSelect').dispatchEvent(new Event('change'));
    });
  };
}

async function renderAdminUsers(content) {
  const [{ users }, { orders }] = await Promise.all([api('/admin/users'), api('/orders')]);
  const orderCountByUser = {};
  orders.forEach(o => { orderCountByUser[o.user_id] = (orderCountByUser[o.user_id] || 0) + 1; });
  content.innerHTML = `
    <div class="admin-panel-head"><span style="color:var(--ink-dim);font-size:13px;">${users.length} کاربر — اطلاعات مخاطبین و مدیریت دسترسی</span></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>نام</th><th>شماره تماس</th><th>تعداد سفارش</th><th>نقش</th><th>تاریخ عضویت</th><th></th></tr></thead>
        <tbody>
        ${users.map(u => `
          <tr>
            <td>${esc(u.first_name)} ${esc(u.last_name)}</td>
            <td dir="ltr" style="text-align:right;">${esc(u.phone)}</td>
            <td>${orderCountByUser[u.id] || 0}</td>
            <td><span class="tag ${u.role === 'admin' ? 'tag-admin' : 'tag-member'}">${u.role === 'admin' ? 'ادمین' : 'کاربر عادی'}</span></td>
            <td>${new Date(u.created_at).toLocaleDateString('fa-IR')}</td>
            <td style="display:flex;gap:6px;">
              <button class="btn btn-ghost btn-sm change-pw" data-id="${u.id}" data-name="${esc(u.first_name)} ${esc(u.last_name)}">تغییر رمز</button>
              <button class="btn btn-gold btn-sm toggle-role" data-id="${u.id}" data-role="${u.role}">${u.role === 'admin' ? 'تنزل به عادی' : 'ارتقا به ادمین'}</button>
            </td>
          </tr>
        `).join('')}
        </tbody>
      </table>
    </div>
  `;
  content.querySelectorAll('.toggle-role').forEach(btn => btn.onclick = async () => {
    const newRole = btn.dataset.role === 'admin' ? 'member' : 'admin';
    if (!confirm(`نقش این کاربر به «${newRole === 'admin' ? 'ادمین' : 'کاربر عادی'}» تغییر کند؟`)) return;
    await api('/admin/users/' + btn.dataset.id + '/role', { method: 'POST', body: { role: newRole } });
    toast('نقش کاربر تغییر کرد', true);
    renderAdminUsers(content);
  });
  content.querySelectorAll('.change-pw').forEach(btn => btn.onclick = () => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <button class="modal-close" id="closeModal">×</button>
        <h3 class="modal-title">تغییر رمز عبور — ${btn.dataset.name}</h3>
        <div id="modalError"></div>
        <form id="pwAdminForm">
          <div class="field"><label>رمز عبور جدید</label><input type="password" name="new_password" required></div>
          <button class="btn btn-primary btn-block" type="submit">اعمال تغییر</button>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('closeModal').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.getElementById('pwAdminForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      try {
        await api('/admin/users/' + btn.dataset.id + '/change-password', { method: 'POST', body: fd });
        toast('رمز عبور کاربر تغییر کرد', true);
        overlay.remove();
      } catch (err) { document.getElementById('modalError').innerHTML = `<div class="form-error">${esc(err.message)}</div>`; }
    };
  });
}

function logItemHtml(l) {
  return `
    <div class="log-item">
      <div class="top"><span class="actor">${esc(l.actor_name)}</span><span class="time">${new Date(l.created_at).toLocaleString('fa-IR')}</span></div>
      <div class="action">${esc(l.action)}</div>
      ${l.details ? `<div class="details">${esc(JSON.stringify(l.details))}</div>` : ''}
    </div>
  `;
}

async function renderAdminLogs(content) {
  const { logs } = await api('/admin/logs');
  content.innerHTML = `
    <div class="admin-panel-head"><span style="color:var(--ink-dim);font-size:13px;">${logs.length} رویداد اخیر</span></div>
    <div>${logs.map(logItemHtml).join('') || `<div class="empty-state">لاگی ثبت نشده</div>`}</div>
  `;
}

async function renderAdminBackup(content) {
  content.innerHTML = `
    <div class="backup-grid">
      <div class="backup-card">
        <h3 class="modal-title">دریافت فایل پشتیبان</h3>
        <p style="color:var(--ink-dim);font-size:13.5px;margin:0 0 18px;line-height:1.9;">
          قبل از هر ری‌دیپلوی یا آپدیت روی Render، این فایل رو دانلود و یه‌جای امن نگه دار. یک فایل ZIP شامل تمام کاربران، محصولات، دسته‌بندی‌ها، سفارش‌ها، لاگ‌ها و <b>خود عکس‌های کالاها</b>ست.
        </p>
        <button class="btn btn-primary btn-block" id="downloadBackupBtn">⇩ دانلود فایل پشتیبان (ZIP)</button>
      </div>
      <div class="backup-card">
        <h3 class="modal-title">بازیابی از فایل پشتیبان</h3>
        <div class="notice-box" style="margin-top:0;margin-bottom:16px;">⚠ توجه: با آپلود فایل بکاپ، تمام دیتا و عکس‌های فعلی سایت (اگر داشته باشه) پاک و با محتوای فایل جایگزین می‌شود.</div>
        <div id="restoreMsg"></div>
        <div class="field"><input type="file" id="restoreFileInput" accept=".zip,application/zip"></div>
        <button class="btn btn-gold btn-block" id="restoreBtn">⇧ بازیابی از فایل انتخابی</button>
      </div>
    </div>
  `;
  document.getElementById('downloadBackupBtn').onclick = () => {
    window.open('/api/admin/backup', '_blank');
  };
  document.getElementById('restoreBtn').onclick = async () => {
    const input = document.getElementById('restoreFileInput');
    const msg = document.getElementById('restoreMsg');
    const file = input.files[0];
    if (!file) { msg.innerHTML = `<div class="form-error">لطفا ابتدا یک فایل بکاپ (zip) انتخاب کنید</div>`; return; }
    if (!confirm('با ادامه، تمام دیتا و عکس‌های فعلی سایت پاک و با فایل بکاپ جایگزین می‌شود. مطمئنید؟')) return;
    try {
      const fd = new FormData();
      fd.append('backup', file);
      const result = await api('/admin/restore', { method: 'POST', body: fd });
      msg.innerHTML = `<div class="form-ok">بازیابی موفق: ${result.restored.users} کاربر، ${result.restored.products} کالا، ${result.restored.images} عکس، ${result.restored.orders} سفارش بازگردانده شد.</div>`;
      toast('بازیابی کامل با موفقیت انجام شد', true);
      await loadCategories();
    } catch (err) {
      msg.innerHTML = `<div class="form-error">${esc(err.message || 'فایل نامعتبر است')}</div>`;
    }
  };
}


/* ===================== INIT ===================== */
(async function init() {
  await loadCategories();
  await tryRestoreSession();
  router();
})();

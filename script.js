/* Final consolidated script.js
   - Clean, single-pass implementation of cart, modal, bundle, toasts, and UI behaviors
   - Persist cart to localStorage, keyboard accessibility, smooth interactions
*/

const selectors = {
  cartToggle: '#cartToggle',
  cartSidebar: '#cartSidebar',
  cartClose: '#cartClose',
  cartCount: '#cartCount',
  cartItems: '#cartItems',
  totalPrice: '#totalPrice',
  productModal: '#productModal',
  modalClose: '#modalClose',
  modalTitle: '#modalTitle',
  modalImage: '#modalImage',
  modalPrice: '#modalPrice',
  modalDescription: '#modalDescription',
  addToCartModal: '#addToCartModal',
  bundleBtn: '#addBundleToCart',
  toastContainer: '#toastContainer',
  productCard: '.product-card',
  hamburger: '#mobileMenuToggle',
  navMenu: '.nav-menu',
  checkoutForm: '#checkoutForm'
};

const els = {};
let cart = [];
let currentProduct = null;

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

function loadElements() {
  Object.keys(selectors).forEach(k => { els[k] = document.querySelector(selectors[k]); });
  els.productCards = $all(selectors.productCard);
}

function saveCart() { localStorage.setItem('sd_cart_v1', JSON.stringify(cart)); }
function loadCart() { try { cart = JSON.parse(localStorage.getItem('sd_cart_v1') || '[]') || []; } catch { cart = []; } }

function init() {
  loadElements();
  loadCart();
  bindUI();
  renderCart();
  initScrollReveal();
  initLazyLoading();
}

/* ---------------------- Lazy image loader ---------------------- */
function initLazyLoading() {
  const lazyImages = Array.from(document.querySelectorAll('img.lazy[data-src]'));
  if (!lazyImages.length) return;

  const onIntersect = (entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      // If it's a <source> inside <picture>, set its srcset
      if (el.tagName.toLowerCase() === 'source') {
        const s = el.getAttribute('data-srcset');
        if (s) { el.srcset = s; el.removeAttribute('data-srcset'); }
        obs.unobserve(el);
        return;
      }

      const img = el;
      // If inside a <picture>, set sources first
      const pic = img.closest('picture');
      if (pic) {
        pic.querySelectorAll('source').forEach(srcEl => {
          const s = srcEl.getAttribute('data-srcset');
          if (s) { srcEl.srcset = s; srcEl.removeAttribute('data-srcset'); }
        });
      }

      const src = img.getAttribute('data-src');
      if (src) img.src = src;
      if (img.dataset.srcset) { img.srcset = img.dataset.srcset; img.removeAttribute('data-srcset'); }
      img.classList.remove('lazy');
      obs.unobserve(img);
    });
  };

  const observer = new IntersectionObserver(onIntersect, { rootMargin: '200px 0px', threshold: 0.01 });
  lazyImages.forEach(img => observer.observe(img));
}

/* ---------------------- UI Bindings ---------------------- */
function bindUI() {
  // Smooth scroll for anchors
  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener('click', onAnchorClick));

  // Mobile menu
  if (els.hamburger && els.navMenu) els.hamburger.addEventListener('click', () => els.navMenu.classList.toggle('active'));

  // Product cards
  els.productCards.forEach(card => {
    const product = JSON.parse(card.dataset.product || '{}');
    card.querySelector('.view-details')?.addEventListener('click', e => { e.stopPropagation(); openProductModal(product); });
    card.querySelector('.add-to-cart')?.addEventListener('click', e => { e.stopPropagation(); addToCart(product, 1, e.currentTarget); });
  });

  // Modal add to cart
  const addModalBtn = $(selectors.addToCartModal);
  if (addModalBtn) addModalBtn.addEventListener('click', () => { if (currentProduct) addToCart(currentProduct, 1, addModalBtn); });

  // Bundle
  if (els.bundleBtn) els.bundleBtn.addEventListener('click', onBundleAdd);

  // Cart sidebar
  if (els.cartToggle) els.cartToggle.addEventListener('click', () => openCart());
  if (els.cartClose) els.cartClose.addEventListener('click', () => closeCart());
  document.addEventListener('click', (e) => {
    if (e.target === els.cartSidebar) closeCart();
    if (e.target === els.productModal) closeProductModal();
  });

  // Modal close
  if (els.modalClose) els.modalClose.addEventListener('click', closeProductModal);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (els.cartSidebar?.classList.contains('active')) closeCart();
    if (els.productModal?.classList.contains('active')) closeProductModal();
  });

  // Checkout
  if (els.checkoutForm) els.checkoutForm.addEventListener('submit', onCheckout);

  // Navbar shadow
  window.addEventListener('scroll', onWindowScroll);
}

function onAnchorClick(e) { e.preventDefault(); const target = document.querySelector(this.getAttribute ? this.getAttribute('href') : e.currentTarget.getAttribute('href')); if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); els.navMenu?.classList.remove('active'); } }

/* ---------------------- Bundle ---------------------- */
function onBundleAdd(e) {
  const bundle = { id: 100, name: 'Best Seller Bundle', price: 700, image: 'images/bundle.jpeg' };
  addToCart(bundle, 1, e.currentTarget);
  const btn = e.currentTarget; const prev = btn.textContent; btn.textContent = 'Added!'; btn.disabled = true; setTimeout(() => { btn.textContent = prev; btn.disabled = false; }, 1100);
}

/* ---------------------- Cart ---------------------- */
function addToCart(product, qty = 1, sourceBtn = null) {
  if (!product || !product.id) return;
  const idx = cart.findIndex(i => i.id === product.id);
  if (idx >= 0) cart[idx].quantity += qty; else cart.push({ ...product, quantity: qty });
  saveCart(); renderCart(); showToast({ product, qtyAdded: qty });
  // subtle feedback: briefly pulse cart count
  const c = els.cartCount; if (c) { c.animate([{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 260 }); }
  if (sourceBtn) {
    const orig = sourceBtn.textContent; sourceBtn.textContent = 'Added!'; sourceBtn.disabled = true; setTimeout(() => { sourceBtn.textContent = orig; sourceBtn.disabled = false; }, 900);
  }
}

/* ---------------------- Cart open/close + focus trap ---------------------- */
let activeTrap = null;
function trapFocus(container) {
  const focusable = container.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])');
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first) return () => {};
  function handleTab(e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', handleTab);
  return () => document.removeEventListener('keydown', handleTab);
}

function openCart() {
  if (!els.cartSidebar) return;
  els.cartSidebar.classList.add('active');
  els.cartSidebar.setAttribute('aria-hidden', 'false');
  if (els.cartToggle) els.cartToggle.setAttribute('aria-expanded', 'true');
  els.cartSidebar.focus();
  if (activeTrap) activeTrap();
  activeTrap = trapFocus(els.cartSidebar);
}

function closeCart() {
  if (!els.cartSidebar) return;
  els.cartSidebar.classList.remove('active');
  els.cartSidebar.setAttribute('aria-hidden', 'true');
  if (els.cartToggle) els.cartToggle.setAttribute('aria-expanded', 'false');
  if (activeTrap) { activeTrap(); activeTrap = null; }
  els.cartToggle?.focus();
}

function changeQuantity(productId, delta) {
  const item = cart.find(i => i.id === productId); if (!item) return; item.quantity += delta; if (item.quantity <= 0) cart = cart.filter(i => i.id !== productId); saveCart(); renderCart(); }

function removeItem(productId) { cart = cart.filter(i => i.id !== productId); saveCart(); renderCart(); }

function renderCart() {
  const totalCount = cart.reduce((s, i) => s + i.quantity, 0);
  const totalPrice = cart.reduce((s, i) => s + i.quantity * i.price, 0);
  if (els.cartCount) els.cartCount.textContent = totalCount;
  if (els.totalPrice) els.totalPrice.textContent = `${totalPrice.toLocaleString()} EGP`;

  if (!els.cartItems) return;
  if (cart.length === 0) { els.cartItems.innerHTML = '<p>Your cart is empty</p>'; return; }

  els.cartItems.innerHTML = cart.map(item => `
    <div class="cart-item" data-id="${item.id}">
      <img src="${item.image}" alt="${item.name}">
      <div class="cart-item-info">
        <h4>${item.name}</h4>
        <p class="cart-price">${item.price.toLocaleString()} EGP</p>
        <div class="cart-controls">
          <button class="cart-decrement" aria-label="Decrease">−</button>
          <span class="cart-qty">${item.quantity}</span>
          <button class="cart-increment" aria-label="Increase">+</button>
          <button class="cart-remove" aria-label="Remove">Remove</button>
        </div>
      </div>
    </div>
  `).join('');

  // Attach handlers
  els.cartItems.querySelectorAll('.cart-increment').forEach(btn => btn.addEventListener('click', (e) => {
    const id = Number(e.currentTarget.closest('.cart-item').dataset.id); changeQuantity(id, 1);
  }));
  els.cartItems.querySelectorAll('.cart-decrement').forEach(btn => btn.addEventListener('click', (e) => {
    const id = Number(e.currentTarget.closest('.cart-item').dataset.id); changeQuantity(id, -1);
  }));
  els.cartItems.querySelectorAll('.cart-remove').forEach(btn => btn.addEventListener('click', (e) => {
    const id = Number(e.currentTarget.closest('.cart-item').dataset.id); removeItem(id);
  }));
}

/* ---------------------- Toasts (undo + countdown) ---------------------- */
function showToast({ product = null, qtyAdded = 1, text = null } = {}, duration = 5000) {
  const container = $(selectors.toastContainer); if (!container) return;
  const name = product ? product.name : (text || 'Updated');
  const toast = document.createElement('div'); toast.className = 'toast';
  toast.innerHTML = `<span class="toast-icon">🟡</span><span class="toast-text">${name} — +${qtyAdded}</span>`;

  // Timer UI
  const timerWrap = document.createElement('div'); timerWrap.className = 'toast-timer-wrap';
  const timerText = document.createElement('span'); timerText.className = 'toast-timer-text'; timerText.textContent = Math.ceil(duration / 1000);
  const timerBar = document.createElement('div'); timerBar.className = 'toast-timer-bar';
  timerWrap.appendChild(timerText); timerWrap.appendChild(timerBar); toast.appendChild(timerWrap);

  let interval = null;
  if (product) {
    const undo = document.createElement('button'); undo.className = 'toast-undo'; undo.textContent = 'Undo'; undo.type = 'button';
    undo.addEventListener('click', () => { removeItem(product.id); clearInterval(interval); dismiss(); });
    toast.appendChild(undo);
  }

  function dismiss() { toast.classList.remove('show'); toast.addEventListener('transitionend', () => toast.remove(), { once: true }); }

  container.prepend(toast); requestAnimationFrame(() => toast.classList.add('show'));
  const start = Date.now(); const end = start + duration; timerBar.style.width = '100%';
  interval = setInterval(() => {
    const now = Date.now(); const remaining = Math.max(0, end - now); const pct = (remaining / duration) * 100; timerBar.style.width = pct + '%'; timerText.textContent = Math.ceil(remaining / 1000);
    if (remaining <= 0) { clearInterval(interval); dismiss(); }
  }, 100);
}

/* ---------------------- Modal ---------------------- */
function openProductModal(product) {
  currentProduct = product;
  $(selectors.modalTitle).textContent = product.name;
  $(selectors.modalPrice).textContent = `${product.price.toLocaleString()} EGP`;
  const modalImg = $(selectors.modalImage);
  modalImg.src = product.image;
  $(selectors.modalImage).alt = product.name;
  $(selectors.modalDescription).textContent = product.longDescription || product.description || '';
  const modal = $(selectors.productModal);
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  modal.focus();
  if (activeTrap) activeTrap();
  activeTrap = trapFocus(modal);
}

function closeProductModal() {
  const modal = $(selectors.productModal);
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  currentProduct = null;
  if (activeTrap) { activeTrap(); activeTrap = null; }
}

/* ---------------------- Scroll Reveal ---------------------- */
function initScrollReveal() {
  document.querySelectorAll('.bundle-showcase, .product-card, .feature-card, .checkout').forEach(el => el.classList.add('reveal-hidden'));
  const obs = new IntersectionObserver((entries) => { entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('reveal-visible'); obs.unobserve(entry.target); } }); }, { threshold: 0.12 });
  document.querySelectorAll('.reveal-hidden').forEach(el => obs.observe(el));
}

/* ---------------------- Checkout & misc ---------------------- */
function onCheckout(e) {
  e.preventDefault(); if (cart.length === 0) { alert('Your cart is empty. Add items before placing order.'); return; }
  const submitBtn = e.currentTarget.querySelector('button[type="submit"]'); const orig = submitBtn.textContent; submitBtn.textContent = 'Processing...'; submitBtn.disabled = true;
  setTimeout(() => { alert('Order placed successfully!'); cart = []; saveCart(); renderCart(); e.currentTarget.reset(); submitBtn.textContent = orig; submitBtn.disabled = false; }, 1400);
}

function onWindowScroll() { const nav = document.querySelector('.navbar'); if (!nav) return; if (window.scrollY > 50) nav.style.boxShadow = '0 8px 30px rgba(2,6,23,0.12)'; else nav.style.boxShadow = '0 0 0 transparent'; }

/* ---------------------- Start ---------------------- */
document.addEventListener('DOMContentLoaded', init);


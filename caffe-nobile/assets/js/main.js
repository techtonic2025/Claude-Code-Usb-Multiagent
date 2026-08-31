/* Caffè Nobile — carrello, navigazione, toast, rendering */

/* ---------- Carrello (localStorage) ---------- */
const CART_KEY = "caffe-nobile-cart";

function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}
function saveCart(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); }

function addToCart(id, qty) {
  const cart = loadCart();
  const line = cart.find(l => l.id === id);
  if (line) line.qty += qty;
  else cart.push({ id, qty });
  saveCart(cart);
  updateCartCount();
  const p = findProduct(id);
  toast(p.name + " aggiunto al carrello");
}

function removeFromCart(id) {
  saveCart(loadCart().filter(l => l.id !== id));
  updateCartCount();
}

function setCartQty(id, qty) {
  const cart = loadCart();
  const line = cart.find(l => l.id === id);
  if (!line) return;
  if (qty <= 0) { removeFromCart(id); return; }
  line.qty = qty;
  saveCart(cart);
  updateCartCount();
}

function cartCount() {
  return loadCart().reduce((n, l) => n + l.qty, 0);
}

function cartTotal() {
  return loadCart().reduce((sum, l) => {
    const p = findProduct(l.id);
    return sum + (p ? p.price * l.qty : 0);
  }, 0);
}

function updateCartCount() {
  document.querySelectorAll("[data-cart-count]").forEach(el => {
    const n = cartCount();
    el.textContent = n;
    el.style.display = n > 0 ? "" : "none";
  });
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

/* ---------- Nav mobile ---------- */
function initNav() {
  const btn = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".nav");
  if (!btn || !nav) return;
  btn.addEventListener("click", () => nav.classList.toggle("open"));
}

/* ---------- Card prodotto ---------- */
function productCardHTML(p) {
  const badge = p.badge
    ? `<span class="product-badge ${p.badge}">${p.badge === "bestseller" ? "Bestseller" : p.badge === "decaf" ? "Decaffeinato" : "Biologico"}</span>`
    : "";
  return `
  <article class="product-card">
    <a class="product-media" href="product.html?id=${p.id}" style="background:${TONES[p.tone] || TONES.brown}">
      ${p.img ? `<img src="${p.img}" alt="${p.name}" loading="lazy">` : `<span class="pkg">☕</span>`}
      ${badge}
    </a>
    <div class="product-body">
      <span class="product-cat">${p.cat}</span>
      <h3 class="product-name"><a href="product.html?id=${p.id}">${p.name}</a></h3>
      <p class="product-notes">${p.notes}</p>
      <div class="rating">${stars(p.rating)} <span class="rt-txt">${p.rating.toFixed(1)}</span></div>
      <div class="product-foot">
        <span class="product-price">${formatPrice(p.price)} <span class="cur">/ ${p.weight}</span></span>
        <button class="btn btn-primary btn-sm" onclick="addToCart('${p.id}', 1)">Aggiungi</button>
      </div>
    </div>
  </article>`;
}

function renderProducts(container, list) {
  if (!container) return;
  container.innerHTML = list.map(productCardHTML).join("");
}

/* ---------- Filtri shop ---------- */
function renderFilters(container, opts) {
  if (!container) return;
  const origins = opts.origins || [];
  const roasts = opts.roasts || [];
  const maxPrice = opts.maxPrice || 100;

  const originOpts = ORIGIN_NAMES.map(o => {
    const n = origins.filter(x => x === o).length;
    return `<label class="filter-opt"><input type="checkbox" class="f-origin" value="${o}" ${n ? "" : "disabled"}> ${o} <span class="cnt">${n}</span></label>`;
  }).join("");

  const roastOpts = ROASTS.map(r => {
    const n = roasts.filter(x => x === r).length;
    return `<label class="filter-opt"><input type="checkbox" class="f-roast" value="${r}" ${n ? "" : "disabled"}> ${r} <span class="cnt">${n}</span></label>`;
  }).join("");

  container.innerHTML = `
    <h3>Filtri</h3>
    <div class="filter-group">
      <label class="ft">Prezzo massimo</label>
      <input type="range" class="price-range" min="10" max="${maxPrice}" step="1" value="${maxPrice}">
      <div class="price-out"><span>€10</span><span id="price-max-label">€${maxPrice}</span></div>
    </div>
    <div class="filter-group">
      <label class="ft">Origine</label>
      ${originOpts}
    </div>
    <div class="filter-group">
      <label class="ft">Tostatura</label>
      ${roastOpts}
    </div>
    <button class="btn btn-ghost btn-sm btn-block" id="clear-filters">Azzera filtri</button>
  `;

  const priceRange = container.querySelector(".price-range");
  const priceLabel = container.querySelector("#price-max-label");
  priceRange.addEventListener("input", () => {
    priceLabel.textContent = "€" + priceRange.value;
    window.__shopRefresh?.();
  });
  container.querySelectorAll(".f-origin, .f-roast").forEach(cb =>
    cb.addEventListener("change", () => window.__shopRefresh?.()));
  container.querySelector("#clear-filters").addEventListener("click", () => {
    container.querySelectorAll("input[type=checkbox]").forEach(c => c.checked = false);
    container.querySelector(".price-range").value = priceRange.max;
    priceLabel.textContent = "€" + priceRange.max;
    window.__shopRefresh?.();
  });
}

function currentFilters(container) {
  const origins = [...container.querySelectorAll(".f-origin:checked")].map(c => c.value);
  const roasts = [...container.querySelectorAll(".f-roast:checked")].map(c => c.value);
  const price = +container.querySelector(".price-range").value;
  return { origins, roasts, price };
}

function applyFilters(list, f) {
  return list.filter(p => {
    if (f.origins.length && !p.origins.some(o => f.origins.includes(o))) return false;
    if (f.roasts.length && !f.roasts.includes(p.roast)) return false;
    if (p.price > f.price) return false;
    return true;
  });
}

function sortProducts(list, mode) {
  const copy = [...list];
  if (mode === "price-asc") copy.sort((a, b) => a.price - b.price);
  else if (mode === "price-desc") copy.sort((a, b) => b.price - a.price);
  else if (mode === "rating") copy.sort((a, b) => b.rating - a.rating);
  return copy;
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  initNav();
  updateCartCount();
});

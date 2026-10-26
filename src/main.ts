import "./styles/good-life.css";
import { watchProducts } from "./firebase/products";
import { imageFor, watchProductImages, type ImageMap } from "./firebase/productImages";
import { getDeliveryText } from "./firebase/settings";
import { createWebOrder, isValidPhone } from "./firebase/orders";
import { buildWhatsAppOrderUrl, buildWhatsAppUrl } from "./whatsapp";
import { escapeHtml, formatPrice } from "./utils/format";
import { showToast } from "./utils/toast";
import { birdSvg } from "./ui/icons";
import { observeReveal, flyToCart } from "./ui/motion";
import { BUSINESS } from "./config";
import {
  MAX_TRAYS,
  addToCart,
  cartCount,
  cartTotal,
  clampQty,
  clearCart,
  getItems,
  onCartChange,
  removeFromCart,
  restoreCart,
  setQuantity,
} from "./cart";
import type { Product } from "./types";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="site-header">
    <div class="container site-header-inner">
      <a href="/" class="brand" aria-label="${BUSINESS.name}, ir al inicio">
        <span class="brand-mark">${birdSvg}</span>
        <span class="brand-name">${BUSINESS.name}</span>
      </a>
      <button type="button" class="header-cart" data-action="open-cart">
        Tu pedido <span class="header-cart-count" data-cart-count>0</span>
      </button>
    </div>
  </header>

  <main>
    <section class="hero">
      <div class="container hero-grid">
        <div class="hero-copy">
          <h1>Llegaste tarde. La cena ya está en el freezer.</h1>
          <p class="hero-lead">
            Hamburguesas caseras de carne y de pollo, en bandejas de 6, y ahora también sorrentinos.
            Los sacás del freezer y en unos minutos están listos.
          </p>
          <div class="hero-actions">
            <a href="#bandejas" class="btn btn-primary">Elegir bandejas</a>
            <p class="delivery-chip">
              <span class="delivery-dot" aria-hidden="true"></span>
              Próximo reparto: <strong data-delivery-text>…</strong>
            </p>
          </div>
        </div>

        <figure class="hero-photo">
          <img src="${BUSINESS.heroImage}" alt="Dos bandejas de hamburguesas de pollo rebozadas Good Life" width="1024" height="768" />
          <span class="sticker sticker-hero" aria-label="6 hamburguesas de 150 gramos por bandeja">
            <span class="sticker-big">6 u.</span>
            <span class="sticker-small">150 g c/u</span>
          </span>
        </figure>
      </div>
    </section>

    <div class="ticker" aria-hidden="true">
      <div class="ticker-track">
        ${[0, 1]
          .map(
            () => `
          <span>Hamburguesas de carne</span>${birdSvg}
          <span>Hamburguesas de pollo</span>${birdSvg}
          <span>Bandejas de 6 × 150 g</span>${birdSvg}
          <span>Del freezer a la plancha</span>${birdSvg}
          <span>Sorrentinos caseros · $12.000 la docena</span>${birdSvg}`,
          )
          .join("")}
      </div>
    </div>

    <section class="steps" aria-labelledby="steps-title">
      <div class="container">
        <h2 id="steps-title">Así de simple</h2>
        <ol class="steps-list">
          <li data-reveal style="--i: 0">
            <h3>Elegís tus bandejas</h3>
            <p>Sumás las que quieras a tu pedido y nos lo mandás por WhatsApp.</p>
          </li>
          <li data-reveal style="--i: 1">
            <h3>Te las llevamos</h3>
            <p>Repartimos el día indicado. Pagás por transferencia a nuestro alias.</p>
          </li>
          <li data-reveal style="--i: 2">
            <h3>Del freezer a la plancha</h3>
            <p>Las guardás congeladas y cocinás solo las que vas a comer, cuando quieras.</p>
          </li>
        </ol>
      </div>
    </section>

    <section class="catalog-section" id="bandejas" aria-labelledby="catalog-title">
      <div class="container">
        <div class="section-head">
          <h2 id="catalog-title">Nuestras bandejas</h2>
          <p>Hechas por nosotros, en familia, con materia prima de primera calidad.</p>
        </div>
        <div id="catalog" class="catalog" aria-live="polite" aria-busy="true">
          ${'<div class="product-card skeleton" aria-hidden="true"><div class="sk-photo"></div><div class="sk-body"><span></span><span></span><span></span></div></div>'.repeat(3)}
        </div>
      </div>
    </section>

    <section class="soon" aria-labelledby="soon-title">
      <div class="container soon-inner soon-launch" data-reveal>
        <figure class="soon-media">
          <video src="/imagenes/sorrentinos.mp4" poster="/imagenes/sorrentinos-poster.jpg" autoplay muted loop playsinline preload="metadata" aria-label="Sorrentinos caseros recién hechos"></video>
          <span class="sticker sticker-soon" aria-hidden="true">
            <span class="sticker-big">Nuevo</span>
          </span>
        </figure>
        <div class="soon-copy">
          <h2 id="soon-title">Llegaron los sorrentinos.</h2>
          <p>Caseros, hechos a mano por nosotros. Van directo del freezer a la olla.</p>
          <p class="soon-price"><strong>$12.000</strong> la docena</p>
          <a class="btn btn-light" data-sorrentinos-link target="_blank" rel="noopener">Pedir sorrentinos</a>
        </div>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="container footer-grid">
      <div class="footer-brand">
        <span class="brand-mark">${birdSvg}</span>
        <div>
          <p class="brand-name">${BUSINESS.name}</p>
          <p>Empresa familiar de hamburguesas y sorrentinos caseros congelados.</p>
        </div>
      </div>
      <dl class="footer-info">
        <div><dt>Pedidos</dt><dd><a data-whatsapp-link target="_blank" rel="noopener">Por WhatsApp</a></dd></div>
        <div><dt>Pago</dt><dd>Transferencia al alias <strong>${BUSINESS.mercadoPagoAlias}</strong></dd></div>
        <div><dt>Próximo reparto</dt><dd data-delivery-text>…</dd></div>
      </dl>
    </div>
    <div class="container footer-bottom">
      <p class="footer-legal">© ${new Date().getFullYear()} ${BUSINESS.name}. Todos los derechos reservados.</p>
      <p class="footer-credit">Creado por <a href="https://teknoweb.live" target="_blank" rel="noopener">teknoweb.live</a></p>
      <a href="/admin.html" class="btn-link">Administrar</a>
    </div>
  </footer>

  <!-- Barra de pedido (celular) -->
  <button type="button" id="cart-bar" class="cart-bar" data-action="open-cart" hidden>
    <span>Ver pedido · <span data-cart-count>0</span> bandeja(s)</span>
    <strong data-cart-total></strong>
  </button>

  <!-- Carrito -->
  <div id="cart-overlay" class="cart-overlay" hidden></div>
  <aside id="cart-drawer" class="cart-drawer" aria-label="Tu pedido" aria-hidden="true">
    <div class="cart-header">
      <h2>Tu pedido</h2>
      <button type="button" class="icon-btn" data-action="close-cart" aria-label="Cerrar">✕</button>
    </div>
    <div id="cart-items" class="cart-items"></div>
    <form class="cart-footer" id="checkout-form" novalidate>
      <div class="checkout-fields" id="checkout-fields">
        <label>Tu nombre <input type="text" id="c-name" autocomplete="name" maxlength="80" required /></label>
        <label>Tu WhatsApp <input type="tel" id="c-phone" autocomplete="tel" inputmode="tel" placeholder="261 555 1234" required /></label>
        <p class="checkout-note">Guardamos tu nombre y teléfono solo para coordinar tus pedidos.</p>
        <p class="form-error" id="checkout-error" hidden></p>
      </div>
      <p class="cart-delivery">Reparto: <strong data-delivery-text></strong></p>
      <p class="cart-total"><span>Total</span> <strong data-cart-total></strong></p>
      <button type="submit" class="btn btn-primary btn-block">Enviar pedido por WhatsApp</button>
      <button type="button" class="btn-link" data-action="clear-cart">Vaciar pedido</button>
    </form>
  </aside>

`;

// ---------- Referencias al DOM ----------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const $$ = (selector: string) => document.querySelectorAll<HTMLElement>(selector);

const catalogEl = $<HTMLDivElement>("catalog");
const cartBar = $<HTMLButtonElement>("cart-bar");
const cartDrawer = $<HTMLElement>("cart-drawer");
const cartOverlay = $<HTMLDivElement>("cart-overlay");
const cartItemsEl = $<HTMLDivElement>("cart-items");

// ---------- Estado ----------
let products: Product[] = [];
let deliveryText = BUSINESS.defaultDeliveryText;

// Links fijos de WhatsApp
$$("[data-whatsapp-link]").forEach((a) => a.setAttribute("href", buildWhatsAppUrl(`¡Hola ${BUSINESS.name}! Quería hacer una consulta.`)));
// "Pedir sorrentinos": si ya están en el catálogo, lleva a la tarjeta; si no, abre WhatsApp
function updateSorrentinosLink() {
  const inCatalog = products.some((p) => p.name.toLowerCase().includes("sorrent"));
  $$("[data-sorrentinos-link]").forEach((a) => {
    if (inCatalog) {
      a.setAttribute("href", "#bandejas");
      a.removeAttribute("target");
    } else {
      a.setAttribute("href", buildWhatsAppUrl(`¡Hola ${BUSINESS.name}! Quiero pedir sorrentinos 🙌`));
      a.setAttribute("target", "_blank");
    }
  });
}
updateSorrentinosLink();

// ---------- Stock ----------
const LOW_STOCK = 5;
const hasStock = (p: Product) => typeof p.stock === "number";
const soldOut = (p: Product) => hasStock(p) && (p.stock ?? 0) <= 0;
// Máximo que se puede pedir: el stock (si se controla) o el tope general
const maxFor = (p: Product) => (hasStock(p) ? Math.max(0, Math.min(p.stock ?? 0, MAX_TRAYS)) : MAX_TRAYS);
const inCart = (id?: string) => getItems().find((i) => i.product.id === id)?.quantity ?? 0;

function stockBadge(p: Product): string {
  if (!hasStock(p)) return "";
  const n = p.stock ?? 0;
  if (n <= 0) return `<p class="stock-badge stock-out">Sin stock por ahora · volvé a mirar antes del próximo reparto</p>`;
  if (n <= LOW_STOCK) return `<p class="stock-badge stock-low">¡Últimas ${n} ${n === 1 ? "bandeja" : "bandejas"}!</p>`;
  return `<p class="stock-badge">Quedan ${n} bandejas</p>`;
}

// ---------- Catálogo ----------
function productCard(p: Product, index: number): string {
  const id = escapeHtml(p.id);
  const name = escapeHtml(p.name);
  const src = imageFor(p, images);
  const photo = src
    ? `<img src="${escapeHtml(src)}" alt="${name}" loading="lazy" />`
    : `<div class="product-photo-empty${p.hasImage ? " is-loading" : ""}">${birdSvg}</div>`;

  return `
    <article class="product-card${revealed.has(p.id ?? "") ? " is-visible" : ""}" data-id="${id}" data-reveal style="--i: ${index % 3}">
      <div class="product-photo">
        <div class="product-photo-frame">${photo}</div>
        <span class="sticker sticker-card" aria-label="${escapeHtml(p.unitsPerTray)} unidades${p.unitWeightGram ? ` de ${escapeHtml(p.unitWeightGram)} gramos` : ""}">
          <span class="sticker-big">${escapeHtml(p.unitsPerTray)} u.</span>
          ${p.unitWeightGram ? `<span class="sticker-small">${escapeHtml(p.unitWeightGram)} g c/u</span>` : ""}
        </span>
      </div>
      <div class="product-body">
        <h3>${name}</h3>
        <p class="product-desc">${escapeHtml(p.description)}</p>
        <p class="product-price">${formatPrice(p.price)} <span>la bandeja</span></p>
        ${stockBadge(p)}
        <p class="product-delivery">Próximo reparto: <strong data-delivery-text>${escapeHtml(deliveryText)}</strong></p>
        <div class="product-actions">
          <div class="stepper" role="group" aria-label="Cantidad de bandejas">
            <button type="button" data-action="qty" data-delta="-1" aria-label="Una bandeja menos" ${soldOut(p) ? "disabled" : ""}>−</button>
            <input type="number" class="qty-input" value="1" min="1" max="${maxFor(p)}" inputmode="numeric" aria-label="Bandejas" ${soldOut(p) ? "disabled" : ""} />
            <button type="button" data-action="qty" data-delta="1" aria-label="Una bandeja más" ${soldOut(p) ? "disabled" : ""}>+</button>
          </div>
          <button type="button" class="btn btn-primary" data-action="add" ${soldOut(p) ? "disabled" : ""}>${soldOut(p) ? "Sin stock" : "Agregar"}</button>
        </div>
      </div>
    </article>
  `;
}

let images: ImageMap = new Map();
const revealed = new Set<string>(); // tarjetas que ya aparecieron (no repetir la animación)
let lastRendered = "";

function renderCatalog() {
  const key = JSON.stringify(products) + deliveryText;
  if (key === lastRendered) return; // nada cambió: no tocamos la pantalla
  lastRendered = key;
  catalogEl.querySelectorAll<HTMLElement>(".product-card.is-visible").forEach((c) => revealed.add(c.dataset.id ?? ""));
  catalogEl.removeAttribute("aria-busy");
  catalogEl.innerHTML =
    products.length === 0
      ? `<p class="catalog-status">Estamos preparando la próxima tanda. Escribinos por WhatsApp y te contamos qué hay.</p>`
      : products.map(productCard).join("");
  observeReveal(catalogEl);
}

// Las fotos llegan después del texto: se colocan sin volver a dibujar las tarjetas
function applyImages() {
  catalogEl.querySelectorAll<HTMLElement>(".product-card[data-id]").forEach((card) => {
    const p = products.find((x) => x.id === card.dataset.id);
    const src = p ? imageFor(p, images) : undefined;
    const frame = card.querySelector<HTMLElement>(".product-photo-frame");
    if (!frame || !src || frame.querySelector("img")?.getAttribute("src") === src) return;
    const img = new Image();
    img.alt = p!.name;
    img.className = "fade-in";
    img.src = src;
    frame.replaceChildren(img);
  });
}

// Copia liviana del catálogo (sin fotos) para mostrarlo al instante en la próxima visita
const CATALOG_CACHE = "goodlife_catalog";
function saveCatalogCache() {
  try {
    const light = products.map((p) => (p.imageUrl?.startsWith("data:") ? { ...p, imageUrl: undefined } : p));
    localStorage.setItem(CATALOG_CACHE, JSON.stringify(light));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

function startCatalog() {
  try {
    const cached = JSON.parse(localStorage.getItem(CATALOG_CACHE) ?? "null");
    if (Array.isArray(cached) && cached.length) {
      products = cached;
      renderCatalog();
    }
  } catch {
    /* caché vacía o dañada */
  }

  watchProducts(
    (list) => {
      // Los productos marcados como ocultos no se muestran en la tienda
      products = list.filter((p) => !p.hidden);
      renderCatalog();
      applyImages();
      updateSorrentinosLink();
      restoreCart(products);
      saveCatalogCache();
    },
    (error) => {
      console.error("Error al cargar productos:", error);
      if (!products.length)
        catalogEl.innerHTML = '<p class="catalog-status">No pudimos cargar las bandejas. Revisá tu conexión y recargá la página.</p>';
    },
  );

  watchProductImages((map) => {
    images = map;
    applyImages();
  });
}

catalogEl.addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
  const card = button?.closest<HTMLElement>(".product-card");
  if (!button || !card) return;

  const input = card.querySelector<HTMLInputElement>(".qty-input")!;

  const cardProduct = products.find((p) => p.id === card.dataset.id);
  const limit = cardProduct ? maxFor(cardProduct) : MAX_TRAYS;

  if (button.dataset.action === "qty") {
    input.value = String(Math.min(clampQty(Number(input.value) + Number(button.dataset.delta)), Math.max(1, limit)));
  }

  if (button.dataset.action === "add") {
    const product = cardProduct;
    if (!product || soldOut(product)) return;
    const available = limit - inCart(product.id);
    if (available <= 0) {
      showToast(`Ya tenés en tu pedido todas las bandejas disponibles de ${product.name}.`, "error");
      return;
    }
    const quantity = Math.min(clampQty(Number(input.value)), available);
    addToCart(product, quantity);
    input.value = "1";
    showToast(`Sumaste ${quantity} bandeja(s) de ${product.name}`);
    flyToCart(button).then(bump);
  }
});

catalogEl.addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  if (!input.classList.contains("qty-input")) return;
  const p = products.find((x) => x.id === input.closest<HTMLElement>(".product-card")?.dataset.id);
  input.value = String(Math.min(clampQty(Number(input.value)), Math.max(1, p ? maxFor(p) : MAX_TRAYS)));
});

// ---------- Carrito ----------
function bump() {
  $$(".header-cart, .cart-bar").forEach((el) => {
    el.classList.remove("bump");
    void el.offsetWidth; // reinicia la animación
    el.classList.add("bump");
  });
}

function renderCart() {
  const items = getItems();
  const count = cartCount();
  const total = formatPrice(cartTotal());

  $$("[data-cart-count]").forEach((el) => (el.textContent = String(count)));
  $$("[data-cart-total]").forEach((el) => (el.textContent = total));
  cartBar.hidden = count === 0;
  checkoutForm.hidden = count === 0;
  document.body.classList.toggle("has-cart", count > 0);

  if (items.length === 0) {
    cartItemsEl.innerHTML = `
      <div class="cart-empty">
        <p>Todavía no sumaste bandejas.</p>
        <button type="button" class="btn btn-ghost" data-action="go-catalog">Ver bandejas</button>
      </div>`;
    return;
  }

  cartItemsEl.innerHTML = items
    .map(
      (i) => `
      <div class="cart-item" data-id="${escapeHtml(i.product.id)}">
        <div class="cart-item-info">
          <strong>${escapeHtml(i.product.name)}</strong>
          <span class="muted">${formatPrice(i.product.price)} la bandeja</span>
        </div>
        <button type="button" class="icon-btn cart-remove" data-action="cart-remove" aria-label="Quitar ${escapeHtml(i.product.name)}">✕</button>
        <div class="stepper stepper-sm" role="group" aria-label="Cantidad">
          <button type="button" data-action="cart-qty" data-delta="-1" aria-label="Una menos">−</button>
          <span class="stepper-value">${i.quantity}</span>
          <button type="button" data-action="cart-qty" data-delta="1" aria-label="Una más" ${i.quantity >= maxFor(i.product) ? "disabled" : ""}>+</button>
        </div>
        <span class="cart-subtotal">${formatPrice(i.quantity * i.product.price)}</span>
      </div>`,
    )
    .join("");
}

function openCart() {
  renderCart();
  cartDrawer.classList.add("open");
  cartDrawer.setAttribute("aria-hidden", "false");
  cartOverlay.hidden = false;
  document.body.classList.add("no-scroll");
}

function closeCart() {
  cartDrawer.classList.remove("open");
  cartDrawer.setAttribute("aria-hidden", "true");
  cartOverlay.hidden = true;
  document.body.classList.remove("no-scroll");
}

onCartChange(renderCart);
cartOverlay.addEventListener("click", closeCart);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeCart();
});

document.addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  const id = button.closest<HTMLElement>(".cart-item")?.dataset.id;

  switch (action) {
    case "open-cart":
      openCart();
      break;
    case "close-cart":
      closeCart();
      break;
    case "go-catalog":
      closeCart();
      $("bandejas").scrollIntoView({ behavior: "smooth" });
      break;
    case "cart-qty":
      if (id) {
        const item = getItems().find((i) => i.product.id === id);
        const next = (item?.quantity ?? 1) + Number(button.dataset.delta);
        if (next < 1) removeFromCart(id);
        else setQuantity(id, next);
      }
      break;
    case "cart-remove":
      if (id) removeFromCart(id);
      break;
    case "clear-cart":
      if (getItems().length && confirm("¿Vaciar todo el pedido?")) clearCart();
      break;
  }
});

// ---------- Datos del cliente y envío del pedido ----------
const checkoutForm = $<HTMLFormElement>("checkout-form");
const nameInput = $<HTMLInputElement>("c-name");
const phoneInput = $<HTMLInputElement>("c-phone");
const checkoutError = $<HTMLParagraphElement>("checkout-error");
const CUSTOMER_KEY = "goodlife_customer";

// Recordamos los datos en este navegador para no pedirlos cada vez
try {
  const saved = JSON.parse(localStorage.getItem(CUSTOMER_KEY) ?? "null");
  if (saved) {
    nameInput.value = saved.name ?? "";
    phoneInput.value = saved.phone ?? "";
  }
} catch {
  /* sin almacenamiento: no pasa nada */
}

checkoutForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const items = getItems();
  if (items.length === 0) return;

  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();
  checkoutError.hidden = true;
  if (!name) {
    checkoutError.textContent = "Escribí tu nombre para que sepamos de quién es el pedido.";
    checkoutError.hidden = false;
    nameInput.focus();
    return;
  }
  if (!isValidPhone(phone)) {
    checkoutError.textContent = "Revisá el teléfono: tiene que tener la característica y el número (ej: 261 555 1234).";
    checkoutError.hidden = false;
    phoneInput.focus();
    return;
  }

  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ name, phone }));
  } catch {
    /* sin almacenamiento */
  }

  // Se guarda el pedido como "pendiente" (no esperamos la respuesta para no frenar WhatsApp)
  createWebOrder({
    customerName: name,
    phone,
    deliveryText,
    items: items.map((i) => ({
      productId: i.product.id ?? "",
      name: i.product.name,
      quantity: i.quantity,
      unitPrice: i.product.price,
    })),
  }).catch((error) => console.error("No se pudo registrar el pedido:", error));

  window.open(buildWhatsAppOrderUrl(items, deliveryText, name), "_blank", "noopener");
  clearCart();
  closeCart();
  showToast("¡Listo! Terminá de enviar el pedido en WhatsApp.");
});

// ---------- Día de reparto ----------
function showDelivery(text: string) {
  deliveryText = text;
  $$("[data-delivery-text]").forEach((el) => (el.textContent = text));
}

async function loadDelivery() {
  showDelivery((await getDeliveryText()) ?? BUSINESS.defaultDeliveryText);
}

// ---------- Inicio ----------
observeReveal(document.body);
renderCart();
loadDelivery();
startCatalog();

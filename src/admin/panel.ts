import { login, logout, watchAuth, authErrorMessage } from "../firebase/auth";
import { addProduct, adjustStock, deleteProduct, updateProduct } from "../firebase/products";
import { matchLine } from "./production";
import { compressImage } from "../utils/image";
import { imageFor, setProductImage, type ImageMap } from "../firebase/productImages";
import { saveDeliveryText } from "../firebase/settings";
import {
  createManualOrder,
  deleteOrder,
  formatPhone,
  getOrders,
  isValidPhone,
  setOrderSettled,
  updateOrderSeller,
  updateOrderStatus,
} from "../firebase/orders";
import { commissionFor, toRender } from "./commission";
import { aggregateCustomers, change, computeStats, customersToCsv, type Period } from "./stats";
import { initProduction, productionTemplate } from "./production";
import { escapeHtml, formatPrice } from "../utils/format";
import { birdSvg } from "../ui/icons";
import { BUSINESS, PARTNER_NAME } from "../config";
import { showToast } from "../utils/toast";
import type { Order, OrderItem, OrderStatus, Product, Seller } from "../types";

interface AdminDeps {
  getProducts: () => Product[];
  getImages: () => ImageMap;
  reloadProducts: () => Promise<void>;
  getDeliveryText: () => string;
  onDeliveryChange: (text: string) => void;
  onProductDeleted: (id: string) => void;
}

type Tab = "resumen" | "pedidos" | "clientes" | "productos" | "produccion" | "reparto";
type OrderFilter = OrderStatus | "todos" | "rendir";

const PERIOD_NAMES: Record<Period, { now: string; prev: string; bucket: string }> = {
  semana: { now: "esta semana", prev: "la semana anterior", bucket: "Ingresos por día" },
  mes: { now: "este mes", prev: "el mes anterior", bucket: "Ingresos por día" },
  anio: { now: "este año", prev: "el año anterior", bucket: "Ingresos por mes" },
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  cancelado: "Cancelado",
};

const template = `
  <div id="admin-dialog" class="admin-dialog admin-page">
    <header class="admin-header">
      <a href="/" class="brand admin-brand" title="Ir a la tienda">
        <span class="brand-mark">${birdSvg}</span>
        <span>
          <span class="brand-name">${BUSINESS.name}</span>
          <span class="admin-subtitle">Administración</span>
        </span>
      </a>
      <div class="admin-header-actions">
        <a href="/" class="btn-link">Ver la tienda</a>
        <button type="button" id="logout-btn" class="btn-link" hidden>Cerrar sesión</button>
      </div>
    </header>

    <form id="login-form" class="admin-body admin-form admin-login">
      <p class="muted">Ingresá con tu usuario de administrador.</p>
      <label>Email <input type="email" id="login-email" autocomplete="username" required /></label>
      <label>Contraseña <input type="password" id="login-password" autocomplete="current-password" required /></label>
      <p id="login-error" class="form-error" hidden></p>
      <button type="submit" class="btn btn-primary">Ingresar</button>
    </form>

    <div id="admin-content" hidden>
      <nav class="admin-tabs" role="tablist" aria-label="Secciones">
        <button type="button" role="tab" data-tab="resumen" aria-selected="true">Resumen</button>
        <button type="button" role="tab" data-tab="pedidos">Pedidos <span class="tab-badge" id="pending-badge" hidden></span></button>
        <button type="button" role="tab" data-tab="clientes">Clientes</button>
        <button type="button" role="tab" data-tab="productos">Productos</button>
        <button type="button" role="tab" data-tab="produccion">Producción</button>
        <button type="button" role="tab" data-tab="reparto">Reparto</button>
      </nav>

      <!-- RESUMEN -->
      <section class="admin-body" data-panel="resumen" role="tabpanel">
        <div class="period-bar">
          <div class="segmented" role="group" aria-label="Período">
            <button type="button" data-period="semana" aria-pressed="true">Semana</button>
            <button type="button" data-period="mes" aria-pressed="false">Mes</button>
            <button type="button" data-period="anio" aria-pressed="false">Año</button>
          </div>
          <p class="period-label" id="period-label"></p>
        </div>
        <div class="kpis" id="kpis"></div>
        <div class="chart-card">
          <h3 id="chart-title">Ingresos por día</h3>
          <div class="bar-chart" id="bar-chart"></div>
        </div>
        <div class="chart-card">
          <h3>Lo más vendido</h3>
          <ol class="top-list" id="top-products"></ol>
        </div>
      </section>

      <!-- PEDIDOS -->
      <section class="admin-body" data-panel="pedidos" role="tabpanel" hidden>
        <div class="toolbar">
          <div class="chips" role="group" aria-label="Filtrar pedidos">
            <button type="button" data-filter="pendiente">Pendientes</button>
            <button type="button" data-filter="confirmado">Confirmados</button>
            <button type="button" data-filter="cancelado">Cancelados</button>
            <button type="button" data-filter="rendir">Falta rendir</button>
            <button type="button" data-filter="todos">Todos</button>
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="new-sale-btn">Registrar venta</button>
        </div>

        <form id="manual-sale-form" class="manual-sale admin-form" hidden>
          <h3>Registrar una venta</h3>
          <p class="muted">Para ventas que no entraron por la web. Se guardan como confirmadas.</p>
          <div class="form-row">
            <label>Nombre <input type="text" id="ms-name" maxlength="80" required /></label>
            <label>Teléfono (opcional) <input type="tel" id="ms-phone" inputmode="tel" placeholder="261 555 1234" /></label>
            <label>Fecha <input type="date" id="ms-date" required /></label>
          </div>
          <fieldset class="seller-field">
            <legend>¿Quién vendió?</legend>
            <div class="seller-choice">
              <label><input type="radio" name="ms-seller" value="titular" checked /> <span>Yo</span></label>
              <label><input type="radio" name="ms-seller" value="cocinera" /> <span>${PARTNER_NAME}</span></label>
            </div>
          </fieldset>
          <div class="ms-products" id="ms-products"></div>
          <div class="ms-summary">
            <p class="ms-total">Total: <strong id="ms-total">$ 0</strong></p>
            <p class="ms-partner" id="ms-partner" hidden></p>
          </div>
          <p id="ms-error" class="form-error" hidden></p>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Guardar venta</button>
            <button type="button" class="btn btn-ghost" id="ms-cancel">Cancelar</button>
          </div>
        </form>

        <div class="orders-list" id="orders-list"></div>
      </section>

      <!-- CLIENTES -->
      <section class="admin-body" data-panel="clientes" role="tabpanel" hidden>
        <div class="toolbar">
          <p class="customers-count" id="customers-count"></p>
          <div class="toolbar-actions">
            <input type="search" id="customer-search" placeholder="Buscar por nombre o teléfono" aria-label="Buscar cliente" />
            <button type="button" class="btn btn-ghost btn-sm" id="export-csv">Descargar para Excel</button>
          </div>
        </div>
        <div class="customers-list" id="customers-list"></div>
      </section>

      <!-- PRODUCTOS -->
      <section class="admin-body" data-panel="productos" role="tabpanel" hidden>
        <h3 class="list-title list-title-top">Tus productos</h3>
        <div id="admin-product-list" class="admin-product-list"></div>
        <form id="add-product-form" class="admin-form product-form">
          <div class="product-form-head">
            <h3 id="product-form-title">Cargar producto</h3>
            <button type="button" class="btn-link" id="cancel-edit" hidden>Cancelar edición</button>
          </div>
          <label>Nombre <input type="text" id="p-name" placeholder="Hamburguesas de pollo" required /></label>
          <label>Descripción <textarea id="p-desc" placeholder="Pechuga de pollo rebozada, con verdeo." required></textarea></label>
          <div class="form-row">
            <label>Precio ($) <input type="number" id="p-price" min="0" step="1" required /></label>
            <label>Unidades <input type="number" id="p-units" value="6" min="1" required /></label>
            <label>Gramos c/u (opcional) <input type="number" id="p-grams" value="150" min="1" placeholder="Sin peso" /></label>
            <label>Stock disponible <input type="number" id="p-stock" min="0" step="1" placeholder="Sin control" /></label>
          </div>
          <p class="muted form-hint">El stock lo ven los clientes. Baja solo cuando confirmás una venta y sube cuando registrás una tanda en Producción. Dejalo vacío si no querés mostrarlo.</p>
          <label class="check-field">
            <input type="checkbox" id="p-visible" checked />
            <span>Mostrar en la tienda <span class="muted">— desmarcalo para productos que todavía no lanzaste (podés registrar sus ventas igual)</span></span>
          </label>
          <div class="image-field">
            <span class="image-field-label">Foto</span>
            <div class="image-picker">
              <div class="image-preview" id="p-img-preview"><span class="muted">Sin foto</span></div>
              <div class="image-picker-actions">
                <label class="btn btn-ghost btn-sm file-btn">
                  <span id="p-img-btn-text">Elegir foto</span>
                  <input type="file" id="p-img-file" accept="image/*" />
                </label>
                <button type="button" class="btn-link" id="p-img-remove" hidden>Quitar foto</button>
                <p class="muted image-hint">Desde tu computadora o celular. Se achica sola para que cargue rápido.</p>
              </div>
            </div>
          </div>
          <button type="submit" class="btn btn-primary" id="product-submit">Guardar producto</button>
        </form>
      </section>

      <!-- PRODUCCIÓN -->
      <section class="admin-body" data-panel="produccion" role="tabpanel" hidden>
        ${productionTemplate}
      </section>

      <!-- REPARTO -->
      <section class="admin-body" data-panel="reparto" role="tabpanel" hidden>
        <div class="admin-form">
          <h3>Día del próximo reparto</h3>
          <p class="muted">Se muestra en la página y en el mensaje de cada pedido.</p>
          <div class="form-row">
            <label>Fecha <input type="date" id="delivery-date-input" /></label>
            <label>o texto libre <input type="text" id="delivery-text-input" placeholder="Sábado 15/08" /></label>
          </div>
          <button id="save-delivery-btn" class="btn btn-primary" type="button">Guardar día de reparto</button>
        </div>
      </section>
    </div>
  </div>
`;

export function initAdmin(deps: AdminDeps) {
  document.body.insertAdjacentHTML("beforeend", template);

  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = $<HTMLDivElement>("admin-dialog");
  const loginForm = $<HTMLFormElement>("login-form");
  const loginError = $<HTMLParagraphElement>("login-error");
  const content = $<HTMLDivElement>("admin-content");
  const logoutBtn = $<HTMLButtonElement>("logout-btn");

  let isLoggedIn = false;
  let orders: Order[] = [];
  let ordersLoaded = false;
  let period: Period = "semana";
  let filter: OrderFilter = "pendiente";
  let tab: Tab = "resumen";

  const production = initProduction({
    getOrders: () => orders,
    getProducts: deps.getProducts,
    onBatchStock: (lineId, delta) => addBatchStock(lineId, delta).catch((error) => console.error(error)),
  });

  // ---------- Apertura / sesión ----------
  function updateView() {
    loginForm.hidden = isLoggedIn;
    content.hidden = !isLoggedIn;
    logoutBtn.hidden = !isLoggedIn;
  }

  async function refreshOrders() {
    try {
      orders = await getOrders();
      ordersLoaded = true;
      if (orders.some((o) => o.status === "pendiente") === false && filter === "pendiente") filter = "todos";
      renderAll();
    } catch (error) {
      console.error(error);
      showToast("No se pudieron cargar los pedidos. Revisá las reglas de Firestore.", "error");
    }
  }

  watchAuth((user) => {
    isLoggedIn = user !== null;
    updateView();
    if (isLoggedIn) {
      refreshOrders();
      production.load();
    }
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    try {
      await login($<HTMLInputElement>("login-email").value.trim(), $<HTMLInputElement>("login-password").value);
      loginForm.reset();
    } catch (error) {
      loginError.textContent = authErrorMessage(error);
      loginError.hidden = false;
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await logout();
    orders = [];
    ordersLoaded = false;
    production.reset();
    showToast("Cerraste la sesión.");
  });


  // ---------- Pestañas ----------
  function setTab(next: Tab) {
    tab = next;
    dialog.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    dialog.querySelectorAll<HTMLElement>("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== tab));
    renderAll();
  }

  dialog.querySelector(".admin-tabs")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-tab]");
    if (b) setTab(b.dataset.tab as Tab);
  });

  function renderAll() {
    const pending = orders.filter((o) => o.status === "pendiente").length;
    const badge = $<HTMLSpanElement>("pending-badge");
    badge.hidden = pending === 0;
    badge.textContent = String(pending);

    if (tab === "resumen") renderSummary();
    if (tab === "pedidos") renderOrders();
    if (tab === "clientes") renderCustomers();
    if (tab === "productos") renderProducts();
    if (tab === "produccion") production.render();
  }

  // ---------- Resumen / estadísticas ----------
  dialog.querySelector(".segmented")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-period]");
    if (!b) return;
    period = b.dataset.period as Period;
    dialog.querySelectorAll<HTMLButtonElement>("[data-period]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderSummary();
  });

  function delta(now: number, before: number) {
    const pct = change(now, before);
    const prev = PERIOD_NAMES[period].prev;
    if (pct === null) return `<span class="kpi-delta">Sin ventas ${prev} para comparar</span>`;
    if (pct === 0) return `<span class="kpi-delta">Igual que ${prev}</span>`;
    const up = pct > 0;
    return `<span class="kpi-delta ${up ? "up" : "down"}"><span aria-hidden="true">${up ? "▲" : "▼"}</span> ${Math.abs(pct)}% ${up ? "más" : "menos"} que ${prev}</span>`;
  }

  function renderSummary() {
    const s = computeStats(orders, period);
    $("period-label").textContent = s.label;
    $("chart-title").textContent = PERIOD_NAMES[period].bucket;

    $("kpis").innerHTML = `
      <div class="kpi kpi-main">
        <p class="kpi-label">Ingresos</p>
        <p class="kpi-value">${formatPrice(s.current.revenue)}</p>
        ${delta(s.current.revenue, s.previous.revenue)}
      </div>
      <div class="kpi">
        <p class="kpi-label">Ventas</p>
        <p class="kpi-value">${s.current.orders}</p>
        ${delta(s.current.orders, s.previous.orders)}
      </div>
      <div class="kpi">
        <p class="kpi-label">Bandejas vendidas</p>
        <p class="kpi-value">${s.current.trays}</p>
        ${delta(s.current.trays, s.previous.trays)}
      </div>
      <div class="kpi">
        <p class="kpi-label">Clientes</p>
        <p class="kpi-value">${s.current.customers}</p>
        <span class="kpi-delta">${s.current.newCustomers} ${s.current.newCustomers === 1 ? "nuevo" : "nuevos"}</span>
      </div>
      ${
        s.pending
          ? `<button type="button" class="kpi-pending" data-goto="pedidos">Tenés ${s.pending} ${s.pending === 1 ? "pedido pendiente" : "pedidos pendientes"} de confirmar</button>`
          : ""
      }
    `;

    // Gráfico de barras (una sola serie: ingresos)
    const max = Math.max(...s.buckets.map((b) => b.revenue));
    const chart = $("bar-chart");
    if (!ordersLoaded) {
      chart.innerHTML = '<p class="muted chart-empty">Cargando ventas…</p>';
    } else if (max === 0) {
      chart.innerHTML = `<p class="muted chart-empty">Todavía no hay ventas confirmadas ${PERIOD_NAMES[period].now}.</p>`;
    } else {
      chart.dataset.period = period;
      chart.innerHTML = `
        <div class="bar-scale" aria-hidden="true"><span>${formatPrice(max)}</span><span>$ 0</span></div>
        <div class="bars" role="list">
          ${s.buckets
            .map((b) => {
              const h = (b.revenue / max) * 100;
              const label = `${b.title}: ${formatPrice(b.revenue)}, ${b.trays} bandeja(s)`;
              return `
                <div class="bar-col" role="listitem" tabindex="0" aria-label="${escapeHtml(label)}" data-tip="${escapeHtml(label)}">
                  <div class="bar-track"><div class="bar" style="height:${b.revenue ? Math.max(h, 2) : 0}%"></div></div>
                  <span class="bar-label">${b.label}</span>
                </div>`;
            })
            .join("")}
        </div>
        <div class="chart-tip" role="tooltip" hidden></div>
      `;
    }

    $("top-products").innerHTML = s.topProducts.length
      ? s.topProducts
          .map((p) => `<li><span>${escapeHtml(p.name)}</span><strong>${p.trays} bandeja(s)</strong></li>`)
          .join("")
      : '<li class="muted">Sin ventas en este período.</li>';
  }

  // Tooltip del gráfico
  const chartEl = $("bar-chart");
  function showTip(col: HTMLElement) {
    const tip = chartEl.querySelector<HTMLElement>(".chart-tip");
    if (!tip) return;
    tip.textContent = col.dataset.tip ?? "";
    tip.hidden = false;
    const c = chartEl.getBoundingClientRect();
    const r = col.getBoundingClientRect();
    const x = Math.min(Math.max(r.left - c.left + r.width / 2, 90), c.width - 90);
    tip.style.left = `${x}px`;
  }
  chartEl.addEventListener("pointerover", (e) => {
    const col = (e.target as HTMLElement).closest<HTMLElement>(".bar-col");
    if (col) showTip(col);
  });
  chartEl.addEventListener("focusin", (e) => {
    const col = (e.target as HTMLElement).closest<HTMLElement>(".bar-col");
    if (col) showTip(col);
  });
  chartEl.addEventListener("pointerleave", () => chartEl.querySelector<HTMLElement>(".chart-tip")?.setAttribute("hidden", ""));

  $("kpis").addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("[data-goto='pedidos']")) {
      filter = "pendiente";
      setTab("pedidos");
    }
  });

  // ---------- Stock ----------
  // sign -1: se vendió (baja el stock) · sign +1: se anuló una venta (vuelve al stock)
  async function moveStock(items: OrderItem[], sign: 1 | -1) {
    const products = deps.getProducts();
    const jobs = items.flatMap((i) => {
      const p = products.find((x) => x.id === i.productId);
      return p?.id && typeof p.stock === "number" ? [adjustStock(p.id, sign * i.quantity)] : [];
    });
    if (jobs.length === 0) return;
    await Promise.all(jobs);
    await deps.reloadProducts();
  }

  // Una tanda nueva suma stock al producto de esa línea (si hay uno solo con stock)
  async function addBatchStock(lineId: string, delta: number) {
    if (!delta) return;
    const targets = deps.getProducts().filter((p) => typeof p.stock === "number" && matchLine(p.name)?.id === lineId);
    if (targets.length !== 1) return;
    await adjustStock(targets[0].id!, delta);
    await deps.reloadProducts();
  }

  // ---------- Pedidos ----------
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("es-AR", { day: "numeric", month: "short" }) +
    " " +
    d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

  dialog.querySelector(".chips")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-filter]");
    if (!b) return;
    filter = b.dataset.filter as OrderFilter;
    renderOrders();
  });

  function renderOrders() {
    if (!saleForm.hidden) renderSaleProducts();
    dialog.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === filter)));
    const list = $("orders-list");
    if (!ordersLoaded) {
      list.innerHTML = '<p class="muted">Cargando pedidos…</p>';
      return;
    }
    const shown =
      filter === "todos"
        ? orders
        : filter === "rendir"
          ? orders.filter((o) => o.status === "confirmado" && o.seller === "cocinera" && !o.settled)
          : orders.filter((o) => o.status === filter);
    if (shown.length === 0) {
      list.innerHTML = `<p class="muted empty">${
        filter === "pendiente"
          ? "No tenés pedidos pendientes. Los pedidos que hagan desde la web van a aparecer acá."
          : filter === "rendir"
            ? `La ${PARTNER_NAME.toLowerCase()} no tiene ventas pendientes de rendir.`
            : "No hay pedidos para mostrar."
      }</p>`;
      return;
    }
    list.innerHTML = shown
      .map(
        (o) => `
        <article class="order-row" data-id="${escapeHtml(o.id)}" data-status="${o.status}">
          <div class="order-main">
            <p class="order-who"><strong>${escapeHtml(o.customerName || "Sin nombre")}</strong>
              ${o.phone ? `<a href="https://wa.me/${escapeHtml(o.phone)}" target="_blank" rel="noopener">${escapeHtml(formatPhone(o.phone))}</a>` : ""}</p>
            <p class="order-items">${o.items.map((i) => `${i.quantity}× ${escapeHtml(i.name)}`).join(", ")}</p>
            <p class="muted">${fmtDate(o.createdAt)} · ${o.source === "web" ? "Pedido web" : "Cargada a mano"}${o.deliveryText ? ` · Reparto: ${escapeHtml(o.deliveryText)}` : ""}</p>
            ${
              o.seller === "cocinera"
                ? `<p class="order-partner">Vendió la ${PARTNER_NAME.toLowerCase()} · se quedó ${formatPrice(o.commission)} de comisión · te rinde <strong>${formatPrice(toRender(o))}</strong>
                    ${o.status === "confirmado" ? `<span class="status-pill ${o.settled ? "status-confirmado" : "status-pendiente"}">${o.settled ? "Rendido" : "Falta rendir"}</span>` : ""}</p>`
                : ""
            }
          </div>
          <div class="order-side">
            <span class="status-pill status-${o.status}">${STATUS_LABEL[o.status]}</span>
            <strong class="order-total">${formatPrice(o.total)}</strong>
            <div class="order-actions">
              ${o.status !== "confirmado" ? `<button type="button" class="btn btn-primary btn-sm" data-order="confirmado">Confirmar venta</button>` : ""}
              ${o.status === "pendiente" ? `<button type="button" class="btn btn-ghost btn-sm" data-order="cancelado">Cancelar</button>` : ""}
              ${o.status === "confirmado" && o.seller === "cocinera" ? `<button type="button" class="btn ${o.settled ? "btn-ghost" : "btn-primary"} btn-sm" data-order="rendido">${o.settled ? "Desmarcar rendido" : "Marcar como rendido"}</button>` : ""}
              <button type="button" class="btn-link" data-order="vendedor">${o.seller === "cocinera" ? "Lo vendí yo" : `Lo vendió la ${PARTNER_NAME.toLowerCase()}`}</button>
              ${o.status === "confirmado" ? `<button type="button" class="btn-link" data-order="pendiente">Volver a pendiente</button>` : ""}
              <button type="button" class="btn-link danger" data-order="borrar">Borrar</button>
            </div>
          </div>
        </article>`,
      )
      .join("");
  }

  $("orders-list").addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-order]");
    const row = b?.closest<HTMLElement>(".order-row");
    if (!b || !row) return;
    const id = row.dataset.id!;
    const action = b.dataset.order!;
    try {
      if (action === "borrar") {
        if (!confirm("¿Borrar este pedido para siempre? No se va a contar en las estadísticas.")) return;
        const removed = orders.find((x) => x.id === id);
        await deleteOrder(id);
        if (removed?.status === "confirmado") await moveStock(removed.items, 1);
        orders = orders.filter((o) => o.id !== id);
        showToast("Pedido borrado.");
      } else if (action === "vendedor") {
        const o = orders.find((x) => x.id === id)!;
        const seller: Seller = o.seller === "cocinera" ? "titular" : "cocinera";
        const commission = commissionFor(o.items);
        await updateOrderSeller(id, seller, commission);
        o.seller = seller;
        o.commission = seller === "cocinera" ? commission : 0;
        o.settled = false;
        showToast(seller === "cocinera" ? `Venta asignada a la ${PARTNER_NAME.toLowerCase()}: comisión ${formatPrice(commission)}.` : "Venta asignada a vos.");
      } else if (action === "rendido") {
        const o = orders.find((x) => x.id === id)!;
        await setOrderSettled(id, !o.settled);
        o.settled = !o.settled;
        showToast(o.settled ? `Listo: la ${PARTNER_NAME.toLowerCase()} rindió ${formatPrice(toRender(o))}.` : "Marcado como pendiente de rendir.");
      } else {
        await updateOrderStatus(id, action as OrderStatus);
        const o = orders.find((x) => x.id === id);
        if (o) {
          const was = o.status;
          o.status = action as OrderStatus;
          if (was !== "confirmado" && o.status === "confirmado") await moveStock(o.items, -1);
          if (was === "confirmado" && o.status !== "confirmado") await moveStock(o.items, 1);
        }
        showToast(action === "confirmado" ? "Venta confirmada." : action === "cancelado" ? "Pedido cancelado." : "Pedido marcado como pendiente.");
      }
      renderAll();
    } catch (error) {
      console.error(error);
      showToast("No se pudo actualizar el pedido.", "error");
    }
  });

  // Venta manual
  const saleForm = $<HTMLFormElement>("manual-sale-form");
  const saleProducts = $("ms-products");

  function saleItems(): OrderItem[] {
    return deps
      .getProducts()
      .map((p) => {
        const input = saleProducts.querySelector<HTMLInputElement>(`input[data-pid="${CSS.escape(p.id ?? "")}"]`);
        const quantity = Math.max(0, Math.floor(Number(input?.value) || 0));
        return { productId: p.id ?? "", name: p.name, quantity, unitPrice: p.price };
      })
      .filter((i) => i.quantity > 0);
  }

  // Lista de productos para la venta manual: incluye los ocultos en la tienda
  // y se rearma cada vez que cambian los productos, conservando lo ya cargado.
  function renderSaleProducts() {
    const typed = new Map<string, string>();
    saleProducts.querySelectorAll<HTMLInputElement>("input[data-pid]").forEach((i) => typed.set(i.dataset.pid!, i.value));
    const products = deps.getProducts();
    saleProducts.innerHTML = products.length
      ? products
          .map(
            (p) => `
            <label class="ms-product">
              <span>${escapeHtml(p.name)} <span class="muted">${formatPrice(p.price)}${p.hidden ? " · oculto en la tienda" : ""}</span></span>
              <input type="number" min="0" max="500" value="${escapeHtml(typed.get(p.id ?? "") ?? "0")}" data-pid="${escapeHtml(p.id)}" aria-label="Bandejas de ${escapeHtml(p.name)}" />
            </label>`,
          )
          .join("")
      : '<p class="muted">Primero cargá productos en la pestaña Productos.</p>';
    updateSaleSummary();
  }

  const saleSeller = (): Seller =>
    (saleForm.querySelector<HTMLInputElement>('input[name="ms-seller"]:checked')?.value as Seller) ?? "titular";

  function updateSaleSummary() {
    const items = saleItems();
    const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    $("ms-total").textContent = formatPrice(total);
    const partner = $("ms-partner");
    partner.hidden = saleSeller() !== "cocinera" || total === 0;
    const commission = commissionFor(items);
    partner.innerHTML = `Comisión de la ${PARTNER_NAME.toLowerCase()}: <strong>${formatPrice(commission)}</strong> · Te tiene que rendir: <strong>${formatPrice(total - commission)}</strong>`;
  }

  saleForm.addEventListener("change", (e) => {
    if ((e.target as HTMLInputElement).name === "ms-seller") updateSaleSummary();
  });

  $("new-sale-btn").addEventListener("click", () => {
    saleForm.hidden = false;
    saleProducts.innerHTML = "";
    $<HTMLInputElement>("ms-date").valueAsDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    renderSaleProducts();
    $<HTMLInputElement>("ms-name").focus();
  });

  saleProducts.addEventListener("input", updateSaleSummary);

  $("ms-cancel").addEventListener("click", () => {
    saleForm.reset();
    saleForm.hidden = true;
  });

  saleForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $<HTMLParagraphElement>("ms-error");
    const items = saleItems();
    const phone = $<HTMLInputElement>("ms-phone").value;
    err.hidden = true;
    if (phone.trim() && !isValidPhone(phone)) {
      err.textContent = "Revisá el teléfono: tiene que tener entre 8 y 15 números (o dejalo vacío).";
      err.hidden = false;
      return;
    }
    if (items.length === 0) {
      err.textContent = "Indicá cuántas bandejas se vendieron.";
      err.hidden = false;
      return;
    }
    const [y, m, d] = $<HTMLInputElement>("ms-date").value.split("-").map(Number);
    const now = new Date();
    try {
      await createManualOrder({
        customerName: $<HTMLInputElement>("ms-name").value,
        phone,
        items,
        date: new Date(y, m - 1, d, now.getHours(), now.getMinutes()),
        seller: saleSeller(),
        commission: commissionFor(items),
      });
      await moveStock(items, -1);
      saleForm.reset();
      saleForm.hidden = true;
      showToast("Venta registrada.");
      await refreshOrders();
    } catch (error) {
      console.error(error);
      showToast("No se pudo guardar la venta.", "error");
    }
  });

  // ---------- Clientes ----------
  function renderCustomers() {
    const all = aggregateCustomers(orders);
    const q = $<HTMLInputElement>("customer-search").value.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    const shown = q
      ? all.filter((c) => c.name.toLowerCase().includes(q) || (qDigits && c.phone.includes(qDigits)))
      : all;
    const buyers = all.filter((c) => c.orders > 0).length;

    $("customers-count").innerHTML = ordersLoaded
      ? `<strong>${buyers}</strong> ${buyers === 1 ? "persona te compró" : "personas te compraron"}${
          all.length > buyers ? ` <span class="muted">(+${all.length - buyers} con pedido pendiente)</span>` : ""
        }`
      : "Cargando…";

    const list = $("customers-list");
    if (!ordersLoaded) {
      list.innerHTML = "";
      return;
    }
    if (shown.length === 0) {
      list.innerHTML = `<p class="muted empty">${q ? "No hay clientes que coincidan con la búsqueda." : "Cuando confirmes ventas, tus clientes van a aparecer acá."}</p>`;
      return;
    }
    const fmt = (d: Date | null) => (d ? d.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" }) : "—");
    list.innerHTML = `
      <div class="customer-row customer-head" aria-hidden="true">
        <span>Cliente</span><span>Compras</span><span>Bandejas</span><span>Total</span><span>Última compra</span>
      </div>
      ${shown
        .map(
          (c) => `
        <div class="customer-row">
          <span class="customer-id">
            <strong>${escapeHtml(c.name || "Sin nombre")}</strong>
            <a href="https://wa.me/${escapeHtml(c.phone)}" target="_blank" rel="noopener">${escapeHtml(formatPhone(c.phone))}</a>
            ${c.pending ? `<span class="status-pill status-pendiente">${c.pending} pendiente(s)</span>` : ""}
          </span>
          <span data-label="Compras">${c.orders}</span>
          <span data-label="Bandejas">${c.trays}</span>
          <span data-label="Total">${formatPrice(c.spent)}</span>
          <span data-label="Última compra">${fmt(c.lastOrder)}</span>
        </div>`,
        )
        .join("")}
    `;
  }

  $("customer-search").addEventListener("input", renderCustomers);

  $("export-csv").addEventListener("click", () => {
    const csv = customersToCsv(aggregateCustomers(orders));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes-good-life-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // ---------- Productos ----------
  function renderProducts() {
    const list = $("admin-product-list");
    const products = deps.getProducts();
    list.innerHTML = products.length
      ? products
          .map(
            (p) => `
          <div class="admin-item${p.id === editingId ? " is-editing" : ""}">
            <div class="admin-item-main">
              ${imageFor(p, deps.getImages()) ? `<img class="admin-thumb" src="${escapeHtml(imageFor(p, deps.getImages()))}" alt="" />` : '<span class="admin-thumb admin-thumb-empty"></span>'}
              <span><strong>${escapeHtml(p.name)}</strong><br /><span class="muted">${formatPrice(p.price)} · ${p.unitsPerTray} u.${p.unitWeightGram ? ` de ${p.unitWeightGram} g` : ""}${typeof p.stock === "number" ? ` · <strong class="${p.stock <= 0 ? "stock-out" : ""}">Stock: ${p.stock}</strong>` : ""}</span>${p.hidden ? ' <span class="status-pill status-oculto">Oculto en la tienda</span>' : ""}</span>
            </div>
            <div class="admin-item-actions">
              <button type="button" class="btn btn-ghost btn-sm" data-edit="${escapeHtml(p.id)}">Editar</button>
              <button type="button" class="btn-danger" data-delete="${escapeHtml(p.id)}">Borrar</button>
            </div>
          </div>`,
          )
          .join("")
      : '<p class="muted">Todavía no cargaste productos.</p>';
  }

  $("admin-product-list").addEventListener("click", async (e) => {
    const editBtn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-edit]");
    if (editBtn) {
      const product = deps.getProducts().find((p) => p.id === editBtn.dataset.edit);
      if (product) startEdit(product);
      return;
    }
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-delete]");
    const product = deps.getProducts().find((p) => p.id === b?.dataset.delete);
    if (!product?.id || !confirm(`¿Borrar "${product.name}" del catálogo?`)) return;
    try {
      await deleteProduct(product.id);
      deps.onProductDeleted(product.id);
      if (editingId === product.id) resetProductForm();
      await deps.reloadProducts();
      renderProducts();
      showToast("Producto borrado.");
    } catch (error) {
      console.error(error);
      showToast("No se pudo borrar el producto.", "error");
    }
  });

  const productForm = $<HTMLFormElement>("add-product-form");
  const fileInput = $<HTMLInputElement>("p-img-file");
  const preview = $("p-img-preview");
  const removeImgBtn = $<HTMLButtonElement>("p-img-remove");
  let editingId: string | null = null;
  let currentImage: string | null = null; // foto que se va a guardar (nueva o la que ya tenía)
  let imageChanged = false;

  function showPreview() {
    preview.innerHTML = currentImage
      ? `<img src="${escapeHtml(currentImage)}" alt="Vista previa de la foto" />`
      : '<span class="muted">Sin foto</span>';
    removeImgBtn.hidden = !currentImage;
    $("p-img-btn-text").textContent = currentImage ? "Cambiar foto" : "Elegir foto";
  }

  function resetProductForm() {
    productForm.reset();
    editingId = null;
    currentImage = null;
    imageChanged = false;
    showPreview();
    $("product-form-title").textContent = "Cargar producto";
    $("product-submit").textContent = "Guardar producto";
    $("cancel-edit").hidden = true;
    renderProducts();
  }

  function startEdit(p: Product) {
    editingId = p.id ?? null;
    $<HTMLInputElement>("p-name").value = p.name;
    $<HTMLTextAreaElement>("p-desc").value = p.description;
    $<HTMLInputElement>("p-price").value = String(p.price);
    $<HTMLInputElement>("p-units").value = String(p.unitsPerTray);
    $<HTMLInputElement>("p-grams").value = p.unitWeightGram ? String(p.unitWeightGram) : "";
    $<HTMLInputElement>("p-stock").value = typeof p.stock === "number" ? String(p.stock) : "";
    $<HTMLInputElement>("p-visible").checked = !p.hidden;
    currentImage = imageFor(p, deps.getImages()) ?? null;
    imageChanged = false;
    showPreview();
    $("product-form-title").textContent = `Editar: ${p.name}`;
    $("product-submit").textContent = "Guardar cambios";
    $("cancel-edit").hidden = false;
    renderProducts();
    productForm.scrollIntoView({ behavior: "smooth", block: "start" });
    $<HTMLInputElement>("p-name").focus({ preventScroll: true });
  }

  $("cancel-edit").addEventListener("click", resetProductForm);

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    preview.innerHTML = '<span class="muted">Preparando foto…</span>';
    try {
      currentImage = await compressImage(file);
      imageChanged = true;
    } catch (error) {
      showToast(
        (error as Error).message === "formato"
          ? "Ese archivo no es una foto que el navegador pueda abrir. Probá con JPG o PNG."
          : "La foto es demasiado pesada. Probá con otra.",
        "error",
      );
    }
    fileInput.value = "";
    showPreview();
  });

  removeImgBtn.addEventListener("click", () => {
    currentImage = null;
    imageChanged = true;
    showPreview();
  });

  productForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fields = {
      name: $<HTMLInputElement>("p-name").value.trim(),
      description: $<HTMLTextAreaElement>("p-desc").value.trim(),
      price: Number($<HTMLInputElement>("p-price").value),
      unitsPerTray: Number($<HTMLInputElement>("p-units").value),
      unitWeightGram: Number($<HTMLInputElement>("p-grams").value) || 0, // 0 = sin peso
      hidden: !$<HTMLInputElement>("p-visible").checked,
    };
    const stockValue = $<HTMLInputElement>("p-stock").value.trim();
    const stock = stockValue === "" ? null : Math.max(0, Math.floor(Number(stockValue)));
    const submit = $<HTMLButtonElement>("product-submit");
    submit.disabled = true;
    try {
      if (editingId) {
        await updateProduct(editingId, { ...fields, stock });
        if (imageChanged) await setProductImage(editingId, currentImage);
        showToast("Cambios guardados.");
      } else {
        const id = await addProduct({ ...fields, ...(stock !== null ? { stock } : {}) });
        if (currentImage) await setProductImage(id, currentImage);
        showToast("Producto guardado.");
      }
      resetProductForm(); // la lista se actualiza sola al instante
    } catch (error) {
      console.error(error);
      showToast("No se pudo guardar el producto. Revisá que tengas la sesión iniciada.", "error");
    } finally {
      submit.disabled = false;
    }
  });

  // ---------- Reparto ----------
  const dateInput = $<HTMLInputElement>("delivery-date-input");
  const textInput = $<HTMLInputElement>("delivery-text-input");

  function formatDeliveryDate(isoDate: string): string {
    const [year, month, day] = isoDate.split("-").map(Number);
    const text = new Date(year, month - 1, day).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  $("save-delivery-btn").addEventListener("click", async () => {
    const text = dateInput.value ? formatDeliveryDate(dateInput.value) : textInput.value.trim();
    if (!text) {
      showToast("Elegí una fecha o escribí un texto.", "error");
      return;
    }
    try {
      await saveDeliveryText(text);
      deps.onDeliveryChange(text);
      textInput.value = text;
      dateInput.value = "";
      showToast(`Día de reparto guardado: ${text}`);
    } catch (error) {
      console.error(error);
      showToast("No se pudo guardar el día de reparto. Revisá que tengas la sesión iniciada.", "error");
    }
  });

  return {
    // Se llama cada vez que cambian los productos o sus fotos (en vivo)
    refresh: () => renderAll(),
    // Se llama una vez, cuando se carga el día de reparto
    setDelivery: () => {
      textInput.value = deps.getDeliveryText();
    },
  };
}

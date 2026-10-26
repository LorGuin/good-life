// Pestaña "Producción": tandas, insumos, costos y crecimiento del negocio
import { addBatch, deleteBatch, getBatches, updateBatch, type BatchInput } from "../firebase/batches";
import { PRODUCTION_LINES, type ProductionLine } from "../config";
import { change, periodRange, type Period } from "./stats";
import { escapeHtml, formatPrice } from "../utils/format";
import { showToast } from "../utils/toast";
import type { Batch, Order, Product, Supply } from "../types";
import { PARTNER_NAME } from "../config";
import { partnerSummary } from "./commission";

interface ProductionDeps {
  getOrders: () => Order[];
  getProducts: () => Product[];
  onBatchStock?: (lineId: string, delta: number) => Promise<void>; // suma/resta stock al guardar o borrar tandas
  loadBatches?: () => Promise<Batch[]>; // para pruebas; por defecto lee Firestore
}

const PERIOD_NOW: Record<Period, string> = { semana: "esta semana", mes: "este mes", anio: "este año" };
const PERIOD_PREV: Record<Period, string> = { semana: "la semana anterior", mes: "el mes anterior", anio: "el año anterior" };
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const LIST_LIMIT = 15;

const compact = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });
const money = (n: number) => `${n < 0 ? "−" : ""}$${compact.format(Math.abs(n))}`;

export const productionTemplate = `
  <div class="period-bar">
    <div class="segmented" id="prod-period" role="group" aria-label="Período">
      <button type="button" data-pperiod="semana" aria-pressed="false">Semana</button>
      <button type="button" data-pperiod="mes" aria-pressed="true">Mes</button>
      <button type="button" data-pperiod="anio" aria-pressed="false">Año</button>
    </div>
    <p class="period-label" id="prod-period-label"></p>
  </div>
  <div class="kpis" id="prod-kpis"></div>
  <div class="partner-card" id="partner-card"></div>

  <div class="chart-card">
    <div class="chart-head">
      <h3>Crecimiento: últimos 6 meses</h3>
      <p class="chart-legend"><span class="dot dot-in"></span>Ingresos <span class="dot dot-out"></span>Gastos en insumos</p>
    </div>
    <div id="growth-chart"></div>
  </div>

  <h3 class="list-title list-title-top">Por producto</h3>
  <div class="line-cards" id="line-cards"></div>

  <div class="toolbar prod-toolbar">
    <h3>Tandas</h3>
    <button type="button" class="btn btn-primary btn-sm" id="new-batch-btn">Registrar tanda</button>
  </div>

  <form id="batch-form" class="manual-sale admin-form batch-form" hidden novalidate>
    <h3 id="batch-form-title">Nueva tanda</h3>
    <p class="muted">Anotá lo que gastaste en insumos para esta tanda y cuánto salió. Así ves cuánto te cuesta cada bandeja o docena.</p>
    <div class="form-row">
      <label>Fecha <input type="date" id="b-date" required /></label>
      <label>Producto
        <select id="b-line">
          ${PRODUCTION_LINES.map((l) => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join("")}
        </select>
      </label>
      <label>Cantidad que salió
        <span class="input-suffix"><input type="number" id="b-qty" min="1" step="1" inputmode="numeric" required /><span id="b-unit"></span></span>
      </label>
    </div>
    <fieldset class="supplies">
      <legend>Insumos y cuánto gastaste</legend>
      <div class="supply-head" aria-hidden="true"><span>Insumo</span><span>Cantidad</span><span>Costo ($)</span><span></span></div>
      <div id="b-supplies" class="supply-rows"></div>
      <div class="supply-actions">
        <button type="button" class="btn-link" id="b-add-supply">+ Agregar insumo</button>
        <button type="button" class="btn-link" id="b-copy-last" hidden>Copiar insumos de la última tanda</button>
      </div>
    </fieldset>
    <label>Nota (opcional) <input type="text" id="b-note" maxlength="140" placeholder="Ej: probé otra carnicería, salieron más grandes" /></label>
    <div class="batch-summary" id="b-summary"></div>
    <p id="b-error" class="form-error" hidden></p>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary" id="b-submit">Guardar tanda</button>
      <button type="button" class="btn btn-ghost" id="b-cancel">Cancelar</button>
    </div>
  </form>
  <datalist id="supply-names"></datalist>
  <div class="batch-list" id="batch-list"></div>
`;

// Línea de producción a partir del nombre de un producto o de un ítem de pedido.
// Se revisa de atrás para adelante para que "Sorrentinos de carne" cuente como sorrentinos.
export function matchLine(name: string): ProductionLine | undefined {
  const n = name.toLowerCase();
  return [...PRODUCTION_LINES].reverse().find((l) => l.match.some((m) => n.includes(m)));
}

function lineOf(id: string): ProductionLine {
  return PRODUCTION_LINES.find((l) => l.id === id) ?? { id, name: id || "Otro", unit: "unidad", units: "unidades", match: [] };
}

const qtyText = (n: number, line: ProductionLine) => `${n} ${n === 1 ? line.unit : line.units}`;
const unitCost = (b: Batch) => (b.quantity > 0 ? b.cost / b.quantity : 0);
const inRange = (d: Date, from: Date, to: Date) => d >= from && d < to;
const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const toIso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export function initProduction(deps: ProductionDeps) {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

  let batches: Batch[] = [];
  let loaded = false;
  let period: Period = "mes";
  let showAll = false;
  let editingId: string | null = null;

  // ---------- Cálculos ----------
  const confirmedOrders = () => deps.getOrders().filter((o) => o.status === "confirmado");

  function revenueIn(from: Date, to: Date) {
    return confirmedOrders()
      .filter((o) => inRange(o.createdAt, from, to))
      .reduce((s, o) => s + o.total, 0);
  }

  // Comisiones que se quedó la cocinera por sus ventas (se descuentan de la ganancia)
  function commissionsIn(from: Date, to: Date) {
    return confirmedOrders()
      .filter((o) => inRange(o.createdAt, from, to))
      .reduce((s, o) => s + (o.seller === "cocinera" ? o.commission : 0), 0);
  }

  function spentIn(from: Date, to: Date) {
    return batches.filter((b) => inRange(b.date, from, to)).reduce((s, b) => s + b.cost, 0);
  }

  function soldIn(line: ProductionLine, from: Date, to: Date) {
    let n = 0;
    for (const o of confirmedOrders()) {
      if (!inRange(o.createdAt, from, to)) continue;
      for (const i of o.items) if (matchLine(i.name)?.id === line.id) n += i.quantity;
    }
    return n;
  }

  function salePrice(line: ProductionLine): number | null {
    const product = deps.getProducts().find((p) => matchLine(p.name)?.id === line.id);
    return product?.price ?? line.price ?? null;
  }

  function delta(now: number, before: number, against: string, lowerIsBetter = false) {
    const pct = change(now, before);
    if (pct === null) {
      const de = against.startsWith("el ") ? `del ${against.slice(3)}` : `de ${against}`;
      return `<span class="kpi-delta">Sin datos ${de} para comparar</span>`;
    }
    if (pct === 0) return `<span class="kpi-delta">Igual que ${against}</span>`;
    const up = pct > 0;
    const good = lowerIsBetter ? !up : up;
    return `<span class="kpi-delta ${good ? "up" : "down"}"><span aria-hidden="true">${up ? "▲" : "▼"}</span> ${Math.abs(pct)}% ${up ? "más" : "menos"} que ${against}</span>`;
  }

  // La ganancia puede ser negativa: comparamos en pesos en vez de en porcentaje
  function profitDelta(now: number, before: number, against: string) {
    if (before > 0) return delta(now, before, against);
    if (now === before) return `<span class="kpi-delta">Igual que ${against}</span>`;
    const diff = now - before;
    return `<span class="kpi-delta ${diff > 0 ? "up" : "down"}"><span aria-hidden="true">${diff > 0 ? "▲" : "▼"}</span> ${formatPrice(Math.abs(diff))} ${diff > 0 ? "más" : "menos"} que ${against}</span>`;
  }

  // ---------- Render ----------
  function render() {
    renderKpis();
    renderPartner();
    renderGrowth();
    renderLines();
    renderList();
  }

  function renderKpis() {
    const r = periodRange(period);
    $("prod-period-label").textContent = r.label;
    const box = $("prod-kpis");
    if (!loaded) {
      box.innerHTML = '<p class="muted">Cargando producción…</p>';
      return;
    }
    const revenue = revenueIn(r.start, r.end);
    const prevRevenue = revenueIn(r.prevStart, r.prevEnd);
    const spent = spentIn(r.start, r.end);
    const prevSpent = spentIn(r.prevStart, r.prevEnd);
    const commissions = commissionsIn(r.start, r.end);
    const profit = revenue - spent - commissions;
    const prevProfit = prevRevenue - prevSpent - commissionsIn(r.prevStart, r.prevEnd);
    const prev = PERIOD_PREV[period];

    const current = batches.filter((b) => inRange(b.date, r.start, r.end));
    const byUnit = new Map<string, number>();
    for (const b of current) {
      const line = lineOf(b.line);
      byUnit.set(line.units, (byUnit.get(line.units) ?? 0) + b.quantity);
    }
    const produced = [...byUnit.entries()];

    box.innerHTML = `
      <div class="kpi kpi-main${profit < 0 ? " kpi-negative" : ""}">
        <p class="kpi-label">Resultado de ${PERIOD_NOW[period]}</p>
        <p class="kpi-value">${profit < 0 ? "−" : ""}${formatPrice(Math.abs(profit))}</p>
        <p class="kpi-explain">${
          profit > 0
            ? `Ganancia: te quedás con <strong>${Math.round((profit / revenue) * 100)}%</strong> de lo que vendés.`
            : profit < 0
              ? revenue === 0
                ? "Todavía no hay ventas confirmadas. Lo gastado en insumos está en la mercadería del freezer."
                : "Por ahora gastaste más de lo que vendiste. Lo que falta vender sigue en el freezer."
              : "Quedaste justo: lo vendido cubrió los gastos."
        }</p>
        <dl class="kpi-breakdown">
          <div><dt>Vendiste</dt><dd>${formatPrice(revenue)}</dd></div>
          <div><dt>Insumos</dt><dd>−${formatPrice(spent)}</dd></div>
          ${commissions ? `<div><dt>Comisiones</dt><dd>−${formatPrice(commissions)}</dd></div>` : ""}
        </dl>
        ${prevRevenue || prevSpent ? profitDelta(profit, prevProfit, prev) : ""}
      </div>
      <div class="kpi">
        <p class="kpi-label">Ingresos por ventas</p>
        <p class="kpi-value">${formatPrice(revenue)}</p>
        ${delta(revenue, prevRevenue, prev)}
      </div>
      <div class="kpi">
        <p class="kpi-label">Gastado en insumos</p>
        <p class="kpi-value">${formatPrice(spent)}</p>
        ${delta(spent, prevSpent, prev, true)}
      </div>
      <div class="kpi">
        <p class="kpi-label">Producción</p>
        <p class="kpi-value">${produced.length ? produced.map(([units, n]) => `${n} <span class="kpi-unit">${units}</span>`).join("<br />") : "0"}</p>
        <span class="kpi-delta">${current.length} ${current.length === 1 ? "tanda" : "tandas"}</span>
      </div>
    `;
  }

  // Cuentas con la cocinera: comisiones del período y lo que falta que rinda (de siempre)
  function renderPartner() {
    const box = $("partner-card");
    if (!loaded) {
      box.innerHTML = "";
      return;
    }
    const r = periodRange(period);
    const all = deps.getOrders();
    const now = partnerSummary(all.filter((o) => inRange(o.createdAt, r.start, r.end)));
    const total = partnerSummary(all);
    const who = `la ${PARTNER_NAME.toLowerCase()}`;
    box.innerHTML = `
      <div class="partner-head">
        <h3>Cuentas con ${who}</h3>
        <span class="muted">${PERIOD_NOW[period].charAt(0).toUpperCase() + PERIOD_NOW[period].slice(1)}</span>
      </div>
      <div class="partner-grid">
        <div><p class="kpi-label">Vendió</p><p class="line-value">${now.trays} <span class="kpi-unit">unidades</span></p><span class="kpi-delta">${now.count} ${now.count === 1 ? "venta" : "ventas"} · cobró ${formatPrice(now.charged)}</span></div>
        <div><p class="kpi-label">Se quedó de comisión</p><p class="line-value">${formatPrice(now.commission)}</p><span class="kpi-delta">Ya descontado de tu ganancia</span></div>
        <div><p class="kpi-label">Te tenía que rendir</p><p class="line-value">${formatPrice(now.toRender)}</p><span class="kpi-delta">Rindió ${formatPrice(now.rendered)}</span></div>
        <div class="${total.pending > 0 ? "partner-alert" : ""}"><p class="kpi-label">Falta que te rinda</p><p class="line-value">${formatPrice(total.pending)}</p><span class="kpi-delta">${
          total.pendingCount ? `${total.pendingCount} ${total.pendingCount === 1 ? "venta" : "ventas"} (contando todas las fechas)` : "Está todo al día"
        }</span></div>
      </div>
    `;
  }

  function renderGrowth() {
    const box = $("growth-chart");
    if (!loaded) {
      box.innerHTML = "";
      return;
    }
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const start = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      const revenue = revenueIn(start, end);
      const spent = spentIn(start, end);
      const produced = batches.filter((b) => inRange(b.date, start, end)).reduce((s, b) => s + b.quantity, 0);
      const profit = revenue - spent - commissionsIn(start, end);
      return { label: MONTHS[start.getMonth()], start, revenue, spent, profit, produced };
    });
    const max = Math.max(...months.map((m) => Math.max(m.revenue, m.spent)));
    if (max === 0) {
      box.innerHTML = '<p class="muted chart-empty">Cuando registres tandas y confirmes ventas, acá vas a ver cómo crece el negocio mes a mes.</p>';
      return;
    }
    const pct = (v: number) => (v ? Math.max((v / max) * 100, 2) : 0);
    const fullMonth = (d: Date) => d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });

    // Comparación: el mes pasado (completo) contra el primer mes con ventas
    const last = months[4];
    const first = months.slice(0, 4).find((m) => m.revenue > 0);
    let note = "";
    if (first && last.revenue > 0) {
      const g = change(last.revenue, first.revenue) ?? 0;
      note = `<p class="growth-note">De ${fullMonth(first.start)} a ${fullMonth(last.start)} tus ventas ${
        g >= 0 ? `crecieron un <strong>${g}%</strong>` : `bajaron un <strong>${Math.abs(g)}%</strong>`
      }.</p>`;
    }

    box.innerHTML = `
      <div class="growth-bars" role="list">
        ${months
          .map((m) => {
            const label = `${fullMonth(m.start)}: ingresos ${formatPrice(m.revenue)}, insumos ${formatPrice(m.spent)}, ganancia ${formatPrice(m.profit)}, ${m.produced} producidas`;
            return `
            <div class="growth-col" role="listitem" tabindex="0" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
              <div class="growth-track">
                <div class="gbar gbar-in" style="height:${pct(m.revenue)}%"></div>
                <div class="gbar gbar-out" style="height:${pct(m.spent)}%"></div>
              </div>
              <span class="bar-label">${m.label}</span>
              <span class="growth-profit${m.profit < 0 ? " neg" : ""}">${m.revenue || m.spent ? money(m.profit) : "—"}</span>
            </div>`;
          })
          .join("")}
      </div>
      <p class="growth-caption">El número de abajo es la ganancia de cada mes.</p>
      ${note}
    `;
  }

  function renderLines() {
    const box = $("line-cards");
    if (!loaded) {
      box.innerHTML = "";
      return;
    }
    const r = periodRange(period);
    box.innerHTML = PRODUCTION_LINES.map((line) => {
      const price = salePrice(line);
      const own = batches.filter((b) => b.line === line.id); // de la más nueva a la más vieja
      const head = `
        <header>
          <h4>${escapeHtml(line.name)}</h4>
          <span class="muted">${price ? `Se vende a ${formatPrice(price)} la ${line.unit}` : "Sin precio en el catálogo"}</span>
        </header>`;
      if (own.length === 0) return `<article class="line-card">${head}<p class="muted">Todavía no registraste tandas.</p></article>`;

      const [last, before] = own;
      const uc = unitCost(last);
      const producedNow = own.filter((b) => inRange(b.date, r.start, r.end)).reduce((s, b) => s + b.quantity, 0);
      const soldNow = soldIn(line, r.start, r.end);

      // Stock estimado: todo lo producido menos lo vendido desde la primera tanda registrada
      const firstDay = new Date(own[own.length - 1].date);
      firstDay.setHours(0, 0, 0, 0);
      const stock = own.reduce((s, b) => s + b.quantity, 0) - soldIn(line, firstDay, new Date(8.64e15));

      const trend = own.slice(0, 8).reverse();
      const maxUc = Math.max(...trend.map(unitCost));
      return `
        <article class="line-card">
          ${head}
          <div class="line-stats">
            <div>
              <p class="kpi-label">Te cuesta la ${line.unit}</p>
              <p class="line-value">${formatPrice(uc)}</p>
              ${before ? delta(uc, unitCost(before), "la tanda anterior", true) : '<span class="kpi-delta">Primera tanda</span>'}
            </div>
            <div>
              <p class="kpi-label">Ganás por ${line.unit}</p>
              <p class="line-value">${price ? formatPrice(price - uc) : "—"}</p>
              ${price ? `<span class="kpi-delta">${Math.round(((price - uc) / price) * 100)}% del precio</span>` : ""}
            </div>
          </div>
          <p class="line-meta">${PERIOD_NOW[period].charAt(0).toUpperCase() + PERIOD_NOW[period].slice(1)}: hiciste <strong>${qtyText(producedNow, line)}</strong> y vendiste <strong>${qtyText(soldNow, line)}</strong>.</p>
          <p class="line-meta">Stock estimado: <strong>${stock >= 0 ? qtyText(stock, line) : `0 ${line.units}`}</strong>${
            stock < 0 ? " (vendiste más de lo que registraste)" : ""
          }</p>
          ${
            trend.length > 1
              ? `<div class="trend" aria-hidden="true">
                  <div class="trend-bars">${trend.map((b) => `<span style="height:${maxUc ? Math.max((unitCost(b) / maxUc) * 100, 6) : 0}%"></span>`).join("")}</div>
                  <span class="trend-label">Costo por ${line.unit} en las últimas ${trend.length} tandas</span>
                </div>`
              : ""
          }
        </article>`;
    }).join("");
  }

  function renderList() {
    const list = $("batch-list");
    if (!loaded) {
      list.innerHTML = "";
      return;
    }
    if (batches.length === 0) {
      list.innerHTML = '<p class="muted empty">Todavía no registraste ninguna tanda. Tocá "Registrar tanda" para cargar la primera.</p>';
      return;
    }
    const shown = showAll ? batches : batches.slice(0, LIST_LIMIT);
    const fmt = (d: Date) => d.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    list.innerHTML =
      shown
        .map((b) => {
          const line = lineOf(b.line);
          return `
          <article class="order-row batch-row" data-id="${escapeHtml(b.id)}">
            <div class="order-main">
              <p><strong>${escapeHtml(line.name)}</strong> · ${qtyText(b.quantity, line)}</p>
              <p class="muted">${fmt(b.date)}</p>
              ${b.note ? `<p class="muted">“${escapeHtml(b.note)}”</p>` : ""}
              ${
                b.supplies.length
                  ? `<details>
                      <summary>${b.supplies.length} ${b.supplies.length === 1 ? "insumo" : "insumos"}</summary>
                      <ul>${b.supplies
                        .map((s) => `<li>${escapeHtml(s.name)}${s.amount ? ` <span class="muted">(${escapeHtml(s.amount)})</span>` : ""}: ${formatPrice(s.cost)}</li>`)
                        .join("")}</ul>
                    </details>`
                  : ""
              }
            </div>
            <div class="order-side">
              <strong class="order-total">${formatPrice(b.cost)}</strong>
              <span class="batch-unit">${formatPrice(unitCost(b))} por ${line.unit}</span>
              <div class="order-actions">
                <button type="button" class="btn-link" data-batch="editar">Editar</button>
                <button type="button" class="btn-link danger" data-batch="borrar">Borrar</button>
              </div>
            </div>
          </article>`;
        })
        .join("") +
      (batches.length > LIST_LIMIT
        ? `<button type="button" class="btn btn-ghost btn-sm show-more" id="batch-show-more">${showAll ? "Ver menos" : `Ver las ${batches.length} tandas`}</button>`
        : "");

    // Nombres de insumos ya usados, para autocompletar
    const names = [...new Set(batches.flatMap((b) => b.supplies.map((s) => s.name)).filter(Boolean))].sort();
    $("supply-names").innerHTML = names.map((n) => `<option value="${escapeHtml(n)}"></option>`).join("");
  }

  // ---------- Formulario ----------
  const form = $<HTMLFormElement>("batch-form");
  const suppliesBox = $("b-supplies");
  const lineSelect = $<HTMLSelectElement>("b-line");
  const qtyInput = $<HTMLInputElement>("b-qty");

  function supplyRow(s?: Partial<Supply>) {
    return `
      <div class="supply-row">
        <input type="text" class="s-name" list="supply-names" maxlength="60" placeholder="Ej: carne picada" aria-label="Insumo" value="${escapeHtml(s?.name ?? "")}" />
        <input type="text" class="s-amount" maxlength="30" placeholder="Ej: 5 kg" aria-label="Cantidad comprada" value="${escapeHtml(s?.amount ?? "")}" />
        <input type="number" class="s-cost" min="0" step="1" inputmode="numeric" placeholder="$" aria-label="Costo en pesos" value="${s?.cost ?? ""}" />
        <button type="button" class="s-remove" aria-label="Quitar insumo">×</button>
      </div>`;
  }

  function readSupplies(): Supply[] {
    return [...suppliesBox.querySelectorAll<HTMLElement>(".supply-row")]
      .map((row) => ({
        name: row.querySelector<HTMLInputElement>(".s-name")!.value.trim(),
        amount: row.querySelector<HTMLInputElement>(".s-amount")!.value.trim(),
        cost: Math.max(0, Number(row.querySelector<HTMLInputElement>(".s-cost")!.value) || 0),
      }))
      .filter((s) => s.name || s.amount || s.cost > 0);
  }

  function updateFormInfo() {
    const line = lineOf(lineSelect.value);
    const qty = Math.floor(Number(qtyInput.value) || 0);
    $("b-unit").textContent = line.units;
    $("b-copy-last").hidden = !batches.some((b) => b.line === line.id && b.id !== editingId);
    const total = readSupplies().reduce((s, x) => s + x.cost, 0);
    const price = salePrice(line);
    const uc = qty > 0 ? total / qty : 0;
    $("b-summary").innerHTML = `
      Gastaste <strong>${formatPrice(total)}</strong>
      ${qty > 0 ? ` · cada ${line.unit} te cuesta <strong>${formatPrice(uc)}</strong>` : ""}
      ${qty > 0 && price && total > 0 ? ` · ganás ${formatPrice(price - uc)} por ${line.unit} vendiéndola a ${formatPrice(price)}` : ""}
    `;
  }

  function openForm(batch?: Batch) {
    editingId = batch?.id ?? null;
    form.reset();
    $<HTMLParagraphElement>("b-error").hidden = true;
    $("batch-form-title").textContent = batch ? "Editar tanda" : "Nueva tanda";
    $("b-submit").textContent = batch ? "Guardar cambios" : "Guardar tanda";
    $<HTMLInputElement>("b-date").value = batch ? toIso(batch.date) : todayIso();
    lineSelect.value = batch?.line ?? batches[0]?.line ?? PRODUCTION_LINES[0].id;
    qtyInput.value = batch ? String(batch.quantity) : "";
    $<HTMLInputElement>("b-note").value = batch?.note ?? "";
    suppliesBox.innerHTML = batch?.supplies.length ? batch.supplies.map(supplyRow).join("") : supplyRow();
    form.hidden = false;
    updateFormInfo();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeForm() {
    form.reset();
    form.hidden = true;
    editingId = null;
  }

  $("new-batch-btn").addEventListener("click", () => openForm());
  $("b-cancel").addEventListener("click", closeForm);
  $("b-add-supply").addEventListener("click", () => {
    suppliesBox.insertAdjacentHTML("beforeend", supplyRow());
    suppliesBox.querySelector<HTMLInputElement>(".supply-row:last-child .s-name")?.focus();
  });
  $("b-copy-last").addEventListener("click", () => {
    const last = batches.find((b) => b.line === lineSelect.value && b.id !== editingId);
    if (!last) return;
    // Copia nombres y cantidades; los precios quedan para revisar (cambian seguido)
    suppliesBox.innerHTML = last.supplies.map(supplyRow).join("") || supplyRow();
    updateFormInfo();
    showToast("Copiados. Revisá los precios antes de guardar.");
  });
  suppliesBox.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(".s-remove");
    if (!btn) return;
    btn.closest(".supply-row")?.remove();
    if (!suppliesBox.children.length) suppliesBox.innerHTML = supplyRow();
    updateFormInfo();
  });
  form.addEventListener("input", updateFormInfo);
  lineSelect.addEventListener("change", updateFormInfo);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $<HTMLParagraphElement>("b-error");
    const fail = (msg: string) => {
      err.textContent = msg;
      err.hidden = false;
    };
    err.hidden = true;

    const dateValue = $<HTMLInputElement>("b-date").value;
    const quantity = Math.floor(Number(qtyInput.value) || 0);
    const supplies = readSupplies();
    if (!dateValue) return fail("Elegí la fecha de la tanda.");
    if (quantity < 1) return fail("Indicá cuánto salió en la tanda.");
    if (supplies.length === 0) return fail("Cargá al menos un insumo con lo que gastaste.");
    if (supplies.some((s) => !s.name)) return fail("A cada insumo ponele un nombre.");

    const [y, m, d] = dateValue.split("-").map(Number);
    const data: BatchInput = {
      date: new Date(y, m - 1, d, 12),
      line: lineSelect.value,
      quantity,
      supplies,
      cost: supplies.reduce((s, x) => s + x.cost, 0),
      note: $<HTMLInputElement>("b-note").value.trim(),
    };
    const submit = $<HTMLButtonElement>("b-submit");
    submit.disabled = true;
    try {
      const previous = editingId ? batches.find((x) => x.id === editingId) : undefined;
      if (editingId) await updateBatch(editingId, data);
      else await addBatch(data);
      if (previous && previous.line !== data.line) {
        await deps.onBatchStock?.(previous.line, -previous.quantity);
        await deps.onBatchStock?.(data.line, data.quantity);
      } else {
        await deps.onBatchStock?.(data.line, data.quantity - (previous?.quantity ?? 0));
      }
      showToast(editingId ? "Tanda actualizada." : "Tanda guardada.");
      closeForm();
      await load();
    } catch (error) {
      console.error(error);
      fail("No se pudo guardar. Revisá que tengas la sesión iniciada y que estén publicadas las reglas de Firestore.");
    } finally {
      submit.disabled = false;
    }
  });

  // ---------- Lista y período ----------
  $("batch-list").addEventListener("click", async (e) => {
    const target = e.target as HTMLElement;
    if (target.closest("#batch-show-more")) {
      showAll = !showAll;
      renderList();
      return;
    }
    const b = target.closest<HTMLButtonElement>("[data-batch]");
    const id = b?.closest<HTMLElement>(".batch-row")?.dataset.id;
    const batch = batches.find((x) => x.id === id);
    if (!b || !batch) return;
    if (b.dataset.batch === "editar") return openForm(batch);
    if (!confirm(`¿Borrar la tanda de ${lineOf(batch.line).name} del ${batch.date.toLocaleDateString("es-AR")}?`)) return;
    try {
      await deleteBatch(batch.id);
      await deps.onBatchStock?.(batch.line, -batch.quantity);
      batches = batches.filter((x) => x.id !== batch.id);
      if (editingId === batch.id) closeForm();
      render();
      showToast("Tanda borrada.");
    } catch (error) {
      console.error(error);
      showToast("No se pudo borrar la tanda.", "error");
    }
  });

  $("prod-period").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-pperiod]");
    if (!b) return;
    period = b.dataset.pperiod as Period;
    $("prod-period").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    render();
  });

  async function load() {
    try {
      batches = await (deps.loadBatches ?? getBatches)();
      loaded = true;
    } catch (error) {
      console.error(error);
      showToast("No se pudieron cargar las tandas. Revisá las reglas de Firestore.", "error");
    }
    render();
  }

  return {
    load,
    render,
    reset() {
      batches = [];
      loaded = false;
      closeForm();
    },
  };
}

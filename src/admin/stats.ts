import type { Customer, Order } from "../types";

export type Period = "semana" | "mes" | "anio";

const DAY = 24 * 60 * 60 * 1000;
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

interface Range {
  start: Date;
  end: Date; // exclusivo
  prevStart: Date;
  prevEnd: Date;
  label: string;
}

// Rango del período actual (la semana arranca el lunes)
export function periodRange(period: Period, ref = new Date()): Range {
  const y = ref.getFullYear();
  const m = ref.getMonth();

  if (period === "semana") {
    const start = new Date(y, m, ref.getDate() - ((ref.getDay() + 6) % 7));
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    const last = new Date(end.getTime() - DAY);
    const fmt = (d: Date) => d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
    return {
      start,
      end,
      prevStart: new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7),
      prevEnd: start,
      label: `Semana del ${fmt(start)} al ${fmt(last)}`,
    };
  }

  if (period === "mes") {
    const start = new Date(y, m, 1);
    const label = start.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    return {
      start,
      end: new Date(y, m + 1, 1),
      prevStart: new Date(y, m - 1, 1),
      prevEnd: start,
      label: label.charAt(0).toUpperCase() + label.slice(1),
    };
  }

  return {
    start: new Date(y, 0, 1),
    end: new Date(y + 1, 0, 1),
    prevStart: new Date(y - 1, 0, 1),
    prevEnd: new Date(y, 0, 1),
    label: `Año ${y}`,
  };
}

const inRange = (d: Date, from: Date, to: Date) => d >= from && d < to;
const confirmed = (orders: Order[]) => orders.filter((o) => o.status === "confirmado");

function summarize(orders: Order[]) {
  return {
    orders: orders.length,
    revenue: orders.reduce((s, o) => s + o.total, 0),
    trays: orders.reduce((s, o) => s + o.trays, 0),
    customers: new Set(orders.map((o) => o.phone)).size,
  };
}

export interface Bucket {
  label: string;
  title: string; // texto completo para el tooltip
  revenue: number;
  trays: number;
}

export function computeStats(allOrders: Order[], period: Period, ref = new Date()) {
  const range = periodRange(period, ref);
  const sold = confirmed(allOrders);
  const current = sold.filter((o) => inRange(o.createdAt, range.start, range.end));
  const previous = sold.filter((o) => inRange(o.createdAt, range.prevStart, range.prevEnd));

  // Clientes nuevos: su primera compra confirmada cae dentro del período
  const firstPurchase = new Map<string, Date>();
  for (const o of sold) {
    const prev = firstPurchase.get(o.phone);
    if (!prev || o.createdAt < prev) firstPurchase.set(o.phone, o.createdAt);
  }
  const newCustomers = [...firstPurchase.values()].filter((d) => inRange(d, range.start, range.end)).length;

  // Barras: días de la semana, días del mes o meses del año
  let buckets: Bucket[];
  let indexOf: (d: Date) => number;
  if (period === "semana") {
    buckets = WEEKDAYS.map((label, i) => {
      const d = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate() + i);
      return { label, title: d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }), revenue: 0, trays: 0 };
    });
    indexOf = (d) => (d.getDay() + 6) % 7;
  } else if (period === "mes") {
    const days = new Date(range.start.getFullYear(), range.start.getMonth() + 1, 0).getDate();
    buckets = Array.from({ length: days }, (_, i) => {
      const d = new Date(range.start.getFullYear(), range.start.getMonth(), i + 1);
      return { label: String(i + 1), title: d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }), revenue: 0, trays: 0 };
    });
    indexOf = (d) => d.getDate() - 1;
  } else {
    buckets = MONTHS.map((label, i) => ({
      label,
      title: new Date(range.start.getFullYear(), i, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" }),
      revenue: 0,
      trays: 0,
    }));
    indexOf = (d) => d.getMonth();
  }
  for (const o of current) {
    const b = buckets[indexOf(o.createdAt)];
    if (b) {
      b.revenue += o.total;
      b.trays += o.trays;
    }
  }

  // Productos más vendidos del período
  const byProduct = new Map<string, number>();
  for (const o of current) for (const i of o.items) byProduct.set(i.name, (byProduct.get(i.name) ?? 0) + i.quantity);
  const topProducts = [...byProduct.entries()]
    .map(([name, trays]) => ({ name, trays }))
    .sort((a, b) => b.trays - a.trays)
    .slice(0, 5);

  return {
    label: range.label,
    current: { ...summarize(current), newCustomers },
    previous: summarize(previous),
    buckets,
    topProducts,
    pending: allOrders.filter((o) => o.status === "pendiente").length,
  };
}

// Variación porcentual contra el período anterior (null si no hay base para comparar)
export function change(now: number, before: number): number | null {
  if (before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

// Arma la base de clientes a partir de los pedidos (agrupados por teléfono)
export function aggregateCustomers(orders: Order[]): Customer[] {
  const map = new Map<string, Customer>();
  // Recorremos del más viejo al más nuevo para quedarnos con el nombre más reciente
  for (const o of [...orders].sort((a, b) => +a.createdAt - +b.createdAt)) {
    if (o.status === "cancelado" || !o.phone) continue;
    const c = map.get(o.phone) ?? {
      phone: o.phone,
      name: o.customerName,
      orders: 0,
      trays: 0,
      spent: 0,
      firstOrder: null,
      lastOrder: null,
      pending: 0,
    };
    c.name = o.customerName || c.name;
    if (o.status === "pendiente") c.pending += 1;
    else {
      c.orders += 1;
      c.trays += o.trays;
      c.spent += o.total;
      c.firstOrder ??= o.createdAt;
      c.lastOrder = o.createdAt;
    }
    map.set(o.phone, c);
  }
  return [...map.values()].sort((a, b) => b.spent - a.spent);
}

export function customersToCsv(customers: Customer[]): string {
  const fmt = (d: Date | null) => (d ? d.toLocaleDateString("es-AR") : "");
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [
    ["Nombre", "Teléfono", "Compras", "Bandejas", "Total gastado", "Primera compra", "Última compra", "Pedidos pendientes"],
    ...customers.map((c) => [c.name, c.phone, c.orders, c.trays, c.spent, fmt(c.firstOrder), fmt(c.lastOrder), c.pending]),
  ];
  // El ; y el BOM hacen que Excel en español lo abra bien
  return "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
}

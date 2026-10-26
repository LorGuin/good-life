// Comisión de la cocinera: se calcula por producto según PRODUCTION_LINES (config.ts)
import { matchLine } from "./production";
import type { Order, OrderItem } from "../types";

export function commissionFor(items: OrderItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity * (matchLine(i.name)?.commission ?? 0), 0);
}

// Lo que la cocinera tiene que transferir: lo que cobró menos su comisión
export function toRender(o: Order): number {
  return o.seller === "cocinera" ? o.total - o.commission : 0;
}

// Resumen de cuentas con la cocinera para un conjunto de pedidos confirmados
export function partnerSummary(orders: Order[]) {
  const hers = orders.filter((o) => o.status === "confirmado" && o.seller === "cocinera");
  const sum = (list: Order[], f: (o: Order) => number) => list.reduce((s, o) => s + f(o), 0);
  return {
    count: hers.length,
    trays: sum(hers, (o) => o.trays),
    charged: sum(hers, (o) => o.total),
    commission: sum(hers, (o) => o.commission),
    toRender: sum(hers, toRender),
    rendered: sum(hers.filter((o) => o.settled), toRender),
    pending: sum(hers.filter((o) => !o.settled), toRender),
    pendingCount: hers.filter((o) => !o.settled).length,
  };
}

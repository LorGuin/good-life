import { BUSINESS } from "./config";
import { formatPrice } from "./utils/format";
import type { CartItem } from "./types";

export function buildWhatsAppUrl(message: string): string {
  return `https://wa.me/${BUSINESS.whatsappPhone}?text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppOrderUrl(items: readonly CartItem[], deliveryText: string, customerName?: string): string {
  const total = items.reduce((sum, i) => sum + i.quantity * i.product.price, 0);

  const lines = [
    `¡Hola ${BUSINESS.name}! 🍔`,
    customerName ? `Soy *${customerName}* y quiero hacer este pedido:` : "Quiero hacer este pedido:",
    "",
    ...items.map(
      (i) => `• *${i.quantity}* bandeja(s) de *${i.product.name}* — ${formatPrice(i.quantity * i.product.price)}`,
    ),
    "",
    `Total: *${formatPrice(total)}*`,
    `(Reparto: *${deliveryText}*)`,
    "",
    "Datos de pago:",
    `Alias Mercado Pago: *${BUSINESS.mercadoPagoAlias}*`,
    "(Te adjunto el comprobante por acá).",
  ];

  return buildWhatsAppUrl(lines.join("\n"));
}

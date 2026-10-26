// Escapa texto antes de insertarlo en HTML (evita que un nombre con < o ' rompa la página)
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const priceFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

// 12500 -> "$ 12.500"
export function formatPrice(value: number): string {
  return priceFormatter.format(value);
}

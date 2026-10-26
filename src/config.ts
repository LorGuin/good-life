// Datos del negocio que se muestran al cliente (no son secretos).
export const BUSINESS = {
  name: "Good Life",
  whatsappPhone: "5492616929778", // Formato internacional, sin + ni espacios
  mercadoPagoAlias: "cristianminni",
  defaultDeliveryText: "a confirmar",
  heroImage: "/imagenes/bandejas-pollo.jpg",
};

// Líneas de producción (pestaña "Producción" del panel).
// `match`: palabras que identifican al producto en el catálogo y en los pedidos.
// `price`: precio de referencia si el producto todavía no está cargado en el catálogo.
export interface ProductionLine {
  id: string;
  name: string;
  unit: string; // singular: "bandeja", "docena"
  units: string; // plural
  match: string[];
  price?: number;
  commission?: number; // lo que se queda la cocinera por cada unidad que vende ella
}

// Cómo se llama en el panel a la persona que cocina y también vende
export const PARTNER_NAME = "Cocinera";

export const PRODUCTION_LINES: ProductionLine[] = [
  { id: "carne", name: "Medallones de carne", unit: "bandeja", units: "bandejas", match: ["carne", "brasa"], commission: 1500 },
  { id: "pollo", name: "Medallones de pollo", unit: "bandeja", units: "bandejas", match: ["pollo", "craft"], commission: 1500 },
  { id: "sorrentinos", name: "Sorrentinos", unit: "docena", units: "docenas", match: ["sorrent"], price: 12000, commission: 1200 },
];

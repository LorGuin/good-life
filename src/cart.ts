import type { CartItem, Product } from "./types";

// El carrito se guarda en el navegador del cliente (solo id + cantidad).
// Los datos del producto (nombre, precio) siempre se toman del catálogo actual.
const STORAGE_KEY = "goodlife_cart";
export const MAX_TRAYS = 50;

type Listener = () => void;

let items: CartItem[] = [];
const listeners: Listener[] = [];

function clamp(qty: number): number {
  if (!Number.isFinite(qty) || qty < 1) return 1;
  return Math.min(Math.floor(qty), MAX_TRAYS);
}

function persist() {
  try {
    const data = items.map((i) => ({ id: i.product.id, quantity: i.quantity }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Sin almacenamiento disponible (modo incógnito, etc.): el carrito funciona igual mientras dure la visita
  }
}

function notify() {
  persist();
  listeners.forEach((fn) => fn());
}

export function onCartChange(fn: Listener) {
  listeners.push(fn);
}

// Reconstruye el carrito guardado usando los productos actuales del catálogo
export function restoreCart(products: Product[]) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved: { id: string; quantity: number }[] = raw ? JSON.parse(raw) : [];
    items = saved
      .map((s) => {
        const product = products.find((p) => p.id === s.id);
        return product ? { product, quantity: clamp(s.quantity) } : null;
      })
      .filter((i): i is CartItem => i !== null);
  } catch {
    items = [];
  }
  notify();
}

export function getItems(): readonly CartItem[] {
  return items;
}

export function addToCart(product: Product, quantity: number) {
  const existing = items.find((i) => i.product.id === product.id);
  if (existing) existing.quantity = clamp(existing.quantity + quantity);
  else items.push({ product, quantity: clamp(quantity) });
  notify();
}

export function setQuantity(productId: string, quantity: number) {
  const item = items.find((i) => i.product.id === productId);
  if (!item) return;
  item.quantity = clamp(quantity);
  notify();
}

export function removeFromCart(productId: string) {
  items = items.filter((i) => i.product.id !== productId);
  notify();
}

export function clearCart() {
  items = [];
  notify();
}

export function cartCount(): number {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

export function cartTotal(): number {
  return items.reduce((sum, i) => sum + i.quantity * i.product.price, 0);
}

export { clamp as clampQty };

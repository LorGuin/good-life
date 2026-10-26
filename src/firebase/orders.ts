import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "./config";
import type { Order, OrderItem, OrderStatus, Seller } from "../types";

const ordersRef = collection(db, "orders");

// Normaliza un teléfono argentino al formato de WhatsApp (solo números):
// "261 692-9778" -> "5492616929778" | "0261 6929778" -> "5492616929778"
export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = "549" + d; // número local con característica
  if (d.length === 12 && d.startsWith("54") && !d.startsWith("549")) d = "549" + d.slice(2);
  return d;
}

// "5492616929778" -> "+54 9 261 692 9778" (aprox., solo para mostrar)
export function formatPhone(d: string): string {
  if (d.startsWith("549") && d.length === 13) return `+54 9 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
  return d ? `+${d}` : "";
}

export function isValidPhone(raw: string): boolean {
  const digits = normalizePhone(raw);
  return digits.length >= 8 && digits.length <= 15;
}

function totals(items: OrderItem[]) {
  return {
    total: items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
    trays: items.reduce((sum, i) => sum + i.quantity, 0),
  };
}

// Pedido hecho por un cliente desde la web: queda "pendiente" hasta que lo confirmes
export function createWebOrder(data: {
  customerName: string;
  phone: string;
  items: OrderItem[];
  deliveryText: string;
}) {
  return addDoc(ordersRef, {
    customerName: data.customerName.trim().slice(0, 80),
    phone: normalizePhone(data.phone),
    items: data.items,
    ...totals(data.items),
    deliveryText: data.deliveryText.slice(0, 80),
    status: "pendiente",
    source: "web",
    createdAt: serverTimestamp(),
  });
}

// Venta cargada a mano por el admin (ya cobrada)
export function createManualOrder(data: {
  customerName: string;
  phone: string;
  items: OrderItem[];
  date: Date;
  seller: Seller;
  commission: number;
}) {
  return addDoc(ordersRef, {
    customerName: data.customerName.trim().slice(0, 80),
    phone: normalizePhone(data.phone),
    items: data.items,
    ...totals(data.items),
    deliveryText: "",
    status: "confirmado",
    source: "manual",
    createdAt: Timestamp.fromDate(data.date),
    seller: data.seller,
    commission: data.seller === "cocinera" ? data.commission : 0,
    settled: false,
  });
}

export async function getOrders(): Promise<Order[]> {
  const snapshot = await getDocs(query(ordersRef, orderBy("createdAt", "desc")));
  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      customerName: data.customerName ?? "",
      phone: data.phone ?? "",
      items: data.items ?? [],
      total: Number(data.total) || 0,
      trays: Number(data.trays) || 0,
      deliveryText: data.deliveryText ?? "",
      status: data.status ?? "pendiente",
      source: data.source ?? "web",
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      seller: data.seller === "cocinera" ? "cocinera" : "titular",
      commission: Number(data.commission) || 0,
      settled: Boolean(data.settled),
    } as Order;
  });
}

export function updateOrderStatus(id: string, status: OrderStatus) {
  return updateDoc(doc(db, "orders", id), { status });
}

// Cambia quién vendió y recalcula la comisión guardada
export function updateOrderSeller(id: string, seller: Seller, commission: number) {
  return updateDoc(doc(db, "orders", id), { seller, commission: seller === "cocinera" ? commission : 0, settled: false });
}

export function setOrderSettled(id: string, settled: boolean) {
  return updateDoc(doc(db, "orders", id), { settled });
}

export function deleteOrder(id: string) {
  return deleteDoc(doc(db, "orders", id));
}

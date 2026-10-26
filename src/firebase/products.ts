import { collection, getDocs, addDoc, doc, deleteDoc, updateDoc, deleteField, increment, onSnapshot } from "firebase/firestore";
import { db } from "./config";
import type { Product } from "../types";

const productsRef = collection(db, "products");

// Obtener productos. Si falla, el error sube para que la pantalla muestre un aviso.
export async function getProducts(): Promise<Product[]> {
  const snapshot = await getDocs(productsRef);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Product);
}

// Escucha los productos en vivo: primero responde con lo guardado en el navegador
// (instantáneo) y después con los datos del servidor y cada cambio (stock, precios).
export function watchProducts(onChange: (products: Product[]) => void, onError?: (error: unknown) => void) {
  return onSnapshot(
    productsRef,
    (snapshot) => onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Product)),
    (error) => onError?.(error),
  );
}

export async function addProduct(product: Omit<Product, "id">): Promise<string> {
  const docRef = await addDoc(productsRef, product);
  return docRef.id;
}

// Modifica un producto existente. imageUrl: null = quitar la foto, undefined = no tocarla.
export async function updateProduct(
  id: string,
  data: Omit<Product, "id" | "imageUrl" | "stock"> & { imageUrl?: string | null; stock?: number | null },
): Promise<void> {
  const { imageUrl, stock, ...rest } = data;
  await updateDoc(doc(db, "products", id), {
    ...rest,
    ...(imageUrl === null ? { imageUrl: deleteField() } : imageUrl ? { imageUrl } : {}),
    ...(stock === null ? { stock: deleteField() } : typeof stock === "number" ? { stock } : {}),
  });
}

// Suma o resta stock de forma segura (aunque haya dos pantallas abiertas a la vez)
export async function adjustStock(id: string, delta: number): Promise<void> {
  await updateDoc(doc(db, "products", id), { stock: increment(delta) });
}

export async function deleteProduct(id: string): Promise<void> {
  await deleteDoc(doc(db, "products", id));
}

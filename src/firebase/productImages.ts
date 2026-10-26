// Fotos de productos guardadas aparte del producto, para que la lista de bandejas
// cargue al instante y las fotos lleguen después sin frenar nada.
import { collection, deleteDoc, deleteField, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./config";
import type { Product } from "../types";

const imagesRef = collection(db, "productImages");

export type ImageMap = Map<string, string>;

export function watchProductImages(onChange: (images: ImageMap) => void) {
  return onSnapshot(
    imagesRef,
    (snapshot) => onChange(new Map(snapshot.docs.map((d) => [d.id, String(d.data().data ?? "")]))),
    (error) => console.error("No se pudieron cargar las fotos:", error),
  );
}

// Foto a mostrar: la subida (si ya llegó) o la ruta de una imagen del proyecto
export function imageFor(p: Product, images: ImageMap): string | undefined {
  if (p.hasImage) return images.get(p.id ?? "") || undefined;
  return p.imageUrl || undefined;
}

// Guarda, cambia o quita la foto de un producto.
// image: texto "data:" (foto subida), ruta "/imagenes/..." o null para quitarla.
export async function setProductImage(id: string, image: string | null) {
  const productRef = doc(db, "products", id);
  if (image && image.startsWith("data:")) {
    await setDoc(doc(db, "productImages", id), { data: image });
    await updateDoc(productRef, { hasImage: true, imageUrl: deleteField() });
  } else if (image) {
    await updateDoc(productRef, { imageUrl: image, hasImage: deleteField() });
    await deleteDoc(doc(db, "productImages", id)).catch(() => {});
  } else {
    await updateDoc(productRef, { imageUrl: deleteField(), hasImage: deleteField() });
    await deleteDoc(doc(db, "productImages", id)).catch(() => {});
  }
}

// Pasa al nuevo formato las fotos que quedaron guardadas dentro del producto.
// Solo borra la foto vieja después de guardar la nueva con éxito.
export async function migrateInlineImages(products: Product[]) {
  for (const p of products) {
    if (!p.id || !p.imageUrl?.startsWith("data:")) continue;
    try {
      await setProductImage(p.id, p.imageUrl);
    } catch (error) {
      console.warn("No se pudo mover la foto de", p.name, "— revisá que estén publicadas las reglas de Firestore.", error);
      return; // si falla una (por ejemplo, faltan las reglas), no insistimos con las demás
    }
  }
}

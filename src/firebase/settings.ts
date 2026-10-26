import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./config";

// Documento único con la configuración visible para todos los clientes
const deliveryRef = doc(db, "settings", "delivery");

export async function getDeliveryText(): Promise<string | null> {
  try {
    const snap = await getDoc(deliveryRef);
    const text = snap.exists() ? snap.data().text : null;
    return typeof text === "string" && text.trim() ? text : null;
  } catch (error) {
    console.error("Error al leer el día de reparto:", error);
    return null;
  }
}

export async function saveDeliveryText(text: string): Promise<void> {
  await setDoc(deliveryRef, { text, updatedAt: new Date() });
}

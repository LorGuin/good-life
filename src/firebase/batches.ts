import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "./config";
import type { Batch, Supply } from "../types";

// Tandas de producción: privadas, solo las ve y modifica el admin
const batchesRef = collection(db, "batches");

export type BatchInput = Omit<Batch, "id">;

function toDoc(b: BatchInput) {
  return {
    date: Timestamp.fromDate(b.date),
    line: b.line,
    quantity: b.quantity,
    supplies: b.supplies,
    cost: b.cost,
    note: b.note,
  };
}

export async function getBatches(): Promise<Batch[]> {
  const snapshot = await getDocs(query(batchesRef, orderBy("date", "desc")));
  return snapshot.docs.map((d) => {
    const data = d.data();
    const supplies: Supply[] = Array.isArray(data.supplies)
      ? data.supplies.map((s: Partial<Supply>) => ({
          name: String(s.name ?? ""),
          amount: String(s.amount ?? ""),
          cost: Number(s.cost) || 0,
        }))
      : [];
    return {
      id: d.id,
      date: data.date?.toDate?.() ?? new Date(),
      line: String(data.line ?? ""),
      quantity: Number(data.quantity) || 0,
      supplies,
      cost: Number(data.cost) || 0,
      note: String(data.note ?? ""),
    };
  });
}

export function addBatch(b: BatchInput) {
  return addDoc(batchesRef, toDoc(b));
}

export function updateBatch(id: string, b: BatchInput) {
  return updateDoc(doc(db, "batches", id), toDoc(b));
}

export function deleteBatch(id: string) {
  return deleteDoc(doc(db, "batches", id));
}

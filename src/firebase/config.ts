import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, doc, deleteDoc } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Configuración leyendo desde el archivo .env
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const db = getFirestore(app);

// Tipo de dato TypeScript
export interface Product {
  id?: string;
  name: string;
  description: string;
  unitsPerTray: number;
  unitWeightGram: number;
  price: number;
  imageUrl?: string;
}

// Obtener productos desde Firestore
export async function getProducts(): Promise<Product[]> {
  try {
    const querySnapshot = await getDocs(collection(db, "products"));
    const products: Product[] = [];
    
    querySnapshot.forEach((doc) => {
      products.push({
        id: doc.id,
        ...doc.data()
      } as Product);
    });
    
    return products;
  } catch (error) {
    console.error("Error al obtener productos de Firestore:", error);
    return [];
  }
}

// Agregar un producto
export async function addProduct(product: Omit<Product, "id">): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, "products"), product);
    return docRef.id;
  } catch (error) {
    console.error("Error al agregar producto:", error);
    throw error;
  }
}

// Eliminar un producto
export async function deleteProduct(id: string): Promise<void> {
  try {
    const productRef = doc(db, "products", id);
    await deleteDoc(productRef);
    console.log("Producto eliminado correctamente de Firestore");
  } catch (error) {
    console.error("Error al eliminar el producto de Firestore:", error);
    throw error;
  }
}
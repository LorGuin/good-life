import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { auth } from "./config";

export function watchAuth(callback: (user: User | null) => void): void {
  onAuthStateChanged(auth, callback);
}

export async function login(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

// Traduce los códigos de error de Firebase a mensajes entendibles
export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":
      return "Email o contraseña incorrectos.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Esperá unos minutos y probá de nuevo.";
    case "auth/network-request-failed":
      return "Sin conexión. Revisá tu internet.";
    default:
      return "No se pudo iniciar sesión.";
  }
}

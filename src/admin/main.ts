// Página de administración (admin.html)
import "../styles/good-life.css";
import { watchProducts } from "../firebase/products";
import { migrateInlineImages, watchProductImages, type ImageMap } from "../firebase/productImages";
import { getDeliveryText } from "../firebase/settings";
import { watchAuth } from "../firebase/auth";
import { initAdmin } from "./panel";
import { BUSINESS } from "../config";
import type { Product } from "../types";

let products: Product[] = [];
let images: ImageMap = new Map();
let deliveryText = BUSINESS.defaultDeliveryText;

const admin = initAdmin({
  getProducts: () => products,
  getImages: () => images,
  reloadProducts: async () => {}, // los productos se actualizan solos (escucha en vivo)
  getDeliveryText: () => (deliveryText === BUSINESS.defaultDeliveryText ? "" : deliveryText),
  onDeliveryChange: (text) => (deliveryText = text),
  onProductDeleted: () => {}, // el carrito del cliente se limpia solo al recargar la tienda
});

// Productos y fotos en vivo: cualquier cambio se ve al instante, sin recargar
let migrated = false;
let isAdmin = false;
function maybeMigrate(fromServer: boolean) {
  if (migrated || !isAdmin || !fromServer) return;
  migrated = true;
  migrateInlineImages(products); // fotos viejas guardadas dentro del producto → formato nuevo
}

watchProducts(
  (list) => {
    products = list;
    admin.refresh();
    maybeMigrate(true);
  },
  (error) => console.error("Error al cargar productos:", error),
);
watchProductImages((map) => {
  images = map;
  admin.refresh();
});
watchAuth((user) => {
  isAdmin = user !== null;
  if (products.length) maybeMigrate(true);
});

getDeliveryText().then((text) => {
  deliveryText = text ?? BUSINESS.defaultDeliveryText;
  admin.setDelivery();
});

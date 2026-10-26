export interface Product {
  id?: string;
  name: string;
  description: string;
  unitsPerTray: number;
  unitWeightGram?: number; // opcional: en sorrentinos no se informa el peso
  price: number;
  imageUrl?: string;
  hidden?: boolean; // true = no se muestra en la tienda (sí en el panel)
  stock?: number; // bandejas disponibles; si no está, no se muestra ni se limita
  hasImage?: boolean; // la foto subida está guardada aparte, en productImages/{id}
}

export interface CartItem {
  product: Product;
  quantity: number; // Cantidad de BANDEJAS
}

export type OrderStatus = "pendiente" | "confirmado" | "cancelado";

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number; // bandejas
  unitPrice: number;
}

export interface Order {
  id: string;
  customerName: string;
  phone: string; // solo dígitos
  items: OrderItem[];
  total: number;
  trays: number;
  deliveryText: string;
  status: OrderStatus;
  source: "web" | "manual";
  createdAt: Date;
  seller: Seller; // quién hizo la venta
  commission: number; // comisión que se quedó la cocinera (0 si vendió el titular)
  settled: boolean; // la cocinera ya rindió el dinero
}

export type Seller = "titular" | "cocinera";

export interface Customer {
  phone: string;
  name: string;
  orders: number; // pedidos confirmados
  trays: number;
  spent: number;
  firstOrder: Date | null;
  lastOrder: Date | null;
  pending: number; // pedidos sin confirmar
}

// Producción: una tanda con los insumos que se usaron y lo que salió
export interface Supply {
  name: string;
  amount: string; // texto libre: "5 kg", "2 docenas", "1 bolsa"
  cost: number; // pesos
}

export interface Batch {
  id: string;
  date: Date;
  line: string; // id de PRODUCTION_LINES
  quantity: number; // bandejas o docenas producidas
  supplies: Supply[];
  cost: number; // suma de los insumos
  note: string;
}

import "./scss/app.scss";
import { getProducts, addProduct, deleteProduct } from "./firebase/config";
import type { Product } from "./firebase/config";

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD

const app = document.querySelector<HTMLDivElement>('#app')!;

const twitterBirdSvg = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z"></path>
  </svg>
`;

app.innerHTML = `
  <header class="header">
    <div class="header-top">
      <a href="/" id="logo-link" class="logo-container" title="Ir al inicio">
        ${twitterBirdSvg}
        <h1>Good Life</h1>
      </a>
      <button id="toggle-admin-btn" class="btn-admin-toggle">⚙️ Administrar</button>
    </div>

    <div class="header-info">
      <p>🌿 <strong>Empresa familiar</strong> dedicada a elaborar hamburguesas artesanales con materia prima de primera calidad.</p>
      <div class="delivery-badge">
        🚚 <strong>Próximo reparto:</strong> <span id="delivery-days-text">Sábado 15/08</span>
      </div>
    </div>
  </header>

  <!-- Panel de Administración Privado -->
  <div id="admin-panel" class="admin-panel hidden">
    <h3>⚙️ Configuración del Negocio</h3>
    <div class="config-section">
      <label for="delivery-date-input">Seleccionar Día de Próximo Reparto:</label>
      <div class="form-row">
        <input type="date" id="delivery-date-input" />
        <input type="text" id="delivery-text-input" placeholder="o texto personalizado (ej: Sábado 15/08)" />
      </div>
      <button id="save-delivery-btn" class="btn-save" style="margin-top: 0.5rem;">Guardar Día de Reparto</button>
    </div>

    <hr class="admin-divider" />

    <h3>Cargar Nuevo Producto</h3>
    <form id="add-product-form">
      <input type="text" id="p-name" placeholder="Nombre (ej: Hamburguesas Clásicas)" required />
      <textarea id="p-desc" placeholder="Descripción breve" required></textarea>
      
      <div class="form-row">
        <input type="number" id="p-price" placeholder="Precio ($)" required />
        <input type="number" id="p-units" placeholder="Unidades x Bandeja" value="6" required />
        <input type="number" id="p-grams" placeholder="Gramos c/u" value="150" required />
      </div>

      <input type="text" id="p-img" placeholder="Ruta imagen (ej: /imagenes/hamburguesa.jpg)" required />
      
      <div class="form-actions">
        <button type="submit" class="btn-save">Guardar Producto</button>
        <button type="button" id="close-admin-btn" class="btn-cancel">Cerrar</button>
      </div>
    </form>

    <hr class="admin-divider" />

    <h3>Gestión de Productos Cargados</h3>
    <div id="admin-product-list" class="admin-product-list">
      Cargando lista...
    </div>
  </div>

  <main>
    <div id="catalog">Cargando productos...</div>
  </main>
`;

let currentProducts: Product[] = [];

async function initCatalog() {
  const catalogEl = document.getElementById('catalog')!;
  try {
    currentProducts = await getProducts();
    
    if (currentProducts.length === 0) {
      catalogEl.innerHTML = '<p>No hay productos disponibles por el momento.</p>';
      renderAdminProductList();
      return;
    }

    catalogEl.innerHTML = currentProducts.map(product => `
      <div class="product-card">
        ${product.imageUrl ? `<img src="${product.imageUrl}" alt="${product.name}" class="product-img" />` : ''}
        <span class="badge">Bandeja x ${product.unitsPerTray} u. (${product.unitWeightGram}g c/u)</span>
        <h2>${product.name}</h2>
        <p>${product.description}</p>
        <p style="font-size: 1.4rem; font-weight: bold;">$${product.price} <small>/ bandeja</small></p>
        
        <div class="qty-container">
          <label>Bandejas:</label>
          <div class="qty-controls">
            <button class="qty-btn" onclick="changeQty('qty-${product.id}', -1)">-</button>
            <input type="number" id="qty-${product.id}" value="1" min="1" />
            <button class="qty-btn" onclick="changeQty('qty-${product.id}', 1)">+</button>
          </div>
        </div>

        <button class="btn-pay" onclick="handleOrder('${product.name}', ${product.price}, 'qty-${product.id}')">
          Pedir por WhatsApp / Transferir
        </button>
      </div>
    `).join('');

    renderAdminProductList();
  } catch (error) {
    console.error(error);
    catalogEl.innerHTML = '<p>Error al cargar el catálogo desde Firebase.</p>';
  }
}

(window as any).changeQty = (inputId: string, delta: number) => {
  const input = document.getElementById(inputId) as HTMLInputElement;
  if (input) {
    let currentVal = parseInt(input.value) || 1;
    currentVal += delta;
    if (currentVal < 1) currentVal = 1;
    input.value = currentVal.toString();
  }
};

function renderAdminProductList() {
  const adminListEl = document.getElementById('admin-product-list')!;
  if (currentProducts.length === 0) {
    adminListEl.innerHTML = '<p style="font-size:0.85rem; color:#666;">No hay productos para administrar.</p>';
    return;
  }

  adminListEl.innerHTML = currentProducts.map(p => `
    <div class="admin-item">
      <span><strong>${p.name}</strong> - $${p.price}</span>
      <button class="btn-delete-item" onclick="handleDelete('${p.id}', '${p.name}')">🗑️ Borrar</button>
    </div>
  `).join('');
}

const adminPanel = document.getElementById('admin-panel')!;
const toggleAdminBtn = document.getElementById('toggle-admin-btn')!;
const closeAdminBtn = document.getElementById('close-admin-btn')!;
const addProductForm = document.getElementById('add-product-form') as HTMLFormElement;
const logoLink = document.getElementById('logo-link')!;
const saveDeliveryBtn = document.getElementById('save-delivery-btn')!;
const deliveryDaysText = document.getElementById('delivery-days-text')!;
const deliveryDateInput = document.getElementById('delivery-date-input') as HTMLInputElement;
const deliveryTextInput = document.getElementById('delivery-text-input') as HTMLInputElement;

// Cargar fecha previa guardada
const savedDelivery = localStorage.getItem('goodlife_delivery_days');
if (savedDelivery) {
  deliveryDaysText.textContent = savedDelivery;
  deliveryTextInput.value = savedDelivery;
}

// Lógica para formatear e ingresar el día de reparto
saveDeliveryBtn.addEventListener('click', () => {
  let text = deliveryTextInput.value.trim();

  // Si eligió una fecha del calendario, la formateamos
  if (deliveryDateInput.value) {
    const [year, month, day] = deliveryDateInput.value.split('-');
    const dateObj = new Date(Number(year), Number(month) - 1, Number(day));
    const opciones: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
    text = dateObj.toLocaleDateString('es-AR', opciones);
    text = text.charAt(0).toUpperCase() + text.slice(1); // Capitalizar día
  }

  if (text) {
    deliveryDaysText.textContent = text;
    localStorage.setItem('goodlife_delivery_days', text);
    alert(`¡Día de reparto actualizado a: ${text}!`);
  } else {
    alert('Por favor selecciona una fecha o escribe un texto.');
  }
});

logoLink.addEventListener('click', (e) => {
  e.preventDefault();
  window.location.href = '/';
});

toggleAdminBtn.addEventListener('click', () => {
  if (adminPanel.classList.contains('hidden')) {
    const enteredKey = prompt('🔒 Ingresá la clave de administrador:');
    if (enteredKey === ADMIN_PASSWORD) {
      adminPanel.classList.remove('hidden');
    } else if (enteredKey !== null) {
      alert('❌ Clave incorrecta.');
    }
  } else {
    adminPanel.classList.add('hidden');
  }
});

closeAdminBtn.addEventListener('click', () => {
  adminPanel.classList.add('hidden');
});

addProductForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const newProduct: Omit<Product, "id"> = {
    name: (document.getElementById('p-name') as HTMLInputElement).value,
    description: (document.getElementById('p-desc') as HTMLTextAreaElement).value,
    price: Number((document.getElementById('p-price') as HTMLInputElement).value),
    unitsPerTray: Number((document.getElementById('p-units') as HTMLInputElement).value),
    unitWeightGram: Number((document.getElementById('p-grams') as HTMLInputElement).value),
    imageUrl: (document.getElementById('p-img') as HTMLInputElement).value
  };

  try {
    await addProduct(newProduct);
    alert('¡Producto cargado con éxito!');
    addProductForm.reset();
    initCatalog();
  } catch (error) {
    alert('Error al guardar el producto.');
    console.error(error);
  }
});

(window as any).handleDelete = async (productId: string, productName: string) => {
  if (confirm(`¿Estás seguro de que querés borrar "${productName}" de Firebase?`)) {
    try {
      await deleteProduct(productId);
      alert('Producto eliminado correctamente.');
      initCatalog();
    } catch (error) {
      alert('Error al eliminar el producto.');
      console.error(error);
    }
  }
};

(window as any).handleOrder = (productName: string, unitPrice: number, inputId: string) => {
  const qtyInput = document.getElementById(inputId) as HTMLInputElement;
  const quantity = parseInt(qtyInput.value) || 1;
  const total = quantity * unitPrice;
  const deliveryDays = deliveryDaysText.textContent;
  
  const aliasMP = "cristianminni"; // Alias de Mercado Pago
  const telefono = "5492616929778"; // Tu número de teléfono real
  
  const mensaje = `¡Hola Good Life! 🍔%0AQuiero pedir *${quantity} bandeja(s)* de *${productName}*.%0ATotal: *$${total}*%0A(Reparto agendado para: *${deliveryDays}*)%0A%0AData de pago:%0AAlias Mercado Pago: *${aliasMP}*%0A(Te adjunto el comprobante por acá).`;
  
  window.open(`https://wa.me/${telefono}?text=${mensaje}`, '_blank');
};

initCatalog();
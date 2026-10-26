import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";

// Dirección pública del sitio para la vista previa de WhatsApp/redes.
// Netlify la define sola al compilar (variable URL); en tu compu queda vacía.
const siteUrl = (process.env.URL ?? process.env.VITE_SITE_URL ?? "").replace(/\/$/, "");

function siteUrlPlugin(): Plugin {
  return {
    name: "site-url",
    transformIndexHtml: (html) => html.replaceAll("__SITE_URL__", siteUrl),
  };
}

// Dos páginas: la tienda (index.html) y la administración (admin.html)
export default defineConfig({
  plugins: [siteUrlPlugin()],
  build: {
    // Firebase (base de datos + memoria del navegador) pesa ~630 KB sin comprimir y ~186 KB
    // comprimido; el navegador lo guarda después de la primera visita.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        admin: resolve(import.meta.dirname, "admin.html"),
      },
    },
  },
});

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
    rolldownOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        admin: resolve(__dirname, "admin.html"),
      },
    },
  },
});

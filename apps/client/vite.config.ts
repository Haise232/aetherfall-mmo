import { defineConfig } from "vite";

// El navegador habla con el servidor de juego por el mismo puerto que la página (/ws),
// así solo hay que abrir un puerto en el cortafuegos.
export default defineConfig({
  server: {
    host: true,
    proxy: { "/ws": { target: "ws://localhost:8787", ws: true, rewriteWsOrigin: true } },
  },
});

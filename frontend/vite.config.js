import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** En local : 127.0.0.1:4000. Dans docker-compose.dev : définir VITE_PROXY_API=http://api:4000 sur le service web. */
const apiProxyTarget =
  process.env.VITE_PROXY_API || "http://127.0.0.1:4000";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.js"],
  },
  optimizeDeps: {
    include: ["maplibre-gl"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: apiProxyTarget, changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": { target: apiProxyTarget, changeOrigin: true },
    },
  },
});

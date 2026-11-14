import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", hmr: { port: Number(process.env.HMR_PORT || 24679) } },
  build: { chunkSizeWarningLimit: 900 },
});

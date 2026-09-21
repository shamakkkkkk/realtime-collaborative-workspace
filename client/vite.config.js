import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': API,
      '/healthz': API,
      // WebSocket collaboration channel. Do NOT set changeOrigin: the server
      // compares the Origin header with the Host header.
      '/ws': { target: API.replace(/^http/, 'ws'), ws: true },
    },
  },
  build: { chunkSizeWarningLimit: 900 },
});

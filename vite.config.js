import { defineConfig } from 'vite';

// /api/* goes to the recognition server (server/index.js). `allowedHosts` lets the dev server
// answer when it is exposed through Tailscale (`tailscale serve`), whose hostnames end in .ts.net.
export default defineConfig({
  server: {
    allowedHosts: ['.ts.net'],
    proxy: { '/api': { target: process.env.API_ORIGIN ?? 'http://127.0.0.1:8787', changeOrigin: true } },
  },
  preview: {
    allowedHosts: ['.ts.net'],
    proxy: { '/api': { target: process.env.API_ORIGIN ?? 'http://127.0.0.1:8787', changeOrigin: true } },
  },
});

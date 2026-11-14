import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// `allowedHosts` lets the dev server answer when it is exposed through Tailscale
// (`tailscale serve`), whose hostnames end in .ts.net.
export default defineConfig({
  server: { allowedHosts: ['.ts.net'] },
  preview: { allowedHosts: ['.ts.net'] },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        faceDose: fileURLToPath(new URL('./face-dose.html', import.meta.url)),
      },
    },
  },
});

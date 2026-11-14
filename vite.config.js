import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        faceDose: fileURLToPath(new URL('./face-dose.html', import.meta.url)),
      },
    },
  },
});

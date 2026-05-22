import { defineConfig } from 'vite';

// `base` doit correspondre au nom du dépôt pour GitHub Pages (darkein/esp32-2dgame).
export default defineConfig({
  base: process.env.PAGES_BASE ?? '/esp32-2dgame/',
  worker: { format: 'es' },
  build: { target: 'es2022', outDir: 'dist' },
});

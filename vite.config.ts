import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Le renderer est servi par Vite en développement et compilé dans dist/renderer.
// La configuration reste indépendante du processus principal Electron.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
  },
});

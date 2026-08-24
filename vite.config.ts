import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/client',
  publicDir: resolve(__dirname, 'assets'),
  resolve: {
    alias: { '@core': resolve(__dirname, 'src/core') },
  },
  server: {
    port: 3100,
    // Como en ne-fan: el HMR mata la partida en curso. Recarga manual.
    hmr: false,
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});

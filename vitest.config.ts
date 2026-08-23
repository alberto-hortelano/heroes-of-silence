import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Config propia: `vite.config.ts` tiene root en src/client (el cliente), y
// vitest heredaría esa raíz y no encontraría ni los tests ni el core.
export default defineConfig({
  resolve: {
    alias: { '@core': resolve(__dirname, 'src/core') },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Las partidas completas IA contra IA son tests de integración largos.
    testTimeout: 60_000,
  },
});

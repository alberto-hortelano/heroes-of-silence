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
    // Las partidas completas IA contra IA son tests de integración largos. En la
    // orden lenta (`HEROES_LENTO=1`), tres minutos: recorre 40-1000 mapas que
    // desde #226 son de 42×42 (×1,5 de trabajo), y con la máquina compartida
    // cargada (carga 33, 09-10-2026) tres de 1-40 pasaron del minuto que en
    // reposo hacen en 15-47 s. El bucle rápido sigue en uno.
    testTimeout: process.env.HEROES_LENTO === '1' ? 180_000 : 60_000,
    // Una vuelta al bucle de eventos entre test y test: sin ella, un fichero
    // de tests síncronos que pasa de 60 s pierde la respuesta del RPC de
    // vitest y la orden sale 1 con todo en verde (#194, `test/ceder.ts`).
    setupFiles: ['test/ceder.ts'],
  },
});

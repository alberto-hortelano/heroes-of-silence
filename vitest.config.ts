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
    // La máquina es compartida (31 GB). Una pasada normal, con 16 procesos, no pasa de 6,3 GB y
    // ningún proceso de 1 GB (25-10-2026); pero un test desbocado sube cada proceso hasta el
    // tope de V8 (~4 GB aquí) y varios a la vez llenaron la RAM: earlyoom mató la app de Claude y
    // Chrome. Con 2 GB por proceso y 8 a la vez, lo peor son 16 GB, y el desbocado muere solo en
    // su proceso, con «heap out of memory» en el informe.
    maxWorkers: 8,
    // La orden lenta no se ha medido con el tope: va con el de V8, como antes.
    poolOptions: {
      forks: {
        execArgv: process.env.HEROES_LENTO === '1' ? [] : ['--max-old-space-size=2048'],
      },
    },
  },
});

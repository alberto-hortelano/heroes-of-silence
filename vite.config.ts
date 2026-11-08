import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { puertoEspectadores } from './src/server/entorno.js';
import { RAIZ } from './tools/comun/raiz.js';
import { arena } from './tools/vite/arena.js';
import { marcas } from './tools/vite/marcas.js';
import { mundos } from './tools/vite/mundos.js';
import { npcs } from './tools/vite/npcs.js';
import { publico } from './tools/vite/publico.js';
import { sinDesarrollo } from './tools/vite/sin-desarrollo.js';

export default defineConfig(({ command }) => ({
  root: 'src/client',
  plugins: [arena(RAIZ), npcs(RAIZ), marcas(RAIZ), mundos(RAIZ), sinDesarrollo(), publico(RAIZ)],
  publicDir: resolve(RAIZ, 'assets'),
  resolve: {
    alias: { '@core': resolve(RAIZ, 'src/core') },
  },
  define: {
    // El puerto del canal de espectadores, de UNA fuente: `src/server/entorno.ts`,
    // que es quien lee `HEROES_SPECTATOR_PORT` y quien acepta el `0` de #61. Un
    // `ws://localhost:9880` escrito a mano en la página contradiría esa decisión,
    // y el cliente no puede leer `process.env` — hay un invariante que lo vigila.
    //
    // Se congela al arrancar vite, así que cambiar la variable sin reiniciar deja
    // la página conectando al sitio equivocado: por eso `espectador/main.ts`
    // escribe el puerto que va a usar ANTES de conectar, y el desajuste se lee.
    PUERTO_ESPECTADORES: JSON.stringify(puertoEspectadores()),
    // El modo «marcar fallo» y lo que venga: solo con `vite` (serve), nunca en
    // `vite build`. Ver `sinDesarrollo`.
    HERRAMIENTAS_DE_DESARROLLO: JSON.stringify(command === 'serve'),
  },
  server: {
    port: 3100,
    // Como en ne-fan: el HMR mata la partida en curso. Recarga manual.
    hmr: false,
  },
  build: {
    outDir: resolve(RAIZ, 'dist'),
    emptyOutDir: true,
    copyPublicDir: false,
    rollupOptions: {
      // Las TRES páginas, declaradas. Sin esto vite construye solo `index.html`
      // —la raíz— y **omite la otra en silencio**, con CI en verde: exactamente
      // la clase de fallo de `pnpm server`, que salía 0 sin arrancar nada. Por
      // eso el criterio de aceptación no es que `pnpm build` pase, es
      // `ls dist/espectador/index.html`.
      input: {
        juego: resolve(RAIZ, 'src/client/index.html'),
        espectador: resolve(RAIZ, 'src/client/espectador/index.html'),
        arena: resolve(RAIZ, 'src/client/arena/index.html'),
      },
    },
  },
}));

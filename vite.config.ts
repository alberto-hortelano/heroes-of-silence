import type { IncomingMessage } from 'node:http';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { puertoEspectadores } from './src/server/entorno.js';
import {
  escribirBorrador,
  hojasDeArena,
  leerBorrador,
  RUTA_DEL_BORRADOR,
} from './tools/arena/borrador.js';

/** Lo más que se acepta en un guardado: medio centenar de unidades caben de sobra. */
const CUERPO_MAXIMO = 1_000_000;

async function leerCuerpo(req: IncomingMessage): Promise<unknown> {
  let texto = '';
  for await (const trozo of req) {
    texto += String(trozo);
    if (texto.length > CUERPO_MAXIMO) {
      throw new Error(`el borrador pasa de ${CUERPO_MAXIMO} caracteres: no es un borrador`);
    }
  }
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    throw new Error('lo que ha llegado para guardar no es JSON');
  }
}

/**
 * La arena (`/arena/`): la lista de hojas y el borrador de cifras.
 *
 * El guardado existe **solo en `pnpm dev`** (`configureServer`): un navegador no
 * puede escribir en el repo, y en `vite build` no hay quien escriba. El build
 * saca la lista de hojas y un `__arena/unidades` que dice `guardado: false`, así
 * que la arena construida monta y pelea, y la página lee un campo explícito en
 * vez de deducir del tipo de una respuesta si hay servidor detrás.
 */
function arena(): Plugin {
  const raiz = __dirname;
  /**
   * La lista de hojas, leída una vez: son decenas de `dN/atlas.json` síncronos,
   * y en cada recarga de la página bloqueaban el bucle de vite. Se olvida cuando cambia
   * algo bajo `assets/unidades/`, que es cuando el taller publica una hoja.
   */
  let hojas: string | null = null;
  const lista = (): string => {
    hojas ??= JSON.stringify(hojasDeArena(raiz));
    return hojas;
  };
  return {
    name: 'heroes-arena',
    configureServer(server) {
      const unidades = resolve(raiz, 'assets/unidades');
      server.watcher.add(unidades);
      server.watcher.on('all', (_evento, ruta) => {
        if (ruta.startsWith(unidades)) hojas = null;
      });
      server.middlewares.use('/__arena/hojas', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(lista());
      });
      server.middlewares.use('/__arena/unidades', (req, res) => {
        const responder = (estado: number, cuerpo: unknown): void => {
          res.statusCode = estado;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(cuerpo));
        };
        if (req.method === 'GET') {
          // Siempre 200: una unidad que no valida va con su motivo en
          // `invalidas`, y un archivo que no se puede leer, en `ilegible`. Un 500
          // dejaba un error en la consola por algo que la página sí explica, y
          // `pnpm capturas` no podía ensayarlo (M13 de QA).
          try {
            const leido = leerBorrador(raiz);
            responder(200, {
              guardado: true,
              ruta: RUTA_DEL_BORRADOR,
              unidades: leido.unidades,
              invalidas: leido.invalidas.map(({ id, motivo }) => ({ id, motivo })),
            });
          } catch (err) {
            responder(200, {
              guardado: true,
              ruta: RUTA_DEL_BORRADOR,
              unidades: [],
              invalidas: [],
              ilegible: err instanceof Error ? err.message : String(err),
            });
          }
          return;
        }
        if (req.method !== 'POST') {
          responder(405, {
            error: `el borrador se lee con GET y se guarda con POST, no con ${req.method}`,
          });
          return;
        }
        leerCuerpo(req)
          .then((cuerpo) => {
            const hecho = escribirBorrador(raiz, cuerpo);
            responder(200, { ruta: RUTA_DEL_BORRADOR, ...hecho });
          })
          .catch((err: unknown) => {
            // Lo que no valida no se escribe: 400 con la frase de la regla.
            responder(400, { error: err instanceof Error ? err.message : String(err) });
          });
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '__arena/hojas', source: lista() });
      this.emitFile({
        type: 'asset',
        fileName: '__arena/unidades',
        source: JSON.stringify({ guardado: false }),
      });
    },
  };
}

export default defineConfig({
  root: 'src/client',
  plugins: [arena()],
  publicDir: resolve(__dirname, 'assets'),
  resolve: {
    alias: { '@core': resolve(__dirname, 'src/core') },
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
  },
  server: {
    port: 3100,
    // Como en ne-fan: el HMR mata la partida en curso. Recarga manual.
    hmr: false,
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      // Las TRES páginas, declaradas. Sin esto vite construye solo `index.html`
      // —la raíz— y **omite la otra en silencio**, con CI en verde: exactamente
      // la clase de fallo de `pnpm server`, que salía 0 sin arrancar nada. Por
      // eso el criterio de aceptación no es que `pnpm build` pase, es
      // `ls dist/espectador/index.html`.
      input: {
        juego: resolve(__dirname, 'src/client/index.html'),
        espectador: resolve(__dirname, 'src/client/espectador/index.html'),
        arena: resolve(__dirname, 'src/client/arena/index.html'),
      },
    },
  },
});

import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { puertoEspectadores } from './src/server/entorno.js';
import {
  escribirBorrador,
  escribirMurallas,
  hojasDeArena,
  leerBorrador,
  leerMurallas,
  RUTA_DE_MURALLAS,
  RUTA_DEL_BORRADOR,
} from './tools/arena/borrador.js';
import { copiarPublico } from './tools/build/publico.js';

/** Lo más que se acepta en un guardado: medio centenar de unidades caben de sobra. */
const CUERPO_MAXIMO = 1_000_000;

async function leerCuerpo(
  req: IncomingMessage,
  maximo = CUERPO_MAXIMO,
  que = 'el borrador',
): Promise<unknown> {
  let texto = '';
  for await (const trozo of req) {
    texto += String(trozo);
    if (texto.length > maximo) {
      throw new Error(`${que} pasa de ${maximo} caracteres`);
    }
  }
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    throw new Error('lo que ha llegado para guardar no es JSON');
  }
}

/**
 * Un borrador de la arena por HTTP: GET lo lee y POST lo guarda entero. Uno
 * para las cifras y otro para las murallas, con las mismas respuestas: copiado
 * dos veces, el 405 y el 400 de uno acabarían diciendo otra cosa que el otro.
 */
function servirBorrador(b: {
  readonly ruta: string;
  readonly leer: () => Record<string, unknown>;
  readonly vacio: Record<string, unknown>;
  readonly escribir: (cuerpo: unknown) => Record<string, unknown>;
}): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const responder = (estado: number, cuerpo: unknown): void => {
      res.statusCode = estado;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(cuerpo));
    };
    if (req.method === 'GET') {
      // Siempre 200: lo que no valida va con su motivo en `invalidas`, y un
      // archivo que no se puede leer, en `ilegible`. Un 500 dejaba un error en
      // la consola por algo que la página sí explica, y `pnpm capturas` no
      // podía ensayarlo (M13 de QA).
      try {
        responder(200, { guardado: true, ruta: b.ruta, ...b.leer() });
      } catch (err) {
        responder(200, {
          guardado: true,
          ruta: b.ruta,
          ...b.vacio,
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
      .then((cuerpo) => responder(200, { ruta: b.ruta, ...b.escribir(cuerpo) }))
      .catch((err: unknown) => {
        // Lo que no valida no se escribe: 400 con la frase de la regla.
        responder(400, { error: err instanceof Error ? err.message : String(err) });
      });
  };
}

/**
 * La arena (`/arena/`): la lista de hojas y los borradores de cifras con sus
 * piezas de equipo, y de murallas.
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
   *
   * Una unidad con su arte a medias —el taller generándola— va en la lista
   * como incompleta, con su motivo, y se avisa al leerla (#140). En `vite build`
   * también: **avisa y no falla**. Fallar tumbaba el build de todo por una
   * unidad en obras, y quitarla de la lista la escondería; así la arena
   * construida dice lo mismo que `pnpm arena`: está, a medias, y no se monta.
   */
  let hojas: string | null = null;
  const lista = (avisar: (aviso: string) => void): string => {
    if (hojas === null) {
      const leidas = hojasDeArena(raiz);
      for (const h of leidas)
        if (h.incompleta !== null) avisar(`[arena] se lista sin montarla: ${h.incompleta}`);
      hojas = JSON.stringify(leidas);
    }
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
        res.end(lista((aviso) => server.config.logger.warn(aviso)));
      });
      server.middlewares.use(
        '/__arena/unidades',
        servirBorrador({
          ruta: RUTA_DEL_BORRADOR,
          leer: () => {
            const leido = leerBorrador(raiz);
            return {
              unidades: leido.unidades,
              invalidas: leido.invalidas.map(({ id, motivo }) => ({ id, motivo })),
              // Lo que hubo que decir al leer lo de antes: primero las unidades que
              // se retiran, que «Guardar» pierde, y luego lo convertido.
              seRetiran: leido.seRetiran,
              avisos: leido.avisos,
              // Y las piezas de la arena (vista «Editar equipo»), que el juego no lee:
              // van con las unidades porque se guardan con ellas, en una operación.
              piezas: leido.piezas,
              piezasInvalidas: leido.piezasInvalidas.map(({ clave, motivo }) => ({
                id: clave,
                motivo,
              })),
              ...(leido.equipoIlegible === undefined
                ? {}
                : { equipoIlegible: leido.equipoIlegible }),
            };
          },
          vacio: {
            unidades: [],
            invalidas: [],
            seRetiran: [],
            avisos: [],
            piezas: [],
            piezasInvalidas: [],
          },
          escribir: (cuerpo) => escribirBorrador(raiz, cuerpo),
        }),
      );
      server.middlewares.use(
        '/__arena/murallas',
        servirBorrador({
          ruta: RUTA_DE_MURALLAS,
          leer: () => {
            const leido = leerMurallas(raiz);
            return {
              formas: leido.formas,
              invalidas: leido.invalidas.map(({ nombre, motivo }) => ({ nombre, motivo })),
            };
          },
          vacio: { formas: [], invalidas: [] },
          escribir: (cuerpo) => escribirMurallas(raiz, cuerpo),
        }),
      );
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '__arena/hojas',
        source: lista((aviso) => this.warn(aviso)),
      });
      for (const fileName of ['__arena/unidades', '__arena/murallas']) {
        this.emitFile({ type: 'asset', fileName, source: JSON.stringify({ guardado: false }) });
      }
    },
  };
}

/**
 * Lo más que se acepta de una marca: el recorte de 9×9 casillas a 110 px y
 * densidad 2 es un PNG de unos 2000×2000, y en base64 cabe holgado.
 */
const MARCA_MAXIMA = 25_000_000;

/**
 * Las marcas de fallo del mapa (`src/client/desarrollo/marcas.ts`): `POST
 * /__marcas` guarda una y `GET /__marcas/<id>` la devuelve para reproducirla.
 * Escriben en `docs/revision/marcas/` por `tools/marcas/almacen.ts`.
 *
 * `apply: 'serve'`: en `vite build` este plugin no existe, y el cliente no
 * llega a pedirlo porque su módulo no se emite (`sinDesarrollo` lo comprueba).
 */
function marcas(): Plugin {
  const raiz = __dirname;
  return {
    name: 'heroes-marcas',
    apply: 'serve',
    configureServer(server) {
      // El almacén lo carga Vite y no un import de arriba: su esquema trae el
      // escenógrafo, que importa `@core/…`, y eso lo resuelve el alias de Vite,
      // no Node al cargar esta configuración (rompía `vite build`).
      const cargar = async () => ({
        ...((await server.ssrLoadModule(
          resolve(raiz, 'tools/marcas/almacen.ts'),
        )) as typeof import('./tools/marcas/almacen.js')),
        ...((await server.ssrLoadModule(
          resolve(raiz, 'src/client/desarrollo/esquema.ts'),
        )) as typeof import('./src/client/desarrollo/esquema.js')),
      });
      const atender = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        const { guardarMarca, leerMarca, motivoDe } = await cargar();
        const responder = (estado: number, cuerpo: unknown): void => {
          res.statusCode = estado;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(cuerpo));
        };
        // `use('/__marcas')` deja en `req.url` lo que va detrás: `/` o `/<id>`.
        const id = decodeURIComponent((req.url ?? '/').split('?')[0]?.slice(1) ?? '');
        if (req.method === 'GET' && id !== '') {
          try {
            responder(200, leerMarca(raiz, id));
          } catch (err) {
            responder(404, { error: motivoDe(err) });
          }
          return;
        }
        if (req.method !== 'POST' || id !== '') {
          responder(405, {
            error: `una marca se guarda con POST /__marcas y se lee con GET /__marcas/<id>, no con ${req.method} ${req.url}`,
          });
          return;
        }
        try {
          responder(200, guardarMarca(raiz, await leerCuerpo(req, MARCA_MAXIMA, 'la marca')));
        } catch (err) {
          // Lo que no valida no se escribe: 400 con la frase del esquema.
          responder(400, { error: motivoDe(err) });
        }
      };
      // Si el almacén no carga, el error va a Vite, que responde 500 y lo escribe.
      server.middlewares.use('/__marcas', (req, res, next) => {
        atender(req, res).catch(next);
      });
    },
  };
}

/**
 * Que nada de las herramientas de desarrollo llegue a `dist/`: ni el módulo de
 * `desarrollo/` ni la ruta `/__marcas`. Las aparta `HERRAMIENTAS_DE_DESARROLLO`
 * = `false`, que deja su `import()` en una rama muerta; si un día Rollup lo
 * conserva o alguien lo importa sin la guarda, el build se rompe aquí y no se
 * publica una página que escribe en disco.
 */
function sinDesarrollo(): Plugin {
  return {
    name: 'heroes-sin-desarrollo',
    apply: 'build',
    generateBundle(_opciones, bundle) {
      for (const [nombre, trozo] of Object.entries(bundle)) {
        const texto =
          trozo.type === 'chunk'
            ? `${trozo.code}\n${trozo.moduleIds.join('\n')}`
            : typeof trozo.source === 'string'
              ? trozo.source
              : '';
        for (const huella of ['__marcas', 'client/desarrollo/', 'HERRAMIENTAS_DE_DESARROLLO'])
          if (texto.includes(huella))
            this.error(
              `el build lleva herramientas de desarrollo: «${huella}» en ${nombre}. Solo pueden entrar con un import() detrás de HERRAMIENTAS_DE_DESARROLLO (src/client/main.ts)`,
            );
      }
    },
  };
}

/**
 * La carpeta pública en `dist/`, sin lo que solo lee el taller (#137): vite no
 * sabe filtrarla, así que el build no la copia (`copyPublicDir: false`) y la
 * copia esto, con `seCopiaAlBuild`. En `pnpm dev` se sirve entera.
 */
function publico(): Plugin {
  const origen = resolve(__dirname, 'assets');
  return {
    name: 'heroes-publico',
    apply: 'build',
    writeBundle(opciones) {
      if (opciones.dir === undefined) this.error('el build no dice dónde escribe');
      copiarPublico(origen, opciones.dir);
    },
  };
}

export default defineConfig(({ command }) => ({
  root: 'src/client',
  plugins: [arena(), marcas(), sinDesarrollo(), publico()],
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
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    copyPublicDir: false,
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
}));

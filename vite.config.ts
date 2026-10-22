import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { RUTA_DE_MURALLAS } from './src/core/arena-murallas.js';
import { RUTA_DEL_CATALOGO_DE_EQUIPO } from './src/core/data.js';
import { RUTA_DEL_CATALOGO_DE_UNIDADES } from './src/core/unidad.js';
import { puertoEspectadores } from './src/server/entorno.js';
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
    // Con lo que se esperaba: «el pedido no es JSON» no es «para guardar» (M5).
    throw new Error(`${que} no es JSON`);
  }
}

/** Responde `cuerpo` en JSON con `estado`: lo comparten todas las rutas de desarrollo. */
function responder(res: ServerResponse, estado: number, cuerpo: unknown): void {
  res.statusCode = estado;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(cuerpo));
}

/** La frase de un fallo, para la respuesta. */
const motivoDe = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** El lado de disco de la arena (`tools/arena/borrador.ts`), que esto carga a demanda. */
type Borrador = typeof import('./tools/arena/borrador.js');

/**
 * Un borrador de la arena por HTTP: GET lo lee y POST lo guarda entero. Uno
 * para las cifras y otro para las murallas, con las mismas respuestas: copiado
 * dos veces, el 405 y el 400 de uno acabarían diciendo otra cosa que el otro.
 */
function servirBorrador(b: {
  readonly ruta: string;
  readonly leer: () => Promise<Record<string, unknown>>;
  readonly vacio: Record<string, unknown>;
  readonly escribir: (cuerpo: unknown) => Promise<Record<string, unknown>>;
}): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    if (req.method === 'GET') {
      // Siempre 200: lo que no valida va con su motivo en `invalidas`, y un
      // archivo que no se puede leer, en `ilegible`. Un 500 dejaba un error en
      // la consola por algo que la página sí explica, y `pnpm capturas` no
      // podía ensayarlo (M13 de QA).
      b.leer()
        .then((leido) => responder(res, 200, { guardado: true, ruta: b.ruta, ...leido }))
        .catch((err: unknown) =>
          responder(res, 200, {
            guardado: true,
            ruta: b.ruta,
            ...b.vacio,
            ilegible: motivoDe(err),
          }),
        );
      return;
    }
    if (req.method !== 'POST') {
      responder(res, 405, {
        error: `el borrador se lee con GET y se guarda con POST, no con ${req.method}`,
      });
      return;
    }
    leerCuerpo(req)
      .then(async (cuerpo) => responder(res, 200, { ruta: b.ruta, ...(await b.escribir(cuerpo)) }))
      .catch((err: unknown) => {
        // Lo que no valida no se escribe: 400 con la frase de la regla.
        responder(res, 400, { error: motivoDe(err) });
      });
  };
}

/**
 * La arena (`/arena/`): la lista de hojas, los catálogos de unidades y de equipo,
 * y el borrador de murallas.
 *
 * El guardado existe **solo en `pnpm dev`** (`configureServer`): un navegador no
 * puede escribir en el repo, y en `vite build` no hay quien escriba. El build
 * saca la lista de hojas y un `__arena/unidades` que dice `guardado: false`, así
 * que la página lee un campo explícito en vez de deducir del tipo de una
 * respuesta si hay servidor detrás; las unidades, la arena construida las lee
 * del catálogo del núcleo (`core/catalogo.ts`), que ya va en el bundle.
 *
 * **«Guardar» no recarga la página**: `data/equipo.json` lo importa el núcleo, así
 * que está en el grafo de módulos de la arena y de la partida, y vite recargaba la
 * página entera al reescribirlo, con la pelea a medias (y la partida de otra
 * pestaña con ella). Lo que acaba de escribir la arena no dispara recarga
 * (`handleHotUpdate`): se recuerda **el texto** que escribió cada fichero, y el
 * cambio cuyo fichero dice eso se calla (por contenido, no por reloj: con una
 * ventana de tiempo, una edición a mano dentro de ella no recargaba). El módulo sí
 * queda invalidado, así que la siguiente carga de la página lee el nuevo. Lo
 * cambiado a mano en esos ficheros recarga como siempre.
 *
 * **El lado de disco se carga a demanda** (`borrador`): importa el núcleo, y el
 * núcleo valida `data/unidades.json` al cargarse. Importado aquí arriba, una
 * unidad rota a mano tumbaba esta configuración y `pnpm dev` no arrancaba, ni para
 * que la página dijese por qué (`arranque.ts`; H5 de QA, 19-10-2026). En
 * `pnpm dev` lo carga vite (`ssrLoadModule`, como las marcas): un fallo se vuelve a
 * intentar en la siguiente petición, ya con el fichero arreglado.
 */
function arena(): Plugin {
  const raiz = __dirname;
  /** El lado de disco: en el build, con un `import()`; en `pnpm dev`, por vite. */
  let borrador = (): Promise<Borrador> => import('./tools/arena/borrador.js');
  /** Lo que escribió «Guardar» en cada fichero, por su ruta absoluta. */
  const escritoAlGuardar = new Map<string, string>();
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
  const lista = async (avisar: (aviso: string) => void): Promise<string> => {
    if (hojas === null) {
      const leidas = (await borrador()).hojasDelTaller(raiz);
      for (const h of leidas)
        if (h.incompleta !== null) avisar(`[arena] se lista sin montarla: ${h.incompleta}`);
      hojas = JSON.stringify(leidas);
    }
    return hojas;
  };
  return {
    name: 'heroes-arena',
    configureServer(server) {
      borrador = async () =>
        (await server.ssrLoadModule(resolve(raiz, 'tools/arena/borrador.ts'))) as Borrador;
      const unidades = resolve(raiz, 'assets/unidades');
      server.watcher.add(unidades);
      server.watcher.on('all', (_evento, ruta) => {
        if (ruta.startsWith(unidades)) hojas = null;
      });
      // Si no carga, el error va a vite, que responde 500 y lo escribe.
      server.middlewares.use('/__arena/hojas', (_req, res, next) => {
        lista((aviso) => server.config.logger.warn(aviso))
          .then((texto) => {
            res.setHeader('content-type', 'application/json');
            res.end(texto);
          })
          .catch(next);
      });
      server.middlewares.use(
        '/__arena/unidades',
        servirBorrador({
          ruta: RUTA_DEL_CATALOGO_DE_UNIDADES,
          leer: async () => {
            const leido = (await borrador()).leerCatalogo(raiz);
            return {
              unidades: leido.unidades,
              // Y el catálogo de equipo (vista «Editar equipo»): va con las unidades
              // porque se guarda con ellas, en una operación.
              piezas: leido.piezas,
            };
          },
          vacio: { unidades: [], piezas: [] },
          escribir: async (cuerpo) => {
            const hecho = (await borrador()).escribirCatalogo(raiz, cuerpo);
            for (const ruta of [RUTA_DEL_CATALOGO_DE_EQUIPO, RUTA_DEL_CATALOGO_DE_UNIDADES]) {
              const donde = resolve(raiz, ruta);
              escritoAlGuardar.set(donde, readFileSync(donde, 'utf8'));
            }
            return hecho;
          },
        }),
      );
      server.middlewares.use(
        '/__arena/murallas',
        servirBorrador({
          ruta: RUTA_DE_MURALLAS,
          leer: async () => {
            const leido = (await borrador()).leerMurallas(raiz);
            return {
              formas: leido.formas,
              invalidas: leido.invalidas.map(({ nombre, motivo }) => ({ nombre, motivo })),
            };
          },
          vacio: { formas: [], invalidas: [] },
          escribir: async (cuerpo) => (await borrador()).escribirMurallas(raiz, cuerpo),
        }),
      );
    },
    async handleHotUpdate({ file, read }) {
      const escrito = escritoAlGuardar.get(resolve(file));
      if (escrito === undefined) return undefined;
      if ((await read()) === escrito) return [];
      escritoAlGuardar.delete(resolve(file));
      return undefined;
    },
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '__arena/hojas',
        source: await lista((aviso) => this.warn(aviso)),
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
        const { guardarMarca, leerMarca } = await cargar();
        // `use('/__marcas')` deja en `req.url` lo que va detrás: `/` o `/<id>`.
        const id = decodeURIComponent((req.url ?? '/').split('?')[0]?.slice(1) ?? '');
        if (req.method === 'GET' && id !== '') {
          try {
            responder(res, 200, leerMarca(raiz, id));
          } catch (err) {
            responder(res, 404, { error: motivoDe(err) });
          }
          return;
        }
        if (req.method !== 'POST' || id !== '') {
          responder(res, 405, {
            error: `una marca se guarda con POST /__marcas y se lee con GET /__marcas/<id>, no con ${req.method} ${req.url}`,
          });
          return;
        }
        try {
          responder(res, 200, guardarMarca(raiz, await leerCuerpo(req, MARCA_MAXIMA, 'la marca')));
        } catch (err) {
          // Lo que no valida no se escribe: 400 con la frase del esquema.
          responder(res, 400, { error: motivoDe(err) });
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
 * Generar un mundo desde el menú (F1a del mapa vivo, `tools/mundo/motor.ts`):
 * `POST /__mundos` con lo elegido empieza una generación y devuelve su id (409 si
 * ya hay otra en marcha o ya hay un mundo con ese id); `GET /__mundos/<id>/progreso` dice por qué fase va y lo
 * último que hizo el motor; `DELETE /__mundos/<id>` la cancela (mata el grupo del
 * motor). Solo en `pnpm dev`: el motor es Claude Code con la suscripción, en esta
 * máquina, y el mundo queda en `assets/mundos/<id>/`.
 */
function mundos(): Plugin {
  const raiz = __dirname;
  return {
    name: 'heroes-mundos',
    apply: 'serve',
    configureServer(server) {
      // Una vez: las generaciones en marcha viven en el estado del módulo.
      let motor: Promise<typeof import('./tools/mundo/motor.js')> | null = null;
      const cargar = () =>
        (motor ??= server.ssrLoadModule(resolve(raiz, 'tools/mundo/motor.ts')) as Promise<
          typeof import('./tools/mundo/motor.js')
        >);
      const atender = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        const m = await cargar();
        const ruta = (req.url ?? '/').split('?')[0] ?? '/';
        const progreso = /^\/([^/]+)\/progreso$/.exec(ruta)?.[1];
        const uno = /^\/([^/]+)$/.exec(ruta)?.[1];
        // El id de la ruta, con la regla de un id de mundo (`idDeMundoBlocker`): 400 con su frase.
        const id = progreso ?? uno;
        const malId = id === undefined ? null : m.idDeMundoBlocker(decodeURIComponent(id));
        if (malId !== null) {
          responder(res, 400, { error: malId });
          return;
        }
        if (req.method === 'POST' && ruta === '/') {
          try {
            responder(res, 200, {
              id: m.empezar(m.leerPedido(await leerCuerpo(req, 10_000, 'el pedido'))),
            });
          } catch (err) {
            responder(res, err instanceof m.Conflicto ? 409 : 400, { error: motivoDe(err) });
          }
          return;
        }
        if (req.method === 'GET' && progreso !== undefined) {
          const p = m.progresoDe(progreso);
          responder(
            res,
            p === null ? 404 : 200,
            p ?? { error: `no se está generando "${progreso}"` },
          );
          return;
        }
        if (req.method === 'DELETE' && uno !== undefined) {
          responder(res, 200, { cancelado: m.cancelar(uno) });
          return;
        }
        responder(res, 405, {
          error: `un mundo se genera con POST /__mundos, se sigue con GET /__mundos/<id>/progreso y se cancela con DELETE /__mundos/<id>, no con ${req.method} ${req.url}`,
        });
      };
      server.middlewares.use('/__mundos', (req, res, next) => {
        atender(req, res).catch(next);
      });
    },
  };
}

/**
 * Que nada de las herramientas de desarrollo llegue a `dist/`: ni el módulo de
 * `desarrollo/` ni las rutas `/__marcas` y `/__mundos`. Las aparta `HERRAMIENTAS_DE_DESARROLLO`
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
        for (const huella of [
          '__marcas',
          '__mundos',
          'client/desarrollo/',
          'HERRAMIENTAS_DE_DESARROLLO',
        ])
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
  plugins: [arena(), marcas(), mundos(), sinDesarrollo(), publico()],
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

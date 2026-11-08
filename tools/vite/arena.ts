import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { mensajeDe } from '../../src/client/comun/errores.js';
import { RUTA_DE_MURALLAS } from '../../src/core/arena/murallas.js';
import { RUTA_DEL_CATALOGO_DE_UNIDADES } from '../../src/core/unidad/formato.js';
import { leerCuerpo, listaDelDisco, responder } from './http.js';

/** El lado de disco de la arena (`tools/arena/borrador.ts`), que esto carga a demanda. */
type Borrador = typeof import('../arena/borrador.js');

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
            ilegible: mensajeDe(err),
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
        responder(res, 400, { error: mensajeDe(err) });
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
export function arena(raiz: string): Plugin {
  /** El lado de disco: en el build, con un `import()`; en `pnpm dev`, por vite. */
  let borrador = (): Promise<Borrador> => import('../arena/borrador.js');
  /** Lo que escribió «Guardar» en cada fichero, por su ruta absoluta. */
  const escritoAlGuardar = new Map<string, string>();
  /**
   * La lista de hojas (`listaDelDisco`): se olvida cuando cambia algo bajo
   * `assets/unidades/`, que es cuando el taller publica una hoja. Una unidad con su
   * arte a medias va en la lista como incompleta, con su motivo: fallar tumbaba el
   * build de todo por una unidad en obras, y quitarla de la lista la escondería;
   * así la arena construida dice lo mismo que `pnpm arena`.
   */
  const unidades = resolve(raiz, 'assets/unidades');
  const hojas = listaDelDisco({
    url: '__arena/hojas',
    vigila: [unidades],
    olvidaCon: (ruta) => ruta.startsWith(unidades),
    leer: async () => {
      const leidas = (await borrador()).hojasDelTaller(raiz);
      return {
        servida: leidas,
        avisos: leidas.flatMap((h) =>
          h.incompleta === null ? [] : [`[arena] se lista sin montarla: ${h.incompleta}`],
        ),
      };
    },
  });
  return {
    name: 'heroes-arena',
    configureServer(server) {
      borrador = async () =>
        (await server.ssrLoadModule(resolve(raiz, 'tools/arena/borrador.ts'))) as Borrador;
      hojas.servir(server);
      server.middlewares.use(
        '/__arena/unidades',
        servirBorrador({
          ruta: RUTA_DEL_CATALOGO_DE_UNIDADES,
          leer: async () => {
            const b = await borrador();
            // La versión, antes que lo leído: si otro guarda en medio, la página
            // tendrá la vieja y su «Guardar» se rechazará en vez de pisarlo.
            const version = b.versionDelCatalogo(raiz);
            const leido = b.leerCatalogo(raiz);
            return {
              version,
              unidades: leido.unidades,
              // Y el catálogo de equipo (vista «Editar equipo») y el cuerpo de todo
              // héroe: van con las unidades porque se guardan con ellas, en una operación.
              piezas: leido.piezas,
              heroe: leido.heroe,
              // Y los hechizos (el editor de magia): se guardan con todo lo demás.
              hechizos: leido.hechizos,
            };
          },
          vacio: { unidades: [], piezas: [] },
          escribir: async (cuerpo) => {
            const b = await borrador();
            const hecho = b.guardarCatalogo(raiz, cuerpo);
            for (const ruta of b.FICHEROS_DEL_CATALOGO) {
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
      await hojas.emitir(this);
      for (const fileName of ['__arena/unidades', '__arena/murallas']) {
        this.emitFile({ type: 'asset', fileName, source: JSON.stringify({ guardado: false }) });
      }
    },
  };
}

/**
 * Lo que comparten las rutas de desarrollo de vite (`tools/vite/`): leer el cuerpo de un pedido,
 * responder en JSON y servir una lista leída del disco que también emite el build.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Rollup, ViteDevServer } from 'vite';

/** Lo más que se acepta en un guardado: medio centenar de unidades caben de sobra. */
const CUERPO_MAXIMO = 1_000_000;

export async function leerCuerpo(
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
export function responder(res: ServerResponse, estado: number, cuerpo: unknown): void {
  res.statusCode = estado;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(cuerpo));
}

/**
 * Una lista leída del disco que sirve `pnpm dev` y emite `vite build`: la de hojas
 * de la arena y el banco de NPC. Son decenas de `dN/atlas.json` síncronos y en cada
 * recarga de la página bloqueaban el bucle de vite, así que **se lee una vez** y se
 * olvida cuando cambia lo que la hace (`olvidaCon`). Lo que va a medias —el taller
 * pintando— se avisa al leerla, en `pnpm dev` y en el build, que **avisa y no
 * falla** (#140): está, a medias, y no se monta ni se pinta.
 */
export function listaDelDisco(l: {
  /** La ruta que la sirve, que es también el fichero que emite el build (sin la `/`). */
  readonly url: string;
  /** Lo que se vigila (absoluto) y si un cambio en `ruta` la olvida. */
  readonly vigila: readonly string[];
  readonly olvidaCon: (ruta: string) => boolean;
  /** La lee: lo que se sirve y lo que va a medias. */
  readonly leer: () => Promise<{ readonly servida: unknown; readonly avisos: readonly string[] }>;
}): {
  readonly servir: (server: ViteDevServer) => void;
  readonly emitir: (ctx: Rollup.PluginContext) => Promise<void>;
} {
  let texto: string | null = null;
  const leida = async (avisar: (aviso: string) => void): Promise<string> => {
    if (texto === null) {
      const { servida, avisos } = await l.leer();
      for (const aviso of avisos) avisar(aviso);
      texto = JSON.stringify(servida);
    }
    return texto;
  };
  return {
    servir(server) {
      server.watcher.add([...l.vigila]);
      server.watcher.on('all', (_evento, ruta) => {
        if (l.olvidaCon(ruta)) texto = null;
      });
      // Si no carga, el error va a vite, que responde 500 y lo escribe: la página lo dice.
      server.middlewares.use(`/${l.url}`, (_req, res, next) => {
        leida((aviso) => server.config.logger.warn(aviso))
          .then((t) => {
            res.setHeader('content-type', 'application/json');
            res.end(t);
          })
          .catch(next);
      });
    },
    async emitir(ctx) {
      ctx.emitFile({
        type: 'asset',
        fileName: l.url,
        source: await leida((aviso) => ctx.warn(aviso)),
      });
    },
  };
}

import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { mensajeDe } from '../../src/client/comun/errores.js';
import { leerCuerpo, responder } from './http.js';

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
export function marcas(raiz: string): Plugin {
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
        )) as typeof import('../marcas/almacen.js')),
        ...((await server.ssrLoadModule(
          resolve(raiz, 'src/client/desarrollo/esquema.ts'),
        )) as typeof import('../../src/client/desarrollo/esquema.js')),
      });
      const atender = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        const { guardarMarca, leerMarca } = await cargar();
        // `use('/__marcas')` deja en `req.url` lo que va detrás: `/` o `/<id>`.
        const id = decodeURIComponent((req.url ?? '/').split('?')[0]?.slice(1) ?? '');
        if (req.method === 'GET' && id !== '') {
          try {
            responder(res, 200, leerMarca(raiz, id));
          } catch (err) {
            responder(res, 404, { error: mensajeDe(err) });
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
          responder(res, 400, { error: mensajeDe(err) });
        }
      };
      // Si el almacén no carga, el error va a Vite, que responde 500 y lo escribe.
      server.middlewares.use('/__marcas', (req, res, next) => {
        atender(req, res).catch(next);
      });
    },
  };
}

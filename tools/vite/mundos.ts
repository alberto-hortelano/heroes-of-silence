import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { mensajeDe } from '../../src/shared/errores.js';
import { leerCuerpo, responder } from './http.js';

/**
 * Generar un mundo desde el menú (F1a del mapa vivo, `tools/mundo/motor.ts`):
 * `POST /__mundos` con lo elegido empieza una generación y devuelve su id (409 si
 * ya hay otra en marcha o ya hay un mundo con ese id); `GET /__mundos/<id>/progreso` dice por qué fase va y lo
 * último que hizo el motor; `DELETE /__mundos/<id>` la cancela (mata el grupo del
 * motor). Solo en `pnpm dev`: el motor es Claude Code con la suscripción, en esta
 * máquina, y el mundo queda en `assets/mundos/<id>/`.
 */
export function mundos(raiz: string): Plugin {
  return {
    name: 'heroes-mundos',
    apply: 'serve',
    configureServer(server) {
      // Una vez: las generaciones en marcha viven en el estado del módulo. El motor y la
      // regla del id, a demanda: este plugin no importa el núcleo al arrancar
      // (`arranque.test.ts`), y `pnpm dev` arranca con él roto.
      let motor: Promise<typeof import('../mundo/motor.js')> | null = null;
      const cargar = () =>
        (motor ??= server.ssrLoadModule(resolve(raiz, 'tools/mundo/motor.ts')) as Promise<
          typeof import('../mundo/motor.js')
        >);
      const formatoDelMundo = () =>
        server.ssrLoadModule(resolve(raiz, 'src/core/mundo/formato.ts')) as Promise<
          typeof import('../../src/core/mundo/formato.js')
        >;
      const atender = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        const m = await cargar();
        const { idDeMundoBlocker } = await formatoDelMundo();
        const ruta = (req.url ?? '/').split('?')[0] ?? '/';
        const progreso = /^\/([^/]+)\/progreso$/.exec(ruta)?.[1];
        const uno = /^\/([^/]+)$/.exec(ruta)?.[1];
        // El id de la ruta, con la regla de un id de mundo (`idDeMundoBlocker`): 400 con su frase.
        const id = progreso ?? uno;
        const malId = id === undefined ? null : idDeMundoBlocker(decodeURIComponent(id));
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
            responder(res, err instanceof m.Conflicto ? 409 : 400, { error: mensajeDe(err) });
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

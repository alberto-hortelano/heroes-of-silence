/**
 * La política tonta con la que el arnés de QA juega la partida.
 *
 * Vive aparte de `verify-agent.ts` por un motivo práctico: aquel módulo LEVANTA
 * el servidor en cuanto se importa, así que no se puede probar sin abrir dos
 * procesos y dos puertos. Aquí no hay nada que arranque, y por eso la rama que
 * el circuito no alcanza —un `kind` que nadie emite— se puede ver morder desde
 * un test normal.
 *
 * No pretende jugar bien. Pretende ejercitar el circuito entero: construir,
 * reclutar, moverse y, en batalla, pegar a algo.
 */

import { generateMapPlan } from '../../src/core/map/generate.js';
import { createRng } from '../../src/core/rng.js';

/**
 * La firma con la que se reconoce el mapa del arnés.
 *
 * Es lo que tapa el riesgo de dar verde sin haber ejercitado #27: si el plan que
 * manda esta política se rechazara, el servidor jugaría el procedimental y
 * `pnpm qa` saldría igual de verde sin haber probado nada del mapa del agente.
 * Con la firma puesta, el arnés puede exigir en el primer `game_state` que el
 * pueblo se llame así — y si no se llama, es rojo.
 */
export const FIRMA_DEL_MAPA = 'qa-town-';

/** Lo que se le manda al servidor como respuesta a una petición. */
export function decidir(kind: string, payload: any): unknown {
  switch (kind) {
    case 'adventure_turn': {
      const acciones: unknown[] = [];
      const town = payload.towns?.[0];
      if (town?.canBuildNow?.[0] !== undefined) {
        acciones.push({ type: 'build', town: town.id, building: town.canBuildNow[0].id });
      }
      const reclutable = town?.recruitable?.find((r: any) => r.available > 0);
      if (reclutable !== undefined) {
        acciones.push({
          type: 'recruit',
          town: town.id,
          creature: reclutable.creature,
          count: Math.min(2, reclutable.available),
        });
      }
      const hero = payload.heroes?.[0];
      if (hero !== undefined) {
        const objetivo = payload.knownMap?.objects?.find(
          (o: any) =>
            (o.kind === 'resource' && !o.taken) || (o.kind === 'mine' && o.owner === null),
        );
        acciones.push({
          type: 'move_hero',
          hero: hero.id,
          to: objetivo?.at ?? { x: hero.at.x + 1, y: hero.at.y },
        });
      }
      return { actions: acciones, reasoning: 'qa: construyo, recluto y exploro' };
    }
    case 'battle_turn': {
      const acciones = payload.legalActions as any[];
      const elegida =
        acciones.find((a) => a.type === 'shoot') ??
        acciones.find((a) => a.type === 'attack') ??
        acciones.find((a) => a.type === 'move') ??
        acciones[0];
      return { action: elegida };
    }
    case 'map_generate': {
      // El plan sale del generador procedimental y NO se dibuja a mano: su
      // conectividad ya cumple `validateMapPlan` —cada inicio llega a cada
      // pueblo—, y escribir un mapa aquí sería inventarse esa conectividad
      // además del mapa. Lo único que se cambia son los ids y los nombres, que
      // es lo que lo hace reconocible.
      //
      // La semilla es fija y distinta de la del servidor a propósito: así el
      // mapa que se juega no puede coincidir por casualidad con el que habría
      // salido sin agente.
      const want = payload?.want ?? {};
      const plan = generateMapPlan(createRng(7), {
        width: Number(want.width ?? 24),
        height: Number(want.height ?? 24),
      });
      return {
        plan: {
          ...plan,
          towns: plan.towns.map((t, i) => ({
            ...t,
            id: `${FIRMA_DEL_MAPA}${i}`,
            name: `Pueblo QA ${i}`,
          })),
        },
        reasoning: 'qa: el plan del generador, firmado para que se vea cuál se juega',
      };
    }
    default:
      // Antes esto devolvía `{}`. Un `{}` no valida contra ningún esquema, así
      // que zod lo rechazaba en el servidor… y el arnés lo contaba como turno
      // bueno, porque `heroes_respond` no da `isError` en ese caso. El circuito
      // se rompía y la verificación salía verde.
      throw new Error(
        `esta política no sabe responder a "${kind}": añádele una rama antes de emitir ese kind`,
      );
  }
}

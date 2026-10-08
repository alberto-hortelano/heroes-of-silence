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
 * reclutar, comprar y equipar, moverse y, en batalla, pegar a algo.
 */

import { allCreatures } from '../../src/core/data.js';
import { generateMapPlan, planDelAgente } from '../../src/core/map/generate.js';
import { createRng } from '../../src/core/rng.js';
import { buildingIfExists } from '../../src/core/town/buildings.js';

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

/**
 * Lo que se le manda al servidor como respuesta a una petición. `semilla` es la
 * de la partida del arnés: de ella sale el plan de mapa (`map_generate`), y la
 * busca `partida-del-arnes.ts` en vez de escribirla aquí.
 */
export function decidir(kind: string, payload: any, semilla: number): unknown {
  switch (kind) {
    case 'adventure_turn': {
      const acciones: unknown[] = [];
      const town = payload.towns?.[0];
      const obra: string | undefined = town?.canBuildNow?.[0]?.id;
      if (obra !== undefined) acciones.push({ type: 'build', town: town.id, building: obra });
      // La foto del turno es de ANTES de construir, y una mejora de morada se
      // lleva lo disponible de su nivel a la criatura mejorada: pedir después los
      // zombis que la foto enseñaba es pedir unos que ya no hay. Pasaba el día 7
      // de `pnpm qa`, fuera de la cuenta del arnés —«1 rechazadas»—, desde que
      // `ponArmeriaEnLaBase` da oro para pagar la mejora.
      const nivelMejorado = obra === undefined ? undefined : buildingIfExists(obra)?.upgradesLevel;
      const reclutable = town?.recruitable?.find(
        (r: any) =>
          r.available > 0 &&
          (nivelMejorado === undefined ||
            allCreatures().find((c) => c.id === r.creature)?.level !== nivelMejorado),
      );
      const dentro = payload.heroes?.find(
        (h: any) => town?.at !== undefined && h.at?.x === town.at.x && h.at?.y === town.at.y,
      );
      // El equipo, antes de licenciar —que podría llevarse al novato elegido—: con
      // el héroe en una ciudad con armería se compra la primera pieza que vende, y
      // se le pone al primero de su tropa que todavía no tiene id —un novato, que
      // pasa a tenerlo—; sin armería, lo primero de la mochila del primer héroe que
      // lleve algo. Es como el arnés cruza `buy_item` y `equip` por el circuito.
      const enVenta = dentro === undefined ? undefined : town?.armory?.[0]?.item;
      if (enVenta !== undefined) acciones.push({ type: 'buy_item', town: town.id, item: enVenta });
      const portador =
        enVenta !== undefined
          ? dentro
          : payload.heroes?.find((h: any) => (h.backpack?.length ?? 0) > 0);
      const pieza = enVenta ?? portador?.backpack?.[0];
      const novato = portador?.army?.find((g: any) => g.member === undefined && g.id === undefined);
      if (pieza !== undefined && novato !== undefined) {
        acciones.push({ type: 'equip', hero: portador.id, item: pieza, creature: novato.creature });
      }
      // Con el héroe dentro y sus 6 individuos llenos, el `recruit` no cabe:
      // se licencian dos del primero que lleve para hacerle sitio. Es como el
      // arnés ejercita `dismiss` por el circuito entero.
      const lleva = (dentro?.army ?? []).reduce((n: number, g: any) => n + g.count, 0);
      const primero = dentro?.army?.find((g: any) => g.member === undefined && g.count >= 2);
      if (reclutable !== undefined && lleva >= 6 && primero !== undefined) {
        acciones.push({ type: 'dismiss', hero: dentro.id, creature: primero.creature, count: 2 });
      }
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
        // Un recurso suelto o un nodo sin dueño: desde el mapa de nodos la mina
        // ya no se toma, y lo que cambia de dueño al pisarlo es el nodo.
        const objetivo = payload.knownMap?.objects?.find(
          (o: any) =>
            (o.kind === 'resource' && !o.taken) || (o.kind === 'node' && o.owner === null),
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
      // Golpear si se puede y, si no, el PRIMER `move` de la lista, que es una
      // casilla vecina: desde el turno en tramos (02-10-2026) eso deja el turno
      // abierto y se vuelve a preguntar por la misma unidad, que es lo que el
      // arnés exige ver cruzar el circuito dos veces seguidas.
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
      // La semilla ya no se escribe aquí: era la 7, luego la 3, la 5, la 3, la 9
      // y otra vez la 7, re-buscada a mano cada vez que el generador cambiaba
      // y el arnés se quedaba sin batallas, sin equipo o sin asaltantes en seis
      // turnos. La busca `partida-del-arnes.ts` jugando la partida entera en el
      // proceso, con lo que el arnés exige ver como criterio (#131).
      const want = payload?.want ?? {};
      const plan = generateMapPlan(createRng(semilla), {
        width: Number(want.width ?? 24),
        height: Number(want.height ?? 24),
      });
      // El generador guarda sus caminos como tramos y el esquema del agente no
      // los tiene: zod los quitaba sin decir nada y el mapa salía sin un camino
      // (con #153, `pnpm qa` dejó de ver batallas por eso). `planDelAgente` lo
      // escribe como lo escribe el agente.
      return {
        plan: {
          ...planDelAgente(plan),
          towns: plan.towns.map((t, i) => ({
            ...t,
            id: `${FIRMA_DEL_MAPA}${i}`,
            name: `Pueblo QA ${i}`,
          })),
        },
        reasoning: 'qa: el plan del generador, firmado para que se vea cuál se juega',
      };
    }
    case 'hero_from_troop': {
      // El nombre lleva el id del veterano para que el arnés lo reconozca en el
      // `adventure_turn` siguiente —«QA veterano-N»—, y el tipo es el primero que
      // se le ofrece: elegir de la lista nunca falla, que es lo que se quiere
      // ver cruzar. Romperlo a mano es cambiar esto por un tipo inventado.
      const veterano = String(payload?.veteran?.id ?? '¿?');
      return {
        name: `QA ${veterano}`,
        story: `Un ${payload?.veteran?.creatureName ?? 'soldado'} que sobrevivió a ${payload?.veteran?.battles ?? 0} batallas.`,
        heroType: payload?.heroTypes?.[0]?.id,
        reasoning: 'qa: el primer tipo de la lista',
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

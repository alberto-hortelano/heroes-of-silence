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

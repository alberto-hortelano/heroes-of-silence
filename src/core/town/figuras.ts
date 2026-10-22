/**
 * Qué figura del banco de NPC lleva cada persona de una base (22-10-2026, el banco
 * de figuras de NPC). Presentación, como las voces: no cambia el juego, no usa la
 * corriente de azar de la partida y el banco no la ve.
 *
 * Se reparten **todas** las personas de la facción (`personasDeLaFaccion`: el
 * alcaide, los doce encargados y los vecinos, en ese orden fijo), no solo las que se
 * ven: así construir un sitio no le cambia la cara a nadie. A cada una, de las
 * figuras pintadas de su facción, la más parecida (`laMasParecida`: misma
 * especie, mismo sexo, sin usar aún en la base, mismo oficio), desempatando con un
 * hash de la semilla, la facción, la persona y la figura: misma semilla, facción y
 * persona, misma figura. **Sin el pueblo**: Doña Elvira es la misma en toda villa
 * templaria de la partida. Sin ninguna de su facción, `null`: el Y Bot de siempre.
 *
 * Con un mundo, la historia manda en la gente de la base de quien juega
 * (`Historia.base`, la facción del jugador 0): su figura o, si aún se pinta, la más
 * parecida a ella (`figuraQueSePinta`). Esas se asignan antes que las demás, para
 * que el reparto no se las lleve.
 */
import { type BancoPintado, figuraQueSePinta, laMasParecida } from '../npcs.js';
import type { GameState } from '../state/game.js';
import type { FactionId } from '../types.js';
import { personasDeLaFaccion } from './voces.js';

/**
 * La figura de cada persona de la gente de `faccion` (por su id de
 * `personasDeLaFaccion`), o `null` para el Y Bot. `gente`: el banco con lo que de él
 * está pintado (sus ocho direcciones en disco).
 */
export function figurasDeLaGente(
  state: Pick<GameState, 'seed' | 'players' | 'mundo'>,
  faccion: FactionId,
  gente: BancoPintado,
): ReadonlyMap<string, string | null> {
  const personas = personasDeLaFaccion(faccion);
  const historia = state.mundo?.historia;
  const deQuienJuega = state.players.find((p) => p.id === 0)?.faction === faccion;
  const asignadas = historia !== undefined && deQuienJuega ? (historia.base ?? {}) : {};
  const peticiones = historia?.figuras ?? {};
  const clave = (persona: string): string => `${state.seed}|${faccion}|${persona}`;

  const fuera = new Map<string, string | null>();
  const usadas = new Set<string>();
  for (const p of personas) {
    const id = asignadas[p.id];
    if (id === undefined) continue;
    const f = figuraQueSePinta(gente, id, clave(p.id), peticiones);
    fuera.set(p.id, f);
    if (f !== null) usadas.add(f);
  }
  for (const p of personas) {
    if (fuera.has(p.id)) continue;
    const f = laMasParecida(gente, { faccion, ...p }, clave(p.id), usadas)?.id ?? null;
    fuera.set(p.id, f);
    if (f !== null) usadas.add(f);
  }
  return fuera;
}

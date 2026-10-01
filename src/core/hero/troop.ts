/**
 * La tropa de individuos: qué es cada uno, cuánto ocupa y cuánto cabe.
 *
 * Desde la fase 1a un ejército es una lista de individuos (`Troop`), uno por
 * hex en el tablero, y lo que limita cuántos lleva un héroe no son los cinco
 * huecos de HoMM2 sino su **liderazgo**: cada individuo ocupa lo que diga su
 * fila de `data/creatures.json`, y el héroe tiene un tope que crece con el
 * nivel (`data/liderazgo.json`). Las dos cifras son provisionales y viven en
 * datos: la economía la define el usuario.
 *
 * Este módulo es la ÚNICA puerta para tres preguntas que antes se contestaban
 * cada una en su sitio, y que con un personaje en el ejército dejaban de
 * tener respuesta: de dónde salen las cifras de un individuo (`troopUnit`),
 * cuánto ocupa (`troopLeadership`) y cómo se ve agrupado (`troopSummary`).
 * Mientras cada lector llamaba a `creature(stack.creature)` por su cuenta, un
 * héroe con un personaje no podía ni pasar de día: `maxMovePoints` lanzaba
 * «criatura desconocida: "character"» en el `advanceDay`.
 */
import { creature, LIDERAZGO } from '../data.js';
import type { Character } from '../rpg/character.js';
import { combatProfile } from '../rpg/stats.js';
import type { Army, Stack, Troop, UnitInfo } from '../types.js';

/** Los personajes de la partida, si los hay: `GameState.characters`. */
export type Personajes = Readonly<Record<string, Character>> | undefined;

/**
 * La puerta para buscar un personaje por id. Lanza diciendo el id si la partida
 * no lo conoce: sería un individuo sin cifras, y adivinárselas es justo lo que
 * no se hace. `quien` dice desde dónde se le buscaba —«Gustav lleva en el
 * ejército», «la batalla devuelve»—, para que la frase lo cuente.
 */
export function characterOf(characters: Personajes, id: string, quien: string): Character {
  const c = characters?.[id];
  if (c === undefined) {
    throw new Error(`${quien} al personaje "${id}", pero la partida no lo conoce`);
  }
  return c;
}

/**
 * Las cifras de un individuo: del catálogo, o del perfil de su personaje.
 *
 * Es lo que leen la velocidad del héroe, la fuerza que calcula la IA y las
 * vistas del ejército. El motor de batalla tiene su propia resolución
 * (`resolveUnit`), que además trae los PV con los que entra un herido.
 */
export function troopUnit(t: Troop, characters: Personajes): UnitInfo {
  if (t.member === undefined) return creature(t.creature);
  return combatProfile(characterOf(characters, t.member, 'el ejército lleva')).unit;
}

/** Lo que ocupa un individuo en el liderazgo. */
function troopLeadership(t: Troop): number {
  return t.member === undefined ? creature(t.creature).leadership : LIDERAZGO.personaje;
}

/** Lo que ocupa el ejército entero. */
export function armyLeadership(army: Army): number {
  let total = 0;
  for (const t of army) total += troopLeadership(t);
  return total;
}

/**
 * El tope de liderazgo de un héroe. **Derivado del nivel, no guardado**: un
 * campo `leadership` en `Hero` sería un segundo dato que subir al subir de
 * nivel, y el día que alguien se olvidara de una de las dos escrituras el tope
 * mentiría. Provisional, como todas las cifras de `data/liderazgo.json`.
 */
export function heroLeadership(hero: { readonly level: number }): number {
  const { base, porNivel, max } = LIDERAZGO.heroe;
  return Math.min(max, base + porNivel * (hero.level - 1));
}

/**
 * El tope de la tropa que guarda un castillo sin héroe. Una constante y no una
 * función: no depende de nada, y una función sin argumentos invitaba a buscarle
 * una dependencia que no tiene. Tiene que ser ≤ `LIDERAZGO.heroe.base`, y lo
 * vigila un test de datos (`tropa.test.ts`): ver el `_comment` del JSON.
 */
export const GARRISON_LEADERSHIP: number = LIDERAZGO.guarnicion;

/** Cuántos individuos de esa criatura caben todavía bajo `tope`. */
export function troopRoom(army: Army, tope: number, creatureId: string): number {
  return cabenEnElHueco(tope - armyLeadership(army), creature(creatureId).leadership);
}

function cabenEnElHueco(libre: number, ocupaUno: number): number {
  return libre <= 0 ? 0 : Math.floor(libre / ocupaUno);
}

/**
 * Por qué no caben `n` individuos de `creatureId` en este ejército, o `null`.
 *
 * Devuelve la frase y no lanza, igual que `buildBlocker` y `castBlocker`: la
 * lee quien rechaza (`applyAdventureAction`, que lanza con ella), y la puede
 * leer la pantalla para explicar por qué un botón no hace nada.
 */
export function troopBlocker(
  army: Army,
  tope: number,
  creatureId: string,
  n: number,
  quien = 'el ejército',
): string | null {
  const info = creature(creatureId);
  const ocupa = armyLeadership(army);
  const pide = info.leadership * n;
  if (ocupa + pide <= tope) return null;
  const caben = cabenEnElHueco(tope - ocupa, info.leadership);
  const verbo = n === 1 ? 'pide' : 'piden';
  return (
    `no cabe: ${quien} ocupa ${ocupa} de ${tope} de liderazgo y ${n} × ${info.name} ${verbo} ${pide}` +
    (caben > 0 ? `; caben ${caben}` : '')
  );
}

/** El ejército con `n` individuos más de esa criatura, al final. */
export function withTroops(army: Army, creatureId: string, n: number): Army {
  const nuevos: Troop[] = Array.from({ length: n }, () => ({ creature: creatureId }));
  return [...army, ...nuevos];
}

/**
 * Reparte `entrantes` entre lo que cabe en `army` bajo `tope` y lo que no, en
 * orden: el que no cabe se salta y se prueba el siguiente, así que un dragón
 * que no entra no deja fuera a los esqueletos que vienen detrás.
 *
 * Es lo que hace un héroe al entrar en su castillo —se lleva lo que le quepa y
 * el resto se queda guardándolo— y lo que la IA mira para saber si merece la
 * pena el viaje. No lanza: llevarse la guarnición no es una petición, y lo que
 * no cabe no se pierde.
 */
export function troopsThatFit(
  army: Army,
  tope: number,
  entrantes: Army,
): { readonly dentro: Army; readonly fuera: Army } {
  let libre = tope - armyLeadership(army);
  const dentro: Troop[] = [];
  const fuera: Troop[] = [];
  for (const t of entrantes) {
    const ocupa = troopLeadership(t);
    if (ocupa <= libre) {
      dentro.push(t);
      libre -= ocupa;
    } else {
      fuera.push(t);
    }
  }
  return { dentro, fuera };
}

/**
 * La tropa como entrada del motor de batalla: un stack de 1 por individuo, en
 * el mismo orden —que es el de despliegue y el de desempate de iniciativa—.
 */
export function troopsAsStacks(army: Army): Stack[] {
  return army.map((t) => ({ ...t, count: 1 }));
}

/** Una fila del ejército agrupado: lo que se pinta y lo que viaja al agente. */
interface TroopGroup {
  readonly creature: string;
  readonly member?: string;
  readonly unit: UnitInfo;
  readonly count: number;
}

/**
 * El ejército agrupado por criatura, en orden de primera aparición; cada
 * personaje en su propia fila, porque es uno y tiene nombre.
 *
 * **Es el único sitio que agrupa.** Lo leen la vista del agente, el panel del
 * cliente y el resumen del servidor; si cada uno agrupara por su cuenta, el
 * día que un personaje aparezca en uno de ellos los otros dos lo contarían como
 * «3 × character».
 */
export function troopSummary(army: Army, characters: Personajes): TroopGroup[] {
  const grupos: TroopGroup[] = [];
  const porCriatura = new Map<string, number>();
  for (const t of army) {
    if (t.member !== undefined) {
      grupos.push({
        creature: t.creature,
        member: t.member,
        unit: troopUnit(t, characters),
        count: 1,
      });
      continue;
    }
    const i = porCriatura.get(t.creature);
    if (i === undefined) {
      porCriatura.set(t.creature, grupos.length);
      grupos.push({ creature: t.creature, unit: creature(t.creature), count: 1 });
    } else {
      const g = grupos[i]!;
      grupos[i] = { ...g, count: g.count + 1 };
    }
  }
  return grupos;
}

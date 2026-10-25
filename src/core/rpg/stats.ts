/**
 * De un personaje a las cifras con las que pelea.
 *
 * Es la traducción que deja al personaje entrar en el motor de batalla de
 * siempre: el tablero no sabe de atributos, sabe de ataque, defensa, daño, PV y
 * velocidad, así que aquí se calculan esas cifras y el stack las lleva en
 * `BattleStack.unit` en lugar de las del catálogo.
 *
 * Tabla (a = atributo EFECTIVO, con el bono de profesión; n = nivel):
 *
 * | atributo    | efecto                      | fórmula                          |
 * |-------------|-----------------------------|----------------------------------|
 * | fuerza      | fuerza (el daño)            | 10 × (1 + ⌊a/4⌋)                 |
 * | destreza    | ataque, agilidad            | ⌊a/3⌋ + n + 1; agilidad <10 3, <13 4, <16 5, si no 6 |
 * | resistencia | PV, defensa                 | 10 × (10 + 2a) (`maxHpFrom`); ⌊a/4⌋ en la defensa |
 * | intelecto   | defensa                     | ⌊a/4⌋ en la defensa, más n       |
 * | percepción  | suerte                      | ⌊(a − 8)/4⌋                      |
 * | voluntad    | moral                       | ⌊(a − 8)/4⌋                      |
 *
 * **Cada atributo mueve al menos una cifra que se juega**, y el test lo exige
 * atributo por atributo: uno que no moviera nada sería decorativo, que es lo
 * que la rama de archivo tenía con intelecto y percepción.
 *
 * El Guardabosques tira con un arco (`arco`, en `distancia`), como cualquier
 * tirador: llevarlo ya es disparar, sin munición (13-10-2026).
 *
 * Moral y suerte salen 0 con 8..11, así que un personaje es neutro por defecto.
 * Desde el 25-10-2026 el personaje tiene fuerza y agilidad como la tropa, y su
 * daño, su defensa y sus casillas salen de ellas (`cifrasDelCuerpo`): la fuerza
 * con la escala del daño (`ESCALA_DE_CIFRAS`, el 10 de la tabla), la agilidad con
 * la de las casillas de antes, y lo que daban resistencia e intelecto a la
 * defensa, como defensa propia. Las suyas propias, sin traducir de los atributos,
 * están en el backlog. Su nivel no se escribe: es el de estas cifras (`nivelDeUnidad`);
 * `Character.level` es otra cosa, lo que suma a ataque y defensa.
 *
 * Solo `Math.floor`: `core` no ejecuta coma flotante que dependa de la
 * plataforma (`test/invariantes.test.ts`).
 */

import { cuerpoConSusCifras } from '../cuerpo.js';
import { ESCALA_DE_CIFRAS } from '../escala.js';
import type { Equipo, UnitInfo } from '../types.js';
import { type Character, effectiveAttributes, maxHpFrom } from './character.js';

/** Lo que lleva el Guardabosques: el arco de `data/equipo.json`, en `distancia`. */
const ARCO_DEL_GUARDABOSQUES = { distancia: 'arco' } as const;

export interface CombatProfile {
  /** El cuerpo desnudo: la veteranía se le suma antes que lo que lleva (`cifrasDelIndividuo`). */
  readonly unit: UnitInfo;
  /** Lo que lleva de serie su profesión (el arco del Guardabosques), con lo de su hoja encima. */
  readonly equipo: Equipo;
  /** Moral PROPIA, antes de sumar la del bando y de recortar a [−3, +3]. */
  readonly morale: number;
  /** Suerte propia, igual. */
  readonly luck: number;
}

function agilidadDe(destreza: number): number {
  if (destreza < 10) return 3;
  if (destreza < 13) return 4;
  if (destreza < 16) return 5;
  return 6;
}

export function combatProfile(c: Character): CombatProfile {
  const a = effectiveAttributes(c);
  const n = c.level;
  const unit: UnitInfo = cuerpoConSusCifras({
    name: c.name,
    // Sin facción: no suma ni resta a la diversidad del ejército.
    faction: null,
    attack: Math.floor(a.destreza / 3) + n + 1,
    fuerza: ESCALA_DE_CIFRAS * (1 + Math.floor(a.fuerza / 4)),
    agilidad: agilidadDe(a.destreza),
    defensaPropia: Math.floor(a.resistencia / 4) + Math.floor(a.intelecto / 4) + n,
    hp: maxHpFrom(a),
  });
  return {
    unit,
    // Mago y Sanador no tienen rasgo propio: la magia sigue siendo del héroe.
    equipo: c.profession === 'Guardabosques' ? ARCO_DEL_GUARDABOSQUES : {},
    morale: Math.floor((a.voluntad - 8) / 4),
    luck: Math.floor((a.percepcion - 8) / 4),
  };
}

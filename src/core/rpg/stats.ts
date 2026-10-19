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
 * | fuerza      | daño                        | 10 × [1 + ⌊a/4⌋, 2 + ⌊a/2⌋]      |
 * | destreza    | ataque, velocidad           | ⌊a/3⌋ + n + 1; <10 slow, <13 average, <16 fast, si no very_fast |
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
 * Las cifras quedan en el orden de una criatura de nivel 3-4 —el espadachín es
 * 7/9/[40,60]/250— para que un individuo aguante un duelo contra otro y no contra
 * un ejército. PV y daño van a `ESCALA_DE_CIFRAS` (el 10 de la tabla), como el
 * catálogo. Su nivel no se escribe: es el de estas cifras (`nivelDeUnidad`);
 * `Character.level` es otra cosa, lo que suma a ataque y defensa.
 *
 * Solo `Math.floor`: `core` no ejecuta coma flotante que dependa de la
 * plataforma (`test/invariantes.test.ts`).
 */
import { ESCALA_DE_CIFRAS } from '../escala.js';
import { conEquipo } from '../hero/equipo.js';
import type { SpeedTier, UnitInfo } from '../types.js';
import { type Character, effectiveAttributes, maxHpFrom } from './character.js';

/** Lo que lleva el Guardabosques: el arco de `data/equipo.json`, en `distancia`. */
const ARCO_DEL_GUARDABOSQUES = { distancia: 'arco' } as const;

export interface CombatProfile {
  readonly unit: UnitInfo;
  /** Moral PROPIA, antes de sumar la del bando y de recortar a [−3, +3]. */
  readonly morale: number;
  /** Suerte propia, igual. */
  readonly luck: number;
}

function speedFor(destreza: number): SpeedTier {
  if (destreza < 10) return 'slow';
  if (destreza < 13) return 'average';
  if (destreza < 16) return 'fast';
  return 'very_fast';
}

export function combatProfile(c: Character): CombatProfile {
  const a = effectiveAttributes(c);
  const n = c.level;
  const unit: UnitInfo = {
    name: c.name,
    // Sin facción: no suma ni resta a la diversidad del ejército.
    faction: null,
    attack: Math.floor(a.destreza / 3) + n + 1,
    defense: Math.floor(a.resistencia / 4) + Math.floor(a.intelecto / 4) + n,
    damage: [
      ESCALA_DE_CIFRAS * (1 + Math.floor(a.fuerza / 4)),
      ESCALA_DE_CIFRAS * (2 + Math.floor(a.fuerza / 2)),
    ],
    hp: maxHpFrom(a),
    speed: speedFor(a.destreza),
  };
  return {
    // Mago y Sanador no tienen rasgo propio: la magia sigue siendo del héroe.
    unit: c.profession === 'Guardabosques' ? conEquipo(unit, ARCO_DEL_GUARDABOSQUES) : unit,
    morale: Math.floor((a.voluntad - 8) / 4),
    luck: Math.floor((a.percepcion - 8) / 4),
  };
}

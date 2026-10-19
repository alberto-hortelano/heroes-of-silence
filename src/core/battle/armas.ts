/**
 * Con qué arma y con qué cifras pega una unidad, y cuánto le para su armadura:
 * **las lecturas puras de una `UnitInfo`** que comparten el combate (`damage.ts`,
 * `rueda.ts`, `battle.ts`), la IA, la ficha y la medida del nivel
 * (`core/nivel.ts`).
 *
 * Aparte, y sin importar nada que importe `nivel.ts`, porque el nivel las lee
 * para medir y el combate lee el nivel para la experiencia (`herir`): con ellas
 * dentro de `damage.ts` y `rueda.ts`, `nivel.ts` quedaba en un ciclo de
 * importación que solo funcionaba porque lo que corre al cargar usa declaraciones
 * de función (simplify de F1, 18-10-2026). Lo vigila `test/invariantes.test.ts`.
 */
import { hasTrait } from '../data.js';
import type { GolpeConArma, TipoDeGolpe, UnitInfo, UsoDeArma } from '../types.js';
import {
  type CifrasDeLaRueda,
  cifrasDeLosNiveles,
  GOLPES_DEL_RAPIDO,
} from './cifras-de-la-rueda.js';
import type { BattleStack } from './types.js';

/**
 * Con qué arma y con qué cifras da `unit` un golpe de `uso`: el de su arma
 * (`UnitInfo.armas`) o, si no la lleva, el de cuerpo a cuerpo, que son las cifras
 * de arriba —la carga sin lanza va con la espada, y el disparo sin arma a
 * distancia (quien tira por sí mismo), también—. Sin armas por uso, todo golpe va con las cifras de
 * arriba y el arma de cuerpo a cuerpo de su equipo. **La única regla del
 * respaldo**: de aquí leen las cifras del golpe (`cifrasDelGolpe`), la previsión
 * y la ficha (`armasDe`).
 */
export function golpeDe(unit: UnitInfo, uso: UsoDeArma): GolpeConArma {
  const { armas } = unit;
  if (armas === undefined) {
    // Sin `armas` no lleva arma: toda arma de cuerpo a cuerpo dice su rueda, y
    // con ella `conEquipo` escribe `armas`.
    return { arma: null, attack: unit.attack, damage: unit.damage };
  }
  return armas[uso] ?? armas.arma;
}

/**
 * Las cifras con que se da un golpe de `uso` (`golpeDe`). **La única lectura de
 * las cifras de un golpe**: la leen el ataque, la tirada, la IA, la previsión y
 * la ficha. En el juego no hay `armas` y son las de arriba, sin más cuenta.
 */
export function cifrasDelGolpe(
  unit: UnitInfo,
  uso: UsoDeArma,
): { readonly attack: number; readonly damage: readonly [number, number] } {
  if (unit.armas === undefined) return unit;
  return golpeDe(unit, uso);
}

/**
 * Las cifras de la rueda con que da `unit` un golpe de `uso`: las de los niveles de
 * su arma (`golpeDe(unit, uso).rueda`, que escribe `conEquipo`;
 * `cifrasDeLosNiveles`). **La única lectura del arma en la rueda**: la piden el
 * golpe, el contraataque y la previsión (`battle.ts`). Sin arma con rueda
 * **lanza**: toda unidad del catálogo la lleva (`armaDeCuerpoBlocker`) y el héroe,
 * la Espada; si se llega aquí sin ella, es un fallo, no un golpe con cifras
 * inventadas.
 */
export function ruedaDelGolpe(unit: UnitInfo, uso: UsoDeArma): CifrasDeLaRueda {
  const { rueda } = golpeDe(unit, uso);
  if (rueda === undefined) {
    throw new Error(
      `«${unit.name}» golpea en la rueda sin arma que la lleve: nadie pelea sin arma de cuerpo a cuerpo`,
    );
  }
  return cifrasDeLosNiveles(rueda);
}

/**
 * Cuántos golpes da `unit` al golpear (`contraataque` falso) o al devolver el
 * golpe, con el tipo `tipo` de la rueda o sin rueda (`null`). Uno; el doble
 * golpe (`double_attack`) al atacar, no al devolver; y Rápido, por sus golpes
 * (con el doble golpe, cuatro). La única cuenta: la leen el golpe (`melee`) y la
 * previsión.
 */
export function golpesDe(unit: UnitInfo, tipo: TipoDeGolpe | null, contraataque: boolean): number {
  const base = !contraataque && hasTrait(unit, 'double_attack') ? 2 : 1;
  // El arma cambia el daño de cada golpe del Rápido, no cuántos.
  return tipo === 'rapido' ? base * GOLPES_DEL_RAPIDO : base;
}

/**
 * Lo que multiplica el daño de un golpe de tipo `tipo` con las cifras de su arma
 * `c`, en tanto por ciento entero: Fuerte y Rápido, el suyo; los demás (Normal
 * también), 100. Lo leen la traducción del cruce al daño (`cruceDelGolpe`) y la
 * medida del nivel, que así no repiten qué tipos hacen daño.
 */
export function porcientoDelTipo(tipo: TipoDeGolpe, c: CifrasDeLaRueda): number {
  return tipo === 'fuerte' || tipo === 'rapido' ? c[tipo].porcentaje : 100;
}

/**
 * Cuántos tiros da `unit` en un disparo: dos con el disparo doble (`double_shot`),
 * uno sin él. La única cuenta: la leen el disparo (`shoot`), su previsión y la
 * medida del nivel.
 */
export function disparosDe(unit: UnitInfo): number {
  return hasTrait(unit, 'double_shot') ? 2 : 1;
}

/**
 * Los puntos de armadura de `u` (`UnitInfo.puntosDeArmadura`, la suma de las
 * piezas que lleva; 0 sin ella). La única
 * lectura del campo fuera de `hero/equipo.ts`: la leen la resta (`trasLaArmadura`),
 * la IA y la ficha.
 */
export function armaduraDe(u: UnitInfo): number {
  return u.puntosDeArmadura ?? 0;
}

/** El daño de un golpe que llega a quien lo recibe: lo que quita y lo que paró la armadura. */
export interface TrasLaArmadura {
  readonly danio: number;
  /** Lo que se comió la armadura: `min(daño, armadura)`; 0 sin armadura. */
  readonly parado: number;
}

/**
 * El daño de UN golpe tras la armadura de `objetivo` (#262): se
 * resta lo último —después de ataque contra defensa, los multiplicadores, la
 * suerte y el redondeo— y nunca baja de 0 (decisión del usuario: «una armadura
 * gruesa puede parar del todo un golpe flojo»). **La única resta**: la aplican
 * `herir` (todo lo que quita vida pasa por ella: golpe, contraataque, cada golpe
 * de Rápido o del doble golpe, cada disparo, la salpicadura, el hechizo y el
 * poder) y la previsión (`horquillaDeDanio`, la del hechizo), y la IA (`expectedDamage`).
 * Sin armadura devuelve `danio` tal cual.
 */
export function trasLaArmadura(danio: number, objetivo: Pick<BattleStack, 'unit'>): TrasLaArmadura {
  const a = armaduraDe(objetivo.unit);
  if (a === 0) return { danio, parado: 0 };
  return { danio: Math.max(0, danio - a), parado: Math.min(danio, a) };
}

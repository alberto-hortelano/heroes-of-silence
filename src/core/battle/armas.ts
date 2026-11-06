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
import type { GolpeConArma, NivelesDeLaRueda, TipoDeGolpe, UnitInfo, UsoDeArma } from '../types.js';
import { hasTrait } from '../types.js';
import {
  type CifrasDeLaRueda,
  cifrasDeLosNiveles,
  efectoDelTipo,
  golpesDelTipo,
} from './cifras-de-la-rueda.js';
import { effectTotal } from './effects.js';
import type { BattleStack } from './types.js';

/** Cómo juega a distancia una unidad (`tiroADistanciaDe`): dispara o lanza granadas. */
export type TiroADistancia = 'disparo' | 'granada';

/**
 * Cómo juega `c` a distancia, o `null` si no lleva nada en el hueco `distancia`:
 * **la única pregunta** (hallazgo S1 de /simplify, 02-11-2026: «¿juega a distancia?» se
 * escribía como `isShooter || lanzaGranadas` en seis sitios, y las dos leían fuentes
 * distintas, `equipo` y `armas`, que podían contradecirse). Se lee solo de su golpe a
 * distancia (`UnitInfo.armas.distancia`, que escribe `conEquipo` con lo que lleva en
 * ese hueco): la granada se lanza; lo demás —arco, ballesta, arma de fuego— se
 * dispara, sin munición que contar (13-10-2026: llevarla ya es disparar). Vive aquí,
 * con las lecturas de `armas`.
 */
export function tiroADistanciaDe(c: UnitInfo): TiroADistancia | null {
  const golpe = c.armas?.distancia;
  if (golpe === undefined) return null;
  return golpe.tiro?.kind === 'granada' ? 'granada' : 'disparo';
}

/** Tira (apunta y dispara, `aim`) quien lleva en `distancia` algo que no es una granada. */
export function isShooter(c: UnitInfo): boolean {
  return tiroADistanciaDe(c) === 'disparo';
}

/** Lanza granadas (`throw`, `lanzarBlocker`) quien lleva una en `distancia` (02-11-2026). */
export function lanzaGranadas(c: UnitInfo): boolean {
  return tiroADistanciaDe(c) === 'granada';
}

/**
 * Si `a` y `b` tiran a distancia de la misma clase: nada, arco o ballesta, arma de
 * fuego o granada. Lo pregunta un retoque de la arena a media pelea
 * (`loADistanciaTrasElRetoque`, `battle.ts`): con otra clase, lo pendiente no vale.
 */
export function mismoTiro(a: UnitInfo, b: UnitInfo): boolean {
  const clase = (u: UnitInfo): string | null =>
    u.armas?.distancia === undefined ? null : (u.armas.distancia.tiro?.kind ?? 'arco');
  return clase(a) === clase(b);
}

/**
 * Con qué arma y con qué cifras da `unit` un golpe de `uso`: el de su arma
 * (`UnitInfo.armas`) o, si no la lleva, el de cuerpo a cuerpo, que son las cifras
 * de arriba (la carga va con la de cuerpo a cuerpo). Sin `armas` —un cuerpo sin
 * arma, que no golpea en la rueda— todo golpe va con las cifras de arriba. **La única regla del
 * respaldo**: de aquí leen las cifras del golpe (`cifrasDelGolpe`), la previsión
 * y la ficha (`armasDe`).
 */
export function golpeDe(unit: UnitInfo, uso: UsoDeArma): GolpeConArma {
  const { armas } = unit;
  if (armas === undefined) {
    // Sin `armas` no lleva arma: toda arma de cuerpo a cuerpo dice su rueda, y
    // con ella `conEquipo` escribe `armas`.
    return { piezas: [], attack: unit.attack, damage: unit.damage };
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
  return cifrasDeLosNiveles(nivelesDelGolpe(unit, uso));
}

/**
 * Los niveles de la rueda (0 a 6 por tipo del anillo) del arma con que da `unit`
 * un golpe de `uso`: los que traduce `ruedaDelGolpe` y los que tiñen los sectores
 * del diálogo de la rueda (`previsionDeLaRueda().niveles`). Lanza sin arma con
 * rueda, como `ruedaDelGolpe`.
 */
export function nivelesDelGolpe(unit: UnitInfo, uso: UsoDeArma): NivelesDeLaRueda {
  const { rueda } = golpeDe(unit, uso);
  if (rueda === undefined) {
    throw new Error(
      `«${unit.name}» golpea en la rueda sin arma que la lleve: nadie pelea sin arma de cuerpo a cuerpo`,
    );
  }
  return rueda;
}

/**
 * Cuántos golpes da `unit` al golpear (`contraataque` falso) o al devolver el
 * golpe, con el tipo `tipo` de la rueda o sin rueda (`null`). Uno; el doble
 * golpe (`double_attack`) al atacar, no al devolver; y un tipo con Rápido entre sus
 * partes, por sus golpes (con el doble golpe, cuatro; `golpesDelTipo`). La única
 * cuenta: la leen el golpe (`melee`) y la previsión.
 */
export function golpesDe(unit: UnitInfo, tipo: TipoDeGolpe | null, contraataque: boolean): number {
  const base = !contraataque && hasTrait(unit, 'double_attack') ? 2 : 1;
  // El arma cambia el daño de cada golpe del Rápido, no cuántos.
  return tipo === null ? base : base * golpesDelTipo(tipo);
}

/**
 * Lo que multiplica el daño de un golpe de tipo `tipo` con las cifras de su arma
 * `c`, en tanto por ciento entero (`efectoDelTipo`): Fuerte y Rápido, el suyo; un
 * fusionado con uno de ellos, a la mitad; los demás (Normal también), 100. Lo leen
 * la traducción del cruce al daño (`cruceDelGolpe`) y la medida del nivel, que así
 * no repiten qué tipos hacen daño.
 */
export function porcientoDelTipo(tipo: TipoDeGolpe, c: CifrasDeLaRueda): number {
  return efectoDelTipo(tipo, c).porcentaje;
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
  /** Lo que se comió el escudo de un hechizo, tras la armadura; sin escudo, no está. */
  readonly absorbido?: number;
}

/**
 * El daño de UN golpe tras la armadura de `objetivo` (#262): se
 * resta lo último —después de ataque contra defensa, los multiplicadores y el
 * redondeo— y nunca baja de 0 (decisión del usuario: «una armadura
 * gruesa puede parar del todo un golpe flojo»). **La única resta**: la aplican
 * `herir` (todo lo que quita vida pasa por ella: golpe, contraataque, cada golpe
 * de Rápido o del doble golpe, cada disparo, la salpicadura, el hechizo y el
 * poder) y la previsión (`horquillaDeDanio`, la del hechizo), y la IA (`expectedDamage`).
 * Sin armadura devuelve `danio` tal cual, y con `perfora` (el disparo de un arma de
 * fuego, `perforaLaArmadura`), también. `perfora` no tiene valor por defecto: quien
 * se olvidaba de pasarlo restaba la armadura en silencio (la salpicadura de un arma
 * de fuego; hallazgo F2 de /simplify, 02-11-2026).
 */
export function trasLaArmadura(
  danio: number,
  objetivo: Pick<BattleStack, 'unit' | 'effects'>,
  perfora: boolean,
): TrasLaArmadura {
  const a = armaduraEnLaPelea(objetivo);
  // Lo de un arma de fuego llega entero (02-11-2026, decisión del usuario: «Nada, fija»).
  const tras = a === 0 || perfora ? danio : Math.max(0, danio - a);
  const parado = a === 0 || perfora ? 0 : Math.min(danio, a);
  // El escudo de un hechizo, tras la armadura (06-11-2026): se come lo que llega.
  const escudo = escudoDe(objetivo);
  if (escudo === 0) return { danio: tras, parado };
  const absorbido = Math.min(escudo, tras);
  return { danio: tras - absorbido, parado, absorbido };
}

/**
 * La armadura con que pelea un stack ahora: la de sus piezas (`armaduraDe`) más lo
 * que le suma o le resta un hechizo, sin bajar de 0. La leen la resta y la IA.
 */
export function armaduraEnLaPelea(s: Pick<BattleStack, 'unit' | 'effects'>): number {
  return Math.max(0, armaduraDe(s.unit) + effectTotal(s, 'armadura'));
}

/** Lo que le queda por comerse a los escudos de un hechizo de `s` (`escudo`). */
export function escudoDe(s: Pick<BattleStack, 'effects'>): number {
  let n = 0;
  for (const e of s.effects) if (e.kind === 'escudo') n += e.queda;
  return n;
}

/**
 * Si el golpe de `uso` de `unit` perfora la armadura: el disparo de un arma de fuego
 * (`GolpeConArma.tiro`, 02-11-2026, decisión del usuario: toda arma de fuego ignora la
 * armadura entera). **La única pregunta**: la hacen el daño (`computeDamage`, que lo
 * pasa a `herir`), la previsión, la IA (`expectedDamage`) y la medida del nivel.
 */
export function perforaLaArmadura(unit: UnitInfo, uso: UsoDeArma): boolean {
  return uso === 'distancia' && unit.armas?.distancia?.tiro?.kind === 'fuego';
}

/**
 * Los turnos que pasa `unit` sin apuntar tras disparar, contando aquel en que sale el
 * disparo (decisión del usuario, 02-11-2026: «cuenta ese turno»): la recarga de su
 * arma de fuego, o 0 con un arco, una ballesta o sin arma a distancia. La leen el
 * disparo (`dispararLoApuntado`) y la medida del nivel.
 */
export function recargaDe(unit: UnitInfo): number {
  const tiro = unit.armas?.distancia?.tiro;
  return tiro?.kind === 'fuego' ? tiro.recarga : 0;
}

/**
 * Las granadas que lleva `unit` a cada batalla (`Pieza.cargas`), o 0 si no lleva
 * granada. Lo gastado lo cuenta el stack (`BattleStack.granadasLanzadas`), y lo que
 * queda se deriva (`granadasQueQuedan`, `battle.ts`).
 */
export function cargasDe(unit: UnitInfo): number {
  const tiro = unit.armas?.distancia?.tiro;
  return tiro?.kind === 'granada' ? tiro.cargas : 0;
}

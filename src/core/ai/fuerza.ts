/**
 * La fuerza de un ejército y la regla de cuándo se pelea con un neutral.
 *
 * Vivía dentro de `strategy.ts` y salió de ahí cuando la regla tuvo **tres
 * lectores**: la IA que decide si ataca a un monstruo, la IA que decide si
 * ataca a un asaltante, y el asaltante que decide si embosca a un héroe
 * (`state/asaltantes.ts`). Ese tercero lo llama `game.ts`, y `game.ts` no puede
 * importar `strategy.ts` —que importa `game.ts`— sin cerrar un ciclo. Este
 * módulo no importa el estado: solo el catálogo y la tropa.
 */
import type { GrupoDeTropa } from '../data.js';
import { type Hero, heroUnit } from '../hero/hero.js';
import { ejercitoDe, type Personajes, troopUnit } from '../hero/troop.js';
import { poderBruto } from '../nivel.js';
import type { Army, UnitInfo } from '../types.js';

/**
 * Fuerza bruta de un individuo: lo que pega por lo que aguanta, **con todo lo que
 * lleva** (#129, #250, 19-10-2026): el cuadrado del poder bruto del índice
 * (`poderBruto`, `core/nivel.ts`), que mide cada arma por su uso, la rueda, la
 * carga, ataque y defensa, la armadura y lo que corre. Antes era daño medio × PV,
 * y con las unidades de la arena —el mismo cuerpo, lo distinto en el equipo— la IA
 * decidía a ciegas: no veía ni la armadura ni el arma.
 *
 * El cuadrado, porque el poder es la raíz de ofensa × aguante y la fuerza de un
 * ejército se suma individuo a individuo como se sumaba daño × PV. **Entre
 * `DIVISOR_DEL_PODER`**, para que la fuerza quede en la escala de antes y no haya
 * que medir otra vez `fuerzaMax` de los asaltantes, `MARGEN_CONTRA_NEUTRALES` ni
 * los `VALOR_DE_*` de la estrategia: es la mediana de poder² / (daño medio × PV /
 * `ESCALA_DE_CIFRAS`²) de las 21 criaturas de `data/creatures.json`, medida antes
 * de retirarlas (19-10-2026: 143 465). Con la fuerza y la agilidad (25-10-2026)
 * el poder bruto del catálogo subió (la mediana de poder², de 4 410 000 a
 * 21 977 344), y el divisor sube igual para que la mediana de la fuerza del
 * catálogo se quede donde estaba: 143 465 × 21 977 344 / 4 410 000 = 714 961. Sin
 * eso, las composiciones de los asaltantes pasaban de `fuerzaMax` y el juego no
 * cargaba. No es el nivel (`nivelDeUnidad`): es la vara de la IA para comparar
 * ejércitos.
 */
export function unitPower(info: UnitInfo): number {
  const p = poderBruto(info);
  return (p * p) / DIVISOR_DEL_PODER;
}

/** Lo que divide al poder bruto² en `unitPower`: ver allí. Medido, no inventado. */
export const DIVISOR_DEL_PODER = 714_961;

/**
 * Fuerza bruta de un ejército. Pide los personajes porque un individuo puede
 * serlo, y sus cifras salen de su perfil y no del catálogo.
 */
export function armyPower(army: Army, characters: Personajes): number {
  let power = 0;
  for (const t of army) power += unitPower(troopUnit(t, characters));
  return power;
}

/**
 * Cuánto pesa el cuerpo del héroe en `fuerzaDe`, al lado de su tropa.
 *
 * **Medido** (`tools/qa/calibrar-fuerza.ts`, #182, 08-10-2026): fotos de
 * héroes y grupos de partidas reales de lado 34, 44 y 56, peleadas con
 * `autoResolve` cambiando quién ataca, y una logística sobre ln(F_A/F_B) para
 * cada peso. Con 2 000 parejas de cada clase:
 *
 * - héroe contra héroe: log-pérdida 0,3267 con 1 y 0,3194 con 0,6, el mínimo;
 *   el acierto, 86,1 % y 86,0 %. Nada que pague mover todas las partidas.
 * - héroe contra grupo: el mínimo está en 0,75 (0,4685 frente a 0,4693), y
 *   bajar el peso empeora lo que mira `ventajaClara`: con 0,5 el grupo que
 *   embosca con margen pierde el 28,7 % de las veces; con 1, el 22,9 %.
 * - el héroe de nivel ≥ 10 sin tropa, el caso que abrió #182: gana el 61 % y
 *   con 1 se le da por el más fuerte en el 75 %. **No está infravalorado**; la
 *   batalla suelta que lo sugería era una de las que pierde el favorito.
 *
 * Se queda en 1: es el único peso cerca del mínimo en las dos clases, y el
 * que no cambia el juego. `test/ia-fuerza.test.ts` lo clava.
 */
export const PESO_DEL_CUERPO = 1;

/**
 * La fuerza de un héroe con su tropa: lo que pesa su ejército **más su propio
 * cuerpo**, que desde la fase 1b pelea en el tablero, a `PESO_DEL_CUERPO`.
 *
 * Es la única fuerza de héroe que mira la IA, y existe para que lo sea: sin el
 * cuerpo, un héroe recién vuelto a su base con el ejército vacío valía 0, no
 * perseguía a nadie y no atacaba nada — y la partida podía no acabar.
 */
export function fuerzaDe(hero: Hero, characters: Personajes): number {
  return armyPower(hero.army, characters) + PESO_DEL_CUERPO * unitPower(heroUnit(hero));
}

/**
 * La fuerza de un grupo neutral escrito en grupos de tropa —un asaltante, o los
 * que se proponen en un plan—: la misma medida que la de un héroe, sin cuerpo
 * porque no lo lleva.
 */
export function poderDe(grupo: { readonly troops: readonly GrupoDeTropa[] }): number {
  return armyPower(ejercitoDe(grupo.troops), undefined);
}

/**
 * Cuánto más fuerte hay que ser para meterse con un grupo **neutral**: un
 * monstruo quieto o un asaltante que patrulla.
 *
 * El 1,6 es el de siempre de los monstruos —«un prototipo que se suicida no se
 * puede probar»— y el asaltante lo usa **en las dos direcciones**: el héroe lo
 * ataca si le saca un 1,6, y él embosca al héroe si es él quien se lo saca. En
 * medio no pelea nadie, y por eso la regla no puede ser asimétrica: con dos
 * márgenes, uno de los dos huecos sería una batalla que la IA cree perdida y
 * el asaltante cree ganada, o al revés.
 */
export const MARGEN_CONTRA_NEUTRALES = 1.6;

/** Si `mia` le saca el margen a `suya`: **la** regla de «se cree capaz». */
export function ventajaClara(mia: number, suya: number): boolean {
  return mia > suya * MARGEN_CONTRA_NEUTRALES;
}

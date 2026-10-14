/**
 * El índice de poder y el nivel de una unidad: **un solo nivel, derivado de las
 * cifras**. El nivel es la primera cifra de un índice que sale de las cifras de
 * combate: una criatura del catálogo, un veterano, un héroe o una unidad de la
 * arena se miden con la misma vara. Lo que crece con la experiencia es el
 * **rango** (`hero/experiencia.ts`), que suma cifras; el nivel sube solo si ellas
 * lo suben.
 *
 * **Sin equipo** («el equipo va aparte»): se mide `u.sinEquipo ?? u`, lo que deja
 * `conEquipo`. Dos templarios con distinta arma son el mismo nivel.
 *
 * Todo en enteros: ni `Math.sqrt` ni `**` (`test/invariantes.test.ts`). La raíz
 * es `raizEntera`; si el producto no cabe en un entero seguro, lanza en vez de
 * redondear distinto en otra máquina. La calibración y su porqué, en
 * `data/poder.json`.
 */
import { allCreatures, hasTrait, PODER } from './data.js';
import { raizEntera } from './escala.js';
import { SPEED_TO_HEXES, type UnitInfo } from './types.js';

/**
 * El poder bruto de unas cifras: la media geométrica de lo que pega y lo que
 * aguanta, por lo que corre. El doble golpe dobla lo que pega (el doble
 * disparo, solo si tira) y tirar lo multiplica por 3/2. Monótono en cada cifra: subir una no baja el poder.
 *
 * Ataque y defensa pesan `10 + cifra`, un 10 % por punto: es **regla nuestra e
 * inventada**, no la de la fórmula de daño. Allí la defensa vale un 10 % por
 * punto mientras el ataque contrario la supera y un 2,5 % por encima de él
 * (`damageMultiplier`); con el catálogo pesan los dos tramos, y un solo peso
 * es lo que se calibró (`data/poder.json`).
 */
export function poderBruto(u: UnitInfo): number {
  const motivo = medidaBlocker(u);
  if (motivo !== null) throw new Error(`${u.name}: ${motivo}`);
  const { ofensa, aguante } = ofensaYAguante(u);
  return Math.floor((raizEntera(ofensa * aguante) * (10 + SPEED_TO_HEXES[u.speed])) / 10);
}

/** Lo que pega y lo que aguanta, cuyo producto mide `poderBruto`. */
function ofensaYAguante(u: UnitInfo): { readonly ofensa: number; readonly aguante: number } {
  let ofensa = (u.damage[0] + u.damage[1]) * (10 + u.attack);
  // Un rasgo de tiro pesa solo en quien tira: sin tiros no actúa. El Montaraz
  // hecho «Nueva unidad» lleva el disparo doble de su criatura en el cuerpo
  // común, que no dispara, y subía de 177 a 209, al nivel 2, por un rasgo que
  // nunca usa (R2 de la re-verificación de QA, 12-10-2026). Se mide el cuerpo
  // sin equipo: tira el cuerpo si tiene munición (`shots`, la criatura del
  // catálogo); un arma a distancia es equipo y no cuenta (`isShooter` la vería).
  const tira = (u.shots ?? 0) > 0;
  if (hasTrait(u, 'double_attack') || (tira && hasTrait(u, 'double_shot'))) ofensa *= 2;
  if (tira) ofensa = Math.floor((ofensa * 3) / 2);
  return { ofensa, aguante: u.hp * (10 + u.defense) };
}

/**
 * **Qué cifras se pueden medir**: por qué estas no, o `null` si sí. El índice va
 * en enteros y el producto de lo que pega por lo que aguanta tiene que caber en
 * uno seguro; si no, otra máquina redondearía distinto. Lo leen `poderBruto`,
 * que lanza con él, la validación de la arena (la hoja del borrador y la prueba
 * del catálogo), que rechaza la cifra antes de que llegue a una pelea, y la
 * carga del catálogo (`catalogoMedible`). Con un Guerrero con escudo a 10¹⁵ PV,
 * la arena aceptaba la cifra y la pelea se quedaba en «Contando la jugada…»: el
 * primer golpe que recibía lanzaba dentro de `herir` (QA del 12-10-2026).
 */
export function medidaBlocker(u: UnitInfo): string | null {
  const cuerpo = u.sinEquipo ?? u;
  const { ofensa, aguante } = ofensaYAguante(cuerpo);
  if (Number.isSafeInteger(ofensa) && Number.isSafeInteger(aguante)) {
    if (Number.isSafeInteger(ofensa * aguante)) return null;
  }
  return `estas cifras son demasiado grandes para medir su nivel (${cuerpo.damage[0]}-${cuerpo.damage[1]} de daño, ${cuerpo.hp} PV, ataque ${cuerpo.attack}, defensa ${cuerpo.defense}): baja la vida o el daño`;
}

/**
 * Comprueba que cada criatura de un catálogo se puede medir y lanza diciendo
 * cuál no. Corre al cargar este módulo sobre `data/creatures.json`: aquí y no en
 * `data.ts` porque `nivel.ts` ya lee de `data.ts` y el revés sería un ciclo.
 */
export function catalogoMedible(
  criaturas: readonly UnitInfo[],
  fichero = 'data/creatures.json',
): void {
  for (const c of criaturas) {
    const motivo = medidaBlocker(c);
    if (motivo !== null) throw new Error(`${fichero}: la criatura «${c.name}»: ${motivo}`);
  }
}

catalogoMedible(allCreatures());

/**
 * El índice de poder de una unidad, sin su equipo: `100 · nivel` más lo recorrido
 * hacia el siguiente nivel, en centésimas (340 es el nivel 3, a un 40 % del 4).
 * Por debajo del umbral del nivel 2 todo es el nivel 1 (100-199): así la primera
 * cifra es siempre el nivel, y no hay nivel 0.
 */
export function indiceDePoder(u: UnitInfo): number {
  const cuerpo = u.sinEquipo ?? u;
  const guardado = INDICE_POR_CIFRAS.get(cuerpo);
  if (guardado !== undefined) return guardado;
  const indice = indiceDelPoder(poderBruto(cuerpo));
  INDICE_POR_CIFRAS.set(cuerpo, indice);
  return indice;
}

/**
 * El índice ya calculado de cada objeto de cifras. Las cifras son inmutables
 * —retocarlas en la arena pone otro objeto— y `herir` pregunta en cada golpe,
 * también los que la IA simula: sin esto, una raíz por golpe. Débil,
 * para no retener cifras que ya no lleva nadie. Una función pura recordada.
 */
const INDICE_POR_CIFRAS = new WeakMap<UnitInfo, number>();

/**
 * Del poder bruto al índice. El umbral del nivel 2 es `umbralDelNivel2` y cada
 * uno es el anterior × `razon`; `validarPoder` garantiza que cada umbral pasa
 * del anterior, así que el bucle acaba. Por debajo del nivel 2, todo es el 1.
 */
function indiceDelPoder(p: number): number {
  const [num, den] = PODER.razon;
  let desde = PODER.umbralDelNivel2;
  if (p < desde) return 100 + Math.floor((100 * p) / desde);
  let nivel = 2;
  let hasta = Math.floor((desde * num) / den);
  while (p >= hasta) {
    nivel++;
    desde = hasta;
    hasta = Math.floor((desde * num) / den);
  }
  return 100 * nivel + Math.floor((100 * (p - desde)) / (hasta - desde));
}

/**
 * **El nivel de una unidad**: la primera cifra de su índice de poder. Lo leen el
 * contrato y los paneles. Nadie más lo calcula ni lo escribe. La experiencia
 * (`herir`) no cobra por él sino por el índice entero, que es más fino: un
 * veterano que sube cifras paga más aunque no cambie de nivel.
 */
export function nivelDeUnidad(u: UnitInfo): number {
  return nivelDelIndice(indiceDePoder(u));
}

/** El nivel de un índice ya calculado: su primera cifra (340 → 3). */
export function nivelDelIndice(indice: number): number {
  return Math.floor(indice / 100);
}

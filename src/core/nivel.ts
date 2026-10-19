/**
 * El índice de poder y el nivel de una unidad: **un solo nivel, derivado de las
 * cifras**. El nivel es la primera cifra de un índice que sale de las cifras de
 * combate: una criatura del catálogo, un veterano, un héroe o una unidad de la
 * arena se miden con la misma vara. Lo que crece con la experiencia es el
 * **rango** (`hero/experiencia.ts`), que suma cifras; el nivel sube solo si ellas
 * lo suben.
 *
 * **Con su equipo** (decisión del usuario, 18-10-2026: «el nivel ve el equipo»):
 * se mide la unidad tal como pelea, lo que deja `conEquipo`. Las unidades de la
 * arena nacen todas del mismo cuerpo común y lo que las distingue es el equipo:
 * sin él caían todas en el nivel 1, y de ese índice salen la
 * experiencia, y saldrán la morada, el coste y el crecimiento. Lo que la regla
 * anterior medía sin equipo lo cuenta `docs/historia.md`.
 *
 * Todo en enteros: ni `Math.sqrt` ni `**` (`test/invariantes.test.ts`). La raíz
 * es `raizEntera`; si el producto no cabe en un entero seguro, lanza en vez de
 * redondear distinto en otra máquina. La calibración y su porqué, en
 * `data/poder.json`.
 */
import {
  cifrasDelGolpe,
  disparosDe,
  golpeDe,
  golpesDe,
  porcientoDelTipo,
  ruedaDelGolpe,
  trasLaArmadura,
} from './battle/armas.js';
import { cifrasDeCarga, porcientoDeLaCarga } from './battle/carga.js';
import type { CifrasDeLaRueda } from './battle/cifras-de-la-rueda.js';
import { isShooter, PODER } from './data.js';
import { raizEntera } from './escala.js';
import {
  SPEED_TO_HEXES,
  TIPOS_DE_GOLPE,
  type TipoDeGolpe,
  type UnitInfo,
  type UsoDeArma,
} from './types.js';

/**
 * El poder bruto de unas cifras: la media geométrica de lo que pega y lo que
 * aguanta, por lo que corre. Monótono en cada cifra: subir una no baja el poder.
 *
 * Ataque y defensa pesan `10 + cifra`, un 10 % por punto: es **regla nuestra e
 * inventada**, no la de la fórmula de daño. Allí la defensa vale un 10 % por
 * punto mientras el ataque contrario la supera y un 2,5 % por encima de él
 * (`damageMultiplier`); con el catálogo pesan los dos tramos, y un solo peso
 * es lo que se calibró (`data/poder.json`).
 */
export function poderBruto(u: UnitInfo): number {
  const m = medida(u);
  if ('motivo' in m) throw new Error(`${u.name}: ${m.motivo}`);
  return Math.floor((raizEntera(m.ofensa * m.aguante) * (10 + SPEED_TO_HEXES[u.speed])) / 10);
}

/** Lo que pega y lo que aguanta una unidad, cuyo producto mide `poderBruto`. */
interface Medida {
  readonly ofensa: number;
  readonly aguante: number;
}

/**
 * La medida de `u`, o por qué no se puede medir. **Una sola cuenta**, que leen
 * `poderBruto` (lanza con el motivo) y `medidaBlocker` (lo devuelve): el índice va
 * en enteros y el producto de lo que pega por lo que aguanta tiene que caber en
 * uno seguro; si no, otra máquina redondearía distinto.
 */
function medida(u: UnitInfo): Medida | { readonly motivo: string } {
  const ofensa = ofensaDe(u);
  const aguante = aguanteDe(u);
  if (
    Number.isSafeInteger(ofensa) &&
    Number.isSafeInteger(aguante) &&
    Number.isSafeInteger(ofensa * aguante)
  ) {
    return { ofensa, aguante };
  }
  return {
    motivo: `estas cifras son demasiado grandes para medir su nivel (${u.damage[0]}-${u.damage[1]} de daño, ${u.hp} PV, ataque ${u.attack}, defensa ${u.defense}): baja la vida o el daño`,
  };
}

/**
 * **Lo que pega es el mejor de sus ataques**, cada golpe con el arma de su uso
 * (`golpeDe`, `cifrasDelGolpe`): el de cuerpo a cuerpo y la carga, por lo que da
 * la rueda (`ofensaDelAtaque`), y el disparo si tira (×3/2, por sus tiros,
 * `disparosDe`). Un golpe que no se da no cuenta: el Montaraz hecho «Nueva
 * unidad» lleva el disparo doble de su criatura sin nada con que disparar, y subía
 * al nivel 2 por un rasgo que nunca usa (R2 de la re-verificación de QA,
 * 12-10-2026).
 *
 * **Con la regla final de la carga** (simplify de F1, 18-10-2026): carga todo el
 * que pega cuerpo a cuerpo, a pie si no tiene el rasgo (`cifrasDeCarga(u, true)`),
 * como pelearán todas desde que el juego juegue los modos de la arena; medirla ya
 * así deja quietos el índice, la experiencia y lo que se derive de él cuando se
 * enciendan. Se mide a media recta: la mitad de lo que cobra la recta entera.
 */
function ofensaDe(u: UnitInfo): number {
  const cuerpo = golpeMedido(u, 'arma');
  let ofensa = ofensaDelAtaque(u, cuerpo, cuerpo, null);
  if (isShooter(u)) {
    const disparo = golpeMedido(u, 'distancia').ofensa * disparosDe(u);
    ofensa = Math.max(ofensa, Math.floor((disparo * 3) / 2));
  }
  const carga = cifrasDeCarga(u);
  const cobra = 100 + Math.floor(porcientoDeLaCarga(carga.tope, carga) / 2);
  return Math.max(ofensa, ofensaDelAtaque(u, golpeMedido(u, 'lanza'), cuerpo, cobra));
}

/** Un golpe de un uso, medido: lo que pega sin multiplicar y lo que le da la rueda de su arma. */
interface GolpeMedido {
  /** (daño mín + máx) · (10 + ataque), con las cifras de su arma (`cifrasDelGolpe`). */
  readonly ofensa: number;
  /** Las cifras de la rueda de su arma, o `null` si ese golpe no va por ella (sin arma de la arena). */
  readonly rueda: CifrasDeLaRueda | null;
}

/** El golpe de `uso` de `u`, medido una vez por medida (`GolpeMedido`). */
function golpeMedido(u: UnitInfo, uso: UsoDeArma): GolpeMedido {
  const { attack, damage } = cifrasDelGolpe(u, uso);
  return {
    ofensa: (damage[0] + damage[1]) * (10 + attack),
    rueda: golpeDe(u, uso).rueda === undefined ? null : ruedaDelGolpe(u, uso),
  };
}

/**
 * Lo que pega un ataque cuerpo a cuerpo de `u` que abre con el golpe `primero` y
 * sigue con `cuerpo`, con la carga que cobra (`cobra`, en tanto por ciento: 125
 * suma un 25 %) o sin ella (`null`, y entonces `primero` es `cuerpo`): la media de los
 * siete tipos de la rueda con los pesos de la medida (`PODER.pesosDeLaRueda`), cada
 * uno con sus golpes (`golpesDe`: el doble golpe dobla, Rápido da los suyos) y
 * cada golpe con el arma de su uso y lo que esa arma da a ese tipo
 * (`porcientoDelTipo`: Fuerte y Rápido; los demás, ×1). **La carga la cobra solo
 * el primer golpe**, con el arma de carga; los demás van con la de cuerpo a cuerpo
 * y sin carga, como en la pelea (`intercambio`). Ofensivo, Defensivo, Romper
 * guardia y Finta no hacen daño y no pesan. **Sin arma de la arena no hay rueda**
 * (la criatura del catálogo del juego): un tipo solo, sin Rápido, y ×1.
 * **Inventado** (18-10-2026).
 */
function ofensaDelAtaque(
  u: UnitInfo,
  primero: GolpeMedido,
  cuerpo: GolpeMedido,
  cobra: number | null,
): number {
  /** Lo que pegan los golpes de un ataque de `tipo` (`null`, sin rueda), en diezmilésimas. */
  const danioDe = (tipo: TipoDeGolpe | null): number => {
    let danio = 0;
    for (let i = 0; i < golpesDe(u, tipo, false); i++) {
      const g = i === 0 ? primero : cuerpo;
      const porciento = g.rueda === null || tipo === null ? 100 : porcientoDelTipo(tipo, g.rueda);
      danio += g.ofensa * porciento * (i === 0 && cobra !== null ? cobra : 100);
    }
    return danio;
  };
  if (cuerpo.rueda === null) return Math.floor(danioDe(null) / (100 * 100));
  const pesos = PODER.pesosDeLaRueda;
  let num = 0;
  let suma = 0;
  for (const tipo of TIPOS_DE_GOLPE) {
    num += pesos[tipo] * danioDe(tipo);
    suma += pesos[tipo];
  }
  return Math.floor(num / (suma * 100 * 100));
}

/**
 * **Lo que aguanta, con su armadura**: cada golpe que llega pierde los puntos de
 * armadura (`trasLaArmadura`, la misma resta de la pelea), así que se mide contra
 * un golpe de referencia (`PODER.armaduraDeReferencia`, R = 30, **inventado**): los
 * PV cuentan R / lo que llega de R, y como mucho ×4 (la armadura que para casi
 * todo no hace a nadie inmortal en la cuenta). **Inventado** (18-10-2026).
 */
function aguanteDe(u: UnitInfo): number {
  const R = PODER.armaduraDeReferencia;
  const llega = Math.max(trasLaArmadura(R, { unit: u }).danio, Math.floor(R / 4), 1);
  return Math.floor((u.hp * (10 + u.defense) * R) / llega);
}

/**
 * **Qué cifras se pueden medir**: por qué estas no, o `null` si sí (`medida`). Lo
 * leen `poderBruto`, la validación de la arena (la hoja del catálogo y su
 * prueba), que rechaza la cifra antes de que llegue a una pelea, también al
 * cargar el catálogo de unidades (`equipoDeUnidadBlocker`). Con un Guerrero con escudo a 10¹⁵
 * PV, la arena aceptaba la cifra y la pelea se quedaba en «Contando la jugada…»:
 * el primer golpe que recibía lanzaba dentro de `herir` (QA del 12-10-2026).
 */
export function medidaBlocker(u: UnitInfo): string | null {
  const m = medida(u);
  return 'motivo' in m ? m.motivo : null;
}

/**
 * El índice de poder de una unidad, con su equipo: `100 · nivel` más lo recorrido
 * hacia el siguiente nivel, en centésimas (340 es el nivel 3, a un 40 % del 4).
 * Por debajo del umbral del nivel 2 todo es el nivel 1 (100-199): así la primera
 * cifra es siempre el nivel, y no hay nivel 0.
 */
export function indiceDePoder(u: UnitInfo): number {
  const guardado = INDICE_POR_CIFRAS.get(u);
  if (guardado !== undefined) return guardado;
  const indice = indiceDelPoder(poderBruto(u));
  INDICE_POR_CIFRAS.set(u, indice);
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

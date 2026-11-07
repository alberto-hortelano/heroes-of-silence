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
import poderJson from '../../../data/poder.json' with { type: 'json' };
import {
  cifrasDelGolpe,
  disparosDe,
  golpeDe,
  golpesDe,
  perforaLaArmadura,
  porcientoDelTipo,
  recargaDe,
  ruedaDelGolpe,
  tiroADistanciaDe,
  trasLaArmadura,
} from '../battle/armas.js';
import { CARGA, porcientoDeLaCarga } from '../battle/carga.js';
import type { CifrasDeLaRueda } from '../battle/cifras-de-la-rueda.js';
import { type GolpeDeReferencia, RUEDA_DE_REFERENCIA } from '../battle/formas-de-la-rueda.js';
import { raizEntera } from '../escala.js';
import { SPEED_TO_HEXES, type TipoDeGolpe, type UnitInfo, type UsoDeArma } from '../types.js';
import { enteroDesde, esObjeto } from '../validar.js';

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
  const guardado = PODER_POR_CIFRAS.get(u);
  if (guardado !== undefined) return guardado;
  const m = medida(u);
  if ('motivo' in m) throw new Error(`${u.name}: ${m.motivo}`);
  const p = Math.floor((raizEntera(m.ofensa * m.aguante) * (10 + SPEED_TO_HEXES[u.speed])) / 10);
  PODER_POR_CIFRAS.set(u, p);
  return p;
}

/**
 * El poder bruto ya calculado de cada objeto de cifras. Las cifras son inmutables
 * —retocarlas en la arena pone otro objeto— y lo preguntan `herir` en cada golpe
 * (el índice, `indiceDePoder`) y la IA en cada comparación de fuerzas
 * (`unitPower`), también los golpes que simula: sin esto, una raíz por pregunta.
 * Débil, para no retener cifras que ya no lleva nadie. Una función pura recordada.
 */
const PODER_POR_CIFRAS = new WeakMap<UnitInfo, number>();

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
    motivo: `estas cifras son demasiado grandes para medir su nivel (${u.damage[0]}-${u.damage[1]} de daño, ${u.hp} PV, ataque ${u.attack}, defensa ${u.defense}): baja la vida o la fuerza`,
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
 * **Con la regla de la carga** (simplify de F1, 18-10-2026): carga todo el que
 * pega cuerpo a cuerpo, como pelea toda batalla, y montado de guerra y con lanza
 * con la horquilla de la carga (`GolpeConArma.carga`, 26-10-2026) en el primer
 * golpe. Se mide a media recta: la mitad de lo que cobra la recta entera.
 */
function ofensaDe(u: UnitInfo): number {
  const cuerpo = golpeMedido(u, 'arma');
  let ofensa = ofensaDelAtaque(u, cuerpo, cuerpo, null);
  if (tiroADistanciaDe(u) !== null) {
    ofensa = Math.max(ofensa, ofensaDelDisparo(u));
  }
  const cobra = 100 + Math.floor(porcientoDeLaCarga(CARGA.tope, CARGA) / 2);
  return Math.max(ofensa, ofensaDelAtaque(u, primeroDeLaCarga(u, cuerpo), cuerpo, cobra));
}

/**
 * Lo que pega el disparo de `u` (o su granada), medido: ×3/2 por sus tiros
 * (`disparosDe`) y, con un arma de fuego (02-11-2026, a ojo, `data/poder.json`),
 * × `pesoDeLaRecarga / (pesoDeLaRecarga + recarga)` por lo que no dispara mientras
 * recarga y × `perforacion` por lo que no le para la armadura. La granada, como un
 * disparo: su área paga sus cargas.
 */
function ofensaDelDisparo(u: UnitInfo): number {
  const disparo = golpeMedido(u, 'distancia').ofensa * disparosDe(u);
  let num = disparo * 3;
  let den = 2;
  const recarga = recargaDe(u);
  if (recarga > 0) {
    num *= PODER.pesoDeLaRecarga;
    den *= PODER.pesoDeLaRecarga + recarga;
  }
  if (perforaLaArmadura(u, 'distancia')) {
    num *= PODER.perforacion[0];
    den *= PODER.perforacion[1];
  }
  return Math.floor(num / den);
}

/**
 * El primer golpe de una carga, medido: el de cuerpo a cuerpo o, montado de guerra
 * y con lanza, el mismo con la horquilla de la carga (la fuerza de la montura y la
 * de la lanza), que es con lo que tira la batalla (`deUnGolpe`, `damage.ts`).
 */
function primeroDeLaCarga(u: UnitInfo, cuerpo: GolpeMedido): GolpeMedido {
  const { carga } = golpeDe(u, 'arma');
  if (carga === undefined) return cuerpo;
  const { attack } = cifrasDelGolpe(u, 'arma');
  return { ...cuerpo, ofensa: (carga[0] + carga[1]) * (10 + attack) };
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
 * el primer golpe**, con las armas de cuerpo a cuerpo (25-10-2026: la lanza es una
 * de ellas); los demás, sin carga, como en la pelea (`intercambio`). Ofensivo, Defensivo, Romper
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
  // Con la rueda de referencia, sea cual sea la de la partida: lo que vale un arma
  // no depende del nivel de complejidad que se juegue.
  for (const tipo of RUEDA_DE_REFERENCIA.golpes) {
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
  const llega = Math.max(
    trasLaArmadura(R, { unit: u, effects: [] }, false).danio,
    Math.floor(R / 4),
    1,
  );
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
  // Del poder bruto recordado (`poderBruto`): lo que queda son unas pocas sumas.
  return indiceDelPoder(poderBruto(u));
}

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

/**
 * Las cifras del índice de poder, de `data/poder.json` (`unidad/nivel.ts`).
 * **Inventadas y provisionales**, como dice su `_comment`: es la calibración que
 * deja cada criatura del catálogo en el nivel de su morada o en el contiguo.
 */
export interface ReglasDelPoder {
  /** El poder con el que empieza el nivel 2: por debajo, todo es el nivel 1. */
  readonly umbralDelNivel2: number;
  /** Cada umbral es el anterior × `razon[0]` / `razon[1]`: dos enteros, sin coma flotante. */
  readonly razon: readonly [number, number];
  /**
   * La armadura con la que se mide cuánto aguanta una unidad que la lleva: el
   * golpe de referencia (`unidad/nivel.ts`). Entero ≥ 1.
   */
  readonly armaduraDeReferencia: number;
  /**
   * Cuánto pesa cada tipo de la rueda en lo que pega una unidad (`unidad/nivel.ts`):
   * uno por tipo de la rueda de referencia (`GOLPES_DE_LA_MEDIDA`, con la que se mide
   * todo índice), enteros ≥ 0 y al menos uno > 0. Propios de la medida, no los de
   * la IA (`PESOS_DE_LA_RUEDA`): retocar cómo elige la IA no mueve índices.
   */
  readonly pesosDeLaRueda: Readonly<Record<GolpeDeReferencia, number>>;
  /**
   * Cuánto baja la recarga lo que pega un arma de fuego (02-11-2026): el disparo se
   * mide × `pesoDeLaRecarga / (pesoDeLaRecarga + recarga)`. Entero ≥ 1.
   */
  readonly pesoDeLaRecarga: number;
  /** Lo que sube perforar la armadura lo que pega un arma de fuego: × `[0] / [1]`, ≥ 1. */
  readonly perforacion: readonly [number, number];
}

/**
 * Los tipos con que se mide el índice de poder: los de la rueda de referencia, sea
 * cual sea la de la partida (decisión del plan de la complejidad del combate,
 * 22-10-2026: lo que vale un arma no depende del nivel que se juegue).
 */
const GOLPES_DE_LA_MEDIDA = RUEDA_DE_REFERENCIA.golpes;

/**
 * Una razón de `data/poder.json`, `[numerador, denominador]` con dos enteros ≥ 1, o
 * `null` con su problema apuntado en `problemas`: la forma de `razon` y de
 * `perforacion` (hallazgo S11 de /simplify, 02-11-2026: la segunda copiaba la primera).
 */
function fraccionDelPoder(
  v: unknown,
  campo: string,
  problemas: string[],
): readonly [number, number] | null {
  if (!Array.isArray(v) || v.length !== 2 || !v.every((x) => enteroDesde(x, 1))) {
    problemas.push(
      `${campo} tiene que ser [numerador, denominador], dos enteros ≥ 1, y es ${JSON.stringify(v)}`,
    );
    return null;
  }
  return [v[0] as number, v[1] as number];
}

/**
 * Valida las reglas del índice de poder y las devuelve tipadas; lanza con todos
 * los problemas a la vez. **Una razón ≤ 1 se rechaza**: con ella los umbrales no
 * crecen y el bucle que los calcula no acabaría, o dos niveles empezarían en el
 * mismo poder. Exportada con el JSON de argumento para que un test la vea morder.
 */
export function validarPoder(json: unknown, fichero = 'data/poder.json'): ReglasDelPoder {
  const problemas: string[] = [];
  const j = (json ?? {}) as Record<string, unknown>;
  if (!enteroDesde(j.umbralDelNivel2, 1)) {
    problemas.push(`umbralDelNivel2 tiene que ser un entero ≥ 1 y es ${j.umbralDelNivel2}`);
  }
  const r = fraccionDelPoder(j.razon, 'razon', problemas);
  if (r !== null && r[0] <= r[1]) {
    problemas.push(
      `razon ${r[0]}/${r[1]} no pasa de 1: los umbrales de nivel tienen que crecer, o dos niveles empezarían en el mismo poder`,
    );
  } else if (
    r !== null &&
    enteroDesde(j.umbralDelNivel2, 1) &&
    Math.floor((j.umbralDelNivel2 * r[0]) / r[1]) <= j.umbralDelNivel2
  ) {
    // En enteros, ⌊u · n / d⌋ puede quedarse en u con un umbral pequeño y una
    // razón cerca de 1; si el primer paso crece, crecen todos (n/d > 1).
    problemas.push(
      `con umbralDelNivel2 ${j.umbralDelNivel2} y razon ${r[0]}/${r[1]} el umbral del nivel 3 sale igual que el del 2, en enteros: sube el umbral o la razón`,
    );
  }
  if (!enteroDesde(j.armaduraDeReferencia, 1)) {
    problemas.push(
      `armaduraDeReferencia tiene que ser un entero ≥ 1 y es ${j.armaduraDeReferencia}`,
    );
  }
  const pesos = j.pesosDeLaRueda;
  const sonPesos =
    esObjeto(pesos) &&
    Object.keys(pesos).length === GOLPES_DE_LA_MEDIDA.length &&
    GOLPES_DE_LA_MEDIDA.every((t) => enteroDesde(pesos[t], 0));
  if (!sonPesos) {
    problemas.push(
      `pesosDeLaRueda tiene que ser un entero ≥ 0 por cada tipo de la rueda de referencia (${GOLPES_DE_LA_MEDIDA.join(', ')}), y es ${JSON.stringify(pesos)}`,
    );
  } else if (GOLPES_DE_LA_MEDIDA.every((t) => (pesos as Record<string, number>)[t] === 0)) {
    problemas.push('pesosDeLaRueda son todos 0: alguno tiene que pesar');
  }
  if (!enteroDesde(j.pesoDeLaRecarga, 1)) {
    problemas.push(`pesoDeLaRecarga tiene que ser un entero ≥ 1 y es ${j.pesoDeLaRecarga}`);
  }
  const f = fraccionDelPoder(j.perforacion, 'perforacion', problemas);
  if (f !== null && f[0] < f[1]) {
    problemas.push(
      `perforacion ${f[0]}/${f[1]} baja de 1: perforar la armadura no puede restar a lo que pega`,
    );
  }
  if (problemas.length > 0 || r === null || f === null) {
    throw new Error(`${fichero}: ${problemas.join('; ')}`);
  }
  return {
    pesoDeLaRecarga: j.pesoDeLaRecarga as number,
    perforacion: f,
    umbralDelNivel2: j.umbralDelNivel2 as number,
    razon: r,
    armaduraDeReferencia: j.armaduraDeReferencia as number,
    pesosDeLaRueda: pesos as Record<GolpeDeReferencia, number>,
  };
}

export const PODER: ReglasDelPoder = validarPoder(poderJson);

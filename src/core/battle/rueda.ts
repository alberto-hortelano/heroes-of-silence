/**
 * La rueda del golpe: el combate por decisión (decisión del usuario, 13-10-2026,
 * docs/agents/2026-10-13-rueda-del-golpe/). **Regla nuestra**: nació en la arena
 * y desde el 19-10-2026 es el golpe cuerpo a cuerpo de toda batalla; el disparo
 * sigue con su tirada.
 *
 * Al golpear cuerpo a cuerpo, quien ataca elige un tipo de golpe y quien recibe
 * elige su respuesta, a la vez y sin ver el otro. El cruce de los dos fija el
 * daño dentro de la horquilla de la criatura en lugar de tirarlo; la respuesta es
 * además el tipo de su contraataque, que cae en el punto contrario. Y cada tipo
 * tiene su efecto (`data/rueda.json`, inventado).
 *
 * ```
 *           ofensivo
 * r.guardia          fuerte
 *           normal
 * rápido             finta
 *          defensivo
 * ```
 *
 * Los opuestos: Ofensivo y Defensivo, Fuerte y Rápido, Finta y Romper guardia
 * (el anillo nuevo, 14-10-2026, #263).
 *
 * Aquí está la regla una vez: el punto del cruce, la tirada fija de cada punto,
 * cuántos golpes da cada tipo y sus cifras, con sus notas para la persona. Las
 * formas de las tres ruedas (7, 5 y 3: qué sectores, cómo se cruzan, sus
 * nombres), en `formas-de-la-rueda.ts`, que se reexporta aquí. Puro: no importa
 * `battle.ts`; lo leen el motor (`applyAction`, `melee`, el daño), la IA
 * (`ai/rueda.ts`), las sesiones y la rueda del cliente.
 */
import { conSigno } from '../hero/equipo.js';
import {
  conComa,
  esTipoDeGolpe,
  type NivelesDeLaRueda,
  TIPOS_DEL_ANILLO,
  type TipoDeGolpe,
  type TipoDelAnillo,
  type UnitInfo,
} from '../types.js';
import { porcientoDelTipo } from './armas.js';
import { type CargaDeLaRueda, cargaDeLaRueda } from './carga.js';
import {
  type CifrasDeLaRueda,
  cifrasDeLosNiveles,
  type EfectoDelTipo,
  efectoDelTipo,
  golpesDelTipo,
  NOMBRE_DE_GOLPE,
  type PapelEnLaRueda,
  type PorExito,
  PUNTOS,
  type Punto,
} from './cifras-de-la-rueda.js';
import { type CruceDelGolpe, tiradaEnCuartos } from './damage.js';
import type { CuandoVence } from './effects.js';
import {
  cicloDe,
  esFusionado,
  type FormaDeLaRueda,
  nombreEnLaRueda,
  PARTES,
  tipoDeGolpeBlocker,
} from './formas-de-la-rueda.js';
import type { BattleAction, BattleEvent } from './types.js';

export {
  type CifrasDeLaRueda,
  type EfectoDelTipo,
  efectoDelTipo,
  NIVEL_MAXIMO,
  NOMBRE_DE_GOLPE,
  NORMAL_SIN_NIVEL,
  type PapelEnLaRueda,
  PESOS_DE_LA_RUEDA,
  type PesosDeLaRueda,
  type PorExito,
  PUNTOS,
  type Punto,
  validarRueda,
} from './cifras-de-la-rueda.js';
export {
  type CruceDeLaRueda,
  cicloDe,
  dichoDelCruce,
  esDeLaRueda,
  type FormaDeLaRueda,
  formaDeLaBatalla,
  golpeNeutro,
  LAS_TRES_RUEDAS,
  lasRuedasQue,
  nivelesEnLaForma,
  nombreEnLaRueda,
  PARTES,
  RUEDA_DE_REFERENCIA,
  RUEDAS,
  TIPOS_DE_LAS_RUEDAS,
  type TiposDeLaRueda,
  tipoDeGolpeBlocker,
} from './formas-de-la-rueda.js';
// Los tipos viven en `types.ts`, porque los nombra la pieza (`Pieza.rueda`), y la
// tabla de los niveles, en `cifras-de-la-rueda.ts`, que lee la regla de una
// pieza: aquí se reexportan, que es donde los busca quien lee la rueda.
export { esTipoDeGolpe, type TipoDeGolpe, type TipoDelAnillo };

/** El punto según la distancia en el anillo: igual, al lado, a dos, enfrente. */
const PUNTO_POR_DISTANCIA: readonly Punto[] = [0, 1, 3, 4];

/**
 * Dónde cae el golpe de quien elige `golpe` contra quien responde `respuesta` en
 * la rueda `forma`: con Normal en cualquiera de los dos, el medio. Si no, en la de
 * 7, por la distancia en el anillo (de 0 a 3): mínimo, bajo, alto, máximo,
 * simétrica. En un ciclo (3 y 5; decisión del usuario, 22-10-2026), cada sector
 * gana al siguiente en el sentido del reloj: si gana el golpe, el máximo; si gana
 * la respuesta, el mínimo; con el mismo o el de enfrente, el medio. El
 * contraataque cae en el contrario (`puntoDelContraataque`). Lanza con un tipo que
 * no es de la rueda (un fallo: `cruceBlocker` lo rechaza antes).
 */
export function puntoDelCruce(
  golpe: TipoDeGolpe,
  respuesta: TipoDeGolpe,
  forma: FormaDeLaRueda,
): Punto {
  const a = puestoEnElAnillo(golpe, forma);
  const b = puestoEnElAnillo(respuesta, forma);
  if (a === null || b === null) return 2;
  const n = forma.anillo.length;
  if (forma.cruce === 'distancia') {
    const d = Math.abs(a - b);
    return PUNTO_POR_DISTANCIA[Math.min(d, n - d)] as Punto;
  }
  // Los pasos del golpe a la respuesta en el sentido del reloj.
  const d = (b - a + n) % n;
  if (d === 1) return 4;
  if (d === n - 1) return 0;
  return 2;
}

const PUNTOS_DE_LA_FORMA = new WeakMap<FormaDeLaRueda, readonly Punto[]>();

/**
 * Los puntos en que puede caer un cruce de la rueda `forma`, del mínimo al máximo:
 * en la de 7, los cinco; en un ciclo, el mínimo, el medio y el máximo. **Derivados
 * de `puntoDelCruce`** (todo golpe contra toda respuesta), no escritos: lo que
 * diga la regla es lo que se enseña. De aquí leen las notas por éxito
 * (`efectoDeGolpe`), la horquilla de cada sector (`puntosDe`), el contraataque
 * rebajado de la previsión y las muescas del medidor del desenlace. Con la tabla
 * de cinco de la de 7, las ruedas de 3 y 5 hablaban de un éxito «alto» y «bajo»
 * que su cruce no da (QA de la complejidad, vuelta 2, 22-10-2026).
 */
export function puntosDeLaForma(forma: FormaDeLaRueda): readonly Punto[] {
  const hechos = PUNTOS_DE_LA_FORMA.get(forma);
  if (hechos !== undefined) return hechos;
  const caen = new Set<Punto>();
  for (const golpe of forma.golpes) {
    for (const respuesta of forma.golpes) caen.add(puntoDelCruce(golpe, respuesta, forma));
  }
  const puntos = PUNTOS.filter((p) => caen.has(p));
  PUNTOS_DE_LA_FORMA.set(forma, puntos);
  return puntos;
}

/**
 * El puesto de `tipo` en el anillo de `forma`, o `null` si es Normal y la rueda lo
 * lleva en el centro; lanza con un tipo que no es de ella.
 */
function puestoEnElAnillo(tipo: TipoDeGolpe, forma: FormaDeLaRueda): number | null {
  const i = forma.anillo.indexOf(tipo);
  if (i >= 0) return i;
  if (tipo === 'normal' && forma.centro) return null;
  throw new Error(tipoDeGolpeBlocker(tipo, forma) ?? `«${tipo}» no está en el anillo`);
}

/**
 * El punto del contraataque: el contrario. Quien acierta la respuesta recibe el
 * mínimo y devuelve el máximo (decisión del usuario: «invertido»).
 */
export function puntoDelContraataque(p: Punto): Punto {
  return (4 - p) as Punto;
}

/**
 * La tirada de un individuo en el punto `p` de su horquilla, en enteros: el
 * punto es un cuarto de ella (`tiradaEnCuartos`, la cuenta del daño).
 */
export function tiradaDelPunto(min: number, max: number, p: Punto): number {
  return tiradaEnCuartos(min, max, p);
}

/**
 * Los puntos en que puede caer un golpe de este tipo de la rueda `forma` sin saber
 * la respuesta: con Normal, siempre el medio; con los demás, del menor al mayor
 * que da su cruce (`puntosDeLaForma`). La horquilla de cada sector de la rueda.
 */
export function puntosDe(tipo: TipoDeGolpe, forma: FormaDeLaRueda): readonly [Punto, Punto] {
  if (tipo === 'normal') return [2, 2];
  const puntos = puntosDeLaForma(forma);
  return [puntos[0] as Punto, puntos.at(-1) as Punto];
}

/**
 * El efecto que deja un golpe de la rueda: un efecto temporal de ataque o de
 * defensa. `a`, a quién: a quien pega (`propio`, antes de sus golpes: Defensivo
 * cubre ya el contraataque) o al atacado (`rival`, tras el golpe y antes de su
 * contraataque: Romper guardia le quita ataque ya en él). `vence`, cuándo se va.
 * Solo el golpe deja efectos: la respuesta no da bonificadores (decisión del
 * usuario, 14-10-2026).
 */
export interface EfectoDeLaRueda {
  readonly kind: 'attack' | 'defense';
  readonly amount: number;
  readonly a: 'propio' | 'rival';
  readonly vence: CuandoVence;
  /**
   * El tipo con que se golpeó: es el origen del efecto (`StackEffect.source`), y
   * el parte lo nombra como lo nombra la rueda de la batalla (`nombreEnLaRueda`):
   * «Rápido» en la de 3, aunque lo que quita el ataque sea su parte de Romper guardia.
   */
  readonly fuente: TipoDeGolpe;
}

/**
 * Los niveles de la rueda de un arma en pocas palabras, en el orden del anillo:
 * «Ofensivo 3, Fuerte 5, …». Lo leen el parte de un retoque (`piezaEnPalabras`)
 * y la tarjeta de la pieza.
 */
export function ruedaDelArmaEnPalabras(niveles: NivelesDeLaRueda): string {
  return TIPOS_DEL_ANILLO.map((t) => `${NOMBRE_DE_GOLPE[t]} ${niveles[t]}`).join(', ');
}

/** Una fila de la tabla «Rueda del golpe» de un arma: el nivel de un tipo y lo que da. */
export interface FilaDeLaRueda {
  readonly tipo: TipoDelAnillo;
  /** El nivel del arma en el tipo, de 0 a `NIVEL_MAXIMO`. */
  readonly nivel: number;
  /**
   * Lo que da ese nivel, en una línea: «Daño ×1,5», «+3 ataque», «2 golpes ×0,63»;
   * Romper guardia y la Finta, de menos a más según el éxito, con su unidad
   * («quita 0 a 3 de ataque», «resta 1 a 5 casillas»).
   */
  readonly final: string;
  /** Lo mismo en pocas letras, para un sector de la rueda: «×1,5», «2 ×0,63», «5–10». */
  readonly corto: string;
  /**
   * Romper guardia y la Finta: la cifra de cada éxito, del mínimo al máximo
   * («0, 0, −1, −2, −3»), para su nota; los demás, `null`.
   */
  readonly porExito: string | null;
}

/**
 * Lo que enseña Normal, el centro de la rueda de un arma: siempre ×1, sin nivel
 * (`NORMAL_SIN_NIVEL`), dicho como las filas de los demás.
 */
export const NORMAL_EN_LA_FICHA: Pick<FilaDeLaRueda, 'final' | 'corto'> = {
  final: `Daño ${porciento(100)}, en toda arma`,
  corto: porciento(100),
};

/**
 * La tabla de la rueda de un arma, un tipo del anillo por fila en su orden: su
 * nivel y lo que da (`cifrasDeLosNiveles`, la misma cuenta del golpe). Normal no
 * tiene fila: siempre es ×1. La pinta la ficha de una pieza de cuerpo a cuerpo.
 */
export function filasDeLaRueda(niveles: NivelesDeLaRueda): readonly FilaDeLaRueda[] {
  const c = cifrasDeLosNiveles(niveles);
  return TIPOS_DEL_ANILLO.map((tipo) => ({
    tipo,
    nivel: niveles[tipo],
    final: finalDe(tipo, c),
    corto: cortoDe(tipo, c),
    porExito: porExitoDe(tipo, c),
  }));
}

/**
 * Cómo queda un tipo con las cifras `c`, en pocas palabras y en una línea (la
 * columna de la tabla): «Daño ×1,5», «2 golpes ×0,63», «+3 ataque», y las cifras
 * por éxito de menos a más (`deMenosAMas`): «quita 0 a 3 de ataque», «resta 1 a 5
 * casillas» (con las dos iguales, «resta 2 casillas», «no quita ataque»).
 */
function finalDe(tipo: TipoDelAnillo, c: CifrasDeLaRueda): string {
  switch (tipo) {
    case 'fuerte':
      return `Daño ${porciento(c.fuerte.porcentaje)}`;
    case 'rapido':
      return `${c.rapido.golpes} golpes ${porciento(c.rapido.porcentaje)}`;
    case 'ofensivo':
      return `${conSigno(c.ofensivo.ataque)} ataque`;
    case 'defensivo':
      return `${conSigno(c.defensivo.defensa)} defensa`;
    case 'romperGuardia': {
      const r = deMenosAMas(c.romperGuardia.ataque, ' a ');
      return r === '0' ? 'no quita ataque' : `quita ${r} de ataque`;
    }
    case 'finta':
      return `resta ${deMenosAMas(c.finta.casillas, ' a ')} casillas`;
  }
}

/** `finalDe` en pocas letras, sin la unidad: lo que cabe en un sector de la rueda. */
function cortoDe(tipo: TipoDelAnillo, c: CifrasDeLaRueda): string {
  switch (tipo) {
    case 'fuerte':
      return porciento(c.fuerte.porcentaje);
    case 'rapido':
      return `${c.rapido.golpes} ${porciento(c.rapido.porcentaje)}`;
    case 'ofensivo':
      return `${conSigno(c.ofensivo.ataque)} atq.`;
    case 'defensivo':
      return `${conSigno(c.defensivo.defensa)} def.`;
    case 'romperGuardia':
      return deMenosAMas(c.romperGuardia.ataque, '–');
    case 'finta':
      return deMenosAMas(c.finta.casillas, '–');
  }
}

/** Una cifra de ataque quitado: «0» o con su signo («−2»). */
function cifraDeAtaque(n: number): string {
  return n === 0 ? '0' : conSigno(n);
}

/**
 * Lo que quita o resta una cifra por éxito, sin signo y de menos a más, unido por
 * `entre` («1 a 5»: la Finta resta menos con más éxito; «0 a 3»: Romper guardia
 * quita más), o una sola cifra si las dos puntas son iguales.
 */
function deMenosAMas(valores: PorExito, entre: string): string {
  const puntas = [Math.abs(valores[0]), Math.abs(valores[4])];
  const menos = Math.min(...puntas);
  const mas = Math.max(...puntas);
  return menos === mas ? String(mas) : `${menos}${entre}${mas}`;
}

/** La cifra de cada éxito de Romper guardia o la Finta, del mínimo al máximo; `null` en los demás. */
function porExitoDe(tipo: TipoDelAnillo, c: CifrasDeLaRueda): string | null {
  if (tipo === 'romperGuardia')
    return PUNTOS.map((p) => cifraDeAtaque(c.romperGuardia.ataque[p])).join(', ');
  if (tipo === 'finta') return PUNTOS.map((p) => String(c.finta.casillas[p])).join(', ');
  return null;
}

/**
 * Lo que suma al ataque del golpe: solo Ofensivo, y solo al golpear. En el
 * contraataque no suma: la respuesta no da bonificadores (decisión del usuario,
 * 14-10-2026).
 */
function ataqueDe(tipo: TipoDeGolpe, papel: PapelEnLaRueda, c: CifrasDeLaRueda): number {
  return papel === 'golpe' ? efectoDelTipo(tipo, c).ataque : 0;
}

/**
 * Los efectos que deja un **golpe** de tipo `tipo` que cae en el punto `p` (el
 * éxito de quien pega), con las cifras de su arma `c`, sacados de lo que da su
 * tipo (`efectoDelTipo`): la defensa, a quien pega, hasta que empiece su próximo
 * turno; lo que quita al ataque del atacado según su éxito, hasta que termine el
 * suyo. Solo los que dan algo (con 0, nada): un fusionado con Defensivo o con
 * Romper guardia deja lo suyo a la mitad. La respuesta no deja ninguno: quien
 * recibe muchos golpes y responde Defensivo no acumula defensa (decisión del
 * usuario, 14-10-2026).
 */
export function efectosDeLaRueda(
  tipo: TipoDeGolpe,
  p: Punto,
  c: CifrasDeLaRueda,
): readonly EfectoDeLaRueda[] {
  const e = efectoDelTipo(tipo, c);
  const out: EfectoDeLaRueda[] = [];
  if (e.defensa !== 0) {
    out.push({ kind: 'defense', amount: e.defensa, a: 'propio', vence: 'empezar', fuente: tipo });
  }
  if (e.quitaAtaque[p] !== 0) {
    out.push({
      kind: 'attack',
      amount: e.quitaAtaque[p],
      a: 'rival',
      vence: 'terminar',
      fuente: tipo,
    });
  }
  return out;
}

/**
 * Las casillas que resta la Finta de lo que le queda por andar (`quedan`) a quien
 * golpeó con ella, con éxito `p` y lo que da su tipo `e` (`TurnoDeUnidad.finta`):
 * con el nivel 3, 5 con el éxito mínimo y 1 con el máximo (`data/rueda.json`). La
 * fusionada (`mitad`) deja andar la mitad de lo que dejaría: resta `quedan` menos
 * ⌊lo que dejaría / 2⌋. Lanza con un tipo sin Finta.
 */
export function casillasQueQuitaLaFinta(p: Punto, e: EfectoDelTipo, quedan: number): number {
  if (e.finta === null) throw new Error('el golpe no lleva Finta: no resta casillas');
  const resta = e.finta.casillas[p];
  if (!e.finta.mitad) return resta;
  return quedan - Math.floor(Math.max(0, quedan - resta) / 2);
}

/**
 * La rueda traducida al daño (`DamageOptions.cruce`): un golpe de `tipo` que cae
 * entre los puntos `desde` y `hasta` del cruce, dado por quien elige `papel` (el
 * golpe o el contraataque de la respuesta) con las cifras de su arma `c`
 * (`ruedaDelGolpe`), en los números que lee `damage.ts`.
 * La única traducción: la piden `opcionesDeDanio` y la previsión de la rueda
 * (`battle.ts`).
 */
export function cruceDelGolpe(
  tipo: TipoDeGolpe,
  desde: Punto,
  hasta: Punto,
  papel: PapelEnLaRueda,
  c: CifrasDeLaRueda,
  forma: FormaDeLaRueda,
): CruceDelGolpe {
  return {
    desde,
    hasta,
    factor: porcientoDelTipo(tipo, c) / 100,
    ataque: ataqueDe(tipo, papel, c),
    causa: `golpe ${nombreEnLaRueda(tipo, forma)}`,
    causaDeLaTirada:
      desde === hasta
        ? `rueda: tirada en el ${NOMBRE_DEL_PUNTO[desde]}`
        : `rueda: tirada del ${NOMBRE_DEL_PUNTO[desde]} al ${NOMBRE_DEL_PUNTO[hasta]}, según el cruce`,
  };
}

/**
 * Por qué un golpe no vale por lo que elige en la rueda, o `null`. El golpe y la
 * respuesta tienen que ser tipos de la rueda de la batalla (`forma`), y para darlo
 * (`completa`) son obligatorios; la previsión, que se pide antes de elegir, pasa
 * sin ellos. Lo leen `applyAction` antes de mover y la previsión.
 */
export function cruceBlocker(
  accion: BattleAction & { type: 'attack' },
  completa: boolean,
  forma: FormaDeLaRueda,
): string | null {
  for (const [papel, valor] of [
    ['el golpe', accion.golpe],
    ['la respuesta', accion.respuesta],
  ] as const) {
    if (valor === undefined) {
      if (completa) return `se golpea con la rueda: falta ${papel}`;
      continue;
    }
    const motivo = tipoDeGolpeBlocker(valor, forma);
    if (motivo !== null) return motivo;
  }
  return null;
}

/** Cómo se dice cada punto: «mínimo» … «máximo». */
export const NOMBRE_DEL_PUNTO: Readonly<Record<Punto, string>> = {
  0: 'mínimo',
  1: 'bajo',
  2: 'medio',
  3: 'alto',
  4: 'máximo',
};

/** «×1,25»: un porcentaje como el factor que es, con coma. */
function porciento(porcentaje: number): string {
  return `×${conComa(porcentaje / 100, 2)}`;
}

/**
 * Lo que dura un efecto de la rueda, dicho por cuándo vence y a quién se le dice:
 * «hasta que empiece su próximo turno» (`'su'`: el parte, la vista previa y las
 * notas que hablan del rival) o «… tu próximo turno» (`'tu'`: la nota a quien lo
 * lleva). Sus rondas son solo el tope. La única frase.
 */
export function duracion(vence: CuandoVence, de: 'su' | 'tu'): string {
  return `hasta que ${vence === 'empezar' ? 'empiece' : 'termine'} ${de} próximo turno`;
}

/**
 * Una cifra por éxito, dicha del máximo al mínimo y juntando los éxitos seguidos
 * que dan lo mismo: «−3 con éxito máximo, −2 alto, −1 medio, nada bajo o mínimo».
 * Solo los éxitos que da el cruce de la rueda (`puntos`, `puntosDeLaForma`): en un
 * ciclo, «−2 con éxito máximo, −1 medio, nada mínimo». `cifra` dice cada valor.
 * Sale de `data/rueda.json`: si cambia una cifra, cambia la frase.
 */
function porNivelesDeExito(
  valores: PorExito,
  cifra: (n: number) => string,
  puntos: readonly Punto[],
): string {
  const grupos: { valor: number; puntos: Punto[] }[] = [];
  for (const p of [...puntos].reverse()) {
    const ultimo = grupos.at(-1);
    if (ultimo !== undefined && ultimo.valor === valores[p]) ultimo.puntos.push(p);
    else grupos.push({ valor: valores[p], puntos: [p] });
  }
  return grupos
    .map(
      (g, i) =>
        `${cifra(g.valor)} ${i === 0 ? 'con éxito ' : ''}${g.puntos.map((p) => NOMBRE_DEL_PUNTO[p]).join(' o ')}`,
    )
    .join(', ');
}

/** Lo que quita Romper guardia por éxito, dicho: «−3 con éxito máximo, …, nada bajo o mínimo». */
function romperGuardiaPorExito(quita: PorExito, puntos: readonly Punto[]): string {
  return porNivelesDeExito(quita, (n) => (n === 0 ? 'nada' : conSigno(n)), puntos);
}

/** Lo que resta la Finta por éxito, dicho: «5 con éxito máximo, 6 alto, …». */
function fintaPorExito(casillas: PorExito, puntos: readonly Punto[]): string {
  return porNivelesDeExito(casillas, String, puntos);
}

/**
 * Lo que hace cada tipo, dicho desde sus cifras —las de los niveles del arma de
 * quien elige, `c` (`ruedaDelGolpe`)— y **para quien elige**: el
 * tooltip de su sector. Si cambian las cifras, cambia esta frase. Lo que va por
 * éxito, solo con los éxitos que da el cruce de la rueda `forma`.
 *
 * Cada nota dice cuándo actúa su efecto, porque no es lo mismo pegar que
 * responder: la respuesta es el contraataque de quien recibe (decisión del
 * usuario), así que nada de lo que elige toca el golpe que le cae ahora. Un
 * «+1 defensa» a secas en la respuesta prometía parar el golpe y no lo paraba
 * (H4 de la QA, 13-10-2026).
 *
 * Y la respuesta no da bonificadores (decisión del usuario, 14-10-2026): solo
 * Fuerte y Rápido cambian el contraataque; Ofensivo, Defensivo, Finta y Romper
 * guardia solo cuentan para el cruce, y su nota lo dice («No cambia este golpe» se
 * leía como que daba igual qué elegir: H7). Sin contraataque (`contraataca`
 * falso) solo queda el cruce: la nota no promete un contraataque para retirarlo
 * en la frase siguiente. En el golpe, igual: sin contraataque, Defensivo no
 * promete cubrirlo, ni Romper guardia quitarle ataque en él (H9).
 *
 * Y lo que se apila con otras reglas (decisiones del usuario, 14-10-2026): la
 * Finta avisa de que su tramo paga salir del contacto como cualquier otro; y Rápido, de que cada golpe resta la armadura del
 * que lo recibe, así que contra armadura pierde.
 */
export function efectoDeGolpe(
  tipo: TipoDeGolpe,
  papel: PapelEnLaRueda,
  contraataca: boolean,
  c: CifrasDeLaRueda,
  forma: FormaDeLaRueda,
): string {
  const partes = PARTES[tipo];
  if (partes.length === 0) {
    // Normal.
    if (papel === 'golpe') return `${SIN_MODIFICAR}. Contra cualquiera, el cruce cae en el medio.`;
    return contraataca
      ? `${SIN_MODIFICAR}. Contra cualquier golpe, el cruce cae en el medio, y tu contraataque también.`
      : `${NO_DEVUELVES}: tu respuesta solo cuenta para el cruce, y con Normal cae en el medio.`;
  }
  // La respuesta: lo que hace va con el contraataque, y solo si lo hay.
  if (papel === 'respuesta' && !contraataca) {
    return `${NO_DEVUELVES}, así que su efecto no actúa: tu respuesta solo cuenta para el cruce, que decide cuánto te duele el golpe.`;
  }
  // Cada parte dice lo suyo con las cifras del tipo: en un fusionado, a la mitad.
  const e = efectoDelTipo(tipo, c);
  const puntos = puntosDeLaForma(forma);
  const frases = partes.flatMap((parte) => {
    const f =
      papel === 'golpe'
        ? fraseDelGolpe(parte, contraataca, e, puntos)
        : fraseDeLaRespuesta(parte, e);
    return f === null ? [] : [f];
  });
  if (frases.length === 0) return SOLO_EL_CRUCE;
  const nota = frases.join(' ');
  if (!esFusionado(tipo)) return nota;
  return `La mitad de ${partes.map((p) => NOMBRE_DE_GOLPE[p]).join(' y de ')}: ${nota.charAt(0).toLowerCase()}${nota.slice(1)}`;
}

/**
 * A quién gana y con quién pierde `tipo` en una rueda de ciclo (`cicloDe`), dicho
 * para la persona con los nombres de esa rueda: «Gana a Rápido y pierde con
 * Defensivo.»; en la de 7 o con Normal, vacío. Va delante de la nota de cada
 * sector, al golpear y al responder: la guía dice qué es ganar, y sin esto no se
 * sabía a quién (H2 de QA de la complejidad, vuelta 1: quien defiende ve la rueda
 * por primera vez en la respuesta).
 */
export function dichoDelCiclo(tipo: TipoDeGolpe, forma: FormaDeLaRueda): string {
  const c = cicloDe(tipo, forma);
  if (c === null) return '';
  return `Gana a ${nombreEnLaRueda(c.gana, forma)} y pierde con ${nombreEnLaRueda(c.pierde, forma)}.`;
}

/**
 * Lo que dice al golpear la parte `parte` de un tipo que da `e` (`efectoDeGolpe`),
 * con los éxitos que da el cruce de su rueda (`puntos`).
 */
function fraseDelGolpe(
  parte: TipoDelAnillo,
  contraataca: boolean,
  e: EfectoDelTipo,
  puntos: readonly Punto[],
): string {
  switch (parte) {
    case 'ofensivo':
      return `${conSigno(e.ataque)} ataque en este golpe.`;
    case 'defensivo':
      return contraataca
        ? `${conSigno(e.defensa)} defensa desde ya: cubre el contraataque de ahora y dura ${duracion('empezar', 'tu')}.`
        : `${conSigno(e.defensa)} defensa desde ya ${duracion('empezar', 'tu')} (esta vez no te devuelven el golpe).`;
    case 'fuerte':
      return `Daño ${porciento(e.porcentaje)}.`;
    case 'rapido':
      return `${golpesDelTipo(parte)} golpes de daño ${porciento(e.porcentaje)} cada uno (con doble golpe, el doble). ${CONTRA_ARMADURA}`;
    case 'romperGuardia':
      return contraataca
        ? `Quita ataque al rival desde ya: en su contraataque de ahora y ${duracion('terminar', 'su')}; ${romperGuardiaPorExito(e.quitaAtaque, puntos)}.`
        : `Quita ataque al rival en su próximo turno (esta vez no te devuelve el golpe); ${romperGuardiaPorExito(e.quitaAtaque, puntos)}.`;
    case 'finta': {
      if (e.finta === null) throw new Error('la Finta sin lo que resta');
      const cuanto = e.finta.mitad ? 'la mitad de las casillas' : 'las casillas';
      return `Después de golpear puedes andar ${cuanto} que te queden menos ${fintaPorExito(e.finta.casillas, puntos)}. Andar cierra el turno. Salir del contacto cuesta encima, como cualquier paso: 1 más por cada enemigo a tu lado.`;
    }
  }
}

/**
 * Lo que dice al responder (con contraataque) la parte `parte` de un tipo que da
 * `e`, o `null` si en la respuesta no actúa: la respuesta no da bonificadores
 * (decisión del usuario, 14-10-2026), y solo Fuerte y Rápido cambian el contraataque.
 */
function fraseDeLaRespuesta(parte: TipoDelAnillo, e: EfectoDelTipo): string | null {
  switch (parte) {
    case 'fuerte':
      return `${NO_TOCA}: tu contraataque hace daño ${porciento(e.porcentaje)}.`;
    case 'rapido':
      return `${NO_TOCA}: contraatacas con ${golpesDelTipo(parte)} golpes de daño ${porciento(e.porcentaje)} cada uno. ${CONTRA_ARMADURA}`;
    case 'ofensivo':
    case 'defensivo':
    case 'finta':
    case 'romperGuardia':
      return null;
  }
}

/**
 * Cómo empieza la nota de una respuesta con contraataque que lo cambia (Fuerte,
 * Rápido): lo que elige no toca el golpe que le llega, pero el cruce, sí.
 */
const NO_TOCA = 'Su efecto no toca el golpe que recibes (ese lo decide el cruce)';

/** Cómo empieza la nota de Normal: siempre ×1, el arma no lo toca (decisión del usuario, 18-10-2026). */
const SIN_MODIFICAR = 'Sin modificar';

/**
 * Lo que dice Rápido de la armadura: cada golpe resta la del rival (`herir`), y
 * así lo enseña la previsión (decisión del usuario, 14-10-2026).
 */
const CONTRA_ARMADURA = 'Cada golpe resta la armadura del rival: contra armadura, pierde.';

/** La nota de una respuesta sin efecto: Ofensivo, Defensivo, Finta y Romper guardia. */
const SOLO_EL_CRUCE =
  'En la respuesta no tiene efecto: solo cuenta para el cruce, que decide cuánto te duele el golpe y dónde cae tu contraataque.';

/** Cómo empieza la nota de una respuesta sin contraataque. */
const NO_DEVUELVES = 'Esta vez no devuelves el golpe';

/** El hecho del cruce en el registro de la batalla. */
export type HechoDelCruce = Extract<BattleEvent, { kind: 'cruce' }>;

/**
 * Lo que pasó tras el cruce `i` del registro, hasta el siguiente cruce o la ronda
 * siguiente: el punto en que cayó el contraataque (el del golpe devuelto por el
 * objetivo; `null` si no lo devolvió: cayó, o no podía) y las casillas de carga
 * que cobró quien pega (las de su primer golpe que no es un contraataque,
 * `charge`, ya topadas; 0 si no cargó). El registro dice lo que pasó, no lo que
 * habría pasado. Un solo recorrido para los dos: lo leen `contraataqueDelCruce` y
 * `cargaDelCruce`. Lanza si el hecho `i` no es un cruce.
 */
function trasElCruce(
  log: readonly BattleEvent[],
  i: number,
): { readonly contraataque: Punto | null; readonly carga: number } {
  const cruce = log[i];
  if (cruce?.kind !== 'cruce') throw new Error(`el hecho ${i} del registro no es un cruce`);
  let contraataque: Punto | undefined;
  let carga: number | undefined;
  for (let k = i + 1; k < log.length; k++) {
    const e = log[k] as BattleEvent;
    if (e.kind === 'cruce' || e.kind === 'round_start') break;
    if (e.kind !== 'attack') continue;
    if (e.retaliation && e.stack === cruce.target && contraataque === undefined) {
      if (e.punto === undefined) throw new Error(`el contraataque del cruce ${i} no dice su punto`);
      contraataque = e.punto;
    }
    if (!e.retaliation && e.stack === cruce.stack && carga === undefined) carga = e.charge ?? 0;
    if (contraataque !== undefined && carga !== undefined) break;
  }
  return { contraataque: contraataque ?? null, carga: carga ?? 0 };
}

/**
 * El punto en que cayó el contraataque del cruce `i` del registro (`trasElCruce`),
 * o `null` si no lo devolvió. Lo leen el parte y la rueda.
 */
export function contraataqueDelCruce(log: readonly BattleEvent[], i: number): Punto | null {
  return trasElCruce(log, i).contraataque;
}

/**
 * La carga que cobró quien pega, con `unit`, tras el cruce `i` del registro
 * (`trasElCruce`, `cargaDeLaRueda`), o `null` si no cargó. Es lo cobrado, no lo
 * previsto: el desenlace de la rueda lo pinta también en el espectador, que no
 * tiene previsión.
 */
export function cargaDelCruce(
  log: readonly BattleEvent[],
  i: number,
  unit: UnitInfo,
): CargaDeLaRueda | null {
  return cargaDeLaRueda(trasElCruce(log, i).carga, unit);
}

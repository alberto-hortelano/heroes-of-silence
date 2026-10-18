/**
 * La rueda del golpe: el combate por decisión de la ARENA (decisión del usuario,
 * 13-10-2026, docs/agents/2026-10-13-rueda-del-golpe/). **Regla nuestra, solo de
 * la arena**: el juego, el agente y el banco pelean con la tirada de siempre.
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
 * Aquí está la regla una vez: el anillo, el punto del cruce, la tirada fija de
 * cada punto, cuántos golpes da cada tipo y sus cifras, con sus nombres para la
 * persona. Puro: no importa `battle.ts`; lo leen el motor (`applyAction`,
 * `melee`, el daño), la IA (`ai/rueda.ts`), la sesión de la arena y la rueda del
 * cliente.
 */
import { hasTrait } from '../data.js';
import { conSigno } from '../hero/equipo.js';
import {
  conComa,
  esTipoDeGolpe,
  type RuedaDelArma,
  TIPOS_DE_GOLPE,
  type TipoDeGolpe,
  type UnitInfo,
  type UsoDeArma,
} from '../types.js';
import {
  type CifrasDeLaRueda,
  cifrasDeLaRuedaCon,
  esTipoDeDanio,
  NOMBRE_DE_GOLPE,
  type PapelEnLaRueda,
  type PorExito,
  PUNTOS,
  type Punto,
} from './cifras-de-la-rueda.js';
import { type CruceDelGolpe, golpeDe, tiradaEnCuartos } from './damage.js';
import type { CuandoVence } from './effects.js';
import type { ModosDeArena } from './modos.js';
import type { BattleAction, BattleEvent } from './types.js';

export {
  type CifrasDeLaRueda,
  COMO_SUMA_EL_ARMA,
  cifrasDeLaRuedaCon,
  esTipoDeDanio,
  NOMBRE_DE_GOLPE,
  type PapelEnLaRueda,
  PESOS_DE_LA_RUEDA,
  type PesosDeLaRueda,
  type PorExito,
  PUNTOS,
  type Punto,
  ruedaDelArmaBlocker,
  type TipoDeDanio,
  validarRueda,
} from './cifras-de-la-rueda.js';
// Los siete tipos viven en `types.ts`, porque los nombra la pieza (`Pieza.rueda`),
// y las cifras de cada uno con lo que suma un arma, en `cifras-de-la-rueda.ts`,
// que lee la regla de una pieza: aquí se reexportan, que es donde los busca quien
// lee la rueda.
export { esTipoDeGolpe, TIPOS_DE_GOLPE, type TipoDeGolpe };

/** El anillo, sin el centro, en el sentido de las agujas del reloj desde arriba. */
export const ANILLO: readonly TipoDeGolpe[] = TIPOS_DE_GOLPE.filter((t) => t !== 'normal');

/** Los modos del golpe de una pelea: la tirada de siempre o la rueda. */
export const MODOS_DEL_GOLPE = ['azar', 'rueda'] as const;
export type ModoDelGolpe = (typeof MODOS_DEL_GOLPE)[number];

/** El punto según la distancia en el anillo: igual, al lado, a dos, enfrente. */
const PUNTO_POR_DISTANCIA: readonly Punto[] = [0, 1, 3, 4];

/** Por qué `x` no es un tipo de golpe, dicho para la persona; `null` si lo es. */
export function tipoDeGolpeBlocker(x: unknown): string | null {
  if (esTipoDeGolpe(x)) return null;
  return `«${String(x)}» no es un tipo de golpe; valen ${TIPOS_DE_GOLPE.join(', ')}`;
}

/**
 * Dónde cae el golpe de quien elige `golpe` contra quien responde `respuesta`:
 * con Normal en cualquiera de los dos, el medio; si no, por la distancia en el
 * anillo (de 0 a 3): mínimo, bajo, alto, máximo. Simétrica.
 */
export function puntoDelCruce(golpe: TipoDeGolpe, respuesta: TipoDeGolpe): Punto {
  if (golpe === 'normal' || respuesta === 'normal') return 2;
  const a = ANILLO.indexOf(golpe);
  const b = ANILLO.indexOf(respuesta);
  const d = Math.abs(a - b);
  return PUNTO_POR_DISTANCIA[Math.min(d, ANILLO.length - d)] as Punto;
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
 * Los puntos en que puede caer un golpe de este tipo sin saber la respuesta: con
 * Normal, siempre el medio; con los demás, del mínimo al máximo. La horquilla de
 * cada sector de la rueda.
 */
export function puntosDe(tipo: TipoDeGolpe): readonly [Punto, Punto] {
  return tipo === 'normal' ? [2, 2] : [0, 4];
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
}

/**
 * Las cifras de la rueda con que da `unit` un golpe de `uso`: las de su arma
 * (`golpeDe(unit, uso).rueda`, que escribe `conEquipo`). Sin arma, o sin nada que
 * sume, las de siempre. **La única lectura del arma en la rueda**: la piden el
 * golpe, el contraataque y la previsión (`battle.ts`).
 */
export function ruedaDelGolpe(unit: UnitInfo, uso: UsoDeArma): CifrasDeLaRueda {
  return cifrasDeLaRuedaCon(golpeDe(unit, uso).rueda);
}

/**
 * Lo que suma un arma a la rueda en pocas palabras: «Fuerte +20, Rápido −20», o
 * «nada». Lo leen el parte de un retoque (`piezaEnPalabras`) y la tarjeta de la
 * pieza.
 */
export function ruedaDelArmaEnPalabras(mods: RuedaDelArma | undefined): string {
  const partes = TIPOS_DE_GOLPE.filter((t) => (mods?.[t] ?? 0) !== 0).map(
    (t) => `${NOMBRE_DE_GOLPE[t]} ${conSigno(mods?.[t] ?? 0)}`,
  );
  return partes.length === 0 ? 'nada' : partes.join(', ');
}

/** Una fila de la tabla «Rueda del golpe» de un arma: lo que suma a un tipo y cómo queda. */
export interface FilaDeLaRueda {
  readonly tipo: TipoDeGolpe;
  /** Lo que suma el arma, en la unidad de su tipo (`COMO_SUMA_EL_ARMA`). */
  readonly suma: number;
  /**
   * Cómo queda el tipo con el arma, en una línea: «Daño ×1,45», «+2 ataque»; Romper
   * guardia y la Finta, del éxito mínimo al máximo con su unidad («−1 a −4 ataque»,
   * «5 a 1 casillas»).
   */
  readonly final: string;
  /**
   * Romper guardia y la Finta: la cifra de cada éxito, del mínimo al máximo
   * («−1, −1, −2, −3, −4»), para su nota; los demás, `null`.
   */
  readonly porExito: string | null;
}

/**
 * La tabla de la rueda de un arma, un tipo por fila en el orden de la rueda: lo
 * que suma y cómo queda (`cifrasDeLaRuedaCon`, la misma cuenta del golpe). La
 * pinta la ficha de una pieza de cuerpo a cuerpo.
 */
export function filasDeLaRueda(mods: RuedaDelArma | undefined): readonly FilaDeLaRueda[] {
  const c = cifrasDeLaRuedaCon(mods);
  return TIPOS_DE_GOLPE.map((tipo) => ({
    tipo,
    suma: mods?.[tipo] ?? 0,
    final: finalDe(tipo, c),
    porExito: porExitoDe(tipo, c),
  }));
}

/**
 * Cómo queda un tipo con las cifras `c`, en pocas palabras y en una línea (la
 * columna de la tabla): «Daño ×1,45», «2 golpes ×0,4», «+1 ataque», y las cifras
 * por éxito, del mínimo al máximo con su unidad («−1 a −4 ataque»: QA 5 del
 * 18-10-2026, «1/2/3/4/5» del máximo al mínimo solo se entendía con la nota).
 */
function finalDe(tipo: TipoDeGolpe, c: CifrasDeLaRueda): string {
  switch (tipo) {
    case 'fuerte':
    case 'normal':
      return `Daño ${porciento(c[tipo].porcentaje)}`;
    case 'rapido':
      return `${c.rapido.golpes} golpes ${porciento(c.rapido.porcentaje)}`;
    case 'ofensivo':
      return `${conSigno(c.ofensivo.ataque)} ataque`;
    case 'defensivo':
      return `${conSigno(c.defensivo.defensa)} defensa`;
    case 'romperGuardia':
      return delMinimoAlMaximo(c.romperGuardia.ataque, cifraDeAtaque, 'ataque');
    case 'finta':
      return delMinimoAlMaximo(c.finta.casillas, String, 'casillas');
  }
}

/** Una cifra de ataque quitado: «0» o con su signo («−2»). */
function cifraDeAtaque(n: number): string {
  return n === 0 ? '0' : conSigno(n);
}

/** Una cifra por éxito en una línea, del mínimo al máximo: «−1 a −4 ataque», o «0 ataque» si no cambia. */
function delMinimoAlMaximo(
  valores: PorExito,
  cifra: (n: number) => string,
  unidad: string,
): string {
  const minimo = cifra(valores[0]);
  const maximo = cifra(valores[4]);
  return minimo === maximo ? `${minimo} ${unidad}` : `${minimo} a ${maximo} ${unidad}`;
}

/** La cifra de cada éxito de Romper guardia o la Finta, del mínimo al máximo; `null` en los demás. */
function porExitoDe(tipo: TipoDeGolpe, c: CifrasDeLaRueda): string | null {
  if (tipo === 'romperGuardia')
    return PUNTOS.map((p) => cifraDeAtaque(c.romperGuardia.ataque[p])).join(', ');
  if (tipo === 'finta') return PUNTOS.map((p) => String(c.finta.casillas[p])).join(', ');
  return null;
}

/** Lo que multiplica el daño de un golpe de este tipo: los de daño (`esTipoDeDanio`), su %; los demás, 1. */
function factorDe(tipo: TipoDeGolpe, c: CifrasDeLaRueda): number {
  return esTipoDeDanio(tipo) ? c[tipo].porcentaje / 100 : 1;
}

/**
 * Lo que suma al ataque del golpe: solo Ofensivo, y solo al golpear. En el
 * contraataque no suma: la respuesta no da bonificadores (decisión del usuario,
 * 14-10-2026).
 */
function ataqueDe(tipo: TipoDeGolpe, papel: PapelEnLaRueda, c: CifrasDeLaRueda): number {
  return tipo === 'ofensivo' && papel === 'golpe' ? c.ofensivo.ataque : 0;
}

/**
 * El efecto que deja un **golpe** de tipo `tipo` que cae en el punto `p` (el
 * éxito de quien pega), con las cifras de su arma `c`, o `null` si no deja
 * ninguno: Defensivo, a quien pega, hasta que empiece su próximo turno; Romper
 * guardia, al atacado, lo que diga su éxito, hasta que termine el suyo (con 0,
 * nada). La respuesta no deja ninguno: quien recibe muchos golpes y responde
 * Defensivo no acumula defensa (decisión del usuario, 14-10-2026).
 */
export function efectoDeLaRueda(
  tipo: TipoDeGolpe,
  p: Punto,
  c: CifrasDeLaRueda,
): EfectoDeLaRueda | null {
  if (tipo === 'defensivo' && c.defensivo.defensa !== 0) {
    return { kind: 'defense', amount: c.defensivo.defensa, a: 'propio', vence: 'empezar' };
  }
  if (tipo === 'romperGuardia' && c.romperGuardia.ataque[p] !== 0) {
    return { kind: 'attack', amount: c.romperGuardia.ataque[p], a: 'rival', vence: 'terminar' };
  }
  return null;
}

/**
 * Las casillas que resta la Finta de lo que le queda por andar a quien golpeó con
 * ella, con éxito `p` y las cifras de su arma `c`: sin arma, con el máximo 1 y
 * con el mínimo 5 (`data/rueda.json`).
 */
export function casillasQueQuitaLaFinta(p: Punto, c: CifrasDeLaRueda): number {
  return c.finta.casillas[p];
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
): CruceDelGolpe {
  return {
    desde,
    hasta,
    factor: factorDe(tipo, c),
    ataque: ataqueDe(tipo, papel, c),
    causa: `golpe ${NOMBRE_DE_GOLPE[tipo]}`,
    causaDeLaTirada:
      desde === hasta
        ? `rueda: tirada en el ${NOMBRE_DEL_PUNTO[desde]}`
        : `rueda: tirada del ${NOMBRE_DEL_PUNTO[desde]} al ${NOMBRE_DEL_PUNTO[hasta]}, según el cruce`,
  };
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
  // Sin arma: el arma cambia el daño de cada golpe del Rápido, no cuántos.
  return tipo === 'rapido' ? base * cifrasDeLaRuedaCon(undefined).rapido.golpes : base;
}

/**
 * ¿Se pelea con la rueda? La única lectura del modo (`BattleState.arena`; cómo va
 * en la URL lo dice `modos.ts`): nadie compara el literal fuera de aquí y de la
 * arena (lo vigila `test/invariantes.test.ts`).
 */
export function conRueda(state: { readonly arena: ModosDeArena }): boolean {
  return state.arena.golpe === 'rueda';
}

/**
 * Por qué un golpe no vale por lo que elige en la rueda, o `null`. Con la rueda,
 * el golpe y la respuesta tienen que ser tipos, y para darlo (`completa`) son
 * obligatorios; la previsión, que se pide antes de elegir, pasa sin ellos. Sin
 * rueda no se admite ninguno: un golpe elegido que se tira a dados sería una
 * mentira callada. Lo leen `applyAction` antes de mover y la previsión.
 */
export function cruceBlocker(
  state: { readonly arena: ModosDeArena },
  accion: BattleAction & { type: 'attack' },
  completa: boolean,
): string | null {
  if (!conRueda(state)) {
    if (accion.golpe !== undefined || accion.respuesta !== undefined) {
      return 'en esta pelea el golpe es de azar: no se elige tipo';
    }
    return null;
  }
  for (const [papel, valor] of [
    ['el golpe', accion.golpe],
    ['la respuesta', accion.respuesta],
  ] as const) {
    if (valor === undefined) {
      if (completa) return `en esta pelea se golpea con la rueda: falta ${papel}`;
      continue;
    }
    const motivo = tipoDeGolpeBlocker(valor);
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
 * `cifra` dice cada valor. Sale de `data/rueda.json`: si cambia una cifra, cambia
 * la frase.
 */
function porNivelesDeExito(valores: PorExito, cifra: (n: number) => string): string {
  const grupos: { valor: number; puntos: Punto[] }[] = [];
  for (const p of [...PUNTOS].reverse()) {
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

/** Lo que quita Romper guardia por éxito con las cifras `c`, dicho: «−3 con éxito máximo, …, nada bajo o mínimo». */
function romperGuardiaPorExito(c: CifrasDeLaRueda): string {
  return porNivelesDeExito(c.romperGuardia.ataque, (n) => (n === 0 ? 'nada' : conSigno(n)));
}

/** Lo que resta la Finta por éxito con las cifras `c`, dicho: «1 con éxito máximo, 2 alto, …». */
function fintaPorExito(c: CifrasDeLaRueda): string {
  return porNivelesDeExito(c.finta.casillas, String);
}

/**
 * Lo que hace cada tipo, dicho desde sus cifras —las de `data/rueda.json` con
 * el arma de quien elige, `c` (`ruedaDelGolpe`)— y **para quien elige**: el
 * tooltip de su sector. Si cambian las cifras, cambia esta frase.
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
 * Finta, si la pelea cobra el contacto (`pagaContacto`), avisa de que su tramo
 * lo paga como cualquier otro; y Rápido, de que cada golpe resta la armadura del
 * que lo recibe, así que contra armadura pierde.
 */
export function efectoDeGolpe(
  tipo: TipoDeGolpe,
  papel: PapelEnLaRueda,
  contraataca: boolean,
  pagaContacto: boolean,
  c: CifrasDeLaRueda,
): string {
  if (papel === 'golpe') {
    switch (tipo) {
      case 'normal':
        return `${normalDicho(c)}. Contra cualquiera, el cruce cae en el medio.`;
      case 'ofensivo':
        return `${conSigno(c.ofensivo.ataque)} ataque en este golpe.`;
      case 'defensivo':
        return contraataca
          ? `${conSigno(c.defensivo.defensa)} defensa desde ya: cubre el contraataque de ahora y dura ${duracion('empezar', 'tu')}.`
          : `${conSigno(c.defensivo.defensa)} defensa desde ya ${duracion('empezar', 'tu')} (esta vez no te devuelven el golpe).`;
      case 'fuerte':
        return `Daño ${porciento(c.fuerte.porcentaje)}.`;
      case 'rapido':
        return `${c.rapido.golpes} golpes de daño ${porciento(c.rapido.porcentaje)} cada uno (con doble golpe, el doble). ${CONTRA_ARMADURA}`;
      case 'romperGuardia':
        return contraataca
          ? `Quita ataque al rival desde ya: en su contraataque de ahora y ${duracion('terminar', 'su')}; ${romperGuardiaPorExito(c)}.`
          : `Quita ataque al rival en su próximo turno (esta vez no te devuelve el golpe); ${romperGuardiaPorExito(c)}.`;
      case 'finta':
        return `Después de golpear puedes andar las casillas que te queden menos ${fintaPorExito(c)}. Andar cierra el turno.${pagaContacto ? ' Salir del contacto cuesta encima, como cualquier paso: 1 más por cada enemigo a tu lado.' : ''}`;
    }
  }
  // La respuesta: lo que hace va con el contraataque, y solo si lo hay.
  if (!contraataca) {
    return tipo === 'normal'
      ? `${NO_DEVUELVES}: tu respuesta solo cuenta para el cruce, y con Normal cae en el medio.`
      : `${NO_DEVUELVES}, así que su efecto no actúa: tu respuesta solo cuenta para el cruce, que decide cuánto te duele el golpe.`;
  }
  switch (tipo) {
    case 'normal':
      return `${normalDicho(c)}. Contra cualquier golpe, el cruce cae en el medio, y tu contraataque también.`;
    case 'fuerte':
      return `${NO_TOCA}: tu contraataque hace daño ${porciento(c.fuerte.porcentaje)}.`;
    case 'rapido':
      return `${NO_TOCA}: contraatacas con ${c.rapido.golpes} golpes de daño ${porciento(c.rapido.porcentaje)} cada uno. ${CONTRA_ARMADURA}`;
    case 'ofensivo':
    case 'defensivo':
    case 'finta':
    case 'romperGuardia':
      return SOLO_EL_CRUCE;
  }
}

/**
 * Cómo empieza la nota de Normal: «Sin modificar», o, si el arma lo cambia, su
 * daño («Daño ×1,10»).
 */
function normalDicho(c: CifrasDeLaRueda): string {
  return c.normal.porcentaje === cifrasDeLaRuedaCon(undefined).normal.porcentaje
    ? 'Sin modificar'
    : `Daño ${porciento(c.normal.porcentaje)}`;
}

/**
 * Cómo empieza la nota de una respuesta con contraataque que lo cambia (Fuerte,
 * Rápido): lo que elige no toca el golpe que le llega, pero el cruce, sí.
 */
const NO_TOCA = 'Su efecto no toca el golpe que recibes (ese lo decide el cruce)';

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
 * El punto en que cayó el contraataque del cruce `i` del registro: el del golpe
 * devuelto por el objetivo detrás de él, antes del siguiente cruce o de la ronda
 * siguiente; `null` si no lo devolvió (cayó, o no podía). El registro dice lo que
 * pasó, no lo que habría caído. Lo leen el parte y la rueda.
 */
export function contraataqueDelCruce(log: readonly BattleEvent[], i: number): Punto | null {
  const cruce = log[i];
  if (cruce?.kind !== 'cruce') throw new Error(`el hecho ${i} del registro no es un cruce`);
  for (let k = i + 1; k < log.length; k++) {
    const e = log[k] as BattleEvent;
    if (e.kind === 'cruce' || e.kind === 'round_start') return null;
    if (e.kind === 'attack' && e.retaliation && e.stack === cruce.target) {
      if (e.punto === undefined) throw new Error(`el contraataque del cruce ${i} no dice su punto`);
      return e.punto;
    }
  }
  return null;
}

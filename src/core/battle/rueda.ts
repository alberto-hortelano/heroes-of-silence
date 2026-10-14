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
 *         rápido
 * ofensivo      defensivo
 *         normal
 * r.guardia     finta
 *         fuerte
 * ```
 *
 * Aquí está la regla una vez: el anillo, el punto del cruce, la tirada fija de
 * cada punto, cuántos golpes da cada tipo y sus cifras, con sus nombres para la
 * persona. Puro: no importa `battle.ts`; lo leen el motor (`applyAction`,
 * `melee`, el daño), la IA (`ai/rueda.ts`), la sesión de la arena y la rueda del
 * cliente.
 */
import ruedaJson from '../../../data/rueda.json' with { type: 'json' };
import { hasTrait } from '../data.js';
import { conSigno } from '../hero/equipo.js';
import { conComa, type UnitInfo } from '../types.js';
import { entero, objetoCon } from '../validar.js';
import { type CruceDelGolpe, tiradaEnCuartos } from './damage.js';
import type { BattleAction, BattleEvent } from './types.js';

/**
 * Los siete tipos: el anillo en el sentido de las agujas del reloj desde arriba
 * y Normal, el centro, al final. El orden es también el de las teclas: el tipo
 * `i` se elige con la tecla `i + 1`.
 */
export const TIPOS_DE_GOLPE = [
  'rapido',
  'defensivo',
  'finta',
  'fuerte',
  'romperGuardia',
  'ofensivo',
  'normal',
] as const;
export type TipoDeGolpe = (typeof TIPOS_DE_GOLPE)[number];

/** El anillo, sin el centro, en el sentido de las agujas del reloj desde arriba. */
export const ANILLO: readonly TipoDeGolpe[] = TIPOS_DE_GOLPE.filter((t) => t !== 'normal');

/** Los modos del golpe de una pelea: la tirada de siempre o la rueda. */
export const MODOS_DEL_GOLPE = ['azar', 'rueda'] as const;
export type ModoDelGolpe = (typeof MODOS_DEL_GOLPE)[number];

/** El punto del cruce, del mínimo (0) al máximo (4). */
export type Punto = 0 | 1 | 2 | 3 | 4;

/** El punto según la distancia en el anillo: igual, al lado, a dos, enfrente. */
const PUNTO_POR_DISTANCIA: readonly Punto[] = [0, 1, 3, 4];

/** Quien elige en la rueda: el que pega o el que recibe. */
export type PapelEnLaRueda = 'golpe' | 'respuesta';

export function esTipoDeGolpe(x: unknown): x is TipoDeGolpe {
  return typeof x === 'string' && (TIPOS_DE_GOLPE as readonly string[]).includes(x);
}

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
 * El efecto que deja un tipo: un efecto temporal de ataque o de defensa, que dura
 * hasta que el afectado termine su próximo turno. `a`, a quién: a quien lo usa
 * (`propio`, antes de sus golpes: Defensivo cubre ya el contraataque) o al rival
 * (al acabar el intercambio: no toca ni el golpe ni el contraataque de ahora).
 */
export interface EfectoDeLaRueda {
  readonly kind: 'attack' | 'defense';
  readonly amount: number;
  readonly a: 'propio' | 'rival';
}

/** Las cifras de cada tipo, de `data/rueda.json`, con el nombre de lo que son. */
export interface CifrasDeLaRueda {
  /** Lo que multiplica el daño del Fuerte. */
  readonly fuerte: { readonly factor: number };
  /** Lo que multiplica el daño de cada golpe del Rápido, y por cuánto multiplica los golpes. */
  readonly rapido: { readonly factor: number; readonly golpes: number };
  /** Lo que suma Ofensivo al ataque del golpe que se da. */
  readonly ofensivo: { readonly ataque: number };
  /** La defensa que se pone quien usa Defensivo. */
  readonly defensivo: EfectoDeLaRueda;
  /** Lo que quita Romper guardia a la defensa de quien lo recibe. */
  readonly romperGuardia: EfectoDeLaRueda;
  /** Lo que quita Finta al ataque de quien la recibe. */
  readonly finta: EfectoDeLaRueda;
  /** La mezcla de la IA, por papel: un peso por tipo. */
  readonly pesos: Readonly<Record<PapelEnLaRueda, Readonly<Record<TipoDeGolpe, number>>>>;
}

const CAMPOS_DE_LA_RUEDA = [
  '_comment',
  'fuerte',
  'rapido',
  'ofensivo',
  'defensivo',
  'romperGuardia',
  'finta',
  'pesos',
];

/** Un entero de 0 hacia abajo: lo que quita un efecto. */
function quita(valor: unknown, campo: string, quien: string): number {
  const n = entero(valor, campo, quien, -1000);
  if (n > 0) throw new Error(`${quien}: ${campo} quita, así que es 0 o menos, y es ${n}`);
  return n;
}

/** Los pesos de un papel: uno por tipo, enteros ≥ 0, y alguno mayor que 0. */
function pesosDe(valor: unknown, quien: string): Readonly<Record<TipoDeGolpe, number>> {
  const o = objetoCon(valor, TIPOS_DE_GOLPE, quien);
  const pesos = {} as Record<TipoDeGolpe, number>;
  for (const t of TIPOS_DE_GOLPE) {
    if (!(t in o)) throw new Error(`${quien}: falta el peso de «${t}»`);
    pesos[t] = entero(o[t], `el peso de «${t}»`, quien, 0);
  }
  if (TIPOS_DE_GOLPE.every((t) => pesos[t] === 0)) {
    throw new Error(`${quien}: todos los pesos son 0, y la IA no tendría qué elegir`);
  }
  return pesos;
}

/**
 * Valida las cifras de la rueda y las devuelve tipadas; lanza diciendo el
 * fichero y el campo. Exportada con el JSON de argumento para que un test la vea
 * morder.
 */
export function validarRueda(json: unknown, fichero = 'data/rueda.json'): CifrasDeLaRueda {
  const j = objetoCon(json, CAMPOS_DE_LA_RUEDA, fichero);
  const campo = (nombre: string, campos: readonly string[]): Record<string, unknown> =>
    objetoCon(j[nombre], campos, `${fichero}: ${nombre}`);
  const fuerte = campo('fuerte', ['porcentaje']);
  const rapido = campo('rapido', ['porcentaje', 'golpes']);
  const ofensivo = campo('ofensivo', ['ataque']);
  const defensivo = campo('defensivo', ['defensa']);
  const romper = campo('romperGuardia', ['defensa']);
  const finta = campo('finta', ['ataque']);
  const pesos = campo('pesos', ['golpe', 'respuesta']);
  // En el JSON, en tanto por ciento y en enteros: se valida sin coma.
  const factor = (o: Record<string, unknown>, quien: string): number =>
    entero(o.porcentaje, 'el porcentaje', `${fichero}: ${quien}`, 1) / 100;
  return {
    fuerte: { factor: factor(fuerte, 'fuerte') },
    rapido: {
      factor: factor(rapido, 'rapido'),
      golpes: entero(rapido.golpes, 'los golpes', `${fichero}: rapido`, 1),
    },
    ofensivo: { ataque: entero(ofensivo.ataque, 'el ataque', `${fichero}: ofensivo`, 0) },
    defensivo: {
      kind: 'defense',
      amount: entero(defensivo.defensa, 'la defensa', `${fichero}: defensivo`, 0),
      a: 'propio',
    },
    romperGuardia: {
      kind: 'defense',
      amount: quita(romper.defensa, 'la defensa', `${fichero}: romperGuardia`),
      a: 'rival',
    },
    finta: {
      kind: 'attack',
      amount: quita(finta.ataque, 'el ataque', `${fichero}: finta`),
      a: 'rival',
    },
    pesos: {
      golpe: pesosDe(pesos.golpe, `${fichero}: pesos.golpe`),
      respuesta: pesosDe(pesos.respuesta, `${fichero}: pesos.respuesta`),
    },
  };
}

export const CIFRAS_DE_LA_RUEDA: CifrasDeLaRueda = validarRueda(ruedaJson);

/** Lo que multiplica el daño de un golpe de este tipo: el Fuerte y el Rápido; los demás, 1. */
function factorDe(tipo: TipoDeGolpe): number {
  return tipo === 'fuerte' || tipo === 'rapido' ? CIFRAS_DE_LA_RUEDA[tipo].factor : 1;
}

/** Lo que suma al ataque del golpe que se da: solo Ofensivo. */
function ataqueDe(tipo: TipoDeGolpe): number {
  return tipo === 'ofensivo' ? CIFRAS_DE_LA_RUEDA.ofensivo.ataque : 0;
}

/** El efecto que deja un tipo (Defensivo, Romper guardia, Finta), o `null` si no deja ninguno. */
export function efectoDeLaRueda(tipo: TipoDeGolpe): EfectoDeLaRueda | null {
  return tipo === 'defensivo' || tipo === 'romperGuardia' || tipo === 'finta'
    ? CIFRAS_DE_LA_RUEDA[tipo]
    : null;
}

/**
 * La rueda traducida al daño (`DamageOptions.cruce`): un golpe de `tipo` que cae
 * entre los puntos `desde` y `hasta` del cruce, en los números que lee
 * `damage.ts`. La única traducción: la piden `opcionesDeDanio` y la previsión de
 * la rueda (`battle.ts`).
 */
export function cruceDelGolpe(tipo: TipoDeGolpe, desde: Punto, hasta: Punto): CruceDelGolpe {
  return {
    desde,
    hasta,
    factor: factorDe(tipo),
    ataque: ataqueDe(tipo),
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
  return tipo === 'rapido' ? base * CIFRAS_DE_LA_RUEDA.rapido.golpes : base;
}

/**
 * El modo del golpe que pide la URL (`?golpe=rueda`). Ausente o vacío, el azar;
 * lo que no es un modo se rechaza diciendo cuáles valen, como `reglasDeLaURL`:
 * un enlace copiado con una errata reproduciría otra pelea sin decirlo.
 */
export function modoDelGolpeDeLaURL(texto: string | null): ModoDelGolpe {
  if (texto === null || texto.trim() === '') return 'azar';
  const modo = MODOS_DEL_GOLPE.find((m) => m === texto.trim());
  if (modo === undefined) {
    throw new Error(`«${texto}» no es un modo del golpe; valen ${MODOS_DEL_GOLPE.join(', ')}`);
  }
  return modo;
}

/** La inversa de `modoDelGolpeDeLaURL`: lo que va en `?golpe=`, o `''` con el azar, que no se escribe. */
export function modoDelGolpeALaURL(modo: ModoDelGolpe): string {
  return modo === 'azar' ? '' : modo;
}

/**
 * ¿Se pelea con la rueda? La única lectura del modo: nadie compara el literal
 * fuera de aquí y de la arena (lo vigila `test/invariantes.test.ts`).
 */
export function conRueda(state: { readonly modoDelGolpe: ModoDelGolpe }): boolean {
  return state.modoDelGolpe === 'rueda';
}

/**
 * Por qué un golpe no vale por lo que elige en la rueda, o `null`. Con la rueda,
 * el golpe y la respuesta tienen que ser tipos, y para darlo (`completa`) son
 * obligatorios; la previsión, que se pide antes de elegir, pasa sin ellos. Sin
 * rueda no se admite ninguno: un golpe elegido que se tira a dados sería una
 * mentira callada. Lo leen `applyAction` antes de mover y la previsión.
 */
export function cruceBlocker(
  state: { readonly modoDelGolpe: ModoDelGolpe },
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

/** Cómo se llama cada tipo para la persona: en la rueda, el parte y la barra. */
export const NOMBRE_DE_GOLPE: Readonly<Record<TipoDeGolpe, string>> = {
  rapido: 'Rápido',
  defensivo: 'Defensivo',
  finta: 'Finta',
  fuerte: 'Fuerte',
  romperGuardia: 'Romper guardia',
  ofensivo: 'Ofensivo',
  normal: 'Normal',
};

/** Cómo se dice cada punto: «mínimo» … «máximo». */
export const NOMBRE_DEL_PUNTO: Readonly<Record<Punto, string>> = {
  0: 'mínimo',
  1: 'bajo',
  2: 'medio',
  3: 'alto',
  4: 'máximo',
};

/** «×1,25»: el factor como se escribe, con coma. */
function porciento(factor: number): string {
  return `×${conComa(factor, 2)}`;
}

/**
 * Lo que dura un efecto de la rueda, dicho: lo leen su tooltip y el parte
 * (`duracionDeEfecto`). Sus rondas son solo el tope.
 */
export const HASTA_SU_TURNO = 'hasta que termine su próximo turno';

/**
 * Lo que hace cada tipo, dicho desde sus cifras y **para quien elige**: el
 * tooltip de su sector. Si cambia `data/rueda.json`, cambia esta frase.
 *
 * Cada nota dice cuándo actúa su efecto, porque no es lo mismo pegar que
 * responder: la respuesta es el contraataque de quien recibe (decisión del
 * usuario), así que nada de lo que elige toca el golpe que le cae ahora. Un
 * «+1 defensa» a secas en la respuesta prometía parar el golpe y no lo paraba
 * (H4 de la QA, 13-10-2026): Rápido contra Defensivo pegaba lo mismo que Rápido
 * contra Ofensivo.
 *
 * Y en la respuesta, cada nota dice también que el cruce sí cuenta: «No cambia
 * este golpe» se leía como que daba igual qué elegir (H7, vuelta 2). Sin
 * contraataque (`contraataca` falso) solo queda el cruce: la nota no promete un
 * contraataque para retirarlo en la frase siguiente. En el golpe, igual: sin
 * contraataque, Defensivo no promete cubrirlo, ni Finta y Romper guardia no
 * tocarlo (H9, vuelta 3).
 */
export function efectoDeGolpe(
  tipo: TipoDeGolpe,
  papel: PapelEnLaRueda,
  contraataca = true,
): string {
  const c = CIFRAS_DE_LA_RUEDA;
  if (papel === 'golpe') {
    switch (tipo) {
      case 'normal':
        return 'Sin modificar. Contra cualquiera, el cruce cae en el medio.';
      case 'ofensivo':
        return `${conSigno(c.ofensivo.ataque)} ataque en este golpe.`;
      case 'defensivo':
        return contraataca
          ? `${conSigno(c.defensivo.amount)} defensa desde ya: cubre el contraataque de ahora y dura hasta que termine tu próximo turno.`
          : `${conSigno(c.defensivo.amount)} defensa desde ya hasta que termine tu próximo turno (esta vez no te devuelven el golpe).`;
      case 'fuerte':
        return `Daño ${porciento(c.fuerte.factor)}.`;
      case 'rapido':
        return `${c.rapido.golpes} golpes de daño ${porciento(c.rapido.factor)} cada uno (con doble golpe, el doble).`;
      case 'romperGuardia':
        return `${conSigno(c.romperGuardia.amount)} defensa al rival al acabar el intercambio (${niEsteGolpe(contraataca)}), ${HASTA_SU_TURNO}.`;
      case 'finta':
        return `${conSigno(c.finta.amount)} ataque al rival al acabar el intercambio (${niEsteGolpe(contraataca)}), ${HASTA_SU_TURNO}.`;
    }
  }
  // La respuesta: todo lo que hace va con el contraataque, y solo si lo hay.
  if (!contraataca) {
    return tipo === 'normal'
      ? `${NO_DEVUELVES}: tu respuesta solo cuenta para el cruce, y con Normal cae en el medio.`
      : `${NO_DEVUELVES}, así que su efecto no actúa: tu respuesta solo cuenta para el cruce, que decide cuánto te duele el golpe.`;
  }
  switch (tipo) {
    case 'normal':
      return 'Sin modificar. Contra cualquier golpe, el cruce cae en el medio, y tu contraataque también.';
    case 'ofensivo':
      return `${NO_TOCA}: ${conSigno(c.ofensivo.ataque)} ataque en tu contraataque.`;
    case 'defensivo':
      return `${NO_TOCA}: ${conSigno(c.defensivo.amount)} defensa desde tu contraataque hasta que termine tu próximo turno.`;
    case 'fuerte':
      return `${NO_TOCA}: tu contraataque hace daño ${porciento(c.fuerte.factor)}.`;
    case 'rapido':
      return `${NO_TOCA}: contraatacas con ${c.rapido.golpes} golpes de daño ${porciento(c.rapido.factor)} cada uno.`;
    case 'romperGuardia':
      return `${NO_TOCA}: ${conSigno(c.romperGuardia.amount)} defensa al atacante tras tu contraataque, ${HASTA_SU_TURNO}.`;
    case 'finta':
      return `${NO_TOCA}: ${conSigno(c.finta.amount)} ataque al atacante tras tu contraataque, ${HASTA_SU_TURNO}.`;
  }
}

/**
 * Cómo empieza la nota de una respuesta con contraataque: lo que elige no toca
 * el golpe que le llega, pero el cruce, sí.
 */
const NO_TOCA = 'Su efecto no toca el golpe que recibes (ese lo decide el cruce)';

/** Lo que no toca un efecto que se cuelga al acabar el intercambio. */
function niEsteGolpe(contraataca: boolean): string {
  return contraataca ? 'no toca este golpe ni su contraataque' : 'no toca este golpe';
}

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

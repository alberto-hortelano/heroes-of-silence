/**
 * Lo que daría una jugada antes de darla, sin tocar el estado: la previsión de la
 * barra de la partida y de la arena (`previsionDe`: un golpe, un disparo, una granada,
 * un hechizo o un poder), la de la rueda, tipo a tipo (`previsionDeLaRueda`), y, al
 * responder, la del golpe que viene (`previsionDelGolpeQueViene`). Con las mismas
 * cuentas que lo aplican: las opciones del daño (`golpe.ts`), la recta y la explosión
 * (`a-distancia.ts`) y lo que hace un hechizo (`lanzar.ts`).
 *
 * Vivía en `battle.ts` hasta la fase N de la reorganización (07-11-2026).
 */
import { esDiferido, type Hechizo } from '../magia/formato.js';
import { type Hex, hasTrait, type PoderId, type TipoDeGolpe } from '../types.js';
import {
  apuntarBlocker,
  explosionDe,
  extraDeLaGranada,
  extraDelDisparo,
  lanzarBlocker,
  lineaDelDisparo,
} from './a-distancia.js';
import { disparosDe, golpesDe, nivelesDelGolpe, trasLaArmadura } from './armas.js';
import { CARGA, type CargaDeLaRueda, cargaDeLaRueda, cargaEfectiva } from './carga.js';
import type { CifrasDeLaRueda, PapelEnLaRueda, Punto } from './cifras-de-la-rueda.js';
import {
  activeStack,
  contraataqueBlocker,
  devolveraElGolpe,
  golpePreparado,
  hechizoDeLaBatalla,
  splashTargets,
} from './consultas.js';
import {
  type DamageOptions,
  dichoDelCuarto,
  type Horquilla,
  horquillaDeDanio,
  type Modificador,
  stackHp,
  trasElGolpe,
} from './damage.js';
import { applyEffect } from './effects.js';
import { formaDeLaBatalla, golpeNeutro, nivelesEnLaForma } from './formas-de-la-rueda.js';
import {
  conElGolpe,
  deLaRueda,
  delSector,
  type ExtraDelEstado,
  enElPunto,
  type GolpeEnLaRueda,
  ON_HIT_EFFECTS,
  opcionesDeDanio,
  ruedaDelIntercambio,
  SIN_EXTRA,
} from './golpe.js';
import {
  afectadosDe,
  apuntadoDe,
  castBlocker,
  contextoDe,
  lanzadorDeLaUnidad,
  lanzadorDelHeroe,
  poderBlocker,
  resueltosDe,
} from './lanzar.js';
import { type EfectoDeLaRueda, efectosDeLaRueda, puntoDelCruce, puntosDeLaForma } from './rueda.js';
import {
  type Apuntado,
  cuantoDura,
  curaDe,
  efectoColgado,
  type Lanzador,
  queSeApunta,
} from './spells.js';
import type { BattleAction, BattleStack, BattleState, StackEffect } from './types.js';

/**
 * Lo que daría un golpe o un disparo, ANTES de darlo: la horquilla por golpe, lo
 * que se lleva por delante, por qué sale esa cifra y si habrá contraataque.
 */
export interface PrevisionDeGolpe {
  /** Un golpe cuerpo a cuerpo, un disparo o lo que da una granada a uno (`PrevisionDeGranada`). */
  readonly kind: 'golpe' | 'disparo' | 'explosion';
  readonly atacante: string;
  readonly objetivo: string;
  /** 2 con `double_attack` o `double_shot`; el segundo, si el objetivo sigue en pie. */
  readonly golpes: number;
  /** El daño de un golpe; con más de uno, el del primero. */
  readonly danio: Horquilla;
  /**
   * Con más de un golpe y carga, el daño de cada uno tras el primero, que ya no la
   * cobra (`intercambio`); `null` si todos dan lo mismo.
   */
  readonly siguientes: Horquilla | null;
  /** Individuos que caerían con todos los golpes. */
  readonly bajas: Horquilla;
  /** PV que le quedarían con todos los golpes. */
  readonly leQuedan: Horquilla;
  readonly modificadores: readonly Modificador[];
  readonly contraataque: PrevisionDeContraataque | null;
  /** A quién más alcanza la salpicadura de un disparo, con el mismo daño. */
  readonly salpica: readonly string[];
}

/** El golpe que devolvería el objetivo, si sigue en pie. */
export interface PrevisionDeContraataque {
  /** `true`: sobrevive siempre, así que contraataca seguro; `false`: solo si sobrevive. */
  readonly seguro: boolean;
  readonly danio: Horquilla;
  readonly modificadores: readonly Modificador[];
  /** Con qué arma lo devuelve (`dichoDelGolpe`), o `null` sin armas por uso (el juego). */
  readonly conArma: string | null;
}

/**
 * Lo que haría un hechizo sobre su objetivo, lo lance el héroe o una unidad con
 * su poder (`previsionDeLanzar`): la misma cuenta para los dos.
 */
export interface PrevisionDeLanzar {
  /** La unidad elegida, si se elige una. */
  readonly objetivo: string | null;
  /** La casilla elegida, si se elige una. */
  readonly at: Hex | null;
  /** Diferido: lo de `impactos` es lo que haría si cayera ahora; cae en el siguiente turno. */
  readonly diferido: boolean;
  /** A cada uno que alcanzaría, lo que le haría; vacío si no alcanza a nadie. */
  readonly impactos: readonly ImpactoDeHechizo[];
}

/** Lo que haría un hechizo del héroe sobre su objetivo. */
export interface PrevisionDeHechizo extends PrevisionDeLanzar {
  readonly kind: 'hechizo';
  readonly hechizo: string;
}

/** Lo que haría el poder de la unidad activa (`poderes.ts`) sobre su objetivo. */
export interface PrevisionDePoder extends PrevisionDeLanzar {
  readonly kind: 'poder';
  readonly poder: PoderId;
}

/**
 * Lo que daría una granada lanzada a `at` si explotara ahora: un impacto por cada
 * vivo que hay hoy en la casilla y sus vecinas (`explosionDe`), de cualquier bando.
 */
export interface PrevisionDeGranada {
  readonly kind: 'granada';
  readonly at: Hex;
  readonly impactos: readonly ImpactoDeGranada[];
}

/** Lo que daría una granada a uno, y si es del bando de quien la lanza (el «¡tuyo!»). */
export interface ImpactoDeGranada extends PrevisionDeGolpe {
  readonly aliado: boolean;
}

export type Prevision =
  | PrevisionDeGolpe
  | PrevisionDeHechizo
  | PrevisionDePoder
  | PrevisionDeGranada;

/**
 * La previsión de una acción del stack activo: un golpe (`attack`, con su carga
 * si la hay), un disparo o un hechizo; `null` para lo que no hace daño. Lanza si
 * la acción no se puede jugar ahora, con el motivo del núcleo: la previsión se
 * pide sobre acciones de la lista legal, y una que no lo es es un fallo de quien
 * pregunta.
 *
 * **Sale de las mismas funciones que aplican el daño**: `opcionesDeDanio`,
 * `cargaDesde`, `lineaDelDisparo`, `horquillaDeDanio` (la cuenta de
 * `computeDamage` con la tirada en sus extremos), `trasElGolpe`,
 * `devolveraElGolpe` y los efectos al golpear. No toca el estado ni el `Rng`.
 * `test/prevision.test.ts` la compara con el daño real de cientos de semillas en
 * todas las combinaciones de reglas.
 */
export function previsionDe(state: BattleState, accion: BattleAction): Prevision | null {
  const s = activeStack(state);
  if (s === null || state.finished !== null) throw new Error('no le toca a ninguna unidad');
  switch (accion.type) {
    case 'attack': {
      // Las mismas comprobaciones que `applyAction` hace al golpear. Con la rueda,
      // el golpe sin elegir aún se prevé como siempre (el tablero lo pide al pasar
      // el ratón); uno elegido, solo si la pelea es de rueda.
      const { target, desdeAhi, carga } = golpePreparado(state, s, accion, false);
      return previsionDeGolpe(
        state,
        desdeAhi,
        target,
        'golpe',
        { chargeHexes: carga },
        accion.golpe === undefined ? null : delSector(accion.golpe, formaDeLaBatalla(state)),
      );
    }
    case 'aim': {
      // Lo que daría el disparo si saliera ahora, desde aquí: a quien está hoy en
      // la recta (de su turno al siguiente, el tablero se mueve). Sin nadie, nada.
      const motivo = apuntarBlocker(state, accion.at);
      if (motivo !== null) throw new Error(motivo);
      const { alcanzado } = lineaDelDisparo(state, s, accion.at);
      if (alcanzado === null) return null;
      return previsionDeGolpe(
        state,
        s,
        alcanzado,
        'disparo',
        extraDelDisparo(s, alcanzado, accion.at),
      );
    }
    case 'throw': {
      // Lo que daría la granada si explotara ahora: a quien está hoy en la casilla y
      // sus vecinas (de su turno al siguiente, el tablero se mueve).
      const motivo = lanzarBlocker(state, accion.at);
      if (motivo !== null) throw new Error(motivo);
      const { alcanzados } = explosionDe(state, accion.at);
      return {
        kind: 'granada',
        at: accion.at,
        impactos: alcanzados.map(({ stack, cuarto }) => ({
          ...previsionDeGolpe(state, s, stack, 'explosion', extraDeLaGranada(cuarto)),
          aliado: stack.side === s.side,
        })),
      };
    }
    case 'cast': {
      const motivo = castBlocker(state, s.side, accion.spell, accion.target, accion.at);
      if (motivo !== null) throw new Error(`no se puede lanzar: ${motivo}`);
      const h = hechizoDeLaBatalla(state, accion.spell);
      if (queSeApunta(h) !== 'nada' && accion.target === undefined && accion.at === undefined) {
        throw new Error('el hechizo necesita un objetivo');
      }
      const l = lanzadorDelHeroe(state, s.side);
      if (l === null) throw new Error('castBlocker dejó lanzar sin el cuerpo del héroe');
      return {
        kind: 'hechizo',
        hechizo: accion.spell,
        ...previsionDeLanzar(state, h, l, apuntadoDe(accion.target, accion.at)),
      };
    }
    case 'power': {
      const motivo = poderBlocker(state, accion.poder, accion.target, accion.at);
      if (motivo !== null) throw new Error(`${s.unit.name} no puede usar ese poder: ${motivo}`);
      const h = hechizoDeLaBatalla(state, accion.poder);
      return {
        kind: 'poder',
        poder: accion.poder,
        ...previsionDeLanzar(state, h, lanzadorDeLaUnidad(s), apuntadoDe(accion.target, accion.at)),
      };
    }
    case 'move':
    case 'surrender':
    case 'end_turn':
    case 'poner_escalera':
    case 'subir':
    case 'abrir_puerta':
    case 'cerrar_puerta':
      return null;
  }
}

function previsionDeGolpe(
  state: BattleState,
  a: BattleStack,
  t: BattleStack,
  kind: PrevisionDeGolpe['kind'],
  extra: Omit<DamageOptions, ExtraDelEstado>,
  golpe: GolpeEnLaRueda | null = null,
): PrevisionDeGolpe {
  const golpes =
    kind === 'golpe'
      ? golpesDe(a.unit, golpe?.tipo ?? null, false)
      : kind === 'disparo'
        ? disparosDe(a.unit)
        : 1;
  const { h, siguientes } = unGolpe(a, t, opcionesDeDanio(state, a, t, extra, golpe), golpes);
  const modificadores = conElCuarto(h, kind, extra.cuarto);
  const tras = (d: number, luego = d): { count: number; topHp: number } =>
    trasLosGolpes(t, golpes, d, luego);
  const conMenos = tras(h.danio.min, siguientes?.min);
  const conMas = tras(h.danio.max, siguientes?.max);
  const vida = (q: { count: number; topHp: number }): number =>
    stackHp({ ...t, count: q.count, topHp: q.topHp });
  return {
    kind,
    atacante: a.id,
    objetivo: t.id,
    golpes,
    danio: h.danio,
    siguientes,
    bajas: { min: t.count - conMenos.count, max: t.count - conMas.count },
    leQuedan: { min: vida(conMas), max: vida(conMenos) },
    modificadores,
    contraataque: kind === 'golpe' ? previsionDelContraataque(state, a, t, h, tras, golpe) : null,
    salpica:
      kind === 'disparo' && hasTrait(a.unit, 'splash_shot')
        ? splashTargets(state, a, t).map((x) => x.id)
        : [],
  };
}

/**
 * Los modificadores de `h` con dónde cae la tirada fija de un disparo o una granada
 * (`cuarto`), dicho tras el arma, que es el primero (`horquillaDeDanio.conArma`). La
 * frase la elige la previsión por su `kind` (hallazgo S5 de /simplify, 02-11-2026:
 * antes la elegía un interruptor de `DamageOptions` que no cambiaba el daño).
 */
function conElCuarto(
  h: { readonly modificadores: readonly Modificador[]; readonly conArma: string | null },
  kind: PrevisionDeGolpe['kind'],
  cuarto: number | undefined,
): readonly Modificador[] {
  if (cuarto === undefined) return h.modificadores;
  const causa =
    kind === 'explosion'
      ? `la granada: la tirada en el cuarto ${cuarto} de 4`
      : dichoDelCuarto(cuarto);
  const tras = h.conArma === null ? 0 : 1;
  return [
    ...h.modificadores.slice(0, tras),
    { causa, factor: null },
    ...h.modificadores.slice(tras),
  ];
}

/**
 * Cómo queda `t` con `golpes` golpes: el primero de `d`, los demás de `luego`, y
 * cada uno solo si el anterior no lo tumba, como en `melee` y `shoot`. Lo leen la
 * previsión del golpe y lo que quita el golpe que viene (`loQueQuitan`).
 */
function trasLosGolpes(
  t: BattleStack,
  golpes: number,
  d: number,
  luego = d,
): { count: number; topHp: number } {
  let quedan: { count: number; topHp: number } = { count: t.count, topHp: t.topHp };
  for (let i = 0; i < golpes && quedan.count > 0; i++) {
    quedan = trasElGolpe({ ...quedan, unit: t.unit }, i === 0 ? d : luego);
  }
  return quedan;
}

/**
 * La vida que le quitan de verdad a `t` esos golpes (`trasLosGolpes`): la de antes
 * menos la que le queda, así que nunca más de la que tiene (lo que se cobra).
 */
function loQueQuitan(t: BattleStack, golpes: number, d: number, luego = d): number {
  return stackHp(t) - stackHp({ ...t, ...trasLosGolpes(t, golpes, d, luego) });
}

/**
 * Lo que dan los golpes de un intercambio que se prevé: el daño del primero,
 * cuántos da y el de los que siguen, que no cobran la carga. Lo enseñan el sector
 * de la rueda (`SectorDeLaRueda`), cada golpe del que viene (`GolpeEnSuPunto`) y
 * su cuenta (`unGolpe`).
 */
export interface DanioDeLosGolpes {
  /** El daño de un golpe; con más de uno, el del primero (con carga, la lleva). */
  readonly danio: Horquilla;
  readonly golpes: number;
  /** Con más de un golpe y carga, el de cada uno tras el primero, que no la cobra; si no, `null`. */
  readonly siguientes: Horquilla | null;
}

/** Lo que cuenta `unGolpe`: los golpes (`DanioDeLosGolpes`) con la horquilla entera del primero. */
interface GolpeContado extends DanioDeLosGolpes {
  readonly h: ReturnType<typeof horquillaDeDanio>;
}

/**
 * El golpe (o el disparo) de `a` a `t` que se prevé, con sus `opciones` ya hechas
 * (`opcionesDeDanio`, y la rueda encima con `conElGolpe`) y `golpes` golpes: su
 * horquilla y el daño de los que siguen al primero, que no cobran la carga
 * (`danioSinLaCarga`). **La cuenta de un golpe que no se ha dado**, una vez: la
 * leen la previsión del golpe (`previsionDeGolpe`), los sectores de la rueda
 * (`previsionDeLaRueda`) y el golpe que viene en la respuesta
 * (`previsionDelGolpeQueViene`).
 */
function unGolpe(
  a: BattleStack,
  t: BattleStack,
  opciones: DamageOptions,
  golpes: number,
): GolpeContado {
  const h = horquillaDeDanio(a, t, opciones);
  const siguientes = golpes > 1 ? danioSinLaCarga(h.danio, a, t, opciones) : null;
  return { h, danio: h.danio, golpes, siguientes };
}

/**
 * El daño de cada golpe tras el primero, que no cobra la carga (`intercambio`), o
 * `null` si sale el mismo que el del primero (`danio`): sin carga, o quien no
 * carga. Las mismas `opciones` sin la carrera: la carga es lo único que cambia.
 */
function danioSinLaCarga(
  danio: Horquilla,
  a: BattleStack,
  t: BattleStack,
  opciones: DamageOptions,
): Horquilla | null {
  if ((opciones.chargeHexes ?? 0) === 0) return null;
  const sin = horquillaDeDanio(a, t, { ...opciones, chargeHexes: 0 }).danio;
  return sin.min === danio.min && sin.max === danio.max ? null : sin;
}

/**
 * El contraataque de `t` si `a` le golpea: si lo devuelve (`devolveraElGolpe`) y
 * sobrevive. Lo que puede quitar depende de cuántos le queden —el peor golpe
 * deja menos, el mejor más— y de lo que el golpe le haya dejado pegado (el miedo
 * del dragón), así que se cuenta sobre una copia del
 * objetivo con eso puesto, como lo tendría al devolverlo.
 *
 * Con la rueda y un golpe elegido (`golpe`), también lo que ese golpe deja antes
 * del contraataque: Romper guardia quita al atacado lo de su éxito, y el éxito va
 * con el daño —el golpe que más quita es el del punto más alto—, así que la copia
 * con menos (`pocos`) lleva el de `golpe.hasta` y la de más (`muchos`), el de
 * `golpe.desde`; Defensivo pone su defensa a quien pega. Sin la respuesta, el
 * contraataque se prevé como al azar: entre los extremos de su horquilla.
 */
function previsionDelContraataque(
  state: BattleState,
  a: BattleStack,
  t: BattleStack,
  h: ReturnType<typeof horquillaDeDanio>,
  tras: (d: number) => { count: number; topHp: number },
  golpe: GolpeEnLaRueda | null,
): PrevisionDeContraataque | null {
  if (!devolveraElGolpe(state, a, t)) return null;
  const conPeor = tras(h.danio.min);
  if (conPeor.count === 0) return null;
  const conMejor = tras(h.danio.max);
  // Lo que el golpe le deja, colgado sobre una copia con la misma función que
  // `applyStackEffect`: refrescar o añadir.
  const conLoDelGolpe: BattleStack = { ...t, effects: [...t.effects] };
  for (const { trait, effect } of ON_HIT_EFFECTS) {
    if (hasTrait(a.unit, trait)) applyEffect(conLoDelGolpe, effect);
  }
  // Lo de la rueda que el golpe deja a `a` (quien pega o el atacado), en el punto
  // `p` del cruce, con su arma de cuerpo a cuerpo, sobre una copia.
  const rueda = golpe === null ? null : { ...golpe, cifras: ruedaDelIntercambio(a) };
  const conLaRueda = (x: BattleStack, p: Punto, para: EfectoDeLaRueda['a']): BattleStack => {
    const suyos =
      rueda === null
        ? []
        : efectosDeLaRueda(rueda.tipo, p, rueda.cifras).filter((e) => e.a === para);
    if (suyos.length === 0) return x;
    const y: BattleStack = { ...x, effects: [...x.effects] };
    for (const efecto of suyos) applyEffect(y, deLaRueda(state, efecto));
    return y;
  };
  const copia = (count: number, p: Punto): BattleStack =>
    conLaRueda({ ...conLoDelGolpe, count }, p, 'rival');
  // El que menos devuelve es el que más ha perdido; el que más, el que menos.
  const pocos = copia(conMejor.count === 0 ? 1 : conMejor.count, golpe?.hasta ?? 0);
  const muchos = copia(conPeor.count, golpe?.desde ?? 0);
  // Defensivo, sobre quien pega: no depende del punto.
  const quienPega = golpe === null ? a : conLaRueda(a, golpe.desde, 'propio');
  const bajo = horquillaDeDanio(pocos, quienPega, opcionesDeDanio(state, pocos, quienPega));
  const alto = horquillaDeDanio(muchos, quienPega, opcionesDeDanio(state, muchos, quienPega));
  return {
    seguro: conMejor.count > 0,
    danio: { min: bajo.danio.min, max: alto.danio.max },
    modificadores: alto.modificadores,
    conArma: alto.conArma,
  };
}

/** Lo que daría un tipo de la rueda: el daño de un golpe y cuántos golpes (`DanioDeLosGolpes`). */
export interface SectorDeLaRueda extends DanioDeLosGolpes {
  /**
   * Al golpear con un tipo que deja algo al rival antes de su contraataque (Romper
   * guardia), su contraataque de ahora con cada éxito que lo cambia, del mayor al
   * menor (R3 de QA de #263), solo los que da el cruce de la rueda
   * (`puntosDeLaForma`); si no, o en la respuesta, o sin contraataque, `[]`.
   */
  readonly contraataquePorExito: readonly { readonly punto: Punto; readonly danio: Horquilla }[];
}

/**
 * Lo que te haría el golpe que viene si respondes con un tipo de la rueda: quien
 * pega elige a ciegas, así que por cada golpe suyo (`porGolpe`, en el orden de la
 * rueda) el punto en que caería contra tu respuesta y lo que darían sus golpes
 * (`GolpeEnSuPunto`); y, de todos, lo menos y lo más que te quitaría el
 * intercambio entero (`total`: el primero y los siguientes, cada uno solo si sigues
 * en pie, `loQueQuitan`; nunca más de la vida que tienes). Las mismas cuentas que
 * el golpe que se cobra (`unGolpe`, `opcionesDeDanio` con el golpe en su punto).
 */
export interface GolpeQueViene {
  readonly total: Horquilla;
  readonly porGolpe: readonly GolpeEnSuPunto[];
  /**
   * Si alguno de sus golpes te tumba (`GolpeEnSuPunto.tumba` no es `no`): entonces
   * `total.max` es tu vida, y el sector lo dice («puede tumbarte», H2 de QA,
   * 01-11-2026) para que no se lea como el techo de su golpe.
   */
  readonly puedeTumbarte: boolean;
}

/**
 * Si un golpe te tumba, con lo que se cobra (`loQueQuitan`): `siempre`, también lo
 * menos que quita llega a tu vida; `puede`, solo lo más; `no`, ni lo más.
 */
export type Tumba = 'no' | 'puede' | 'siempre';

/** Un golpe del que viene (`GolpeQueViene`): su tipo, el punto del cruce y lo que dan sus golpes. */
export interface GolpeEnSuPunto extends DanioDeLosGolpes {
  readonly tipo: TipoDeGolpe;
  readonly punto: Punto;
  /**
   * Lo que te quitaría de verdad el intercambio con ese golpe: sus golpes, cada
   * uno solo si sigues en pie, y nunca más de tu vida (`loQueQuitan`). `danio` y
   * `siguientes` son cada golpe en bruto, que pueden pasar de ella.
   */
  readonly quita: Horquilla;
  readonly tumba: Tumba;
}

/**
 * Lo que enseña la rueda a quien elige (`papel`): por cada tipo, el daño de cada
 * golpe en la horquilla de su sector (`puntosDe`) y cuántos golpes da. Quien pega
 * ve su golpe contra el objetivo; quien responde, su contraataque contra quien le
 * ataca, con los que tiene ahora (si sigue en pie). `sinContraataque` lleva, en
 * las dos fases, el motivo si el objetivo no devolverá el golpe: quien responde
 * no tiene entonces daño que ver y su elección solo cuenta para el cruce.
 *
 * Sale de las mismas cuentas que el golpe (`horquillaDeDanio`, `opcionesDeDanio`,
 * `golpesDe`) y no toca el estado ni el `Rng`. Lanza si la pelea no es de rueda o
 * el golpe no se puede dar, como `previsionDe`.
 */
export function previsionDeLaRueda(
  state: BattleState,
  accion: BattleAction & { type: 'attack' },
  papel: PapelEnLaRueda,
): {
  /** Un sector por tipo de la rueda de la batalla (`FormaDeLaRueda.golpes`), y solo esos. */
  readonly porTipo: Readonly<Partial<Record<TipoDeGolpe, SectorDeLaRueda>>> | null;
  readonly sinContraataque: string | null;
  /**
   * Al golpear, el contraataque del rival tras un golpe que no le deja nada encima
   * (con lo que comparar `contraataquePorExito`): el del golpe neutro de la rueda
   * (`golpeNeutro`: Normal, en el medio) o, en la que no lo tiene (la de 3), el de
   * un golpe sin rueda, que cae en cualquier punto. En la respuesta o sin
   * contraataque, `null`.
   */
  readonly contraataque: Horquilla | null;
  /**
   * La carga que cobra quien pega (R6 de QA de #260), en las dos fases: al golpear
   * ya la llevan las cifras de los sectores; al responder, las del golpe que viene
   * (`previsionDelGolpeQueViene`). Sin carga, `null`. Se dice con `dichoDeLaCarga`.
   */
  readonly carga: CargaDeLaRueda | null;
  /**
   * Las cifras de la rueda con el arma de cuerpo a cuerpo de quien elige
   * (`ruedaDelIntercambio`): con ellas se dicen las notas de los sectores
   * (`efectoDeGolpe`).
   */
  readonly rueda: CifrasDeLaRueda;
  /**
   * El nivel de cada tipo de la rueda de la batalla con el arma de **quien pega**
   * (`nivelesEnLaForma`), en las dos fases: al golpear, el tuyo; al responder, el
   * de tu enemigo (requisito 5 del 25-10-2026). Normal no lleva. Tiñe los sectores
   * del diálogo, como la ficha del arma.
   */
  readonly niveles: Readonly<Partial<Record<TipoDeGolpe, number>>>;
} {
  const s = activeStack(state);
  if (s === null || state.finished !== null) throw new Error('no le toca a ninguna unidad');
  const { target, desdeAhi, carga } = golpePreparado(state, s, accion, false);
  const [quien, contra, extra, devuelve] =
    papel === 'golpe'
      ? ([desdeAhi, target, { chargeHexes: carga }, false] as const)
      : ([target, desdeAhi, SIN_EXTRA, true] as const);
  // Si el objetivo no devolverá el golpe, lo dicen las notas de las dos fases;
  // quien responde, además, no tiene daño que ver.
  const sinContraataque = contraataqueBlocker(state, desdeAhi, target);
  const rueda = ruedaDelIntercambio(quien);
  const forma = formaDeLaBatalla(state);
  // Los niveles son siempre del arma de quien pega, también en la respuesta: lo que
  // se teme del golpe que viene.
  const niveles = nivelesEnLaForma(nivelesDelGolpe(desdeAhi.unit, 'arma'), forma);
  // La carga es de quien golpea: la cobra su primer golpe, en las dos fases.
  const cobrada = cargaDeLaRueda(cargaEfectiva(carga, CARGA), desdeAhi.unit);
  if (papel === 'respuesta' && sinContraataque !== null) {
    return { porTipo: null, sinContraataque, contraataque: null, carga: cobrada, rueda, niveles };
  }
  // Las opciones, una vez; cada tipo pone encima su sector.
  const opciones = opcionesDeDanio(state, quien, contra, extra);
  // El contraataque que se le devolvería a quien pega, con el golpe `golpe` (la
  // misma cuenta que la previsión del golpe, `previsionDelContraataque`).
  const contraataqueCon = (golpe: GolpeEnLaRueda | null): Horquilla | null =>
    previsionDeGolpe(state, desdeAhi, target, 'golpe', { chargeHexes: carga }, golpe).contraataque
      ?.danio ?? null;
  const conContraataque = papel === 'golpe' && sinContraataque === null;
  const neutro = golpeNeutro(forma);
  const porTipo: Partial<Record<TipoDeGolpe, SectorDeLaRueda>> = {};
  for (const tipo of forma.golpes) {
    const sector = delSector(tipo, forma);
    const { danio, golpes, siguientes } = unGolpe(
      quien,
      contra,
      conElGolpe(opciones, quien.unit, sector, papel, forma, rueda),
      golpesDe(quien.unit, tipo, devuelve),
    );
    const contraataquePorExito = conContraataque
      ? [...puntosDeLaForma(forma)].reverse().flatMap((punto) => {
          if (punto < sector.desde || punto > sector.hasta) return [];
          if (!efectosDeLaRueda(tipo, punto, rueda).some((e) => e.a === 'rival')) return [];
          const danio = contraataqueCon({ tipo, desde: punto, hasta: punto });
          return danio === null ? [] : [{ punto, danio }];
        })
      : [];
    porTipo[tipo] = { danio, golpes, siguientes, contraataquePorExito };
  }
  return {
    porTipo,
    sinContraataque,
    contraataque: conContraataque
      ? contraataqueCon(neutro === null ? null : delSector(neutro, forma))
      : null,
    carga: cobrada,
    rueda,
    niveles,
  };
}

/**
 * Al responder en la rueda, lo que te haría el golpe que viene con cada respuesta
 * (`GolpeQueViene`), una por tipo de la rueda de la batalla; también sin
 * contraataque. Desde donde golpeará quien pega (`golpePreparado`, con la carga de
 * su recta), como `previsionDeLaRueda`, aparte de ella: solo lo pide quien lo
 * pinta (la sesión), y el agente (`serializeBattleResponse`) no lo paga. No toca
 * el estado ni el `Rng`. Lanza si el golpe no se puede dar.
 */
export function previsionDelGolpeQueViene(
  state: BattleState,
  accion: BattleAction & { type: 'attack' },
): Readonly<Partial<Record<TipoDeGolpe, GolpeQueViene>>> {
  const s = activeStack(state);
  if (s === null || state.finished !== null) throw new Error('no le toca a ninguna unidad');
  const { target, desdeAhi, carga } = golpePreparado(state, s, accion, false);
  const forma = formaDeLaBatalla(state);
  // Las opciones, las cifras de su arma y cuántos golpes da cada tipo, una vez;
  // cada golpe pone encima su punto.
  const opciones = opcionesDeDanio(state, desdeAhi, target, { chargeHexes: carga });
  const cifras = ruedaDelIntercambio(desdeAhi);
  // Lo más que se le puede quitar: tumbarlo es quitarle esto (`loQueQuitan`).
  const vida = stackHp(target);
  const suyos = forma.golpes.map((tipo) => ({
    tipo,
    golpes: golpesDe(desdeAhi.unit, tipo, false),
  }));
  const porRespuesta: Partial<Record<TipoDeGolpe, GolpeQueViene>> = {};
  for (const respuesta of forma.golpes) {
    const porGolpe = suyos.map(({ tipo, golpes }): GolpeEnSuPunto => {
      const punto = puntoDelCruce(tipo, respuesta, forma);
      const enSuPunto = conElGolpe(
        opciones,
        desdeAhi.unit,
        enElPunto(tipo, punto),
        'golpe',
        forma,
        cifras,
      );
      const { danio, siguientes } = unGolpe(desdeAhi, target, enSuPunto, golpes);
      // El intercambio entero, como se cobra: cada golpe solo si sigue en pie.
      const quita = {
        min: loQueQuitan(target, golpes, danio.min, siguientes?.min),
        max: loQueQuitan(target, golpes, danio.max, siguientes?.max),
      };
      const tumba: Tumba = quita.min === vida ? 'siempre' : quita.max === vida ? 'puede' : 'no';
      return { tipo, punto, danio, golpes, siguientes, quita, tumba };
    });
    porRespuesta[respuesta] = {
      total: {
        min: Math.min(...porGolpe.map((g) => g.quita.min)),
        max: Math.max(...porGolpe.map((g) => g.quita.max)),
      },
      porGolpe,
      puedeTumbarte: porGolpe.some((g) => g.tumba !== 'no'),
    };
  }
  return porRespuesta;
}
// ---------------------------------------------------------------- lanzar

/**
 * Lo que haría `h` lanzado por `l` sobre `apuntado` si cayera ahora, sin tocar el
 * estado: a quién alcanza, el daño tras la armadura (y el escudo), lo que mata, la
 * cura y lo que le dejaría colgado. Con las cuentas que lo aplican (`enElActo`,
 * `colgarLoQueDura`).
 */
function previsionDeLanzar(
  state: BattleState,
  h: Hechizo,
  l: Lanzador,
  apuntado: Apuntado,
): PrevisionDeLanzar {
  const { efectos, cargas } = resueltosDe(h, l);
  const ctx = contextoDe(h, l);
  const impactos = afectadosDe(state, h, l, apuntado).map((t): ImpactoDeHechizo => {
    let danio = 0;
    let parado = 0;
    let cura = 0;
    let hiere = false;
    for (const e of efectos) {
      if ('cuando' in e) continue;
      if (e.tipo === 'danio') {
        hiere = true;
        const r = trasLaArmadura(e.cantidad, t, !e.armadura);
        danio += r.danio;
        parado += r.parado;
      } else if (e.tipo === 'cura') {
        cura += e.cantidad;
      }
    }
    const quedan = hiere ? trasElGolpe(t, danio) : null;
    const dura =
      ctx.duracion === null
        ? null
        : cuantoDura(ctx.duracion, ctx.poder, state.turno?.n ?? 0, {
            afectado: t.id,
            lanzador: ctx.lanzadorId,
          });
    const colgados =
      dura === null
        ? []
        : efectos.flatMap((e) => {
            const c = efectoColgado(
              e,
              { source: ctx.source, bando: ctx.bando, ...dura },
              'cuando' in e ? cargas(e) : null,
            );
            return c === null ? [] : [c];
          });
    return {
      objetivo: t.id,
      danio: hiere ? danio : null,
      parado,
      bajas: quedan === null ? null : t.count - quedan.count,
      leQuedan: quedan === null ? null : stackHp({ ...t, ...quedan }),
      cura: h.efectos.some((e) => e.tipo === 'cura') ? curaDe(cura, t) : null,
      efectos: colgados,
    };
  });
  return {
    objetivo: apuntado !== null && 'target' in apuntado ? apuntado.target : null,
    at: apuntado !== null && 'at' in apuntado ? apuntado.at : null,
    diferido: esDiferido(h),
    impactos,
  };
}

/** Lo que haría a uno que alcanza un hechizo (`PrevisionDeLanzar.impactos`). */
export interface ImpactoDeHechizo {
  readonly objetivo: string;
  /** El daño que llegaría, tras la armadura; `null` si no hiere. */
  readonly danio: number | null;
  readonly parado: number;
  readonly bajas: number | null;
  readonly leQuedan: number | null;
  /** PV que repondría, si cura; `null` si no cura. */
  readonly cura: number | null;
  /** Lo que le dejaría colgado. */
  readonly efectos: readonly StackEffect[];
}

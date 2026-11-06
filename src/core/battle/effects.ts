/**
 * Efectos temporales sobre un stack: lo que dura unas rondas y luego se va.
 *
 * Es un libro mayor y nada más: no sabe qué criaturas existen, qué rasgo pone
 * cada efecto ni quién es inmune a qué —eso son reglas del juego y las decide
 * `battle.ts`—, así que solo importa `./types.js`.
 *
 * La regla que lo sostiene todo: **un efecto no se revierte, se filtra**. El
 * stack nunca guarda un bono ya sumado; la lista es la única verdad y el total
 * se calcula al leer (`stackSpeed`, `effectiveAttack`, `effectiveDefense`).
 * Caducar es entonces quitar de una lista, y quitar de una lista no puede
 * descuadrar nada — que es justo lo que pasaba antes, cuando `spells.ts` sumaba
 * a `speedBonus` y nadie restaba nunca: una Lentitud de la ronda 1 duraba toda
 * la batalla.
 *
 * Y la segunda regla, la de acumulación: **el mismo origen refresca, no
 * apila** (ver `applyEffect`). De orígenes distintos sí se suman, sin depender
 * del orden en que se aplicaron.
 */

import { dichoDeImpide } from '../magia/dicho.js';
import type {
  Afecta,
  AQuien,
  CifraDeHechizo,
  CuandoSalta,
  DisiparDe,
  Duracion,
  Impedible,
  SeAcabaSiMuere,
} from '../magia/formato.js';
import type { BattleStack, Side } from './types.js';

/**
 * Los tipos de efecto que existen. Es una lista de valores y no solo un tipo
 * porque `test/invariantes.test.ts` la recorre para exigir que cada uno tenga
 * quien lo lea: un tipo que nadie suma se colgaría del stack sin hacer nada.
 * `'defense'` lo suma `effectiveDefense` (`damage.ts`); lo ponen Defensivo y
 * Romper guardia de la rueda del golpe y los hechizos. Las cifras que añadió la
 * magia (06-11-2026): `armadura` (la lee `trasLaArmadura`), `fuerza` y
 * `agilidad` (el daño de cada golpe, `danioConLosEfectos`; la agilidad, también la
 * defensa y las casillas). Y lo que no es una cifra: `impide` (`impedidoPor`),
 * `escudo` (`herir`) y `disparador` (`saltar`, `battle.ts`). Mismo patrón que
 * `CREATURE_TRAITS` en `types.ts`.
 */
export const EFFECT_KINDS = [
  'speed',
  'attack',
  'defense',
  'armadura',
  'fuerza',
  'agilidad',
  'impide',
  'escudo',
  'disparador',
] as const;

export type EffectKind = (typeof EFFECT_KINDS)[number];

/** Los tipos que son una cifra que se suma al leer (`effectTotal`). */
export const CIFRAS_DE_EFECTO = [
  'speed',
  'attack',
  'defense',
  'armadura',
  'fuerza',
  'agilidad',
] as const;
export type CifraDeEfecto = (typeof CIFRAS_DE_EFECTO)[number];

/** Si un tipo de efecto es una cifra. */
export function esCifraDeEfecto(k: EffectKind): k is CifraDeEfecto {
  return (CIFRAS_DE_EFECTO as readonly string[]).includes(k);
}

/** Lo que tienen todos los efectos: quién lo puso, lo que le queda y cuándo se va. */
interface ComunDelEfecto {
  /** Quién lo puso: el id del hechizo ('slow'), el del rasgo ('fear') o el tipo de la rueda. */
  readonly source: string;
  /** Rondas que le quedan. Baja una en cada `beginRound`. */
  roundsLeft: number;
  /**
   * Si dura «hasta el próximo turno de alguien» (la rueda del golpe, un hechizo):
   * hasta cuándo. `roundsLeft` sigue de tope, por si ese turno no llega.
   */
  readonly hasta?: HastaElTurno;
  /** De un hechizo: el bando de quien lo lanzó (lo lee `disipar`). */
  readonly bando?: Side;
  /** De un hechizo: se quita si cae este stack (`seAcabaSiMuere`; `anotarLaMuerte`). */
  readonly seAcabaSiMuere?: string;
}

/** Un efecto que suma a una cifra. */
export interface EfectoDeCifra extends ComunDelEfecto {
  readonly kind: CifraDeEfecto;
  readonly amount: number;
}

/** No puede hacer lo de `que` mientras dure (`impedidoPor`). */
export interface EfectoQueImpide extends ComunDelEfecto {
  readonly kind: 'impide';
  readonly que: readonly Impedible[];
}

/** Se come el daño que llega, tras la armadura, hasta agotarse (`herir`). */
export interface EfectoDeEscudo extends ComunDelEfecto {
  readonly kind: 'escudo';
  /** Lo que le queda por comerse; con 0 se quita. */
  queda: number;
}

/** Un disparador colgado: sus efectos, ya con las cifras de quien lo lanzó. */
export interface EfectoDisparador extends ComunDelEfecto {
  readonly kind: 'disparador';
  readonly disparador: DisparadorResuelto;
  /** Las veces que le quedan por saltar; `null`, mientras dure. */
  cargas: number | null;
}

export type StackEffect = EfectoDeCifra | EfectoQueImpide | EfectoDeEscudo | EfectoDisparador;

/**
 * Un efecto de un hechizo con las cantidades ya calculadas con el poder de quien
 * lo lanzó: lo que guarda un disparador (`DisparadorResuelto`). Lo resuelve
 * `resolverEfecto` (`spells.ts`).
 */
export type EfectoResuelto =
  | { readonly tipo: 'danio'; readonly cantidad: number; readonly armadura: boolean }
  | { readonly tipo: 'cura'; readonly cantidad: number }
  | { readonly tipo: 'disipar'; readonly de: DisiparDe }
  | { readonly tipo: 'cifra'; readonly cifra: CifraDeHechizo; readonly valor: number }
  | { readonly tipo: 'impide'; readonly que: readonly Impedible[] }
  | { readonly tipo: 'escudo'; readonly absorbe: number };

/**
 * Un disparador como se cuelga: el de su hechizo con las cantidades resueltas, el
 * poder de quien lo lanzó (para las rondas «poder» de lo que deja) y quién lo lanzó.
 * Se guarda entero en el efecto: editar el hechizo a media pelea (la arena) no
 * cambia lo ya echado.
 */
export interface DisparadorResuelto {
  readonly cuando: CuandoSalta;
  readonly yAlLanzarse: boolean;
  readonly a: AQuien;
  readonly radio: number;
  readonly afecta: Afecta;
  readonly duracion: Duracion | null;
  readonly seAcabaSiMuere: SeAcabaSiMuere | null;
  readonly efectos: readonly EfectoResuelto[];
  readonly poder: number;
  /** El stack que lo lanzó. */
  readonly lanzador: string;
  /** Cómo se dice, ya hecho (`dichoDelEfecto` del disparador). */
  readonly dicho: string;
}

/**
 * Hasta qué turno dura un efecto: el `turno.n` en que se colgó, cuándo vence
 * (`al`) y de quién es ese turno (`de`, un stack; sin él, el del afectado). El
 * turno en que nace no cuenta: se quita con otro `n`.
 */
export interface HastaElTurno {
  readonly turno: number;
  readonly al: CuandoVence;
  readonly de?: string;
}

/**
 * Cuándo vence un efecto de la rueda: al **empezar** el siguiente turno del
 * afectado (Defensivo: `abrirTurno`) o al **terminarlo** (Romper guardia: `endTurn`). Decisión del
 * usuario, 14-10-2026. El único nombre de esto: lo leen el efecto, el evento, la
 * rueda y su nota.
 */
export type CuandoVence = 'empezar' | 'terminar';

/** La moral se mueve entre −3 y +3 (`CLAUDE.md`, tabla de reglas). */
const MIN_MORALE = -3;
const MAX_MORALE = 3;

/**
 * Recorta a la horquilla de la moral. La regla vive aquí y no repartida en pares
 * de números sueltos por el motor.
 */
export function clampMorale(n: number): number {
  return Math.max(MIN_MORALE, Math.min(MAX_MORALE, n));
}

/**
 * Cuelga el efecto del stack y devuelve el que queda vivo.
 *
 * **Política de acumulación: el mismo origen refresca, no apila.** Sin ella,
 * dos mordiscos seguidos del dragón óseo dejaban −4 de ataque sostenido y una
 * Lentitud lanzada cada ronda iba a −2, −4, −6, y cada consumidor estaba
 * tomando esta decisión por accidente. Se conserva la
 * duración mayor: refrescar alarga, nunca acorta, que es lo del original.
 *
 * Guarda una **copia**: `roundsLeft` es mutable y `tickEffects` lo baja cada
 * ronda, así que quedarse con el objeto de quien llama iría gastando una tabla
 * de constantes como `ON_HIT_EFFECTS` hasta que el miedo dejara de durar.
 */
export function applyEffect(stack: BattleStack, effect: StackEffect): StackEffect {
  const previo = mismoOrigen(stack, effect);
  const nuevo: StackEffect = {
    ...effect,
    roundsLeft: Math.max(effect.roundsLeft, previo?.roundsLeft ?? 0),
  };
  stack.effects = [...stack.effects.filter((e) => e !== previo), nuevo];
  return nuevo;
}

/** El efecto vivo que este refrescaría: mismo tipo y mismo origen. */
function mismoOrigen(
  stack: BattleStack,
  effect: Pick<StackEffect, 'kind' | 'source'>,
): StackEffect | undefined {
  return stack.effects.find((e) => e.kind === effect.kind && e.source === effect.source);
}

/**
 * Rondas que le quedan al efecto que este refrescaría, o 0 si no lleva ninguno.
 *
 * Es la cara de lectura de `applyEffect`, y usa su misma función para decidir
 * cuál es «el mismo»: quien valora un lanzamiento tiene que saber que relanzar
 * sobre un objetivo que ya lo tiene solo compra la diferencia de rondas, porque
 * el mismo origen REFRESCA y no apila. Sin esto la IA pagaba cada ronda el
 * precio del primer lanzamiento.
 */
export function roundsLeftOf(
  stack: BattleStack,
  effect: Pick<StackEffect, 'kind' | 'source'>,
): number {
  return mismoOrigen(stack, effect)?.roundsLeft ?? 0;
}

/** Lo que suman todos los efectos vivos de esa cifra. */
export function effectTotal(stack: Pick<BattleStack, 'effects'>, kind: CifraDeEfecto): number {
  let total = 0;
  for (const e of stack.effects) if (e.kind === kind) total += e.amount;
  return total;
}

/**
 * Los disparadores de `stack` que saltan `cuando` (`disparador`), en el orden en que
 * se colgaron. La única lectura de los disparadores: la hace `saltar` (`battle.ts`).
 */
export function disparadoresDe(
  stack: Pick<BattleStack, 'effects'>,
  cuando: CuandoSalta,
): EfectoDisparador[] {
  return stack.effects.filter(
    (e): e is EfectoDisparador => e.kind === 'disparador' && e.disparador.cuando === cuando,
  );
}

/**
 * El efecto que le impide a `stack` hacer `que`, o `null`. **La única lectura**
 * de `impide`: la hacen los `*Blocker` del motor (golpear, disparar,
 * contraatacar, moverse, lanzar), así que la lista legal, la IA y el agente lo
 * respetan sin saberlo.
 */
export function impedidoPor(
  stack: Pick<BattleStack, 'effects'>,
  que: Impedible,
): EfectoQueImpide | null {
  for (const e of stack.effects) if (e.kind === 'impide' && e.que.includes(que)) return e;
  return null;
}

/**
 * Descuenta una ronda a cada efecto y devuelve los que acaban de caducar.
 * Un efecto de N rondas lanzado en la ronda R vive de la R a la R+N−1.
 */
export function tickEffects(stack: BattleStack): StackEffect[] {
  const caducados: StackEffect[] = [];
  const vivos: StackEffect[] = [];
  for (const e of stack.effects) {
    e.roundsLeft -= 1;
    if (e.roundsLeft > 0) vivos.push(e);
    else caducados.push(e);
  }
  stack.effects = vivos;
  return caducados;
}

// ---------------------------------------------------------------- dicho

/**
 * Cómo se llama cada clase de efecto. Tipada por `EffectKind`, cerrada: un
 * `EffectKind` nuevo no compila hasta que alguien le escriba su nombre.
 */
export const NOMBRE_DEL_EFECTO: Readonly<Record<EffectKind, string>> = {
  speed: 'velocidad',
  attack: 'ataque',
  defense: 'defensa',
  armadura: 'armadura',
  fuerza: 'fuerza',
  agilidad: 'agilidad',
  impide: 'impide',
  escudo: 'escudo',
  disparador: 'disparador',
};

/**
 * Lo que hace un efecto, dicho: «ataque −2». El único texto de un efecto: lo leen
 * el parte, la previsión de un hechizo, la ficha del héroe de la arena y lo que
 * hace un poder (`queHaceElPoder`).
 */
export function cifraDeEfecto(kind: EffectKind, amount: number): string {
  return `${NOMBRE_DEL_EFECTO[kind]} ${amount > 0 ? '+' : ''}${amount}`;
}

/**
 * «1 ronda», «3 rondas»: el número concuerda. Lo leen el parte, la previsión y
 * la ficha del héroe de la arena, que decía «1 rondas» (H5 de QA del banco).
 */
export function enRondas(n: number): string {
  return `${n} ${n === 1 ? 'ronda' : 'rondas'}`;
}

/** Cuándo salta un disparador, en corto: la pastilla (el entero va en su nota). */
const CUANDO_CORTO: Readonly<Record<CuandoSalta, string>> = {
  empezarSuTurno: 'al empezar su turno',
  terminarSuTurno: 'al terminar su turno',
  alSerGolpeado: 'si le golpean',
  alGolpear: 'al golpear',
  alMorir: 'al caer',
};

/**
 * Lo que hace un efecto colgado en una pastilla: como `dichoDelEfecto`, y el
 * disparador en corto («si le golpean…»), que entero no cabe.
 */
export function dichoCortoDelEfecto(e: StackEffect): string {
  return e.kind === 'disparador' ? `${CUANDO_CORTO[e.disparador.cuando]}…` : dichoDelEfecto(e);
}

/**
 * Lo que hace un efecto colgado, sin su duración: «ataque −2», «no puede
 * moverse», «escudo 12», «al ser golpeado…». **El único texto de un efecto
 * colgado**: lo leen las pastillas, el parte, la previsión y la ficha.
 */
export function dichoDelEfecto(e: StackEffect): string {
  switch (e.kind) {
    case 'impide':
      return dichoDeImpide(e.que);
    case 'escudo':
      return `escudo ${e.queda}`;
    case 'disparador':
      return e.disparador.dicho;
    default:
      return cifraDeEfecto(e.kind, e.amount);
  }
}

/**
 * El signo de lo que hace un efecto para quien lo lleva: una cifra, el suyo; lo que
 * impide, en contra; el escudo, a favor; un disparador, sin signo (`0`).
 */
export function signoDelEfecto(e: StackEffect): number {
  switch (e.kind) {
    case 'impide':
      return -1;
    case 'escudo':
      return 1;
    case 'disparador':
      return 0;
    default:
      return e.amount;
  }
}

/**
 * Lo que hace un hechizo que no hiere, en pocas palabras: «cura 4 PV», «velocidad
 * +2 durante 3 rondas»; `null` si no cura ni deja nada. Una sola redacción para la
 * previsión del hechizo, la del poder y la ficha.
 */
export function curaOEfecto(cura: number | null, efectos: readonly StackEffect[]): string | null {
  const partes: string[] = [];
  if (cura !== null && cura > 0) partes.push(`cura ${cura} PV`);
  for (const e of efectos) {
    const dura =
      e.hasta === undefined
        ? `durante ${enRondas(e.roundsLeft)}`
        : `hasta que ${e.hasta.al === 'empezar' ? 'empiece' : 'termine'} un turno`;
    partes.push(`${dichoDelEfecto(e)} ${dura}`);
  }
  if (partes.length === 0) return cura === null ? null : `cura ${cura} PV`;
  return partes.join('; ');
}

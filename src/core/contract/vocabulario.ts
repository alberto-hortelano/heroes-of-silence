/**
 * **El vocabulario del contrato del agente**: lo que el agente lee y escribe en
 * inglés y el núcleo nombra en español, traducido en un solo sitio. Lo leen el
 * esquema y la prosa del contrato (`esquemas.ts`, `formato.ts`), lo que se le
 * manda (las vistas y las peticiones) y lo que manda él (el director). Tres familias:
 *
 * - **Los huecos de equipo** (decisión del usuario, 12-10-2026: «los huecos van en
 *   inglés en el contrato del agente ya»), **simétricos por uso** (simplify de F2):
 *   el arma de cuerpo a cuerpo (`melee_weapon`), la segunda (`second_melee_weapon`,
 *   25-10-2026: la lanza dejó su hueco `lance` y es un arma más), la que dispara
 *   (`ranged_weapon`), la armadura y el escudo. Por dentro —el núcleo, la crónica,
 *   el cable del espectador— siguen en español (`HUECOS`). El de disparar es
 *   `ranged_weapon` y no `ranged`, que es una opción del daño: dos cosas con el
 *   mismo nombre no se distinguirían en el cable. Un hueco del contrato es
 *   un `Slot`, que **solo produce este módulo**: el tipo lleva una marca que nadie
 *   más puede poner sin un `as Slot`, y eso lo vigila `test/invariantes-batalla.test.ts`.
 * - **La rueda del golpe y los poderes** (F6, 19-10-2026): el agente elige su golpe
 *   al atacar (`hit`) y su respuesta cuando le golpean (`battle_response`), y usa
 *   los poderes de sus unidades con la jugada `power`, que se llama como la del
 *   núcleo y como su hecho.
 * - **La muralla** (fase 2 del puesto fronterizo, 04-11-2026): las cuatro jugadas de
 *   la escala y la puerta (`JUGADA_DE_MURALLA`) y los hechos que las cuentan.
 *
 * Eran dos módulos (`huecos.ts`, `golpes.ts`) hasta el simplify de F3-F6
 * (19-10-2026): una sola puerta para lo que se traduce.
 */
import type { z } from 'zod';
import {
  type CruceDeLaRueda,
  type FormaDeLaRueda,
  tipoDeGolpeBlocker,
} from '../battle/formas-de-la-rueda.js';
import type {
  BattleAction,
  CuandoVence,
  EffectKind,
  JugadaDeMuralla,
  PuertaDeMuralla,
} from '../battle/types.js';
import type { CuandoSalta } from '../magia/formato.js';
import {
  type MejoraDelPuesto,
  OBRAS_DE_UN_PUESTO,
  type ObraDelPuesto,
  obraDesconocida,
} from '../map/tipos.js';
import { type LineaDelReparto, tipoDelVeterano } from '../state/sitios.js';
import type { AdventureAction, GameState } from '../state/tipos.js';
import {
  esTipoDeGolpe,
  type Hex,
  HUECOS,
  type Hueco,
  huecoDesconocido,
  type TipoDeGolpe,
  TODOS_LOS_GOLPES,
} from '../types.js';
import { enteroDesde } from '../validar.js';
import type { adventureActionSchema, battleActionSchema } from './esquemas.js';

// ---------------------------------------------------------------- los puestos

/**
 * Cómo se dice en el contrato la obra de un puesto (`node.mejora`, puesto
 * fronterizo, fase 3): el `upgrade` del nodo en `knownMap`. Sin obra, `none` (la
 * caseta de un paso tomado, o un paso que nadie ha tomado).
 */
export const UPGRADE_DE_MEJORA = {
  ninguna: 'none',
  empalizada: 'palisade',
  muralla: 'wall',
} as const satisfies Readonly<Record<MejoraDelPuesto, string>>;

/** Lo que puede valer el `upgrade` de un nodo en el contrato, y el del hecho `outpost_upgraded`. */
export type Upgrade = (typeof UPGRADE_DE_MEJORA)[MejoraDelPuesto];

/** Los tres, en el orden de la tabla: lo que el arnés de QA admite en un nodo. */
const UPGRADES: readonly Upgrade[] = Object.values(UPGRADE_DE_MEJORA);

/** Si `valor` es un `upgrade` del contrato (`UPGRADES`). */
export function esUpgrade(valor: unknown): valor is Upgrade {
  return (UPGRADES as readonly unknown[]).includes(valor);
}

/**
 * La obra de un `upgrade` del agente (`upgrade_outpost`, 10-11-2026), o excepción
 * con las que valen: la inversa de `UPGRADE_DE_MEJORA` sin `none`, que no es una
 * obra que se haga. Lanza y no devuelve `null`, como `huecoDelSlot`: quien la llama
 * (`accionDelAgente`) está dentro del `try` del director, que descarta esa jugada
 * con este motivo y sigue con las demás.
 */
function obraDelUpgrade(upgrade: string): ObraDelPuesto {
  const obra = OBRAS_DE_UN_PUESTO.find((o) => UPGRADE_DE_MEJORA[o] === upgrade);
  if (obra === undefined) {
    throw new Error(
      obraDesconocida(
        `"${upgrade}"`,
        OBRAS_DE_UN_PUESTO.map((o) => UPGRADE_DE_MEJORA[o]),
      ),
    );
  }
  return obra;
}

// ---------------------------------------------------------------- los huecos

declare const MARCA_DE_SLOT: unique symbol;

/** Un hueco como lo nombra el contrato del agente (`SLOT_DE_HUECO`). */
export type Slot = string & { readonly [MARCA_DE_SLOT]: true };

/** Cómo se llama cada hueco en el contrato. */
export const SLOT_DE_HUECO: Readonly<Record<Hueco, Slot>> = {
  arma: 'melee_weapon' as Slot,
  segunda: 'second_melee_weapon' as Slot,
  distancia: 'ranged_weapon' as Slot,
  armadura: 'armor' as Slot,
  escudo: 'shield' as Slot,
  montura: 'mount' as Slot,
};

/** Los seis, en el orden de `HUECOS`: lo que se le ofrece al agente. */
export const SLOTS: readonly Slot[] = HUECOS.map((h) => SLOT_DE_HUECO[h]);

/**
 * El hueco de un `slot` del agente, o excepción con los que valen. Lanza y no
 * devuelve `null`: quien la llama (`accionDelAgente`) está dentro del `try` del
 * director, que descarta esa acción con este motivo y sigue con las demás.
 */
function huecoDelSlot(slot: string): Hueco {
  const hueco = HUECOS.find((h) => SLOT_DE_HUECO[h] === slot);
  if (hueco === undefined) {
    throw new Error(huecoDesconocido(slot, SLOTS));
  }
  return hueco;
}

/**
 * Una acción de aventura tal como la escribe el agente: **la salida del zod**
 * (`adventureActionSchema`), no una copia a mano (#313, 11-11-2026: la copia y el
 * esquema se separaron una vez, QA H2 de #319, y el director los ataba con un
 * `as`). El zod juzga la forma; el valor —un `count`, un hueco, una obra— se juzga
 * aquí o en el `*Blocker` del núcleo, jugada a jugada («Forma y valor»,
 * `docs/areas/agente.md`).
 *
 * `import type` y no de ejecución: `esquemas.ts` importa de aquí
 * `JUGADA_DE_MURALLA`, y un ciclo solo de tipos dentro de `contract/` se borra al
 * compilar (el guardia de ciclos de `invariantes-capas.test.ts` lo admite dentro
 * de una carpeta; uno de ejecución, no).
 */
export type AccionDelAgente = z.infer<typeof adventureActionSchema>;

/** Una línea de `distribute_troops` como la escribe el agente (todo opcional: se juzga al traducir). */
type LineaDelAgente = Extract<AccionDelAgente, { type: 'distribute_troops' }>['withHero'][number];

/**
 * Lo que el agente escribe junto a un `veteran` (`creature`, `count`) se mira aquí,
 * con la partida: un veterano es uno solo, y de su tipo (`tipoDelVeterano`). Lo que
 * no escribió no se juzga. El motivo, o `null`: lo lanza quien pregunta, cada uno
 * con su prefijo (`leave_troops` y `take_troops` sin ninguno; el reparto, con el
 * de los demás rechazos del reparto: `lineaDelReparto`).
 */
function veteranoBlocker(
  state: GameState,
  hero: string,
  veteran: string,
  creature: string | undefined,
  count: number | undefined,
): string | null {
  if (count !== undefined && count !== 1) return `un veterano es uno solo: no se mueven ${count}`;
  const tipo = tipoDelVeterano(state, hero, veteran);
  if (creature !== undefined && tipo !== null && tipo !== creature) {
    return `el veterano "${veteran}" es de tipo "${tipo}", no "${creature}"`;
  }
  return null;
}

/**
 * Por qué una línea de `distribute_troops` no vale, o `null`. Aquí y no en el zod
 * (QA de «el contrato del agente, al día», H2, 10-11-2026): en un reparto que
 * enumera lo que se queda con el héroe, escribir `count: 0` para «ninguno de estos»
 * es un error natural, y en el esquema se llevaba el turno entero.
 */
function lineaBlocker(state: GameState, hero: string, l: LineaDelAgente): string | null {
  if (l.veteran !== undefined) return veteranoBlocker(state, hero, l.veteran, l.creature, l.count);
  if (l.creature === undefined || l.count === undefined) {
    return 'una línea de "withHero" lleva "creature" y "count", o "veteran": esta no dice a quién';
  }
  // `enteroDesde` y no `isInteger`, la comprobación del núcleo: `1e21` es entero y
  // llegaba al «0 o más» de `repartirTropaBlocker` (#318).
  if (!enteroDesde(l.count, 1)) {
    return `el "count" de "${l.creature}" es ${l.count}: va un entero de 1 en adelante (lo que no se queda con el héroe no se escribe)`;
  }
  return null;
}

/**
 * Una línea de `distribute_troops` como la del núcleo (`LineaDelReparto`); lanza
 * con `lineaBlocker` y el prefijo de los rechazos del reparto que juzga el núcleo
 * (`repartirTropa`, `state/sitios.ts`): el agente lee todos igual (QA, H3).
 */
function lineaDelReparto(state: GameState, hero: string, l: LineaDelAgente): LineaDelReparto {
  const noVale = lineaBlocker(state, hero, l);
  if (noVale !== null) throw new Error(`no se puede repartir la tropa: ${noVale}`);
  return l.veteran !== undefined
    ? { veterano: l.veteran }
    : // `lineaBlocker` ya dijo que las dos están: el compilador no lo sigue hasta aquí.
      { creature: l.creature as string, count: l.count as number };
}

/**
 * La acción del agente tal como la juega el núcleo: cambia el `slot` de `unequip`
 * y de `equip`, del inglés del contrato al hueco de dentro, `leave_troops` y
 * `take_troops` a `dejar_tropa` y `recoger_tropa`, `distribute_troops` a
 * `repartir_tropa` y `upgrade_outpost` a `mejorar_el_puesto`. Lo demás pasa tal cual.
 *
 * Con `veteran`, el núcleo mueve a ese individuo y nada más (`PedidoDeTropa`), así
 * que lo que el agente escribe al lado se mira aquí, con la partida (`state`): uno
 * solo, y de su tipo (`tipoDelVeterano`). Lanza con el motivo, dentro del `try` del
 * director, como un hueco mal escrito.
 */
export function accionDelAgente(a: AccionDelAgente, state: GameState): AdventureAction {
  // Sin `default` (#313), como `accionDeBatallaDelAgente`: una jugada nueva en el
  // zod sin su caso deja la función sin `return` y no compila. Las que pasan tal
  // cual, con su caso: su forma del contrato es la del núcleo.
  switch (a.type) {
    case 'move_hero':
    case 'hire_hero':
    case 'build':
    case 'recruit':
    case 'dismiss':
    case 'buy_item':
    case 'end_turn':
      return a;
    // Campo a campo y no con `...resto`: zod escribe `veteran?: string | undefined`
    // y el núcleo pide `veteran?: string` (`exactOptionalPropertyTypes`); un
    // opcional que no vino no se pone.
    case 'unequip':
      return {
        type: 'unequip',
        hero: a.hero,
        slot: huecoDelSlot(a.slot),
        ...(a.veteran === undefined ? {} : { veteran: a.veteran }),
      };
    case 'equip':
      return {
        type: 'equip',
        hero: a.hero,
        item: a.item,
        ...(a.veteran === undefined ? {} : { veteran: a.veteran }),
        ...(a.creature === undefined ? {} : { creature: a.creature }),
        ...(a.slot === undefined ? {} : { hueco: huecoDelSlot(a.slot) }),
      };
    case 'leave_troops':
    case 'take_troops': {
      const type = a.type === 'leave_troops' ? 'dejar_tropa' : 'recoger_tropa';
      if (a.veteran === undefined) {
        return { type, hero: a.hero, creature: a.creature, count: a.count };
      }
      const noVale = veteranoBlocker(state, a.hero, a.veteran, a.creature, a.count);
      if (noVale !== null) throw new Error(noVale);
      return { type, hero: a.hero, veterano: a.veteran };
    }
    case 'distribute_troops':
      return {
        type: 'repartir_tropa',
        hero: a.hero,
        enElHeroe: a.withHero.map((l) => lineaDelReparto(state, a.hero, l)),
      };
    case 'upgrade_outpost':
      return { type: 'mejorar_el_puesto', hero: a.hero, obra: obraDelUpgrade(a.upgrade) };
  }
}

// ---------------------------------------------------------------- la rueda y los poderes

/** Cómo se llama cada tipo de la rueda en el contrato. */
export const HIT_DE_GOLPE = {
  ofensivo: 'offensive',
  fuerte: 'strong',
  finta: 'feint',
  defensivo: 'defensive',
  rapido: 'quick',
  romperGuardia: 'guard_break',
  normal: 'normal',
  // Los fusionados de las ruedas de 3 y 5 (22-10-2026): siempre con sus dos
  // partes en el nombre, también en la de 3, donde la persona los lee «Ofensivo»,
  // «Defensivo» y «Rápido».
  ofensivoFuerte: 'offensive_strong',
  defensivoFinta: 'defensive_feint',
  rapidoRomper: 'quick_guard_break',
} as const satisfies Readonly<Record<TipoDeGolpe, string>>;

/** Un tipo de la rueda como lo nombra el contrato del agente (`HIT_DE_GOLPE`). */
export type Hit = (typeof HIT_DE_GOLPE)[TipoDeGolpe];

/**
 * **El origen de un efecto (`source`) como lo lee el agente**: en el núcleo
 * (`StackEffect.source`) es el id del hechizo o del poder que lo puso, el rasgo
 * (`fear`) o, si lo colgó la rueda del golpe, el tipo con que se golpeó
 * (`deLaRueda`, `battle/golpe.ts`). Los ids pasan tal cual; el golpe, con su
 * palabra de `HIT_DE_GOLPE`, la misma de `clash.hit` y de la jugada. La única
 * traducción: la llaman el hecho `effect`, su `effect_end` y `stacks[].effects`.
 *
 * QA de «el contrato del agente, al día», H1 (10-11-2026): llegaba `"defensivo"`
 * y `"romperGuardia"` en el mismo registro donde ese golpe era `"defensive"` y
 * `"guard_break"`. Un hechizo cuyo id fuera el de un golpe en español se leería
 * como el golpe: en el núcleo ya son el mismo origen (`mismoOrigen`, `battle/effects.ts`).
 */
export function origenAlAgente(source: string): string {
  return esTipoDeGolpe(source) ? HIT_DE_GOLPE[source] : source;
}

/**
 * Los de la rueda `forma`, en su orden (el anillo desde arriba en el sentido del
 * reloj y Normal al final, si lo lleva): lo que vale en la batalla.
 */
export function hitsDeLaRueda(forma: FormaDeLaRueda): readonly Hit[] {
  return forma.golpes.map((t) => HIT_DE_GOLPE[t]);
}

/**
 * El tipo de un `hit` (o de un `response`) del agente en la rueda `forma` de su
 * batalla, o excepción con los que valen en ella: un golpe de otra rueda
 * (`"quick"` en la de 3) se rechaza diciendo de cuál es la batalla. Lanza y no
 * devuelve `null`: quien la llama está dentro del `try` del director, que
 * descarta esa jugada con este motivo y dice qué se jugó.
 */
export function golpeDelHit(hit: string, forma: FormaDeLaRueda): TipoDeGolpe {
  const tipo = TODOS_LOS_GOLPES.find((t) => HIT_DE_GOLPE[t] === hit);
  if (tipo !== undefined && tipoDeGolpeBlocker(tipo, forma) === null) return tipo;
  // El motivo, en las palabras del contrato: los `hit` que valen, no los tipos de dentro.
  const que =
    tipo === undefined
      ? 'no es un golpe de la rueda'
      : `no es un golpe de la rueda de ${forma.golpes.length} de esta batalla`;
  throw new Error(`«${hit}» ${que}; valen ${hitsDeLaRueda(forma).join(', ')}`);
}

/** Cómo se cruzan los tipos de una rueda, en las palabras del contrato (`crossing`). */
export const CRUCE_AL_AGENTE = {
  distancia: 'distance',
  ciclo: 'cycle',
} as const satisfies Readonly<Record<CruceDeLaRueda, string>>;

/**
 * La rueda de la batalla como la lee el agente (`wheel`): de cuántos tipos es, el
 * anillo en su orden (`ring`), si lleva Normal en el centro y cómo se cruzan:
 * `distance` (la de 7, por la distancia en el anillo) o `cycle` (las de 3 y 5:
 * cada uno gana al siguiente de `ring`, y el último al primero).
 */
export function ruedaAlAgente(forma: FormaDeLaRueda) {
  return {
    types: forma.golpes.length,
    ring: forma.anillo.map((t) => HIT_DE_GOLPE[t]),
    center: forma.centro,
    crossing: CRUCE_AL_AGENTE[forma.cruce],
  };
}

type DeLaMuralla = Extract<BattleAction, { type: JugadaDeMuralla }>;

/**
 * Las jugadas de la muralla en las palabras del contrato (fase 2 del puesto
 * fronterizo, 04-11-2026): las cuatro del núcleo, que van en español por dentro
 * (`poner_escalera`, `subir`, `abrir_puerta`, `cerrar_puerta`), con el muro en
 * `wall` y la puerta en `gate`. Hasta esta fase el `default` de `accionAlAgente`
 * las dejaba pasar en español, y no se veía porque el mapa no llevaba muralla. **La
 * tabla**: de ella salen la inversa (`JUGADA_DEL_AGENTE`), el esquema y la prosa
 * (`esquemas.ts`, `formato.ts`) y lo que el arnés de QA exige ver cruzar (`JUGADAS_DE_MURALLA`).
 */
export const JUGADA_DE_MURALLA = {
  poner_escalera: 'place_ladder',
  subir: 'climb',
  abrir_puerta: 'open_gate',
  cerrar_puerta: 'close_gate',
} as const satisfies Readonly<Record<DeLaMuralla['type'], string>>;

/** Las cuatro, en el orden de la tabla: las que el arnés de QA exige ver cruzar (`exigeLaMuralla`). */
export const JUGADAS_DE_MURALLA: readonly string[] = Object.values(JUGADA_DE_MURALLA);

/** La inversa de `JUGADA_DE_MURALLA`, derivada: del nombre del agente al del núcleo. */
const JUGADA_DEL_AGENTE = Object.fromEntries(
  Object.entries(JUGADA_DE_MURALLA).map(([nucleo, agente]) => [agente, nucleo]),
) as { readonly [K in DeLaMuralla['type'] as (typeof JUGADA_DE_MURALLA)[K]]: K };

/** Una escalera puesta como la lee el agente: su pie (`foot`) y su muro (`wall`). */
export function escaleraAlAgente(e: { readonly pie: Hex; readonly muro: Hex }) {
  return { foot: e.pie, wall: e.muro };
}

/** Una puerta como la lee el agente: sus dos casillas, `a` y `b` (`gate`). */
export function puertaAlAgente(p: PuertaDeMuralla): PuertaDeMuralla {
  return { a: p.a, b: p.b };
}

/**
 * Una acción de batalla tal como la escribe el agente: **la salida del zod**
 * (`battleActionSchema`), no una copia a mano (#338, 11-11-2026, como
 * `AccionDelAgente` en #313: la copia y el esquema los ataba el director con un
 * `as`). La del núcleo, salvo el golpe (`hit`, texto del contrato, sin la
 * respuesta, que elige el otro), el id del poder, que va en `power` (en el núcleo,
 * `poder`), y las cuatro de la muralla (`JUGADA_DE_MURALLA`). Las retiradas
 * (`wait`, `defend`) no están: su `type` sale `never` (`retirada`, en `esquemas.ts`).
 */
type AccionDeBatallaDelAgente = z.infer<typeof battleActionSchema>;

/** El `target` y el `at` de un hechizo o un poder, sin los que no vienen. */
function objetivo(a: { readonly target?: string | undefined; readonly at?: Hex | undefined }) {
  return {
    ...(a.target === undefined ? {} : { target: a.target }),
    ...(a.at === undefined ? {} : { at: a.at }),
  };
}

/**
 * La acción del agente tal como la juega el núcleo en una batalla con la rueda
 * `forma`; lanza con un `hit` que no es un golpe de ella. Sin `default`: una jugada
 * nueva del contrato que no se traduzca no compila.
 */
export function accionDeBatallaDelAgente(
  a: AccionDeBatallaDelAgente,
  forma: FormaDeLaRueda,
): BattleAction {
  // Campo a campo donde hay opcionales: zod escribe `target?: string | undefined`
  // y el núcleo, con `exactOptionalPropertyTypes`, `target?: string` (lo mismo que
  // `equip` en la aventura). Un `return a` ahí no compila.
  switch (a.type) {
    case 'attack':
      return {
        type: 'attack',
        target: a.target,
        ...(a.from === undefined ? {} : { from: a.from }),
        ...(a.hit === undefined ? {} : { golpe: golpeDelHit(a.hit, forma) }),
      };
    case 'cast':
      return { type: 'cast', spell: a.spell, ...objetivo(a) };
    case 'power':
      return { type: 'power', poder: a.power, ...objetivo(a) };
    case 'surrender':
      return a.gold === undefined ? { type: 'surrender' } : { type: 'surrender', gold: a.gold };
    case 'place_ladder':
    case 'climb':
      return { type: JUGADA_DEL_AGENTE[a.type], muro: a.wall };
    case 'open_gate':
    case 'close_gate':
      return { type: JUGADA_DEL_AGENTE[a.type], puerta: a.gate };
    case 'move':
    case 'aim':
    case 'throw':
    case 'end_turn':
      return a;
  }
}

/**
 * Una acción del núcleo como la lee el agente (la lista legal): el id del poder,
 * en `power`; el golpe, sin lo elegido en la rueda (la lista no lo lleva: lo elige
 * él con `hit`); las de la muralla, con sus nombres del contrato. Lo demás, tal
 * cual. **Sin `default`** (plan de la fase 2): una jugada nueva del núcleo que no
 * tenga aquí su caso no compila, en vez de colarse en español.
 */
export function accionAlAgente(a: BattleAction): AccionDeBatallaDelAgente {
  switch (a.type) {
    case 'attack': {
      const { golpe: _golpe, respuesta: _respuesta, ...resto } = a;
      return resto;
    }
    case 'power': {
      const { poder, type: _t, ...resto } = a;
      return { type: 'power', power: poder, ...resto };
    }
    case 'poner_escalera':
    case 'subir':
      return { type: JUGADA_DE_MURALLA[a.type], wall: a.muro };
    case 'abrir_puerta':
    case 'cerrar_puerta':
      return { type: JUGADA_DE_MURALLA[a.type], gate: puertaAlAgente(a.puerta) };
    case 'move':
    case 'aim':
    case 'throw':
    case 'cast':
    case 'surrender':
    case 'end_turn':
      return a;
  }
}

// ---------------------------------------------------------------- los hechos

/**
 * Cuándo salta un disparador (`triggered.when`), en las palabras del contrato. Las
 * tres tablas de aquí las lee `contract/hechos.ts`, que traduce los hechos; `satisfies`
 * hace que un valor nuevo del núcleo sin su palabra no compile.
 */
export const CUANDO_AL_AGENTE = {
  empezarSuTurno: 'turn_start',
  terminarSuTurno: 'turn_end',
  alSerGolpeado: 'struck',
  alGolpear: 'strikes',
  alMorir: 'death',
} as const satisfies Readonly<Record<CuandoSalta, string>>;

/** Cuándo salta un disparador como lo nombra el contrato (`CUANDO_AL_AGENTE`). */
export type When = (typeof CUANDO_AL_AGENTE)[CuandoSalta];

/**
 * Qué clase de efecto cuelga de un stack, en las palabras del contrato: el `effect`
 * del hecho `effect` y el `kind` de `stacks[].effects` (una sola tabla, o el hecho y
 * la vista dirían dos palabras). El escudo es `ward` y no `shield`, que es un hueco.
 */
export const EFECTO_AL_AGENTE = {
  speed: 'speed',
  attack: 'attack',
  defense: 'defense',
  armadura: 'armor',
  fuerza: 'strength',
  agilidad: 'agility',
  impide: 'prevents',
  escudo: 'ward',
  disparador: 'trigger',
} as const satisfies Readonly<Record<EffectKind, string>>;

/** Una clase de efecto como la nombra el contrato (`EFECTO_AL_AGENTE`). */
export type Effect = (typeof EFECTO_AL_AGENTE)[EffectKind];

/** Cuándo vence un efecto de la rueda (`effect.expires`), con las palabras de `CUANDO_AL_AGENTE`. */
export const VENCE_AL_AGENTE = {
  empezar: CUANDO_AL_AGENTE.empezarSuTurno,
  terminar: CUANDO_AL_AGENTE.terminarSuTurno,
} as const satisfies Readonly<Record<CuandoVence, When>>;

/** Cuándo vence un efecto como lo nombra el contrato (`VENCE_AL_AGENTE`). */
export type Expires = (typeof VENCE_AL_AGENTE)[CuandoVence];

/**
 * Cómo se dice en el contrato un lugar de un mundo (`lugar` por dentro): el `kind`
 * del objeto en `knownMap`, el del rival de su batalla y el `from` de lo que da.
 */
export const LUGAR_AL_AGENTE = 'place';

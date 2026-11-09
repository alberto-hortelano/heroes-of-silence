/**
 * Montar una batalla: **la única puerta**, `createBattle` (19-10-2026: un solo
 * combate para el juego y la arena), con lo que entra de cada bando (`BattleSide`:
 * su tropa y su héroe; contra una muralla, una escalera para cada atacante,
 * `alAsalto`), de dónde salen las cifras de cada stack (`resolveUnit`,
 * `entradaDelHeroe`), la moral de la mezcla de facciones (`armyMorale`), el mando del
 * héroe (`mandoDe`) y el libro de la batalla (`libroDeLaBatalla`; tras un retoque de
 * la arena, `libroConElCatalogo`). Al acabar abre el despliegue
 * (`seguirElDespliegue`, `despliegue.ts`), que da paso a la ronda 1 del motor.
 *
 * Vivía en `battle.ts` hasta la fase N de la reorganización (07-11-2026), que repartió
 * el motor de batalla por lo que hace: qué hay en cada pieza, en la cabecera de
 * `battle.ts`.
 */
import { combateBlocker, type ReglasDelCombate } from '../combate.js';
import { hojaDeLaTropa } from '../hero/troop.js';
import { type CatalogoDeHechizos, HECHIZOS_DEL_JUEGO } from '../magia/catalogo.js';
import { type Hechizo, levantarDe } from '../magia/formato.js';
import type { Rng } from '../rng.js';
import { type FactionId, type Hero, type Hex, hasTrait, type UnitInfo } from '../types.js';
import {
  CATALOGO_DEL_JUEGO,
  type CatalogoDeUnidades,
  cifrasDeUnidad,
  oroDeUnidad,
} from '../unidad/catalogo.js';
import { quienNoEscala } from './asalto.js';
import { hechizoDeLaBatalla } from './consultas.js';
import { asentar, seguirElDespliegue } from './despliegue.js';
import { clampMorale } from './effects.js';
import { hayMuralla, puertasAlEmpezar, SIN_MURALLA, validarMuralla } from './muralla.js';
import {
  type BattleHero,
  type BattleStack,
  type BattleState,
  type HeroeDelBando,
  type Levantable,
  type MurallaDeBatalla,
  type OrigenDelStack,
  SIDES,
  type Side,
  type StackDeBatalla,
} from './types.js';

export interface BattleSide {
  /**
   * Lo que sale al tablero, en orden de despliegue. Desde la tropa de
   * individuos la partida manda un stack de 1 por individuo
   * (`troopsAsStacks`); el motor sigue sabiendo jugar stacks de N.
   */
  readonly army: readonly StackDeBatalla[];
  readonly hero: HeroeDelBando | null;
  /** Bonus de moral del héroe (habilidades, artefactos, edificios). */
  readonly moraleBonus?: number;
  /**
   * El catálogo del que salen las cifras de su tropa del catálogo: el del juego
   * si no se dice (`CATALOGO_DEL_JUEGO`); la arena pone el de su montaje
   * (`catalogoDelMontaje`), con lo que la página no ha guardado.
   */
  readonly catalogo?: CatalogoDeUnidades;
  /**
   * Si lo despliega una persona en pantalla: su tanda se queda abierta hasta
   * que la cierre (`aplicarDespliegue`). Sin él —la IA, el agente, lo que no
   * tiene dueño— despliega solo, con su formación o la regla de hoy, y la
   * batalla no se para en su tanda.
   */
  readonly despliegaAMano?: true;
}

/**
 * El bando atacante `lado` listo para pelear contra `muralla`: **con muralla, una
 * escalera para cada uno, el héroe incluido** (D8 del puesto fronterizo, 04-11-2026,
 * decisión del usuario: «Todo el atacante»; sin comprarla, una por stack, y se gasta
 * al ponerla); sin muralla, tal cual. Sin escaleras, una muralla del mapa, que
 * cierra (`murallaDelMapaBlocker`), no la cruzaría nadie que ande y la batalla
 * llegaría a `MAX_ROUNDS`. A quien vuela no le llega (`createBattle`,
 * `quienNoEscala`). LA decisión de quién lleva escalera en el mapa: la leen
 * `montarLaBatalla` y la medida de la IA contra la IA (`tools/qa/medidas/arena-ia.ts`).
 */
export function alAsalto(lado: BattleSide, muralla: MurallaDeBatalla): BattleSide {
  return hayMuralla(muralla) ? conEscaleras(lado) : lado;
}

/** `lado` con una escalera para cada uno, el héroe incluido (`alAsalto`). */
function conEscaleras(lado: BattleSide): BattleSide {
  return {
    ...lado,
    army: lado.army.map((s) => ({ ...s, escalera: true })),
    hero: lado.hero === null ? null : { ...lado.hero, escalera: true },
  };
}

/**
 * El mando de un héroe en la batalla, de sus cifras: la única conversión de un
 * héroe a `BattleHero`, que usan la partida (`battleSideForHero`) y la arena
 * (`heroeDeArena`). Escrito dos veces, el día que el mando gane un campo uno de
 * los dos entraría sin él. Empieza sin haber lanzado en la ronda.
 */
export function mandoDe(
  heroe: Pick<Hero, 'name' | 'spellPower' | 'knowledge' | 'mana'> & {
    readonly spells: BattleHero['spells'];
  },
  retreat: BattleHero['retreat'],
): BattleHero {
  return {
    name: heroe.name,
    retreat,
    spellPower: heroe.spellPower,
    knowledge: heroe.knowledge,
    mana: heroe.mana,
    castThisRound: false,
    spells: heroe.spells,
  };
}

/**
 * Moral del ejército por su composición, copiada de fheroes2
 * (`Army::GetMoraleModificator`): +1 si todas las criaturas son de la misma
 * facción, penalización creciente a partir de tres facciones distintas, y −1
 * si lleva algún no-muerto, cuya sola presencia quita además el +1:
 *
 * ```cpp
 *     if ( !hasUndead && !AllTroopsAreTheSame() ) { // presence of undead discards "All %{race} troops +1" bonus
 * // …
 * // undead in life group
 * if ( hasUndead ) {
 *     result -= 1;
 *     if ( strs ) {
 *         strs->append( _( "Some undead in army -1" ) );
 * ```
 * https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/army/army.cpp#L1256-L1283
 *
 * Lo que NO se copia de esa línea es `!AllTroopsAreTheSame()`: allí un ejército
 * de una sola criatura repetida tampoco cobra el +1. Es otra divergencia, fuera
 * de #199, y queda dicha aquí hasta que se decida.
 *
 * El −1 no choca con «no-muertos: moral 0»: allí tampoco les llega, porque
 * `isAffectedByMorale` es `!( isUndead() || isElemental() )` y quien no lo está
 * no lee la del ejército. Lo pagan los vivos que marchan con ellos.
 * https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/monster/monster.h#L287-L291
 *
 * Mira las unidades YA resueltas, no el `Army`: así «el héroe no tiene facción»
 * se dice una sola vez —`faction: null` en `heroUnit`— y aquí solo se lee. Quien
 * no tiene facción ni rompe la unidad de un ejército de caballeros ni la da. El
 * héroe no tiene rasgos, así que tampoco cuenta como no-muerto.
 */
export function armyMorale(units: readonly UnitInfo[]): number {
  const factions = new Set<FactionId>();
  let noMuertos = false;
  for (const unit of units) {
    if (unit.faction !== null) factions.add(unit.faction);
    if (hasTrait(unit, 'undead')) noMuertos = true;
  }
  let moral = 0;
  if (factions.size === 1 && !noMuertos) moral = 1;
  else if (factions.size > 2) moral = -(factions.size - 2);
  return noMuertos ? moral - 1 : moral;
}

/**
 * Monta una batalla: **la única puerta** (19-10-2026: un solo combate para el
 * juego y la arena, con la rueda, salir del contacto, la carga a pie y la
 * armadura siempre). `combate`, **obligatorio**, es la complejidad de la partida
 * (`GameState.combate`) o del montaje de la arena: el tope de individuos por bando
 * y la rueda con que se pelea (`BattleState.rueda`). `muralla` la pone la arena
 * (la que se dibuje) y la batalla del mapa contra una ciudad, un pueblo o un paso
 * con obra (la de `data/sitios.json`, `murallaDelSitio`); sin ella, `SIN_MURALLA`.
 */
export function createBattle(
  attacker: BattleSide,
  defender: BattleSide,
  rng: Rng,
  combate: ReglasDelCombate,
  murallaPedida: MurallaDeBatalla = SIN_MURALLA,
  hechizos: CatalogoDeHechizos = HECHIZOS_DEL_JUEGO,
): BattleState {
  const sinCombate = combateBlocker(combate);
  if (sinCombate !== null) throw new Error(`no se puede montar la batalla: ${sinCombate}`);
  const stacks: BattleStack[] = [];
  // Una muralla ya validada vuelve tal cual (`validarMuralla` la recuerda): todas las
  // batallas contra una ciudad comparten su objeto y sus cachés.
  const muralla = validarMuralla(murallaPedida);

  for (const [side, setup] of [
    ['attacker', attacker],
    ['defender', defender],
  ] as const) {
    // El héroe pisa el tablero (fase 1b) y cuenta como uno más del bando.
    const cuantos = setup.army.length + (setup.hero === null ? 0 : 1);
    // Antes de colocar a nadie. La regla es de la partida (`ReglasDelCombate`) y
    // la respetan todas las puertas —reclutar, la guarnición, lo neutral al nacer
    // (`loNeutralAlTope`)—; esto es la red, por si un camino nuevo se la salta.
    if (cuantos > combate.tope) {
      const bando = side === 'attacker' ? 'el atacante' : 'el defensor';
      throw new Error(
        `no caben: ${bando} trae ${cuantos} y un bando lleva como mucho ${combate.tope}`,
      );
    }
    // Una lista, en el orden de `stacks`: la tropa por su puesto y el héroe el
    // ÚLTIMO, con `slot = army.length`, así que pierde los empates de
    // iniciativa con los suyos y los ids de la tropa no se mueven por tenerlo.
    const entradas = setup.army.map((stack, slot) => resolveUnit(stack, slot, setup));
    if (setup.hero !== null) entradas.push(entradaDelHeroe(setup.hero, setup.army.length));
    const units = entradas.map((e) => e.unit);
    // Dónde sale cada uno: lo que pida su formación (`Troop.salida`,
    // `Hero.salida`) o la regla de hoy en un hueco libre (`asentar`). El héroe va
    // el PRIMERO al asentar —su sitio es el centro de la columna del borde,
    // detrás de su tropa— aunque en `stacks` vaya el último: el orden de `stacks`
    // es el de los empates y no se toca.
    const pedidas = setup.army.map((stack) => stack.salida ?? null);
    const conHeroe = setup.hero !== null;
    const casillas = asentar(
      [
        ...(conHeroe
          ? [{ unit: units[units.length - 1]!, pedida: setup.hero.salida ?? null }]
          : []),
        ...setup.army.map((_, i) => ({ unit: units[i]!, pedida: pedidas[i]! })),
      ],
      side,
      muralla,
    );
    // De vuelta al orden de `entradas`: la tropa por su puesto y el héroe el último.
    const hexes = conHeroe ? [...casillas.slice(1), casillas[0]!] : casillas;
    // La mezcla de facciones se cuenta UNA vez, con el ejército que entra, y no
    // se recalcula al morir un stack (#49): igual que fheroes2, que la cuenta
    // sobre el `Army` de fuera de la batalla (`army.cpp`, `GetMoraleModificator`:
    // `for ( const Troop * troop : *this ) if ( troop->isValid() )`), cuyas bajas
    // solo se apuntan al acabar (`battle_main.cpp`, `syncOriginalArmy`). Fuente:
    // https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/army/army.cpp#L1226-L1236
    // https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_main.cpp#L456-L457
    const baseMorale = armyMorale(units) + (setup.moraleBonus ?? 0);

    entradas.forEach((e, i) => {
      stacks.push({
        id: e.origen.kind === 'heroe' ? `${side}-heroe` : `${side}-${e.slot}`,
        side,
        slot: e.slot,
        body: e.body,
        unit: e.unit,
        origen: e.origen,
        initialCount: e.count,
        count: e.count,
        topHp: e.unit.hp,
        hex: hexes[i]!,
        // La escalera solo va con quien puede ponerla: el defensor y el volador no
        // escalan (`quienNoEscala`).
        escalera: e.escalera && quienNoEscala(side, e.unit) === null,
        retaliated: false,
        acted: false,
        // Una regla para todos: la del bando, recortada una vez. Los no-muertos, a 0.
        morale: hasTrait(e.unit, 'undead') ? 0 : clampMorale(baseMorale),
        effects: [],
        ganado: { experiencia: 0, bajas: 0, heroes: [] },
        apuntado: null,
        recargando: 0,
        granada: null,
        granadasLanzadas: 0,
        hechizoEnElAire: null,
      });
    });
  }

  const libro = libroDeLaBatalla(attacker, defender, stacks, hechizos);
  const state: BattleState = {
    round: 0,
    stacks,
    queue: [],
    iniciativa: {},
    ultimoBando: null,
    turno: null,
    heroes: { attacker: attacker.hero?.mando ?? null, defender: defender.hero?.mando ?? null },
    muralla,
    rueda: combate.rueda,
    libro,
    levantables: {
      attacker: levantablesDe(
        hechizosDelBando(attacker.hero?.mando ?? null, stacks, 'attacker'),
        libro,
        attacker.catalogo ?? CATALOGO_DEL_JUEGO,
      ),
      defender: levantablesDe(
        hechizosDelBando(defender.hero?.mando ?? null, stacks, 'defender'),
        libro,
        defender.catalogo ?? CATALOGO_DEL_JUEGO,
      ),
    },
    golpeEnCurso: null,
    escaleras: [],
    puertas: puertasAlEmpezar(muralla),
    log: [],
    finished: null,
    despliegue: {
      tanda: 0,
      aMano: SIDES.filter((side) => (side === 'attacker' ? attacker : defender).despliegaAMano),
    },
  };

  // Las tandas que no son a mano pasan solas; sin ninguna a mano, la batalla
  // sale ya con la ronda 1 abierta, como antes del despliegue.
  seguirElDespliegue(state, rng);
  return state;
}

/** Un stack resuelto y todavía sin colocar: lo que `createBattle` empuja. */
interface Entrada {
  readonly slot: number;
  readonly body: string;
  readonly unit: UnitInfo;
  readonly origen: OrigenDelStack;
  readonly count: number;
  /** Si lleva escalera (`StackDeBatalla.escalera`). */
  readonly escalera: boolean;
}

/**
 * De dónde salen las cifras de un stack de la tropa: del catálogo de su bando
 * (`BattleSide.catalogo`, el del juego si no se dice). Con `entradaDelHeroe`, es
 * el ÚNICO sitio que decide, y se decide una vez: después todo el motor lee
 * `BattleStack.unit` y no vuelve a preguntar. Un novato devuelve la misma
 * referencia del catálogo, así que el volcado del banco no se mueve.
 */
function resolveUnit(stack: StackDeBatalla, slot: number, setup: BattleSide): Entrada {
  // La experiencia es de un individuo: un stack de N con hoja de servicios no
  // sabría de cuál de los N es.
  if (stack.veterania !== undefined && stack.count !== 1) {
    throw new Error(
      `el veterano ${stack.veterania.id} es uno solo y viene en un stack de ${stack.count}`,
    );
  }
  // `cifrasDeUnidad`, la misma regla que leen la IA y el agente por
  // `troopUnit`: un veterano pisa el tablero con las cifras que ellos le ven,
  // y un novato con la referencia del catálogo tal cual.
  const cat = setup.catalogo ?? CATALOGO_DEL_JUEGO;
  const unit = cifrasDeUnidad(stack.creature, stack.veterania, cat);
  return {
    slot,
    // El arte, la hoja de su unidad; qué unidad es lo dice su origen, que es lo
    // que leen el agente, el resumen y `settleBattle`.
    body: hojaDeLaTropa(stack, cat),
    unit,
    origen: {
      kind: 'catalogo',
      unidad: stack.creature,
      oro: oroDeUnidad(stack.creature, cat),
      veterania: stack.veterania ?? null,
      ...salidaDe(stack),
    },
    count: stack.count,
    escalera: stack.escalera === true,
  };
}

/**
 * La casilla de la formación del individuo, para su origen (`OrigenDelStack.salida`):
 * la pide al asentar y `settleBattle` se la devuelve. Sin ella, nada.
 */
function salidaDe(stack: StackDeBatalla): { readonly salida?: Hex } {
  return stack.salida === undefined ? {} : { salida: stack.salida };
}

/** El héroe como una entrada más: uno, sano siempre —no arrastra heridas—. */
function entradaDelHeroe(heroe: HeroeDelBando, slot: number): Entrada {
  return {
    slot,
    body: heroe.figura,
    unit: heroe.cuerpo,
    origen: { kind: 'heroe', desnudo: heroe.desnudo },
    count: 1,
    escalera: heroe.escalera === true,
  };
}

/**
 * Los hechizos que se pueden lanzar en una batalla: los de los libros de los dos
 * héroes y los poderes de cada stack, resueltos en el catálogo `cat`. Un id que no
 * está en él lanza: es un fallo de quien monta, no una batalla sin magia.
 */
function libroDeLaBatalla(
  attacker: BattleSide,
  defender: BattleSide,
  stacks: readonly BattleStack[],
  cat: CatalogoDeHechizos,
): Record<string, Hechizo> {
  return libroDe(
    [
      ...(attacker.hero?.mando.spells ?? []),
      ...(defender.hero?.mando.spells ?? []),
      ...stacks.flatMap((s) => s.unit.poderes ?? []),
    ],
    (id) => cat.get(id),
  );
}

/** El libro de estos ids, cada uno de `deDonde`; lanza con uno que no está. */
function libroDe(
  ids: readonly string[],
  deDonde: (id: string) => Hechizo | undefined,
): Record<string, Hechizo> {
  const libro: Record<string, Hechizo> = {};
  for (const id of ids) {
    const h = deDonde(id);
    if (h === undefined)
      throw new Error(`no se puede montar la batalla: no hay ningún hechizo «${id}»`);
    libro[id] = h;
  }
  return libro;
}

/**
 * Lo que puede levantar un bando que lanza los hechizos `ids` de `libro`, resuelto en
 * su catálogo `cat`: cada unidad que nombra uno de sus `levantar` (la de los vivos y
 * las de `de`; solo los suyos, que el catálogo de un bando puede no tener lo que
 * levanta el otro), con su hoja, sus cifras de novato y su oro, como `resolveUnit` las pone a
 * quien entra. Una que no está en `cat` lanza (`cat.unidad`): la carga y «Guardar»
 * ya lo rechazan (`levantadosBlocker`), y esto es la red de quien monta a mano.
 * Lo leen `createBattle` y el retoque de la arena (`levantablesConElCatalogo`).
 */
function levantablesDe(
  ids: readonly string[],
  libro: Readonly<Record<string, Hechizo>>,
  cat: CatalogoDeUnidades,
): Record<string, Levantable> {
  const out: Record<string, Levantable> = {};
  for (const id of ids) {
    const h = libro[id];
    if (h === undefined)
      throw new Error(`no se puede montar la batalla: no hay ningún hechizo «${id}»`);
    const e = levantarDe(h);
    if (e === undefined) continue;
    for (const u of [e.vivos, ...Object.values(e.de ?? {})]) {
      out[u] ??= {
        body: hojaDeLaTropa({ creature: u }, cat),
        unit: cifrasDeUnidad(u, undefined, cat),
        oro: oroDeUnidad(u, cat),
      };
    }
  }
  return out;
}

/**
 * Lo que se puede levantar en una batalla en curso tras un retoque de la arena: lo
 * de su libro de ahora, resuelto con el catálogo de la pelea `cat` (los dos bandos
 * pelean con el mismo).
 */
export function levantablesConElCatalogo(
  state: BattleState,
  cat: CatalogoDeUnidades,
): BattleState['levantables'] {
  const de = (side: Side) =>
    levantablesDe(hechizosDelBando(state.heroes[side], state.stacks, side), state.libro, cat);
  return { attacker: de('attacker'), defender: de('defender') };
}

/** Lo que puede lanzar un bando: el libro de su héroe y los poderes de sus stacks. */
function hechizosDelBando(
  heroe: Pick<BattleHero, 'spells'> | null,
  stacks: readonly BattleStack[],
  side: Side,
): readonly string[] {
  return [
    ...(heroe?.spells ?? []),
    ...stacks.filter((s) => s.side === side).flatMap((s) => s.unit.poderes ?? []),
  ];
}

/**
 * El libro de una batalla en curso tras un retoque de la arena: los hechizos de los
 * libros de sus héroes y los poderes de sus stacks de ahora, de `cat` (con `null`,
 * los que ya lleva). Lanza con uno que no está en ninguno.
 */
export function libroConElCatalogo(
  state: BattleState,
  cat: CatalogoDeHechizos | null,
): Record<string, Hechizo> {
  return libroDe(
    [
      ...(state.heroes.attacker?.spells ?? []),
      ...(state.heroes.defender?.spells ?? []),
      ...state.stacks.flatMap((s) => s.unit.poderes ?? []),
    ],
    (id) => (cat === null ? hechizoDeLaBatalla(state, id) : cat.get(id)),
  );
}

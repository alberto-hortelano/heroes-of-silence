/**
 * Motor de batalla táctica.
 *
 * Reglas de HoMM2 que se respetan aquí: orden de turno por velocidad con el
 * atacante ganando los empates, contraataque único por ronda, tiradores que no
 * pueden disparar con un enemigo encima y un hechizo de héroe por ronda. Sin
 * suerte (02-11-2026, decisión del usuario: «Elimina la suerte completamente del
 * juego»). La moral no da ni quita turnos (regla nuestra,
 * 26-10-2026, decisión del usuario: «La moral solo debe servir para la huida,
 * nunca dar un turno extra»): es una cifra sin efecto hasta que haya huida.
 */

import {
  CATALOGO_DEL_JUEGO,
  type CatalogoDeUnidades,
  cifrasDeUnidad,
  oroDeUnidad,
} from '../catalogo.js';
import { combateBlocker, type ReglasDelCombate } from '../combate.js';
import { montadoDeGuerra } from '../cuerpo.js';
import { HEROE, hasTrait } from '../data.js';
import type { Hero } from '../hero/hero.js';
import { hojaDeLaTropa } from '../hero/troop.js';
import { type CatalogoDeHechizos, HECHIZOS_DEL_JUEGO } from '../magia/catalogo.js';
import { dichoDeImpide } from '../magia/dicho.js';
import {
  areaDe,
  type CuandoSalta,
  type Duracion,
  esDiferido,
  type Hechizo,
  type Impedible,
} from '../magia/formato.js';
import type { Rng } from '../rng.js';
import type {
  CreatureTrait,
  FactionId,
  Hex,
  PoderId,
  Stack,
  UnitInfo,
  UsoDeArma,
} from '../types.js';
import { SPEED_TO_HEXES } from '../types.js';
import {
  cargasDe,
  disparosDe,
  golpesDe,
  isShooter,
  lanzaGranadas,
  mismoTiro,
  nivelesDelGolpe,
  recargaDe,
  ruedaDelGolpe,
  trasLaArmadura,
} from './armas.js';
import {
  alcanceConCostes,
  allHexes,
  areAdjacent,
  BOARD_SIZE,
  type CosteDeSalir,
  caminoDe,
  carreraConCostes,
  distanciasDesde,
  hexDistance,
  hexEquals,
  hexKey,
  indiceDe,
  isInside,
  lineaDeTiro,
  neighbours,
  octavosHastaLaRecta,
  type Paso,
  type PasoPermitido,
  quedanCasillas,
  reachable,
  rectaLibre,
  siguienteEnRecta,
} from './board.js';
import {
  CARGA,
  CARGA_MINIMA,
  type CargaDeLaRueda,
  cargaDeLaRueda,
  cargaEfectiva,
  porcientoDeLaCarga,
} from './carga.js';
import { fraseDelContacto, salirCuesta } from './contacto.js';
import {
  ataqueYDefensa,
  computeDamage,
  cuartoDelDisparo,
  type DamageOptions,
  dichoDelCuarto,
  type GolpeQueHiere,
  type Herida,
  type Horquilla,
  herir,
  horquillaDeDanio,
  type Modificador,
  stackHp,
  trasElGolpe,
} from './damage.js';
import {
  asentar,
  asientoAlAbrir,
  colocarBlocker,
  deLaTanda,
  suyoEn,
  TANDAS,
} from './despliegue.js';
import {
  applyEffect,
  type CuandoVence,
  clampMorale,
  type DisparadorResuelto,
  dichoDelEfecto,
  disparadoresDe,
  type EfectoResuelto,
  effectTotal,
  esCifraDeEfecto,
  impedidoPor,
  type StackEffect,
  tickEffects,
} from './effects.js';
import { alcanceDeLaGranada, casillasDeLaExplosion } from './granada.js';
import {
  bonoEnLoAlto,
  type CierreDeLaMuralla,
  casillasDeMuro,
  cierreDeLaMuralla,
  claveDeAbiertas,
  enLoAlto,
  esMuro,
  hayMuralla,
  ladoDeLaMuralla,
  type MurallaDeBatalla,
  mismaPuerta,
  mismoNivel,
  nivelDe,
  nombreDePuerta,
  type PuertaDeMuralla,
  pasoAlAndar,
  pasoPorPuertas,
  puertasAlEmpezar,
  SIN_MURALLA,
  validarMuralla,
} from './muralla.js';
import {
  type CifrasDeLaRueda,
  casillasQueQuitaLaFinta,
  cruceBlocker,
  cruceDelGolpe,
  type EfectoDeLaRueda,
  efectoDelTipo,
  efectosDeLaRueda,
  type FormaDeLaRueda,
  formaDeLaBatalla,
  golpeNeutro,
  type HechoDelCruce,
  nivelesEnLaForma,
  type PapelEnLaRueda,
  type Punto,
  puntoDelContraataque,
  puntoDelCruce,
  puntosDe,
  puntosDeLaForma,
  type TipoDeGolpe,
} from './rueda.js';
import {
  type Apuntado,
  casillasDelArea,
  cuantoDura,
  curaDe,
  curaDelHechizo,
  efectoColgado,
  type Lanzador,
  loAlcanza,
  objetivoBlocker as objetivoDelHechizoBlocker,
  queSeApunta,
  resolverDisparador,
  resolverEfecto,
  soloCura,
} from './spells.js';
import type {
  AccionDeDespliegue,
  BattleAction,
  BattleEvent,
  BattleHero,
  BattleStack,
  BattleState,
  CargaMedida,
  GolpeEnCurso,
  OrigenDelStack,
  Side,
  TipoDeEscala,
  TipoDePuerta,
  TurnoDeUnidad,
} from './types.js';
import { MAX_ROUNDS, otroBando, SIDES } from './types.js';

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
 * Un stack de la tropa tal como entra: el del ejército y, si lleva, su escalera
 * para subir a la muralla (`poner_escalera`). La ponen la arena (por puesto) y
 * la batalla del mapa con muralla (a todo el bando atacante, `alAsalto`), y
 * no llega al tablero si no la puede usar (`quienNoEscala`).
 */
export type StackDeBatalla = Stack & { readonly escalera?: boolean };

/**
 * El bando atacante `lado` listo para pelear contra `muralla`: **con muralla, una
 * escalera para cada uno, el héroe incluido** (D8 del puesto fronterizo, 04-11-2026,
 * decisión del usuario: «Todo el atacante»; sin comprarla, una por stack, y se gasta
 * al ponerla); sin muralla, tal cual. Sin escaleras, una muralla del mapa, que
 * cierra (`murallaDelMapaBlocker`), no la cruzaría nadie que ande y la batalla
 * llegaría a `MAX_ROUNDS`. A quien vuela no le llega (`createBattle`,
 * `quienNoEscala`). LA decisión de quién lleva escalera en el mapa: la leen
 * `montarLaBatalla` y la medida de la IA contra la IA (`tools/qa/arena-ia.ts`).
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
 * El héroe de un bando, tal como entra: lo que el motor guarda en
 * `BattleState.heroes` (`mando`: su magia y su rendición) y las cifras con las
 * que pisa el tablero (`cuerpo`, de `heroUnit`). Van juntos para que no pueda
 * haber héroe sin cuerpo ni cuerpo sin héroe; el cuerpo se queda en su stack
 * y no se copia al estado, que nadie lo leería allí.
 */
export interface HeroeDelBando {
  readonly mando: BattleHero;
  readonly cuerpo: UnitInfo;
  /**
   * El mismo cuerpo sin el equipo (`cuerpoDelHeroe`): va a su origen
   * (`OrigenDelStack.desnudo`), de donde `cuerpoDe` lo lee.
   */
  readonly desnudo: UnitInfo;
  /**
   * El id del ARTE con el que pisa el tablero (`BattleStack.body`): en la partida,
   * la hoja de su tipo (`figuraDelHeroe`); en la arena, la que se elija entre las
   * hojas de héroe o la genérica (`HERO_BODY`). Sin opcional: con un `?? HERO_BODY`
   * aquí, la partida pintó al héroe con el Y Bot sin que nada lo dijera («la imagen
   * es el y_bot», 19-10-2026). Lo que el héroe ES para la crónica no sale de aquí
   * (`queEs`).
   */
  readonly figura: string;
  /**
   * Si entra con escalera (`poner_escalera`): solo el héroe que ataca una muralla
   * del mapa (`alAsalto`). La arena no se la da: allí la escalera es de un puesto.
   */
  readonly escalera?: boolean;
  /**
   * Su casilla en la formación (`Hero.salida`, en el marco del atacante): la
   * pide al asentar (`asentar`), como la tropa la suya (`Troop.salida`).
   */
  readonly salida?: Hex;
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

// La zona de salida vive en `board.ts`: la lee también la muralla, que dice qué
// es dentro y qué es fuera desde la del defensor. Dónde sale cada uno, en
// `despliegue.ts` (`asentar`).
export { bandoDeSalida } from './board.js';

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
    libro: libroDeLaBatalla(attacker, defender, stacks, hechizos),
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

/**
 * El hechizo `id` de esta batalla (`BattleState.libro`) o, si no lo lleva (un libro
 * que cambió después de montarla), el del juego. Lanza con uno que no está en
 * ninguno.
 */
export function hechizoDeLaBatalla(state: BattleState, id: string): Hechizo {
  const h = state.libro[id] ?? HECHIZOS_DEL_JUEGO.get(id);
  if (h === undefined) throw new Error(`esta batalla no lleva el hechizo «${id}»`);
  return h;
}

// ---------------------------------------------------------------- despliegue

/**
 * Abre la siguiente tanda del despliegue que tenga a alguien y despliegue una
 * persona, desde `state.despliegue.tanda`; pasadas todas, cierra el despliegue y
 * empieza la ronda 1. Las tandas que despliegan solas se quedan con lo que les
 * dio `asentar` en `createBattle`.
 *
 * Al abrir cada tanda, quien tiene su casilla ocupada por alguien que ya
 * desplegó se reasienta (`asientoAlAbrir`, el mismo `asentar`). No se tira nada:
 * el despliegue no gasta azar.
 */
function seguirElDespliegue(state: BattleState, rng: Rng): void {
  const d = state.despliegue;
  if (d === null) throw new Error('no hay despliegue en curso');
  for (let t = d.tanda; t < TANDAS.length; t++) {
    const suyos = deLaTanda(state, t);
    if (suyos.length === 0) continue;
    const casillas = asientoAlAbrir(state, t);
    suyos.forEach((s, i) => {
      s.hex = casillas[i]!;
    });
    if (d.aMano.includes(TANDAS[t]!.side)) {
      state.despliegue = { tanda: t, aMano: d.aMano };
      return;
    }
  }
  state.despliegue = null;
  beginRound(state, rng);
}

/**
 * Lo que se hace en el despliegue, sobre el bando que despliega ahora: colocar a
 * uno (o cambiarlo con quien esté en esa casilla, de su misma tanda) o cerrar la
 * tanda, que abre la siguiente o, si era la última, la ronda 1. Lo ilegal lanza
 * con la frase de `colocarBlocker`. No escribe en el registro: el despliegue es
 * estado, como la formación del héroe.
 */
export function aplicarDespliegue(state: BattleState, accion: AccionDeDespliegue, rng: Rng): void {
  if (state.finished !== null) throw new Error('la batalla ya ha terminado');
  const d = state.despliegue;
  switch (accion.type) {
    case 'colocar': {
      const noSe = colocarBlocker(state, accion.stack, accion.at);
      if (noSe !== null) throw new Error(`no se puede colocar: ${noSe}`);
      const s = stackById(state, accion.stack);
      // Solo uno de su tanda se intercambia: el enemigo que aún no ha desplegado
      // se queda donde está y se reasienta al abrir su tanda (`asientoAlAbrir`).
      const ahi = suyoEn(state, s, accion.at);
      if (ahi !== undefined) ahi.hex = s.hex;
      s.hex = accion.at;
      return;
    }
    case 'desplegado': {
      if (d === null) throw new Error('no hay despliegue en curso');
      state.despliegue = { tanda: d.tanda + 1, aMano: d.aMano };
      seguirElDespliegue(state, rng);
      return;
    }
  }
}

/**
 * Cierra lo que quede del despliegue aceptando lo que hay: la tanda abierta tal
 * como está y las siguientes, solas. Lo llama quien juega la batalla sin mirar
 * (`autoResolve`: «Resolver sola», o la batalla de la persona que cierra la IA).
 * Sin despliegue en curso, nada.
 */
export function terminarElDespliegue(state: BattleState, rng: Rng): void {
  const d = state.despliegue;
  if (d === null) return;
  state.despliegue = { tanda: d.tanda + 1, aMano: [] };
  seguirElDespliegue(state, rng);
}

/**
 * Por qué no se juega ningún turno: la batalla aún está en el despliegue. Va
 * antes que «no hay stack activo» (`applyAction`), que no diría por qué.
 */
export function despliegueEnCursoBlocker(state: BattleState): string | null {
  return state.despliegue === null ? null : 'la batalla está en el despliegue: aún no hay turnos';
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

// ---------------------------------------------------------------- consultas

export function stackById(state: BattleState, id: string): BattleStack {
  const found = state.stacks.find((s) => s.id === id);
  if (found === undefined) throw new Error(`stack desconocido: "${id}"`);
  return found;
}

export function isAlive(s: BattleStack): boolean {
  return s.count > 0;
}

/**
 * Σ `f` sobre lo que un bando tiene en pie, en el orden de `stacks`. Es la
 * suma; qué se suma —efectivos, amenaza, peso— lo decide quien la pide, y
 * cada medida sigue siendo suya.
 */
export function sumaDelBando(
  state: BattleState,
  side: Side,
  f: (s: BattleStack) => number,
): number {
  let total = 0;
  for (const s of state.stacks) {
    if (s.side === side && isAlive(s)) total += f(s);
  }
  return total;
}

export function activeStack(state: BattleState): BattleStack | null {
  return state.turno === null ? null : stackById(state, state.turno.stack);
}

/**
 * Las casillas que le quedan a `s` en este turno: su velocidad menos lo que
 * lleva gastado si es quien está actuando, y la velocidad entera si no. La
 * velocidad se lee ahora y no al abrir el turno, así que una Lentitud a mitad
 * de turno recorta lo que queda —sin bajar de 0— en vez de llegar tarde. Tras
 * golpear con Finta (la rueda), resta además lo que quita su éxito
 * (`TurnoDeUnidad.finta`): «lo que le queda menos la penalización» (decisión del
 * usuario, 14-10-2026). No va en `gastado`, que son las casillas recorridas.
 */
export function pasosQueQuedan(state: BattleState, s: BattleStack): number {
  return Math.max(0, stackSpeed(s) - gastadoEn(state, s) - fintaEn(state, s));
}

/** Lo que `s` lleva gastado en este turno: 0 si no es quien está actuando. */
function gastadoEn(state: BattleState, s: BattleStack): number {
  return state.turno !== null && state.turno.stack === s.id ? state.turno.gastado : 0;
}

/** Lo que le resta la Finta a `s` en este turno: 0 si no golpeó con ella o no le toca. */
function fintaEn(state: BattleState, s: BattleStack): number {
  return state.turno !== null && state.turno.stack === s.id ? (state.turno.finta ?? 0) : 0;
}

/**
 * En qué fase está el turno abierto: `libre` (no ha hecho nada que lo limite),
 * `movido` (ha andado un tramo: ya no apunta; decisión del usuario),
 * `plantado` (espera la rueda, `golpeEnCurso`: ante su objetivo, o en su salida
 * si carga, que la carga se elige antes de correr) o `trasLaFinta` (ha golpeado con Finta y le queda un
 * tramo solo de andar, `TurnoDeUnidad.finta`). `null` sin turno abierto. Las
 * fases que limitan qué jugada vale las dice `faseBlocker`.
 */
export type FaseDelTurno = 'libre' | 'movido' | 'plantado' | 'trasLaFinta';

export function faseDelTurno(state: BattleState): FaseDelTurno | null {
  const turno = state.turno;
  if (turno === null) return null;
  if (state.golpeEnCurso !== null) return 'plantado';
  if (turno.finta !== undefined) return 'trasLaFinta';
  return turno.gastado > 0 ? 'movido' : 'libre';
}

/**
 * Por qué la unidad activa no puede jugar `tipo` por la fase de su turno, o
 * `null`. Plantado ante su objetivo, solo vale ese golpe (lo fino, contra quién y
 * con qué elecciones, lo dice `golpeEnCursoBlocker`); tras la Finta, el resto del
 * turno es un tramo **solo de andar**: andar o terminar (decisión del usuario,
 * 14-10-2026), ni volver a golpear, ni disparar, ni un poder, ni el hechizo del
 * héroe, ni rendirse, ni puertas o escaleras. Lo de después
 * de un tramo (`movido`) lo dice cada jugada con su frase, en su sitio entre sus
 * otros motivos. La leen `applyAction`, la lista legal (que ofrece lo de su
 * fase) y el principio de cada `*Blocker` que pinta la pantalla.
 */
function faseBlocker(state: BattleState, tipo: BattleAction['type']): string | null {
  switch (faseDelTurno(state)) {
    case 'plantado':
      return tipo === 'attack' ? null : PLANTADO(state.golpeEnCurso as GolpeEnCurso);
    case 'trasLaFinta':
      return tipo === 'move' || tipo === 'end_turn' ? null : TRAS_LA_FINTA;
    default:
      return null;
  }
}

const TRAS_LA_FINTA = 'tras golpear con Finta solo puede andar o terminar el turno';

/** La frase del golpe plantado: la dicen `faseBlocker` y `golpeEnCursoBlocker`. */
const PLANTADO = (g: GolpeEnCurso): string =>
  `${g.stack} está plantado ante ${g.target}: elige en la rueda o cancela el golpe`;

/**
 * La firma del turno abierto: el ordinal, lo gastado, lo que le quitó la Finta y
 * el golpe plantado que espera la rueda. Dos estados con la misma firma tienen el
 * mismo recorrido por andar (con las mismas puertas, que van aparte). La leen
 * `applyAction`, que rechaza un `Movibles` de otra firma, y la clave de las
 * cachés de la sesión. Sin la Finta, un recorrido de antes de golpear con ella
 * valía después y andaba de más; sin el golpe plantado, la carga, que se planta
 * sin andar ni gastar (31-10-2026), dejaba la misma firma antes y después.
 */
export function firmaDelTurno(turno: TurnoDeUnidad, plantado: GolpeEnCurso | null): string {
  const finta = turno.finta === undefined ? '' : ` y ${turno.finta} menos por la Finta`;
  const gastadas = turno.gastado === 1 ? '1 casilla gastada' : `${turno.gastado} casillas gastadas`;
  const golpe = plantado === null ? '' : `, plantado ante ${plantado.target}`;
  return `turno ${turno.n} con ${gastadas}${finta}${golpe}`;
}

/**
 * ¿Son `a` y `b` el MISMO turno? Por el ordinal, que es lo único que no se deja
 * engañar por la misma unidad en dos turnos seguidos (la última de una ronda que
 * abre la siguiente) ni por una copia del
 * estado (el mismo turno, otro objeto). `null` no es el mismo turno que nada.
 */
export function mismoTurno(
  a: Pick<TurnoDeUnidad, 'n'> | null | undefined,
  b: Pick<TurnoDeUnidad, 'n'> | null | undefined,
): boolean {
  return a != null && b != null && a.n === b.n;
}

/**
 * ¿Ha movido ya `s` en este turno? Tras moverse no se apunta (decisión del
 * usuario): solo queda moverse más, golpear o terminar. Cada `move` cuesta al menos una casilla, así que «ha movido» es
 * «lleva algo gastado».
 */
export function seHaMovido(state: BattleState, s: BattleStack): boolean {
  return gastadoEn(state, s) > 0;
}

export function stackSpeed(s: BattleStack): number {
  const base = SPEED_TO_HEXES[s.unit.speed];
  // La agilidad de un hechizo mueve también las casillas, salvo montado de guerra:
  // las casillas son las de la montura (`cifrasDelCuerpo`).
  const agilidad = montadoDeGuerra(s.unit) ? 0 : effectTotal(s, 'agilidad');
  return Math.max(1, base + effectTotal(s, 'speed') + agilidad);
}

/**
 * Los hexes que ocupa un stack: el suyo. Toda unidad ocupa una casilla
 * (13-10-2026); la lista se queda porque es lo que leen el contrato (`occupies`)
 * y el tablero, que la pintan igual.
 */
export function stackHexes(s: BattleStack): Hex[] {
  return [s.hex];
}

/**
 * Los hexes en los que `s` no puede entrar: los de cualquier otra unidad viva y
 * los que la muralla le cierra para posarse (`cierreDeLaMuralla`).
 *
 * Se llamaba `blockedHexes(state, exceptId)` y solo contaba unidades. Cambió de
 * nombre y de firma con la muralla a propósito: necesita saber el BANDO de quien
 * pregunta —la puerta deja pasar al defensor—, y así el typecheck señaló a cada
 * llamante en vez de dejar alguno contando solo unidades.
 */
export function cerradasPara(state: BattleState, s: BattleStack): Set<string> {
  const cerradas = new Set<string>(cierreDe(state, s).posarse);
  for (const o of state.stacks) {
    if (!isAlive(o) || o.id === s.id) continue;
    for (const h of stackHexes(o)) cerradas.add(hexKey(h));
  }
  return cerradas;
}

/** Lo que la muralla le cierra a `s`, por su bando y si vuela. */
function cierreDe(state: BattleState, s: BattleStack): CierreDeLaMuralla {
  return cierreDeLaMuralla(state.muralla, state.puertas, s.side, hasTrait(s.unit, 'flying'));
}

/**
 * Cómo anda `s` desde donde está, con las casillas `cerradas` para posarse
 * (`cerradasPara`): lo que se le cierra a su cabeza por el camino y el paso que
 * no puede dar, si alguno (`cierreDeLaMuralla`). Sin muralla, `cerradas` tal
 * cual, el mismo objeto, y ningún paso: el banco no se mueve.
 */
function alAndar(
  state: BattleState,
  s: BattleStack,
  cerradas: ReadonlySet<string>,
): { readonly cerradas: ReadonlySet<string>; readonly paso: PasoPermitido | undefined } {
  const c = cierreDe(state, s);
  const deMas = c.recorrer === c.posarse ? cerradas : new Set([...cerradas, ...c.recorrer]);
  return { cerradas: deMas, paso: c.paso };
}

/**
 * Si `s` no cabe en `hex` —fuera del tablero o en `cerradas`—. Es LA
 * comprobación de dónde se posa una unidad: la hace `movableFrom` para cada
 * destino y `movimientoBlocker` para decir por qué no, así que una restricción
 * nueva va aquí y las dos la ven.
 */
function noCabe(hex: Hex, cerradas: ReadonlySet<string>): boolean {
  return !isInside(hex) || cerradas.has(hexKey(hex));
}

/** La frase de la casilla `c` que `noCabe` encontró cerrada a `s`. */
function porQueNoCabe(state: BattleState, s: BattleStack, c: Hex): string {
  const ocupa = state.stacks.find(
    (o) => isAlive(o) && o.id !== s.id && stackHexes(o).some((h) => hexEquals(h, c)),
  );
  if (ocupa === undefined) {
    throw new Error(`(${c.col},${c.row}) está cerrada a ${s.id} sin muro, puerta ni unidad`);
  }
  return `ahí está ${ocupa.unit.name}`;
}

/**
 * Por qué la unidad activa no puede moverse a `hex`, o `null` si puede. La frase
 * la escribe el núcleo y la leen `moveTo` —que lanza con ella— y la pantalla,
 * que la pinta tal cual. Antes el cliente inventaba «No puedes llegar a ese
 * hexágono.», que con una muralla delante no decía por qué.
 */
export function movimientoBlocker(state: BattleState, hex: Hex): string | null {
  const s = activeStack(state);
  if (s === null || state.finished !== null) return 'no le toca a ninguna unidad';
  if (!isInside(hex)) return `(${hex.col},${hex.row}) está fuera del tablero`;
  const impedido = impedimentoBlocker(state, s, 'moverse');
  if (impedido !== null) return impedido;
  if (movableFrom(state, s).has(hexKey(hex))) return null;
  if (hexEquals(hex, s.hex)) return 'ya está ahí';
  if (noCabe(hex, cerradasPara(state, s))) return porQueNoCabe(state, s, hex);
  const subida = subidaAndando(state, s, hex);
  if (subida !== null) return subida;
  // Rodeado, no va a ninguna parte: lo que le cierra es su casilla, no el camino.
  const rodeado = contactoBlocker(state, s);
  if (rodeado !== null) return rodeado;
  // La puerta antes que el lado: si abierta llegaría, lo que se lo impide es ella.
  const puerta = porLaPuerta(state, s, hex);
  if (puerta !== null) return puerta;
  const lado = porElLado(state, s, hex);
  if (lado !== null) return lado;
  const quedan = pasosQueQuedan(state, s);
  // Si fue la Finta la que se comió lo que falta, se dice (`fintaEn`).
  const finta = fintaEn(state, s) > 0 ? 'tras la Finta ' : '';
  if (quedan === 0) return `${finta}ya no le quedan casillas este turno`;
  const [verbo, casillas] = quedanCasillas(quedan);
  // Si saliendo gratis llegaría, lo que no le deja es el contacto del camino.
  if (movibles(state, s, false).has(hexKey(hex))) {
    return `no llega: ${finta}le ${verbo} ${casillas} y salir de una casilla con enemigos al lado cuesta 1 más por cada uno`;
  }
  return hayMuralla(state.muralla) && !hasTrait(s.unit, 'flying')
    ? `no llega: ${finta}le ${verbo} ${casillas} y la muralla o las unidades cortan el camino`
    : `no llega: ${finta}le ${verbo} ${casillas}`;
}

/**
 * Por qué el atacante que anda por el suelo no llega a `hex` si es un muro:
 * a la muralla no se sube andando. `null` si no es el caso.
 */
function subidaAndando(state: BattleState, s: BattleStack, hex: Hex): string | null {
  // Con dentro y fuera, el defensor también lleva un paso: no es de él de quien se habla.
  if (s.side !== 'attacker' || cierreDe(state, s).paso === undefined || enLoAlto(state, s)) {
    return null;
  }
  if (!esMuro(state.muralla, hex)) return null;
  switch (comoSube(s)) {
    case 'escalando':
      return 'a la muralla no se sube andando: desde su pie, «Subir»';
    case 'con su escalera':
      return 'a la muralla no se sube andando: desde su pie, «Poner escalera»';
    case null:
      return 'para subir a la muralla hace falta una escalera o saber escalar';
  }
}

/**
 * Por qué `s` no llega a `hex` si lo que se lo impide es el lado de la muralla
 * (`pasoPermitido`): con la regla sin dentro ni fuera llegaría, y con ella no.
 * `null` si no es el caso. Si `hex` es de fuera, lo que no le deja es bajar a
 * él; si no, subir desde fuera.
 */
function porElLado(state: BattleState, s: BattleStack, hex: Hex): string | null {
  const m = state.muralla;
  if (m.muros.length === 0 || hasTrait(s.unit, 'flying')) return null;
  const blocked = cerradasPara(state, s);
  const sinLados = recorrer(
    state,
    s,
    true,
    pasosQueQuedan(state, s),
    alAndar(state, s, blocked).cerradas,
    pasoAlAndar(m, state.puertas, s.side, false),
  );
  if (!sinLados.has(hexKey(hex))) return null;
  return ladoDeLaMuralla(m, hex) === 'fuera'
    ? 'desde la muralla solo se baja hacia dentro'
    : 'desde fuera no se sube a la muralla: sus escaleras están dentro';
}

/** La frase de la puerta cerrada: la dicen el paso, el camino y el tiro. */
const PUERTA_CERRADA = 'la puerta está cerrada: no pasa nadie';

/**
 * Por qué `s` no llega a `hex` si lo que se lo impide es una puerta cerrada: con
 * todas abiertas llegaría. `null` si no es el caso. Sin esto, quien señalaba lo
 * de detrás de la puerta leía «la muralla o las unidades cortan el camino».
 */
function porLaPuerta(state: BattleState, s: BattleStack, hex: Hex): string | null {
  if (hasTrait(s.unit, 'flying') || state.puertas.every((p) => p.abierta)) return null;
  const abiertas = { ...state, puertas: state.puertas.map((p) => ({ ...p, abierta: true })) };
  return movableFrom(abiertas, s).has(hexKey(hex)) ? PUERTA_CERRADA : null;
}

/**
 * Cuántos pasos le costaría a `s` ir de `desde` a pegarse a `objetivo` para
 * golpearlo —a uno de sus hexes— andando, sin contar las unidades, que se
 * mueven, pero sí la muralla, que no. `Infinity` si la muralla no le deja llegar.
 *
 * Con muralla, «pegarse» es a una casilla **de su nivel**: al pie de una
 * columna no se golpea a quien está arriba. Se recorre desde esas casillas y se
 * suma el paso que falta, que es la misma cuenta que antes sin niveles.
 */
export function distanciaACaminar(
  state: BattleState,
  s: BattleStack,
  objetivo: BattleStack,
): (desde: Hex) => number {
  const suyas = stackHexes(objetivo);
  if (!hayMuralla(state.muralla) || hasTrait(s.unit, 'flying')) {
    return distanciaHasta(state, s, suyas);
  }
  const nivel = nivelDe(state.muralla, objetivo.hex);
  const cerradas = cierreDe(state, s).recorrer;
  const vistos = new Set<string>();
  const desdeDonde: Hex[] = [];
  for (const h of suyas) {
    for (const n of neighbours(h)) {
      const k = hexKey(n);
      if (vistos.has(k) || cerradas.has(k) || nivelDe(state.muralla, n) !== nivel) continue;
      vistos.add(k);
      desdeDonde.push(n);
    }
  }
  if (desdeDonde.length === 0) return () => Number.POSITIVE_INFINITY;
  const hasta = recorrido(state, s, desdeDonde, 'golpe');
  return (desde) => hasta(desde) + 1;
}

/**
 * Cuántos pasos le costaría a `s` ir de `desde` al más cercano de `destino`
 * andando, con la muralla de su bando y sin las unidades.
 *
 * Es regla del tablero y no de la IA, por eso vive aquí. **Sin muralla, o para
 * un volador, es `hexDistance`** tal cual: la IA de siempre, hex a hex, y el
 * banco no se mueve. Con muralla, un recorrido desde `destino` —que cuenta
 * aunque esté en una puerta: al defensor se le golpea en ella—, guardado por
 * muralla, bando y destino: la IA pregunta lo mismo varias veces por decisión
 * (a quién ir, hacia dónde, si conviene esperar) y la muralla no cambia.
 */
export function distanciaHasta(
  state: BattleState,
  s: BattleStack,
  destino: readonly Hex[],
): (desde: Hex) => number {
  if (!hayMuralla(state.muralla) || hasTrait(s.unit, 'flying')) {
    return (desde) => Math.min(...destino.map((h) => hexDistance(desde, h)));
  }
  return recorrido(state, s, destino, 'pisar');
}

/**
 * Lo mismo que `distanciaHasta`, sin guardar el recorrido: para destinos que
 * dependen de dónde están las unidades ahora —los pies libres de la IA—, que en
 * la caché por muralla se irían acumulando batalla adentro sin volver a leerse.
 */
export function distanciaAndando(
  state: BattleState,
  s: BattleStack,
  destino: readonly Hex[],
): (desde: Hex) => number {
  if (!hayMuralla(state.muralla) || hasTrait(s.unit, 'flying')) {
    return (desde) => Math.min(...destino.map((h) => hexDistance(desde, h)));
  }
  const c = cierreDe(state, s);
  return distanciasDesde(destino, c.recorrer, c.paso);
}

/** El recorrido hacia atrás desde `destino`, guardado por muralla, bando y destino. */
function recorrido(
  state: BattleState,
  s: BattleStack,
  destino: readonly Hex[],
  para: 'pisar' | 'golpe',
): (desde: Hex) => number {
  let porDestino = DISTANCIAS.get(state.muralla);
  if (porDestino === undefined) {
    porDestino = new Map();
    DISTANCIAS.set(state.muralla, porDestino);
  }
  // Con las puertas abiertas: el camino cambia al abrir, y una caché solo por
  // muralla devolvería el de antes (criterio 24 de la muralla alta).
  const clave = `${claveDeAbiertas(state.puertas)}|${s.side}|${para}|${destino.map(hexKey).join('|')}`;
  let lector = porDestino.get(clave);
  if (lector === undefined) {
    const c = cierreDe(state, s);
    lector = distanciasDesde(destino, c.recorrer, c.paso);
    porDestino.set(clave, lector);
  }
  return lector;
}

/** Los recorridos de `distanciaHasta`, por muralla: por puertas abiertas, bando y destino. */
const DISTANCIAS = new WeakMap<MurallaDeBatalla, Map<string, (desde: Hex) => number>>();

export function enemiesOf(state: BattleState, s: BattleStack): BattleStack[] {
  return state.stacks.filter((o) => isAlive(o) && o.side !== s.side);
}

/**
 * ¿Hay un enemigo pegado **a su nivel**? Un tirador así no puede disparar. El
 * de lo alto de un muro no está trabado por quien tiene al pie.
 */
export function isEngaged(state: BattleState, s: BattleStack): boolean {
  return enemiesOf(state, s).some((e) => canReachMelee(state, s, e));
}

/**
 * ¿Puede `s` golpear a `target` desde donde está? Pegados y al mismo nivel: de
 * lo alto de un muro al suelo no se llega con la espada, ni del suelo arriba.
 * Es LA regla del «se tocan»: la leen el golpe, la represalia, el trabado y la
 * salpicadura.
 */
export function canReachMelee(state: BattleState, s: BattleStack, target: BattleStack): boolean {
  if (!mismoNivel(state, s, target)) return false;
  const own = stackHexes(s);
  return stackHexes(target).some((th) => own.some((oh) => areAdjacent(oh, th)));
}

/**
 * Por qué `s` no puede apuntar ahora, o `null` si puede. ÚNICA redacción de la
 * regla del tirador: la leen `legalActions` para ofrecer el `aim` y `applyAction`
 * para rechazarlo —con el id delante—, y `apuntarBlocker` para explicárselo a la
 * persona. Antes la lista y el rechazo la escribían cada uno, y el cliente
 * inventaba una tercera frase («no alcanzas a esa unidad») que a un tirador que
 * se acababa de mover le decía algo falso.
 */
function disparoBlocker(state: BattleState, s: BattleStack): string | null {
  if (!isShooter(s.unit)) return 'no es tirador';
  const impedido = impedimentoBlocker(state, s, 'disparar');
  if (impedido !== null) return impedido;
  // La recarga del arma de fuego (02-11-2026): el turno en que sale el disparo cuenta.
  if (s.recargando > 0) return `está recargando: ${recargaQueFalta(s.recargando)}`;
  if (seHaMovido(state, s)) return 'ya se ha movido este turno: no puede apuntar';
  if (isEngaged(state, s)) return 'tiene un enemigo encima';
  return null;
}

/**
 * Lo que le falta de recarga a quien le quedan `n` turnos: «le falta 1 turno», «le
 * faltan 2 turnos». Lo dicen la regla de apuntar (`disparoBlocker`) y el panel.
 */
export function recargaQueFalta(n: number): string {
  return n === 1 ? 'le falta 1 turno' : `le faltan ${n} turnos`;
}

/**
 * Lo pendiente a distancia de `s` si pasa a pelear con las cifras `unit` (un retoque
 * de la arena a media pelea, `conCifrasNuevas`): lo de siempre si tira igual
 * (`mismoTiro`); si no, sin lo apuntado, sin la granada en el aire y sin recarga
 * (hallazgo E4 de /simplify, 02-11-2026: la granada explotaba con las cifras del arma
 * nueva y la recarga bloqueaba un arco recién puesto). Lo que lleva lanzado se queda:
 * lo que queda se deriva de la pieza (`granadasQueQuedan`).
 */
export function loADistanciaTrasElRetoque(
  s: BattleStack,
  unit: UnitInfo,
): Pick<BattleStack, 'apuntado' | 'granada' | 'recargando'> {
  return mismoTiro(s.unit, unit)
    ? { apuntado: s.apuntado, granada: s.granada, recargando: s.recargando }
    : { apuntado: null, granada: null, recargando: 0 };
}

/**
 * Las granadas que le quedan a `s` en esta batalla: las que lleva su pieza
 * (`cargasDe`) menos las que ha lanzado, sin bajar de 0. Derivado, y no guardado: un
 * retoque de la arena a media pelea no descuadra la cuenta. Lo leen la regla de
 * lanzar, el panel, el contrato y la IA.
 */
export function granadasQueQuedan(s: BattleStack): number {
  return Math.max(0, cargasDe(s.unit) - s.granadasLanzadas);
}

/**
 * Por qué `s` no puede lanzar una granada ahora, sin mirar la casilla, o `null`:
 * que la lleve, que le queden, sin moverse y sin un enemigo al lado (como el
 * tirador). La leen `lanzarBlocker` y la lista legal.
 */
function granadaBlocker(state: BattleState, s: BattleStack): string | null {
  if (!lanzaGranadas(s.unit)) return 'no lleva granadas';
  const impedido = impedimentoBlocker(state, s, 'disparar');
  if (impedido !== null) return impedido;
  if (granadasQueQuedan(s) === 0) return 'se ha quedado sin granadas: lanzó las que llevaba';
  if (seHaMovido(state, s)) return 'ya se ha movido este turno: no puede lanzar';
  if (isEngaged(state, s)) return 'tiene un enemigo encima';
  return null;
}

/**
 * Por qué la unidad activa no puede lanzar una granada a `at`, o `null` (02-11-2026,
 * regla nuestra): la regla de quien la lanza (`granadaBlocker`) y la casilla, en el
 * tablero, no la suya y a su alcance (`alcanceDeLaGranada`, por la distancia en
 * casillas). **La recta no se mira**: va por encima, y no la paran unidades, muros
 * ni puertas. Sin `at`, solo si puede lanzar (el botón). La leen `applyAction`, la
 * previsión y la pantalla, con el nombre de la unidad delante.
 */
export function lanzarBlocker(state: BattleState, at?: Hex): string | null {
  const s = activeStack(state);
  if (s === null || state.finished !== null) return 'no le toca a ninguna unidad';
  const porLaFase = faseBlocker(state, 'throw');
  if (porLaFase !== null) return porLaFase;
  const motivo = granadaBlocker(state, s);
  if (motivo !== null) return `${s.unit.name} ${motivo}`;
  if (at === undefined) return null;
  if (!isInside(at)) return `(${at.col},${at.row}) no es una casilla del tablero`;
  if (hexEquals(at, s.hex)) return `${s.unit.name} no puede lanzar a su propia casilla`;
  const alcance = alcanceDeLaGranada(s.unit);
  const d = hexDistance(s.hex, at);
  if (d > alcance) {
    return `${s.unit.name} lanza hasta ${alcance} ${alcance === 1 ? 'casilla' : 'casillas'} (su fuerza), y (${at.col},${at.row}) está a ${d}`;
  }
  return null;
}

/**
 * Por qué la activa no puede jugar a distancia (el botón «A distancia»), o `null`:
 * apuntar si dispara, lanzar si lleva granada (`tiroADistanciaDe`). Con casilla, lo
 * dice `tanteoADistancia`.
 */
export function aDistanciaBlocker(state: BattleState): string | null {
  const s = activeStack(state);
  if (s !== null && lanzaGranadas(s.unit)) return lanzarBlocker(state);
  return apuntarBlocker(state);
}

/**
 * La jugada a distancia de la activa en `at` y lo que se vería con ella ahora, o por
 * qué no se puede: apuntar y la recta del disparo (`lineaDelDisparo`) si dispara;
 * lanzar y su explosión (`explosionDe`) si lleva granada. **El único sitio que elige
 * entre las dos** (hallazgo S3 de /simplify, 02-11-2026: lo elegían a la vez el
 * blocker, la jugada y el tanteo de la sesión): la pantalla pinta según la forma.
 */
export type TanteoADistancia =
  | {
      readonly kind: 'disparo';
      readonly jugada: BattleAction & { type: 'aim' };
      readonly linea: LineaDelDisparo;
    }
  | {
      readonly kind: 'granada';
      readonly jugada: BattleAction & { type: 'throw' };
      readonly explosion: ExplosionDeLaGranada;
    }
  | { readonly kind: 'no'; readonly motivo: string };

export function tanteoADistancia(state: BattleState, at: Hex): TanteoADistancia {
  const s = activeStack(state);
  if (s === null || state.finished !== null) {
    return { kind: 'no', motivo: 'no le toca a ninguna unidad' };
  }
  const casilla = { col: at.col, row: at.row };
  if (lanzaGranadas(s.unit)) {
    const motivo = lanzarBlocker(state, casilla);
    if (motivo !== null) return { kind: 'no', motivo };
    return {
      kind: 'granada',
      jugada: { type: 'throw', at: casilla },
      explosion: explosionDe(state, casilla),
    };
  }
  const motivo = apuntarBlocker(state, casilla);
  if (motivo !== null) return { kind: 'no', motivo };
  return {
    kind: 'disparo',
    jugada: { type: 'aim', at: casilla },
    linea: lineaDelDisparo(state, s, casilla),
  };
}

/** A quién da una granada y cuánto (`explosionDe`). */
export interface ExplosionDeLaGranada {
  /** Dónde explota. */
  readonly at: Hex;
  /** Las casillas que alcanza, cada una con el cuarto de su tirada (`casillasDeLaExplosion`). */
  readonly casillas: readonly CasillaDelAlcance[];
  /** Los vivos que hay hoy en ellas, de cualquier bando (también quien la lanza), con su cuarto. */
  readonly alcanzados: readonly { readonly stack: BattleStack; readonly cuarto: number }[];
}

/**
 * A quién da hoy la granada de `s` que explota en `at`: todo vivo en la casilla
 * (el cuarto del centro) y en sus seis vecinas (el del anillo), **de cualquier
 * bando**, quien la lanzó incluido. La única regla: la leen la explosión
 * (`explotarLaGranada`), su previsión, la IA y lo que se pinta.
 */
export function explosionDe(state: BattleState, at: Hex): ExplosionDeLaGranada {
  const casillas = casillasDeLaExplosion(at);
  const alcanzados = casillas.flatMap((c) => {
    const quien = vivoEn(state, c.hex);
    return quien === null ? [] : [{ stack: quien, cuarto: c.cuarto }];
  });
  return { at, casillas, alcanzados };
}

/** El vivo que está en `hex`, o `null`: lo que buscan la recta del disparo y la explosión. */
function vivoEn(state: BattleState, hex: Hex): BattleStack | null {
  return state.stacks.find((x) => isAlive(x) && hexEquals(x.hex, hex)) ?? null;
}

/**
 * Las opciones del daño de la granada de `s` sobre `t`, con la tirada en el cuarto
 * `cuarto`: a distancia (el arma de su hueco `distancia`, la granada) y con lo alto
 * de un muro como todo golpe. La leen la explosión, su previsión y la IA.
 */
export function opcionesDeLaGranada(
  state: BattleState,
  s: BattleStack,
  t: BattleStack,
  cuarto: number,
): DamageOptions {
  return opcionesDeDanio(state, s, t, extraDeLaGranada(cuarto));
}

/** Lo que trae la granada a sus opciones (`opcionesDeLaGranada`): a distancia, en su cuarto. */
function extraDeLaGranada(cuarto: number): Omit<DamageOptions, ExtraDelEstado> {
  return { ranged: true, cuarto };
}

/**
 * Por qué la unidad activa no puede apuntar a la casilla `at`, o `null`: la regla
 * del tirador (`disparoBlocker`) y la casilla, que tiene que estar en el tablero y
 * no ser la suya. Vale cualquier otra, con alguien o vacía: la recta y a quién da
 * se ven al salir el disparo (`lineaDelDisparo`). Sin `at`, solo si puede apuntar
 * (el botón). La leen `applyAction`, la previsión y la pantalla, con el nombre de
 * la unidad delante, como los demás `*Blocker` (el id, «attacker-0», no le dice
 * nada a quien juega; H4 del QA de fuerza y agilidad, 26-10-2026).
 */
export function apuntarBlocker(state: BattleState, at?: Hex): string | null {
  const s = activeStack(state);
  if (s === null || state.finished !== null) return 'no le toca a ninguna unidad';
  const porLaFase = faseBlocker(state, 'aim');
  if (porLaFase !== null) return porLaFase;
  const motivo = disparoBlocker(state, s);
  if (motivo !== null) return `${s.unit.name} ${motivo}`;
  // Sin casilla, solo si puede apuntar: el botón «Apuntar».
  if (at === undefined) return null;
  if (!isInside(at)) return `(${at.col},${at.row}) no es una casilla del tablero`;
  if (hexEquals(at, s.hex)) return `${s.unit.name} no puede apuntar a su propia casilla`;
  return null;
}

/** La recta de un disparo diferido y a quién da (`lineaDelDisparo`). */
export interface LineaDelDisparo {
  /** De dónde sale: la casilla del tirador ahora. */
  readonly desde: Hex;
  /** A dónde apunta. */
  readonly at: Hex;
  /**
   * Las casillas de la recta hasta donde llega, en orden y sin la del tirador: hasta
   * la del alcanzado, hasta lo alto del muro del que bajaría o hasta antes de la
   * puerta que la para, o hasta el borde del tablero (la recta sigue tras `at`).
   */
  readonly casillas: readonly Hex[];
  /** El primero de la recta, de cualquier bando; `null` si no da a nadie. */
  readonly alcanzado: BattleStack | null;
  /** Lo que paró la recta antes del borde sin dar a nadie, o `null`. */
  readonly parada: 'muro' | 'puerta' | null;
  /**
   * Las casillas en que el disparo daría a quien estuviera en ella, en orden y sin
   * mirar quién hay: la recta hasta el borde, o hasta lo que la para (desde el suelo,
   * lo alto del muro, que a quien está en él le da, antes de bajar de él; la puerta
   * cerrada, antes de ella). Cada
   * una con el cuarto de la horquilla en que caería su tirada (`cuartoDelDisparo`):
   * lo que pinta el tablero al apuntar, porque al salir el disparo ya se habrán
   * movido todos.
   */
  readonly alcance: readonly CasillaDelAlcance[];
}

/** Una casilla del alcance de un disparo diferido y el cuarto de su tirada (0 a 4). */
export interface CasillaDelAlcance {
  readonly hex: Hex;
  readonly cuarto: number;
}

/**
 * Por dónde va el disparo diferido de `s` a `at` ahora y a quién da: **el primer
 * vivo de la recta que no es el tirador, sea del bando que sea** (25-10-2026,
 * decisión del usuario: «da al primero que se encuentre en esa línea, aunque sea de
 * tu equipo»), también tras `at` (01-11-2026: la recta sigue hasta el borde). La
 * recta es la de `lineaDeTiro` (un rayo, el del
 * bando del tirador). Desde el suelo **sube a lo alto del muro** y da al primero
 * que haya arriba, en cualquier casilla de muro que cruce (06-11-2026, petición
 * del usuario: «Los disparos de abajo del muro al muro no dan»: la recta en
 * diagonal rozaba la casilla de muro vacía de al lado antes que la del blanco, y en
 * una muralla gruesa la columna de fuera tapaba la de dentro); la para **bajar del
 * muro** (lo de detrás de la muralla no se alcanza desde el suelo) o el lado de una
 * puerta cerrada. Desde lo alto de la muralla pasa por encima de todo, como el tiro
 * de antes. La única regla: la leen el disparo (`dispararLoApuntado`), su
 * previsión, la IA y lo que se pinta.
 */
export function lineaDelDisparo(state: BattleState, s: BattleStack, at: Hex): LineaDelDisparo {
  const recta = lineaDeTiro(s.hex, at, s.side);
  const libre = enLoAlto(state, s) || !hayMuralla(state.muralla);
  // El lado de una puerta cerrada, con la misma regla que el paso al andar.
  const porPuertas = libre ? undefined : pasoPorPuertas(state.muralla, state.puertas);
  // Se anda la recta entera para el alcance; lo de hoy (`casillas`, `alcanzado`,
  // `parada`) se decide en la primera casilla que la corta.
  const alcance: CasillaDelAlcance[] = [];
  let alcanzado: BattleStack | null = null;
  let parada: LineaDelDisparo['parada'] = null;
  let hasta = 0;
  let antes = s.hex;
  // Desde el suelo, si la recta va ya por lo alto del muro.
  let arriba = false;
  for (let i = 0; i < recta.length; i++) {
    const h = recta[i] as Hex;
    if (porPuertas?.(indiceDe(antes), indiceDe(h)) === false) {
      if (alcanzado === null && parada === null) parada = 'puerta';
      break;
    }
    const muro = !libre && esMuro(state.muralla, h);
    if (arriba && !muro) {
      // La esquina de una casilla de suelo entre dos de muro (la recta casi a lo
      // largo de la muralla, que en el odd-r va en zigzag): pasa por encima.
      const siguiente = recta[i + 1];
      if (siguiente !== undefined && esMuro(state.muralla, siguiente)) {
        antes = h;
        continue;
      }
      // Baja del muro: lo de detrás no se alcanza desde el suelo.
      if (alcanzado === null && parada === null) parada = 'muro';
      break;
    }
    alcance.push({ hex: h, cuarto: cuartoDelDisparo(octavosHastaLaRecta(s.hex, at, h)) });
    if (alcanzado === null && parada === null) {
      const quien = vivoEn(state, h);
      if (quien !== null && quien.id !== s.id) alcanzado = quien;
      hasta = alcance.length;
    }
    arriba = muro;
    antes = h;
  }
  const casillas = alcance.slice(0, hasta).map((c) => c.hex);
  return { desde: s.hex, at, casillas, alcanzado, parada, alcance };
}

/**
 * Por qué la unidad activa no puede golpear cuerpo a cuerpo a `targetId`
 * —moviéndose o no—, o `null` si puede. Es a `attack` lo que `castBlocker` a un
 * hechizo: la frase la escribe el núcleo, sin sujeto, y la pantalla la pinta tal
 * cual. **Solo el golpe** (26-10-2026): el tirador que podía apuntar daba `null`
 * aunque no alcanzara, porque el clic en el enemigo apuntaba; con el selector de
 * arma del cliente el clic de «Cuerpo a cuerpo» no apunta, y el de «A distancia»
 * lo juzga `apuntarBlocker`.
 */
export function ataqueBlocker(state: BattleState, targetId: string): string | null {
  const s = activeStack(state);
  if (s === null || state.finished !== null) return 'no le toca a ninguna unidad';
  const porLaFase = faseBlocker(state, 'attack');
  if (porLaFase !== null) return porLaFase;
  const target = stackById(state, targetId);
  const rival = rivalBlocker(s, target, 'atacar');
  if (rival !== null) return rival;
  const impedido = impedimentoBlocker(state, s, 'golpear');
  if (impedido !== null) return impedido;
  const { actions } = legalActionsAndCosts(state);
  if (actions.some((a) => a.type === 'attack' && a.target === targetId)) return null;
  return 'no alcanza a esa unidad cuerpo a cuerpo este turno';
}

/**
 * Por qué `target` no vale como blanco de `s`: muerto o de su bando. `verbo` es
 * lo que se iba a hacer («atacar», «disparar»). Lo comparten el golpe, el disparo
 * y la frase de `ataqueBlocker`.
 */
function rivalBlocker(s: BattleStack, target: BattleStack, verbo: string): string | null {
  if (!isAlive(target)) return `${target.id} ya está destruido`;
  if (target.side === s.side) return `no se puede ${verbo} a un aliado`;
  return null;
}

/**
 * Por qué `s` no puede golpear a `target` desde `from` —o desde donde está, sin
 * `from`—, o `null` si puede: vivo, rival, la casilla al alcance (en `costes`, el
 * recorrido de este tramo) y el objetivo pegado desde ella. ÚNICA redacción del
 * golpe: la leen `applyAction`, que lanza ANTES de mover, y `previsionDe`.
 */
function golpeBlocker(
  state: BattleState,
  s: BattleStack,
  target: BattleStack,
  from: Hex | undefined,
  costes: () => ReadonlyMap<string, Paso>,
): string | null {
  const rival = rivalBlocker(s, target, 'atacar');
  if (rival !== null) return rival;
  const impedido = impedimentoBlocker(state, s, 'golpear');
  if (impedido !== null) return impedido;
  if (from !== undefined && !costes().has(hexKey(from))) {
    return `${s.id} no puede moverse a (${from.col},${from.row})`;
  }
  const desdeAhi = from === undefined ? s : { ...s, hex: from };
  if (!canReachMelee(state, desdeAhi, target))
    return `${s.id} no alcanza a ${target.id} cuerpo a cuerpo`;
  return null;
}

/**
 * Un golpe cuerpo a cuerpo de `s` listo para darse o preverse: el objetivo,
 * `s` donde golpeará (una copia en `from`, que nadie mueve aquí) y la carga, con
 * la carrera que se anda para cobrarla (`medida`, `CargaMedida`). Lanza
 * con el motivo si no se puede (`golpeBlocker`, y lo de la rueda con
 * `cruceBlocker`; `completa` para darlo, no para preverlo). La preparación de
 * `applyAction`, `previsionDe` y `previsionDeLaRueda`, escrita una vez.
 */
function golpePreparado(
  state: BattleState,
  s: BattleStack,
  accion: BattleAction & { type: 'attack' },
  completa: boolean,
  costes: () => ReadonlyMap<string, Paso> = () => movableFrom(state, s),
): {
  readonly target: BattleStack;
  readonly desdeAhi: BattleStack;
  readonly carga: number;
  readonly medida: CargaMedida | null;
} {
  const enCurso = golpeEnCursoBlocker(state, accion, completa);
  if (enCurso !== null) throw new Error(enCurso);
  const target = stackById(state, accion.target);
  const plantado = state.golpeEnCurso;
  // Plantado con carga, no ha corrido: golpeará desde la llegada de su carrera, y
  // esa casilla se mira en el recorrido como cualquier `from`.
  const from = plantado?.carga?.carrera.at ?? accion.from;
  const motivo = golpeBlocker(state, s, target, from, costes);
  if (motivo !== null) throw new Error(motivo);
  const sinCruce = cruceBlocker(accion, completa, formaDeLaBatalla(state));
  if (sinCruce !== null) throw new Error(sinCruce);
  // La carga se mide ANTES de mover, desde donde empieza este tramo: es la regla
  // del usuario, «se puede mover un tramo y se vuelve a calcular». Lo recorrido
  // en tramos anteriores no cuenta, y por eso no hace falta guardarlo en ningún
  // sitio: viaja hasta el golpe como argumento. Y se mide contra ESTE objetivo:
  // carga solo si está en la recta. Con un golpe plantado, la medida es la que
  // guardó al plantarse (`golpeEnCurso.carga`): sin carga, ya anduvo y desde donde
  // está no hay recta; con ella, aún no corrió y se mide lo que guardó.
  const medida =
    plantado !== null
      ? plantado.carga
      : from === undefined
        ? null
        : medirCargas(state, s)(from, target);
  return {
    target,
    // Golpea desde `from`: desde ahí se mira si el objetivo le alcanza para
    // devolverlo.
    desdeAhi: from === undefined ? s : { ...s, hex: from },
    carga: medida?.recta ?? 0,
    medida,
  };
}

/**
 * Por qué `accion` no vale con un golpe plantado esperando la rueda
 * (`BattleState.golpeEnCurso`), o `null` si vale o no hay ninguno. Con uno
 * plantado, solo vale ese golpe: contra su objetivo, sin andar más y —para
 * darlo, `completa`— con sus dos elecciones; preverlo no las pide. Lo leen
 * `applyAction`, antes de nada, y `golpePreparado`; `legalActions` ofrece solo
 * ese golpe.
 */
function golpeEnCursoBlocker(
  state: BattleState,
  accion: BattleAction,
  completa = true,
): string | null {
  const g = state.golpeEnCurso;
  if (g === null) return null;
  const esEse =
    accion.type === 'attack' &&
    accion.target === g.target &&
    accion.from === undefined &&
    (!completa || (accion.golpe !== undefined && accion.respuesta !== undefined));
  return esEse ? null : PLANTADO(g);
}

/**
 * ¿Es este `attack` un «plantarse»? El golpe que llega sin ninguna
 * de las dos elecciones y sin otro plantado: espera la rueda (`golpeEnCurso`), sin
 * cerrar el turno. Sin carga, primero se anda hasta `from` y luego se elige
 * (decisión del usuario, 13-10-2026); **con carga, primero se elige y luego se
 * corre**, que la rueda tras la carrera era anticlimática (decisión del usuario,
 * 31-10-2026): se planta en su salida, sin andar ni gastar nada.
 */
function esPlantarse(state: BattleState, accion: BattleAction & { type: 'attack' }): boolean {
  return (
    state.golpeEnCurso === null && accion.golpe === undefined && accion.respuesta === undefined
  );
}

/**
 * Hexes a los que el stack puede moverse este turno, con la casilla y los pasos
 * que cuesta llegar a cada uno, indexados por `hexKey`.
 *
 * Los pasos no son un extra: son lo que la carga necesita saber. Antes `moveTo`
 * validaba el destino con `movableHexes` y volvía a lanzar el BFS para contar
 * los hexes recorridos — dos recorridos para la misma pregunta.
 *
 * Y el `Hex` tampoco: **el BFS ya lo tenía en la mano** y lo tiraba para
 * quedarse con la clave. Reconstruirlo costaba partir la cadena por la coma y
 * convertir dos trozos a número, aquí para filtrar los que no caben y otra vez
 * en `movableHexes` para devolverlos. Se llamaba `movableCosts`, y el nombre
 * cambió a propósito con la firma: así el typecheck señala a todos los
 * llamantes en vez de dejar que alguno se quede con la versión de antes
 * creyendo que sigue valiendo.
 */
export function movableFrom(state: BattleState, s: BattleStack): Map<string, Paso> {
  return movibles(state, s, true);
}

/**
 * `movableFrom` pagando o no el contacto (`contacto`): sin pagarlo lo pregunta
 * `movimientoBlocker`, para decir si es el contacto lo que no le deja llegar, sin
 * fabricar un estado distinto.
 */
function movibles(state: BattleState, s: BattleStack, contacto: boolean): Map<string, Paso> {
  // Impedido de moverse (un hechizo): no va a ninguna parte.
  if (impedidoPor(s, 'moverse') !== null) return new Map();
  // Sin casillas no hay a dónde ir, y no se recorre el tablero para saberlo: es
  // el caso de cada unidad que acaba de gastar su tramo entero, y preguntar qué
  // le queda tras moverse (`quedaAlgoQueHacer`) pasa por aquí.
  const pasos = pasosQueQuedan(state, s);
  if (pasos === 0) return new Map();
  const info = s.unit;
  const blocked = cerradasPara(state, s);

  // Los voladores ignoran lo que hay en medio: solo les importa dónde aterrizan.
  const volando = hasTrait(info, 'flying');
  const andando = volando ? null : alAndar(state, s, blocked);
  // El atacante que arranca en el suelo no sube andando, así que no pisa ningún
  // muro en todo el recorrido: el muro entero se le cierra y no se pregunta paso
  // a paso. Solo aquí, donde dónde se acaba también es el recorrido: en la recta
  // de la carga (`cargaDesde`) la última casilla no se mira en `cerradas`, y el
  // paso es lo que impide acabarla en un muro. El defensor sí sube andando. Las puertas cerradas sí se preguntan: van entre dos casillas, no en una (ampliación 4).
  const dist =
    andando === null
      ? recorrer(state, s, contacto, pasos, new Set())
      : andando.paso !== undefined && s.side === 'attacker' && !enLoAlto(state, s)
        ? recorrer(
            state,
            s,
            contacto,
            pasos,
            new Set([...andando.cerradas, ...casillasDeMuro(state.muralla)]),
            pasoPorPuertas(state.muralla, state.puertas),
          )
        : recorrer(state, s, contacto, pasos, andando.cerradas, andando.paso);

  const out = new Map<string, Paso>();
  for (const [key, paso] of dist) {
    if (hexEquals(paso.at, s.hex) || noCabe(paso.at, blocked)) continue;
    out.set(key, paso);
  }
  return out;
}

/**
 * El recorrido de `s` desde donde está con `pasos` de presupuesto: el de costes
 * (`alcanceConCostes`) con lo que cuesta salir de cada casilla (`costesDelPaso`)
 * o, sin pagar el contacto (`contacto` falso: solo cuando `movimientoBlocker`
 * pregunta si es el contacto lo que no le deja llegar), el BFS de siempre
 * (`reachable`). Lo leen `movableFrom` y `porElLado`, para que lo que se enseña,
 * lo que se anda y lo que se explica salgan de la misma cuenta.
 */
function recorrer(
  state: BattleState,
  s: BattleStack,
  contacto: boolean,
  pasos: number,
  cerradas: ReadonlySet<string>,
  paso?: PasoPermitido,
): Map<string, Paso> {
  // Sin un enemigo a `pasos + 2` o menos, ninguna casilla del recorrido tiene uno
  // al lado y salir de cada una cuesta 1: con costes todos de 1, `alcanceConCostes`
  // asienta en el orden en que el BFS descubre, así que el BFS de siempre da el
  // mismo `Map`, en el mismo orden, sin contar contactos casilla a casilla.
  return contacto && hayEnemigoA(state, s, pasos + 2)
    ? alcanceConCostes(s.hex, pasos, cerradas, costesDelPaso(state, s), paso)
    : reachable(s.hex, pasos, cerradas, paso);
}

/** ¿Hay algún enemigo vivo de `s` a `distancia` casillas o menos de donde está? */
function hayEnemigoA(state: BattleState, s: BattleStack, distancia: number): boolean {
  for (const e of state.stacks) {
    if (e.side !== s.side && isAlive(e) && hexDistance(s.hex, e.hex) <= distancia) return true;
  }
  return false;
}

// ---------------------------------------------------------- salir del contacto

/**
 * Cuántos enemigos vivos golpearían a `s` cuerpo a cuerpo si estuviera en `hex`:
 * los que tiene en contacto ahí (`contacto.ts`). Es la regla del trabado,
 * `canReachMelee` (decisión del usuario, 14-10-2026): el de lo alto del muro de
 * al lado no cuenta, y el del otro lado de una puerta cerrada sí, porque hoy se
 * golpea a través de ellas. **La única cuenta**: la leen `costesDelPaso`, para
 * cada casilla de un recorrido, y `contactoBlocker`. `enemigos`, si quien
 * pregunta por muchas casillas ya los tiene.
 */
export function enContactoEn(
  state: BattleState,
  s: BattleStack,
  hex: Hex,
  enemigos: readonly BattleStack[] = enemiesOf(state, s),
): number {
  // Para tocarse van a 1 (toda unidad, una casilla): lo de más lejos no se
  // pregunta a `canReachMelee`, ni se copia `s` en `hex` para preguntarlo.
  const lejos = 1;
  let ahi: BattleStack | null = null;
  let n = 0;
  for (const e of enemigos) {
    if (hexDistance(hex, e.hex) > lejos) continue;
    ahi ??= hexEquals(hex, s.hex) ? s : { ...s, hex };
    if (canReachMelee(state, ahi, e)) n++;
  }
  return n;
}

/**
 * Por qué `s` no puede salir de su casilla, o `null` si puede: lo que le queda no
 * paga salir de donde está (#259). Sin
 * casillas no es esto: «ya no le quedan casillas» lo dice `movimientoBlocker`.
 * La leen `movimientoBlocker`, para cualquier casilla a la que se le pida ir, y
 * el panel de la arena, que lo dice sin que se señale ninguna.
 */
export function contactoBlocker(state: BattleState, s: BattleStack): string | null {
  const quedan = pasosQueQuedan(state, s);
  if (quedan === 0) return null;
  const n = enContactoEn(state, s, s.hex);
  return salirCuesta(n) > quedan ? fraseDelContacto(n, quedan, fintaEn(state, s) > 0) : null;
}

/**
 * Lo que cuesta a `s` salir de cada casilla, por índice, para recorrer el
 * tablero con costes. Andando, `1 + N` de cada casilla de la que sale; volando,
 * `1 + N` de la casilla de la que despega y 1 por cada una de las demás: el
 * volador no paga por lo que sobrevuela (decisión del usuario). Cada casilla se
 * cuenta una vez, y solo si el recorrido sale de ella.
 */
function costesDelPaso(state: BattleState, s: BattleStack): CosteDeSalir {
  const enemigos = enemiesOf(state, s);
  const casillas = allHexes();
  // −1: aún no contada. Un recorrido sale de cada casilla una vez como mucho,
  // pero la carga pregunta por la misma recta desde muchas casillas.
  const contados = new Int8Array(BOARD_SIZE).fill(-1);
  const coste = (i: number): number => {
    let n = contados[i] as number;
    if (n === -1) {
      n = enContactoEn(state, s, casillas[i] as Hex, enemigos);
      contados[i] = n;
    }
    return salirCuesta(n);
  };
  if (!hasTrait(s.unit, 'flying')) return coste;
  const despega = indiceDe(s.hex);
  return (i) => (i === despega ? coste(i) : 1);
}

/** Hexes a los que el stack puede moverse este turno. */
export function movableHexes(state: BattleState, s: BattleStack): Hex[] {
  return [...movableFrom(state, s).values()].map((p) => p.at);
}

// ---------------------------------------------------------------- rondas

/**
 * El orden en que tocarán los que aún no han tenido turno, como lo saca
 * fheroes2: cada bando, del más rápido al más lento y por su puesto en un
 * empate (`SortFastest` es un `stable_sort`); entre los dos bandos, el primero
 * de cada uno, y si van a la misma velocidad, el bando `preferido`, que después
 * de cada uno pasa a ser el contrario. Los empates entre bandos se alternan, no
 * se los queda siempre el atacante:
 *
 * ```cpp
 * if ( ( *attackingUnitsIter )->GetSpeed() == ( *defendingUnitsIter )->GetSpeed() ) {
 *     result = attackingUnitsGoFirst ? *attackingUnitsIter : *defendingUnitsIter;
 * }
 * // …
 * preferredColor = ( unit->GetArmyColor() == attackingArmy.GetColor() ) ? defendingArmy.GetColor() : attackingArmy.GetColor();
 * ```
 * https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_arena.cpp#L179-L181
 * https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_arena.cpp#L246
 *
 * `pendientes` llega con cada bando ya en su orden; la salida no lo cambia,
 * solo los intercala. Las velocidades son las de `state.iniciativa`, las de
 * cuando empezó la ronda.
 */
function intercalar(
  state: BattleState,
  pendientes: readonly BattleStack[],
  preferido: Side,
): string[] {
  const colas: Record<Side, BattleStack[]> = { attacker: [], defender: [] };
  for (const s of pendientes) colas[s.side].push(s);
  const velocidad = (s: BattleStack): number => {
    const v = state.iniciativa[s.id];
    if (v === undefined) throw new Error(`${s.id} está en la cola sin velocidad de ronda`);
    return v;
  };
  const orden: string[] = [];
  let toca = preferido;
  for (let a = colas.attacker[0], d = colas.defender[0]; a !== undefined || d !== undefined; ) {
    let elegido: BattleStack;
    if (a === undefined) elegido = d as BattleStack;
    else if (d === undefined) elegido = a;
    else if (velocidad(a) === velocidad(d)) elegido = toca === 'attacker' ? a : d;
    else elegido = velocidad(a) > velocidad(d) ? a : d;
    colas[elegido.side].shift();
    orden.push(elegido.id);
    toca = otroBando(elegido.side);
    a = colas.attacker[0];
    d = colas.defender[0];
  }
  return orden;
}

/**
 * El bando que gana el próximo empate: el contrario del último que tuvo turno,
 * y el atacante antes del primero. En fheroes2, `_lastActiveUnitArmyColor`
 * nace `UNUSED`, y el contrario de algo que no es el atacante es el atacante:
 *
 * ```cpp
 * _currentUnit = GetCurrentUnit( *_attackingArmy, *_defendingArmy, GetOppositeColor( _lastActiveUnitArmyColor ) );
 * return col == getAttackingArmyColor() ? getDefendingArmyColor() : getAttackingArmyColor();
 * ```
 * https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_arena.cpp#L581
 * https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_arena.cpp#L824
 * https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_arena.h#L342
 */
function preferidoEnElEmpate(state: BattleState): Side {
  return state.ultimoBando === null ? 'attacker' : otroBando(state.ultimoBando);
}

/** La cola de una ronda nueva: todos los vivos, con la velocidad de ahora. */
function initiativeOrder(state: BattleState): string[] {
  const vivos = state.stacks.filter(isAlive);
  state.iniciativa = Object.fromEntries(vivos.map((s) => [s.id, stackSpeed(s)]));
  const enSuOrden = vivos.slice().sort((a, b) => stackSpeed(b) - stackSpeed(a) || a.slot - b.slot);
  return intercalar(state, enSuOrden, preferidoEnElEmpate(state));
}

/** Tope de rondas: una batalla que no converge se cierra, no se cuelga (`types.ts`). */
export { MAX_ROUNDS };

/**
 * Tope de jugadas de una batalla, para los bucles que la juegan acción a acción:
 * `autoResolve`, el director, la sesión del cliente y el banco de
 * enfrentamiento. Uno solo y derivado de `MAX_ROUNDS`, porque eran cuatro
 * números sueltos (5 000, 800, 500 y 5 000) y con el turno en tramos hubo que
 * subirlos a mano a la vez.
 *
 * Cien por ronda es holgura y no una cota: una ronda normal son una o dos
 * jugadas por unidad. Quien la alcanza es un bucle que no avanza, y el motor ya
 * cierra la batalla en `MAX_ROUNDS` mucho antes.
 */
export const MAX_JUGADAS = MAX_ROUNDS * 100;

function beginRound(state: BattleState, rng: Rng): void {
  // Comprobar el final ANTES de montar la ronda: si un bando llega vacío (dos
  // héroes recién contratados sin tropas, por ejemplo), montar la cola y
  // volver a llamarse era una recursión infinita.
  checkFinished(state);
  if (state.finished !== null) {
    state.turno = null;
    return;
  }

  if (state.round >= MAX_ROUNDS) {
    finishByExhaustion(state);
    return;
  }

  state.round += 1;
  // El rótulo de ronda va ANTES de que caduquen los efectos: así el
  // `effect_end` se lee dentro de la ronda en la que se disipa, y no colgando
  // del final de la anterior.
  state.log.push({ kind: 'round_start', round: state.round });

  for (const s of state.stacks) {
    s.acted = false;
    s.retaliated = false;
    // Caducar es filtrar: el stack nunca guardó el bono, así que quitarlo de
    // la lista lo devuelve solo a su valor base. No hay nada que revertir.
    for (const caducado of tickEffects(s)) {
      state.log.push({ kind: 'effect_end', stack: s.id, source: caducado.source });
    }
  }
  for (const side of SIDES) {
    const hero = state.heroes[side];
    if (hero !== null) hero.castThisRound = false;
  }
  // La iniciativa se monta DESPUÉS de caducar: una Prisa que expira ya no
  // cuenta para el orden de esta ronda.
  state.queue = initiativeOrder(state);
  if (state.queue.length === 0) {
    finishByExhaustion(state);
    return;
  }
  advance(state, rng);
}

/** Cierra una batalla que no avanza. Gana quien conserve más efectivos. */
function finishByExhaustion(state: BattleState): void {
  if (state.finished !== null) return;
  const vivos = (side: Side): number => sumaDelBando(state, side, (s) => s.count);
  const winner: Side = vivos('attacker') > vivos('defender') ? 'attacker' : 'defender';
  state.finished = { winner };
  state.turno = null;
  state.log.push({ kind: 'finished', winner });
}

/** Pasa al siguiente stack con turno, saltando muertos; sin nadie, ronda nueva. */
function advance(state: BattleState, rng: Rng): void {
  if (state.finished !== null) {
    state.turno = null;
    return;
  }

  const s = siguienteEnLaCola(state);
  if (s === null) {
    beginRound(state, rng);
    return;
  }
  abrirTurno(state, s);
  alEmpezarSuTurno(state, s, rng);
  // Lo que sale al empezar puede matar a quien empieza (su propia granada le da si
  // sigue cerca; hallazgo F1 de /simplify, 02-11-2026): un muerto no juega su turno,
  // pasa al siguiente. Si cerró la batalla, la primera línea de aquí lo dice.
  if (!isAlive(s)) advance(state, rng);
}

/**
 * Lo que sale al empezar el turno de `s`, antes de que elija nada: lo que apuntó en
 * el anterior (el disparo se soltó al apuntar, 25-10-2026) y la granada que lanzó
 * (02-11-2026). Luego el turno sigue como siempre. Si algo cierra la batalla,
 * `checkFinished` ya cerró el turno.
 */
function alEmpezarSuTurno(state: BattleState, s: BattleStack, rng: Rng): void {
  dispararLoApuntado(state, s, rng);
  explotarLaGranada(state, s, rng);
  caerElHechizo(state, s, rng);
  if (isAlive(s)) saltar(state, s, 'empezarSuTurno', null);
}

/**
 * Saca de la cola al siguiente vivo, o `null` si no queda nadie en la ronda.
 *
 * Los que no han tenido turno van delante y se reordenan antes de cada salida:
 * su desempate depende de quién actuó el último, y eso no se sabe al montar la
 * ronda —un muerto cambia a quién le toca el siguiente empate—. fheroes2 también elige así, uno a uno (`GetCurrentUnit`).
 */
function siguienteEnLaCola(state: BattleState): BattleStack | null {
  const vivos = state.queue.map((id) => stackById(state, id)).filter(isAlive);
  state.queue = intercalar(state, vivos, preferidoEnElEmpate(state));
  const id = state.queue.shift();
  return id === undefined ? null : stackById(state, id);
}

/**
 * Le da el turno a `s`: un objeto nuevo en cada activación, así que lo gastado
 * no se resetea, nace a 0. El ordinal sale del turno anterior, que sigue puesto
 * aquí: solo se borra al terminar la batalla, y entonces ya no se llega a esta
 * línea.
 */
function abrirTurno(state: BattleState, s: BattleStack): void {
  state.ultimoBando = s.side;
  state.turno = { n: (state.turno?.n ?? 0) + 1, stack: s.id, gastado: 0 };
  quitarLosQueVencen(state, s, 'empezar', state.turno.n);
}

/**
 * Cierra el turno del stack activo y pasa al siguiente. La moral no regala otro
 * (26-10-2026): un escudero de 6 casillas cruzaba el tablero en la ronda 1 con
 * el segundo turno de la moral alta de una sola facción.
 */
function endTurn(state: BattleState, s: BattleStack, rng: Rng): void {
  checkFinished(state);
  if (state.finished !== null) {
    state.turno = null;
    return;
  }
  if (isAlive(s)) saltar(state, s, 'terminarSuTurno', null);
  checkFinished(state);
  if (state.finished !== null) {
    state.turno = null;
    return;
  }
  const n = state.turno?.n;
  if (n !== undefined) quitarLosQueVencen(state, s, 'terminar', n);
  // Un turno menos de recarga: el del disparo cuenta (decisión del usuario, 02-11-2026).
  if (s.recargando > 0) s.recargando -= 1;
  s.acted = true;
  advance(state, rng);
}

/**
 * Quita a `s` lo que duraba hasta que `al` (empiece o termine) su próximo turno
 * (la rueda del golpe): lo colgado en un turno anterior al `n`. Al **terminar**
 * lo llama `endTurn`; al **empezar**, `abrirTurno`. Si su turno no llega (muere
 * o acaba la batalla), lo quita el tope de `roundsLeft`. Sin ninguno que venza,
 * no se escribe nada.
 */
function quitarLosQueVencen(state: BattleState, s: BattleStack, al: CuandoVence, n: number): void {
  // De cualquier stack: lo que dura hasta un turno de `s` puede ir colgado de otro
  // (un hechizo «hasta el próximo turno de quien lo lanzó», `HastaElTurno.de`).
  for (const x of state.stacks) {
    const vencido = (e: StackEffect): boolean =>
      e.hasta !== undefined &&
      e.hasta.al === al &&
      e.hasta.turno < n &&
      (e.hasta.de ?? x.id) === s.id;
    // Cada cierre de turno pasa por aquí: sin nada que quitar, ni una lista nueva.
    if (!x.effects.some(vencido)) continue;
    const vencidos = x.effects.filter(vencido);
    x.effects = x.effects.filter((e) => !vencido(e));
    for (const e of vencidos) state.log.push({ kind: 'effect_end', stack: x.id, source: e.source });
  }
}

/**
 * Un bando pierde cuando se queda sin nadie en pie **o cuando cae su héroe**,
 * aunque le quede tropa (fase 1b): el héroe es el que manda, y sin él la tropa
 * no sigue peleando.
 */
function bandoVencido(state: BattleState, side: Side): boolean {
  let alguienVivo = false;
  for (const s of state.stacks) {
    if (s.side !== side) continue;
    if (s.origen.kind === 'heroe' && !isAlive(s)) return true;
    if (isAlive(s)) alguienVivo = true;
  }
  return !alguienVivo;
}

function checkFinished(state: BattleState): void {
  if (state.finished !== null) return;
  const attackerLost = bandoVencido(state, 'attacker');
  const defenderLost = bandoVencido(state, 'defender');
  if (!attackerLost && !defenderLost) return;

  // Sin atacante no hay conquista: el empate a cero lo gana el defensor. Y con
  // héroes en el tablero hay otro empate posible —un disparo que salpica
  // (`splash`) a los dos comandantes a la vez—, que se resuelve igual.
  const winner: Side = attackerLost ? 'defender' : 'attacker';
  state.finished = { winner };
  state.turno = null;
  state.log.push({ kind: 'finished', winner });
}

/**
 * Por qué acabó una batalla, con la misma regla que la cerró (`bandoVencido`):
 * - `heroe`: cayó el héroe del que pierde, aunque le quede tropa;
 * - `sin_tropa`: el que pierde no tiene a nadie en pie;
 * - `rendicion`: el que pierde pagó por irse;
 * - `agotada`: los dos siguen en pie y el motor la cerró por no avanzar
 *   (`finishByExhaustion`: el tope de rondas o una ronda sin nadie que actúe).
 *
 * La arena lo dice al acabar: leyendo «quedan unidades en los dos bandos» como
 * «se acabaron las rondas», un Rayo que mataba al héroe en la ronda 1 salía como
 * «sin vencedor en 100 rondas: por tiempo» (H1 de QA de la arena).
 */
export type CausaDelFinal = 'heroe' | 'sin_tropa' | 'rendicion' | 'agotada';

export function causaDelFinal(state: BattleState): CausaDelFinal | null {
  if (state.finished === null) return null;
  if (state.finished.surrender !== undefined) return 'rendicion';
  const perdedor: Side = state.finished.winner === 'attacker' ? 'defender' : 'attacker';
  if (!bandoVencido(state, perdedor)) return 'agotada';
  const cayoSuHeroe = state.stacks.some(
    (s) => s.side === perdedor && s.origen.kind === 'heroe' && !isAlive(s),
  );
  return cayoSuHeroe ? 'heroe' : 'sin_tropa';
}

// ---------------------------------------------------------------- acciones

/**
 * El recorrido del tablero que el llamante YA hizo, y de cuándo es.
 *
 * El «cuándo» no es redundante: un mapa de costes de otro stack, o del mismo
 * antes de su último tramo, tiene las mismas claves «x,y» y no hay forma de
 * distinguirlo mirándolo. Quien lo calculó dice de qué turno es
 * (`firmaDelTurno`: el ordinal, lo gastado y lo que quitó la Finta), y
 * `applyAction` la compara con la de ahora: el ordinal ya dice de quién es, y lo
 * demás, de qué tramo. Y con qué puertas abiertas (`claveDeAbiertas`): abrir o
 * cerrar una no gasta casillas ni cambia de turno, pero sí el recorrido.
 */
export interface Movibles {
  readonly firma: string;
  readonly puertas: string;
  readonly costs: ReadonlyMap<string, Paso>;
}

/**
 * Aplica la acción del stack activo. Lanza si es ilegal: no la corrige.
 *
 * `movibles` es una **pista de rendimiento**: el mismo `movableFrom` que ya
 * calculó quien eligió la acción. No es un atajo que se salte la comprobación
 * —la legalidad del destino se sigue leyendo del mapa, solo que del recorrido
 * ya hecho en vez de uno nuevo—. Sin ella, `moveTo` recorre el tablero como
 * siempre: es lo que hacen el director y el cliente, que no traen recorrido.
 */
export function applyAction(
  state: BattleState,
  action: BattleAction,
  rng: Rng,
  movibles?: Movibles,
): void {
  if (state.finished !== null) throw new Error('la batalla ya ha terminado');
  const enElDespliegue = despliegueEnCursoBlocker(state);
  if (enElDespliegue !== null) throw new Error(enElDespliegue);
  const s = activeStack(state);
  const turno = state.turno;
  if (s === null || turno === null) throw new Error('no hay stack activo');
  const firma = firmaDelTurno(turno, state.golpeEnCurso);
  if (movibles !== undefined && movibles.firma !== firma) {
    throw new Error(
      `el recorrido que traes es del ${movibles.firma}, y ahora le toca a ${s.id} en el ${firma}`,
    );
  }
  if (movibles !== undefined && movibles.puertas !== claveDeAbiertas(state.puertas)) {
    throw new Error(
      'el recorrido que traes es de antes de abrir o cerrar una puerta: el camino ha cambiado',
    );
  }
  // Con un golpe plantado no se juega otra cosa: ni el hechizo del héroe, que no
  // cierra el turno, ni una rendición; y solo ese golpe (`golpeEnCursoBlocker`).
  const enCurso = golpeEnCursoBlocker(state, action);
  if (enCurso !== null) throw new Error(enCurso);
  if (state.golpeEnCurso !== null && state.golpeEnCurso.stack !== s.id) {
    throw new Error(`el golpe plantado es de ${state.golpeEnCurso.stack}, y le toca a ${s.id}`);
  }
  const porLaFase = faseBlocker(state, action.type);
  if (porLaFase !== null) throw new Error(`${s.id}: ${porLaFase}`);

  switch (action.type) {
    case 'move': {
      // Moverse no cierra el turno: gasta casillas y deja a la unidad activa
      // para que siga, golpee o termine. Solo se cierra solo cuando ya no le
      // queda nada que hacer, para no pedir un clic que no decide nada.
      moveTo(state, s, action.to, movibles?.costs);
      // Tras la Finta, andar cierra el turno: es un solo tramo.
      if (faseDelTurno(state) === 'trasLaFinta' || !quedaAlgoQueHacer(state))
        endTurn(state, s, rng);
      return;
    }

    case 'end_turn': {
      endTurn(state, s, rng);
      return;
    }

    case 'attack': {
      // El recorrido, una vez: lo leen la comprobación y el movimiento. Con un golpe
      // plantado, el que trae quien juega viene vacío (la lista legal de la fase
      // `plantado` no da casillas) y se calcula aquí: la carrera de la carga se
      // valida al golpear, contra él.
      let costes: ReadonlyMap<string, Paso> | undefined =
        state.golpeEnCurso === null ? movibles?.costs : undefined;
      const recorrido = (): ReadonlyMap<string, Paso> => {
        costes ??= movableFrom(state, s);
        return costes;
      };
      const plantarse = esPlantarse(state, action);
      const { target, carga, medida } = golpePreparado(state, s, action, !plantarse, recorrido);
      // Sin carga, primero se anda y luego el cruce y el golpe; **la carga se elige
      // antes de correr** (decisión del usuario, 31-10-2026): el cruce, la carrera
      // (con la carga en su `move`) y el golpe. De una vez o en dos jugadas, el
      // registro dice lo mismo en el mismo orden. El `Rng` gasta igual en los dos
      // órdenes: ni andar ni el cruce tiran.
      if (medida === null && action.from !== undefined) {
        moveTo(state, s, action.from, recorrido());
      }
      if (plantarse) {
        // Ni cierra el turno aunque haya gastado sus casillas, ni escribe aún
        // ningún cruce: espera la rueda. Soltarlo es `soltarElGolpe`.
        state.golpeEnCurso = { stack: s.id, target: target.id, carga: medida };
        return;
      }
      state.golpeEnCurso = null;
      const cruce = cruceDeLaRueda(state, s, target, action);
      if (medida !== null) moveTo(state, s, medida.carrera.at, recorrido(), medida.carrera);
      melee(state, s, target, rng, carga, cruce);
      // Con la Finta el turno sigue, solo para andar, si le queda a dónde y la
      // pelea no ha acabado con este golpe. Si no, se cierra como siempre.
      if (faseDelTurno(state) === 'trasLaFinta') {
        checkFinished(state);
        if (state.finished === null && quedaAlgoQueHacer(state)) return;
      }
      endTurn(state, s, rng);
      return;
    }

    case 'aim': {
      const motivo = apuntarBlocker(state, action.at);
      if (motivo !== null) throw new Error(motivo);
      s.apuntado = { col: action.at.col, row: action.at.row };
      state.log.push({ kind: 'aimed', stack: s.id, at: s.apuntado });
      endTurn(state, s, rng);
      return;
    }

    case 'throw': {
      const motivo = lanzarBlocker(state, action.at);
      if (motivo !== null) throw new Error(motivo);
      s.granada = { col: action.at.col, row: action.at.row };
      s.granadasLanzadas += 1;
      state.log.push({ kind: 'thrown', stack: s.id, at: s.granada });
      endTurn(state, s, rng);
      return;
    }

    case 'poner_escalera': {
      const motivo = escaleraBlocker(state, action.muro);
      if (motivo !== null) throw new Error(`${s.id} no puede poner la escalera: ${motivo}`);
      // La escalera se queda puesta y deja de ir a cuestas: la usa quien llegue
      // a ese pie (decisión del usuario). Ponerla es el turno entero.
      state.escaleras.push({ pie: s.hex, muro: action.muro });
      s.escalera = false;
      state.log.push({ kind: 'ladder_placed', stack: s.id, pie: s.hex, muro: action.muro });
      endTurn(state, s, rng);
      return;
    }

    case 'subir': {
      const motivo = subirBlocker(state, action.muro);
      if (motivo !== null) throw new Error(`${s.id} no puede subir: ${motivo}`);
      const desde = s.hex;
      s.hex = action.muro;
      state.log.push({ kind: 'climbed', stack: s.id, from: desde, to: action.muro });
      // Al subir se queda arriba y no hace nada más ese turno.
      endTurn(state, s, rng);
      return;
    }

    case 'abrir_puerta':
    case 'cerrar_puerta': {
      const motivo = puertaBlocker(state, action.type, action.puerta);
      if (motivo !== null) {
        const verbo = action.type === 'abrir_puerta' ? 'abrir' : 'cerrar';
        throw new Error(`${s.id} no puede ${verbo} la puerta: ${motivo}`);
      }
      const puerta = state.puertas.find((p) => mismaPuerta(p, action.puerta));
      if (puerta === undefined) throw new Error('puertaBlocker dejó pasar una puerta que no hay');
      puerta.abierta = action.type === 'abrir_puerta';
      puerta.cambiadaEn = turno.n;
      state.log.push({
        kind: puerta.abierta ? 'gate_opened' : 'gate_closed',
        stack: s.id,
        puerta: { a: puerta.a, b: puerta.b },
      });
      // No gasta el turno, como el hechizo: después se mueve, golpea o dispara.
      return;
    }

    case 'cast': {
      castHeroSpell(state, s.side, action.spell, action.target, action.at);
      // Lanzar un hechizo no consume el turno del stack: el héroe actúa aparte. Si
      // el hechizo mató a la activa, su turno se acaba.
      if (state.finished === null && !isAlive(s)) advance(state, rng);
      return;
    }

    case 'power': {
      // El hechizo con la unidad de lanzador: la misma aplicación que la del héroe.
      usarElPoder(state, s, action, rng);
      return;
    }

    case 'surrender': {
      const { coste, motivo } = surrenderBlocker(state, s.side);
      if (motivo !== null) throw new Error(`no se puede rendir: ${motivo}`);
      if (action.gold !== undefined && action.gold !== coste) {
        throw new Error(`no se puede rendir por ${action.gold} de oro: ahora cuesta ${coste}`);
      }
      // El precio, UNA vez: se escribe en `finished` y de ahí lo lee quien lo
      // cobra (`settleBattle`). Calcularlo otra vez al cobrar daría la misma
      // cifra hoy, y el día que algo cambie en medio, dos.
      const winner = otroBando(s.side);
      state.log.push({ kind: 'surrender', side: s.side });
      state.finished = { winner, surrender: { gold: coste } };
      state.turno = null;
      state.log.push({ kind: 'finished', winner });
      return;
    }
  }
}

/**
 * Lo que cuesta rendirse: un porcentaje del oro de catálogo de la tropa viva
 * que se salva, redondeado hacia arriba. El héroe no cuenta: no es tropa.
 *
 * Proporcional a lo que se salva, como en HoMM: rendirse con el ejército entero
 * cuesta, rendirse con dos campesinos casi nada. El porcentaje es provisional
 * y está en `data/heroe.json`, declarado inventado (decisión del usuario: 50 %).
 */
function surrenderCost(state: BattleState, side: Side): number {
  const oro = sumaDelBando(state, side, oroDeCatalogo);
  return Math.ceil((oro * HEROE.rendicion.porcentajeDelOro) / 100);
}

/**
 * El oro de catálogo de un stack: lo que vale para la rendición. Un `switch`
 * que devuelve, y no uno que suma: así un origen nuevo no compila hasta que
 * alguien decida cuánto vale, en vez de valer 0 en silencio.
 */
function oroDeCatalogo(s: BattleStack): number {
  switch (s.origen.kind) {
    case 'catalogo':
      // El precio viaja en el origen: `unit` ya no es siempre la referencia
      // del catálogo —la de un veterano es una copia con sus cifras—, y volver
      // a `creature(body)` es lo que prohíbe `test/invariantes.test.ts`. Un
      // veterano cuesta lo mismo que un novato: rendirse paga la tropa, no su
      // historia.
      return s.origen.oro * s.count;
    case 'heroe':
      return 0;
  }
}

/**
 * Lo que costaría rendirse y, si no se puede, por qué (`motivo`; `null` si se
 * puede). Las dos cosas en una llamada porque las piden juntas los tres que la
 * leen —`applyAction` al rechazar, `legalActions` al ofrecer y la pantalla para
 * rotular el botón—, y el motivo «cuesta N» ya necesita el precio. Como
 * `castBlocker`, la frase la escribe el núcleo.
 */
export function surrenderBlocker(
  state: BattleState,
  side: Side,
): { readonly coste: number; readonly motivo: string | null } {
  const coste = surrenderCost(state, side);
  return { coste, motivo: motivoParaNoRendirse(state, side, coste) };
}

function motivoParaNoRendirse(state: BattleState, side: Side, coste: number): string | null {
  if (state.finished !== null) return 'la batalla ya ha terminado';
  const porLaFase = faseBlocker(state, 'surrender');
  if (porLaFase !== null) return porLaFase;
  const hero = state.heroes[side];
  if (hero === null) return SIN_HEROE;
  if ('blocked' in hero.retreat) return hero.retreat.blocked;
  if (coste > hero.retreat.purse) return `cuesta ${coste} de oro y tienes ${hero.retreat.purse}`;
  return null;
}

/**
 * ¿Le queda algo a la unidad activa tras moverse? Lo dice la lista legal, que es
 * donde está escrito qué se puede hacer tras un tramo —moverse más o golpear—, y
 * no una segunda redacción de la misma regla aquí. `cast`, `surrender` y
 * `end_turn` no cuentan: ninguno es la unidad haciendo algo con su turno —el
 * hechizo es del héroe y no lo cierra, la rendición es del bando—, y contarlos
 * dejaría abierto un turno que ya no decide nada.
 */
function quedaAlgoQueHacer(state: BattleState): boolean {
  return legalActionsAndCosts(state).actions.some((a) => a.type === 'move' || a.type === 'attack');
}

/**
 * Suelta el golpe plantado (`golpeEnCurso`): Escape en la rueda antes de elegir
 * (decisión del usuario, 13-10-2026). Sin carga, la unidad se queda donde llegó,
 * como tras un tramo, y sigue su turno con lo que le quede; con carga no corrió
 * (la carga se elige antes de correr, 31-10-2026): sigue en su salida, sin nada
 * gastado, y puede volver a cargar. Si ya no le queda nada que hacer, el turno se
 * cierra, como el `move` que agota. Solo la llama la sesión (`CruceDeLaRueda`);
 * sin golpe plantado lanza.
 */
export function soltarElGolpe(state: BattleState, rng: Rng): void {
  const g = state.golpeEnCurso;
  if (g === null) throw new Error('no hay ningún golpe plantado que soltar');
  const s = activeStack(state);
  if (s === null || state.turno === null || s.id !== g.stack) {
    throw new Error(`el golpe plantado es de ${g.stack}, y no le toca`);
  }
  state.golpeEnCurso = null;
  if (!quedaAlgoQueHacer(state)) endTurn(state, s, rng);
}

/**
 * Quien pega se planta (`golpeEnCurso`) sin golpear: anda hasta su objetivo, o,
 * si carga, se queda en su salida con la carrera por correr (`esPlantarse`); el
 * `attack` sin elecciones, con su `from` si lo trae. Es lo que se hace cuando
 * la rueda espera a alguien que no es la IA —la persona en la sesión, el agente
 * en el director (`pasoDelCruce`)—: el golpe que espera, de verdad plantado. No
 * tira dados: el `Rng` gasta lo mismo y en el mismo orden que el golpe de una
 * vez. Lanza con la frase del núcleo si no se puede: uno que no se puede dar no
 * mueve a nadie.
 */
export function plantarse(
  state: BattleState,
  accion: Extract<BattleAction, { type: 'attack' }>,
  rng: Rng,
): void {
  const { golpe: _golpe, respuesta: _respuesta, ...sinElegir } = accion;
  applyAction(state, sinElegir, rng);
}

/**
 * La longitud de la recta de carga si `s` golpeara a `target` desde `from`; 0 si
 * no carga. ÚNICA regla de CUÁNDO hay carga (decisiones del usuario,
 * 02-10-2026): carga todo el que pega cuerpo a cuerpo (#260; montado de guerra y
 * con lanza, con la fuerza de la montura: `GolpeConArma.carga`), solo si `from` está **en línea
 * recta** desde donde está ahora —una de las 6 rectas del hexágono, sin giros—,
 * con la recta libre de unidades, a **`CARGA_MINIMA` casillas o más**, y con
 * **el enemigo en esa misma recta**: la casilla que sigue a `from` tiene que ser
 * suya. «El enemigo tiene que estar en la línea recta, no se puede cargar contra
 * un enemigo que esté al lado»: un golpe que llega a la recta y luego gira para
 * pegar al de al lado no carga, y uno pegado de salida tampoco —la recta mide 0—.
 * Con un enemigo de dos casillas basta con que una lo sea. Cuánto suma lo dice
 * `carga.ts`, que aplica el tope y el bono (`cargaEfectiva`): aquí no se
 * recorta nada.
 *
 * La primera redacción no miraba al enemigo, y la persona veía casillas
 * naranjas «desde las que cargaría» sin nadie delante (QA, H1). Un volador
 * también tiene que recorrerla: «sin giros» es la forma del trayecto, no de dónde
 * aterriza.
 *
 * `bloqueadas` es una pista para quien pregunta por muchas casillas a la vez:
 * las ocupadas no cambian entre una y otra, así que se calculan una vez.
 */
export function cargaDesde(
  state: BattleState,
  s: BattleStack,
  from: Hex,
  target: BattleStack,
  bloqueadas?: ReadonlySet<string>,
): number {
  return medirCargas(state, s, bloqueadas)(from, target)?.recta ?? 0;
}

/**
 * Mide las cargas de `s` desde las casillas que se le pregunten, contra el
 * objetivo que se le diga: `cargaDesde` hecha para muchas preguntas, con lo que
 * no cambia de una a otra (las ocupadas, el paso de la muralla, el coste de salir
 * de cada casilla) contado una vez y solo si alguna pregunta llega a necesitarlo.
 * `null` si desde ahí no carga. Primero lo barato, que descarta casi todas: la
 * distancia y el objetivo en la recta, y después la recta libre y lo que cuesta
 * andarla. La leen `cargaDesde`, el golpe (`golpePreparado`), el anuncio
 * (`casillasDeCarga`) y la IA, que desempata con lo que pagará.
 */
export function medirCargas(
  state: BattleState,
  s: BattleStack,
  bloqueadas?: ReadonlySet<string>,
): (from: Hex, target: BattleStack) => CargaMedida | null {
  let andando: ReturnType<typeof alAndar> | null = null;
  let salirDe: CosteDeSalir | null = null;
  return (from, target) => {
    if (hexDistance(s.hex, from) < CARGA_MINIMA) return null;
    const hacia = siguienteEnRecta(s.hex, from);
    if (hacia === null || !stackHexes(target).some((h) => hexEquals(h, hacia))) return null;
    // La recta es un recorrido: con muralla, lo que no se anda tampoco se carga.
    andando ??= alAndar(state, s, bloqueadas ?? cerradasPara(state, s));
    const d = rectaLibre(s.hex, from, andando.cerradas, andando.paso);
    if (d === null || d < CARGA_MINIMA) return null;
    // La carrera se paga por la recta, que es lo que se anda (`moveTo`): si no cabe en lo que le queda, la casilla puede seguir a
    // mano por otro camino más barato, pero sin carga. Cuenta casillas, no pasos.
    salirDe ??= costesDelPaso(state, s);
    const carrera = carreraConCostes(s.hex, from, salirDe);
    if (carrera === null || carrera.steps > pasosQueQuedan(state, s)) return null;
    return { recta: d, carrera };
  };
}

/**
 * Las cargas que `s` tiene a mano en este tramo: a qué enemigo, desde qué
 * casilla a la que puede ir y con cuántas casillas COBRARÍA —ya recortadas por
 * `cargaEfectiva`—. Es lo que se ENSEÑA —el enemigo marcado y su casilla con su
 * «»N» en el cliente, el `chargeFrom` del agente— y sale de `cargaDesde` y
 * `cargaEfectiva`, las mismas que cobran, así que el anuncio no puede discrepar
 * del golpe. Una casilla vacía de la recta sin enemigo detrás no sale: desde ahí
 * solo se mueve.
 */
export function casillasDeCarga(
  state: BattleState,
  s: BattleStack,
  costes?: ReadonlyMap<string, Paso>,
): readonly CasillaDeCarga[] {
  if (state.turno?.stack === s.id) {
    // Tras la Finta no hay golpe que cobrarla: solo se anda.
    if (faseDelTurno(state) === 'trasLaFinta') return SIN_CARGAS;
    // Plantado, la única carga es la que espera la rueda (si carga): el tablero la
    // marca y el agente la lee en `chargeFrom` como al apuntarla.
    const g = state.golpeEnCurso;
    if (g !== null) {
      return g.carga === null
        ? SIN_CARGAS
        : [casillaDeCarga(g.target, g.carga.carrera.at, g.carga.recta)];
    }
  }
  const medir = medirCargas(state, s);
  const enemigos = enemiesOf(state, s);
  const out: CasillaDeCarga[] = [];
  for (const paso of (costes ?? movableFrom(state, s)).values()) {
    // Desde cada casilla, el único enemigo que se puede cargar es el que ocupa la
    // siguiente de la recta: a él se le pregunta, y no a todos.
    const hacia = siguienteEnRecta(s.hex, paso.at);
    if (hacia === null) continue;
    const e = enemigos.find((x) => stackHexes(x).some((h) => hexEquals(h, hacia)));
    if (e === undefined) continue;
    const medida = medir(paso.at, e);
    if (medida === null) continue;
    out.push(casillaDeCarga(e.id, paso.at, medida.recta));
  }
  return out;
}

/** La carga contra `target` desde `at` con una recta de `recta` casillas, como se enseña. */
function casillaDeCarga(target: string, at: Hex, recta: number): CasillaDeCarga {
  const hexes = cargaEfectiva(recta, CARGA);
  return { target, at, hexes, porciento: porcientoDeLaCarga(hexes, CARGA) };
}

/** Una carga posible: contra quién, desde qué casilla y con cuántas casillas. */
export interface CasillaDeCarga {
  readonly target: string;
  readonly at: Hex;
  readonly hexes: number;
  /**
   * Lo que suma al daño, en tanto por ciento entero (`porcientoDeLaCarga`): el
   * tablero y la barra lo pintan sin hacer la cuenta, que depende de quién carga.
   */
  readonly porciento: number;
}

/**
 * Ninguna carga. Una sola instancia para quien no tiene nada que enseñar —sin
 * el rasgo, sin turno propio, el espectador—, en vez de una lista vacía por cada
 * sitio que la necesita.
 */
export const SIN_CARGAS: readonly CasillaDeCarga[] = Object.freeze([]);

/**
 * El paso del recorrido `costes` de `s` hasta `to`, o lanza diciendo por qué no
 * llega (`movimientoBlocker`): el que anda `moveTo`.
 */
function pasoHasta(
  state: BattleState,
  s: BattleStack,
  costes: ReadonlyMap<string, Paso>,
  to: Hex,
): Paso {
  const paso = costes.get(hexKey(to));
  if (paso === undefined) {
    const motivo = movimientoBlocker(state, to) ?? 'el recorrido que trae no es de este tramo';
    throw new Error(`${s.id} no puede moverse a (${to.col},${to.row}): ${motivo}`);
  }
  return paso;
}

/**
 * Mueve el stack y le apunta al turno lo que cuesta el camino. Con `carrera`, la
 * de un golpe que carga (el `move` lo dice, y el lienzo la anima así).
 */
function moveTo(
  state: BattleState,
  s: BattleStack,
  to: Hex,
  costes?: ReadonlyMap<string, Paso>,
  carrera?: Paso,
): void {
  // El coste real del camino, no la distancia en línea recta: rodear a un
  // enemigo cuesta más casillas del presupuesto. Sale del mismo recorrido que
  // decide si el destino es legal, así que no hay una segunda cuenta que pueda
  // discrepar de la primera — y si el llamante ya lo hizo, es literalmente ese.
  // Salvo la carga cuando salir del contacto cuesta: la carrera va por la recta
  // y se paga la recta (`CargaMedida.carrera`, que `medirCargas` ya vio que
  // cabe), que puede costar más que el camino más barato.
  const legal = pasoHasta(state, s, costes ?? movableFrom(state, s), to);
  const paso = carrera ?? legal;

  s.hex = to;
  // `moveTo` solo lo llama `applyAction` sobre el stack activo, así que el turno
  // es el suyo; si no lo fuera, apuntarlo en el de otro sería el fallo callado.
  if (state.turno === null || state.turno.stack !== s.id) {
    throw new Error(`${s.id} se mueve fuera de su turno`);
  }
  state.turno.gastado += paso.steps;
  // Los voladores se buscan sin bloqueos —ignoran lo que hay en medio—, así que
  // su cadena de pasos podría cruzar casillas ocupadas: su camino es el aire.
  const camino = caminoDe(paso);
  const path = hasTrait(s.unit, 'flying') ? [to] : camino;
  state.log.push({
    kind: 'move',
    stack: s.id,
    to,
    path,
    // La carrera de una carga ya se anima corriendo; si no, corre el tramo largo.
    ...(carrera !== undefined
      ? { charge: true }
      : seCorre(s, camino.length)
        ? { corre: true }
        : {}),
  });
}

/**
 * Si un tramo de `casillas` de `s` se anda corriendo: de más de la mitad de su
 * movimiento máximo (`stackSpeed`, con lo que le sume o reste un efecto); con la
 * mitad o menos, caminando (requisito 2 del 25-10-2026). **Solo se ve**: lo lee el
 * lienzo en el `move` (`corre`), y la regla de la carga no cambia. Las casillas son
 * las que pisa, también las del volador, que su `path` no lleva.
 */
function seCorre(s: BattleStack, casillas: number): boolean {
  return 2 * casillas > stackSpeed(s);
}

/** Cuelga un efecto del stack y lo cuenta en el registro. */
function applyStackEffect(state: BattleState, target: BattleStack, effect: StackEffect): void {
  // Lo que se anota es el efecto YA colgado, no el que se pidió: si refrescó a
  // uno del mismo origen, las rondas que se leen en el parte son las que de
  // verdad le quedan.
  const vivo = applyEffect(target, effect);
  state.log.push({
    kind: 'effect',
    stack: target.id,
    effect: vivo.kind,
    amount: esCifraDeEfecto(vivo.kind) && 'amount' in vivo ? vivo.amount : 0,
    ...(esCifraDeEfecto(vivo.kind) ? {} : { dicho: dichoDelEfecto(vivo) }),
    source: vivo.source,
    rounds: vivo.roundsLeft,
    ...(vivo.hasta === undefined ? {} : { vence: vivo.hasta.al }),
    ...(vivo.hasta?.de === undefined ? {} : { turnoDe: vivo.hasta.de }),
  });
}

/**
 * Por qué `target` no devolverá el golpe de `attacker`, o `null` si lo devolverá
 * (si sigue en pie): uno por ronda, si quien pega lo permite y si lo alcanza. La
 * leen el golpe (`melee`) y la previsión (`previsionDe`, la de la rueda), que no
 * puede prometer un contraataque que no llega.
 */
function contraataqueBlocker(
  state: BattleState,
  attacker: BattleStack,
  target: BattleStack,
): string | null {
  if (target.retaliated) return `${target.unit.name} ya devolvió un golpe esta ronda`;
  const impedido = impedimentoBlocker(state, target, 'contraatacar');
  if (impedido !== null) return impedido;
  if (hasTrait(attacker.unit, 'no_retaliation')) {
    return `a ${attacker.unit.name} no se le devuelve el golpe`;
  }
  if (!canReachMelee(state, target, attacker)) {
    return `${target.unit.name} no alcanza a ${attacker.unit.name} desde donde está`;
  }
  return null;
}

function devolveraElGolpe(state: BattleState, attacker: BattleStack, target: BattleStack): boolean {
  return contraataqueBlocker(state, attacker, target) === null;
}

/**
 * El cruce del golpe de `s` a `target` (ya validado por `cruceBlocker`), escrito
 * en el registro.
 */
function cruceDeLaRueda(
  state: BattleState,
  s: BattleStack,
  target: BattleStack,
  action: BattleAction & { type: 'attack' },
): HechoDelCruce {
  const { golpe, respuesta } = action;
  if (golpe === undefined || respuesta === undefined) {
    throw new Error('cruceBlocker dejó pasar un golpe con la rueda sin sus dos elecciones');
  }
  const cruce: HechoDelCruce = {
    kind: 'cruce',
    stack: s.id,
    target: target.id,
    golpe,
    respuesta,
    punto: puntoDelCruce(golpe, respuesta, formaDeLaBatalla(state)),
  };
  state.log.push(cruce);
  return cruce;
}

/**
 * Un golpe de la rueda para el daño: su tipo y los puntos del cruce en que puede
 * caer. Quién lo eligió (el golpe, o la respuesta en el contraataque, que no da
 * bonificadores) no va aquí: se deriva de si es un contraataque (`papelDe`).
 */
interface GolpeEnLaRueda {
  readonly tipo: TipoDeGolpe;
  readonly desde: Punto;
  readonly hasta: Punto;
}

/** El golpe que se da: cae en un solo punto, el del cruce. */
function enElPunto(tipo: TipoDeGolpe, punto: Punto): GolpeEnLaRueda {
  return { tipo, desde: punto, hasta: punto };
}

/** Lo que puede dar un sector de la rueda `forma` sin saber el cruce: sus puntos posibles. */
function delSector(tipo: TipoDeGolpe, forma: FormaDeLaRueda): GolpeEnLaRueda {
  const [desde, hasta] = puntosDe(tipo, forma);
  return { tipo, desde, hasta };
}

/** Quién eligió el golpe de la rueda de un intercambio: la respuesta, si es el contraataque. */
function papelDe(retaliation: boolean): PapelEnLaRueda {
  return retaliation ? 'respuesta' : 'golpe';
}

function melee(
  state: BattleState,
  attacker: BattleStack,
  target: BattleStack,
  rng: Rng,
  carga: number,
  cruce: HechoDelCruce,
): void {
  // Lo que el golpe deja va con su arma de cuerpo a cuerpo
  // (`ruedaDelIntercambio`), contada una vez y antes de pegar: Defensivo, a quien
  // pega antes de sus golpes, que cubre ya lo que venga; Romper guardia y la
  // Finta, después. La respuesta no deja nada.
  const rueda = { ...cruce, cifras: ruedaDelIntercambio(attacker) };
  colgarDeLaRueda(state, attacker, rueda.golpe, rueda.punto, 'propio', rueda.cifras);
  intercambio(state, attacker, target, rng, false, carga, enElPunto(rueda.golpe, rueda.punto));

  // Romper guardia, tras el golpe y antes del contraataque: quita ataque al
  // atacado ya en él, y en su próximo turno (decisión del usuario, 14-10-2026).
  if (isAlive(target)) {
    colgarDeLaRueda(state, target, rueda.golpe, rueda.punto, 'rival', rueda.cifras);
  }

  // Los disparadores de un hechizo (06-11-2026): una vez por golpe, tras él y antes
  // del contraataque, como lo que deja un rasgo al golpear.
  if (isAlive(attacker)) saltar(state, attacker, 'alGolpear', target);
  if (isAlive(target)) saltar(state, target, 'alSerGolpeado', attacker);

  // Contraataque: uno por ronda, y solo si el atacante lo permite.
  if (isAlive(target) && isAlive(attacker) && devolveraElGolpe(state, attacker, target)) {
    // El contraataque no carga: se devuelve el golpe desde donde se está, con el
    // tipo de la respuesta y en el punto contrario, sin bonificadores: solo
    // cuentan el Fuerte y el Rápido.
    target.retaliated = true;
    intercambio(
      state,
      target,
      attacker,
      rng,
      true,
      0,
      enElPunto(cruce.respuesta, puntoDelContraataque(cruce.punto)),
    );
  }

  // La Finta: el resto del turno, un tramo solo de andar con lo que le quede menos
  // lo que quita su éxito (la fusionada, la mitad de eso). Si queda en algo lo
  // decide `applyAction`.
  const efecto = efectoDelTipo(rueda.golpe, rueda.cifras);
  if (efecto.finta !== null && isAlive(attacker) && state.turno !== null) {
    state.turno.finta = casillasQueQuitaLaFinta(
      rueda.punto,
      efecto,
      pasosQueQuedan(state, attacker),
    );
  }
}

/**
 * Las cifras de la rueda del intercambio de `quien`: las de su arma de cuerpo a
 * cuerpo (`arma`), la única que golpea en la rueda (la lanza solo suma su ataque y
 * su fuerza en la carga). Lo que no es daño —Defensivo antes de golpear, Romper
 * guardia y la Finta después— se cuelga una vez por intercambio y va con ella. Lo
 * leen el golpe (`melee`, una vez), las dos previsiones y el daño de cada golpe
 * (`conElGolpe`).
 */
function ruedaDelIntercambio(quien: BattleStack): CifrasDeLaRueda {
  return ruedaDelGolpe(quien.unit, 'arma');
}

/**
 * Los golpes de `quien` a `contra` en un intercambio: el golpe o, con
 * `retaliation`, el contraataque: `golpesDe` golpes mientras `contra` siga en pie
 * (lo que el golpe de la rueda deja lo cuelga `melee`, antes y después). **La carga la cobra solo el
 * primero** (decisión del usuario, 14-10-2026): la carrera acaba en él, y el
 * segundo de Rápido o del doble golpe ya se da parado, con el arma de cuerpo a
 * cuerpo. En el juego ninguna criatura carga y pega dos veces, y el banco no se
 * mueve.
 */
function intercambio(
  state: BattleState,
  quien: BattleStack,
  contra: BattleStack,
  rng: Rng,
  retaliation: boolean,
  carga: number,
  golpe: GolpeEnLaRueda,
): void {
  const veces = golpesDe(quien.unit, golpe.tipo, retaliation);
  for (let i = 0; i < veces && isAlive(contra); i++) {
    strike(state, quien, contra, rng, retaliation, i === 0 ? carga : 0, golpe);
  }
}

/**
 * Cuelga sobre `s` el efecto de un golpe de tipo `tipo` que cayó en el punto `p`,
 * con las cifras del arma de quien pegó, `c` (`efectosDeLaRueda`), los que son para él
 * (`a`: quien pega o el atacado): dura hasta que
 * `s` empiece o termine su próximo turno (`StackEffect.hasta`, desde el de ahora)
 * con dos rondas de tope, que cubren siempre ese turno. Del mismo origen,
 * refresca: dos Romper guardia seguidos dejan el último, no la suma.
 */
function colgarDeLaRueda(
  state: BattleState,
  s: BattleStack,
  tipo: TipoDeGolpe,
  p: Punto,
  a: EfectoDeLaRueda['a'],
  c: CifrasDeLaRueda,
): void {
  for (const efecto of efectosDeLaRueda(tipo, p, c)) {
    if (efecto.a === a) applyStackEffect(state, s, deLaRueda(state, efecto));
  }
}

/**
 * El `StackEffect` de un efecto de la rueda colgado ahora: lo leen el golpe
 * (`colgarDeLaRueda`) y la previsión del contraataque, que lo cuelga en su copia.
 */
function deLaRueda(state: BattleState, efecto: EfectoDeLaRueda): StackEffect {
  const n = state.turno?.n;
  if (n === undefined) throw new Error('la rueda cuelga un efecto sin turno abierto');
  return {
    kind: efecto.kind,
    amount: efecto.amount,
    // El tipo con que se golpeó: con la de 7, el de siempre; con un fusionado, él
    // (el parte lo nombra como la rueda de la batalla).
    source: efecto.fuente,
    roundsLeft: 2,
    hasta: { turno: n, al: efecto.vence },
  };
}

/** El miedo (`fear`): ataque −2 durante 2 rondas. Ver la nota de la tabla. */
const FEAR_ATTACK_PENALTY = -2;
const FEAR_ROUNDS = 2;

/**
 * Lo que un golpe deja pegado al objetivo, según el rasgo de quien pega. El
 * segundo rasgo de este tipo es una fila más, no otro bloque igual al de al
 * lado (la maldición de la momia se fue con la suerte, 02-11-2026).
 *
 * Está aquí y no en `effects.ts` a propósito: el libro mayor de efectos no
 * tiene por qué saber que existe un dragón. Y se puede compartir
 * entre golpes porque `applyEffect` guarda una copia; si guardara este objeto,
 * `tickEffects` le iría bajando el `roundsLeft` hasta que el miedo no durase
 * nada.
 */
const ON_HIT_EFFECTS: readonly { trait: CreatureTrait; effect: StackEffect }[] = [
  // DIVERGENCIA DELIBERADA de fheroes2, decidida por el usuario: allí `fear` es
  // un aura de moral −1. Aquí no serviría de nada, porque `createBattle` fuerza
  // `morale: 0` a los no-muertos y el nigromante entero lo es: en un espejo
  // nigromante el rasgo quedaría medio muerto, que es justo el bug que se está
  // cerrando. Muerde por el ataque, que sí pasa por `effectiveAttack` y sí
  // siente un esqueleto.
  {
    trait: 'fear',
    effect: {
      kind: 'attack',
      amount: FEAR_ATTACK_PENALTY,
      roundsLeft: FEAR_ROUNDS,
      source: 'fear',
    },
  },
];

/**
 * Las opciones del daño de un golpe de `attacker` a `target` en esta batalla: lo
 * que trae el golpe (`extra`), lo alto de un muro y, con `golpe`, la rueda. Es la
 * ÚNICA forma de montarlas: la usan el golpe, el disparo, la IA y la
 * previsión.
 */
export function opcionesDeDanio(
  state: BattleState,
  attacker: BattleStack,
  target: BattleStack,
  extra: Omit<DamageOptions, ExtraDelEstado> = SIN_EXTRA,
  golpe: GolpeEnLaRueda | null = null,
  papel: PapelEnLaRueda = 'golpe',
): DamageOptions {
  const o = opcionesDelEstado(state, target, extra);
  return golpe === null ? o : conElGolpe(o, attacker.unit, golpe, papel, formaDeLaBatalla(state));
}

/**
 * Las opciones con la rueda: la única traducción del golpe a los números del
 * daño (`cruceDelGolpe`), con las cifras del arma de cuerpo a cuerpo de `quien`
 * (`ruedaDelIntercambio`: la rueda es solo del cuerpo a cuerpo). La previsión de
 * la rueda la pide sobre las mismas opciones para cada tipo, con el papel de quien
 * elige y las cifras que ya contó (`c`); el golpe, con el que le da `papelDe`.
 */
function conElGolpe(
  o: DamageOptions,
  quien: UnitInfo,
  golpe: GolpeEnLaRueda,
  papel: PapelEnLaRueda,
  forma: FormaDeLaRueda,
  c: CifrasDeLaRueda = ruedaDelGolpe(quien, 'arma'),
): DamageOptions {
  return { ...o, cruce: cruceDelGolpe(golpe.tipo, golpe.desde, golpe.hasta, papel, c, forma) };
}

/**
 * Las opciones del daño del disparo diferido de `shooter` que alcanza a
 * `alcanzado` habiendo apuntado a `at`: a distancia y con la tirada en el cuarto
 * de lo lejos que pasa la recta del centro de su casilla (`cuartoDelDisparo`,
 * `octavosHastaLaRecta`), con lo alto de un
 * muro como todo golpe (`opcionesDeDanio`). La leen el disparo, su previsión y la
 * IA.
 */
export function opcionesDelDisparo(
  state: BattleState,
  shooter: BattleStack,
  alcanzado: BattleStack,
  at: Hex,
): DamageOptions {
  return opcionesDeDanio(state, shooter, alcanzado, extraDelDisparo(shooter, alcanzado, at));
}

/** Lo que trae el disparo diferido a sus opciones (`opcionesDelDisparo`). */
function extraDelDisparo(
  shooter: BattleStack,
  alcanzado: BattleStack,
  at: Hex,
): Omit<DamageOptions, ExtraDelEstado> {
  return {
    ranged: true,
    cuarto: cuartoDelDisparo(octavosHastaLaRecta(shooter.hex, at, alcanzado.hex)),
  };
}

function opcionesDelEstado(
  state: BattleState,
  target: BattleStack,
  extra: Omit<DamageOptions, ExtraDelEstado>,
): DamageOptions {
  // Lo alto de un muro (`bonoEnLoAlto`) también sale del estado: así lo cuentan
  // a la vez el golpe, el disparo, la IA, la ficha y la previsión.
  const alto = bonoEnLoAlto(state, target);
  // La IA pide estas cientos de veces por decisión, casi siempre sin nada más:
  // entonces, siempre el mismo objeto.
  if (alto === 0) return extra;
  return { ...extra, bonoEnLoAlto: alto };
}

/**
 * Lo de `DamageOptions` que no se pide: lo pone `opcionesDeDanio` desde el estado
 * y, el `cruce`, desde el golpe de la rueda.
 */
type ExtraDelEstado = 'bonoEnLoAlto' | 'cruce';

const SIN_EXTRA: Omit<DamageOptions, ExtraDelEstado> = Object.freeze({});

/**
 * El ataque y la defensa con que pelea `s` ahora, para la ficha: los de
 * `ataqueYDefensa`, la cuenta del golpe, con `s` a los dos lados —su ataque al
 * pegar con el arma de `uso` (la de cuerpo a cuerpo si no se dice) y su defensa
 * al recibir—.
 */
export function ataqueYDefensaEnBatalla(
  state: BattleState,
  s: BattleStack,
  uso: UsoDeArma = 'arma',
): { readonly ataque: number; readonly defensa: number } {
  return ataqueYDefensa(s, s, opcionesDeDanio(state, s, s), uso);
}

function strike(
  state: BattleState,
  attacker: BattleStack,
  target: BattleStack,
  rng: Rng,
  retaliation: boolean,
  carga: number,
  golpe: GolpeEnLaRueda,
): void {
  const info = attacker.unit;
  const result = computeDamage(
    attacker,
    target,
    rng,
    opcionesDeDanio(state, attacker, target, { chargeHexes: carga }, golpe, papelDe(retaliation)),
  );
  const herida = herir(target, result, attacker);

  state.log.push({
    kind: 'attack',
    stack: attacker.id,
    target: target.id,
    damage: herida.danio,
    killed: herida.muertos,
    retaliation,
    // Lo que paró la armadura: el parte y el lienzo lo dicen.
    ...conLoParado(herida),
    // La carga la dice `computeDamage`, que es quien la cobró: preguntarlo otra
    // vez aquí dejaba el parte contando 7 hexes mientras el bono se había
    // topado en los 5 que caben en +50 %.
    ...(result.charge > 0 ? { charge: result.charge } : {}),
    // El punto de la rueda en que cayó: el golpe que se da va en uno solo.
    punto: golpe.desde,
  });

  // Los vampiros señores recuperan efectivos con lo que drenan.
  if (hasTrait(info, 'life_drain') && !retaliation) {
    // Lo que quitó de verdad, tras la armadura: no se drena lo que no llegó.
    healFromDrain(attacker, herida.danio);
  }

  // Lo que el golpe deja pegado. Va ANTES del contraataque a propósito: a quien
  // asusta (`fear`) le devuelven el golpe ya asustados, que es donde se nota.
  // Un contraataque no asusta ni maldice: solo el que ataca de verdad.
  if (!retaliation && isAlive(target)) {
    for (const { trait, effect } of ON_HIT_EFFECTS) {
      if (hasTrait(info, trait)) applyStackEffect(state, target, effect);
    }
  }

  if (!isAlive(target)) anotarLaMuerte(state, target);
}

/**
 * El campo `parado` de un hecho de daño: lo que paró la armadura, solo si paró
 * algo. Sin armadura el hecho sale con los campos de siempre (el banco hashea el
 * registro).
 */
function conLoParado(h: { readonly parado: number }): { parado?: number } {
  return h.parado > 0 ? { parado: h.parado } : {};
}

function healFromDrain(s: BattleStack, damage: number): void {
  const info = s.unit;
  const maxHp = info.hp;
  const currentTotal = (s.count - 1) * maxHp + s.topHp;
  const healed = Math.min(currentTotal + damage, maxHp * s.count);
  s.topHp = healed - (s.count - 1) * maxHp;
}

/**
 * Sale el disparo diferido de `shooter` (lo que apuntó en su turno anterior,
 * `BattleStack.apuntado`) y se borra: desde donde está ahora, por la recta, al
 * primero que encuentre (`lineaDelDisparo`), con la tirada en el cuarto que da lo
 * lejos que pasa la recta del centro de su casilla (`cuartoDelDisparo`); ataque contra defensa,
 * y armadura como siempre. Con `double_shot`, dos tiros, y cada uno busca
 * su primero (el segundo, si el primero cayó, sigue la recta). Lo llama solo el
 * principio de su turno (`advance`). **Regla nuestra sin validar por el usuario** (25-10-2026: sin tests hasta
 * que la juegue).
 */
function dispararLoApuntado(state: BattleState, shooter: BattleStack, rng: Rng): void {
  const at = shooter.apuntado;
  if (at === null) return;
  shooter.apuntado = null;
  // Impedido de disparar (un hechizo): lo apuntado no sale.
  if (impedidoPor(shooter, 'disparar') !== null) return;
  // El arma de fuego recarga desde este turno, que cuenta (`endTurn` lo baja al
  // cerrarlo): con recarga 1, no apunta en este y sí en el siguiente.
  shooter.recargando = recargaDe(shooter.unit);
  const shots = disparosDe(shooter.unit);
  for (let i = 0; i < shots && state.finished === null; i++) {
    const { alcanzado } = lineaDelDisparo(state, shooter, at);
    if (alcanzado === null) {
      state.log.push({ kind: 'shoot', stack: shooter.id, at, target: null, damage: 0, killed: 0 });
      continue;
    }
    const result = computeDamage(
      shooter,
      alcanzado,
      rng,
      opcionesDelDisparo(state, shooter, alcanzado, at),
    );
    // El arma de fuego perfora la armadura (`DamageResult.perfora`).
    herirYContar(state, alcanzado, result, shooter, (h) => ({
      kind: 'shoot',
      stack: shooter.id,
      at,
      target: alcanzado.id,
      damage: h.danio,
      killed: h.muertos,
      ...conLoParado(h),
    }));

    // La salpicadura reparte el golpe del disparo, no lo que llegó: cada salpicado
    // resta su propia armadura (`herir`), salvo si el disparo perfora.
    if (hasTrait(shooter.unit, 'splash_shot')) splash(state, shooter, alcanzado, at, result);
    checkFinished(state);
  }
}

/**
 * Explota la granada que lanzó `s` en su turno anterior (`BattleStack.granada`) y se
 * borra: a todo vivo de la casilla y de sus seis vecinas, de cualquier bando
 * (`explosionDe`), cada uno con la tirada en su cuarto, sin dado, y su armadura
 * restada (`herir`). Un hecho `blast` por alcanzado, o uno sin nadie. Lo llama solo
 * el principio de su turno (`alEmpezarSuTurno`). **Regla nuestra** (02-11-2026).
 */
function explotarLaGranada(state: BattleState, s: BattleStack, rng: Rng): void {
  const at = s.granada;
  if (at === null || state.finished !== null) return;
  s.granada = null;
  // Impedido de disparar (un hechizo): la granada no explota.
  if (impedidoPor(s, 'disparar') !== null) return;
  const { alcanzados } = explosionDe(state, at);
  if (alcanzados.length === 0) {
    state.log.push({
      kind: 'blast',
      stack: s.id,
      at,
      target: null,
      damage: 0,
      killed: 0,
      cuarto: 0,
    });
    return;
  }
  // Todos con el tablero de antes de la explosión: el daño de cada uno no depende de
  // a quién le tocó antes.
  const golpes = alcanzados.map(({ stack, cuarto }) => ({
    stack,
    cuarto,
    result: computeDamage(s, stack, rng, opcionesDeLaGranada(state, s, stack, cuarto)),
  }));
  for (const { stack, cuarto, result } of golpes) {
    herirYContar(state, stack, result, s, (h) => ({
      kind: 'blast',
      stack: s.id,
      at,
      target: stack.id,
      damage: h.danio,
      killed: h.muertos,
      cuarto,
      ...conLoParado(h),
    }));
  }
  checkFinished(state);
}

/**
 * A quién alcanza la salpicadura de un disparo de `shooter` sobre `target`: todo
 * lo vivo pegado a él, **de cualquier bando**, como en el original, salvo el
 * propio tirador: con el disparo diferido puede acabar pegado a lo que alcanza
 * (alguien se le puso al lado mientras esperaba), y no se salpica.
 *
 * Está exportada porque la IA necesita la MISMA respuesta para no dispararse a
 * los suyos (`tactics.ts`). Cuando la deducía por su cuenta, el día que
 * cambiara el radio la IA habría seguido jugando con la forma vieja sin que
 * nadie se enterase.
 */
export function splashTargets(
  state: BattleState,
  shooter: BattleStack,
  target: BattleStack,
): BattleStack[] {
  // "Pegado al objetivo" y "alcanza al objetivo cuerpo a cuerpo" son la misma
  // pregunta, así que se hace con la misma función.
  return state.stacks.filter(
    (otro) =>
      otro.id !== target.id &&
      otro.id !== shooter.id &&
      isAlive(otro) &&
      canReachMelee(state, otro, target),
  );
}

/**
 * La salpicadura (el rasgo `splash`; la llevaba el liche, que se fue con
 * `data/creatures.json`). Se reparte el daño YA calculado, sin volver a
 * tirar: una tirada por disparo mantiene los tests legibles y la semilla
 * estable.
 */
function splash(
  state: BattleState,
  shooter: BattleStack,
  target: BattleStack,
  at: Hex,
  golpe: GolpeQueHiere,
): void {
  for (const otro of splashTargets(state, shooter, target)) {
    herirYContar(state, otro, golpe, shooter, (h) => ({
      kind: 'shoot',
      stack: shooter.id,
      at,
      target: otro.id,
      damage: h.danio,
      killed: h.muertos,
      ...conLoParado(h),
      splash: true,
    }));
  }
}

/**
 * Hiere a `objetivo` con `golpe` de `autor` (`herir`), escribe el hecho que da
 * `hecho` con lo que llegó y, si cae, `perished`: lo de cada disparo, salpicado y
 * alcanzado por una granada (hallazgo S8 de /simplify, 02-11-2026: eran tres copias).
 */
function herirYContar(
  state: BattleState,
  objetivo: BattleStack,
  golpe: GolpeQueHiere,
  autor: BattleStack,
  hecho: (herida: Herida) => BattleEvent,
): void {
  const herida = herir(objetivo, golpe, autor);
  state.log.push(hecho(herida));
  if (!isAlive(objetivo)) anotarLaMuerte(state, objetivo);
}

/** Se escribe una vez y se lee en dos: el bloqueador y el estrechamiento. */
const SIN_HEROE = 'este bando no tiene héroe';

// ---------------------------------------------------------------- la magia

/**
 * Quien lanza los hechizos del héroe de `side`: su cuerpo en el tablero (desde
 * él miden el contacto, el alcance y la recta: P1 del plan del editor de magia),
 * su bando y su poder mágico; `null` sin héroe o sin cuerpo.
 */
function lanzadorDelHeroe(state: BattleState, side: Side): Lanzador | null {
  const hero = state.heroes[side];
  if (hero === null) return null;
  const cuerpo = state.stacks.find((x) => x.side === side && x.origen.kind === 'heroe');
  if (cuerpo === undefined) return null;
  return { stack: cuerpo, bando: side, poder: hero.spellPower };
}

/** Una unidad que usa un hechizo como poder: sin poder mágico (P7). */
function lanzadorDeLaUnidad(s: BattleStack): Lanzador {
  return { stack: s, bando: s.side, poder: 0 };
}

/** El nombre de un hechizo de la batalla, o su id si ya no lo lleva (lo quitó la arena). */
function nombreDelHechizo(state: BattleState, id: string): string {
  return state.libro[id]?.nombre ?? id;
}

/**
 * Por qué `s` no puede hacer `que` porque se lo impide un hechizo (`impide`), con la
 * frase para la persona, o `null`. La leen los `*Blocker` de golpear, disparar,
 * contraatacar, moverse y lanzar.
 */
function impedimentoBlocker(state: BattleState, s: BattleStack, que: Impedible): string | null {
  const e = impedidoPor(s, que);
  if (e === null) return null;
  return `${s.unit.name} ${dichoDeImpide([que])} (${nombreDelHechizo(state, e.source)})`;
}

/** Lo que se apunta en una jugada: la unidad, la casilla o nada. */
function apuntadoDe(target: string | undefined, at: Hex | undefined): Apuntado {
  if (target !== undefined) return { target };
  if (at !== undefined) return { at };
  return null;
}

/**
 * Por qué `h`, lanzado por `l`, no vale sobre `apuntado`, o `null`: lo que se elige
 * (una unidad, una casilla o nada), el bando del objetivo y la distancia de la
 * entrega. Sin `apuntado`, la pregunta del botón: ¿hay sobre qué lanzarlo? Con
 * `exigeHerida` (el poder que solo cura), a quien no le falta vida no vale.
 */
function apuntadoBlocker(
  state: BattleState,
  h: Hechizo,
  l: Lanzador,
  apuntado: Apuntado | undefined,
  exigeHerida: boolean,
): string | null {
  const que = queSeApunta(h);
  if (que === 'nada') {
    if (apuntado != null)
      return `«${h.nombre}» no se apunta: va ${h.entrega.tipo === 'sobreSi' ? 'sobre quien lo lanza' : 'a todo el tablero'}`;
    return null;
  }
  if (apuntado === undefined) {
    if (que === 'casilla') return null;
    return state.stacks.some((t) => unidadBlocker(h, l, t, exigeHerida) === null)
      ? null
      : exigeHerida && soloCura(h)
        ? 'nadie de su bando tiene ninguna herida'
        : 'no hay ningún objetivo válido';
  }
  if (que === 'unidad') {
    if (apuntado === null || !('target' in apuntado)) return `«${h.nombre}» se lanza a una unidad`;
    const target = state.stacks.find((t) => t.id === apuntado.target);
    if (target === undefined) return `no hay ninguna unidad "${apuntado.target}"`;
    return unidadBlocker(h, l, target, exigeHerida);
  }
  if (apuntado === null || !('at' in apuntado)) return `«${h.nombre}» se lanza a una casilla`;
  const at = apuntado.at;
  if (!isInside(at)) return `(${at.col},${at.row}) no es una casilla del tablero`;
  if (h.entrega.tipo === 'proyectil' && hexEquals(at, l.stack.hex)) {
    return `«${h.nombre}» no se lanza a la casilla de quien lo lanza: no habría recta`;
  }
  return distanciaBlocker(h, l, at);
}

/** Por qué `t` no vale como la unidad elegida, o `null`: bando, vida, distancia y herida. */
function unidadBlocker(
  h: Hechizo,
  l: Lanzador,
  t: BattleStack,
  exigeHerida: boolean,
): string | null {
  const objetivo = objetivoDelHechizoBlocker(h, l.bando, t);
  if (objetivo !== null) return objetivo;
  const lejos = distanciaBlocker(h, l, t.hex);
  if (lejos !== null) return lejos;
  if (exigeHerida && soloCura(h) && curaDelHechizo(h, l.poder, t) <= 0) {
    return `${t.unit.name} no tiene ninguna herida`;
  }
  return null;
}

/** Por qué `at` está fuera del alcance de la entrega de `h` desde `l`, o `null`. */
function distanciaBlocker(h: Hechizo, l: Lanzador, at: Hex): string | null {
  const e = h.entrega;
  const d = hexDistance(l.stack.hex, at);
  if (e.tipo === 'contacto' && d > 1) {
    return `«${h.nombre}» se lanza en contacto, y eso está a ${d} casillas de ${l.stack.unit.name}`;
  }
  const tope = e.tipo === 'alcance' ? e.casillas : e.tipo === 'proyectil' ? e.casillas : undefined;
  if (tope !== undefined && d > tope) {
    return `«${h.nombre}» llega a ${tope} ${tope === 1 ? 'casilla' : 'casillas'}, y eso está a ${d}`;
  }
  return null;
}

/** El punto de impacto y los vivos que alcanza `h` lanzado por `l` sobre `apuntado`, ahora. */
function afectadosDe(
  state: BattleState,
  h: Hechizo,
  l: Lanzador,
  apuntado: Apuntado,
): readonly BattleStack[] {
  const afecta = h.afecta ?? 'todos';
  const area = areaDe(h);
  const vivosEn = (casillas: readonly Hex[], sin: BattleStack | null): BattleStack[] =>
    casillas.flatMap((c) => {
      const t = vivoEn(state, c);
      return t !== null && t !== sin && loAlcanza(afecta, l.bando, t.side) ? [t] : [];
    });
  const alrededor = (centro: Hex): BattleStack[] =>
    vivosEn(casillasDelArea(centro, typeof area === 'number' ? area : 0), null);
  switch (h.entrega.tipo) {
    case 'tablero':
      return state.stacks.filter((t) => isAlive(t) && loAlcanza(afecta, l.bando, t.side));
    case 'sobreSi':
      return area === 0 ? [l.stack] : alrededor(l.stack.hex);
    case 'proyectil': {
      if (apuntado === null || !('at' in apuntado)) return [];
      const linea = lineaDelDisparo(state, l.stack, apuntado.at);
      const tope = h.entrega.casillas;
      const dentro = (c: Hex): boolean => tope === undefined || hexDistance(l.stack.hex, c) <= tope;
      if (area === 'recta') return vivosEn(linea.alcance.map((c) => c.hex).filter(dentro), l.stack);
      const quien = linea.alcanzado;
      if (quien === null || !dentro(quien.hex)) return [];
      if (area === 0) return loAlcanza(afecta, l.bando, quien.side) ? [quien] : [];
      return alrededor(quien.hex);
    }
    default: {
      if (apuntado === null) return [];
      if ('at' in apuntado) return alrededor(apuntado.at);
      const t = stackById(state, apuntado.target);
      return area === 0 ? [t] : alrededor(t.hex);
    }
  }
}

/** Lo que hizo un hechizo (o un disparador) a uno: el daño, lo parado y la cura. */
interface LoQueHizo {
  damage: number;
  killed: number;
  parado: number;
  cura: number;
}

/** Lo común de lo que cuelga un hechizo, sin el afectado. */
interface ContextoDelHechizo {
  readonly source: string;
  readonly bando: Side;
  /** El stack que lo lanzó: cobra la experiencia del daño y cierra «turnoDe: lanzador». */
  readonly lanzador: BattleStack | null;
  readonly lanzadorId: string;
  /** Quien lleva el disparador que lo lanzó, si es un disparador. */
  readonly portador?: string;
  readonly poder: number;
  readonly duracion: Duracion | null;
  readonly seAcabaSiMuere?: string;
}

/**
 * Lo que se hace en el acto de `efectos` sobre `t`: el daño (`herir`, con o sin la
 * armadura), la cura (sin pasar de la vida del de arriba, `curaDe`) y `disipar`.
 */
function enElActo(
  state: BattleState,
  efectos: readonly (EfectoResuelto | DisparadorResuelto)[],
  ctx: ContextoDelHechizo,
  t: BattleStack,
): LoQueHizo {
  const hizo: LoQueHizo = { damage: 0, killed: 0, parado: 0, cura: 0 };
  for (const e of efectos) {
    if ('cuando' in e || !isAlive(t)) continue;
    if (e.tipo === 'danio') {
      const h = herir(t, { damage: e.cantidad, perfora: !e.armadura }, ctx.lanzador);
      hizo.damage += h.danio;
      hizo.killed += h.muertos;
      hizo.parado += h.parado;
    } else if (e.tipo === 'cura') {
      const c = curaDe(e.cantidad, t);
      t.topHp += c;
      hizo.cura += c;
    } else if (e.tipo === 'disipar') {
      disipar(state, t, e.de);
    }
  }
  return hizo;
}

/** Quita de `t` los efectos de hechizo que dice `de` (relativo a su bando), y los anota. */
function disipar(state: BattleState, t: BattleStack, de: 'contrarios' | 'propios' | 'todos'): void {
  const vaFuera = (e: StackEffect): boolean =>
    e.bando !== undefined && (de === 'todos' || (de === 'propios') === (e.bando === t.side));
  const fuera = t.effects.filter(vaFuera);
  if (fuera.length === 0) return;
  t.effects = t.effects.filter((e) => !vaFuera(e));
  for (const e of fuera) state.log.push({ kind: 'effect_end', stack: t.id, source: e.source });
}

/**
 * Cuelga de `t` lo que dura de `efectos`, con la duración del contexto, y salta en
 * el acto los disparadores que lo piden (`yAlLanzarse`, el pulso de un aura). Lo
 * que dura en un muerto no se cuelga.
 */
function colgarLoQueDura(
  state: BattleState,
  efectos: readonly (EfectoResuelto | DisparadorResuelto)[],
  ctx: ContextoDelHechizo,
  t: BattleStack,
  cargas: (d: DisparadorResuelto) => number | null,
): void {
  if (!isAlive(t) || ctx.duracion === null) return;
  const dura = cuantoDura(ctx.duracion, ctx.poder, state.turno?.n ?? 0, {
    afectado: t.id,
    lanzador: ctx.lanzadorId,
    ...(ctx.portador === undefined ? {} : { portador: ctx.portador }),
  });
  const comun = {
    source: ctx.source,
    bando: ctx.bando,
    ...dura,
    ...(ctx.seAcabaSiMuere === undefined ? {} : { seAcabaSiMuere: ctx.seAcabaSiMuere }),
  };
  for (const e of efectos) {
    const colgado = efectoColgado(e, comun, 'cuando' in e ? cargas(e) : null);
    if (colgado === null) continue;
    applyStackEffect(state, t, colgado);
    if ('cuando' in e && e.yAlLanzarse) {
      const vivo = t.effects.find((x) => x.kind === 'disparador' && x.source === ctx.source);
      if (vivo !== undefined && vivo.kind === 'disparador') saltarUno(state, t, vivo, null);
    }
  }
}

/** Los efectos de `h` resueltos con el poder de `l`, y las cargas de sus disparadores. */
function resueltosDe(
  h: Hechizo,
  l: Lanzador,
): {
  readonly efectos: readonly (EfectoResuelto | DisparadorResuelto)[];
  readonly cargas: (d: DisparadorResuelto) => number | null;
} {
  const conCargas = new Map<DisparadorResuelto, number | null>();
  const efectos = h.efectos.map((e) => {
    if (e.tipo !== 'disparador') return resolverEfecto(e, l.poder);
    const d = resolverDisparador(e, l.poder, l.stack.id);
    conCargas.set(d, e.cargas ?? null);
    return d;
  });
  return { efectos, cargas: (d) => conCargas.get(d) ?? null };
}

/** El contexto de `h` lanzado por `l`. */
function contextoDe(h: Hechizo, l: Lanzador): ContextoDelHechizo {
  return {
    source: h.id,
    bando: l.bando,
    lanzador: l.stack,
    lanzadorId: l.stack.id,
    poder: l.poder,
    duracion: h.duracion ?? null,
    ...(h.seAcabaSiMuere === 'lanzador' ? { seAcabaSiMuere: l.stack.id } : {}),
  };
}

/**
 * Lanza `h` con `l` sobre `apuntado` (ya validado por su `*Blocker`): **la única
 * aplicación de un hechizo**, del héroe y del poder de una unidad. Lo diferido se
 * queda en el aire (`hechizoEnElAire`) y cae al empezar el siguiente turno del
 * lanzador (`caerElHechizo`). A una sola unidad elegida, el hecho de quien lanza
 * (`hecho`) lleva lo que le hizo, como siempre; si va a una casilla, al tablero o
 * alcanza a varios, un `spell_hit` por alcanzado.
 */
function lanzarHechizo(
  state: BattleState,
  h: Hechizo,
  l: Lanzador,
  apuntado: Apuntado,
  hecho: (hizo: LoQueHizo | null) => BattleEvent,
): void {
  if (esDiferido(h)) {
    if (apuntado === null || !('at' in apuntado)) throw new Error('lo diferido va a una casilla');
    l.stack.hechizoEnElAire = { hechizo: h.id, at: apuntado.at, poder: l.poder };
    state.log.push({ ...hecho(null), diferido: true } as BattleEvent);
    return;
  }
  const afectados = afectadosDe(state, h, l, apuntado);
  if (queSeApunta(h) === 'unidad' && areaDe(h) === 0) {
    // A una sola unidad: el hecho de siempre, con lo que le hizo.
    const [t] = afectados;
    if (t === undefined) throw new Error('una unidad elegida sin unidad');
    const { efectos, cargas } = resueltosDe(h, l);
    const ctx = contextoDe(h, l);
    state.log.push(hecho(enElActo(state, efectos, ctx, t)));
    colgarLoQueDura(state, efectos, ctx, t, cargas);
    if (!isAlive(t)) anotarLaMuerte(state, t);
    checkFinished(state);
    return;
  }
  state.log.push(hecho(null));
  aplicarAVarios(state, h, l, afectados);
}

/** Aplica `h` a cada uno de `afectados`, con un `spell_hit` por alcanzado. */
function aplicarAVarios(
  state: BattleState,
  h: Hechizo,
  l: Lanzador,
  afectados: readonly BattleStack[],
): void {
  const { efectos, cargas } = resueltosDe(h, l);
  const ctx = contextoDe(h, l);
  for (const t of afectados) {
    if (!isAlive(t)) continue;
    const hizo = enElActo(state, efectos, ctx, t);
    state.log.push(golpeDeHechizo(h.id, t, hizo));
    colgarLoQueDura(state, efectos, ctx, t, cargas);
  }
  for (const t of afectados) if (!isAlive(t) && !yaAnotado(state, t)) anotarLaMuerte(state, t);
  checkFinished(state);
}

/** El hecho de lo que un hechizo le hizo a uno de varios. */
function golpeDeHechizo(spell: string, t: BattleStack, hizo: LoQueHizo): BattleEvent {
  return {
    kind: 'spell_hit',
    spell,
    stack: t.id,
    damage: hizo.damage,
    killed: hizo.killed,
    ...conLoParado(hizo),
    ...(hizo.cura > 0 ? { cura: hizo.cura } : {}),
  };
}

/** Si la muerte de `t` ya está en el registro (un disparador `alMorir` puede llegar antes). */
function yaAnotado(state: BattleState, t: BattleStack): boolean {
  return state.log.some((e) => e.kind === 'perished' && e.stack === t.id);
}

/**
 * Cae el hechizo diferido que lanzó `s` en su turno anterior (`hechizoEnElAire`) y se
 * borra: desde donde está ahora, sobre la casilla que eligió. Lo llama solo el
 * principio de su turno (`alEmpezarSuTurno`).
 */
function caerElHechizo(state: BattleState, s: BattleStack, _rng: Rng): void {
  const e = s.hechizoEnElAire;
  if (e === null || state.finished !== null) return;
  s.hechizoEnElAire = null;
  const h = state.libro[e.hechizo] ?? HECHIZOS_DEL_JUEGO.get(e.hechizo);
  if (h === undefined) return;
  const l: Lanzador = { stack: s, bando: s.side, poder: e.poder };
  aplicarAVarios(state, h, l, afectadosDe(state, h, l, { at: e.at }));
}

/**
 * Saltan los disparadores de `portador` de la clase `cuando` (`otro`, quien le
 * golpeó o a quien golpeó). Lo llaman el principio y el final de su turno, el
 * golpe cuerpo a cuerpo (`melee`) y su muerte (`anotarLaMuerte`).
 */
function saltar(
  state: BattleState,
  portador: BattleStack,
  cuando: CuandoSalta,
  otro: BattleStack | null,
): void {
  for (const e of disparadoresDe(portador, cuando)) {
    if (state.finished !== null) return;
    // Uno que ya se quitó (cargas, una muerte) no salta.
    if (!portador.effects.includes(e)) continue;
    saltarUno(state, portador, e, otro);
  }
}

/** Salta un disparador colgado de `portador`. */
function saltarUno(
  state: BattleState,
  portador: BattleStack,
  e: StackEffect & { kind: 'disparador' },
  otro: BattleStack | null,
): void {
  const d = e.disparador;
  const bando = e.bando ?? portador.side;
  const objetivos =
    d.a === 'portador'
      ? isAlive(portador)
        ? [portador]
        : []
      : d.a === 'otro'
        ? otro !== null && isAlive(otro)
          ? [otro]
          : []
        : casillasDelArea(portador.hex, d.radio).flatMap((c) => {
            const t = vivoEn(state, c);
            return t !== null && t !== portador && loAlcanza(d.afecta, bando, t.side) ? [t] : [];
          });
  state.log.push({ kind: 'triggered', stack: portador.id, spell: e.source, cuando: d.cuando });
  const lanzador = state.stacks.find((x) => x.id === d.lanzador) ?? null;
  const ctx: ContextoDelHechizo = {
    source: e.source,
    bando,
    lanzador,
    lanzadorId: d.lanzador,
    portador: portador.id,
    poder: d.poder,
    duracion: d.duracion,
    ...(d.seAcabaSiMuere === null
      ? {}
      : { seAcabaSiMuere: d.seAcabaSiMuere === 'portador' ? portador.id : d.lanzador }),
  };
  for (const t of objetivos) {
    const hizo = enElActo(state, d.efectos, ctx, t);
    if (d.efectos.some((x) => x.tipo === 'danio' || x.tipo === 'cura')) {
      state.log.push(golpeDeHechizo(e.source, t, hizo));
    }
    colgarLoQueDura(state, d.efectos, ctx, t, () => null);
  }
  if (e.cargas !== null) {
    e.cargas -= 1;
    if (e.cargas <= 0 && portador.effects.includes(e)) {
      portador.effects = portador.effects.filter((x) => x !== e);
      state.log.push({ kind: 'effect_end', stack: portador.id, source: e.source });
    }
  }
  for (const t of objetivos) if (!isAlive(t) && !yaAnotado(state, t)) anotarLaMuerte(state, t);
  checkFinished(state);
}

/**
 * La muerte de `s`, **la única escritura de `perished`**: se anota, se va con él lo
 * que dejó con «se acaba si muere» (de cualquier stack), se pierde su hechizo en el
 * aire y saltan sus disparadores `alMorir`. Lo vigila `invariantes.test.ts`.
 */
function anotarLaMuerte(state: BattleState, s: BattleStack): void {
  state.log.push({ kind: 'perished', stack: s.id });
  s.hechizoEnElAire = null;
  for (const x of state.stacks) {
    const fuera = x.effects.filter((e) => e.seAcabaSiMuere === s.id);
    if (fuera.length === 0) continue;
    x.effects = x.effects.filter((e) => e.seAcabaSiMuere !== s.id);
    for (const e of fuera) state.log.push({ kind: 'effect_end', stack: x.id, source: e.source });
  }
  saltar(state, s, 'alMorir', null);
}

/**
 * Motivo por el que el héroe de `side` no puede lanzar `spellId` —sobre la unidad
 * `targetId` o la casilla `at` si se apunta a algo—, o `null` si sí puede. Mismo
 * patrón que `buildBlocker` en `town.ts`: la frase la escribe el núcleo y la
 * pantalla la enseña tal cual. Es la ÚNICA redacción de estas reglas: la consultan
 * el lanzamiento y `legalActions` al ofrecer.
 *
 * Sin objetivo la pregunta es «¿puede lanzarlo?» (un hechizo sobre sí o al tablero
 * no se apunta: es la respuesta entera); con objetivo, «¿sobre eso?».
 */
export function castBlocker(
  state: BattleState,
  side: Side,
  spellId: string,
  targetId?: string,
  at?: Hex,
): string | null {
  const hero = state.heroes[side];
  if (hero === null) return SIN_HEROE;
  const porLaFase = faseBlocker(state, 'cast');
  if (porLaFase !== null) return porLaFase;
  if (hero.castThisRound) return 'el héroe ya lanzó un hechizo esta ronda';
  // El id se comprueba contra el libro ANTES de buscarlo en el catálogo: con un
  // id inventado, "no lo conoce" es más cierto y más útil que reventar.
  if (!hero.spells.includes(spellId)) return `el héroe no conoce "${spellId}"`;
  const h = hechizoDeLaBatalla(state, spellId);
  if (hero.mana < h.mana) return `maná insuficiente: cuesta ${h.mana} y quedan ${hero.mana}`;
  const l = lanzadorDelHeroe(state, side);
  if (l === null) return 'el héroe no está en el tablero';
  const impedido = impedimentoBlocker(state, l.stack, 'lanzar');
  if (impedido !== null) return impedido;
  const pregunta = targetId === undefined && at === undefined;
  return apuntadoBlocker(state, h, l, pregunta ? undefined : apuntadoDe(targetId, at), false);
}

function castHeroSpell(
  state: BattleState,
  side: Side,
  spellId: string,
  targetId: string | undefined,
  at: Hex | undefined,
): void {
  // El nulo se comprueba aquí, y no solo dentro del bloqueador, porque el
  // estrechamiento no cruza la llamada. El motivo sigue escrito una sola vez.
  const hero = state.heroes[side];
  if (hero === null) throw new Error(`no se puede lanzar: ${SIN_HEROE}`);
  const blocker = castBlocker(state, side, spellId, targetId, at);
  if (blocker !== null) throw new Error(`no se puede lanzar: ${blocker}`);
  const h = hechizoDeLaBatalla(state, spellId);
  if (queSeApunta(h) !== 'nada' && targetId === undefined && at === undefined) {
    throw new Error(`«${h.nombre}» necesita un objetivo`);
  }
  const l = lanzadorDelHeroe(state, side);
  if (l === null) throw new Error('castBlocker dejó lanzar sin el cuerpo del héroe');

  hero.mana -= h.mana;
  hero.castThisRound = true;
  // El cuerpo del héroe es quien cobra la experiencia del hechizo (`lanzarHechizo`).
  lanzarHechizo(state, h, l, apuntadoDe(targetId, at), (hizo) => ({
    kind: 'cast',
    side,
    spell: spellId,
    ...(targetId === undefined ? {} : { target: targetId }),
    ...(at === undefined ? {} : { at }),
    ...(hizo === null ? {} : { damage: hizo.damage, killed: hizo.killed, ...conLoParado(hizo) }),
  }));
}

// ---------------------------------------------------------------- poderes

/**
 * Por qué la unidad activa no puede usar el poder `poderId` (un hechizo de su
 * `UnitInfo.poderes`) —sobre `targetId` o `at` si se apunta—, o `null` si puede. La
 * ÚNICA redacción de estas reglas, como `castBlocker` para el héroe: la leen
 * `applyAction`, `legalActions` (y con ella la IA), la previsión y los botones.
 *
 * Reglas nuestras: al principio del turno, sin haberse movido, como disparar, y
 * usarlo es el turno entero; sin maná (P7). Un poder que solo cura no vale sobre
 * quien no tiene herida. Sin objetivo la pregunta es «¿puede usarlo?».
 */
export function poderBlocker(
  state: BattleState,
  poderId: PoderId,
  targetId?: string,
  at?: Hex,
): string | null {
  const previo = previoDelPoder(state, poderId);
  if ('motivo' in previo) return previo.motivo;
  const { s, h } = previo;
  const pregunta = targetId === undefined && at === undefined;
  return apuntadoBlocker(
    state,
    h,
    lanzadorDeLaUnidad(s),
    pregunta ? undefined : apuntadoDe(targetId, at),
    true,
  );
}

/**
 * Lo que no depende del objetivo, una vez: que le toque a alguien, que la activa
 * lo sepa, que no se haya movido y que nada se lo impida. Lo leen `poderBlocker` y
 * `legalActions`.
 */
function previoDelPoder(
  state: BattleState,
  poderId: PoderId,
): { readonly motivo: string } | { readonly s: BattleStack; readonly h: Hechizo } {
  const s = activeStack(state);
  if (s === null || state.finished !== null) return { motivo: 'no le toca a ninguna unidad' };
  const porLaFase = faseBlocker(state, 'power');
  if (porLaFase !== null) return { motivo: porLaFase };
  // Un id inventado se dice, no revienta: llega de fuera (un test, el arnés).
  const h = state.libro[poderId] ?? HECHIZOS_DEL_JUEGO.get(poderId);
  if (h === undefined || !(s.unit.poderes ?? []).includes(poderId)) {
    return { motivo: `${s.unit.name} no sabe «${h?.nombre ?? poderId}»` };
  }
  if (seHaMovido(state, s)) {
    return { motivo: `ya se ha movido este turno: «${h.nombre}» se usa al principio del turno` };
  }
  const impedido = impedimentoBlocker(state, s, 'lanzar');
  if (impedido !== null) return { motivo: impedido };
  return { s, h };
}

/** Usa el poder: el hechizo con la unidad de lanzador, y cierra su turno. */
function usarElPoder(
  state: BattleState,
  s: BattleStack,
  action: BattleAction & { type: 'power' },
  rng: Rng,
): void {
  const motivo = poderBlocker(state, action.poder, action.target, action.at);
  if (motivo !== null) throw new Error(`${s.unit.name} no puede usar ese poder: ${motivo}`);
  const h = hechizoDeLaBatalla(state, action.poder);
  if (queSeApunta(h) !== 'nada' && action.target === undefined && action.at === undefined) {
    throw new Error(`«${h.nombre}» necesita un objetivo`);
  }
  const cura = h.efectos.some((e) => e.tipo === 'cura');
  lanzarHechizo(state, h, lanzadorDeLaUnidad(s), apuntadoDe(action.target, action.at), (hizo) => ({
    kind: 'power',
    stack: s.id,
    poder: action.poder,
    ...(action.target === undefined ? {} : { target: action.target }),
    ...(action.at === undefined ? {} : { at: action.at }),
    ...(hizo !== null && cura ? { cura: hizo.cura } : {}),
  }));
  if (state.finished === null) endTurn(state, s, rng);
}

/**
 * Las jugadas de lanzar `h` que se ofrecen (`legalActions`): sin apuntar, a cada
 * unidad que vale, o a la casilla de cada vivo que vale (vale cualquier casilla a
 * su alcance, y la prosa del agente lo dice). `vale` es el `*Blocker` de quien lo
 * lanza con el objetivo.
 */
function jugadasDeLanzar(
  state: BattleState,
  h: Hechizo,
  vale: (target?: string, at?: Hex) => boolean,
): readonly { target?: string; at?: Hex }[] {
  switch (queSeApunta(h)) {
    case 'nada':
      return vale() ? [{}] : [];
    case 'unidad':
      return state.stacks.flatMap((t) => (vale(t.id) ? [{ target: t.id }] : []));
    case 'casilla':
      return state.stacks.flatMap((t) =>
        isAlive(t) && vale(undefined, t.hex) ? [{ at: t.hex }] : [],
      );
  }
}

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

// ---------------------------------------------------------------- previsión

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

// ---------------------------------------------------------------- escalas

/**
 * Por qué la unidad activa no puede poner su escalera contra el muro `muro`, o
 * `null` si puede. La escribe el núcleo; la leen `legalActions` y `applyAction`.
 */
export function escaleraBlocker(state: BattleState, muro: Hex): string | null {
  return escalaDeLaActiva(state, 'poner_escalera', muro);
}

/**
 * Por qué la unidad activa no puede subir al muro `muro`, o `null` si puede:
 * por una escalera puesta en su pie contra ese muro, o porque sabe escalar.
 */
export function subirBlocker(state: BattleState, muro: Hex): string | null {
  return escalaDeLaActiva(state, 'subir', muro);
}

/**
 * Por qué la unidad activa no puede `tipo` contra ningún muro de su pie, o
 * `null` si puede contra alguno. Es la frase del botón («Poner escalera»,
 * «Subir»), que no sabe aún contra qué muro: ese lo elige el clic. Sale de lo
 * que ofrece la lista (`escalasA`); si no ofrece nada, el motivo es el del
 * muro que más dice (`muroQueMasDice`), o el de ninguno.
 */
export function escalaBlocker(state: BattleState, tipo: TipoDeEscala): string | null {
  const s = activeStack(state);
  if (s === null || state.finished !== null) return 'no le toca a ninguna unidad';
  const porLaFase = faseBlocker(state, tipo);
  if (porLaFase !== null) return porLaFase;
  if (!hayMuralla(state.muralla)) return 'no hay muralla';
  if (escalasA(state, s).some((a) => a.type === tipo)) return null;
  return escalaDesde(state, s, tipo, s.hex, muroQueMasDice(state, s.hex), seHaMovido(state, s));
}

/**
 * De los muros del pie, aquel cuyo motivo dice algo de lo que se ve: el de una
 * escalera puesta desde este pie, si la hay. Con el primero de `neighbours`, el
 * lancero al pie de una escalera cuyo muro estaba ocupado leía «no hay escalera
 * puesta ahí» con la escalera dibujada a su lado (QA de la muralla alta, I2).
 * Lo que no depende del muro (bando, tamaño, haberse movido, llevarla) sale
 * igual con cualquiera; y con el rasgo `escalar` el único motivo de un muro es
 * quién lo ocupa, que vale el del primero.
 */
function muroQueMasDice(state: BattleState, pie: Hex): Hex | null {
  const muros = murosAlPie(state, pie);
  const conEscalera = muros.find((m) =>
    state.escaleras.some((e) => hexEquals(e.pie, pie) && hexEquals(e.muro, m)),
  );
  return conEscalera ?? muros[0] ?? null;
}

function escalaDeLaActiva(state: BattleState, tipo: TipoDeEscala, muro: Hex): string | null {
  const s = activeStack(state);
  if (s === null || state.finished !== null) return 'no le toca a ninguna unidad';
  const porLaFase = faseBlocker(state, tipo);
  if (porLaFase !== null) return porLaFase;
  return escalaDesde(state, s, tipo, s.hex, muro, seHaMovido(state, s));
}

/**
 * Por qué `s`, con los pies en `pie`, no puede `tipo` contra `muro`, o `null`
 * si puede. LA regla de la escala: la leen los motivos de la activa, la lista
 * de acciones y la IA, que pregunta desde los pies a los que podría ir
 * (`piesDeSubida`, con `movido = false`). Con `muro = null`, el motivo de no
 * tener ningún muro al pie.
 */
export function escalaDesde(
  state: BattleState,
  s: BattleStack,
  tipo: TipoDeEscala,
  pie: Hex,
  muro: Hex | null,
  movido: boolean,
): string | null {
  if (muro !== null && !esMuro(state.muralla, muro)) {
    return `en (${muro.col},${muro.row}) no hay muro`;
  }
  const quien = quienNoEscala(s.side, s.unit);
  if (quien !== null) return quien;
  if (esMuro(state.muralla, pie)) return 'ya está en lo alto';
  if (movido) return 'ya se ha movido este turno: se llega al pie y se sube en el turno siguiente';
  if (tipo === 'poner_escalera' && !s.escalera) return 'no lleva escalera';
  if (muro === null) return 'no está al pie de ningún muro';
  if (!areAdjacent(pie, muro)) return 'no está al pie de ese muro';
  const puesta = state.escaleras.some((e) => hexEquals(e.pie, pie) && hexEquals(e.muro, muro));
  if (tipo === 'poner_escalera') return puesta ? 'ahí ya hay una escalera puesta' : null;
  // Sin contarse a sí misma: desde un pie al que aún no ha ido (la IA), el muro
  // en el que está ahora queda libre en cuanto baje.
  const ocupa = state.stacks.find((o) => isAlive(o) && o.id !== s.id && hexEquals(o.hex, muro));
  if (ocupa !== undefined) return `en ese muro está ${ocupa.unit.name}`;
  const como = comoSube(s);
  if (puesta || como === 'escalando') return null;
  return como === 'con su escalera'
    ? 'no hay escalera puesta: primero hay que ponerla (un turno), y subir es el siguiente'
    : 'no hay escalera puesta ahí y no sabe escalar';
}

/**
 * Quién no escala nunca, esté donde esté: solo sube por escala el atacante que
 * no vuela. Lo leen también `createBattle`, que no le da escalera
 * a quien no podría usarla, y el montaje de la arena (`escaleraDeArenaBlocker`).
 */
export function quienNoEscala(side: Side, unit: UnitInfo): string | null {
  if (side !== 'attacker') return 'quien defiende sube a la muralla andando';
  if (hasTrait(unit, 'flying')) return 'vuela: se posa en la muralla sin escalera';
  return null;
}

/**
 * Cómo sube `s` desde un pie sin escalera puesta: escalando (rasgo `escalar`),
 * poniendo la suya, o de ninguna manera. Una escalera puesta la usa cualquiera.
 */
function comoSube(s: BattleStack): 'escalando' | 'con su escalera' | null {
  if (hasTrait(s.unit, 'escalar')) return 'escalando';
  return s.escalera ? 'con su escalera' : null;
}

/** Los muros pegados a `pie`. */
function murosAlPie(state: BattleState, pie: Hex): Hex[] {
  return neighbours(pie).filter((h) => esMuro(state.muralla, h));
}

/**
 * Las escaladas que tiene a mano la unidad activa: poner la escalera y subir,
 * contra cada muro de su pie. Sin muros, ninguna.
 */
function escalasA(state: BattleState, s: BattleStack): BattleAction[] {
  const movido = seHaMovido(state, s);
  const out: BattleAction[] = [];
  for (const muro of murosAlPie(state, s.hex)) {
    for (const type of TIPOS_DE_ESCALA) {
      if (escalaDesde(state, s, type, s.hex, muro, movido) === null) out.push({ type, muro });
    }
  }
  return out;
}

/**
 * Las jugadas de la escala, en el orden en que se ofrecen: poner antes que subir,
 * contra el mismo muro. La lista que leen la lista legal, la escena y los botones.
 */
export const TIPOS_DE_ESCALA: readonly TipoDeEscala[] = ['poner_escalera', 'subir'];

/** ¿Es `x` una jugada de la escala (`TIPOS_DE_ESCALA`)? */
export function esTipoDeEscala(x: string): x is TipoDeEscala {
  return (TIPOS_DE_ESCALA as readonly string[]).includes(x);
}

// ---------------------------------------------------------------- puertas

/**
 * Por qué la unidad activa no puede `tipo` (abrir o cerrar) la puerta `puerta`
 * —el lado entre sus dos casillas—, o `null` si puede. LA regla de la puerta: la leen `applyAction`, la
 * lista de acciones (y con ella la IA) y los botones de la arena.
 *
 * Decide quien defiende, al principio del turno de cualquier unidad suya, esté
 * donde esté: sin haberse movido, y cada puerta una vez por turno de unidad (si
 * no, abrir y cerrar sería gratis y sin fin). Lo demás que hace una unidad
 * —golpear, apuntar, terminar, escalar— cierra el turno, así que «sin
 * haberse movido» es «sin haber actuado». El hechizo es del héroe y no cuenta.
 * No se cierra con una unidad de dos casillas plantada en ella, la cabeza a un
 * lado y la cola al otro: la puerta no aplasta. Quien está en una de sus dos
 * casillas no estorba: la puerta va entre ellas, no encima.
 */
export function puertaBlocker(
  state: BattleState,
  tipo: TipoDePuerta,
  puerta: PuertaDeMuralla,
): string | null {
  const s = activeStack(state);
  const turno = state.turno;
  if (s === null || turno === null || state.finished !== null) return 'no le toca a ninguna unidad';
  const porLaFase = faseBlocker(state, tipo);
  if (porLaFase !== null) return porLaFase;
  const p = state.puertas.find((q) => mismaPuerta(q, puerta));
  if (p === undefined) return `entre ${nombreDePuerta(puerta)} no hay puerta`;
  const quien = quienNoAbre(s.side);
  if (quien !== null) return quien;
  if (seHaMovido(state, s)) {
    return 'ya se ha movido este turno: la puerta se abre o se cierra al principio del turno';
  }
  if (tipo === 'abrir_puerta' && p.abierta) return 'la puerta ya está abierta';
  if (tipo === 'cerrar_puerta' && !p.abierta) return 'la puerta ya está cerrada';
  if (p.cambiadaEn === turno.n) return 'esa puerta ya se ha abierto o cerrado en este turno';
  return null;
}

/**
 * Quién no abre ni cierra nunca una puerta, esté donde esté: solo quien defiende.
 * Como `quienNoEscala`, la leen la regla de la puerta (`puertaBlocker`) y los
 * botones, que no salen a quien nunca los podría pulsar.
 */
export function quienNoAbre(side: Side): string | null {
  return side === 'defender' ? null : 'las puertas las abre y las cierra quien defiende';
}

/**
 * Por qué la unidad activa no puede `tipo` ninguna puerta, o `null` si puede
 * alguna. Es la frase del botón («Abrir puerta», «Cerrar puerta»), que no sabe
 * aún cuál: con varias la elige el clic en la portada. Si ninguna, el motivo de
 * la primera.
 */
export function puertasBlocker(state: BattleState, tipo: TipoDePuerta): string | null {
  if (state.puertas.length === 0) return 'no hay puerta';
  const motivos = state.puertas.map((p) => puertaBlocker(state, tipo, p));
  return motivos.includes(null) ? null : (motivos[0] as string);
}

/** Lo que la activa puede hacer con las puertas: abrir o cerrar cada una. Sin puertas, nada. */
function puertasA(state: BattleState): BattleAction[] {
  const out: BattleAction[] = [];
  for (const p of state.puertas) {
    for (const type of TIPOS_DE_PUERTA) {
      if (puertaBlocker(state, type, p) === null) out.push({ type, puerta: { a: p.a, b: p.b } });
    }
  }
  return out;
}

/** Las jugadas de la puerta, en el orden en que se ofrecen (como `TIPOS_DE_ESCALA`). */
export const TIPOS_DE_PUERTA: readonly TipoDePuerta[] = ['abrir_puerta', 'cerrar_puerta'];

/** ¿Es `x` una jugada de la puerta (`TIPOS_DE_PUERTA`)? */
export function esTipoDePuerta(x: string): x is TipoDePuerta {
  return (TIPOS_DE_PUERTA as readonly string[]).includes(x);
}

// ---------------------------------------------------------------- legalidad

/** Acciones legales del stack activo. La usan la IA y el validador del agente. */
export function legalActions(state: BattleState): BattleAction[] {
  return legalActionsAndCosts(state).actions;
}

/**
 * Lo mismo, y además el mapa de costes con el que se ha construido la lista.
 *
 * Existe porque ese coste ya se calcula aquí —es el BFS de `movableFrom`— y
 * hasta ahora se tiraba: la lista se quedaba con las claves, así que el
 * llamante que necesitara el coste tenía que recorrer el tablero otra vez. La
 * IA lo necesita para elegir desde qué casilla golpear (#50), y volver a
 * pedirlo era **el 100 % del sobrecoste de aquel cambio, pagado entero por
 * unidades sin `charge`** — las únicas que no pueden aprovecharlo, y hoy son
 * todas: 1258 de 1258 decisiones. Medido en 300 batallas: 150 ms con el
 * segundo recorrido, 128 ms sin él, que es exactamente la línea base.
 *
 * Devolver el mapa **no** relaja el contrato del que cuelga el desempate de la
 * IA: el coste se sigue **leyendo**, solo que del recorrido que ya se hizo en
 * vez de uno nuevo. Las claves del mapa son, en ese orden, los `move` de la
 * lista.
 */
export function legalActionsAndCosts(state: BattleState): {
  actions: BattleAction[];
  costs: Map<string, Paso>;
} {
  const s = activeStack(state);
  if (s === null || state.finished !== null) return { actions: [], costs: new Map() };
  // Lo que se ofrece va por la fase del turno (`faseBlocker`). Con un golpe
  // plantado, solo ese golpe (`golpeEnCursoBlocker`): sin elegir, que lo elegido
  // es de la rueda.
  const fase = faseDelTurno(state);
  if (fase === 'plantado' && state.golpeEnCurso !== null) {
    return { actions: [{ type: 'attack', target: state.golpeEnCurso.target }], costs: new Map() };
  }
  // Tras la Finta, el tramo solo de andar: las casillas del recorrido de
  // siempre, que ya mide lo que le queda (`pasosQueQuedan`), y terminar.
  if (fase === 'trasLaFinta') {
    const costs = movableFrom(state, s);
    const andar: BattleAction[] = [...costs.values()].map((p) => ({ type: 'move', to: p.at }));
    return { actions: [...andar, { type: 'end_turn' }], costs };
  }

  // Tras moverse solo queda moverse más, golpear o terminar: ni puertas, ni
  // escaleras, ni apuntar (decisión del usuario). `end_turn` va al final para no
  // cambiar lo que encuentra un `find` de la IA.
  const movido = fase === 'movido';
  const out: BattleAction[] = movido ? [] : [...puertasA(state), ...escalasA(state, s)];

  const enemies = enemiesOf(state, s);

  // Apuntar: uno por casilla de enemigo vivo, que es lo que tiene sentido elegir;
  // vale cualquier otra casilla del tablero (`apuntarBlocker`), y la prosa del
  // agente lo dice. La recta y a quién da, al salir el disparo.
  if (disparoBlocker(state, s) === null) {
    for (const e of enemies) out.push({ type: 'aim', at: e.hex });
  }
  // Lanzar: uno por casilla de enemigo vivo a su alcance, con la regla de lanzar
  // (`lanzarBlocker`) y no una copia; vale cualquier otra casilla a su alcance, y la
  // prosa del agente lo dice.
  if (granadaBlocker(state, s) === null) {
    for (const e of enemies) {
      if (lanzarBlocker(state, e.hex) === null) out.push({ type: 'throw', at: e.hex });
    }
  }

  // Un solo BFS por llamada. Estaba dentro del bucle de ataques, así que con
  // cuatro enemigos el tablero se recorría cinco veces para dar la misma
  // respuesta: 1 + E. La lista no cambia ni de contenido ni de orden porque se
  // recorre la misma secuencia, solo que sin recalcularla.
  const costs = movableFrom(state, s);
  const alcanzables = [...costs.values()].map((p) => p.at);
  for (const h of alcanzables) out.push({ type: 'move', to: h });

  // Ataques: desde donde está, o moviéndose a un hex desde el que alcance.
  // Es `canReachMelee` desplegada a mano: con individuos este doble bucle se
  // corre ~100 veces por batalla sobre decenas de casillas, y copiar el stack
  // entero por sonda para preguntar lo que solo depende de su casilla era la
  // mitad de su coste.
  // Solo se golpea al mismo nivel (`canReachMelee`): la casilla de la que se
  // sale tiene que estar arriba si el enemigo lo está. El nivel de cada casilla,
  // una vez, fuera del bucle de enemigos.
  const niveles = alcanzables.map((h) => nivelDe(state.muralla, h));
  // Impedido de golpear (un hechizo): ni un golpe en la lista.
  const golpea = impedidoPor(s, 'golpear') === null;
  for (const e of golpea ? enemies : []) {
    if (canReachMelee(state, s, e)) out.push({ type: 'attack', target: e.id });
    const nivel = nivelDe(state.muralla, e.hex);
    // Con índice y no con `entries()`: este bucle es el más caliente de la IA,
    // y el iterador con desestructuración doblaba el coste de la función.
    for (let i = 0; i < alcanzables.length; i++) {
      if (niveles[i] !== nivel) continue;
      const h = alcanzables[i] as Hex;
      if (areAdjacent(h, e.hex)) out.push({ type: 'attack', target: e.id, from: h });
    }
  }

  // Rendirse lo ofrece la misma función que lo rechaza al aplicarlo, y con su
  // precio puesto: es la única acción que cuesta recursos fuera de la batalla.
  const rendicion = surrenderBlocker(state, s.side);
  if (rendicion.motivo === null) out.push({ type: 'surrender', gold: rendicion.coste });

  // Ni una regla de lanzamiento escrita aquí: la lista ofrece exactamente los
  // pares (hechizo, objetivo) que `castBlocker` deja pasar, que es la misma
  // función que después decide si el lanzamiento sale adelante.
  const hero = state.heroes[s.side];
  if (hero !== null) {
    for (const spellId of hero.spells) {
      if (castBlocker(state, s.side, spellId) !== null) continue;
      const h = hechizoDeLaBatalla(state, spellId);
      const vale = (target?: string, at?: Hex): boolean =>
        target === undefined && at === undefined
          ? true
          : castBlocker(state, s.side, spellId, target, at) === null;
      for (const j of jugadasDeLanzar(state, h, vale))
        out.push({ type: 'cast', spell: spellId, ...j });
    }
  }

  // Los poderes, solo con alguno: sin ellos ni se mira, y la lista
  // del juego no cambia ni de contenido ni de orden. Los pares que deja pasar
  // `poderBlocker` —sus mismas dos piezas—: lo que no depende del objetivo una
  // vez por poder, y luego cada objetivo.
  for (const id of s.unit.poderes ?? []) {
    const previo = previoDelPoder(state, id);
    if ('motivo' in previo) continue;
    const l = lanzadorDeLaUnidad(previo.s);
    const vale = (target?: string, at?: Hex): boolean =>
      apuntadoBlocker(
        state,
        previo.h,
        l,
        target === undefined && at === undefined ? null : apuntadoDe(target, at),
        true,
      ) === null;
    for (const j of jugadasDeLanzar(state, previo.h, vale))
      out.push({ type: 'power', poder: id, ...j });
  }

  out.push({ type: 'end_turn' });
  return { actions: out, costs };
}

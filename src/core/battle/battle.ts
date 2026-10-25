/**
 * Motor de batalla táctica.
 *
 * Reglas de HoMM2 que se respetan aquí: orden de turno por velocidad con el
 * atacante ganando los empates, contraataque único por ronda, tiradores que no
 * pueden disparar con un enemigo encima, moral que da o quita turnos, suerte
 * que dobla o parte el daño, y un hechizo de héroe por ronda.
 */

import {
  CATALOGO_DEL_JUEGO,
  type CatalogoDeUnidades,
  cifrasDeUnidad,
  oroDeUnidad,
} from '../catalogo.js';
import { combateBlocker, type ReglasDelCombate } from '../combate.js';
import { HEROE, hasTrait, isShooter } from '../data.js';
import { cifrasDelIndividuo } from '../hero/experiencia.js';
import type { Hero } from '../hero/hero.js';
import { hojaDeLaTropa } from '../hero/troop.js';
import type { Rng } from '../rng.js';
import type { CombatProfile } from '../rpg/stats.js';
import type { CreatureTrait, FactionId, Hex, Stack, UnitInfo, UsoDeArma } from '../types.js';
import { SPEED_TO_HEXES } from '../types.js';
import { disparosDe, golpesDe, ruedaDelGolpe, trasLaArmadura } from './armas.js';
import {
  alcanceConCostes,
  allHexes,
  areAdjacent,
  BOARD_SIZE,
  COLUMNAS_DE_SALIDA,
  type CosteDeSalir,
  caminoDe,
  carreraConCostes,
  distanciasDesde,
  espejo,
  hexDistance,
  hexEquals,
  hexKey,
  indiceDe,
  isInside,
  neighbours,
  type Paso,
  type PasoPermitido,
  quedanCasillas,
  reachable,
  rectaLibre,
  siguienteEnRecta,
} from './board.js';
import {
  CARGA_MINIMA,
  cargaEfectiva,
  cifrasDeCarga,
  dichoDeLaCarga,
  porcientoDeLaCarga,
} from './carga.js';
import { fraseDelContacto, salirCuesta } from './contacto.js';
import {
  ataqueYDefensa,
  CHANCE_PER_POINT,
  computeDamage,
  type DamageOptions,
  type Horquilla,
  herir,
  horquillaDeDanio,
  type Modificador,
  type RamaDeSuerte,
  stackHp,
  trasElGolpe,
  usoDelGolpe,
} from './damage.js';
import {
  applyEffect,
  type CuandoVence,
  clampMoraleLuck,
  effectTotal,
  type StackEffect,
  tickEffects,
} from './effects.js';
import {
  bonoEnLoAlto,
  type CierreDeLaMuralla,
  casillasDeMuro,
  cierreDeLaMuralla,
  claveDeAbiertas,
  type EstadoDePuerta,
  enLoAlto,
  esMuro,
  hayLinea,
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
import { esDeCura, type Poder, type PoderId, poder, poderSiExiste } from './poderes.js';
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
  type PapelEnLaRueda,
  type Punto,
  puntoDelContraataque,
  puntoDelCruce,
  puntosDe,
  puntosDeLaForma,
  type TipoDeGolpe,
} from './rueda.js';
import {
  castSpell,
  curaDe,
  delHeroe,
  efectoDe,
  type Lanzador,
  type Spell,
  type SpellResult,
  spell,
} from './spells.js';
import type {
  BattleAction,
  BattleHero,
  BattleStack,
  BattleState,
  GolpeEnCurso,
  OrigenDelStack,
  Side,
  TipoDeEscala,
  TipoDePuerta,
  TurnoDeUnidad,
} from './types.js';
import { otroBando, SIDES } from './types.js';

export interface BattleSide {
  /**
   * Lo que sale al tablero, en orden de despliegue. Desde la tropa de
   * individuos la partida manda un stack de 1 por individuo
   * (`troopsAsStacks`); el motor sigue sabiendo jugar stacks de N.
   */
  readonly army: readonly StackDeBatalla[];
  readonly hero: HeroeDelBando | null;
  /** Bonus de moral/suerte del héroe (habilidades, artefactos, edificios). */
  readonly moraleBonus?: number;
  readonly luckBonus?: number;
  /**
   * Los personajes del ejército (`Stack.member`), con su perfil y los PV con
   * los que llegan. Lo monta quien conoce `GameState.characters`
   * —`battleSideForHero`—: el motor no sabe de dónde salen, solo los juega.
   */
  readonly members?: ReadonlyMap<string, BattleMember>;
  /**
   * El catálogo del que salen las cifras de su tropa del catálogo: el del juego
   * si no se dice (`CATALOGO_DEL_JUEGO`); la arena pone el de su montaje
   * (`catalogoDelMontaje`), con lo que la página no ha guardado.
   */
  readonly catalogo?: CatalogoDeUnidades;
}

/**
 * Un stack de la tropa tal como entra: el del ejército y, si lleva, su escalera
 * para subir a la muralla (`poner_escalera`). La escalera solo la pone la arena,
 * y no llega al tablero si no la puede usar (`quienNoEscala`).
 */
export type StackDeBatalla = Stack & { readonly escalera?: boolean };

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

/** Un personaje listo para entrar al tablero. */
export interface BattleMember {
  readonly profile: CombatProfile;
  /** PV actuales: entra herido si lo está. */
  readonly hp: number;
}

// La zona de salida vive en `board.ts`: la lee también la muralla, que dice qué
// es dentro y qué es fuera desde la del defensor.
export { bandoDeSalida } from './board.js';

/** Las filas, del centro hacia fuera: el centro es lo primero que se llena. */
const DEL_CENTRO_A_FUERA: readonly number[] = [4, 3, 5, 2, 6, 1, 7, 0, 8];

/**
 * La casilla de cada unidad, en el orden en que llegan: las tres columnas del
 * borde, columna a columna desde el borde y cada columna del centro hacia fuera.
 * Se calcula en el marco del atacante y se refleja para el defensor. Toda unidad
 * ocupa una casilla (13-10-2026: «todo el mundo un hexe»).
 *
 * `primera`, si la hay, es la que coge el primer hueco —el centro de la columna
 * del borde— aunque llegue la última: es el sitio del héroe, detrás de su tropa.
 * Se dice aquí y no reordenando la lista fuera, porque el orden de la lista es
 * también el de `stacks`, y de ese orden cuelgan los empates.
 *
 * Es la única regla, para uno o para siete. Hasta la fase 1a convivía con las
 * filas de HoMM2 para cinco o menos (`ROWS_BY_COUNT`), que se habían quedado
 * solo para no mover los tests del motor: el juego no tenía motivo, y un
 * ejército saltaba de formación abierta a compacta al pasar de cinco a seis
 * individuos.
 *
 * Sin muralla no comprueba si caben porque caben siempre: un bando lleva como
 * mucho `LIDERAZGO.maxPorBando` individuos, y un test de datos (`tropa.test.ts`)
 * fija que no pasan de los 27 de un lado.
 *
 * **Con muralla** (la arena deja dibujarla en cualquier columna, también en las
 * de salida) se saltan los hexes de muro y de puerta —nadie empieza en una
 * puerta, tampoco el defensor—; el orden de lo que queda es el mismo. Si así no
 * caben, lanza diciendo cuántos sitios deja la muralla.
 */
function despliegue(
  units: readonly UnitInfo[],
  side: Side,
  primera: number | null,
  muralla: MurallaDeBatalla,
): Hex[] {
  const { huecos, motivo } = salidaDe(units, side, muralla);
  if (motivo !== null) throw new Error(motivo);
  const out: Hex[] = new Array<Hex>(units.length);
  let siguiente = 0;
  if (primera !== null) out[primera] = huecos[siguiente++]!;
  units.forEach((_, i) => {
    if (i !== primera) out[i] = huecos[siguiente++]!;
  });
  return out.map((h) => enElMarco(side, h));
}

/**
 * Por qué `units` no caben en la salida de `side` con esta muralla, o `null` si
 * caben. Lo lee `despliegue` —que lanza con ello— y el editor de la arena, que
 * lo avisa mientras se dibuja en vez de dejar que «Luchar» lo descubra.
 */
export function despliegueBlocker(
  units: readonly UnitInfo[],
  side: Side,
  muralla: MurallaDeBatalla,
): string | null {
  return salidaDe(units, side, muralla).motivo;
}

/** Del marco del atacante, en el que se calcula la salida, al del tablero (el del defensor es `espejo`). */
function enElMarco(side: Side, h: Hex): Hex {
  return side === 'attacker' ? h : espejo(h);
}

/**
 * Los huecos de salida, en el marco del atacante: lo que no es muro ni puerta de
 * las columnas de salida; y si no caben, por qué.
 */
function salidaDe(
  units: readonly UnitInfo[],
  side: Side,
  muralla: MurallaDeBatalla,
): { readonly huecos: readonly Hex[]; readonly motivo: string | null } {
  const cerradas = casillasDeMuro(muralla);
  const cerrada = (h: Hex): boolean => cerradas.has(hexKey(enElMarco(side, h)));
  const lado = side === 'attacker' ? 'la izquierda' : 'la derecha';
  const huecos: Hex[] = [];
  for (let col = 0; col < COLUMNAS_DE_SALIDA; col++) {
    for (const row of DEL_CENTRO_A_FUERA) {
      const h = { col, row };
      if (!cerrada(h)) huecos.push(h);
    }
  }
  const motivo =
    units.length > huecos.length
      ? `la muralla deja ${unaOVarias(huecos.length, 'casilla')} de salida a ${lado} y ${haceFalta(units.length)}`
      : null;
  return { huecos, motivo };
}

/** «1 casilla», «0 casillas», «3 casillas»: QA vio «deja 1 filas de salida» (M6). */
function unaOVarias(n: number, palabra: string): string {
  return `${n} ${palabra}${n === 1 ? '' : 's'}`;
}

function haceFalta(n: number): string {
  return `${n === 1 ? 'hace' : 'hacen'} falta ${n}`;
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
 * Mira las unidades YA resueltas, no el `Army`: así «un personaje no tiene
 * facción» se dice una sola vez —`faction: null` en `rpg/stats.ts`— y aquí solo
 * se lee. Quien no tiene facción ni rompe la unidad de un ejército de caballeros
 * ni la da. Un ejército SOLO de personajes no tiene ninguna facción que
 * compartir, así que no cobra el +1 —su moral sale de la voluntad de cada uno—.
 * En estrategia ese caso no existe: todo stack es una criatura con facción, y
 * un ejército vacío no pone a nadie en el tablero. Ni el héroe ni un personaje
 * tienen rasgos, así que tampoco cuentan como no-muertos.
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
 * y la rueda con que se pelea (`BattleState.rueda`). `muralla` la pone solo la
 * arena (y los tests); toda batalla del mapa va sin ella (`SIN_MURALLA`).
 */
export function createBattle(
  attacker: BattleSide,
  defender: BattleSide,
  _rng: Rng,
  combate: ReglasDelCombate,
  murallaPedida: MurallaDeBatalla = SIN_MURALLA,
): BattleState {
  const sinCombate = combateBlocker(combate);
  if (sinCombate !== null) throw new Error(`no se puede montar la batalla: ${sinCombate}`);
  const stacks: BattleStack[] = [];
  const muralla = murallaPedida === SIN_MURALLA ? SIN_MURALLA : validarMuralla(murallaPedida);

  for (const [side, setup] of [
    ['attacker', attacker],
    ['defender', defender],
  ] as const) {
    personajesSinRepetir(setup);
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
    const hexes = despliegue(
      units,
      side,
      setup.hero === null ? null : entradas.length - 1,
      muralla,
    );
    // La mezcla de facciones se cuenta UNA vez, con el ejército que entra, y no
    // se recalcula al morir un stack (#49): igual que fheroes2, que la cuenta
    // sobre el `Army` de fuera de la batalla (`army.cpp`, `GetMoraleModificator`:
    // `for ( const Troop * troop : *this ) if ( troop->isValid() )`), cuyas bajas
    // solo se apuntan al acabar (`battle_main.cpp`, `syncOriginalArmy`). Fuente:
    // https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/army/army.cpp#L1226-L1236
    // https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_main.cpp#L456-L457
    const baseMorale = armyMorale(units) + (setup.moraleBonus ?? 0);
    const luckBonus = setup.luckBonus ?? 0;

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
        topHp: e.topHp,
        hex: hexes[i]!,
        // La escalera solo va con quien puede ponerla: el defensor y el volador no
        // escalan, y el héroe no trae (`entradaDelHeroe`).
        escalera: e.escalera && quienNoEscala(side, e.unit) === null,
        retaliated: false,
        defending: false,
        waited: false,
        acted: false,
        gotMoraleBonus: false,
        // Una regla para todos: la moral y la suerte propias —0 en una criatura
        // y en el héroe— más las del bando, recortadas una vez. Los no-muertos, a 0.
        morale: hasTrait(e.unit, 'undead') ? 0 : clampMoraleLuck(baseMorale + e.ownMorale),
        luck: clampMoraleLuck(luckBonus + e.ownLuck),
        effects: [],
        ganado: { experiencia: 0, bajas: 0, heroes: [] },
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
    golpeEnCurso: null,
    escaleras: [],
    puertas: puertasAlEmpezar(muralla),
    log: [],
    finished: null,
  };

  beginRound(state, _rng);
  return state;
}

/**
 * Un personaje es un individuo: no puede aparecer dos veces en el mismo ejército.
 *
 * Si lo hiciera, los dos stacks entrarían con sus PV y saldrían con PV
 * distintos, y `woundsFromBattle` escribiría los dos sobre el mismo personaje:
 * ganaría la última escritura y una herida se perdería sin que nadie lo dijera.
 * Hoy ningún camino del juego lo produce; se cierra en la puerta de la batalla,
 * que es donde ya se validan el `count` y los PV, antes de que lo produzca uno.
 */
function personajesSinRepetir(setup: BattleSide): void {
  const vistos = new Set<string>();
  for (const stack of setup.army) {
    if (stack.member === undefined) continue;
    if (vistos.has(stack.member)) {
      const nombre = setup.members?.get(stack.member)?.profile.unit.name ?? stack.member;
      throw new Error(`${nombre} aparece dos veces en el ejército`);
    }
    vistos.add(stack.member);
  }
}

/** Un stack resuelto y todavía sin colocar: lo que `createBattle` empuja. */
interface Entrada {
  readonly slot: number;
  readonly body: string;
  readonly unit: UnitInfo;
  readonly origen: OrigenDelStack;
  readonly count: number;
  readonly topHp: number;
  readonly ownMorale: number;
  readonly ownLuck: number;
  /** Si lleva escalera (`StackDeBatalla.escalera`). */
  readonly escalera: boolean;
}

/**
 * De dónde salen las cifras de un stack de la tropa: del catálogo, o del perfil
 * de su personaje. Con `entradaDelHeroe`, es el ÚNICO sitio que decide, y se
 * decide una vez: después todo el motor lee `BattleStack.unit` y no vuelve a
 * preguntar.
 *
 * Devuelve la moral y la suerte PROPIAS —0 y 0 en una criatura— y no las
 * finales: las del bando las suma `createBattle` para todos igual. La rama de la
 * criatura devuelve la misma referencia del catálogo, así que el volcado del
 * banco no se mueve.
 */
function resolveUnit(stack: StackDeBatalla, slot: number, setup: BattleSide): Entrada {
  // La experiencia es de un individuo: un stack de N con hoja de servicios no
  // sabría de cuál de los N es, igual que un personaje no puede ser dos.
  if (stack.veterania !== undefined && stack.count !== 1) {
    throw new Error(
      `el veterano ${stack.veterania.id} es uno solo y viene en un stack de ${stack.count}`,
    );
  }
  const escalera = stack.escalera === true;
  if (stack.member === undefined) {
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
      },
      count: stack.count,
      topHp: unit.hp,
      ownMorale: 0,
      ownLuck: 0,
      escalera,
    };
  }
  const id = stack.member;
  if (stack.count !== 1) {
    throw new Error(`un personaje es uno solo: "${id}" viene en un stack de ${stack.count}`);
  }
  const miembro = setup.members?.get(id);
  if (miembro === undefined) {
    throw new Error(`el personaje "${id}" está en el ejército pero no se sabe quién es`);
  }
  // Antes que los límites: `NaN <= 0` y `NaN > max` son los dos falsos, así
  // que un PV imposible pasaba por delante de las dos comprobaciones de abajo y
  // la batalla empezaba con `topHp: NaN`. Y `2.5` entraba con dos PV y medio.
  if (!Number.isSafeInteger(miembro.hp)) {
    throw new Error(
      `${miembro.profile.unit.name} llega con ${miembro.hp} PV: los PV son un número entero`,
    );
  }
  if (miembro.hp <= 0) {
    throw new Error(`${miembro.profile.unit.name} no puede entrar en batalla: tiene 0 PV`);
  }
  if (miembro.hp > miembro.profile.unit.hp) {
    throw new Error(
      `${miembro.profile.unit.name} llega con ${miembro.hp} PV y su máximo es ${miembro.profile.unit.hp}`,
    );
  }
  // Un personaje no tiene rasgos, así que tampoco la inmunidad del no-muerto:
  // entra herido si lo está, con su moral y su suerte. La veteranía se le suma
  // con la misma regla que a una criatura (`cifrasDelIndividuo`, que suma también
  // lo que lleva puesto), y no cambia sus
  // PV: entra con los que trae.
  return {
    slot,
    body: hojaDeLaTropa(stack),
    unit: cifrasDelIndividuo(miembro.profile.unit, stack.veterania, miembro.profile.equipo),
    origen: { kind: 'personaje', id, veterania: stack.veterania ?? null },
    count: 1,
    topHp: miembro.hp,
    ownMorale: miembro.profile.morale,
    ownLuck: miembro.profile.luck,
    escalera,
  };
}

/** El héroe como una entrada más: uno, sano siempre —no arrastra heridas—. */
function entradaDelHeroe(heroe: HeroeDelBando, slot: number): Entrada {
  return {
    slot,
    body: heroe.figura,
    unit: heroe.cuerpo,
    origen: { kind: 'heroe', desnudo: heroe.desnudo },
    count: 1,
    topHp: heroe.cuerpo.hp,
    ownMorale: 0,
    ownLuck: 0,
    escalera: false,
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
 * `movido` (ha andado un tramo: ya no dispara, ni defiende, ni espera; decisión
 * del usuario), `plantado` (con la rueda, ha andado hasta su objetivo y espera
 * la rueda, `golpeEnCurso`) o `trasLaFinta` (ha golpeado con Finta y le queda un
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
 * héroe, ni rendirse, ni esperar, defender, puertas o escaleras. Lo de después
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
 * La firma del turno abierto: el ordinal, lo gastado y lo que le quitó la Finta.
 * Dos estados con la misma firma tienen el mismo recorrido por andar (con las
 * mismas puertas, que van aparte). La leen `applyAction`, que rechaza un
 * `Movibles` de otra firma, y la clave de las cachés de la sesión. Sin la Finta,
 * un recorrido de antes de golpear con ella valía después y andaba de más.
 */
export function firmaDelTurno(turno: TurnoDeUnidad): string {
  const finta = turno.finta === undefined ? '' : ` y ${turno.finta} menos por la Finta`;
  const gastadas = turno.gastado === 1 ? '1 casilla gastada' : `${turno.gastado} casillas gastadas`;
  return `turno ${turno.n} con ${gastadas}${finta}`;
}

/**
 * ¿Son `a` y `b` el MISMO turno? Por el ordinal, que es lo único que no se deja
 * engañar por la moral extra (la misma unidad, otro turno) ni por una copia del
 * estado (el mismo turno, otro objeto). `null` no es el mismo turno que nada.
 */
export function mismoTurno(
  a: Pick<TurnoDeUnidad, 'n'> | null | undefined,
  b: Pick<TurnoDeUnidad, 'n'> | null | undefined,
): boolean {
  return a != null && b != null && a.n === b.n;
}

/**
 * ¿Ha movido ya `s` en este turno? Tras moverse no se dispara, ni se defiende,
 * ni se espera (decisión del usuario): solo queda moverse más, golpear o
 * terminar. Cada `move` cuesta al menos una casilla, así que «ha movido» es
 * «lleva algo gastado».
 */
export function seHaMovido(state: BattleState, s: BattleStack): boolean {
  return gastadoEn(state, s) > 0;
}

export function stackSpeed(s: BattleStack): number {
  const base = SPEED_TO_HEXES[s.unit.speed];
  return Math.max(1, base + effectTotal(s, 'speed'));
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
 * Por qué `s` no puede disparar ahora, o `null` si puede. ÚNICA redacción de la
 * regla del disparo: la leen `legalActions` para ofrecerlo, `applyAction` para
 * rechazarlo —con el id delante— y `ataqueBlocker` para explicárselo a la
 * persona. Antes la lista y el rechazo la escribían cada uno, y el cliente
 * inventaba una tercera frase («no alcanzas a esa unidad») que a un tirador que
 * se acababa de mover le decía algo falso con un arco de alcance ilimitado.
 */
function disparoBlocker(state: BattleState, s: BattleStack): string | null {
  if (!isShooter(s.unit)) return 'no es tirador';
  if (seHaMovido(state, s)) return 'ya se ha movido este turno: no puede disparar';
  if (isEngaged(state, s)) return 'tiene un enemigo encima';
  return null;
}

/**
 * Por qué `s` no tiene línea de tiro hasta `target`, o `null` si la tiene. En el
 * suelo, nadie dispara a través de un muro ni de una puerta cerrada (la abierta
 * no tapa, decisión del usuario); si
 * uno de los dos está en lo alto, el tiro pasa por encima (decisión del usuario,
 * 09-10-2026). Una unidad de dos casillas tira si alguna de sus casillas ve
 * alguna del blanco. Sin muralla, siempre `null`.
 *
 * La leen `legalActions` para ofrecer el disparo, `applyAction` para rechazarlo
 * y `ataqueBlocker` para decírselo a la persona.
 */
export function tiroBlocker(
  state: BattleState,
  s: BattleStack,
  target: BattleStack,
): string | null {
  const m = state.muralla;
  if (!hayMuralla(m) || enLoAlto(state, s) || enLoAlto(state, target)) return null;
  const suyas = stackHexes(target);
  const ve = (puertas: readonly EstadoDePuerta[]): boolean =>
    stackHexes(s).some((desde) => suyas.some((h) => hayLinea(m, puertas, desde, h)));
  if (ve(state.puertas)) return null;
  const abiertas = state.puertas.map((p) => ({ ...p, abierta: true }));
  return ve(abiertas) ? 'la puerta cerrada está en medio' : 'el muro está en medio';
}

/**
 * Por qué la unidad activa no puede actuar contra `targetId` —ni dispararle ni
 * golpearla, moviéndose o no—, o `null` si puede. Es a `attack`/`shoot` lo que
 * `castBlocker` a un hechizo: la frase la escribe el núcleo, sin sujeto, y la
 * pantalla la pinta tal cual. Al tirador se le dice primero por qué no dispara,
 * que es lo que esperaba hacer.
 */
export function ataqueBlocker(state: BattleState, targetId: string): string | null {
  const s = activeStack(state);
  if (s === null || state.finished !== null) return 'no le toca a ninguna unidad';
  const porLaFase = faseBlocker(state, 'attack');
  if (porLaFase !== null) return porLaFase;
  const target = stackById(state, targetId);
  const rival = rivalBlocker(s, target, 'atacar');
  if (rival !== null) return rival;
  const disparo = disparoBlocker(state, s) ?? tiroBlocker(state, s, target);
  if (disparo === null) return null;
  const { actions } = legalActionsAndCosts(state);
  if (actions.some((a) => a.type === 'attack' && a.target === targetId)) return null;
  const golpe = 'no alcanza a esa unidad cuerpo a cuerpo este turno';
  return isShooter(s.unit) ? `${disparo}, y ${golpe}` : golpe;
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
 * la carrera que se anda para cobrarla (`CargaMedida`). Lanza
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
  readonly carrera: Paso | null;
} {
  const enCurso = golpeEnCursoBlocker(state, accion, completa);
  if (enCurso !== null) throw new Error(enCurso);
  const target = stackById(state, accion.target);
  const motivo = golpeBlocker(state, s, target, accion.from, costes);
  if (motivo !== null) throw new Error(motivo);
  const sinCruce = cruceBlocker(accion, completa, formaDeLaBatalla(state));
  if (sinCruce !== null) throw new Error(sinCruce);
  const { from } = accion;
  // La carga se mide ANTES de mover, desde donde empieza este tramo: es la regla
  // del usuario, «se puede mover un tramo y se vuelve a calcular». Lo recorrido
  // en tramos anteriores no cuenta, y por eso no hace falta guardarlo en ningún
  // sitio: viaja hasta el golpe como argumento. Y se mide contra ESTE objetivo:
  // carga solo si está en la recta. Con la rueda, quien se plantó ya anduvo y
  // desde donde está no hay recta que medir: la carrera la guardó `golpeEnCurso`
  // al plantarse.
  const medida =
    state.golpeEnCurso !== null || from === undefined ? null : medirCargas(state, s)(from, target);
  return {
    target,
    // Golpea desde `from`: desde ahí se mira si el objetivo le alcanza para
    // devolverlo.
    desdeAhi: from === undefined ? s : { ...s, hex: from },
    carga: state.golpeEnCurso !== null ? state.golpeEnCurso.carga : (medida?.recta ?? 0),
    carrera: medida?.carrera ?? null,
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
 * de las dos elecciones y sin otro plantado: anda hasta `from` y espera la rueda
 * (`golpeEnCurso`), sin cerrar el turno. Primero se anda, luego se elige (decisión
 * del usuario, 13-10-2026).
 */
function esPlantarse(state: BattleState, accion: BattleAction & { type: 'attack' }): boolean {
  return (
    state.golpeEnCurso === null && accion.golpe === undefined && accion.respuesta === undefined
  );
}

/**
 * Por qué `s` no puede disparar a `target` ahora, o `null`: la regla del disparo
 * (`disparoBlocker`, con el id delante) y el blanco. La leen `applyAction` y
 * `previsionDe`.
 */
function disparoContraBlocker(
  state: BattleState,
  s: BattleStack,
  target: BattleStack,
): string | null {
  const motivo = disparoBlocker(state, s);
  if (motivo !== null) return `${s.id} ${motivo}`;
  const rival = rivalBlocker(s, target, 'disparar');
  if (rival !== null) return rival;
  const tiro = tiroBlocker(state, s, target);
  return tiro === null ? null : `${s.id} no puede disparar a ${target.id}: ${tiro}`;
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

/** Tope de rondas: una batalla que no converge se cierra, no se cuelga. */
export const MAX_ROUNDS = 100;

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
    s.waited = false;
    s.defending = false;
    s.retaliated = false;
    s.gotMoraleBonus = false;
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

/** Pasa al siguiente stack con turno, saltando muertos y desmoralizados. */
function advance(state: BattleState, rng: Rng): void {
  if (state.finished !== null) {
    state.turno = null;
    return;
  }

  for (let s = siguienteEnLaCola(state); s !== null; s = siguienteEnLaCola(state)) {
    // Moral baja: el stack se queda paralizado y pierde el turno. No cuenta
    // como el último que actuó: en fheroes2, `_lastActiveUnitArmyColor` solo se
    // apunta en la rama de quien «will certainly perform at least one
    // full-fledged action», y la de `MORALE_BAD` va antes.
    // https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_arena.cpp#L496-L501
    const moral = s.morale;
    if (moral < 0 && rng.chance(-moral * CHANCE_PER_POINT)) {
      s.acted = true;
      state.log.push({ kind: 'morale', stack: s.id, good: false });
      // Su turno empieza y se pierde: lo que dura «hasta que empiece su próximo
      // turno» (Defensivo) se va igual (decisión del usuario, 14-10-2026). Sin
      // turno abierto no hay `n` nuevo: vale el siguiente al de ahora.
      quitarLosQueVencen(state, s, 'empezar', (state.turno?.n ?? 0) + 1);
      continue;
    }
    abrirTurno(state, s);
    return;
  }

  beginRound(state, rng);
}

/**
 * Saca de la cola al siguiente vivo, o `null` si no queda nadie en la ronda.
 *
 * Los que no han tenido turno van delante y se reordenan antes de cada salida:
 * su desempate depende de quién actuó el último, y eso no se sabe al montar la
 * ronda —un muerto o un paralizado por la moral cambian a quién le toca el
 * siguiente empate—. fheroes2 también elige así, uno a uno (`GetCurrentUnit`).
 * Detrás, los que esperaron salen tal cual llegaron (#81).
 */
function siguienteEnLaCola(state: BattleState): BattleStack | null {
  const vivos = state.queue.map((id) => stackById(state, id)).filter(isAlive);
  const sinTurno = vivos.filter((s) => !s.waited);
  const esperan = vivos.filter((s) => s.waited);
  state.queue = [
    ...intercalar(state, sinTurno, preferidoEnElEmpate(state)),
    ...esperan.map((s) => s.id),
  ];
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
 * Cierra el turno del stack activo y decide si la moral le regala otro.
 *
 * Con `conMoral = false` tampoco lo decide: lo piden las escaladas, que son el
 * turno entero («al subir se quedan arriba y no pueden atacar ni hacer nada más
 * ese turno», el usuario). Con el turno extra, la buena moral dejaba golpear
 * justo después de subir, o subir justo después de poner la escalera (QA, M3).
 */
function endTurn(state: BattleState, s: BattleStack, rng: Rng, conMoral = true): void {
  checkFinished(state);
  if (state.finished !== null) {
    state.turno = null;
    return;
  }
  const n = state.turno?.n;
  if (n !== undefined) quitarLosQueVencen(state, s, 'terminar', n);

  const moral = s.morale;
  if (
    conMoral &&
    isAlive(s) &&
    moral > 0 &&
    !s.gotMoraleBonus &&
    rng.chance(moral * CHANCE_PER_POINT)
  ) {
    s.gotMoraleBonus = true;
    s.acted = false;
    state.log.push({ kind: 'morale', stack: s.id, good: true });
    // Vuelve a actuar ya, sin pasar por la cola: allí competiría en el
    // desempate con los que aún no han tenido turno.
    abrirTurno(state, s);
    return;
  }
  s.acted = true;
  advance(state, rng);
}

/**
 * Quita a `s` lo que duraba hasta que `al` (empiece o termine) su próximo turno
 * (la rueda del golpe): lo colgado en un turno anterior al `n`. Al **terminar**
 * lo llama `endTurn`, antes de la moral: el turno extra es otro turno, y lo de
 * este ya se ha ido; `wait` no cierra el turno y no pasa por ahí, y si la moral
 * baja se lo salta, lo quita el tope de `roundsLeft`. Al **empezar**, `abrirTurno`
 * (también el turno extra de la moral, y tras esperar) y la moral baja, cuyo
 * turno empieza y se pierde. Sin ninguno que venza, no se escribe nada.
 */
function quitarLosQueVencen(state: BattleState, s: BattleStack, al: CuandoVence, n: number): void {
  const vencido = (e: StackEffect): boolean =>
    e.hasta !== undefined && e.hasta.al === al && e.hasta.turno < n;
  // Cada cierre de turno pasa por aquí: sin nada que quitar, ni una lista nueva.
  if (!s.effects.some(vencido)) return;
  const vencidos = s.effects.filter(vencido);
  s.effects = s.effects.filter((e) => !vencido(e));
  for (const e of vencidos) state.log.push({ kind: 'effect_end', stack: s.id, source: e.source });
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
  // héroes en el tablero hay otro empate posible —un disparo del liche que
  // salpica a los dos comandantes a la vez—, que se resuelve igual.
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
  const s = activeStack(state);
  const turno = state.turno;
  if (s === null || turno === null) throw new Error('no hay stack activo');
  if (movibles !== undefined && movibles.firma !== firmaDelTurno(turno)) {
    throw new Error(
      `el recorrido que traes es del ${movibles.firma}, y ahora le toca a ${s.id} en el ${firmaDelTurno(turno)}`,
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
    case 'wait': {
      if (s.waited) throw new Error(`${s.id} ya esperó en esta ronda`);
      if (seHaMovido(state, s))
        throw new Error(`${s.id} ya se ha movido este turno: no puede esperar`);
      s.waited = true;
      state.log.push({ kind: 'wait', stack: s.id });
      // REGLA NUESTRA (#81): vuelve al final de la cola, y los que esperan salen
      // por orden de llegada, no por velocidad. No hay original que copiar:
      // fheroes2 no tiene espera. Sus órdenes son `MOVE, ATTACK, SPELLCAST,
      // MORALE, CATAPULT, TOWER, RETREAT, SURRENDER, SKIP, TOGGLE_AUTO_COMBAT,
      // QUICK_COMBAT` (`battle_command.h`), y `SKIP` cierra el turno: «Skips the
      // current creature. The current creature ends its turn and does not get to
      // go again until the next round.» (`battle_interface.cpp`).
      // https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_command.h#L38-L51
      // https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_interface.cpp#L3314-L3315
      state.queue.push(s.id);
      advance(state, rng);
      return;
    }

    case 'defend': {
      if (seHaMovido(state, s)) {
        throw new Error(`${s.id} ya se ha movido este turno: no puede defenderse`);
      }
      s.defending = true;
      state.log.push({ kind: 'defend', stack: s.id });
      endTurn(state, s, rng);
      return;
    }

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
      // El recorrido, una vez: lo leen la comprobación y el movimiento.
      let costes: ReadonlyMap<string, Paso> | undefined = movibles?.costs;
      const recorrido = (): ReadonlyMap<string, Paso> => {
        costes ??= movableFrom(state, s);
        return costes;
      };
      const plantarse = esPlantarse(state, action);
      const { target, carga, carrera } = golpePreparado(state, s, action, !plantarse, recorrido);
      // Primero se anda (con la carga en su `move`), luego el cruce y el golpe:
      // de una vez o en dos jugadas, el registro dice lo mismo en el mismo orden.
      // Lo que costaba el camino más barato, para devolverlo si se suelta el golpe.
      const barato =
        action.from === undefined ? 0 : pasoHasta(state, s, recorrido(), action.from).steps;
      if (action.from !== undefined) {
        moveTo(state, s, action.from, recorrido(), carga > 0 ? { carrera } : undefined);
      }
      if (plantarse) {
        // Ni cierra el turno aunque haya gastado sus casillas, ni escribe aún
        // ningún cruce: espera la rueda. Soltarlo es `soltarElGolpe`.
        state.golpeEnCurso = { stack: s.id, target: target.id, carga, carrera, barato };
        return;
      }
      state.golpeEnCurso = null;
      const cruce = cruceDeLaRueda(state, s, target, action);
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

    case 'shoot': {
      const target = stackById(state, action.target);
      const motivo = disparoContraBlocker(state, s, target);
      if (motivo !== null) throw new Error(motivo);
      shoot(state, s, target, rng);
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
      endTurn(state, s, rng, false);
      return;
    }

    case 'subir': {
      const motivo = subirBlocker(state, action.muro);
      if (motivo !== null) throw new Error(`${s.id} no puede subir: ${motivo}`);
      const desde = s.hex;
      s.hex = action.muro;
      state.log.push({ kind: 'climbed', stack: s.id, from: desde, to: action.muro });
      // Al subir se queda arriba y no hace nada más ese turno: ni con la moral.
      endTurn(state, s, rng, false);
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
      castHeroSpell(state, s.side, action.spell, action.target);
      // Lanzar un hechizo no consume el turno del stack: el héroe actúa aparte.
      return;
    }

    case 'power': {
      const motivo = poderBlocker(state, action.poder, action.target);
      if (motivo !== null) {
        throw new Error(`${s.unit.name} no puede usar ese poder: ${motivo}`);
      }
      const p = poder(action.poder);
      // El hechizo del poder con la unidad de lanzador: la misma aplicación que
      // la del héroe, así que la Bendición del monje refresca la suya.
      lanzarSobre(state, p.hechizo, p.lanzador, stackById(state, action.target), null, (r) =>
        state.log.push({
          kind: 'power',
          stack: s.id,
          poder: p.id,
          target: action.target,
          ...(esDeCura(p) ? { cura: r.cura } : {}),
        }),
      );
      endTurn(state, s, rng);
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
 * que se salva, redondeado hacia arriba. El héroe no cuenta —no es tropa—, ni
 * un personaje, que no tiene precio de catálogo.
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
    case 'personaje':
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
 * Suelta el golpe plantado (`golpeEnCurso`): Escape en la rueda después de andar
 * (decisión del usuario, 13-10-2026). La unidad se queda donde llegó, como tras
 * un tramo, y sigue su turno con lo que le quede; la carga de esa carrera se
 * pierde. Si la carrera por la recta costó más que el camino barato (salir del
 * contacto, #259), lo gastado vuelve a lo que costaba el barato: sin la carga no
 * hay recta que pagar (decisión del /simplify, 14-10-2026). Si ya no le queda
 * nada que hacer, el turno se cierra, como el `move` que agota. Solo la llama la
 * sesión (`CruceDeLaRueda`); sin golpe plantado lanza.
 */
export function soltarElGolpe(state: BattleState, rng: Rng): void {
  const g = state.golpeEnCurso;
  if (g === null) throw new Error('no hay ningún golpe plantado que soltar');
  const s = activeStack(state);
  const turno = state.turno;
  if (s === null || turno === null || s.id !== g.stack) {
    throw new Error(`el golpe plantado es de ${g.stack}, y no le toca`);
  }
  state.golpeEnCurso = null;
  if (g.carrera !== null) turno.gastado -= g.carrera.steps - g.barato;
  if (!quedaAlgoQueHacer(state)) endTurn(state, s, rng);
}

/**
 * Quien pega anda hasta su objetivo y se planta (`golpeEnCurso`) sin golpear:
 * el `attack` sin elecciones, con su `from` si lo trae. Es lo que se hace cuando
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
 * 02-10-2026): carga todo el que pega cuerpo a cuerpo (`cifrasDeCarga`: el
 * jinete con el rasgo `charge` y los demás a pie, #260), solo si `from` está **en línea
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
 * Una carga medida: las casillas de su recta y, si se paga el contacto, la
 * carrera que se anda para cobrarla.
 */
export interface CargaMedida {
  /** Las casillas de la recta (`CARGA_MINIMA` o más), sin el tope: lo que da `cargaDesde`. */
  readonly recta: number;
  /**
   * Lo que se anda para cobrarla: la recta, pagando lo que cuesta salir de cada
   * casilla (`carreraConCostes`), que puede costar más que el camino más barato.
   */
  readonly carrera: Paso;
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
  const cifras = cifrasDeCarga(s.unit);
  // Tras la Finta no hay golpe que cobrarla: solo se anda.
  if (state.turno?.stack === s.id && faseDelTurno(state) === 'trasLaFinta') return SIN_CARGAS;
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
    const hexes = cargaEfectiva(medida.recta, cifras);
    out.push({ target: e.id, at: paso.at, hexes, porciento: porcientoDeLaCarga(hexes, cifras) });
  }
  return out;
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
 * llega (`movimientoBlocker`): el que anda `moveTo` y lo que costaba el camino
 * barato que guarda el golpe plantado.
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
 * Mueve el stack y le apunta al turno lo que cuesta el camino. Con `carga`, la
 * carrera de un golpe que carga (el `move` lo dice, y el lienzo la anima así).
 */
function moveTo(
  state: BattleState,
  s: BattleStack,
  to: Hex,
  costes?: ReadonlyMap<string, Paso>,
  carga?: { readonly carrera: Paso | null },
): void {
  // El coste real del camino, no la distancia en línea recta: rodear a un
  // enemigo cuesta más casillas del presupuesto. Sale del mismo recorrido que
  // decide si el destino es legal, así que no hay una segunda cuenta que pueda
  // discrepar de la primera — y si el llamante ya lo hizo, es literalmente ese.
  // Salvo la carga cuando salir del contacto cuesta: la carrera va por la recta
  // y se paga la recta (`CargaMedida.carrera`, que `medirCargas` ya vio que
  // cabe), que puede costar más que el camino más barato.
  const legal = pasoHasta(state, s, costes ?? movableFrom(state, s), to);
  const paso = carga?.carrera ?? legal;

  s.hex = to;
  // `moveTo` solo lo llama `applyAction` sobre el stack activo, así que el turno
  // es el suyo; si no lo fuera, apuntarlo en el de otro sería el fallo callado.
  if (state.turno === null || state.turno.stack !== s.id) {
    throw new Error(`${s.id} se mueve fuera de su turno`);
  }
  state.turno.gastado += paso.steps;
  // Los voladores se buscan sin bloqueos —ignoran lo que hay en medio—, así que
  // su cadena de pasos podría cruzar casillas ocupadas: su camino es el aire.
  const path = hasTrait(s.unit, 'flying') ? [to] : caminoDe(paso);
  state.log.push({
    kind: 'move',
    stack: s.id,
    to,
    path,
    ...(carga === undefined ? {} : { charge: true }),
  });
}

/**
 * ¿Rebota este efecto contra el objetivo?
 *
 * Los no-muertos no tienen ánimo que quebrar: son inmunes a la mala suerte
 * venga de donde venga — Maldición del héroe o el golpe de una momia. Vive
 * aquí y no en `effects.ts` porque es una regla del juego que mira los rasgos
 * de la criatura, no aritmética de una lista. La consultan `applyStackEffect`
 * —para el efecto que deja un golpe— y `targetBlocker` —para que ni se ofrezca
 * ni se acepte un hechizo que va a rebotar.
 */
function isImmuneTo(stack: BattleStack, effect: StackEffect): boolean {
  return effect.kind === 'luck' && effect.amount < 0 && hasTrait(stack.unit, 'undead');
}

/**
 * Cuelga un efecto del stack y lo cuenta en el registro.
 * Si el objetivo es inmune no se acumula nada y se anota el rebote: sin esto
 * una momia dejaría tres maldiciones sobre un esqueleto que no las siente.
 */
function applyStackEffect(state: BattleState, target: BattleStack, effect: StackEffect): void {
  // Lo que se anota es el efecto YA colgado, no el que se pidió: si refrescó a
  // uno del mismo origen, las rondas que se leen en el parte son las que de
  // verdad le quedan.
  const vivo = colgarEfecto(target, effect);
  if (vivo === null) {
    state.log.push({ kind: 'immune', stack: target.id, source: effect.source });
    return;
  }
  state.log.push({
    kind: 'effect',
    stack: target.id,
    effect: vivo.kind,
    amount: vivo.amount,
    source: vivo.source,
    rounds: vivo.roundsLeft,
    ...(vivo.hasta === undefined ? {} : { vence: vivo.hasta.al }),
  });
}

/**
 * Aplica un hechizo al objetivo con su lanzador —el héroe (`delHeroe`) o la
 * unidad que usa un poder (`Poder.lanzador`)—: el daño o la cura los pone
 * `castSpell`, `anotar` escribe la línea de quien lanza y el efecto que dura lo
 * cuelga el motor detrás (refresca el del mismo origen y lo anota). Una sola
 * aplicación para los dos: la Bendición del monje y la del héroe son una.
 */
function lanzarSobre(
  state: BattleState,
  s: Spell,
  l: Lanzador,
  target: BattleStack,
  autor: BattleStack | null,
  anotar: (r: SpellResult) => void,
): void {
  const r = castSpell(s, l, target, autor);
  anotar(r);
  if (r.effect !== undefined) applyStackEffect(state, target, r.effect);
}

/**
 * Cuelga `effect` de `target` sin anotar nada y devuelve el que queda colgado
 * (`applyEffect`: refresca o añade), o `null` si rebota en el inmune. La parte
 * pura de `applyStackEffect`, que anota lo que pasó; la previsión del
 * contraataque la usa sobre su copia del objetivo, así que las dos cuelgan igual.
 */
function colgarEfecto(target: BattleStack, effect: StackEffect): StackEffect | null {
  return isImmuneTo(target, effect) ? null : applyEffect(target, effect);
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
  // Lo que el golpe deja va con el arma de su primer golpe
  // (`ruedaDelIntercambio`), contada una vez y antes de pegar: Defensivo, a quien
  // pega antes de sus golpes, que cubre ya lo que venga; Romper guardia y la
  // Finta, después. La respuesta no deja nada.
  const rueda = { ...cruce, cifras: ruedaDelIntercambio(state, attacker, target, carga) };
  colgarDeLaRueda(state, attacker, rueda.golpe, rueda.punto, 'propio', rueda.cifras);
  intercambio(state, attacker, target, rng, false, carga, enElPunto(rueda.golpe, rueda.punto));

  // Romper guardia, tras el golpe y antes del contraataque: quita ataque al
  // atacado ya en él, y en su próximo turno (decisión del usuario, 14-10-2026).
  if (isAlive(target)) {
    colgarDeLaRueda(state, target, rueda.golpe, rueda.punto, 'rival', rueda.cifras);
  }

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
 * Las cifras de la rueda del intercambio de `quien` a `contra` con `carga`
 * casillas de carrera: las del arma de su **primer** golpe (`usoDelGolpe` sobre
 * las mismas opciones que el golpe: la lanza si cobra la carga, si no la de cuerpo
 * a cuerpo). Lo que no es daño —Defensivo antes de golpear, Romper guardia y la
 * Finta después— se cuelga una vez por intercambio y va con ella; el daño de cada
 * golpe, con la suya (`conElGolpe`). Lo leen el golpe (`melee`, una vez) y las dos
 * previsiones.
 */
function ruedaDelIntercambio(
  state: BattleState,
  quien: BattleStack,
  contra: BattleStack,
  carga: number,
): CifrasDeLaRueda {
  const o = opcionesDeDanio(state, quien, contra, { chargeHexes: carga });
  return ruedaDelGolpe(quien.unit, usoDelGolpe(quien.unit, o));
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

/** El dragón óseo: ataque −2 durante 2 rondas. Ver la nota de la tabla. */
const FEAR_ATTACK_PENALTY = -2;
const FEAR_ROUNDS = 2;
/** La momia deja maldición al golpear: suerte −1 durante 3 rondas. */
const CURSE_ON_HIT_LUCK = -1;
const CURSE_ON_HIT_ROUNDS = 3;

/**
 * Lo que un golpe deja pegado al objetivo, según el rasgo de quien pega. El
 * quinto rasgo de este tipo es una fila más, no otro bloque igual al de al
 * lado.
 *
 * Está aquí y no en `effects.ts` a propósito: el libro mayor de efectos no
 * tiene por qué saber que existen un dragón y una momia. Y se puede compartir
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
  {
    trait: 'curse_on_hit',
    effect: {
      kind: 'luck',
      amount: CURSE_ON_HIT_LUCK,
      roundsLeft: CURSE_ON_HIT_ROUNDS,
      source: 'curse_on_hit',
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
 * daño (`cruceDelGolpe`), con las cifras del arma de ese golpe de `quien`
 * (`usoDelGolpe` sobre las mismas opciones: la lanza en el golpe que cobra la
 * carga, la de cuerpo a cuerpo en lo demás y en el contraataque, que no carga).
 * La previsión de la rueda la pide sobre las mismas opciones para cada tipo, con
 * el papel de quien elige y las cifras que ya contó (`c`, las de esas opciones);
 * el golpe, con el que le da `papelDe`.
 */
function conElGolpe(
  o: DamageOptions,
  quien: UnitInfo,
  golpe: GolpeEnLaRueda,
  papel: PapelEnLaRueda,
  forma: FormaDeLaRueda,
  c: CifrasDeLaRueda = ruedaDelGolpe(quien, usoDelGolpe(quien, o)),
): DamageOptions {
  return { ...o, cruce: cruceDelGolpe(golpe.tipo, golpe.desde, golpe.hasta, papel, c, forma) };
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
  const herida = herir(target, result.damage, attacker);

  if (result.lucky) state.log.push({ kind: 'luck', stack: attacker.id, good: true });
  if (result.unlucky) state.log.push({ kind: 'luck', stack: attacker.id, good: false });

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

  // Lo que el golpe deja pegado. Va ANTES del contraataque a propósito: al
  // dragón óseo le devuelven el golpe ya asustados, que es donde se nota.
  // Un contraataque no asusta ni maldice: solo el que ataca de verdad.
  if (!retaliation && isAlive(target)) {
    for (const { trait, effect } of ON_HIT_EFFECTS) {
      if (hasTrait(info, trait)) applyStackEffect(state, target, effect);
    }
  }

  if (!isAlive(target)) state.log.push({ kind: 'perished', stack: target.id });
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

function shoot(state: BattleState, shooter: BattleStack, target: BattleStack, rng: Rng): void {
  const info = shooter.unit;
  const shots = disparosDe(info);

  for (let i = 0; i < shots && isAlive(target); i++) {
    const distance = distanciaDeDisparo(shooter, target);
    const result = computeDamage(
      shooter,
      target,
      rng,
      opcionesDeDanio(state, shooter, target, { ranged: true, distance }),
    );
    const herida = herir(target, result.damage, shooter);

    // La mala suerte también se anota, como en el golpe: sin ella, quien lee el
    // registro (la previsión y su test) no sabía qué rama había caído.
    if (result.lucky) state.log.push({ kind: 'luck', stack: shooter.id, good: true });
    if (result.unlucky) state.log.push({ kind: 'luck', stack: shooter.id, good: false });
    state.log.push({
      kind: 'shoot',
      stack: shooter.id,
      target: target.id,
      damage: herida.danio,
      killed: herida.muertos,
      ...conLoParado(herida),
    });
    if (!isAlive(target)) state.log.push({ kind: 'perished', stack: target.id });

    // La salpicadura reparte el daño del disparo, no el que llegó: cada salpicado
    // resta su propia armadura (`herir`).
    if (hasTrait(info, 'splash_shot')) splash(state, shooter, target, result.damage);
  }
}

/**
 * Las casillas entre un tirador y su objetivo: lo que mira la regla de la distancia.
 * Exportada para que la IA elija blanco con las mismas opciones del disparo.
 */
export function distanciaDeDisparo(shooter: BattleStack, target: BattleStack): number {
  return Math.min(
    ...stackHexes(shooter).flatMap((sh) => stackHexes(target).map((th) => hexDistance(sh, th))),
  );
}

/**
 * A quién alcanza la salpicadura de un disparo sobre `target`: todo lo vivo
 * pegado a él, **de cualquier bando**, como en el original.
 *
 * Está exportada porque la IA necesita la MISMA respuesta para no dispararse a
 * los suyos (`tactics.ts`). Cuando la deducía por su cuenta, el día que
 * cambiara el radio la IA habría seguido jugando con la forma vieja sin que
 * nadie se enterase.
 */
export function splashTargets(state: BattleState, target: BattleStack): BattleStack[] {
  // "Pegado al objetivo" y "alcanza al objetivo cuerpo a cuerpo" son la misma
  // pregunta, así que se hace con la misma función.
  return state.stacks.filter(
    (otro) => otro.id !== target.id && isAlive(otro) && canReachMelee(state, otro, target),
  );
}

/**
 * La salpicadura del liche. Se reparte el daño YA calculado, sin volver a
 * tirar: una tirada por disparo mantiene los tests legibles y la semilla
 * estable.
 *
 * El tirador nunca se salpica a sí mismo: para estar pegado a su objetivo
 * tendría un enemigo encima, y con un enemigo encima `isEngaged` no le deja
 * disparar.
 */
function splash(
  state: BattleState,
  shooter: BattleStack,
  target: BattleStack,
  damage: number,
): void {
  for (const otro of splashTargets(state, target)) {
    const herida = herir(otro, damage, shooter);
    state.log.push({
      kind: 'shoot',
      stack: shooter.id,
      target: otro.id,
      damage: herida.danio,
      killed: herida.muertos,
      ...conLoParado(herida),
      splash: true,
    });
    if (!isAlive(otro)) state.log.push({ kind: 'perished', stack: otro.id });
  }
}

/** Se escribe una vez y se lee en dos: el bloqueador y el estrechamiento. */
const SIN_HEROE = 'este bando no tiene héroe';

/**
 * Motivo por el que el héroe de `side` no puede lanzar `spellId` —sobre
 * `targetId` si se apunta a alguien—, o `null` si sí puede. Mismo patrón que
 * `buildBlocker` en `town.ts`: la frase la escribe el núcleo y la pantalla la
 * enseña tal cual, así que el panel de batalla no reimplementa ni una regla.
 *
 * Es la ÚNICA redacción de estas reglas: la consultan `castHeroSpell` al lanzar
 * y `legalActions` al ofrecer. Cuando `legalActions` las repetía a mano, la
 * promesa que `agent.ts` le hace al agente —«elegir de `legalActions` nunca
 * falla»— la sostenía una copia, y la quinta regla que entrara (un silencio, un
 * tope de nivel) se habría aplicado al lanzar y no al ofrecer.
 *
 * Sin objetivo la pregunta es «¿puede lanzarlo sobre alguien?»; con objetivo,
 * «¿sobre ese?».
 */
export function castBlocker(
  state: BattleState,
  side: Side,
  spellId: string,
  targetId?: string,
): string | null {
  const hero = state.heroes[side];
  if (hero === null) return SIN_HEROE;
  const porLaFase = faseBlocker(state, 'cast');
  if (porLaFase !== null) return porLaFase;
  if (hero.castThisRound) return 'el héroe ya lanzó un hechizo esta ronda';
  // El id se comprueba contra el libro ANTES de buscarlo en el catálogo: con un
  // id inventado, "no lo conoce" es más cierto y más útil que reventar.
  if (!hero.spells.includes(spellId)) return `el héroe no conoce "${spellId}"`;
  const s = spell(spellId);
  if (hero.mana < s.cost) return `maná insuficiente: cuesta ${s.cost} y quedan ${hero.mana}`;

  if (targetId !== undefined) {
    const target = state.stacks.find((t) => t.id === targetId);
    if (target === undefined) return `no hay ninguna unidad "${targetId}"`;
    return targetBlocker(hero, s, side, target);
  }
  return state.stacks.some((t) => targetBlocker(hero, s, side, t) === null)
    ? null
    : 'no hay ningún objetivo válido';
}

/** Por qué este stack no vale como objetivo de este hechizo. */
function targetBlocker(hero: BattleHero, s: Spell, side: Side, target: BattleStack): string | null {
  return objetivoBlocker(target, side, s, efectoDe(s, delHeroe(s, hero)), `"${s.name}"`);
}

/**
 * Por qué `target` no vale para el hechizo `s` lanzado desde el bando `side`,
 * dejando `efecto`: lo común al héroe (`targetBlocker`) y al poder de una unidad
 * (`objetivoDelPoderBlocker`). `citado` es el nombre tal como lo dice cada uno.
 */
function objetivoBlocker(
  target: BattleStack,
  side: Side,
  s: Spell,
  efecto: StackEffect | null,
  citado: string,
): string | null {
  if (!isAlive(target)) return 'el objetivo ya está destruido';
  const wantsEnemy = s.target === 'enemy';
  if (wantsEnemy === (target.side === side)) {
    return `${citado} va dirigido a ${wantsEnemy ? 'un enemigo' : 'un aliado'}`;
  }
  // La inmunidad se pregunta a la misma función que decide al aplicar el efecto,
  // no a una copia de la regla: nada de ofrecer una Maldición sobre un no-muerto
  // para que después rebote.
  if (efecto !== null && isImmuneTo(target, efecto)) {
    return `${target.unit.name} es inmune a ${citado}`;
  }
  return null;
}

function castHeroSpell(
  state: BattleState,
  side: Side,
  spellId: string,
  targetId: string | undefined,
): void {
  // El nulo se comprueba aquí, y no solo dentro del bloqueador, porque el
  // estrechamiento no cruza la llamada. El motivo sigue escrito una sola vez.
  const hero = state.heroes[side];
  if (hero === null) throw new Error(`no se puede lanzar: ${SIN_HEROE}`);

  const blocker = castBlocker(state, side, spellId, targetId);
  if (blocker !== null) throw new Error(`no se puede lanzar: ${blocker}`);

  const s = spell(spellId);
  if (targetId === undefined) throw new Error(`"${s.name}" necesita un objetivo`);
  const target = stackById(state, targetId);

  hero.mana -= s.cost;
  hero.castThisRound = true;
  // El cuerpo del héroe es quien cobra la experiencia del hechizo. Está vivo
  // seguro: si cae, su bando pierde (`checkFinished`) y aquí no se llega.
  const cuerpo = state.stacks.find((x) => x.side === side && x.origen.kind === 'heroe') ?? null;
  // El efecto no puede rebotar aquí —`castBlocker` rechaza al objetivo inmune
  // antes de cobrar el maná—, pero `applyStackEffect` sigue comprobándolo porque
  // el mismo camino lo usan los golpes con rasgo.
  lanzarSobre(state, s, delHeroe(s, hero), target, cuerpo, (r) =>
    state.log.push({
      kind: 'cast',
      side,
      spell: spellId,
      target: targetId,
      damage: r.damage,
      killed: r.killed,
      ...conLoParado(r),
    }),
  );
  if (!isAlive(target)) state.log.push({ kind: 'perished', stack: target.id });
  checkFinished(state);
}

// ---------------------------------------------------------------- poderes

/**
 * Por qué la unidad activa no puede usar el poder `poderId` —sobre `targetId` si
 * se apunta a alguien—, o `null` si puede. La ÚNICA redacción de estas reglas,
 * como `castBlocker` para el héroe: la leen `applyAction`, `legalActions` (y con
 * ella la IA), la previsión y los botones de la arena.
 *
 * Reglas nuestras (`data/poderes.json`): a un aliado vivo, también
 * a sí misma, esté donde esté y aunque esté trabada (es un bastón, no un arco); y
 * al principio del turno, sin haberse movido, como disparar. Usarlo es el turno
 * entero. Sin objetivo la pregunta es «¿puede usarlo sobre alguien?»; con
 * objetivo, «¿sobre ese?».
 */
export function poderBlocker(
  state: BattleState,
  poderId: PoderId,
  targetId?: string,
): string | null {
  const previo = previoDelPoder(state, poderId);
  if ('motivo' in previo) return previo.motivo;
  const { s, p, efecto } = previo;
  if (targetId !== undefined) {
    const target = state.stacks.find((t) => t.id === targetId);
    if (target === undefined) return `no hay ninguna unidad "${targetId}"`;
    return objetivoDelPoderBlocker(s, p, efecto, target);
  }
  if (state.stacks.some((t) => objetivoDelPoderBlocker(s, p, efecto, t) === null)) return null;
  // Lo que dice el botón deshabilitado: si nadie de su bando tiene una herida,
  // eso, que es lo que se le pregunta a «Curar»; si no, lo general.
  return esDeCura(p)
    ? 'nadie de su bando tiene ninguna herida'
    : 'no hay ningún aliado sobre el que usarlo';
}

/**
 * Lo que no depende del objetivo, una vez: que le toque a alguien, que el poder
 * exista, que la activa lo sepa y que no se haya movido; y el efecto que dejaría,
 * que tampoco depende de a quién. Lo leen `poderBlocker` y `legalActions`.
 */
function previoDelPoder(
  state: BattleState,
  poderId: PoderId,
):
  | { readonly motivo: string }
  | { readonly s: BattleStack; readonly p: Poder; readonly efecto: StackEffect | null } {
  const s = activeStack(state);
  if (s === null || state.finished !== null) return { motivo: 'no le toca a ninguna unidad' };
  const porLaFase = faseBlocker(state, 'power');
  if (porLaFase !== null) return { motivo: porLaFase };
  // Un id inventado se dice, no revienta: llega de fuera (un test, el arnés).
  const p = poderSiExiste(poderId);
  if (p === null) return { motivo: `no hay ningún poder «${poderId}»` };
  if (!(s.unit.poderes ?? []).includes(poderId)) {
    return { motivo: `${s.unit.name} no sabe ${p.nombre}` };
  }
  if (seHaMovido(state, s)) {
    return { motivo: `ya se ha movido este turno: «${p.nombre}» se usa al principio del turno` };
  }
  return { s, p, efecto: efectoDe(p.hechizo, p.lanzador) };
}

/** Por qué este stack no vale como objetivo de este poder de `s`, que deja `efecto`. */
function objetivoDelPoderBlocker(
  s: BattleStack,
  p: Poder,
  efecto: StackEffect | null,
  target: BattleStack,
): string | null {
  const comun = objetivoBlocker(target, s.side, p.hechizo, efecto, `«${p.nombre}»`);
  if (comun !== null) return comun;
  if (esDeCura(p) && curaDe(p.hechizo, p.lanzador, target) <= 0) {
    return `${target.unit.name} no tiene ninguna herida`;
  }
  return null;
}

// ---------------------------------------------------------------- previsión

/**
 * Lo que daría un golpe o un disparo, ANTES de darlo: la horquilla por golpe sin
 * suerte, las dos ramas de la suerte, lo que se lleva por delante, por qué sale
 * esa cifra y si habrá contraataque.
 */
export interface PrevisionDeGolpe {
  readonly kind: 'golpe' | 'disparo';
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
  readonly buena: RamaDeSuerte | null;
  readonly mala: RamaDeSuerte | null;
  /** Individuos que caerían, sin suerte, con todos los golpes. */
  readonly bajas: Horquilla;
  /** PV que le quedarían, sin suerte, con todos los golpes. */
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
  readonly buena: RamaDeSuerte | null;
  readonly mala: RamaDeSuerte | null;
  readonly modificadores: readonly Modificador[];
  /** Con qué arma lo devuelve (`dichoDelGolpe`), o `null` sin armas por uso (el juego). */
  readonly conArma: string | null;
}

/**
 * Lo que haría un hechizo sobre su objetivo, lo lance el héroe o una unidad con
 * su poder (`previsionDeLanzar`): la misma cuenta para los dos.
 */
export interface PrevisionDeLanzar {
  readonly objetivo: string;
  /** El daño de un hechizo de daño, que no tira dado. */
  readonly danio: number | null;
  /**
   * Lo que para la armadura del objetivo de ese daño (`trasLaArmadura`, la arena);
   * 0 sin armadura o sin daño. La barra lo dice como el golpe (A1 de QA de #262).
   */
  readonly parado: number;
  readonly bajas: number | null;
  readonly leQuedan: number | null;
  /** Lo que dejaría colgado: Prisa, Lentitud, Bendición, Maldición. */
  readonly efecto: StackEffect | null;
  /** PV que repondría una Curación. */
  readonly cura: number | null;
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

export type Prevision = PrevisionDeGolpe | PrevisionDeHechizo | PrevisionDePoder;

/**
 * La previsión de una acción del stack activo: un golpe (`attack`, con su carga
 * si la hay), un disparo o un hechizo; `null` para lo que no hace daño. Lanza si
 * la acción no se puede jugar ahora, con el motivo del núcleo: la previsión se
 * pide sobre acciones de la lista legal, y una que no lo es es un fallo de quien
 * pregunta.
 *
 * **Sale de las mismas funciones que aplican el daño**: `opcionesDeDanio`,
 * `cargaDesde`, `distanciaDeDisparo`, `horquillaDeDanio` (la cuenta de
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
    case 'shoot': {
      const target = stackById(state, accion.target);
      const motivo = disparoContraBlocker(state, s, target);
      if (motivo !== null) throw new Error(motivo);
      return previsionDeGolpe(state, s, target, 'disparo', {
        ranged: true,
        distance: distanciaDeDisparo(s, target),
      });
    }
    case 'cast': {
      if (accion.target === undefined) throw new Error('el hechizo necesita un objetivo');
      const motivo = castBlocker(state, s.side, accion.spell, accion.target);
      if (motivo !== null) throw new Error(`no se puede lanzar: ${motivo}`);
      return previsionDeHechizo(state, s.side, accion.spell, stackById(state, accion.target));
    }
    case 'power': {
      const motivo = poderBlocker(state, accion.poder, accion.target);
      if (motivo !== null) throw new Error(`${s.unit.name} no puede usar ese poder: ${motivo}`);
      const p = poder(accion.poder);
      return {
        kind: 'poder',
        poder: p.id,
        ...previsionDeLanzar(p.hechizo, p.lanzador, stackById(state, accion.target)),
      };
    }
    case 'move':
    case 'wait':
    case 'defend':
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
  kind: 'golpe' | 'disparo',
  extra: Omit<DamageOptions, ExtraDelEstado>,
  golpe: GolpeEnLaRueda | null = null,
): PrevisionDeGolpe {
  const h = horquillaDeDanio(a, t, opcionesDeDanio(state, a, t, extra, golpe));
  const golpes =
    kind === 'golpe' ? golpesDe(a.unit, golpe?.tipo ?? null, false) : disparosDe(a.unit);
  const siguientes = golpes > 1 ? danioSinLaCarga(h.danio, a, t, extra, golpe, state) : null;
  // Cómo queda el objetivo con `golpes` golpes: el primero de `d`, los demás de
  // `luego`, y cada uno solo si el anterior no lo tumba, como en `melee` y `shoot`.
  const tras = (d: number, luego = d): { count: number; topHp: number } => {
    let quedan: { count: number; topHp: number } = { count: t.count, topHp: t.topHp };
    for (let i = 0; i < golpes && quedan.count > 0; i++) {
      quedan = trasElGolpe({ ...quedan, unit: t.unit }, i === 0 ? d : luego);
    }
    return quedan;
  };
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
    buena: h.buena,
    mala: h.mala,
    bajas: { min: t.count - conMenos.count, max: t.count - conMas.count },
    leQuedan: { min: vida(conMas), max: vida(conMenos) },
    modificadores: h.modificadores,
    contraataque:
      kind === 'golpe'
        ? previsionDelContraataque(state, a, t, h, tras, golpe, extra.chargeHexes ?? 0)
        : null,
    salpica:
      kind === 'disparo' && hasTrait(a.unit, 'splash_shot')
        ? splashTargets(state, t).map((x) => x.id)
        : [],
  };
}

/**
 * El daño de cada golpe tras el primero, que no cobra la carga (`intercambio`), o
 * `null` si sale el mismo que el del primero (`danio`): sin carga, o quien no
 * carga. Lo leen la previsión del golpe y la de la rueda.
 */
function danioSinLaCarga(
  danio: Horquilla,
  a: BattleStack,
  t: BattleStack,
  extra: Omit<DamageOptions, ExtraDelEstado>,
  golpe: GolpeEnLaRueda | null,
  state: BattleState,
): Horquilla | null {
  if ((extra.chargeHexes ?? 0) === 0) return null;
  const sin = horquillaDeDanio(
    a,
    t,
    opcionesDeDanio(state, a, t, { ...extra, chargeHexes: 0 }, golpe),
  ).danio;
  return sin.min === danio.min && sin.max === danio.max ? null : sin;
}

/**
 * El contraataque de `t` si `a` le golpea: si lo devuelve (`devolveraElGolpe`) y
 * sobrevive. Lo que puede quitar depende de cuántos le queden —el peor golpe
 * deja menos, el mejor más— y de lo que el golpe le haya dejado pegado (el miedo
 * del dragón, la Maldición de la momia), así que se cuenta sobre una copia del
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
  carga: number,
): PrevisionDeContraataque | null {
  if (!devolveraElGolpe(state, a, t)) return null;
  // Con suerte el golpe puede quitar más, o menos, que sin ella.
  const peor = h.mala?.min ?? h.danio.min;
  const mejor = h.buena?.max ?? h.danio.max;
  const conPeor = tras(peor);
  if (conPeor.count === 0) return null;
  const conMejor = tras(mejor);
  // Lo que el golpe le deja, colgado sobre una copia con la misma función que
  // `applyStackEffect`: refrescar o rebotar en el inmune.
  const conLoDelGolpe: BattleStack = { ...t, effects: [...t.effects] };
  for (const { trait, effect } of ON_HIT_EFFECTS) {
    if (hasTrait(a.unit, trait)) colgarEfecto(conLoDelGolpe, effect);
  }
  // Lo de la rueda que el golpe deja a `a` (quien pega o el atacado), en el punto
  // `p` del cruce, con el arma de su primer golpe, sobre una copia.
  const rueda =
    golpe === null ? null : { ...golpe, cifras: ruedaDelIntercambio(state, a, t, carga) };
  const conLaRueda = (x: BattleStack, p: Punto, para: EfectoDeLaRueda['a']): BattleStack => {
    const suyos =
      rueda === null
        ? []
        : efectosDeLaRueda(rueda.tipo, p, rueda.cifras).filter((e) => e.a === para);
    if (suyos.length === 0) return x;
    const y: BattleStack = { ...x, effects: [...x.effects] };
    for (const efecto of suyos) colgarEfecto(y, deLaRueda(state, efecto));
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
  const une = (x: RamaDeSuerte | null, y: RamaDeSuerte | null): RamaDeSuerte | null =>
    x === null || y === null ? null : { probabilidad: x.probabilidad, min: x.min, max: y.max };
  return {
    seguro: conMejor.count > 0,
    danio: { min: bajo.danio.min, max: alto.danio.max },
    buena: une(bajo.buena, alto.buena),
    mala: une(bajo.mala, alto.mala),
    modificadores: alto.modificadores,
    conArma: alto.conArma,
  };
}

/** Lo que daría un tipo de la rueda: el daño de un golpe y cuántos golpes. */
export interface SectorDeLaRueda {
  /** El daño de un golpe; con más de uno, el del primero. */
  readonly danio: Horquilla;
  readonly golpes: number;
  /** Con más de un golpe y carga, el de cada uno tras el primero, que no la cobra; si no, `null`. */
  readonly siguientes: Horquilla | null;
  /**
   * Al golpear con un tipo que deja algo al rival antes de su contraataque (Romper
   * guardia), su contraataque de ahora con cada éxito que lo cambia, del mayor al
   * menor (R3 de QA de #263), solo los que da el cruce de la rueda
   * (`puntosDeLaForma`); si no, o en la respuesta, o sin contraataque, `[]`.
   */
  readonly contraataquePorExito: readonly { readonly punto: Punto; readonly danio: Horquilla }[];
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
   * Al golpear tras una carrera, la carga que ya llevan las cifras, dicha
   * (`dichoDeLaCarga`: «carga de 3 casillas a pie, +15 %»; R6 de QA de #260); si
   * no hay carga o en la respuesta, `null`.
   */
  readonly carga: string | null;
  /**
   * Las cifras de la rueda con el arma de quien elige (`ruedaDelIntercambio`: al
   * golpear, la de su primer golpe; al responder, la de cuerpo a cuerpo): con
   * ellas se dicen las notas de los sectores (`efectoDeGolpe`).
   */
  readonly rueda: CifrasDeLaRueda;
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
  const rueda = ruedaDelIntercambio(state, quien, contra, papel === 'golpe' ? carga : 0);
  if (papel === 'respuesta' && sinContraataque !== null) {
    return { porTipo: null, sinContraataque, contraataque: null, carga: null, rueda };
  }
  // Las opciones, una vez; cada tipo pone encima su sector.
  const opciones = opcionesDeDanio(state, quien, contra, extra);
  // El contraataque que se le devolvería a quien pega, con el golpe `golpe` (la
  // misma cuenta que la previsión del golpe, `previsionDelContraataque`).
  const contraataqueCon = (golpe: GolpeEnLaRueda | null): Horquilla | null =>
    previsionDeGolpe(state, desdeAhi, target, 'golpe', { chargeHexes: carga }, golpe).contraataque
      ?.danio ?? null;
  const conContraataque = papel === 'golpe' && sinContraataque === null;
  const forma = formaDeLaBatalla(state);
  const neutro = golpeNeutro(forma);
  const porTipo: Partial<Record<TipoDeGolpe, SectorDeLaRueda>> = {};
  for (const tipo of forma.golpes) {
    const sector = delSector(tipo, forma);
    const h = horquillaDeDanio(
      quien,
      contra,
      // Las mismas opciones que contó `rueda`: el arma del primer golpe.
      conElGolpe(opciones, quien.unit, sector, papel, forma, rueda),
    );
    const golpes = golpesDe(quien.unit, tipo, devuelve);
    const siguientes =
      golpes > 1 ? danioSinLaCarga(h.danio, quien, contra, extra, sector, state) : null;
    const contraataquePorExito = conContraataque
      ? [...puntosDeLaForma(forma)].reverse().flatMap((punto) => {
          if (punto < sector.desde || punto > sector.hasta) return [];
          if (!efectosDeLaRueda(tipo, punto, rueda).some((e) => e.a === 'rival')) return [];
          const danio = contraataqueCon({ tipo, desde: punto, hasta: punto });
          return danio === null ? [] : [{ punto, danio }];
        })
      : [];
    porTipo[tipo] = { danio: h.danio, golpes, siguientes, contraataquePorExito };
  }
  // La carga es de quien golpea: la respuesta no la cobra.
  const cifras = cifrasDeCarga(desdeAhi.unit);
  const cobrada = papel === 'golpe' ? cargaEfectiva(carga, cifras) : 0;
  return {
    porTipo,
    sinContraataque,
    contraataque: conContraataque
      ? contraataqueCon(neutro === null ? null : delSector(neutro, forma))
      : null,
    carga: cobrada > 0 ? dichoDeLaCarga(cobrada, cifras) : null,
    rueda,
  };
}

function previsionDeHechizo(
  state: BattleState,
  side: Side,
  spellId: string,
  t: BattleStack,
): PrevisionDeHechizo {
  const hero = state.heroes[side];
  if (hero === null) throw new Error(`no se puede lanzar: ${SIN_HEROE}`);
  const s = spell(spellId);
  return {
    kind: 'hechizo',
    hechizo: spellId,
    ...previsionDeLanzar(s, delHeroe(s, hero), t),
  };
}

/** Lo que haría `s` lanzado por `l` sobre `t`, con las cuentas que lo aplican (`castSpell`). */
function previsionDeLanzar(s: Spell, l: Lanzador, t: BattleStack): PrevisionDeLanzar {
  const base = {
    objetivo: t.id,
    danio: null,
    parado: 0,
    bajas: null,
    leQuedan: null,
    efecto: null,
    cura: null,
  } as const;
  switch (s.kind) {
    case 'damage': {
      // Con la resta del hechizo de verdad (`castSpell` → `herir`).
      const { danio, parado } = trasLaArmadura(l.cantidad, t);
      const quedan = trasElGolpe(t, danio);
      return {
        ...base,
        danio,
        parado,
        bajas: t.count - quedan.count,
        leQuedan: stackHp({ ...t, ...quedan }),
      };
    }
    case 'speed':
    case 'luck':
      return { ...base, efecto: efectoDe(s, l) };
    case 'heal':
      return { ...base, cura: curaDe(s, l, t) };
  }
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

/** En el orden en que se ofrecen: poner antes que subir, contra el mismo muro. */
const TIPOS_DE_ESCALA: readonly TipoDeEscala[] = ['poner_escalera', 'subir'];

// ---------------------------------------------------------------- puertas

/**
 * Por qué la unidad activa no puede `tipo` (abrir o cerrar) la puerta `puerta`
 * —el lado entre sus dos casillas—, o `null` si puede. LA regla de la puerta: la leen `applyAction`, la
 * lista de acciones (y con ella la IA) y los botones de la arena.
 *
 * Decide quien defiende, al principio del turno de cualquier unidad suya, esté
 * donde esté: sin haberse movido, y cada puerta una vez por turno de unidad (si
 * no, abrir y cerrar sería gratis y sin fin). Lo demás que hace una unidad
 * —golpear, disparar, defender, esperar, escalar— cierra el turno, así que «sin
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
  if (s.side !== 'defender') return 'las puertas las abre y las cierra quien defiende';
  if (seHaMovido(state, s)) {
    return 'ya se ha movido este turno: la puerta se abre o se cierra al principio del turno';
  }
  if (tipo === 'abrir_puerta' && p.abierta) return 'la puerta ya está abierta';
  if (tipo === 'cerrar_puerta' && !p.abierta) return 'la puerta ya está cerrada';
  if (p.cambiadaEn === turno.n) return 'esa puerta ya se ha abierto o cerrado en este turno';
  return null;
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

const TIPOS_DE_PUERTA: readonly TipoDePuerta[] = ['abrir_puerta', 'cerrar_puerta'];

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

  // Tras moverse solo queda moverse más, golpear o terminar: ni defender, ni
  // esperar, ni disparar (decisión del usuario). Sin moverse, la lista es la de
  // siempre y en el mismo orden: `end_turn` va al final para no cambiar lo que
  // encuentra un `find` de la IA.
  const movido = fase === 'movido';
  // La puerta, la escalera y la subida van delante de `defend`: sin muralla no
  // sale ninguna, y el orden de siempre no cambia.
  const out: BattleAction[] = movido
    ? []
    : [...puertasA(state), ...escalasA(state, s), { type: 'defend' }];
  if (!s.waited && !movido) out.push({ type: 'wait' });

  const enemies = enemiesOf(state, s);

  if (disparoBlocker(state, s) === null) {
    for (const e of enemies) {
      if (tiroBlocker(state, s, e) === null) out.push({ type: 'shoot', target: e.id });
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
  for (const e of enemies) {
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
      for (const t of state.stacks) {
        if (castBlocker(state, s.side, spellId, t.id) === null) {
          out.push({ type: 'cast', spell: spellId, target: t.id });
        }
      }
    }
  }

  // Los poderes, solo con alguno: sin ellos ni se mira, y la lista
  // del juego no cambia ni de contenido ni de orden. Los pares que deja pasar
  // `poderBlocker` —sus mismas dos piezas—: lo que no depende del objetivo (y el
  // efecto) una vez por poder, y luego cada objetivo.
  for (const id of s.unit.poderes ?? []) {
    const previo = previoDelPoder(state, id);
    if ('motivo' in previo) continue;
    for (const t of state.stacks) {
      if (objetivoDelPoderBlocker(previo.s, previo.p, previo.efecto, t) === null) {
        out.push({ type: 'power', poder: id, target: t.id });
      }
    }
  }

  out.push({ type: 'end_turn' });
  return { actions: out, costs };
}

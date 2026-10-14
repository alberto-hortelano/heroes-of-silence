/**
 * Motor de batalla táctica.
 *
 * Reglas de HoMM2 que se respetan aquí: orden de turno por velocidad con el
 * atacante ganando los empates, contraataque único por ronda, tiradores que no
 * pueden disparar con un enemigo encima, moral que da o quita turnos, suerte
 * que dobla o parte el daño, y un hechizo de héroe por ronda.
 */
import {
  cuentaTiros,
  HEROE,
  hasTrait,
  hexSize,
  isShooter,
  LIDERAZGO,
  type Pieza,
  tirosQueQuedan,
} from '../data.js';
import {
  EQUIPO_DEL_JUEGO,
  type EquipoAtado,
  equipoCon,
  PIEZAS_DEL_CATALOGO,
} from '../hero/equipo.js';
import { cifrasDeCatalogo, cifrasDelIndividuo } from '../hero/experiencia.js';
import { HERO_BODY, type Hero } from '../hero/hero.js';
import type { Rng } from '../rng.js';
import type { CombatProfile } from '../rpg/stats.js';
import type { CreatureTrait, FactionId, Hex, Stack, UnitInfo, UsoDeArma } from '../types.js';
import { SPEED_TO_HEXES } from '../types.js';
import {
  areAdjacent,
  COLUMNAS_DE_SALIDA,
  caminoDe,
  distanciasDesde,
  espejo,
  hexDistance,
  hexEquals,
  hexKey,
  isInside,
  neighbours,
  occupiedHexes,
  type Paso,
  type PasoPermitido,
  reachable,
  rectaLibre,
  siguienteEnRecta,
} from './board.js';
import {
  ataqueYDefensa,
  CHANCE_PER_POINT,
  cargaEfectiva,
  computeDamage,
  type DamageOptions,
  type Horquilla,
  herir,
  horquillaDeDanio,
  type Modificador,
  type RamaDeSuerte,
  stackHp,
  trasElGolpe,
} from './damage.js';
import {
  applyEffect,
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
  partidaPorUnaPuerta,
  pasoAlAndar,
  pasoPorPuertas,
  puertasAlEmpezar,
  SIN_MURALLA,
  validarMuralla,
} from './muralla.js';
import { esDeCura, type Poder, type PoderId, poder, poderSiExiste } from './poderes.js';
import {
  efectoConReglas,
  type NombreDeRegla,
  REGLAS_DEL_JUEGO,
  type ReglasDeBatalla,
  reglasEncendidas,
} from './reglas.js';
import {
  casillasQueQuitaLaFinta,
  conRueda,
  cruceBlocker,
  cruceDelGolpe,
  type EfectoDeLaRueda,
  efectoDeLaRueda,
  golpesDe,
  type HechoDelCruce,
  type ModoDelGolpe,
  type PapelEnLaRueda,
  type Punto,
  puntoDelContraataque,
  puntoDelCruce,
  puntosDe,
  TIPOS_DE_GOLPE,
  type TipoDeGolpe,
  type VenceLaRueda,
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
  readonly army: readonly Stack[];
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
   * El id del ARTE con el que pisa el tablero, si no es el del héroe del juego
   * (`HERO_BODY`). Solo lo pone la arena, que deja elegir la figura entre las
   * hojas de héroe; el juego no lo pone nunca.
   */
  readonly figura?: string;
}

/**
 * El mando de un héroe en la batalla, de sus cifras: la única conversión de un
 * héroe a `BattleHero`, que usan la partida (`battleSideForHero`) y la arena
 * (`heroeDeArena`). Escrito dos veces, el día que el mando gane un campo uno de
 * los dos entraría sin él. Empieza sin haber lanzado en la ronda.
 */
export function mandoDe(
  heroe: Pick<Hero, 'name' | 'attack' | 'defense' | 'spellPower' | 'knowledge' | 'mana'> & {
    readonly spells: BattleHero['spells'];
  },
  retreat: BattleHero['retreat'],
): BattleHero {
  return {
    name: heroe.name,
    retreat,
    ataque: heroe.attack,
    defensa: heroe.defense,
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
  /**
   * Lleva escalera para subir a la muralla (`poner_escalera`). Solo la pone la
   * arena, y no llega al tablero si no la puede usar (`quienNoEscala`).
   */
  readonly escalera?: boolean;
}

// La zona de salida vive en `board.ts`: la lee también la muralla, que dice qué
// es dentro y qué es fuera desde la del defensor.
export { bandoDeSalida } from './board.js';

/** Las filas, del centro hacia fuera: el centro es lo primero que se llena. */
const DEL_CENTRO_A_FUERA: readonly number[] = [4, 3, 5, 2, 6, 1, 7, 0, 8];

/**
 * El hex de cabeza de cada unidad, en el orden en que llegan.
 *
 * Las tres columnas del borde: primero las grandes, una por fila del centro
 * hacia fuera, con la cabeza en la segunda columna y la cola en la del borde;
 * luego las pequeñas, columna a columna desde el borde y cada columna del
 * centro hacia fuera. Se calcula en el marco del atacante y se refleja para el
 * defensor, cuya cola queda a la derecha (`occupiedHexes`).
 *
 * `primera`, si la hay, es la pequeña que coge el primer hueco —el centro de la
 * columna del borde— aunque llegue la última: es el sitio del héroe, detrás de
 * su tropa. Se dice aquí y no reordenando la lista fuera, porque el orden de la
 * lista es también el de `stacks`, y de ese orden cuelgan los empates.
 *
 * Es la única regla, para uno o para siete. Hasta la fase 1a convivía con las
 * filas de HoMM2 para cinco o menos (`ROWS_BY_COUNT`), que se habían quedado
 * solo para no mover los tests del motor: el juego no tenía motivo, y un
 * ejército saltaba de formación abierta a compacta al pasar de cinco a seis
 * individuos.
 *
 * Sin muralla no comprueba si caben porque caben siempre: un bando lleva como
 * mucho `LIDERAZGO.maxPorBando` individuos, y un test de datos
 * (`tropa.test.ts`) fija que ese número de grandes —dos hexes cada una— no pasa
 * de los 27 de un lado y que no hay más grandes que filas.
 *
 * **Con muralla** (la arena deja dibujarla en cualquier columna, también en las
 * de salida) se saltan los hexes de muro y de puerta —nadie empieza en una
 * puerta, tampoco el defensor— y la grande, la fila cuya cabeza o cola caería
 * en uno; el orden de lo que queda es el mismo. Si así no caben, lanza diciendo
 * cuántos sitios deja la muralla. Sin ella, `muralla` está vacía y cada `has`
 * da falso: el despliegue es el de siempre, hex a hex.
 */
function despliegue(
  units: readonly UnitInfo[],
  side: Side,
  primera: number | null,
  muralla: MurallaDeBatalla,
): Hex[] {
  const { filas, huecos, motivo } = salidaDe(units, side, muralla);
  if (motivo !== null) throw new Error(motivo);

  const out: Hex[] = new Array<Hex>(units.length);
  let fila = 0;
  units.forEach((u, i) => {
    if (hexSize(u) > 1) out[i] = { col: 1, row: filas[fila++]! };
  });
  let siguiente = 0;
  if (primera !== null) {
    if (hexSize(units[primera]!) > 1) {
      throw new Error(`${units[primera]!.name} va detrás de su tropa y no cabe en un solo hex`);
    }
    out[primera] = huecos[siguiente++]!;
  }
  units.forEach((u, i) => {
    if (hexSize(u) > 1 || i === primera) return;
    out[i] = huecos[siguiente++]!;
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
 * Las filas de las grandes y los huecos de las pequeñas, en el marco del
 * atacante, y si no caben, por qué. Las grandes cogen las primeras `filas`
 * cuya cabeza y cola están libres; los huecos son lo que queda de las columnas
 * de salida.
 */
function salidaDe(
  units: readonly UnitInfo[],
  side: Side,
  muralla: MurallaDeBatalla,
): {
  readonly filas: readonly number[];
  readonly huecos: readonly Hex[];
  readonly motivo: string | null;
} {
  const cerradas = casillasDeMuro(muralla);
  const cerrada = (h: Hex): boolean => cerradas.has(hexKey(enElMarco(side, h)));
  const lado = side === 'attacker' ? 'la izquierda' : 'la derecha';
  // La grande no empieza con una puerta entre la cabeza y la cola (empiezan
  // cerradas): la misma pregunta que al andar, con su cabeza en la columna 1.
  const cerradasAlEmpezar = puertasAlEmpezar(muralla);
  const partida = (row: number): boolean =>
    partidaPorUnaPuerta(muralla, cerradasAlEmpezar, enElMarco(side, { col: 1, row }), 2, side);

  const filas = DEL_CENTRO_A_FUERA.filter(
    (row) => !cerrada({ col: 0, row }) && !cerrada({ col: 1, row }) && !partida(row),
  );
  const grandes = units.filter((u) => hexSize(u) > 1).length;
  if (grandes > filas.length) {
    return {
      filas,
      huecos: [],
      motivo: `la muralla deja ${unaOVarias(filas.length, 'fila')} de salida para unidades grandes a ${lado} y ${haceFalta(grandes)}`,
    };
  }
  const deGrandes = new Set(filas.slice(0, grandes));
  const huecos: Hex[] = [];
  for (let col = 0; col < COLUMNAS_DE_SALIDA; col++) {
    for (const row of DEL_CENTRO_A_FUERA) {
      const h = { col, row };
      if (!cerrada(h) && !(col <= 1 && deGrandes.has(row))) huecos.push(h);
    }
  }
  const pequeñas = units.length - grandes;
  const motivo =
    pequeñas > huecos.length
      ? `la muralla deja ${unaOVarias(huecos.length, 'casilla')} de salida a ${lado} y ${haceFalta(pequeñas)}`
      : null;
  return { filas, huecos, motivo };
}

/** «1 fila», «0 filas», «3 filas»: QA vio «deja 1 filas de salida» (M6). */
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
 * Monta la batalla del JUEGO: con sus reglas (`REGLAS_DEL_JUEGO`), siempre. Es la
 * puerta de la partida, del servidor y de los bancos; ninguna de ellas puede
 * pedir otras reglas. `muralla` la pone solo la arena (y los tests); toda batalla
 * del mapa va sin ella.
 */
export function createBattle(
  attacker: BattleSide,
  defender: BattleSide,
  rng: Rng,
  murallaPedida: MurallaDeBatalla = SIN_MURALLA,
): BattleState {
  return crearBatallaConReglas(attacker, defender, rng, REGLAS_DEL_JUEGO, murallaPedida);
}

/**
 * Monta una batalla con otras reglas: la puerta de la arena y solo de ella. Lo
 * vigila `test/invariantes.test.ts` («solo la arena cambia las reglas»): quien
 * la llame fuera de `battle/`, `arena.ts`, `session.ts` y `client/arena/` sale
 * rojo. `golpe`, el modo del golpe (`rueda.ts`): la tirada de siempre o la rueda.
 */
export function crearBatallaConReglas(
  attacker: BattleSide,
  defender: BattleSide,
  _rng: Rng,
  reglas: ReglasDeBatalla,
  murallaPedida: MurallaDeBatalla = SIN_MURALLA,
  golpe: ModoDelGolpe = 'azar',
): BattleState {
  const stacks: BattleStack[] = [];
  const muralla = murallaPedida === SIN_MURALLA ? SIN_MURALLA : validarMuralla(murallaPedida);

  for (const [side, setup] of [
    ['attacker', attacker],
    ['defender', defender],
  ] as const) {
    personajesSinRepetir(setup);
    // El héroe pisa el tablero (fase 1b) y cuenta como uno más del bando.
    const cuantos = setup.army.length + (setup.hero === null ? 0 : 1);
    // Antes de colocar a nadie. La regla es del juego (`data/liderazgo.json`) y
    // la respetan todas las puertas —reclutar, la guarnición, el plan de mapa—;
    // esto es la red, por si un camino nuevo se la salta.
    if (cuantos > LIDERAZGO.maxPorBando) {
      const bando = side === 'attacker' ? 'el atacante' : 'el defensor';
      throw new Error(
        `no caben: ${bando} trae ${cuantos} y un bando lleva como mucho ${LIDERAZGO.maxPorBando}`,
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
        shotsLeft: e.unit.shots ?? 0,
        // La escalera solo va con quien puede ponerla: el defensor, la grande y
        // el volador no escalan, y el héroe no trae (`entradaDelHeroe`).
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
    reglas,
    muralla,
    modoDelGolpe: golpe,
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
  /** Si lleva escalera (`BattleMember.escalera`). */
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
function resolveUnit(stack: Stack, slot: number, setup: BattleSide): Entrada {
  // La experiencia es de un individuo: un stack de N con hoja de servicios no
  // sabría de cuál de los N es, igual que un personaje no puede ser dos.
  if (stack.veterania !== undefined && stack.count !== 1) {
    throw new Error(
      `el veterano ${stack.veterania.id} es uno solo y viene en un stack de ${stack.count}`,
    );
  }
  if (stack.member === undefined) {
    // `cifrasDeCatalogo`, la misma regla que leen la IA y el agente por
    // `troopUnit`: un veterano pisa el tablero con las cifras que ellos le ven,
    // y un novato con la referencia del catálogo tal cual.
    const unit = cifrasDeCatalogo(stack.creature, stack.veterania);
    return {
      slot,
      body: stack.creature,
      unit,
      origen: {
        kind: 'catalogo',
        oro: unit.cost.gold ?? 0,
        veterania: stack.veterania ?? null,
      },
      count: stack.count,
      topHp: unit.hp,
      ownMorale: 0,
      ownLuck: 0,
      escalera: false,
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
    body: stack.creature,
    unit: cifrasDelIndividuo(miembro.profile.unit, stack.veterania),
    origen: { kind: 'personaje', id, veterania: stack.veterania ?? null },
    count: 1,
    topHp: miembro.hp,
    ownMorale: miembro.profile.morale,
    ownLuck: miembro.profile.luck,
    escalera: miembro.escalera === true,
  };
}

/** El héroe como una entrada más: uno, sano siempre —no arrastra heridas—. */
function entradaDelHeroe(heroe: HeroeDelBando, slot: number): Entrada {
  return {
    slot,
    body: heroe.figura ?? HERO_BODY,
    unit: heroe.cuerpo,
    origen: { kind: 'heroe' },
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

/**
 * Lo que queda de tramo, dicho: `['queda', '1 casilla']` o `['quedan', '3
 * casillas']`. Lo escriben el panel («Le queda 1 casilla») y las notas del agente
 * («le quedan 3 casillas»), y antes los dos ponían el plural fijo.
 */
export function quedanCasillas(n: number): readonly [verbo: string, casillas: string] {
  return n === 1 ? ['queda', '1 casilla'] : ['quedan', `${n} casillas`];
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
 * Por qué la unidad activa no puede jugar `tipo` porque golpeó con Finta, o
 * `null`. Tras la Finta el resto del turno es un tramo **solo de andar**: andar
 * o terminar (decisión del usuario, 14-10-2026); ni volver a golpear, ni
 * disparar, ni un poder, ni el hechizo del héroe, ni rendirse, ni esperar,
 * defender, puertas o escaleras. La leen `applyAction`, la lista legal y los
 * motivos que pinta la pantalla.
 */
export function fintaBlocker(state: BattleState, tipo: BattleAction['type']): string | null {
  if (state.turno?.finta === undefined || tipo === 'move' || tipo === 'end_turn') return null;
  return TRAS_LA_FINTA;
}

const TRAS_LA_FINTA = 'tras golpear con Finta solo puede andar o terminar el turno';

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

/** Todos los hexes ocupados por un stack (uno, o dos si es grande). */
export function stackHexes(s: BattleStack): Hex[] {
  return occupiedHexes(s.hex, hexSize(s.unit), s.side === 'attacker');
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

/** Lo que la muralla le cierra a `s`, por su bando, su tamaño y si vuela. */
function cierreDe(state: BattleState, s: BattleStack): CierreDeLaMuralla {
  return cierreDeLaMuralla(
    state.muralla,
    state.puertas,
    s.side,
    hexSize(s.unit),
    hasTrait(s.unit, 'flying'),
  );
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
 * La primera celda en la que `s` no cabe si pone la cabeza en `head` —fuera del
 * tablero o en `cerradas`—, o `null` si cabe. Es LA comprobación de dónde se
 * posa una unidad: la hace `movableFrom` para cada destino y `movimientoBlocker`
 * para decir por qué no, así que una restricción nueva va aquí y las dos la ven.
 */
function celdaQueNoCabe(head: Hex, s: BattleStack, cerradas: ReadonlySet<string>): Hex | null {
  for (const c of occupiedHexes(head, hexSize(s.unit), s.side === 'attacker')) {
    if (!isInside(c) || cerradas.has(hexKey(c))) return c;
  }
  return null;
}

/** La frase de la celda `c` que `celdaQueNoCabe` encontró cerrada a `s` con la cabeza en `head`. */
function porQueNoCabe(state: BattleState, s: BattleStack, head: Hex, c: Hex): string {
  const cola = !hexEquals(c, head);
  if (!isInside(c)) return 'no cabe: la cola se sale del tablero';
  // Al muro solo le cierra el paso a la grande: la de una casilla lo pisa, y si
  // no cabe es que hay alguien encima (QA del navegador: al orko que señalaba
  // una columna con el esqueleto arriba se le decía que era de dos casillas).
  if (esMuro(state.muralla, c) && hexSize(s.unit) > 1) {
    return cola ? 'la cola caería en el muro' : LA_GRANDE_NO_SUBE;
  }
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
  const c = celdaQueNoCabe(hex, s, cerradasPara(state, s));
  if (c !== null) return porQueNoCabe(state, s, hex, c);
  if (partidaPorUnaPuerta(state.muralla, state.puertas, hex, hexSize(s.unit), s.side)) {
    return 'no cabe: una puerta cerrada quedaría entre la cabeza y la cola';
  }
  const subida = subidaAndando(state, s, hex);
  if (subida !== null) return subida;
  // La puerta antes que el lado: si abierta llegaría, lo que se lo impide es ella.
  const puerta = porLaPuerta(state, s, hex);
  if (puerta !== null) return puerta;
  const lado = porElLado(state, s, hex);
  if (lado !== null) return lado;
  const quedan = pasosQueQuedan(state, s);
  if (quedan === 0) return 'ya no le quedan casillas este turno';
  const [verbo, casillas] = quedanCasillas(quedan);
  return hayMuralla(state.muralla) && !hasTrait(s.unit, 'flying')
    ? `no llega: le ${verbo} ${casillas} y la muralla o las unidades cortan el camino`
    : `no llega: le ${verbo} ${casillas}`;
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
  if (m.muros.length === 0 || hasTrait(s.unit, 'flying') || hexSize(s.unit) > 1) return null;
  const blocked = cerradasPara(state, s);
  const sinLados = reachable(
    s.hex,
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
 * muralla, bando, tamaño y destino: la IA pregunta lo mismo varias veces por decisión
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

/** El recorrido hacia atrás desde `destino`, guardado por muralla, bando, tamaño y destino. */
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
  const size = hexSize(s.unit);
  // Con las puertas abiertas: el camino cambia al abrir, y una caché solo por
  // muralla devolvería el de antes (criterio 24 de la muralla alta).
  const clave = `${claveDeAbiertas(state.puertas)}|${s.side}|${size}|${para}|${destino.map(hexKey).join('|')}`;
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
  // Sin munición solo se queda quien la cuenta (la criatura del catálogo).
  const tiros = tirosQueQuedan(s);
  if (tiros !== null && tiros <= 0) return 'se ha quedado sin munición';
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
  const trasLaFinta = fintaBlocker(state, 'attack');
  if (trasLaFinta !== null) return trasLaFinta;
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
 * `s` donde golpeará (una copia en `from`, que nadie mueve aquí) y la carga. Lanza
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
): { readonly target: BattleStack; readonly desdeAhi: BattleStack; readonly carga: number } {
  const enCurso = golpeEnCursoBlocker(state, accion, completa);
  if (enCurso !== null) throw new Error(enCurso);
  const target = stackById(state, accion.target);
  const motivo = golpeBlocker(state, s, target, accion.from, costes);
  if (motivo !== null) throw new Error(motivo);
  const sinCruce = cruceBlocker(state, accion, completa);
  if (sinCruce !== null) throw new Error(sinCruce);
  const { from } = accion;
  return {
    target,
    // Golpea desde `from`: desde ahí se mira si el objetivo le alcanza para
    // devolverlo.
    desdeAhi: from === undefined ? s : { ...s, hex: from },
    // La carga se mide ANTES de mover, desde donde empieza este tramo: es la
    // regla del usuario, «se puede mover un tramo y se vuelve a calcular». Lo
    // recorrido en tramos anteriores no cuenta, y por eso no hace falta guardarlo
    // en ningún sitio: viaja hasta el golpe como argumento. Y se mide contra ESTE
    // objetivo: carga solo si está en la recta. Con la rueda, quien se plantó ya
    // anduvo y desde donde está no hay recta que medir: la carrera la guardó
    // `golpeEnCurso` al plantarse.
    carga:
      state.golpeEnCurso !== null
        ? state.golpeEnCurso.carga
        : from === undefined
          ? 0
          : cargaDesde(state, s, from, target),
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
  return esEse
    ? null
    : `${g.stack} está plantado ante ${g.target}: elige en la rueda o cancela el golpe`;
}

/**
 * ¿Es este `attack` un «plantarse»? Con la rueda, el golpe que llega sin ninguna
 * de las dos elecciones y sin otro plantado: anda hasta `from` y espera la rueda
 * (`golpeEnCurso`), sin cerrar el turno. Primero se anda, luego se elige (decisión
 * del usuario, 13-10-2026).
 */
function esPlantarse(state: BattleState, accion: BattleAction & { type: 'attack' }): boolean {
  return (
    conRueda(state) &&
    state.golpeEnCurso === null &&
    accion.golpe === undefined &&
    accion.respuesta === undefined
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
      ? reachable(s.hex, pasos, new Set())
      : andando.paso !== undefined && s.side === 'attacker' && !enLoAlto(state, s)
        ? reachable(
            s.hex,
            pasos,
            new Set([...andando.cerradas, ...casillasDeMuro(state.muralla)]),
            pasoPorPuertas(state.muralla, state.puertas),
          )
        : reachable(s.hex, pasos, andando.cerradas, andando.paso);

  const out = new Map<string, Paso>();
  const tamaño = hexSize(info);
  for (const [key, paso] of dist) {
    if (hexEquals(paso.at, s.hex) || celdaQueNoCabe(paso.at, s, blocked) !== null) continue;
    // La grande que vuela no se posa con una puerta cerrada entre la cabeza y la
    // cola; la que anda ya no llega (`cierreDeLaMuralla`, `recorrer`).
    if (volando && partidaPorUnaPuerta(state.muralla, state.puertas, paso.at, tamaño, s.side)) {
      continue;
    }
    out.set(key, paso);
  }
  return out;
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
    // Con el interruptor (c) en fheroes2, 1/12 por punto y no 1/24. El perdón que
    // allí tiene la IA (1 de cada 4 se libra) NO se copia (decisión del usuario):
    // en la arena la persona y la IA se mezclan en un bando.
    const moral = s.morale;
    if (moral < 0 && rng.chance(-moral * probabilidadDeMoralBaja(state.reglas))) {
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
 * La probabilidad por punto de moral negativa de perder el turno: la nuestra,
 * `CHANCE_PER_POINT` (1/24, la misma que la moral alta), o la de fheroes2, que
 * tira un dado de 12:
 *
 * ```cpp
 *     else if ( morale < 0 && static_cast<int>( Rand::GetWithGen( 1, 12, randomGenerator ) ) <= -morale ) {
 *         // AI is given a cheeky 25% chance to avoid it - because they build armies from random troops
 *         if ( isControlHuman() || ( Rand::GetWithGen( 1, 4, randomGenerator ) != 1 ) ) {
 * ```
 * https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_troop.cpp#L308-L310
 */
export function probabilidadDeMoralBaja(reglas: ReglasDeBatalla): number {
  return reglas.moralBaja === 'fheroes2' ? MORAL_BAJA_FHEROES2 : CHANCE_PER_POINT;
}
const MORAL_BAJA_FHEROES2 = 1 / 12;

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
 * Cierra el turno del stack activo y decide si la moral le regala otro. Con el
 * interruptor (d) en fheroes2, quien cerró defendiendo (`TR_SKIP`) no tira la
 * moral alta:
 *
 * ```cpp
 *             if ( _currentUnit->AllModes( TR_MOVED | MORALE_GOOD ) && !_currentUnit->Modes( TR_SKIP ) && _currentUnit->GetSpeed( false, true ) > Speed::STANDING ) {
 * ```
 * https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_arena.cpp#L537
 *
 * Sin tirar, no gasta `rng.chance`: la arena con (d) desplaza las tiradas
 * siguientes, como la Bendición de (e).
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

  // `defending` se borra al empezar la ronda y quien defiende cierra su turno
  // ahí mismo: si está puesto, este turno se cerró defendiendo.
  const sinMoral = s.defending && state.reglas.defender === 'fheroes2';
  const moral = s.morale;
  if (
    conMoral &&
    !sinMoral &&
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
 * turno empieza y se pierde. Sin rueda no hay ninguno, y no se escribe nada.
 */
function quitarLosQueVencen(state: BattleState, s: BattleStack, al: VenceLaRueda, n: number): void {
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
 * distinguirlo mirándolo. Quien lo calculó dice de qué turno (`n`) y con
 * cuánto gastado, y `applyAction` lo compara con el de ahora: el ordinal ya
 * dice de quién es, y lo gastado, de qué tramo. Y con qué puertas abiertas
 * (`claveDeAbiertas`): abrir o cerrar una no gasta casillas ni cambia de turno,
 * pero sí el recorrido.
 */
export interface Movibles {
  readonly n: number;
  readonly gastado: number;
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
  if (
    movibles !== undefined &&
    (!mismoTurno(movibles, turno) || movibles.gastado !== turno.gastado)
  ) {
    throw new Error(
      `el recorrido que traes es del turno ${movibles.n} con ${movibles.gastado} casillas gastadas, ` +
        `y ahora es el turno ${turno.n} de ${s.id} con ${turno.gastado}`,
    );
  }
  if (movibles !== undefined && movibles.puertas !== claveDeAbiertas(state.puertas)) {
    throw new Error(
      'el recorrido que traes es de antes de abrir o cerrar una puerta: el camino ha cambiado',
    );
  }
  // Con un golpe plantado no se juega otra cosa: ni el hechizo del héroe, que no
  // cierra el turno, ni una rendición.
  const enCurso = golpeEnCursoBlocker(state, action);
  if (enCurso !== null) throw new Error(enCurso);
  if (state.golpeEnCurso !== null && state.golpeEnCurso.stack !== s.id) {
    throw new Error(`el golpe plantado es de ${state.golpeEnCurso.stack}, y le toca a ${s.id}`);
  }
  const trasLaFinta = fintaBlocker(state, action.type);
  if (trasLaFinta !== null) throw new Error(`${s.id}: ${trasLaFinta}`);

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
      if (turno.finta !== undefined || !quedaAlgoQueHacer(state)) endTurn(state, s, rng);
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
      const { target, carga } = golpePreparado(state, s, action, !plantarse, recorrido);
      // Primero se anda (con la carga en su `move`), luego el cruce y el golpe:
      // de una vez o en dos jugadas, el registro dice lo mismo en el mismo orden.
      if (action.from !== undefined) moveTo(state, s, action.from, recorrido(), carga > 0);
      if (plantarse) {
        // Ni cierra el turno aunque haya gastado sus casillas, ni escribe aún
        // ningún cruce: espera la rueda. Soltarlo es `soltarElGolpe`.
        state.golpeEnCurso = { stack: s.id, target: target.id, carga };
        return;
      }
      state.golpeEnCurso = null;
      const cruce = cruceDeLaRueda(state, s, target, action);
      melee(state, s, target, rng, carga, cruce);
      // Con la Finta el turno sigue, solo para andar, si le queda a dónde y la
      // pelea no ha acabado con este golpe. Si no, se cierra como siempre.
      if (turno.finta !== undefined) {
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

    case 'poder': {
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
  const trasLaFinta = fintaBlocker(state, 'surrender');
  if (trasLaFinta !== null) return trasLaFinta;
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
 * pierde. Si ya no le queda nada que hacer, el turno se cierra, como el `move`
 * que agota. Solo la llama la sesión de la arena; sin golpe plantado lanza.
 */
export function soltarElGolpe(state: BattleState, rng: Rng): void {
  const g = state.golpeEnCurso;
  if (g === null) throw new Error('no hay ningún golpe plantado que soltar');
  const s = activeStack(state);
  if (s === null || s.id !== g.stack) {
    throw new Error(`el golpe plantado es de ${g.stack}, y no le toca`);
  }
  state.golpeEnCurso = null;
  if (!quedaAlgoQueHacer(state)) endTurn(state, s, rng);
}

/**
 * La longitud de la recta de carga si `s` golpeara a `target` desde `from`; 0 si
 * no carga. ÚNICA regla de CUÁNDO hay carga (decisiones del usuario,
 * 02-10-2026): solo las criaturas con `charge`, solo si `from` está **en línea
 * recta** desde donde está ahora —una de las 6 rectas del hexágono, sin giros—,
 * con la recta libre de unidades, a **`CARGA_MINIMA` casillas o más**, y con
 * **el enemigo en esa misma recta**: la casilla que sigue a `from` tiene que ser
 * suya. «El enemigo tiene que estar en la línea recta, no se puede cargar contra
 * un enemigo que esté al lado»: un golpe que llega a la recta y luego gira para
 * pegar al de al lado no carga, y uno pegado de salida tampoco —la recta mide 0—.
 * Con un enemigo de dos casillas basta con que una lo sea. Cuánto suma lo dice
 * `damage.ts`, que aplica el tope y el bono (`cargaEfectiva`): aquí no se
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
  if (!hasTrait(s.unit, 'charge')) return 0;
  // La recta es un recorrido: con muralla, la cola de la grande tampoco la cruza.
  const andando = alAndar(state, s, bloqueadas ?? cerradasPara(state, s));
  const d = rectaLibre(s.hex, from, andando.cerradas, andando.paso);
  if (d === null || d < CARGA_MINIMA) return 0;
  const hacia = siguienteEnRecta(s.hex, from);
  if (hacia === null || !stackHexes(target).some((h) => hexEquals(h, hacia))) return 0;
  return d;
}

/** Por debajo de esto no hay carga: hace falta arrancar (decisión del usuario). */
export const CARGA_MINIMA = 3;

/**
 * Las cargas que `s` tiene a mano en este tramo: a qué enemigo, desde qué
 * casilla a la que puede ir y con cuántas casillas COBRARÍA —ya recortadas por
 * `cargaEfectiva`—. Es lo que se ENSEÑA —el enemigo marcado y su casilla con su
 * «»N» en el cliente, el `chargeFrom` del agente— y sale de `cargaDesde` y
 * `cargaEfectiva`, las mismas que cobran, así que el anuncio no puede discrepar
 * del golpe. Una casilla vacía de la recta sin enemigo detrás no sale: desde ahí
 * solo se mueve. Sin el rasgo, `SIN_CARGAS`.
 */
export function casillasDeCarga(state: BattleState, s: BattleStack): readonly CasillaDeCarga[] {
  if (!hasTrait(s.unit, 'charge')) return SIN_CARGAS;
  // Tras la Finta no hay golpe que cobrarla: solo se anda.
  if (state.turno?.stack === s.id && state.turno.finta !== undefined) return SIN_CARGAS;
  const bloqueadas = cerradasPara(state, s);
  const enemigos = enemiesOf(state, s);
  const out: CasillaDeCarga[] = [];
  for (const paso of movableFrom(state, s).values()) {
    for (const e of enemigos) {
      const recta = cargaDesde(state, s, paso.at, e, bloqueadas);
      if (recta > 0) out.push({ target: e.id, at: paso.at, hexes: cargaEfectiva(recta) });
    }
  }
  return out;
}

/** Una carga posible: contra quién, desde qué casilla y con cuántas casillas. */
export interface CasillaDeCarga {
  readonly target: string;
  readonly at: Hex;
  readonly hexes: number;
}

/**
 * Ninguna carga. Una sola instancia para quien no tiene nada que enseñar —sin
 * el rasgo, sin turno propio, el espectador—, en vez de una lista vacía por cada
 * sitio que la necesita.
 */
export const SIN_CARGAS: readonly CasillaDeCarga[] = Object.freeze([]);

/** Mueve el stack y le apunta al turno lo que cuesta el camino. */
function moveTo(
  state: BattleState,
  s: BattleStack,
  to: Hex,
  costes?: ReadonlyMap<string, Paso>,
  carga = false,
): void {
  // El coste real del camino, no la distancia en línea recta: rodear a un
  // enemigo cuesta más casillas del presupuesto. Sale del mismo recorrido que
  // decide si el destino es legal, así que no hay una segunda cuenta que pueda
  // discrepar de la primera — y si el llamante ya lo hizo, es literalmente ese.
  const paso = (costes ?? movableFrom(state, s)).get(hexKey(to));
  if (paso === undefined) {
    const motivo = movimientoBlocker(state, to) ?? 'el recorrido que trae no es de este tramo';
    throw new Error(`${s.id} no puede moverse a (${to.col},${to.row}): ${motivo}`);
  }

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
  state.log.push({ kind: 'move', stack: s.id, to, path, ...(carga ? { charge: true } : {}) });
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
  const info = stack.unit;
  // La Maldición de fheroes2 (`tirada` −1) tampoco les llega: allí la Bendición y
  // la Maldición son `isAliveOnly`, y a un no-muerto no le hacen nada.
  // https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/spell/spell.cpp#L577-L588
  // https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/monster/monster_info.cpp#L900-L902
  return (
    (effect.kind === 'luck' || effect.kind === 'tirada') &&
    effect.amount < 0 &&
    hasTrait(info, 'undead')
  );
}

/**
 * Cuelga un efecto del stack y lo cuenta en el registro.
 * Si el objetivo es inmune no se acumula nada y se anota el rebote: sin esto
 * una momia dejaría tres maldiciones sobre un esqueleto que no las siente.
 */
function applyStackEffect(state: BattleState, target: BattleStack, effect: StackEffect): void {
  const colgado = colgarEfecto(target, effect);
  if (colgado.inmune) {
    state.log.push({ kind: 'immune', stack: target.id, source: effect.source });
    return;
  }
  for (const quitado of colgado.quitadas) {
    state.log.push({ kind: 'effect_end', stack: target.id, source: quitado.source });
  }
  // Lo que se anota es el efecto YA colgado, no el que se pidió: si refrescó a
  // uno del mismo origen, las rondas que se leen en el parte son las que de
  // verdad le quedan.
  const vivo = colgado.vivo;
  state.log.push({
    kind: 'effect',
    stack: target.id,
    effect: vivo.kind,
    amount: vivo.amount,
    source: vivo.source,
    rounds: vivo.roundsLeft,
    ...(vivo.hasta === undefined ? {} : { hastaSuTurno: vivo.hasta.al }),
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
  const r = castSpell(s, l, target, autor, state.reglas);
  anotar(r);
  if (r.effect !== undefined) applyStackEffect(state, target, r.effect);
}

/**
 * Cuelga `effect` de `target` sin anotar nada: rebota en el inmune, quita la
 * contraria y refresca o añade (`applyEffect`). La parte pura de
 * `applyStackEffect`, que anota lo que pasó; la previsión del contraataque la
 * usa sobre su copia del objetivo, así que las dos cuelgan igual.
 */
function colgarEfecto(
  target: BattleStack,
  effect: StackEffect,
):
  | { readonly inmune: true }
  | {
      readonly inmune: false;
      readonly quitadas: readonly StackEffect[];
      readonly vivo: StackEffect;
    } {
  if (isImmuneTo(target, effect)) return { inmune: true };
  // La Bendición y la Maldición de fheroes2 se sustituyen: la nueva quita la
  // contraria, sea del hechizo o de la momia.
  //
  // ```cpp
  //     case Spell::BLESS:
  //     case Spell::MASSBLESS:
  //         _replaceAffection( SP_CURSE, SP_BLESS, duration );
  // // …
  //     case Spell::CURSE:
  //     case Spell::MASSCURSE:
  //         _replaceAffection( SP_BLESS, SP_CURSE, duration );
  // ```
  // https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/battle/battle_troop.cpp#L1180-L1193
  const quitadas = quitarLaContraria(target, effect);
  return { inmune: false, quitadas, vivo: applyEffect(target, effect) };
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
 * Quita la `tirada` contraria a `effect` y devuelve las quitadas: la nueva
 * Bendición se lleva la Maldición, y al revés (`colgarEfecto`).
 */
function quitarLaContraria(target: BattleStack, effect: StackEffect): StackEffect[] {
  if (effect.kind !== 'tirada') return [];
  const contraria = (e: StackEffect): boolean =>
    e.kind === 'tirada' && e.amount > 0 !== effect.amount > 0;
  const quitadas = target.effects.filter(contraria);
  if (quitadas.length > 0) target.effects = target.effects.filter((e) => !contraria(e));
  return quitadas;
}

/**
 * Con la rueda, el cruce del golpe de `s` a `target` (ya validado por
 * `cruceBlocker`), escrito en el registro; sin ella, `null`.
 */
function cruceDeLaRueda(
  state: BattleState,
  s: BattleStack,
  target: BattleStack,
  action: BattleAction & { type: 'attack' },
): HechoDelCruce | null {
  if (!conRueda(state)) return null;
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
    punto: puntoDelCruce(golpe, respuesta),
  };
  state.log.push(cruce);
  return cruce;
}

/**
 * Un golpe de la rueda para el daño: su tipo, los puntos del cruce en que puede
 * caer y quién lo eligió (`papel`: el golpe, o la respuesta en el contraataque,
 * que no da bonificadores).
 */
interface GolpeEnLaRueda {
  readonly tipo: TipoDeGolpe;
  readonly desde: Punto;
  readonly hasta: Punto;
  readonly papel: PapelEnLaRueda;
}

/** El golpe que se da: cae en un solo punto, el del cruce. */
function enElPunto(tipo: TipoDeGolpe, punto: Punto, papel: PapelEnLaRueda): GolpeEnLaRueda {
  return { tipo, desde: punto, hasta: punto, papel };
}

/** Lo que puede dar un sector de la rueda sin saber el cruce: sus puntos posibles. */
function delSector(tipo: TipoDeGolpe, papel: PapelEnLaRueda): GolpeEnLaRueda {
  const [desde, hasta] = puntosDe(tipo);
  return { tipo, desde, hasta, papel };
}

function melee(
  state: BattleState,
  attacker: BattleStack,
  target: BattleStack,
  rng: Rng,
  carga: number,
  cruce: HechoDelCruce | null,
): void {
  intercambio(
    state,
    attacker,
    target,
    rng,
    false,
    carga,
    cruce === null ? null : enElPunto(cruce.golpe, cruce.punto, 'golpe'),
  );

  // Romper guardia, tras el golpe y antes del contraataque: quita ataque al
  // atacado ya en él, y en su próximo turno (decisión del usuario, 14-10-2026).
  if (cruce !== null && isAlive(target)) {
    colgarDeLaRueda(state, target, cruce.golpe, cruce.punto, 'rival');
  }

  // Contraataque: uno por ronda, y solo si el atacante lo permite.
  if (isAlive(target) && isAlive(attacker) && devolveraElGolpe(state, attacker, target)) {
    // El contraataque no carga: se devuelve el golpe desde donde se está. Con la
    // rueda, con el tipo de la respuesta y en el punto contrario, sin
    // bonificadores: solo cuentan el Fuerte y el Rápido.
    target.retaliated = true;
    intercambio(
      state,
      target,
      attacker,
      rng,
      true,
      0,
      cruce === null
        ? null
        : enElPunto(cruce.respuesta, puntoDelContraataque(cruce.punto), 'respuesta'),
    );
  }

  // La Finta: el resto del turno, un tramo solo de andar con lo que le quede menos
  // lo que quita su éxito. Si queda en algo lo decide `applyAction`.
  if (cruce !== null && cruce.golpe === 'finta' && isAlive(attacker) && state.turno !== null) {
    state.turno.finta = casillasQueQuitaLaFinta(cruce.punto);
  }
}

/**
 * Los golpes de `quien` a `contra` en un intercambio: el golpe o, con
 * `retaliation`, el contraataque. Con la rueda, lo que el golpe deja a quien pega
 * (Defensivo) va antes: cubre ya lo que venga. La respuesta no deja nada. Luego,
 * `golpesDe` golpes mientras `contra` siga en pie.
 */
function intercambio(
  state: BattleState,
  quien: BattleStack,
  contra: BattleStack,
  rng: Rng,
  retaliation: boolean,
  carga: number,
  golpe: GolpeEnLaRueda | null,
): void {
  if (golpe !== null && golpe.papel === 'golpe') {
    colgarDeLaRueda(state, quien, golpe.tipo, golpe.desde, 'propio');
  }
  const veces = golpesDe(quien.unit, golpe?.tipo ?? null, retaliation);
  for (let i = 0; i < veces && isAlive(contra); i++) {
    strike(state, quien, contra, rng, retaliation, carga, golpe);
  }
}

/**
 * Cuelga sobre `s` el efecto de un golpe de tipo `tipo` que cayó en el punto `p`
 * (`efectoDeLaRueda`) si es para él (`a`: quien pega o el atacado): dura hasta que
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
): void {
  const efecto = efectoDeLaRueda(tipo, p);
  if (efecto === null || efecto.a !== a) return;
  applyStackEffect(state, s, deLaRueda(state, tipo, efecto));
}

/**
 * El `StackEffect` de un efecto de la rueda colgado ahora: lo leen el golpe
 * (`colgarDeLaRueda`) y la previsión del contraataque, que lo cuelga en su copia.
 */
function deLaRueda(state: BattleState, tipo: TipoDeGolpe, efecto: EfectoDeLaRueda): StackEffect {
  const n = state.turno?.n;
  if (n === undefined) throw new Error('la rueda cuelga un efecto sin turno abierto');
  return {
    kind: efecto.kind,
    amount: efecto.amount,
    source: tipo,
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
 * Los efectos al golpear con el interruptor (e) en fheroes2 (`efectoConReglas`):
 * la Maldición de la momia es daño mínimo en vez de suerte −1, como la del
 * hechizo (decisión del usuario, 09-10-2026). En fheroes2 la momia lanza el
 * hechizo de verdad (`SPELL_CASTER`, 20 %, `CURSE`); aquí sigue siendo nuestro
 * rasgo —siempre, 3 rondas— y solo cambia lo que hace. Calculados una vez, no en
 * cada golpe.
 * https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/monster/monster_info.cpp#L491
 */
const ON_HIT_EFFECTS_BENDICION_FHEROES2: readonly { trait: CreatureTrait; effect: StackEffect }[] =
  ON_HIT_EFFECTS.map((x) => ({
    trait: x.trait,
    effect: efectoConReglas(x.effect, { bendicion: 'fheroes2' }),
  }));

/** Lo que deja pegado un golpe con este rasgo, con las reglas de la batalla. */
function efectosAlGolpear(
  reglas: ReglasDeBatalla,
): readonly { trait: CreatureTrait; effect: StackEffect }[] {
  return reglas.bendicion === 'nuestra' ? ON_HIT_EFFECTS : ON_HIT_EFFECTS_BENDICION_FHEROES2;
}

/**
 * Las opciones del daño de un golpe de `attacker` a `target` en esta batalla: sus
 * reglas y, con el interruptor (f) en fheroes2, el ataque del héroe del que pega
 * y la defensa del héroe del que recibe, sumados a la tropa (no al héroe, que en
 * fheroes2 no pisa el tablero y aquí ya los lleva en su cuerpo):
 *
 * ```cpp
 * uint32_t ArmyTroop::GetAttack() const
 * {
 *     return Troop::GetAttack() + ( _army && _army->GetCommander() ? _army->GetCommander()->GetAttack() : 0 );
 * }
 * ```
 * https://github.com/ihhub/fheroes2/blob/9754feff8501dbb69df95f3b999156a32eb8d7d3/src/fheroes2/army/army_troop.cpp#L158-L166
 *
 * Es la ÚNICA forma de montarlas: la usan el golpe, el disparo, la IA y la
 * previsión.
 */
export function opcionesDeDanio(
  state: BattleState,
  attacker: BattleStack,
  target: BattleStack,
  extra: Omit<DamageOptions, ExtraDelEstado> = SIN_EXTRA,
  golpe: GolpeEnLaRueda | null = null,
): DamageOptions {
  const o = opcionesDelEstado(state, attacker, target, extra);
  return golpe === null ? o : conElGolpe(o, golpe);
}

/**
 * Las opciones con la rueda: la única traducción del golpe a los números del
 * daño (`cruceDelGolpe`). La previsión de la rueda la pide sobre las mismas
 * opciones para cada tipo.
 */
function conElGolpe(o: DamageOptions, golpe: GolpeEnLaRueda): DamageOptions {
  return { ...o, cruce: cruceDelGolpe(golpe.tipo, golpe.desde, golpe.hasta, golpe.papel) };
}

function opcionesDelEstado(
  state: BattleState,
  attacker: BattleStack,
  target: BattleStack,
  extra: Omit<DamageOptions, ExtraDelEstado>,
): DamageOptions {
  const reglas = state.reglas;
  // Lo alto de un muro (`bonoEnLoAlto`) también sale del estado: así lo cuentan
  // a la vez el golpe, el disparo, la IA, la ficha y la previsión.
  const alto = bonoEnLoAlto(state, target);
  const enLoAlto = alto > 0 ? { bonoEnLoAlto: alto } : SIN_EXTRA;
  if (reglas.heroe === 'nuestra') {
    // La IA pide estas cientos de veces por decisión, casi siempre sin nada
    // más: un objeto por reglas, no uno por pareja.
    if (extra === SIN_EXTRA && alto === 0) return soloLasReglas(reglas);
    return { reglas, ...extra, ...enLoAlto };
  }
  return {
    reglas,
    ...extra,
    ...enLoAlto,
    ataqueDelMando: delMando(state, attacker)?.ataque ?? 0,
    defensaDelMando: delMando(state, target)?.defensa ?? 0,
  };
}

/**
 * Lo de `DamageOptions` que no se pide: lo pone `opcionesDeDanio` desde el estado
 * y, el `cruce`, desde el golpe de la rueda.
 */
type ExtraDelEstado = 'reglas' | 'ataqueDelMando' | 'defensaDelMando' | 'bonoEnLoAlto' | 'cruce';

const SIN_EXTRA: Omit<DamageOptions, ExtraDelEstado> = Object.freeze({});
const OPCIONES_SOLO_REGLAS = new WeakMap<ReglasDeBatalla, DamageOptions>();

/** Las opciones con solo las reglas: una por `ReglasDeBatalla`, que no cambian. */
function soloLasReglas(reglas: ReglasDeBatalla): DamageOptions {
  let o = OPCIONES_SOLO_REGLAS.get(reglas);
  if (o === undefined) {
    o = Object.freeze({ reglas });
    OPCIONES_SOLO_REGLAS.set(reglas, o);
  }
  return o;
}

/** El héroe que manda a `s`, si es tropa y su bando lleva héroe. */
function delMando(state: BattleState, s: BattleStack): BattleHero | null {
  return s.origen.kind === 'heroe' ? null : state.heroes[s.side];
}

/**
 * El ataque y la defensa con que pelea `s` ahora, para la ficha: los de
 * `ataqueYDefensa`, la cuenta del golpe, con `s` a los dos lados —su ataque al
 * pegar con el arma de `uso` (la de cuerpo a cuerpo si no se dice) y su defensa
 * al recibir—.
 */
export function ataqueYDefensaEnBatalla(
  state: BattleState,
  s: BattleStack,
  uso: UsoDeArma = 'cuerpo',
): { readonly ataque: number; readonly defensa: number } {
  return ataqueYDefensa(s, s, opcionesDeDanio(state, s, s), uso);
}

const PIEZAS_POR_PELEA = new WeakMap<readonly Pieza[], EquipoAtado>();

/**
 * Las piezas con que se pelea: las del juego y, en la arena, las suyas encima
 * (`BattleState.piezasDeArena`, que validó al montarla `catalogoDeLaArena`: una
 * con el id de una del juego la sustituye). Hechas una vez por cada lista: las
 * leen la previsión, para nombrar el arma de cada golpe, y la ficha de la pelea.
 */
export function piezasDeLaPelea(state: BattleState): EquipoAtado {
  const encima = state.piezasDeArena;
  if (encima === undefined) return EQUIPO_DEL_JUEGO;
  let eq = PIEZAS_POR_PELEA.get(encima);
  if (eq === undefined) {
    eq = equipoCon(new Map([...PIEZAS_DEL_CATALOGO, ...encima.map((p) => [p.id, p] as const)]));
    PIEZAS_POR_PELEA.set(encima, eq);
  }
  return eq;
}

function strike(
  state: BattleState,
  attacker: BattleStack,
  target: BattleStack,
  rng: Rng,
  retaliation: boolean,
  carga: number,
  golpe: GolpeEnLaRueda | null,
): void {
  const info = attacker.unit;
  const result = computeDamage(
    attacker,
    target,
    rng,
    opcionesDeDanio(state, attacker, target, { chargeHexes: carga }, golpe),
  );
  const killed = herir(target, result.damage, attacker);

  if (result.lucky) state.log.push({ kind: 'luck', stack: attacker.id, good: true });
  if (result.unlucky) state.log.push({ kind: 'luck', stack: attacker.id, good: false });

  state.log.push({
    kind: 'attack',
    stack: attacker.id,
    target: target.id,
    damage: result.damage,
    killed,
    retaliation,
    // La carga la dice `computeDamage`, que es quien la cobró: preguntarlo otra
    // vez aquí dejaba el parte contando 7 hexes mientras el bono se había
    // topado en los 5 que caben en +50 %.
    ...(result.charge > 0 ? { charge: result.charge } : {}),
    // Con la rueda, el punto en que cayó: el golpe que se da va en uno solo.
    ...(golpe === null ? {} : { punto: golpe.desde }),
  });

  // Los vampiros señores recuperan efectivos con lo que drenan.
  if (hasTrait(info, 'life_drain') && !retaliation) {
    healFromDrain(attacker, result.damage);
  }

  // Lo que el golpe deja pegado. Va ANTES del contraataque a propósito: al
  // dragón óseo le devuelven el golpe ya asustados, que es donde se nota.
  // Un contraataque no asusta ni maldice: solo el que ataca de verdad.
  if (!retaliation && isAlive(target)) {
    for (const { trait, effect } of efectosAlGolpear(state.reglas)) {
      if (hasTrait(info, trait)) applyStackEffect(state, target, effect);
    }
  }

  if (!isAlive(target)) state.log.push({ kind: 'perished', stack: target.id });
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
  // Solo gasta quien cuenta tiros (la criatura del catálogo): el arma a distancia
  // de la arena no lleva munición.
  if (cuentaTiros(info)) shooter.shotsLeft -= 1;
  const shots = hasTrait(info, 'double_shot') ? 2 : 1;

  for (let i = 0; i < shots && isAlive(target); i++) {
    const distance = distanciaDeDisparo(shooter, target);
    const result = computeDamage(
      shooter,
      target,
      rng,
      opcionesDeDanio(state, shooter, target, { ranged: true, distance }),
    );
    const killed = herir(target, result.damage, shooter);

    // La mala suerte también se anota, como en el golpe: sin ella, quien lee el
    // registro (la previsión y su test) no sabía qué rama había caído.
    if (result.lucky) state.log.push({ kind: 'luck', stack: shooter.id, good: true });
    if (result.unlucky) state.log.push({ kind: 'luck', stack: shooter.id, good: false });
    state.log.push({
      kind: 'shoot',
      stack: shooter.id,
      target: target.id,
      damage: result.damage,
      killed,
    });
    if (!isAlive(target)) state.log.push({ kind: 'perished', stack: target.id });

    if (hasTrait(info, 'splash_shot')) splash(state, shooter, target, result.damage);
  }
}

/** Las casillas entre un tirador y su objetivo: lo que mira la regla de la distancia. */
function distanciaDeDisparo(shooter: BattleStack, target: BattleStack): number {
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
    const killed = herir(otro, damage, shooter);
    state.log.push({
      kind: 'shoot',
      stack: shooter.id,
      target: otro.id,
      damage,
      killed,
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
  const trasLaFinta = fintaBlocker(state, 'cast');
  if (trasLaFinta !== null) return trasLaFinta;
  if (hero.castThisRound) return 'el héroe ya lanzó un hechizo esta ronda';
  // El id se comprueba contra el libro ANTES de buscarlo en el catálogo: con un
  // id inventado, "no lo conoce" es más cierto y más útil que reventar.
  if (!hero.spells.includes(spellId)) return `el héroe no conoce "${spellId}"`;
  const s = spell(spellId);
  if (hero.mana < s.cost) return `maná insuficiente: cuesta ${s.cost} y quedan ${hero.mana}`;

  if (targetId !== undefined) {
    const target = state.stacks.find((t) => t.id === targetId);
    if (target === undefined) return `no hay ninguna unidad "${targetId}"`;
    return targetBlocker(state, hero, s, side, target);
  }
  return state.stacks.some((t) => targetBlocker(state, hero, s, side, t) === null)
    ? null
    : 'no hay ningún objetivo válido';
}

/** Por qué este stack no vale como objetivo de este hechizo. */
function targetBlocker(
  state: BattleState,
  hero: BattleHero,
  s: Spell,
  side: Side,
  target: BattleStack,
): string | null {
  return objetivoBlocker(
    target,
    side,
    s,
    efectoDe(s, delHeroe(s, hero), state.reglas),
    `"${s.name}"`,
  );
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
 * Reglas nuestras (`data/poderes.json`, solo la arena): a un aliado vivo, también
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
  const trasLaFinta = fintaBlocker(state, 'poder');
  if (trasLaFinta !== null) return { motivo: trasLaFinta };
  // Un id inventado se dice, no revienta: llega de fuera (un test, el arnés).
  const p = poderSiExiste(poderId);
  if (p === null) return { motivo: `no hay ningún poder «${poderId}»` };
  if (!(s.unit.poderes ?? []).includes(poderId)) {
    return { motivo: `${s.unit.name} no sabe ${p.nombre}` };
  }
  if (seHaMovido(state, s)) {
    return { motivo: `ya se ha movido este turno: «${p.nombre}» se usa al principio del turno` };
  }
  return { s, p, efecto: efectoDe(p.hechizo, p.lanzador, state.reglas) };
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
 * esa cifra y si habrá contraataque. Las reglas en curso van en `reglas` (las
 * que no son las del juego, para decirlas).
 */
export interface PrevisionDeGolpe {
  readonly kind: 'golpe' | 'disparo';
  readonly atacante: string;
  readonly objetivo: string;
  /** 2 con `double_attack` o `double_shot`; el segundo, si el objetivo sigue en pie. */
  readonly golpes: number;
  readonly danio: Horquilla;
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
  readonly reglas: readonly NombreDeRegla[];
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
  readonly bajas: number | null;
  readonly leQuedan: number | null;
  /** Lo que dejaría colgado: Prisa, Lentitud, Bendición, Maldición. */
  readonly efecto: StackEffect | null;
  /** PV que repondría una Curación. */
  readonly cura: number | null;
  readonly reglas: readonly NombreDeRegla[];
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
        accion.golpe === undefined ? null : delSector(accion.golpe, 'golpe'),
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
    case 'poder': {
      const motivo = poderBlocker(state, accion.poder, accion.target);
      if (motivo !== null) throw new Error(`${s.unit.name} no puede usar ese poder: ${motivo}`);
      const p = poder(accion.poder);
      return {
        kind: 'poder',
        poder: p.id,
        ...previsionDeLanzar(state, p.hechizo, p.lanzador, stackById(state, accion.target)),
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
  const h = horquillaDeDanio(
    a,
    t,
    opcionesDeDanio(state, a, t, extra, golpe),
    piezasDeLaPelea(state),
  );
  const golpes =
    kind === 'golpe'
      ? golpesDe(a.unit, golpe?.tipo ?? null, false)
      : hasTrait(a.unit, 'double_shot')
        ? 2
        : 1;
  // Cómo queda el objetivo con `golpes` golpes de `d` cada uno: el segundo solo
  // si el primero no lo tumba, como en `melee` y `shoot`.
  const tras = (d: number): { count: number; topHp: number } => {
    let quedan: { count: number; topHp: number } = { count: t.count, topHp: t.topHp };
    for (let i = 0; i < golpes && quedan.count > 0; i++) {
      quedan = trasElGolpe({ ...quedan, unit: t.unit }, d);
    }
    return quedan;
  };
  const conMenos = tras(h.danio.min);
  const conMas = tras(h.danio.max);
  const vida = (q: { count: number; topHp: number }): number =>
    stackHp({ ...t, count: q.count, topHp: q.topHp });
  return {
    kind,
    atacante: a.id,
    objetivo: t.id,
    golpes,
    danio: h.danio,
    buena: h.buena,
    mala: h.mala,
    bajas: { min: t.count - conMenos.count, max: t.count - conMas.count },
    leQuedan: { min: vida(conMas), max: vida(conMenos) },
    modificadores: h.modificadores,
    contraataque: kind === 'golpe' ? previsionDelContraataque(state, a, t, h, tras, golpe) : null,
    salpica:
      kind === 'disparo' && hasTrait(a.unit, 'splash_shot')
        ? splashTargets(state, t).map((x) => x.id)
        : [],
    reglas: reglasEncendidas(state.reglas),
  };
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
): PrevisionDeContraataque | null {
  if (!devolveraElGolpe(state, a, t)) return null;
  // Con suerte el golpe puede quitar más, o menos, que sin ella.
  const peor = h.mala?.min ?? h.danio.min;
  const mejor = h.buena?.max ?? h.danio.max;
  const conPeor = tras(peor);
  if (conPeor.count === 0) return null;
  const conMejor = tras(mejor);
  // Lo que el golpe le deja, colgado sobre una copia con la misma función que
  // `applyStackEffect`: refrescar, sustituir la contraria, rebotar en el inmune.
  const conLoDelGolpe: BattleStack = { ...t, effects: [...t.effects] };
  for (const { trait, effect } of efectosAlGolpear(state.reglas)) {
    if (hasTrait(a.unit, trait)) colgarEfecto(conLoDelGolpe, effect);
  }
  // Lo de la rueda que el golpe deja a `a` (quien pega o el atacado), en el punto
  // `p` del cruce, sobre una copia.
  const conLaRueda = (x: BattleStack, p: Punto, para: EfectoDeLaRueda['a']): BattleStack => {
    const efecto = golpe === null ? null : efectoDeLaRueda(golpe.tipo, p);
    if (golpe === null || efecto === null || efecto.a !== para) return x;
    const y: BattleStack = { ...x, effects: [...x.effects] };
    colgarEfecto(y, deLaRueda(state, golpe.tipo, efecto));
    return y;
  };
  const copia = (count: number, p: Punto): BattleStack =>
    conLaRueda({ ...conLoDelGolpe, count }, p, 'rival');
  // El que menos devuelve es el que más ha perdido; el que más, el que menos.
  const pocos = copia(conMejor.count === 0 ? 1 : conMejor.count, golpe?.hasta ?? 0);
  const muchos = copia(conPeor.count, golpe?.desde ?? 0);
  // Defensivo, sobre quien pega: no depende del punto.
  const quienPega = golpe === null ? a : conLaRueda(a, golpe.desde, 'propio');
  const piezas = piezasDeLaPelea(state);
  const bajo = horquillaDeDanio(pocos, quienPega, opcionesDeDanio(state, pocos, quienPega), piezas);
  const alto = horquillaDeDanio(
    muchos,
    quienPega,
    opcionesDeDanio(state, muchos, quienPega),
    piezas,
  );
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
  readonly danio: Horquilla;
  readonly golpes: number;
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
  readonly porTipo: Readonly<Record<TipoDeGolpe, SectorDeLaRueda>> | null;
  readonly sinContraataque: string | null;
} {
  if (!conRueda(state)) throw new Error('en esta pelea el golpe es de azar: no hay rueda');
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
  if (papel === 'respuesta' && sinContraataque !== null) return { porTipo: null, sinContraataque };
  // Las opciones, una vez; cada tipo pone encima su sector.
  const opciones = opcionesDeDanio(state, quien, contra, extra);
  const piezas = piezasDeLaPelea(state);
  const porTipo = {} as Record<TipoDeGolpe, SectorDeLaRueda>;
  for (const tipo of TIPOS_DE_GOLPE) {
    const h = horquillaDeDanio(quien, contra, conElGolpe(opciones, delSector(tipo, papel)), piezas);
    porTipo[tipo] = { danio: h.danio, golpes: golpesDe(quien.unit, tipo, devuelve) };
  }
  return { porTipo, sinContraataque };
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
    ...previsionDeLanzar(state, s, delHeroe(s, hero), t),
  };
}

/** Lo que haría `s` lanzado por `l` sobre `t`, con las cuentas que lo aplican (`castSpell`). */
function previsionDeLanzar(
  state: BattleState,
  s: Spell,
  l: Lanzador,
  t: BattleStack,
): PrevisionDeLanzar {
  const base = {
    objetivo: t.id,
    reglas: reglasEncendidas(state.reglas),
    danio: null,
    bajas: null,
    leQuedan: null,
    efecto: null,
    cura: null,
  } as const;
  switch (s.kind) {
    case 'damage': {
      const quedan = trasElGolpe(t, l.cantidad);
      return {
        ...base,
        danio: l.cantidad,
        bajas: t.count - quedan.count,
        leQuedan: stackHp({ ...t, ...quedan }),
      };
    }
    case 'speed':
    case 'luck':
      return { ...base, efecto: efectoDe(s, l, state.reglas) };
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
  const trasLaFinta = fintaBlocker(state, tipo);
  if (trasLaFinta !== null) return trasLaFinta;
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
  const trasLaFinta = fintaBlocker(state, tipo);
  if (trasLaFinta !== null) return trasLaFinta;
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

/** La frase de la grande y el muro: la dicen el despliegue, el paso y la escala. */
const LA_GRANDE_NO_SUBE = 'una unidad de dos casillas no sube a la muralla';

/**
 * Quién no escala nunca, esté donde esté: solo sube por escala el atacante de
 * una casilla que no vuela. Lo leen también `createBattle`, que no le da escalera
 * a quien no podría usarla, y el montaje de la arena (`escaleraDeArenaBlocker`).
 */
export function quienNoEscala(side: Side, unit: UnitInfo): string | null {
  if (side !== 'attacker') return 'quien defiende sube a la muralla andando';
  if (hexSize(unit) > 1) return LA_GRANDE_NO_SUBE;
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
  const trasLaFinta = fintaBlocker(state, tipo);
  if (trasLaFinta !== null) return trasLaFinta;
  const p = state.puertas.find((q) => mismaPuerta(q, puerta));
  if (p === undefined) return `entre ${nombreDePuerta(puerta)} no hay puerta`;
  if (s.side !== 'defender') return 'las puertas las abre y las cierra quien defiende';
  if (seHaMovido(state, s)) {
    return 'ya se ha movido este turno: la puerta se abre o se cierra al principio del turno';
  }
  if (tipo === 'abrir_puerta' && p.abierta) return 'la puerta ya está abierta';
  if (tipo === 'cerrar_puerta' && !p.abierta) return 'la puerta ya está cerrada';
  if (p.cambiadaEn === turno.n) return 'esa puerta ya se ha abierto o cerrado en este turno';
  if (tipo === 'cerrar_puerta') {
    const enMedio = state.stacks.find((o) => {
      if (!isAlive(o)) return false;
      const suyas = stackHexes(o);
      return suyas.some((h) => hexEquals(h, p.a)) && suyas.some((h) => hexEquals(h, p.b));
    });
    if (enMedio !== undefined) {
      return `no se cierra con alguien en medio: ${enMedio.unit.name} ocupa sus dos casillas`;
    }
  }
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
  // Con un golpe plantado, solo ese golpe (`golpeEnCursoBlocker`): sin elegir, que
  // lo elegido es de la rueda.
  if (state.golpeEnCurso !== null) {
    return { actions: [{ type: 'attack', target: state.golpeEnCurso.target }], costs: new Map() };
  }
  // Tras la Finta, el tramo solo de andar (`fintaBlocker`): las casillas del
  // recorrido de siempre, que ya mide lo que le queda (`pasosQueQuedan`), y
  // terminar.
  if (state.turno?.finta !== undefined) {
    const costs = movableFrom(state, s);
    const andar: BattleAction[] = [...costs.values()].map((p) => ({ type: 'move', to: p.at }));
    return { actions: [...andar, { type: 'end_turn' }], costs };
  }

  // Tras moverse solo queda moverse más, golpear o terminar: ni defender, ni
  // esperar, ni disparar (decisión del usuario). Sin moverse, la lista es la de
  // siempre y en el mismo orden: `end_turn` va al final para no cambiar lo que
  // encuentra un `find` de la IA.
  const movido = seHaMovido(state, s);
  // La puerta, la escalera y la subida van delante de `defend`: sin muralla no
  // sale ninguna, y el orden de siempre no cambia.
  const out: BattleAction[] = movido
    ? []
    : [...puertasA(state), ...escalasA(state, s), { type: 'defend' }];
  if (!s.waited && !movido) out.push({ type: 'wait' });

  const info = s.unit;
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
  // entero por sonda para preguntar lo que solo depende de su cabeza y su
  // tamaño era la mitad de su coste. Las casillas del enemigo, una vez por él.
  const tamaño = hexSize(info);
  const miraALaDerecha = s.side === 'attacker';
  // Solo se golpea al mismo nivel (`canReachMelee`): la casilla de la que se
  // sale tiene que estar arriba si el enemigo lo está. El nivel de cada casilla,
  // una vez, fuera del bucle de enemigos.
  const niveles = alcanzables.map((h) => nivelDe(state.muralla, h));
  for (const e of enemies) {
    if (canReachMelee(state, s, e)) out.push({ type: 'attack', target: e.id });
    const suyas = stackHexes(e);
    const nivel = nivelDe(state.muralla, e.hex);
    // Con índice y no con `entries()`: este bucle es el más caliente de la IA,
    // y el iterador con desestructuración doblaba el coste de la función.
    for (let i = 0; i < alcanzables.length; i++) {
      if (niveles[i] !== nivel) continue;
      const h = alcanzables[i] as Hex;
      const mias = occupiedHexes(h, tamaño, miraALaDerecha);
      if (suyas.some((th) => mias.some((oh) => areAdjacent(oh, th)))) {
        out.push({ type: 'attack', target: e.id, from: h });
      }
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

  // Los poderes, solo con alguno (la arena): sin ellos ni se mira, y la lista
  // del juego no cambia ni de contenido ni de orden. Los pares que deja pasar
  // `poderBlocker` —sus mismas dos piezas—: lo que no depende del objetivo (y el
  // efecto) una vez por poder, y luego cada objetivo.
  for (const id of s.unit.poderes ?? []) {
    const previo = previoDelPoder(state, id);
    if ('motivo' in previo) continue;
    for (const t of state.stacks) {
      if (objetivoDelPoderBlocker(previo.s, previo.p, previo.efecto, t) === null) {
        out.push({ type: 'poder', poder: id, target: t.id });
      }
    }
  }

  out.push({ type: 'end_turn' });
  return { actions: out, costs };
}

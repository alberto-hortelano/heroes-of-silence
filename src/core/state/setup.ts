/** Arranque de partida: del plan de mapa a un `GameState` listo para jugar. */
import { factionLineup, tipoDeHeroePorDefecto } from '../data.js';
import { EXPERIENCIA_INICIAL_DE_HEROE } from '../hero/experiencia.js';
import {
  CIFRAS_DEL_HEROE_INICIAL,
  type Hero,
  heroeRecienHecho,
  maxMana,
  maxMovePoints,
} from '../hero/hero.js';
import { withTroops } from '../hero/troop.js';
import { buildMap, generateMapPlan, type MapPlan, validateMapPlan } from '../map/generate.js';
import { createRng, type Rng } from '../rng.js';
import type { Controller, FactionId, PlayerId } from '../types.js';
import { createGame, type GameState } from './game.js';

/** Nombres propios del juego: nada tomado de la serie original. */
const HERO_NAMES: Readonly<Record<FactionId, readonly string[]>> = {
  knight: ['Aldo de Valdeluz', 'Beatriz del Alba', 'Cristóbal Yelmo'],
  necromancer: ['Malaquías', 'Serena la Pálida', 'Ordóñez el Mudo'],
};

export interface NewGameOptions {
  readonly seed?: number;
  readonly plan?: MapPlan;
  readonly controllers?: Readonly<Record<PlayerId, Controller>>;
  /** Regiones por bando del mapa procedimental (#195); excluye `width`/`height`. */
  readonly regionesPorBando?: number;
  readonly width?: number;
  readonly height?: number;
  /**
   * El último día que se juega; por defecto, `MAX_DAYS_POR_DEFECTO`.
   *
   * El `| undefined` está escrito porque con `exactOptionalPropertyTypes` un
   * `maxDays?: number` acepta que la propiedad falte y **rechaza** que valga
   * `undefined`, que es justo lo que trae quien reenvía una opción suya sin
   * mirarla. Mismo idioma que `MapPlan.roads`.
   */
  readonly maxDays?: number | undefined;
}

/**
 * Días de una partida si nadie pide otra cosa.
 *
 * 200 y no 300 porque es lo que ya pedían los dos conductores de verdad cuando
 * cada uno llevaba el suyo; el banco sigue pidiendo sus 300 explícitamente, que
 * es lo que ancla su sha. Ninguna partida de hoy se acerca a ninguno de los dos:
 * el máximo de las 200 del banco es el día 20.
 */
const MAX_DAYS_POR_DEFECTO = 200;

/**
 * Ejército de salida: unos cuantos individuos de la morada 1 y dos de la 2 de
 * la facción. Con el liderazgo provisional (2 y 3) son 10 a 14 de los 20 de un
 * héroe recién hecho, y 4 a 6 individuos de los 6 que lleva además de él: cabe
 * siempre y, salvo con 6, deja hueco para reclutar algo el primer día. Una sola
 * tirada del `rng`, como antes: solo cambia su rango.
 */
export function startingArmy(faction: FactionId, rng: Rng): Hero['army'] {
  const lineup = factionLineup(faction);
  const morada1 = lineup.find((c) => c.morada === 1);
  const morada2 = lineup.find((c) => c.morada === 2);
  let army: Hero['army'] = [];
  if (morada1 !== undefined) army = withTroops(army, morada1.id, rng.int(2, 4));
  if (morada2 !== undefined) army = withTroops(army, morada2.id, 2);
  return army;
}

export function newGame(options: NewGameOptions = {}): GameState {
  const seed = options.seed ?? 1;
  const rng = createRng(seed);

  const plan =
    options.plan ??
    generateMapPlan(rng, {
      ...(options.regionesPorBando === undefined
        ? {}
        : { regionesPorBando: options.regionesPorBando }),
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.height === undefined ? {} : { height: options.height }),
    });

  const problemas = validateMapPlan(plan);
  if (problemas.length > 0) {
    throw new Error(`el plan de mapa no es jugable:\n- ${problemas.join('\n- ')}`);
  }

  const { map, towns, raiders } = buildMap(plan);

  const factionOf = new Map<PlayerId, FactionId>();
  for (const t of plan.towns) {
    if (t.owner !== null && !factionOf.has(t.owner)) factionOf.set(t.owner, t.faction);
  }

  // Los inicios, ORDENADOS por jugador, y de aquí salen las tres cosas que el
  // orden decide: `state.players`, `state.heroes` y el nombre de cada héroe.
  //
  // `currentPlayer` juega por el índice de `state.players`, así que derivarlo
  // del orden en que el plan escribe `heroStarts` le regalaba la iniciativa a
  // quien diseña el mapa: con los inicios del revés, el agente abría la partida
  // el día 1. Diseñar el mapa no puede ser también repartirse el turno, y menos
  // con el equilibrio entre facciones ya declarado frágil (#89).
  //
  // Se ordena aquí, en el único sitio donde el plan se convierte en partida, en
  // vez de exigírselo al agente: una regla que el motor puede cumplir solo no se
  // delega en quien tiene interés en incumplirla. La prosa del contrato se lo
  // dice para que no lo intente.
  const inicios = [...plan.heroStarts].sort((a, b) => a.player - b.player);

  const heroes: Hero[] = inicios.map((inicio, i) => {
    const faction = factionOf.get(inicio.player) ?? 'knight';
    const nombres = HERO_NAMES[faction];
    // La construcción de siempre (`heroeRecienHecho`), con lo que el inicial
    // tiene de más encima: mejores cifras, su tropa, Flecha mágica y dos
    // habilidades.
    const hero: Hero = {
      ...heroeRecienHecho({
        id: `hero-${inicio.player}`,
        owner: inicio.player,
        name: nombres[i % nombres.length] as string,
        faction,
        at: inicio.at,
        experience: EXPERIENCIA_INICIAL_DE_HEROE,
        tipo: tipoDeHeroePorDefecto(faction),
      }),
      ...CIFRAS_DEL_HEROE_INICIAL,
      army: startingArmy(faction, rng),
      spells: ['magic_arrow'],
      // Sabiduría 1 sube el tope a nivel 3. Hoy no muerde —sin `mage_guild_3`
      // no hay hechizo de nivel 3 que ofrecer—, pero deja la puerta leída y
      // correcta el día que #3 aterrice. El héroe contratado sigue sin
      // habilidades: escribir `hero.skills` en partida es #6/#15.
      skills: { logistics: 1, wisdom: 1 },
    };
    hero.mana = maxMana(hero);
    // Sin personajes: una partida nueva no tiene ninguno (`GameState.characters`).
    hero.movePoints = maxMovePoints(hero, undefined);
    return hero;
  });

  const players = inicios.map((inicio) => ({
    id: inicio.player,
    faction: factionOf.get(inicio.player) ?? ('knight' as FactionId),
    controller: options.controllers?.[inicio.player] ?? ('ai' as Controller),
  }));

  return createGame({
    seed,
    maxDays: options.maxDays ?? MAX_DAYS_POR_DEFECTO,
    map,
    players,
    heroes,
    towns,
    raiders,
  });
}

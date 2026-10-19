/** Arranque de partida: del plan de mapa a un `GameState` listo para jugar. */
import { unidadesDeMorada } from '../catalogo.js';
import { tipoDeHeroePorDefecto } from '../data.js';
import { EXPERIENCIA_INICIAL_DE_HEROE } from '../hero/experiencia.js';
import {
  CIFRAS_DEL_HEROE_INICIAL,
  type Hero,
  heroeRecienHecho,
  maxMana,
  maxMovePoints,
} from '../hero/hero.js';
import { CUPO_HEROE, heroLeadership, troopRoom, withTroops } from '../hero/troop.js';
import {
  basesDelPlan,
  buildMap,
  generateMapPlan,
  type MapPlan,
  validateMapPlan,
} from '../map/generate.js';
import { createRng, hashDeTexto, type Rng } from '../rng.js';
import { sitioDe } from '../town/sitios.js';
import { type Controller, FACTION_IDS, type FactionId, type PlayerId } from '../types.js';
import { createGame, type GameState } from './game.js';

/**
 * Nombres propios del juego: nada tomado de la serie original. Los de Templarios y
 * No muertos son los de caballeros y nigromantes; los demás, INVENTADOS
 * (19-10-2026).
 */
const HERO_NAMES: Readonly<Record<FactionId, readonly string[]>> = {
  templarios: ['Aldo de Valdeluz', 'Beatriz del Alba', 'Cristóbal Yelmo'],
  'no-muertos': ['Malaquías', 'Serena la Pálida', 'Ordóñez el Mudo'],
  imperio: ['Konstanz von Adler', 'Margarethe Eisen', 'Ulrich el Tuerto'],
  elfos: ['Aerin del Roble', 'Thalanor', 'Nimriel la Silente'],
  orkos: ['Grommash Dientenegro', 'Ugra la Roja', 'Snikrot'],
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
  /**
   * La facción del jugador 0 en el mapa procedimental (la elección del menú); la
   * del rival y, sin ella, las dos, las sortea la semilla (`faccionesDeLaSemilla`).
   */
  readonly faccionDelJugador?: FactionId | undefined;
}

/**
 * Las facciones de una partida procedimental: dos distintas de las cinco
 * (19-10-2026: «las cinco sustituyen»), sorteadas con **su propia corriente** de
 * la semilla: con la del mapa, pedir facciones movía cada casilla de cada mapa.
 *
 * Con `delJugador`, la del jugador 0 es esa y el rival, otra de las cuatro que
 * quedan (la elección del menú). La primera **se sortea siempre** y luego se
 * sustituye: así la corriente gasta lo mismo con elección y sin ella, y pedir la
 * que la semilla habría sacado da la misma partida que no pedir nada
 * (`?seed=N` ≡ `?seed=N&faccion=<la suya>`). Es la única función que decide la
 * pareja: el cliente solo le pasa la elegida.
 */
export function faccionesDeLaSemilla(
  seed: number,
  delJugador?: FactionId,
): readonly [FactionId, FactionId] {
  const rng = createRng(hashDeTexto(`facciones|${seed}`));
  const sorteada = rng.pick(FACTION_IDS);
  const f0 = delJugador ?? sorteada;
  const f1 = rng.pick(FACTION_IDS.filter((f) => f !== f0));
  return [f0, f1];
}

/**
 * El nombre del héroe con que empieza el jugador del puesto `puesto` (0, 1…) si
 * es de `faction`: el que le da `newGame` y el que enseña la elección del menú.
 */
export function nombreDeSalida(faction: FactionId, puesto: number): string {
  const nombres = HERO_NAMES[faction];
  return nombres[puesto % nombres.length] as string;
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

/** Cuántos individuos de la primera unidad del pueblo lleva el ejército de salida: una tirada. */
const DE_LA_PRIMERA = { min: 2, max: 4 } as const;
/** Y cuántos, como mucho, de la segunda: los que quepan tras la primera. */
const DE_LA_SEGUNDA = 2;

/** El liderazgo de un héroe recién hecho: el tope del ejército de salida. */
const TOPE_DE_SALIDA = heroLeadership({ experience: EXPERIENCIA_INICIAL_DE_HEROE });

/**
 * Las dos primeras unidades del pueblo de cada facción (la morada del sitio 1,
 * `sitioDe`), **comprobadas al cargar** como las guarniciones: la primera, con su
 * tirada más alta, cabe siempre en el liderazgo y el cupo de un héroe recién hecho,
 * y de la segunda, si la hay, al menos uno. Un catálogo editado en la arena que no
 * lo cumpla lanza aquí diciendo la facción, en vez de dar un ejército más corto en
 * silencio en cada partida.
 */
const PUEBLO_DE_SALIDA: Readonly<
  Record<FactionId, { readonly primera: string; readonly segunda: string | null }>
> = Object.fromEntries(
  FACTION_IDS.map((f) => {
    const pueblo = sitioDe(f, 'lvl1').cadena[0];
    const [primera, segunda] = pueblo === undefined ? [] : unidadesDeMorada(pueblo);
    if (primera === undefined) {
      throw new Error(`el pueblo de ${f} no cría ninguna unidad: no hay ejército de salida`);
    }
    const lleno = withTroops([], primera.id, DE_LA_PRIMERA.max);
    if (troopRoom([], TOPE_DE_SALIDA, CUPO_HEROE, primera.id) < DE_LA_PRIMERA.max) {
      throw new Error(
        `${DE_LA_PRIMERA.max} × ${primera.name} (el ejército de salida de ${f}) no caben en el liderazgo de un héroe recién hecho (${TOPE_DE_SALIDA})`,
      );
    }
    if (segunda !== undefined && troopRoom(lleno, TOPE_DE_SALIDA, CUPO_HEROE, segunda.id) < 1) {
      throw new Error(
        `tras ${DE_LA_PRIMERA.max} × ${primera.name}, en el ejército de salida de ${f} no cabe ningún ${segunda.name}`,
      );
    }
    return [f, { primera: primera.id, segunda: segunda?.id ?? null }];
  }),
) as Record<FactionId, { readonly primera: string; readonly segunda: string | null }>;

/**
 * Ejército de salida: de la primera unidad del pueblo de la facción, los de una
 * tirada (`DE_LA_PRIMERA`), y de la segunda hasta `DE_LA_SEGUNDA`, los que quepan
 * tras ella en un héroe recién hecho (`troopRoom`): el pueblo de los orkos cría
 * dos unidades de 4 de liderazgo, y cuatro y dos serían 24 de 20 (lo cazó
 * `tropa.test.ts`, 19-10-2026). Lo que siempre tiene que caber se comprueba al
 * cargar (`PUEBLO_DE_SALIDA`). Una sola tirada del `rng`.
 */
export function startingArmy(faction: FactionId, rng: Rng): Hero['army'] {
  const { primera, segunda } = PUEBLO_DE_SALIDA[faction];
  const army = withTroops([], primera, rng.int(DE_LA_PRIMERA.min, DE_LA_PRIMERA.max));
  if (segunda === null) return army;
  return withTroops(
    army,
    segunda,
    Math.min(DE_LA_SEGUNDA, troopRoom(army, TOPE_DE_SALIDA, CUPO_HEROE, segunda)),
  );
}

export function newGame(options: NewGameOptions = {}): GameState {
  const seed = options.seed ?? 1;
  const rng = createRng(seed);

  const plan =
    options.plan ??
    generateMapPlan(rng, {
      factions: faccionesDeLaSemilla(seed, options.faccionDelJugador),
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

  // Los jugadores y sus bases, por id (`basesDelPlan`): de ese orden salen
  // `state.players`, `state.heroes` y el nombre de cada héroe.
  const bases = [...basesDelPlan(plan)];

  const heroes: Hero[] = bases.map(([player, base], i) => {
    const faction = base.faction;
    // El héroe nace DENTRO de su base («empieza en la base»): en la casilla del
    // castillo, que es estado normal (al acabar una marcha en él también está
    // ahí). No recoge la guarnición al nacer: la base del día 1 se queda con la
    // suya (decisión del usuario).
    // La construcción de siempre (`heroeRecienHecho`), con lo que el inicial
    // tiene de más encima: mejores cifras, su tropa, Flecha mágica y dos
    // habilidades.
    const hero: Hero = {
      ...heroeRecienHecho({
        id: `hero-${player}`,
        owner: player,
        name: nombreDeSalida(faction, i),
        faction,
        at: base.at,
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

  const players = bases.map(([player, base]) => ({
    id: player,
    faction: base.faction,
    controller: options.controllers?.[player] ?? ('ai' as Controller),
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

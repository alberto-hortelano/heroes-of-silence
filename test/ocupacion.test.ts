/**
 * Ciudades y pueblos en su región, y la ocupación (tarea 2 del puesto fronterizo,
 * fase 1, 05-11-2026; `docs/agents/2026-11-05-ciudades-en-su-region/`).
 *
 * Sobre un plan a mano de cinco regiones (`planConCiudadDeRegion`): Torreblanca,
 * neutral, dentro de Centro; las dos bases en el muro; pueblos dentro de sus
 * regiones. Lo que miran estos tests son los criterios de verificación del plan
 * (§7): qué es nodo y qué no, el dueño que da la región, la ocupación (P1, P4), la
 * batalla para recuperar tras la muralla del sitio (P3) y la crónica.
 */
import { describe, expect, it } from 'vitest';
import { marcadoDe } from '../src/client/html.js';
import { Session } from '../src/client/session.js';
import { renderSide, renderTopbar } from '../src/client/views/panels.js';
import { estructura } from '../src/core/map/regiones.js';
import { createRng } from '../src/core/rng.js';
import type { GameEvent } from '../src/core/state/events.js';
import {
  type AdventureAction,
  applyAdventureAction,
  baseOf,
  buyBlocker,
  contratarBlocker,
  dayOfWeek,
  type GameState,
  heroesOf,
  resolvePendingBattle,
  townById,
} from '../src/core/state/game.js';
import { rentaDelDia } from '../src/core/state/renta.js';
import { newGame } from '../src/core/state/setup.js';
import {
  ciudadQueMandaBlocker,
  dueñoDeLaCiudad,
  dueñoDelSitio,
  enUnNodo,
  ocupadoBlocker,
  ocupanteDe,
  sitioPorId,
} from '../src/core/state/sitios.js';
import type { Point } from '../src/core/types.js';
import {
  ejercito,
  guarnicionDeLaCiudad,
  PESADA,
  planConCiudadDeRegion,
  TROPA_BARATA,
} from './helpers.js';

const SEMILLA = 1;
const ctx = { rng: createRng(SEMILLA) };
const CENTRO_DE_TORREBLANCA = { x: 14, y: 4 };
/** La puerta del norte de Torreblanca y su acceso: por donde se entra. */
const PUERTA = { x: 14, y: 3 };
const ACCESO = { x: 14, y: 2 };

function partida(): GameState {
  return newGame({ seed: SEMILLA, plan: planConCiudadDeRegion() });
}

/** Juega `accion` como `quien`, que pasa a tener el turno. */
function jugar(state: GameState, accion: AdventureAction, quien = 0): void {
  state.current = quien;
  applyAdventureAction(state, accion, ctx, quien);
}

/** Mueve al héroe `id` a `to` desde `desde`, como `quien`. */
function andar(state: GameState, id: string, desde: Point, to: Point, quien: number): void {
  const hero = state.heroes.find((h) => h.id === id)!;
  hero.at = desde;
  hero.movePoints = 5000;
  jugar(state, { type: 'move_hero', hero: id, to }, quien);
}

/** El paso de la casilla `at`. */
function paso(state: GameState, at: Point) {
  const o = state.map.objects.find((x) => x.kind === 'node' && x.at.x === at.x && x.at.y === at.y);
  if (o === undefined || o.kind !== 'node') throw new Error(`no hay paso en (${at.x},${at.y})`);
  return o;
}

/** Los hechos escritos desde `desde`, de la clase `kind`. */
function hechos<K extends GameEvent['kind']>(
  state: GameState,
  desde: number,
  kind: K,
): Extract<GameEvent, { kind: K }>[] {
  return state.log
    .slice(desde)
    .filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);
}

/**
 * La partida con Centro cerrada por el jugador 0: dos de sus pasos ya suyos y el
 * tercero, (11,2), pisado por su héroe; y el sur y el oeste de su base suyos, para
 * que Centro esté unida a ella. Devuelve también desde qué hecho mirar.
 */
function conCentroDel0(): { state: GameState; desde: number } {
  const state = partida();
  for (const at of [
    { x: 5, y: 8 },
    { x: 11, y: 6 },
    { x: 17, y: 4 },
  ])
    paso(state, at).owner = 0;
  const desde = state.log.length;
  andar(state, 'hero-0', { x: 10, y: 2 }, { x: 11, y: 2 }, 0);
  return { state, desde };
}

describe('qué es nodo y qué está dentro de una región', () => {
  it('el grado lo dice: la ciudad que toca una región está dentro; la base, en el muro', () => {
    const state = partida();
    const red = estructura(state.map);
    const centro = red.regionPorId.get('c')!;
    expect(red.sitiosDeRegion.get('town-2')).toBe(centro);
    expect(red.nodoPorId.has('town-2')).toBe(false);
    // Su casilla es de su región, como cualquier otra.
    expect(red.regionDe[CENTRO_DE_TORREBLANCA.y * state.map.width + CENTRO_DE_TORREBLANCA.x]).toBe(
      centro,
    );
    // Las bases, en el muro: nodos de la clase ciudad.
    for (const id of ['town-0', 'town-1']) {
      const k = red.nodoPorId.get(id);
      expect(k, id).toBeDefined();
      expect(red.nodos[k!]!.clase).toBe('ciudad');
    }
    // Los pueblos, dentro de su región.
    for (const o of state.map.objects) {
      if (o.kind === 'village') expect(red.sitiosDeRegion.has(o.id), o.name).toBe(true);
    }
    expect(enUnNodo(state, sitioPorId(state, 'town-2'))).toBe(false);
    expect(enUnNodo(state, sitioPorId(state, 'town-0'))).toBe(true);
    // Sin dueño de Centro, Torreblanca no es de nadie: ni ocupada.
    expect(dueñoDeLaCiudad(state, townById(state, 'town-2'))).toBeNull();
    expect(ocupanteDe(state, sitioPorId(state, 'town-2'))).toBeNull();
  });
});

describe('el dueño lo da la región, y la tropa de otro dentro la ocupa (P1)', () => {
  it('cerrar Centro da Torreblanca, y su guarnición neutral la ocupa', () => {
    const { state, desde } = conCentroDel0();
    const torreblanca = townById(state, 'town-2');
    expect(dueñoDeLaCiudad(state, torreblanca)).toBe(0);
    // La guarnición neutral no cambia de bando: ocupa la ciudad que ya es del 0.
    expect(guarnicionDeLaCiudad(state, torreblanca).length).toBeGreaterThan(0);
    expect(ocupanteDe(state, sitioPorId(state, 'town-2'))).toEqual({
      kind: 'guarnicion',
      dueño: null,
    });
    const [cambio] = hechos(state, desde, 'town_owner_changed');
    expect(cambio).toMatchObject({
      town: 'town-2',
      from: null,
      to: 0,
      actor: 0,
      at: CENTRO_DE_TORREBLANCA,
    });
    expect(Array.isArray(cambio!.seen)).toBe(true);
    const [ocupada] = hechos(state, desde, 'site_occupied');
    expect(ocupada).toMatchObject({
      site: 'town-2',
      by: { kind: 'guarnicion', dueño: null },
      actor: 0,
      at: CENTRO_DE_TORREBLANCA,
    });
    expect(Array.isArray(ocupada!.seen)).toBe(true);
  });

  it('ocupada no da oro, ni recluta, ni construye, ni se contrata en ella, y lo dice (P4)', () => {
    const { state } = conCentroDel0();
    const sitio = sitioPorId(state, 'town-2');
    const motivo = ocupadoBlocker(state, sitio);
    expect(motivo).toMatch(
      /^Torreblanca está ocupada por una guarnición neutral: no da oro, ni recluta, ni construye, ni crecen sus moradas, ni se contrata en ella/,
    );
    const renta = rentaDelDia(state, 0);
    const suya = renta.ciudades.find((c) => c.id === 'town-2')!;
    expect(suya).toMatchObject({ unida: true, oro: 0, ocupada: motivo });
    expect(() =>
      jugar(state, { type: 'recruit', town: 'town-2', creature: TROPA_BARATA, count: 1 }),
    ).toThrow(`no se puede reclutar: ${motivo}`);
    expect(() => jugar(state, { type: 'build', town: 'town-2', building: 'town_hall' })).toThrow(
      `no se puede construir: ${motivo}`,
    );
    expect(contratarBlocker(state, 0, 'town-2')).toBe(motivo);
    // Y la armería tampoco vende (`/simplify` de la tarea, P4: la ciudad entera),
    // antes de mirar si la tiene: la regla de la ciudad que manda va primero.
    const torreblanca = townById(state, 'town-2');
    expect(motivo).toMatch(/ni vende su armería/);
    expect(buyBlocker(state, torreblanca, 'brigantina', 0)).toBe(motivo);
    expect(ciudadQueMandaBlocker(state, torreblanca, 0)).toBe(motivo);
    expect(ciudadQueMandaBlocker(state, torreblanca, 1)).toBe('Torreblanca no es de tu bando');
  });

  it('ocupada, el lunes sus moradas no crecen: la semana se pierde', () => {
    const { state } = conCentroDel0();
    const torreblanca = townById(state, 'town-2');
    const base = baseOf(state, 0)!;
    torreblanca.available = {};
    const antesBase = JSON.stringify(base.available);
    while (dayOfWeek(state) !== 1 || state.day === 1)
      jugar(state, { type: 'end_turn' }, state.current);
    expect(torreblanca.available).toEqual({});
    // La de la base, sin ocupar, sí.
    expect(JSON.stringify(base.available)).not.toBe(antesBase);
  });
});

describe('recuperarlo atacando, tras la muralla del sitio (P3)', () => {
  it('contra la guarnición neutral: piedra, y al ganarla vuelve a dar', () => {
    const { state } = conCentroDel0();
    const hero = heroesOf(state, 0)[0]!;
    hero.army = ejercito({ creature: PESADA, count: 6 });
    const desde = state.log.length;
    andar(state, hero.id, PUERTA, CENTRO_DE_TORREBLANCA, 0);
    expect(state.pendingBattle!.foe).toEqual({ kind: 'garrison', site: 'town-2' });
    expect(state.pendingBattle!.battle.muralla.material).toBe('piedra');
    const outcome = resolvePendingBattle(state, ctx);
    expect(outcome.winner).toBe('attacker');
    expect(ocupanteDe(state, sitioPorId(state, 'town-2'))).toBeNull();
    // Sigue siendo del 0 (no se toma: es de su región), y ya da su oro.
    expect(dueñoDeLaCiudad(state, townById(state, 'town-2'))).toBe(0);
    expect(rentaDelDia(state, 0).ciudades.find((c) => c.id === 'town-2')!.oro).toBeGreaterThan(0);
    const [libre] = hechos(state, desde, 'site_freed');
    expect(libre).toMatchObject({ site: 'town-2', actor: 0, at: CENTRO_DE_TORREBLANCA });
  });

  it('un héroe rival que entra la ocupa sin quedársela; si se va, deja de estarlo', () => {
    const { state } = conCentroDel0();
    // Sin guarnición que vencer: entra pisándola.
    state.guarniciones = {};
    const desde = state.log.length;
    andar(state, 'hero-1', PUERTA, CENTRO_DE_TORREBLANCA, 1);
    expect(state.pendingBattle).toBeNull();
    expect(dueñoDeLaCiudad(state, townById(state, 'town-2'))).toBe(0);
    expect(ocupanteDe(state, sitioPorId(state, 'town-2'))).toEqual({
      kind: 'heroe',
      heroId: 'hero-1',
      dueño: 1,
    });
    expect(rentaDelDia(state, 0).ciudades.find((c) => c.id === 'town-2')!.oro).toBe(0);
    expect(hechos(state, desde, 'site_occupied')).toMatchObject([
      { site: 'town-2', by: { kind: 'heroe', heroId: 'hero-1', dueño: 1 }, actor: 0 },
    ]);
    // Quien ocupa no recluta ni construye allí: no es suya.
    expect(() => jugar(state, { type: 'build', town: 'town-2', building: 'town_hall' }, 1)).toThrow(
      'no se puede construir: Torreblanca no es de tu bando',
    );
    // Se va: deja de estar ocupada.
    const antes = state.log.length;
    jugar(state, { type: 'move_hero', hero: 'hero-1', to: PUERTA }, 1);
    expect(ocupanteDe(state, sitioPorId(state, 'town-2'))).toBeNull();
    expect(hechos(state, antes, 'site_freed')).toMatchObject([{ site: 'town-2', actor: 0 }]);
  });

  it('contra el héroe que la ocupa: batalla tras la piedra de la ciudad, y al ganarla vuelve a dar', () => {
    const { state } = conCentroDel0();
    state.guarniciones = {};
    andar(state, 'hero-1', PUERTA, CENTRO_DE_TORREBLANCA, 1);
    const rival = heroesOf(state, 1)[0]!;
    rival.army = ejercito({ creature: TROPA_BARATA, count: 1 });
    const hero = heroesOf(state, 0)[0]!;
    hero.army = ejercito({ creature: PESADA, count: 6 });
    andar(state, hero.id, ACCESO, CENTRO_DE_TORREBLANCA, 0);
    expect(state.pendingBattle!.foe).toEqual({ kind: 'hero', heroId: 'hero-1' });
    expect(state.pendingBattle!.battle.muralla.material).toBe('piedra');
    const desde = state.log.length;
    expect(resolvePendingBattle(state, ctx).winner).toBe('attacker');
    // El que ocupaba no entrega nada: perder lo echa.
    expect(dueñoDeLaCiudad(state, townById(state, 'town-2'))).toBe(0);
    expect(ocupanteDe(state, sitioPorId(state, 'town-2'))).toBeNull();
    expect(hechos(state, desde, 'site_freed')).toMatchObject([{ site: 'town-2', actor: 0 }]);
  });

  it('en un pueblo, la madera, sea quien sea quien está dentro', () => {
    const { state } = conCentroDel0();
    // Molinar, en la Vega (b): del 0 con la base y sus pasos.
    const molinar = state.map.objects.find((o) => o.kind === 'village' && o.name === 'Molinar')!;
    paso(state, { x: 11, y: 6 }).owner = 0;
    expect(dueñoDelSitio(state, sitioPorId(state, molinar.id))).toBe(0);
    const desde = state.log.length;
    andar(state, 'hero-1', { x: molinar.at.x, y: molinar.at.y - 1 }, molinar.at, 1);
    expect(hechos(state, desde, 'site_occupied')).toMatchObject([
      { site: molinar.id, by: { kind: 'heroe', heroId: 'hero-1' }, actor: 0, at: molinar.at },
    ]);
    const pueblo = rentaDelDia(state, 0).pueblos.find((p) => p.id === molinar.id)!;
    expect(pueblo.oro).toBe(0);
    expect(pueblo.ocupada).toMatch(/^Molinar está ocupado por /);
    const hero = heroesOf(state, 0)[0]!;
    hero.army = ejercito({ creature: PESADA, count: 6 });
    andar(state, hero.id, { x: molinar.at.x, y: molinar.at.y + 1 }, molinar.at, 0);
    expect(state.pendingBattle!.foe).toEqual({ kind: 'hero', heroId: 'hero-1' });
    expect(state.pendingBattle!.battle.muralla.material).toBe('madera');
  });
});

describe('la pantalla lo dice: la ciudad ocupada y la renta', () => {
  it('el lateral de la ciudad pone la frase y apaga contratar; la barra cuenta lo ocupado', () => {
    const sesion = new Session(SEMILLA);
    sesion.state = conCentroDel0().state;
    sesion.openTown('town-2');
    const motivo = ocupadoBlocker(sesion.state, sitioPorId(sesion.state, 'town-2'))!;
    const lateral = marcadoDe(renderSide(sesion));
    expect(lateral).toContain(motivo);
    expect(lateral).toMatch(
      /<button class="primary"[^>]* disabled title="[^"]*ocupada[^"]*">Contratar héroe<\/button>/,
    );
    expect(sesion.mandaEn(sesion.state.towns.find((t) => t.id === 'town-2')!)).toBe(motivo);
    const barra = marcadoDe(renderTopbar(sesion).resources);
    expect(barra).toMatch(/Ocupados, no te dan nada: Torreblanca/);
  });

  it('cada fila de la ficha de la ocupada dice lo mismo que su frase (vuelta 1 de QA, H1)', () => {
    // QA vio, bajo «no da oro, ni recluta, ni construye, ni crecen sus moradas»,
    // «Ingresos 500 oro/día», «Construir hoy: disponible», «Crecimiento semanal +8»
    // y la guarnición neutral que la ocupa enseñada como la suya.
    const sesion = new Session(SEMILLA);
    sesion.state = conCentroDel0().state;
    sesion.openTown('town-2');
    const lateral = marcadoDe(renderSide(sesion));
    expect(lateral).toMatch(
      /<span class="label">Ingresos<\/span><span title="Torreblanca está ocupada[^"]*">\d+ oro\/día · sin cobrar: ocupada<\/span>/,
    );
    expect(lateral).toMatch(
      /<span class="label">Construir hoy<\/span><span><span title="Torreblanca está ocupada[^"]*">no: está ocupada<\/span>/,
    );
    expect(lateral).not.toContain('disponible');
    expect(lateral).not.toContain('Pulsa el ayuntamiento para ampliar la base');
    // Lo que crecería, a 0, con su porqué.
    expect(lateral).not.toMatch(/<span class="count">\+[1-9]/);
    expect(lateral).toContain('No crece mientras esté ocupada');
    // La guarnición neutral, como ocupante: ni su liderazgo como el de la ciudad,
    // ni «lo que reclutes se queda de guarnición».
    expect(lateral).toContain('La ocupa: una guarnición neutral.');
    expect(lateral).not.toContain('Sin héroe dentro, lo que reclutes se queda de guarnición');
    expect(lateral).not.toMatch(/<span class="label">Liderazgo<\/span>/);
    // Y en el lateral del mapa, la misma lectura: +0 · ocupada.
    sesion.closeTown();
    expect(marcadoDe(renderSide(sesion))).toMatch(
      /<span>Torreblanca<\/span><span class="count ocupado" title="Torreblanca está ocupada[^"]*">\+0 · ocupada<\/span>/,
    );
  });
});

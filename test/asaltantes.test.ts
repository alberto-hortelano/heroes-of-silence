/**
 * Los asaltantes de caminos (ciclo «el camino cuesta»): patrullan su región sin
 * cruzar nodos, emboscan al héroe que la pisa si le sacan el margen, se
 * dispersan cuando su región tiene dueño y brotan los lunes donde no hay nadie.
 *
 * Cada `it` sale de un criterio de verificación del plan, y los que dependen
 * del azar van con su semilla: la patrulla y el brote tiran de `createRng`.
 */
import { describe, expect, it } from 'vitest';
import { fuerzaDe, MARGEN_CONTRA_NEUTRALES, poderDe, ventajaClara } from '../src/core/ai/fuerza.js';
import { planBuildings, planRecruits } from '../src/core/ai/strategy.js';
import { playAiTurn } from '../src/core/ai/turn.js';
import { serializeKnownMap } from '../src/core/contract/serialize.js';
import { ASALTANTES, creature, factionLineup } from '../src/core/data.js';
import { CUPO_HEROE, withTroops } from '../src/core/hero/troop.js';
import {
  buildMap,
  generateMapPlan,
  type MapPlan,
  validateMapPlan,
} from '../src/core/map/generate.js';
import { isEnterable, objectAt, pointKey } from '../src/core/map/map.js';
import { estructura, territorio, VECINAS } from '../src/core/map/regiones.js';
import { createRng } from '../src/core/rng.js';
import {
  casillasPeligrosas,
  dondeBrotan,
  emboscadaEnLaRuta,
  mascaraDeOcupacion,
  pasoDePatrulla,
  problemasDeAsaltante,
  type Raider,
  regionDeCasilla,
  tocaUnNodo,
} from '../src/core/state/asaltantes.js';
import {
  alcanceDelHeroe,
  applyAdventureAction,
  baseOf,
  battleOwners,
  caminoHasta,
  type GameState,
  heroesOf,
  resolvePendingBattle,
  sidesOwnedBy,
  visibleNow,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import type { Point } from '../src/core/types.js';
import { ejercito } from './helpers.js';

/**
 * Las casillas libres de la región de `r` con la regla de la patrulla: sin
 * tocar un nodo, sin objeto, sin héroe y sin grupo. La de no pegarse a un nodo
 * se lee de producción (`tocaUnNodo`) en vez de reescribirse aquí.
 */
function libresDeSuRegion(state: GameState, r: Raider): Point[] {
  const region = regionDeCasilla(state.map, r.at);
  const { regionDe } = estructura(state.map);
  const out: Point[] = [];
  for (let i = 0; i < regionDe.length; i++) {
    if (regionDe[i] !== region) continue;
    const p = { x: i % state.map.width, y: Math.floor(i / state.map.width) };
    if (tocaUnNodo(state.map, p) || objectAt(state.map, p) !== undefined) continue;
    if (state.heroes.some((h) => pointKey(h.at) === pointKey(p))) continue;
    if (state.raiders.some((o) => pointKey(o.at) === pointKey(p))) continue;
    out.push(p);
  }
  return out;
}

/**
 * Pone al héroe del jugador 0 dentro de la región del grupo más fuerte y le
 * prepara un paso a una vecina de la misma región: pisarla es lo que dispara la
 * emboscada. El héroe se pone a mano —la regla dice que un grupo no nace donde
 * hay alguien—, pero el paso es la marcha de verdad, por `applyAdventureAction`.
 */
function enSuRegion(semilla: number) {
  const state = newGame({ seed: semilla });
  const ctx = { rng: createRng(semilla) };
  const grupo = [...state.raiders].sort((a, b) => poderDe(b) - poderDe(a))[0]!;
  const hero = heroesOf(state, 0)[0]!;
  const libres = libresDeSuRegion(state, grupo);
  const enLibres = new Set(libres.map(pointKey));
  let par: { desde: Point; hasta: Point } | undefined;
  for (const desde of libres) {
    for (const [dx, dy] of VECINAS) {
      const hasta = { x: desde.x + dx, y: desde.y + dy };
      if (enLibres.has(pointKey(hasta)) && isEnterable(state.map, hasta)) {
        par = { desde, hasta };
        break;
      }
    }
    if (par !== undefined) break;
  }
  if (par === undefined)
    throw new Error(`la semilla ${semilla} no deja dos casillas libres juntas`);
  hero.at = par.desde;
  hero.movePoints = 5000;
  return { state, ctx, hero, grupo, hasta: par.hasta };
}

describe('la patrulla', () => {
  it('300 días de patrulla sin salir de su región ni pisar un nodo o su vecina', () => {
    const state = newGame({ seed: 5 });
    const rng = createRng(5);
    expect(state.raiders.length).toBeGreaterThan(0);
    const regiones = new Map(state.raiders.map((r) => [r.id, regionDeCasilla(state.map, r.at)]));
    let movidas = 0;
    for (let dia = 0; dia < 300; dia++) {
      for (const r of state.raiders) {
        const antes = r.at;
        r.at = pasoDePatrulla(state, r, rng, mascaraDeOcupacion(state));
        if (pointKey(antes) !== pointKey(r.at)) movidas++;
        expect(regionDeCasilla(state.map, r.at), `${r.id} el día ${dia}`).toBe(regiones.get(r.id));
        expect(tocaUnNodo(state.map, r.at), `${r.id} pegado a un nodo`).toBe(false);
        expect(objectAt(state.map, r.at), `${r.id} encima de un objeto`).toBeUndefined();
        // Como mucho `pasosPorDia` en Chebyshev: andando por la región, nunca saltando.
        const salto = Math.max(Math.abs(antes.x - r.at.x), Math.abs(antes.y - r.at.y));
        expect(salto).toBeLessThanOrEqual(ASALTANTES.pasosPorDia);
      }
    }
    // Y que se muevan de verdad: un grupo clavado pasaría todo lo de arriba.
    expect(movidas).toBeGreaterThan(state.raiders.length * 100);
  });

  it('si no se cree capaz con el héroe de su región, se aparta de él', () => {
    const { state, hero, grupo } = enSuRegion(11);
    hero.army = ejercito({ creature: 'paladin', count: 6 });
    hero.at = libresDeSuRegion(state, grupo)[0]!;
    const lejos = (p: Point) => Math.max(Math.abs(p.x - hero.at.x), Math.abs(p.y - hero.at.y));
    const antes = lejos(grupo.at);
    const paso = pasoDePatrulla(state, grupo, createRng(1), mascaraDeOcupacion(state));
    expect(lejos(paso)).toBeGreaterThanOrEqual(antes);
  });

  it('en una partida jugada, ningún grupo vive en región con dueño, junto a un nodo o donde brotó un héroe', async () => {
    // El invariante del plan, sobre partidas de verdad y turno a turno.
    let vistos = 0;
    let brotados = 0;
    // Semillas en las que pasan lunes con sitio para brotar —en la mayoría la
    // partida acaba antes del día 8 con todas las regiones ocupadas—: la 5 da
    // cuatro brotes, y la 16 y la 18 uno cada una.
    for (const semilla of [5, 16, 18]) {
      const state = newGame({ seed: semilla, maxDays: 60 });
      const ctx = { rng: createRng(semilla) };
      while (state.finished === null) {
        const desde = state.log.length;
        await playAiTurn(state, ctx);
        const t = territorio(state);
        for (const r of state.raiders) {
          vistos++;
          const region = regionDeCasilla(state.map, r.at);
          expect(region, `${r.id} fuera de toda región`).toBeGreaterThanOrEqual(0);
          expect(t.dueñoDeRegion[region], `${r.id} en región con dueño`).toBeNull();
          expect(tocaUnNodo(state.map, r.at)).toBe(false);
        }
        // Lo que brotó en este turno lo hizo con el turno siguiente aún sin
        // empezar a mover: ningún héroe pisa su región.
        for (const e of state.log.slice(desde)) {
          if (e.kind !== 'raider_spawned' || e.at === null) continue;
          brotados++;
          const region = regionDeCasilla(state.map, e.at);
          const conHeroe = state.heroes.some((h) => regionDeCasilla(state.map, h.at) === region);
          expect(conHeroe, `brotó ${e.raider} donde hay un héroe`).toBe(false);
        }
      }
    }
    expect(vistos).toBeGreaterThan(100);
    expect(brotados).toBeGreaterThan(0);
  });
});

describe('la emboscada', () => {
  it('un héroe mermado que pisa la región: el grupo ataca y el héroe DEFIENDE', () => {
    const { state, ctx, hero, grupo, hasta } = enSuRegion(11);
    hero.army = [];
    expect(poderDe(grupo)).toBeGreaterThan(MARGEN_CONTRA_NEUTRALES * fuerzaDe(hero, undefined));

    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: hasta }, ctx, 0);

    const pending = state.pendingBattle!;
    expect(pending).not.toBeNull();
    expect(pending.attacker).toEqual({ kind: 'raider', raiderId: grupo.id });
    expect(pending.foe).toEqual({ kind: 'hero', heroId: hero.id });
    expect(battleOwners(state, pending)).toEqual({ attacker: null, defender: 0 });
    expect([...sidesOwnedBy(state, pending, [0])]).toEqual(['defender']);
    // La marcha se para en la casilla de la emboscada, y la crónica la cuenta.
    expect(hero.at).toEqual(hasta);
    const inicio = [...state.log].reverse().find((e) => e.kind === 'battle_started');
    expect(inicio).toMatchObject({ attacker: { kind: 'raider' }, actor: 0 });
  });

  it('un héroe que no da el margen al grupo pasa sin batalla', () => {
    const { state, ctx, hero, grupo, hasta } = enSuRegion(11);
    hero.army = ejercito({ creature: 'paladin', count: 6 });
    expect(poderDe(grupo)).toBeLessThanOrEqual(MARGEN_CONTRA_NEUTRALES * fuerzaDe(hero, undefined));
    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: hasta }, ctx, 0);
    expect(state.pendingBattle).toBeNull();
    expect(hero.at).toEqual(hasta);
  });

  it('gana el grupo: el héroe vuelve a su base y el grupo sigue con lo que le quede', () => {
    const { state, ctx, hero, grupo, hasta } = enSuRegion(11);
    hero.army = [];
    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: hasta }, ctx, 0);
    resolvePendingBattle(state, ctx);
    expect(state.log.find((e) => e.kind === 'hero_returned')).toMatchObject({ hero: hero.id });
    expect(state.log.find((e) => e.kind === 'battle_ended')).toMatchObject({ winner: 'attacker' });
    expect(state.raiders.some((r) => r.id === grupo.id)).toBe(true);
  });

  it('gana el héroe atacando: el grupo desaparece', () => {
    const { state, ctx, hero, grupo } = enSuRegion(11);
    hero.army = ejercito({ creature: 'paladin', count: 6 });
    hero.at = libresDeSuRegion(state, grupo).find(
      (p) => Math.max(Math.abs(p.x - grupo.at.x), Math.abs(p.y - grupo.at.y)) === 1,
    )!;
    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: grupo.at }, ctx, 0);
    expect(state.pendingBattle?.foe).toEqual({ kind: 'raider', raiderId: grupo.id });
    resolvePendingBattle(state, ctx);
    expect(state.raiders.some((r) => r.id === grupo.id)).toBe(false);
  });

  it('la IA que resuelve la defensa de una persona no la rinde por ella', () => {
    // Con dos campesinos contra el grupo, la IA para sí se rinde —pesa menos de
    // un tercio y hay base—; por la persona pelea, pero no paga.
    const desenlace = (vetada: boolean) => {
      const { state, ctx, hero, hasta } = enSuRegion(11);
      hero.army = ejercito({ creature: 'peasant', count: 2 });
      applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: hasta }, ctx, 0);
      resolvePendingBattle(state, ctx, vetada ? new Set([0]) : new Set());
      return state.log.find((e) => e.kind === 'hero_returned');
    };
    expect(desenlace(false)).toMatchObject({ surrendered: true });
    expect(desenlace(true)).toMatchObject({ surrendered: false });
  });

  it('misma semilla, misma partida: patrulla, brote y emboscadas incluidos', async () => {
    const jugar = async () => {
      const state = newGame({ seed: 17, maxDays: 40 });
      const ctx = { rng: createRng(17) };
      while (state.finished === null) await playAiTurn(state, ctx);
      return state.log;
    };
    const a = await jugar();
    expect(a.some((e) => e.kind === 'raider_spawned')).toBe(true);
    expect(JSON.stringify(await jugar())).toBe(JSON.stringify(a));
  });
});

describe('dispersarse y brotar', () => {
  it('tomar el último nodo de su región dispersa al grupo, y lo cuenta quien la cerró', () => {
    const state = newGame({ seed: 11 });
    const ctx = { rng: createRng(11) };
    const red = estructura(state.map);
    // Una región con grupo y con algún nodo que se toma pisándolo.
    const grupo = state.raiders.find((r) =>
      red.regiones[regionDeCasilla(state.map, r.at)]!.nodos.some((n) => !red.nodos[n]!.ciudad),
    )!;
    const region = red.regiones[regionDeCasilla(state.map, grupo.at)]!;
    const [ultimo, ...resto] = region.nodos.filter((n) => !red.nodos[n]!.ciudad);
    // Todo lo demás de la región ya es del jugador 0: el libro y la bandera.
    for (const n of [...resto, ...region.nodos.filter((k) => red.nodos[k]!.ciudad)]) {
      const nodo = red.nodos[n]!;
      const obj = state.map.objects.find((o) => o.id === nodo.id)!;
      if (obj.kind === 'node' || obj.kind === 'town') obj.owner = 0;
      const town = state.towns.find((t) => t.id === nodo.id);
      if (town !== undefined) town.owner = 0;
    }
    const hero = heroesOf(state, 0)[0]!;
    hero.army = ejercito({ creature: 'paladin', count: 6 });
    const nodo = red.nodos[ultimo!]!;
    hero.at = VECINAS.map(([dx, dy]) => ({ x: nodo.at.x + dx, y: nodo.at.y + dy })).find(
      (p) => isEnterable(state.map, p) && objectAt(state.map, p) === undefined,
    )!;
    hero.movePoints = 5000;
    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: nodo.at }, ctx, 0);

    expect(state.raiders.some((r) => r.id === grupo.id)).toBe(false);
    expect(state.log.find((e) => e.kind === 'raider_dispersed')).toMatchObject({
      raider: grupo.id,
      actor: 0,
    });
  });

  it('52 lunes de brote: nunca encima de nadie, ni de un nodo, ni donde hay alguien o dueño', () => {
    const state = newGame({ seed: 23 });
    const red = estructura(state.map);
    const t = territorio(state);
    const deCasa = new Set<number>();
    for (const p of state.players) {
      const k = red.nodoPorId.get(p.base!)!;
      for (const r of red.nodos[k]!.regiones) deCasa.add(r);
    }
    const rng = createRng(23);
    let brotes = 0;
    let enCasa = 0;
    for (let lunes = 0; lunes < 52; lunes++) {
      // Cada lunes los héroes en otra región, y ningún grupo vivo: así el brote
      // tiene sitio todas las semanas y la regla se pregunta muchas veces.
      state.raiders = [];
      for (const h of state.heroes) {
        const r = rng.int(0, red.regiones.length - 1);
        h.at = red.regiones[r]!.at;
      }
      const conHeroe = new Set(state.heroes.map((h) => regionDeCasilla(state.map, h.at)));
      for (const b of dondeBrotan(state, rng)) {
        brotes++;
        const region = regionDeCasilla(state.map, b.at);
        expect(region).toBeGreaterThanOrEqual(0);
        expect(conHeroe.has(region), 'en una región con héroe').toBe(false);
        expect(t.dueñoDeRegion[region]).toBeNull();
        expect(tocaUnNodo(state.map, b.at)).toBe(false);
        expect(objectAt(state.map, b.at)).toBeUndefined();
        expect(state.heroes.some((h) => pointKey(h.at) === pointKey(b.at))).toBe(false);
        expect(problemasDeAsaltante(b.troops, 'el brote')).toEqual([]);
        if (deCasa.has(region)) enCasa++;
      }
    }
    expect(brotes).toBeGreaterThan(52);
    // La corrección del usuario: también en las regiones que tocan una base.
    expect(enCasa).toBeGreaterThan(0);
  });
});

describe('la IA no entra en una emboscada que va a perder', () => {
  it('su alcance prudente no pisa ninguna casilla de una región donde la emboscarían, la suya incluida', () => {
    // El héroe, sin tropa —solo su cuerpo—, en una casilla de la región del
    // grupo más fuerte: todas las regiones con grupo son peligrosas para él.
    const { state, hero, grupo } = enSuRegion(5);
    hero.army = [];
    const peligro = casillasPeligrosas(state, hero)!;
    expect(peligro).not.toBeNull();
    const suya = regionDeCasilla(state.map, hero.at);
    expect(regionDeCasilla(state.map, grupo.at)).toBe(suya);
    const W = state.map.width;
    expect(peligro[hero.at.y * W + hero.at.x]).toBe(1);
    const alcance = alcanceDelHeroe(state, hero, { evitarEmboscadas: true });
    for (const clave of alcance.costs.keys()) {
      const [x, y] = clave.split(',').map(Number) as [number, number];
      if (x === hero.at.x && y === hero.at.y) continue;
      expect(peligro[y * W + x], `(${x},${y}) es de una región que embosca`).not.toBe(1);
    }
    // Y sale: desde dentro se pisa el nodo de al lado, si lo hay; prohibir la
    // región no es encerrarlo en su casilla.
    const normal = alcanceDelHeroe(state, hero);
    expect(alcance.costs.size).toBeLessThan(normal.costs.size);
  });

  it('en partidas enteras de la IA contra sí misma no hay ni una emboscada', async () => {
    // Antes eran 304 en las 200 del banco y el grupo ganaba 270: el «si no, va
    // igual» mandaba al héroe a perder. Ahora se repliega y se refuerza.
    for (const semilla of [3, 7, 11, 17, 23]) {
      const state = newGame({ seed: semilla });
      const ctx = { rng: createRng(semilla) };
      while (state.finished === null) await playAiTurn(state, ctx);
      expect(state.finished.winner, `semilla ${semilla}`).not.toBeNull();
      const emboscadas = state.log.filter(
        (e) => e.kind === 'battle_started' && e.attacker.kind === 'raider',
      );
      expect(emboscadas, `semilla ${semilla}`).toEqual([]);
    }
  });
});

describe('los datos de los asaltantes', () => {
  /**
   * Lo más fuerte que llega a ser un héroe de nivel 1 que **espera en su base**
   * con el cupo lleno de lo más barato de su facción, mientras la IA de reglas
   * construye, licencia y recluta como en cualquier partida (`planBuildings`,
   * `planRecruits`). Es la fuerza que un héroe alcanza de verdad en el mapa, y
   * no la de un héroe ideal sacado a fuerza bruta: la de antes daba 526 y era
   * cierta solo si el héroe podía cambiar su tropa, que hasta despedir no podía.
   */
  async function loQueAlcanzaEsperando(
    semilla: number,
  ): Promise<{ fuerza: number[]; licencias: number }> {
    const state = newGame({ seed: semilla });
    const ctx = { rng: createRng(semilla) };
    for (const p of [0, 1] as const) {
      const hero = heroesOf(state, p)[0]!;
      hero.at = { ...baseOf(state, p)!.at };
      const barata = factionLineup(state.players[p]!.faction)[0]!.id;
      hero.army = withTroops([], barata, CUPO_HEROE);
    }
    const fuerza = [0, 0];
    while (state.day <= 21) {
      const p = state.current;
      for (const a of planBuildings(state, p)) applyAdventureAction(state, a, ctx, p);
      for (const a of planRecruits(state, p)) applyAdventureAction(state, a, ctx, p);
      for (const h of heroesOf(state, p)) fuerza[p] = Math.max(fuerza[p]!, fuerzaDe(h, undefined));
      applyAdventureAction(state, { type: 'end_turn' }, ctx, p);
    }
    return { fuerza, licencias: state.log.filter((e) => e.kind === 'dismissed').length };
  }

  it('el techo de fuerza no es un muro: un héroe que espera en su base lo pasa licenciando y reclutando', async () => {
    for (const semilla of [1, 2, 3]) {
      const { fuerza, licencias } = await loQueAlcanzaEsperando(semilla);
      for (const f of fuerza) {
        expect(MARGEN_CONTRA_NEUTRALES * f, `semilla ${semilla}`).toBeGreaterThanOrEqual(
          ASALTANTES.fuerzaMax,
        );
      }
      // Y lo pasa licenciando: sin cambiar tropa se quedaba con lo barato.
      expect(licencias).toBeGreaterThan(0);
    }
    for (const grupos of ASALTANTES.composiciones) {
      expect(poderDe({ troops: grupos })).toBeLessThanOrEqual(ASALTANTES.fuerzaMax);
      expect(
        grupos.reduce((n, g) => n + creature(g.creature).leadership * g.count, 0),
      ).toBeLessThanOrEqual(ASALTANTES.liderazgoMax);
    }
  });

  it('siete vampiros son un muro, y se rechazan diciéndolo', () => {
    const problemas = problemasDeAsaltante([{ creature: 'vampire', count: 7 }], 'el grupo');
    expect(problemas.join(' ')).toMatch(/liderazgo|muro/);
  });
});

describe('el plan de mapa con asaltantes', () => {
  const base = (): MapPlan => generateMapPlan(createRng(9));

  it('el generador los pone, y un plan sin ellos también vale', () => {
    const plan = base();
    expect((plan.raiders ?? []).length).toBeGreaterThan(0);
    expect(validateMapPlan(plan)).toEqual([]);
    expect(validateMapPlan({ ...plan, raiders: undefined })).toEqual([]);
    expect(buildMap({ ...plan, raiders: undefined }).raiders).toEqual([]);
  });

  it('se rechazan con su frase: criatura falsa, de más, pegado a un nodo, donde empieza un héroe, sobre un muro', () => {
    const plan = base();
    const uno = plan.raiders![0]!;
    const con = (r: { at: Point; troops: readonly { creature: string; count: number }[] }) =>
      validateMapPlan({ ...plan, raiders: [r] }).join(' | ');
    expect(con({ at: uno.at, troops: [{ creature: 'dragon', count: 3 }] })).toMatch(
      /criatura que no existe: "dragon"/,
    );
    expect(con({ at: uno.at, troops: [{ creature: 'peasant', count: 8 }] })).toMatch(
      /como mucho 7/,
    );
    // Cinco espadachines: 30 de liderazgo y 625 de fuerza, así que solo cae por
    // el primer techo. Cuatro vampiros y una momia: 28 y 807,5, solo por el otro.
    expect(con({ at: uno.at, troops: [{ creature: 'swordsman', count: 5 }] })).toMatch(
      /ocupa 30 de liderazgo/,
    );
    expect(
      con({
        at: uno.at,
        troops: [
          { creature: 'vampire', count: 4 },
          { creature: 'mummy', count: 1 },
        ],
      }),
    ).toMatch(/suma 807.5 de fuerza/);
    const { map } = buildMap(plan);
    const red = estructura(map);
    const nodo = red.nodos.find((n) => !n.ciudad)!;
    const pegada = VECINAS.map(([dx, dy]) => ({ x: nodo.at.x + dx, y: nodo.at.y + dy })).find(
      (p) => regionDeCasilla(map, p) >= 0 && objectAt(map, p) === undefined,
    )!;
    expect(con({ at: pegada, troops: uno.troops })).toMatch(/pegado a un nodo/);
    const inicio = plan.heroStarts[0]!.at;
    const casa = regionDeCasilla(map, inicio);
    const enCasa = red.regionDe.findIndex(
      (r, i) =>
        r === casa &&
        !tocaUnNodo(map, { x: i % map.width, y: Math.floor(i / map.width) }) &&
        objectAt(map, { x: i % map.width, y: Math.floor(i / map.width) }) === undefined &&
        pointKey({ x: i % map.width, y: Math.floor(i / map.width) }) !== pointKey(inicio),
    );
    expect(
      con({ at: { x: enCasa % map.width, y: Math.floor(enCasa / map.width) }, troops: uno.troops }),
    ).toMatch(/donde empieza un héroe/);
    const muro = map.terrain.indexOf('mountain');
    expect(
      con({ at: { x: muro % map.width, y: Math.floor(muro / map.width) }, troops: uno.troops }),
    ).toMatch(/cae sobre mountain/);
  });

  it('un grupo de cero individuos se rechaza con su frase (H3)', () => {
    // El esquema zod también lo rechaza (`agent-contract.test.ts`), pero esta es
    // la puerta por la que pasan los DOS productores de planes.
    const plan = base();
    const uno = plan.raiders![0]!;
    expect(validateMapPlan({ ...plan, raiders: [{ at: uno.at, troops: [] }] }).join(' | ')).toMatch(
      /no lleva a nadie: un grupo de asaltantes es de 1 individuo en adelante/,
    );
    expect(() => newGame({ plan: { ...plan, raiders: [{ at: uno.at, troops: [] }] } })).toThrow(
      /no lleva a nadie/,
    );
  });

  it('de la partida salen como actores, con el id que les pone `buildMap`', () => {
    const state = newGame({ plan: base(), seed: 9 });
    expect(state.raiders.map((r) => r.id)).toEqual(base().raiders!.map((_, i) => `raider-${i}`));
    // Ninguno es un objeto del mapa: la niebla no los recuerda.
    expect(state.map.objects.some((o) => o.id.startsWith('raider'))).toBe(false);
  });
});

describe('lo que el castillo ve se pinta (H1)', () => {
  // El castillo ve en un radio de 5 (`visibleNow`), y ese radio no se escribía en
  // `fog`: el agente veía el grupo de la región de casa y la persona, que pinta
  // con `fog`, no — en 96 de 200 semillas el día 1, y lo pisaba a ciegas.
  it('el día 1, todo grupo que embosca al héroe y que se ve está explorado, y nada visible cae sobre `null`', () => {
    let emboscadores = 0;
    for (let semilla = 1; semilla <= 60; semilla++) {
      const state = newGame({ seed: semilla });
      const hero = heroesOf(state, 0)[0]!;
      const fog = state.players[0]!.fog;
      const mirando = visibleNow(state, 0);
      for (const r of state.raiders) {
        if (!ventajaClara(poderDe(r), fuerzaDe(hero, state.characters))) continue;
        if (!mirando.has(pointKey(r.at))) continue;
        emboscadores++;
        expect(fog.has(pointKey(r.at)), `semilla ${semilla}: ${r.id} se ve y no se pinta`).toBe(
          true,
        );
      }
      const km = serializeKnownMap(state, 0);
      for (const cosa of [...km.raiders, ...km.objects]) {
        expect(
          km.terrain[cosa.at.y * km.width + cosa.at.x],
          `semilla ${semilla}: (${cosa.at.x},${cosa.at.y}) se ve sobre lo no explorado`,
        ).not.toBeNull();
      }
    }
    // Que haya de qué hablar: sin grupos vistos que embosquen, el test pasaría
    // por vacío.
    expect(emboscadores).toBeGreaterThan(20);
  });

  it('jugando, lo que se ve ahora está siempre explorado: también tras capturar un castillo', async () => {
    let capturas = 0;
    let recuerdos = 0;
    for (const semilla of [3, 5, 11]) {
      const state = newGame({ seed: semilla, maxDays: 40 });
      const ctx = { rng: createRng(semilla) };
      while (state.finished === null) {
        const desde = state.log.length;
        await playAiTurn(state, ctx);
        capturas += state.log.slice(desde).filter((e) => e.kind === 'town_captured').length;
        for (const p of state.players) {
          if (p.defeated) continue;
          for (const clave of visibleNow(state, p.id)) {
            expect(p.fog.has(clave), `semilla ${semilla}, día ${state.day}: ${clave}`).toBe(true);
          }
        }
        // Y quien acaba de empezar turno recuerda lo de junto a sus castillos
        // como está HOY, igual que un héroe quieto: la niebla no es solo `fog`.
        if (state.finished !== null) continue;
        const actual = state.players.find((p) => p.id === state.current)!;
        for (const town of state.towns.filter((t) => t.owner === actual.id)) {
          for (const obj of state.map.objects) {
            if (Math.max(Math.abs(obj.at.x - town.at.x), Math.abs(obj.at.y - town.at.y)) > 5)
              continue;
            recuerdos++;
            expect(actual.memory.get(obj.id), `${obj.id} junto a ${town.id}`).toEqual({
              day: state.day,
              object: obj,
            });
          }
        }
      }
    }
    expect(capturas).toBeGreaterThan(0);
    expect(recuerdos).toBeGreaterThan(50);
  });
});

describe('la ruta que pisa una emboscada (H2)', () => {
  it('avisa en el primer paso de la región del grupo, y solo de un grupo que se ve', () => {
    const state = newGame({ seed: 1 });
    const hero = heroesOf(state, 0)[0]!;
    const camino = caminoHasta(state, hero, { x: 2, y: 10 })!;
    const mirando = visibleNow(state, 0);
    const aviso = emboscadaEnLaRuta(state, hero, camino, mirando)!;
    expect(aviso).not.toBeNull();
    // La misma regla que la marcha: el paso avisado es donde salta.
    const r = regionDeCasilla(state.map, camino[aviso.paso]!.at);
    expect(regionDeCasilla(state.map, aviso.raider.at)).toBe(r);
    for (const paso of camino.slice(0, aviso.paso)) {
      expect(regionDeCasilla(state.map, paso.at)).not.toBe(r);
    }
    // Lo que no se ve no avisa: la ruta no cuenta lo que tapa la niebla.
    expect(emboscadaEnLaRuta(state, hero, camino, new Set())).toBeNull();
    // Y un héroe al que el grupo no le saca el margen, tampoco.
    hero.army = ejercito({ creature: 'paladin', count: 7 });
    expect(emboscadaEnLaRuta(state, hero, camino, mirando)).toBeNull();
  });
});

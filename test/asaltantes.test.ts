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
import { Casillas } from '../src/core/map/casillas.js';
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
  type AsaltanteRecordado,
  asaltantesALaVista,
  casillasPeligrosas,
  dondeBrotan,
  emboscadaEnLaRuta,
  grupoALaVista,
  grupoALaVistaDesde,
  mascaraDeOcupacion,
  pasoDePatrulla,
  pasosDeLaPatrulla,
  problemasDeAsaltante,
  type Raider,
  recordarAsaltantes,
  regionDeCasilla,
  tocaUnNodo,
} from '../src/core/state/asaltantes.js';
import {
  alcanceDelHeroe,
  applyAdventureAction,
  baseOf,
  battleOwners,
  caminoHasta,
  currentPlayer,
  type GameState,
  heroesOf,
  miradasDe,
  resolvePendingBattle,
  revealEverything,
  sidesOwnedBy,
  visibleNow,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import type { Point } from '../src/core/types.js';
import { costesDelAlcance, ejercito } from './helpers.js';
import { segunPrisa } from './lento.js';

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
    hero.at = desde;
    for (const [dx, dy] of VECINAS) {
      const hasta = { x: desde.x + dx, y: desde.y + dy };
      if (!enLibres.has(pointKey(hasta)) || !isEnterable(state.map, hasta)) continue;
      // Un paso y no dos: con caminos, ir a la vecina por otra casilla de
      // camino puede salir más barato que la diagonal, y la marcha se pararía
      // en la de en medio (semilla 11 de los mapas densos).
      if (caminoHasta(state, hero, hasta)?.length !== 1) continue;
      par = { desde, hasta };
      break;
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
    let largos = 0;
    for (let dia = 0; dia < 300; dia++) {
      state.day = dia + 1;
      for (const r of state.raiders) {
        const antes = r.at;
        r.at = pasoDePatrulla(state, r, rng, mascaraDeOcupacion(state));
        if (pointKey(antes) !== pointKey(r.at)) movidas++;
        expect(regionDeCasilla(state.map, r.at), `${r.id} el día ${dia}`).toBe(regiones.get(r.id));
        expect(tocaUnNodo(state.map, r.at), `${r.id} pegado a un nodo`).toBe(false);
        expect(objectAt(state.map, r.at), `${r.id} encima de un objeto`).toBeUndefined();
        // Como mucho los pasos de hoy en Chebyshev (`pasosDeLaPatrulla`, #229):
        // andando por la región, nunca saltando.
        const salto = Math.max(Math.abs(antes.x - r.at.x), Math.abs(antes.y - r.at.y));
        expect(salto).toBeLessThanOrEqual(pasosDeLaPatrulla(state.day));
        if (salto > ASALTANTES.pasosPorDia) largos++;
      }
    }
    // Y que se muevan de verdad: un grupo clavado pasaría todo lo de arriba.
    expect(movidas).toBeGreaterThan(state.raiders.length * 100);
    // Y que los días de 3 se anden: con 2 fijos, la patrulla no seguía la escala.
    expect(largos).toBeGreaterThan(0);
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
    // Hacen falta partidas en las que pasen lunes con sitio para brotar, y en
    // la mayoría la partida acaba antes con todas las regiones ocupadas. Las
    // semillas se fijaban a mano y cada cambio que movía a los héroes las dejaba
    // sin brote —cinco veces, la última con los caminos radiales (#149)—, así
    // que las busca el test: juega desde la 1 hasta reunir tres brotes (cada
    // partida, ~30 ms), mirando el invariante en todas las que juega. En
    // `pnpm verify` basta el primer brote (#167): tres costaban 2,6 s y uno, 1 s.
    for (let semilla = 1; semilla <= 80 && brotados < segunPrisa(1, 3); semilla++) {
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
      const { state, ctx, hero, grupo, hasta } = enSuRegion(11);
      hero.army = ejercito({ creature: 'peasant', count: 2 });
      // El grupo, fijo: los cuatro vampiros con los que se escribió. El más
      // fuerte de la semilla depende del mapa, y con los bordes de #169 eran
      // cinco momias, contra las que la IA no llegaba a rendirse (un desenlace
      // de la batalla, no del veto, que es lo que mira este test).
      (grupo as { troops: unknown }).troops = [{ creature: 'vampire', count: 4 }];
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

describe('la IA teme lo que vio (#164)', () => {
  /** Todas las casillas de la región de `at`: mirarla entera. */
  const laRegion = (state: GameState, at: Point): Casillas => {
    const { regionDe } = estructura(state.map);
    const r = regionDeCasilla(state.map, at);
    const indices: number[] = [];
    for (let i = 0; i < regionDe.length; i++) if (regionDe[i] === r) indices.push(i);
    return Casillas.deIndices(state.map, indices);
  };

  it('se apunta al ver su región, se recuerda sin mirarla y se olvida al mirarla sin él', () => {
    const state = newGame({ seed: 5 });
    const grupo = state.raiders[0]!;
    const recuerdo = new Map<string, AsaltanteRecordado>();
    // Mirar otra región no apunta nada de este grupo.
    const otro = state.raiders.find(
      (r) => regionDeCasilla(state.map, r.at) !== regionDeCasilla(state.map, grupo.at),
    )!;
    recordarAsaltantes(state, recuerdo, laRegion(state, otro.at));
    expect(recuerdo.has(grupo.id)).toBe(false);

    recordarAsaltantes(state, recuerdo, laRegion(state, grupo.at));
    expect(recuerdo.get(grupo.id)).toEqual({
      day: state.day,
      grupo: { id: grupo.id, at: grupo.at, troops: grupo.troops },
    });
    // Sin mirarla: aunque se vaya, se sigue recordando.
    state.raiders = state.raiders.filter((r) => r !== grupo);
    recordarAsaltantes(state, recuerdo, laRegion(state, otro.at));
    expect(recuerdo.has(grupo.id)).toBe(true);
    // Mirándola y sin él: se olvida.
    recordarAsaltantes(state, recuerdo, laRegion(state, grupo.at));
    expect(recuerdo.has(grupo.id)).toBe(false);
  });

  it('el alcance prudente esquiva el grupo que su dueño vio y no el que no ha visto', () => {
    const { state, hero, grupo } = enSuRegion(5);
    hero.army = [];
    const W = state.map.width;
    const i = grupo.at.y * W + grupo.at.x;
    const recuerdo = state.players[0]!.asaltantesVistos;
    recuerdo.clear();
    expect(casillasPeligrosas(state, hero, recuerdo)?.[i]).toBeUndefined();
    const sinSaber = alcanceDelHeroe(state, hero, { evitarEmboscadas: true });
    recordarAsaltantes(state, recuerdo, laRegion(state, grupo.at));
    expect(casillasPeligrosas(state, hero, recuerdo)?.[i]).toBe(1);
    const sabiendo = alcanceDelHeroe(state, hero, { evitarEmboscadas: true });
    expect(sabiendo.descubiertas.length).toBeLessThan(sinSaber.descubiertas.length);
  });

  it('al crear la partida, cada jugador recuerda los grupos que ve: el recuerdo lo escribe quien mira', () => {
    const state = newGame({ seed: 5 });
    for (const p of state.players) {
      const vistos = asaltantesALaVista(state, visibleNow(state, p.id)).map((r) => r.id);
      for (const id of vistos) expect(p.asaltantesVistos.has(id), `${id} para ${p.id}`).toBe(true);
    }
  });
});

describe('la IA no entra en una emboscada que va a perder', () => {
  it('su alcance prudente no pisa ninguna casilla de una región donde la emboscarían, la suya incluida', () => {
    // El héroe, sin tropa —solo su cuerpo—, en una casilla de la región del
    // grupo más fuerte: todas las regiones con grupo son peligrosas para él.
    const { state, hero, grupo } = enSuRegion(5);
    hero.army = [];
    // Lo que sabe el héroe recién puesto ahí: nada aún; al mirar, el grupo.
    const recuerdo = state.players[0]!.asaltantesVistos;
    recuerdo.clear();
    expect(casillasPeligrosas(state, hero, recuerdo)).toBeNull();
    revealEverything(state, 0);
    const peligro = casillasPeligrosas(state, hero, recuerdo)!;
    expect(peligro).not.toBeNull();
    const suya = regionDeCasilla(state.map, hero.at);
    expect(regionDeCasilla(state.map, grupo.at)).toBe(suya);
    const W = state.map.width;
    expect(peligro[hero.at.y * W + hero.at.x]).toBe(1);
    const alcance = alcanceDelHeroe(state, hero, { evitarEmboscadas: true });
    for (const clave of costesDelAlcance(alcance).keys()) {
      const [x, y] = clave.split(',').map(Number) as [number, number];
      if (x === hero.at.x && y === hero.at.y) continue;
      expect(peligro[y * W + x], `(${x},${y}) es de una región que embosca`).not.toBe(1);
    }
    // Y sale: desde dentro se pisa el nodo de al lado, si lo hay; prohibir la
    // región no es encerrarlo en su casilla.
    const normal = alcanceDelHeroe(state, hero);
    expect(alcance.descubiertas.length).toBeLessThan(normal.descubiertas.length);
  });

  it('si los dos están encerrados en una región que los embosca, el que juega vuelve a casa; si el rival se mueve, espera', async () => {
    // La semilla 10 del banco con los mapas densos: los dos héroes, sin tropa,
    // en mitad de una región que los embosca y sin un nodo al lado. El alcance
    // prudente era su casilla, el repliegue no llegaba y nadie se movió en 298
    // días. Se buscan dos casillas así en la región del grupo más fuerte. La 1
    // desde el acantilado en línea (#215): en el mapa nuevo de la 5 el que
    // juega no se mueve con los dos encerrados (queda en el informe de #215).
    const montar = () => {
      const { state, ctx, hero, grupo } = enSuRegion(1);
      // Los dos saben del grupo (#164): se prueba qué hacen con lo que saben.
      revealEverything(state, 0);
      revealEverything(state, 1);
      const rival = heroesOf(state, 1)[0]!;
      hero.army = [];
      rival.army = [];
      const encerradas = libresDeSuRegion(state, grupo).filter((p) => {
        hero.at = p;
        return alcanceDelHeroe(state, hero, { evitarEmboscadas: true }).descubiertas.length <= 1;
      });
      if (encerradas.length < 2) throw new Error('la semilla 1 no deja dos casillas encerradas');
      hero.at = encerradas[0]!;
      hero.movePoints = 1500;
      expect(currentPlayer(state).id).toBe(hero.owner);
      return { state, ctx, hero, rival, otra: encerradas[1]! };
    };
    const seMovio = (state: GameState, id: string) =>
      state.log.some((e) => e.kind === 'hero_moved' && e.hero === id);

    // El rival en su casa, libre: esperar todavía puede arreglarlo.
    const libre = montar();
    expect(
      alcanceDelHeroe(libre.state, libre.rival, { evitarEmboscadas: true }).descubiertas.length,
    ).toBeGreaterThan(1);
    await playAiTurn(libre.state, libre.ctx);
    expect(seMovio(libre.state, libre.hero.id)).toBe(false);

    // El rival encerrado también: o ha andado hacia casa, o lo han emboscado al
    // intentarlo. Quieto, no.
    const empate = montar();
    empate.rival.at = empate.otra;
    expect(
      alcanceDelHeroe(empate.state, empate.rival, { evitarEmboscadas: true }).descubiertas.length,
    ).toBeLessThanOrEqual(1);
    await playAiTurn(empate.state, empate.ctx);
    expect(seMovio(empate.state, empate.hero.id)).toBe(true);
  });

  it('en partidas enteras de la IA contra sí misma no hay ni una emboscada', async () => {
    // Antes eran 304 en las 200 del banco y el grupo ganaba 270: el «si no, va
    // igual» mandaba al héroe a perder. Ahora se repliega y se refuerza. Con la
    // niebla (#164) puede caer en una que no vio venir: 1 en 300 semillas, no
    // en estas.
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
  it('el día 1, todo grupo que embosca al héroe y cuya casilla se ve está explorado, y ningún objeto cae sobre `null`', () => {
    let emboscadores = 0;
    let sobreLaNiebla = 0;
    for (let semilla = 1; semilla <= 60; semilla++) {
      const state = newGame({ seed: semilla });
      const hero = heroesOf(state, 0)[0]!;
      const fog = state.players[0]!.fog;
      const mirando = visibleNow(state, 0);
      for (const r of state.raiders) {
        if (!ventajaClara(poderDe(r), fuerzaDe(hero, state.characters))) continue;
        if (!mirando.has(r.at)) continue;
        emboscadores++;
        expect(fog.has(r.at), `semilla ${semilla}: ${r.id} se ve y no se pinta`).toBe(true);
      }
      const km = serializeKnownMap(state, 0);
      for (const cosa of km.objects) {
        expect(
          km.terrain[cosa.at.y * km.width + cosa.at.x],
          `semilla ${semilla}: (${cosa.at.x},${cosa.at.y}) se ve sobre lo no explorado`,
        ).not.toBeNull();
      }
      // Un grupo sí puede: se ve porque se ve su región (#130), y su casilla
      // puede seguir en la niebla. El terreno no se regala por eso.
      for (const r of km.raiders) {
        if (km.terrain[r.at.y * km.width + r.at.x] === null) sobreLaNiebla++;
      }
    }
    // Que haya de qué hablar: sin grupos vistos que embosquen, el test pasaría
    // por vacío.
    expect(emboscadores).toBeGreaterThan(20);
    expect(sobreLaNiebla).toBeGreaterThan(0);
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
          for (const q of visibleNow(state, p.id)) {
            expect(p.fog.has(q), `semilla ${semilla}, día ${state.day}: ${q.x},${q.y}`).toBe(true);
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
    // La primera semilla con un destino cuya ruta pisa, a la vista, la región de
    // un grupo que embosca. Eran la semilla 1 y la (2,10), escritas a mano, y
    // los mapas densos se las llevaron.
    const hallada = (() => {
      for (let seed = 1; seed <= 200; seed++) {
        const state = newGame({ seed });
        const hero = heroesOf(state, 0)[0]!;
        const vistos = asaltantesALaVista(state, visibleNow(state, 0));
        for (let y = 0; y < state.map.height; y++) {
          for (let x = 0; x < state.map.width; x++) {
            const camino = caminoHasta(state, hero, { x, y });
            if (camino === null) continue;
            const aviso = emboscadaEnLaRuta(state, hero, camino, vistos);
            if (aviso !== null) return { state, hero, camino, vistos, aviso };
          }
        }
      }
      throw new Error('ninguna de 200 semillas da una ruta con emboscada a la vista');
    })();
    const { state, hero, camino, vistos, aviso } = hallada;
    // La misma regla que la marcha: el paso avisado es donde salta.
    const r = regionDeCasilla(state.map, camino[aviso.paso]!.at);
    expect(regionDeCasilla(state.map, aviso.raider.at)).toBe(r);
    for (const paso of camino.slice(0, aviso.paso)) {
      expect(regionDeCasilla(state.map, paso.at)).not.toBe(r);
    }
    // Lo que no se ve no avisa: la ruta no cuenta lo que tapa la niebla.
    expect(
      emboscadaEnLaRuta(state, hero, camino, asaltantesALaVista(state, Casillas.vacias(state.map))),
    ).toBeNull();
    // Y un héroe al que el grupo no le saca el margen, tampoco.
    hero.army = ejercito({ creature: 'paladin', count: 7 });
    expect(emboscadaEnLaRuta(state, hero, camino, vistos)).toBeNull();
  });
});

describe('qué grupo se ve: basta ver su región (#130)', () => {
  /**
   * La primera semilla con un grupo cuya región se ve el día 1 y cuya casilla
   * no: el caso que la regla nueva cambia. Buscado, no escrito a mano.
   */
  function grupoPorSuRegion() {
    for (let seed = 1; seed <= 60; seed++) {
      const state = newGame({ seed });
      const mirando = visibleNow(state, 0);
      for (const raider of state.raiders) {
        if (mirando.has(raider.at)) continue;
        const region = regionDeCasilla(state.map, raider.at);
        const casilla = [...mirando].find((p) => regionDeCasilla(state.map, p) === region);
        if (casilla !== undefined) return { state, raider, mirando, casilla };
      }
    }
    throw new Error('ningún grupo se ve por su región y no por su casilla en 60 semillas');
  }

  it('una casilla de su región a la vista basta, aunque la suya no se vea', () => {
    const { state, raider, mirando, casilla } = grupoPorSuRegion();
    expect(asaltantesALaVista(state, mirando).map((r) => r.id)).toContain(raider.id);
    // Solo esa casilla: se ve él y los de su región, nadie más.
    const region = regionDeCasilla(state.map, raider.at);
    const sola = Casillas.vacias(state.map);
    sola.add(casilla);
    const vistos = asaltantesALaVista(state, sola);
    expect(vistos.map((r) => r.id)).toContain(raider.id);
    for (const r of vistos) expect(regionDeCasilla(state.map, r.at)).toBe(region);
    // Sin mirar nada, ninguno; con «Ver mapa entero», todos.
    expect(asaltantesALaVista(state, Casillas.vacias(state.map))).toEqual([]);
    expect(asaltantesALaVista(state, null).map((r) => r.id)).toEqual(
      state.raiders.map((r) => r.id),
    );
  });

  it('la ruta avisa de un grupo cuya casilla no se ve si se ve su región', () => {
    const { state, raider, mirando } = grupoPorSuRegion();
    const hero = heroesOf(state, 0)[0]!;
    // Lo bastante débil para que cualquiera le saque el margen: aquí se mira
    // qué se ve, no quién embosca a quién.
    hero.army = ejercito({ creature: 'peasant', count: 1 });
    const region = regionDeCasilla(state.map, raider.at);
    const { regionDe } = estructura(state.map);
    const i = regionDe.indexOf(region);
    const destino = { x: i % state.map.width, y: Math.floor(i / state.map.width) };
    const camino = caminoHasta(state, hero, destino);
    if (camino === null) throw new Error('no hay camino a la región del grupo');
    const aviso = emboscadaEnLaRuta(state, hero, camino, asaltantesALaVista(state, mirando));
    expect(aviso).not.toBeNull();
    expect(regionDeCasilla(state.map, aviso!.raider.at)).toBe(
      regionDeCasilla(state.map, camino[aviso!.paso]!.at),
    );
  });

  it('el agente lee la misma regla: `knownMap.raiders` es `asaltantesALaVista`', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = newGame({ seed });
      for (const p of [0, 1] as const) {
        expect(
          serializeKnownMap(state, p).raiders.map((r) => r.id),
          `semilla ${seed}`,
        ).toEqual(asaltantesALaVista(state, visibleNow(state, p)).map((r) => r.id));
      }
    }
  });

  it('sin el `Set`, desde las miradas del jugador, es la misma regla grupo a grupo', async () => {
    // `grupoALaVistaDesde` (la crónica y la parada de la marcha) recorre los
    // cuadrados de visión en vez de levantar las claves: dos escrituras de la
    // misma regla, atadas aquí. Con la partida avanzada unos días, para que
    // haya héroes lejos de casa y grupos que se ven solo por su región.
    let porSuRegion = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const state = newGame({ seed });
      for (let turno = 0; turno < 6 && state.finished === null; turno++) {
        await playAiTurn(state, { rng: createRng(seed * 100 + turno) });
      }
      for (const p of [0, 1] as const) {
        const mirando = visibleNow(state, p);
        const seVe = grupoALaVista(state.map, mirando);
        const miradas = miradasDe(state, p);
        for (const r of state.raiders) {
          const desde = grupoALaVistaDesde(state.map, miradas, r.at);
          expect(desde, `semilla ${seed}, ${r.id}, jugador ${p}`).toBe(seVe(r.at));
          if (desde && !mirando.has(r.at)) porSuRegion++;
        }
      }
    }
    expect(porSuRegion).toBeGreaterThan(0);
  });

  it('la crónica sella el brote con la misma regla: se entera quien ve su región', () => {
    let deLejos = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const state = newGame({ seed });
      for (const e of state.log) {
        if (e.kind !== 'raider_spawned') continue;
        const grupo = state.raiders.find((r) => r.id === e.raider)!;
        for (const p of [0, 1] as const) {
          const loVe = asaltantesALaVista(state, visibleNow(state, p)).includes(grupo);
          expect(e.seen.includes(p), `semilla ${seed}, ${e.raider}, jugador ${p}`).toBe(loVe);
          if (loVe && !visibleNow(state, p).has(grupo.at)) deLejos++;
        }
      }
    }
    // Que alguno se vea por su región y no por su casilla, o esto no probaría
    // la regla nueva.
    expect(deLejos).toBeGreaterThan(0);
  });
});

/**
 * Los asaltantes de caminos (ciclo «el camino cuesta»): patrullan su región sin
 * cruzar nodos, emboscan al héroe que la pisa si le sacan el margen, se
 * dispersan cuando su región tiene dueño y brotan los lunes donde no hay nadie.
 *
 * Cada `it` sale de un criterio de verificación del plan, y los que dependen
 * del azar van con su semilla: la patrulla y el brote tiran de `createRng`.
 */

import { describe, expect, it } from 'vitest';
import { fuerzaDe, MARGEN_CONTRA_NEUTRALES, poderDe } from '../src/core/ai/fuerza.js';
import { playAiTurn } from '../src/core/ai/turn.js';
import { serializeKnownMap } from '../src/core/contract/serialize.js';
import { ASALTANTES } from '../src/core/data.js';
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
  dondeBrotan,
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
  applyAdventureAction,
  caminoHasta,
  type GameState,
  heroesOf,
  resolvePendingBattle,
  visibleNow,
  visibleNowAt,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import type { Point } from '../src/core/types.js';
import { ejercito, JINETE, PESADA, TROPA_BARATA } from './helpers.js';
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
  it('un héroe que no da el margen al grupo pasa sin batalla', () => {
    const { state, ctx, hero, grupo, hasta } = enSuRegion(11);
    // Seis jinetes: con la escala baja (26-10-2026), seis pesadas ya no daban el margen.
    hero.army = ejercito({ creature: JINETE, count: 6 });
    expect(poderDe(grupo)).toBeLessThanOrEqual(MARGEN_CONTRA_NEUTRALES * fuerzaDe(hero, undefined));
    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: hasta }, ctx, 0);
    expect(state.pendingBattle).toBeNull();
    expect(hero.at).toEqual(hasta);
  });

  it('gana el héroe atacando: el grupo desaparece', () => {
    const { state, ctx, hero, grupo } = enSuRegion(11);
    hero.army = ejercito({ creature: PESADA, count: 6 });
    // El grupo, fijo y flojo: el más fuerte de la semilla depende del mapa, y
    // con las puertas de las ciudades (la ciudad amurallada) eran cuatro orkos
    // de armadura pesada que ganaban. Aquí se mide qué pasa si gana el héroe.
    (grupo as { troops: unknown }).troops = [{ creature: TROPA_BARATA, count: 2 }];
    hero.at = libresDeSuRegion(state, grupo).find(
      (p) => Math.max(Math.abs(p.x - grupo.at.x), Math.abs(p.y - grupo.at.y)) === 1,
    )!;
    applyAdventureAction(state, { type: 'move_hero', hero: hero.id, to: grupo.at }, ctx, 0);
    expect(state.pendingBattle?.foe).toEqual({ kind: 'raider', raiderId: grupo.id });
    resolvePendingBattle(state, ctx);
    expect(state.raiders.some((r) => r.id === grupo.id)).toBe(false);
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
    hero.army = ejercito({ creature: PESADA, count: 6 });
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
  /** Solo la casilla `at`: mirarla a ella (un grupo se ve por su casilla, 02-11-2026). */
  const laCasilla = (state: GameState, at: Point): Casillas => {
    const sola = Casillas.vacias(state.map);
    sola.add(at);
    return sola;
  };

  it('se apunta al ver su casilla, se recuerda sin mirarla y se olvida al mirarla sin él', () => {
    const state = newGame({ seed: 5 });
    const grupo = state.raiders[0]!;
    const recuerdo = new Map<string, AsaltanteRecordado>();
    // Mirar la casilla de otro grupo no apunta nada de este.
    const otro = state.raiders.find(
      (r) => regionDeCasilla(state.map, r.at) !== regionDeCasilla(state.map, grupo.at),
    )!;
    recordarAsaltantes(state, recuerdo, laCasilla(state, otro.at));
    expect(recuerdo.has(grupo.id)).toBe(false);

    recordarAsaltantes(state, recuerdo, laCasilla(state, grupo.at));
    expect(recuerdo.get(grupo.id)).toEqual({
      day: state.day,
      grupo: { id: grupo.id, at: grupo.at, troops: grupo.troops },
    });
    // Sin mirarla: aunque se vaya, se sigue recordando.
    state.raiders = state.raiders.filter((r) => r !== grupo);
    recordarAsaltantes(state, recuerdo, laCasilla(state, otro.at));
    expect(recuerdo.has(grupo.id)).toBe(true);
    // Mirándola y sin él: se olvida.
    recordarAsaltantes(state, recuerdo, laCasilla(state, grupo.at));
    expect(recuerdo.has(grupo.id)).toBe(false);
  });

  it('al crear la partida, cada jugador recuerda los grupos que ve: el recuerdo lo escribe quien mira', () => {
    const state = newGame({ seed: 5 });
    for (const p of state.players) {
      const vistos = asaltantesALaVista(state, visibleNow(state, p.id)).map((r) => r.id);
      for (const id of vistos) expect(p.asaltantesVistos.has(id), `${id} para ${p.id}`).toBe(true);
    }
  });
});

describe('los datos de los asaltantes', () => {
  it('siete jinetes son un muro, y se rechazan diciéndolo', () => {
    const problemas = problemasDeAsaltante([{ creature: JINETE, count: 7 }], 'el grupo');
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
            // Lo que no se ha explorado no se mira, aunque caiga en el radio.
            if (!actual.fog.has(obj.at)) continue;
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

describe('qué grupo se ve: si se mira su casilla (02-11-2026)', () => {
  /**
   * La primera semilla con un grupo cuya región se ve el día 1 y cuya casilla
   * no: el caso que separa la regla de hoy (la casilla, el radio de quien mira)
   * de la de #130 (la región). Buscado, no escrito a mano.
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
    throw new Error('ningún grupo tiene su región a la vista y su casilla no en 60 semillas');
  }

  it('su casilla a la vista basta; una casilla de su región, no', () => {
    const { state, raider, mirando, casilla } = grupoPorSuRegion();
    expect(asaltantesALaVista(state, mirando).map((r) => r.id)).not.toContain(raider.id);
    // Otra casilla de su región: no se ve.
    const otra = Casillas.vacias(state.map);
    otra.add(casilla);
    expect(asaltantesALaVista(state, otra).map((r) => r.id)).not.toContain(raider.id);
    // La suya: se ve él, y solo los que están en ella.
    const suya = Casillas.vacias(state.map);
    suya.add(raider.at);
    expect(asaltantesALaVista(state, suya).map((r) => r.id)).toEqual([raider.id]);
    // Sin mirar nada, ninguno; con «Ver mapa entero», todos.
    expect(asaltantesALaVista(state, Casillas.vacias(state.map))).toEqual([]);
    expect(asaltantesALaVista(state, null).map((r) => r.id)).toEqual(
      state.raiders.map((r) => r.id),
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

  it('casilla a casilla (`visibleNowAt`, la crónica, la marcha y la IA) es la misma regla grupo a grupo', async () => {
    // `visibleNowAt` recorre las miradas en vez de levantar las casillas: dos
    // escrituras de la misma regla, atadas aquí. Con la partida avanzada unos
    // días, para que haya héroes lejos de casa y grupos a la vista y fuera de ella.
    let vistos = 0;
    let noVistos = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const state = newGame({ seed });
      for (let turno = 0; turno < 6 && state.finished === null; turno++) {
        await playAiTurn(state, { rng: createRng(seed * 100 + turno) });
      }
      for (const p of [0, 1] as const) {
        const seVen = asaltantesALaVista(state, visibleNow(state, p));
        for (const r of state.raiders) {
          const desde = visibleNowAt(state, p, r.at);
          expect(desde, `semilla ${seed}, ${r.id}, jugador ${p}`).toBe(seVen.includes(r));
          if (desde) vistos++;
          else noVistos++;
        }
      }
    }
    expect(vistos).toBeGreaterThan(0);
    expect(noVistos).toBeGreaterThan(0);
  });

  it('la crónica sella el brote con la misma regla: se entera quien mira su casilla', () => {
    let sellados = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const state = newGame({ seed });
      for (const e of state.log) {
        if (e.kind !== 'raider_spawned') continue;
        const grupo = state.raiders.find((r) => r.id === e.raider)!;
        for (const p of [0, 1] as const) {
          const loVe = asaltantesALaVista(state, visibleNow(state, p)).includes(grupo);
          expect(e.seen.includes(p), `semilla ${seed}, ${e.raider}, jugador ${p}`).toBe(loVe);
          sellados++;
        }
      }
    }
    expect(sellados).toBeGreaterThan(0);
  });
});

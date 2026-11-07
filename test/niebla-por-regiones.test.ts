/**
 * La niebla por regiones y la niebla de eventos (02-11-2026, petición del
 * usuario: «Haz que la niebla del mapa no visto vaya por regiones. Al entrar en
 * una región se muestra entera. Añada una niebla de eventos en torno a héroes y
 * nodos controlados por el jugador. Lo que pase cerca en un radio x se ve. Si
 * no, no»).
 *
 * Cada `it` sale de un criterio del plan (`docs/agents/2026-11-02-niebla-por-regiones/`):
 * lo explorado es siempre una unión de regiones enteras; al empezar, las de la
 * base; pisar una región o su paso la descubre; un nodo propio mira a 6; y
 * dentro del radio pero sin explorar no se ve nada.
 */
import { describe, expect, it } from 'vitest';
import { playAiTurn } from '../src/core/ai/turn.js';
import { Casillas } from '../src/core/map/casillas.js';
import { regionDescubierta, regionesQueDescubre, zonaDeNiebla } from '../src/core/map/niebla.js';
import { rioAnteLaCiudad } from '../src/core/map/recinto.js';
import { estructura, regionMasCercana } from '../src/core/map/regiones.js';
import type { MapObject } from '../src/core/map/tipos.js';
import { createRng } from '../src/core/rng.js';
import { asaltantesALaVista } from '../src/core/state/asaltantes.js';
import { heroesOf, playerById, townsOf } from '../src/core/state/consultas.js';
import {
  HERO_SCOUT_RADIUS,
  heroesALaVista,
  NODE_SCOUT_RADIUS,
  revealEverything,
  visibleNow,
  visibleNowAt,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import type { GameState } from '../src/core/state/tipos.js';
import type { PlayerId, Point } from '../src/core/types.js';

const aPunto = (i: number, W: number): Point => ({ x: i % W, y: Math.floor(i / W) });
const chebyshev = (a: Point, b: Point): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Lo explorado que debería tener un jugador: la unión de las zonas de sus regiones descubiertas. */
function unionDeLoDescubierto(state: GameState, p: PlayerId): Set<number> {
  const { fog } = playerById(state, p);
  const out = new Set<number>();
  for (let k = 0; k < state.map.regions.length; k++) {
    if (regionDescubierta(state.map, fog, k))
      for (const i of zonaDeNiebla(state.map, k)) out.add(i);
  }
  return out;
}

/** Que `fog` sea exactamente la unión de las zonas de sus regiones descubiertas. */
function esUnionDeRegiones(state: GameState, p: PlayerId, donde: string): void {
  const esperado = unionDeLoDescubierto(state, p);
  const indices = playerById(state, p).fog.indices();
  expect(indices.length, `${donde}: casillas exploradas`).toBe(esperado.size);
  for (const i of indices) expect(esperado.has(i), `${donde}: casilla ${i}`).toBe(true);
}

describe('la zona de una región', () => {
  it('las zonas cubren el mapa, y solo se solapan en los pasos', () => {
    const state = newGame({ seed: 7 });
    const { map } = state;
    const red = estructura(map);
    const cercana = regionMasCercana(map);
    const veces = new Uint8Array(map.width * map.height);
    for (let k = 0; k < map.regions.length; k++) {
      for (const i of zonaDeNiebla(map, k)) veces[i] = (veces[i] as number) + 1;
    }
    // Toda casilla está en alguna zona: nada se queda en negro para siempre.
    expect([...veces].every((v) => v >= 1)).toBe(true);
    // Lo que está en dos o más es de un paso: un nodo, el recinto de una ciudad
    // o su puente. Cada nodo está en la zona de todas las regiones que une.
    for (const nodo of red.nodos) {
      const i = nodo.at.y * map.width + nodo.at.x;
      for (const k of nodo.regiones) expect(zonaDeNiebla(map, k)).toContain(i);
    }
    // Y la cordillera va con la región que tiene más cerca.
    for (let i = 0; i < veces.length; i++) {
      if (red.regionDe[i] === -1 && veces[i] === 1) {
        expect(zonaDeNiebla(map, cercana[i] as number)).toContain(i);
      }
    }
  });

  it('lanza con una región que el mapa no tiene, o una casilla fuera de él', () => {
    const state = newGame({ seed: 7 });
    expect(() => zonaDeNiebla(state.map, 99)).toThrow(/no tiene región 99/);
    expect(() => regionesQueDescubre(state.map, { x: -1, y: 0 })).toThrow(/fuera del mapa/);
  });
});

describe('lo explorado va por regiones', () => {
  it('al empezar, cada jugador tiene descubiertas las regiones de su base y nada más', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const state = newGame({ seed });
      for (const p of state.players) {
        const base = state.towns.find((t) => t.id === p.base)!;
        const suyas = regionesQueDescubre(state.map, base.at);
        expect(suyas.length, `semilla ${seed}`).toBeGreaterThan(0);
        for (let k = 0; k < state.map.regions.length; k++) {
          expect(regionDescubierta(state.map, p.fog, k), `semilla ${seed}, región ${k}`).toBe(
            suyas.includes(k),
          );
        }
        esUnionDeRegiones(state, p.id, `semilla ${seed}, jugador ${p.id}`);
      }
    }
  });

  it('jugando, lo explorado es siempre una unión de regiones enteras, y quien pisa una región o un paso las tiene', async () => {
    let sobreUnPaso = 0;
    let regionesNuevas = 0;
    for (const seed of [3, 5, 11]) {
      const state = newGame({ seed, maxDays: 15 });
      const ctx = { rng: createRng(seed) };
      const alEmpezar = state.players.map(
        (p) => state.map.regions.filter((_, k) => regionDescubierta(state.map, p.fog, k)).length,
      );
      while (state.finished === null) {
        await playAiTurn(state, ctx);
        for (const p of state.players) {
          if (p.defeated) continue;
          esUnionDeRegiones(state, p.id, `semilla ${seed}, día ${state.day}`);
        }
        for (const hero of state.heroes) {
          const fog = playerById(state, hero.owner).fog;
          const pisa = regionesQueDescubre(state.map, hero.at);
          if (pisa.length > 1) sobreUnPaso++;
          for (const k of pisa) {
            expect(
              regionDescubierta(state.map, fog, k),
              `${hero.id} en (${hero.at.x},${hero.at.y})`,
            ).toBe(true);
          }
        }
        // Lo que se ve ahora está siempre explorado: nada se ve sobre el negro.
        for (const p of state.players) {
          if (p.defeated) continue;
          for (const q of visibleNow(state, p.id)) expect(p.fog.has(q)).toBe(true);
        }
      }
      for (const p of state.players) {
        const ahora = state.map.regions.filter((_, k) =>
          regionDescubierta(state.map, p.fog, k),
        ).length;
        regionesNuevas += ahora - (alEmpezar[p.id] as number);
      }
    }
    // Que haya de qué hablar: alguien pisó un paso y se descubrieron regiones.
    expect(sobreUnPaso).toBeGreaterThan(0);
    expect(regionesNuevas).toBeGreaterThan(0);
  });
});

describe('lo que se ve ahora: el radio sobre lo explorado', () => {
  /** Una casilla a `d` del centro, dentro del mapa, por la fila o la columna que quepa. */
  function aDistancia(state: GameState, c: Point, d: number): Point[] {
    const { width, height } = state.map;
    return [
      { x: c.x + d, y: c.y },
      { x: c.x - d, y: c.y },
      { x: c.x, y: c.y + d },
      { x: c.x, y: c.y - d },
    ].filter((q) => q.x >= 0 && q.y >= 0 && q.x < width && q.y < height);
  }

  it('un nodo propio mira a 6, como un castillo, y no más', () => {
    let probados = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const state = newGame({ seed });
      revealEverything(state, 0);
      const nodo = state.map.objects.find(
        (o): o is Extract<MapObject, { kind: 'node' }> => o.kind === 'node' && o.owner === null,
      )!;
      // Lejos de todo lo demás que mira el jugador 0.
      const otros = [...heroesOf(state, 0).map((h) => h.at), ...townsOf(state, 0).map((t) => t.at)];
      const lejos = (q: Point) => otros.every((o) => chebyshev(o, q) > NODE_SCOUT_RADIUS + 1);
      const dentro = aDistancia(state, nodo.at, NODE_SCOUT_RADIUS).filter(lejos);
      const fuera = aDistancia(state, nodo.at, NODE_SCOUT_RADIUS + 1).filter(lejos);
      if (dentro.length === 0 || fuera.length === 0) continue;
      for (const q of dentro) expect(visibleNowAt(state, 0, q)).toBe(false);
      nodo.owner = 0;
      for (const q of dentro) {
        expect(visibleNowAt(state, 0, q), `semilla ${seed}`).toBe(true);
        expect(visibleNow(state, 0).has(q)).toBe(true);
      }
      for (const q of fuera) {
        expect(visibleNowAt(state, 0, q), `semilla ${seed}`).toBe(false);
        expect(visibleNow(state, 0).has(q)).toBe(false);
      }
      probados++;
    }
    expect(probados).toBeGreaterThan(3);
  });

  it('dentro del radio pero sin explorar no se ve: ni el héroe rival ni un grupo', () => {
    let probados = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const state = newGame({ seed });
      const yo = playerById(state, 0);
      const hero = heroesOf(state, 0)[0]!;
      const rival = heroesOf(state, 1)[0];
      if (rival === undefined) continue;
      // Una casilla en el radio del héroe que su dueño no ha explorado: tras una
      // barrera, en una región sin pisar.
      let q: Point | null = null;
      for (let dy = -HERO_SCOUT_RADIUS; dy <= HERO_SCOUT_RADIUS && q === null; dy++) {
        for (let dx = -HERO_SCOUT_RADIUS; dx <= HERO_SCOUT_RADIUS && q === null; dx++) {
          const c = { x: hero.at.x + dx, y: hero.at.y + dy };
          if (c.x < 0 || c.y < 0 || c.x >= state.map.width || c.y >= state.map.height) continue;
          if (!yo.fog.has(c)) q = c;
        }
      }
      if (q === null) continue;
      rival.at = q;
      expect(visibleNowAt(state, 0, q)).toBe(false);
      expect(visibleNow(state, 0).has(q)).toBe(false);
      expect(heroesALaVista(state, 0, visibleNow(state, 0))).not.toContain(rival);
      const grupo = state.raiders[0];
      if (grupo !== undefined) {
        grupo.at = q;
        expect(asaltantesALaVista(state, visibleNow(state, 0))).not.toContain(grupo);
      }
      // En cuanto se explora, el mismo sitio se ve.
      revealEverything(state, 0);
      expect(visibleNowAt(state, 0, q)).toBe(true);
      expect(heroesALaVista(state, 0, visibleNow(state, 0))).toContain(rival);
      probados++;
    }
    expect(probados).toBeGreaterThan(3);
  });

  it('un grupo de su misma región fuera del radio no se ve, aunque se vea su región', () => {
    let probados = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const state = newGame({ seed });
      revealEverything(state, 0);
      const mirando = visibleNow(state, 0);
      const { regionDe } = estructura(state.map);
      const W = state.map.width;
      for (const grupo of state.raiders) {
        const region = regionDe[grupo.at.y * W + grupo.at.x];
        // Su región se mira por alguna casilla, y la suya no.
        if (mirando.has(grupo.at)) continue;
        if (!mirando.indices().some((i) => regionDe[i] === region)) continue;
        expect(asaltantesALaVista(state, mirando)).not.toContain(grupo);
        // Puesto a una casilla mirada de su región, se ve.
        const i = mirando.indices().find((j) => regionDe[j] === region)!;
        grupo.at = aPunto(i, W);
        expect(asaltantesALaVista(state, visibleNow(state, 0))).toContain(grupo);
        probados++;
        break;
      }
    }
    expect(probados).toBeGreaterThan(0);
  });

  it('`visibleNow` sin explorar nada es vacío aunque haya héroes', () => {
    const state = newGame({ seed: 4 });
    const yo = playerById(state, 0);
    // Se vacía lo explorado: el radio solo no ve.
    (yo as { fog: Casillas }).fog = Casillas.vacias(state.map);
    expect(visibleNow(state, 0).size).toBe(0);
    expect(visibleNowAt(state, 0, heroesOf(state, 0)[0]!.at)).toBe(false);
  });
});

describe('vuelta 1 de QA', () => {
  it('toda casilla del recinto de una ciudad y su puente descubren las regiones de la ciudad (H4)', () => {
    let casillas = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const { map } = newGame({ seed });
      for (const nodo of estructura(map).nodos) {
        if (nodo.clase !== 'ciudad') continue;
        const sitios: Point[] = [];
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) sitios.push({ x: nodo.at.x + dx, y: nodo.at.y + dy });
        const puente = rioAnteLaCiudad(map, nodo.at);
        if (puente !== null) sitios.push(puente.acceso);
        for (const p of sitios) {
          expect(regionesQueDescubre(map, p), `semilla ${seed}, (${p.x},${p.y})`).toEqual(
            nodo.regiones,
          );
          casillas++;
        }
      }
    }
    expect(casillas).toBeGreaterThan(100);
  });
});

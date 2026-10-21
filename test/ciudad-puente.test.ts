/**
 * La ciudad-puente (#144, río continuo; en tierra desde la ciudad amurallada,
 * vuelta 3, fase 2). La red del generador pone la ciudad del cruce que toca el
 * río en una casilla del río (`intentarRed`), y el vestido la muda a su orilla
 * (`enSuOrilla`): la ciudad queda en el medio de su recinto, a dos casillas del
 * río, y la casilla del río que tiene delante se pisa y es su puente, tierra de
 * la orilla de enfrente y el acceso de su puerta del río (`rioAnteLaCiudad`).
 *
 * - `orillaDeLaCiudad` (núcleo, generador): qué lado es su orilla.
 * - `rioAnteLaCiudad` (núcleo): cuál es su puente.
 * - En los mapas del juego: la ciudad, en tierra y en su casilla; su puente se
 *   pisa, es de la región de enfrente y es agua en la escena; su puerta del río
 *   existe siempre; el puente de piedra cruza de frente hasta el pie de la cara
 *   del río y no más allá (`puentesSobreElAnillo`, H2 de la vuelta 2).
 * - En el cliente: pulsar la ciudad lleva al héroe por sus puertas.
 */
import { pathFromReachable } from '@core/map/map.js';
import { puertasDeLaCiudad, recintoDeLaCiudad, rioAnteLaCiudad } from '@core/map/recinto.js';
import { estructura } from '@core/map/regiones.js';
import { orillaDeLaCiudad } from '@core/map/rio.js';
import { isWalkable, type TerrainKind } from '@core/map/terrain.js';
import { alcanceDelHeroe } from '@core/state/game.js';
import { describe, expect, it } from 'vitest';
import { EscenaAventura, focoDe } from '../src/client/escenas/aventura.js';
import { centrarEn, mundoAPixel, TILE_INICIAL } from '../src/client/render/camara-mapa.js';
import { analizar } from '../src/client/render/escenario/analizar.js';
import { claveDe } from '../src/client/render/escenario/pintar.js';
import {
  ejesDeLosPuentes,
  type Punto,
  puenteEnElTerreno,
} from '../src/client/render/escenario/puentes.js';
import {
  anilloSobreLaSenda,
  caraHacia,
  puentesSobreElAnillo,
} from '../src/client/render/escenario/recinto.js';
import { SEMIANCHO_DE_LA_HUELLA } from '../src/client/render/escenario/sendas.js';
import { escenarioDe, pisada, topeDeAlejar } from '../src/client/render/escenario/superficie.js';
import { PIES } from '../src/client/render/mapa.js';
import { Session } from '../src/client/session.js';
import { fueraDeSuBase, partidaDe } from './helpers.js';
import { rango, segunPrisa } from './lento.js';

describe('la orilla de una ciudad-puente en la red del generador (`orillaDeLaCiudad`)', () => {
  // 5×5: el río de este a oeste por la fila 2; arriba, las regiones 0 y 1 con la
  // frontera de la T en (2,1); abajo, la 2. La ciudad, en (2,2).
  const W = 5;
  const H = 5;
  const terreno = (fila2: TerrainKind = 'water'): TerrainKind[] =>
    Array.from({ length: W * H }, (_, i) =>
      Math.floor(i / W) === 2 && i % W !== 2 ? fila2 : i === 1 * W + 2 ? 'mountain' : 'grass',
    );
  const regionDe = Int32Array.from({ length: W * H }, (_, i) => {
    const x = i % W;
    const y = Math.floor(i / W);
    if (y === 2 || (x === 2 && y === 1)) return -1;
    return y < 2 ? (x < 2 ? 0 : 1) : 2;
  });

  it('es el lado de las dos regiones de la T, y enfrente, la tercera', () => {
    const map = { width: W, height: H, terrain: terreno() };
    expect(orillaDeLaCiudad(map, { x: 2, y: 2 }, regionDe)).toEqual({
      orilla: { x: 2, y: 1 },
      enfrente: { x: 2, y: 3 },
    });
  });

  it('a la par de regiones, el lado que no se pisa en el medio; sin río debajo, ninguna', () => {
    // Una región a cada lado; arriba se pisa el medio y abajo no (la barrera):
    // la orilla es la de abajo.
    const una = Int32Array.from(regionDe, (r, i) =>
      i === 1 * W + 2 ? 0 : i === 3 * W + 2 ? -1 : r === 1 ? 0 : r,
    );
    const map = { width: W, height: H, terrain: terreno() };
    expect(orillaDeLaCiudad(map, { x: 2, y: 2 }, una)?.orilla).toEqual({ x: 2, y: 3 });
    expect(orillaDeLaCiudad({ ...map, terrain: terreno('grass') }, { x: 2, y: 2 }, regionDe)).toBe(
      null,
    );
  });
});

describe('el puente de una ciudad-puente (`rioAnteLaCiudad`)', () => {
  // 7×7: el río de este a oeste por la fila 2, con su casilla (3,2) abierta; la
  // ciudad, en (3,4), en tierra.
  const W = 7;
  const H = 7;
  const terreno = (abierta: TerrainKind = 'grass'): TerrainKind[] =>
    Array.from({ length: W * H }, (_, i) =>
      Math.floor(i / W) === 2 ? (i % W === 3 ? abierta : 'water') : 'grass',
    );
  const ciudad = { kind: 'town' as const, at: { x: 3, y: 4 } };

  it('es la casilla a dos de la ciudad, en cruz, que se pisa con agua a sus dos lados', () => {
    expect(
      rioAnteLaCiudad({ width: W, height: H, terrain: terreno(), objects: [ciudad] }, ciudad.at),
    ).toEqual({
      cara: 'n',
      acceso: { x: 3, y: 2 },
      puerta: { x: 3, y: 3 },
      enfrente: { x: 3, y: 1 },
    });
  });

  it('ni si no se pisa, ni si es un nodo, ni sin agua a los lados', () => {
    const sin = (terrain: TerrainKind[], objects = [ciudad]) =>
      rioAnteLaCiudad({ width: W, height: H, terrain, objects }, ciudad.at);
    expect(sin(terreno('water'))).toBe(null);
    expect(sin(terreno(), [ciudad, { kind: 'town', at: { x: 3, y: 2 } }])).toBe(null);
    expect(
      rioAnteLaCiudad(
        {
          width: W,
          height: H,
          terrain: terreno(),
          objects: [ciudad, { kind: 'node', at: { x: 3, y: 2 } }],
        },
        ciudad.at,
      ),
    ).toBe(null);
    expect(sin(Array.from({ length: W * H }, () => 'grass' as const))).toBe(null);
  });
});

describe('la ciudad-puente en los mapas del juego', () => {
  // En el bucle rápido, s2 (dos ciudades-puente, con el río al este y al oeste)
  // y s37 (cuatro, dos con el río al norte y dos al sur); en la lenta, 1-40
  // (44 en 21 semillas).
  const semillas = segunPrisa([2, 37], rango(1, 40));

  it('la ciudad está en tierra; su puente se pisa, es de la orilla de enfrente y lleva la puerta del río', () => {
    let vistas = 0;
    for (const s of semillas) {
      const { map } = partidaDe(s);
      const W = map.width;
      const red = estructura(map);
      for (const o of map.objects) {
        if (o.kind !== 'town') continue;
        const puente = rioAnteLaCiudad(map, o.at);
        if (puente === null) continue;
        vistas++;
        const donde = `s${s} ${o.id}`;
        // La ciudad, fuera del río: sin agua a dos lados en cruz.
        const agua = (dx: number, dy: number) =>
          map.terrain[(o.at.y + dy) * W + o.at.x + dx] === 'water';
        expect((agua(-1, 0) && agua(1, 0)) || (agua(0, -1) && agua(0, 1)), donde).toBe(false);
        // Su puente se pisa y es de una región, la de enfrente, que es suya.
        const { acceso, enfrente } = puente;
        expect(isWalkable(map.terrain[acceso.y * W + acceso.x] as TerrainKind), donde).toBe(true);
        const r = red.regionDe[acceso.y * W + acceso.x] as number;
        expect(r, donde).toBeGreaterThanOrEqual(0);
        expect(red.nodos[red.nodoPorId.get(o.id) as number]?.regiones, donde).toContain(r);
        if (isWalkable(map.terrain[enfrente.y * W + enfrente.x] as TerrainKind))
          expect(red.regionDe[enfrente.y * W + enfrente.x], donde).toBe(r);
        // La puerta del río existe siempre: el puente es su camino.
        const delRio = puertasDeLaCiudad(map, o.at).find((p) => p.delRio);
        expect(delRio?.cara, donde).toBe(puente.cara);
        expect(delRio?.accesos, donde).toEqual([acceso]);
      }
    }
    expect(vistas).toBeGreaterThanOrEqual(segunPrisa(4, 40));
  });

  it('su puente es agua en la escena y cruza de frente hasta el pie de su cara, no más allá', () => {
    let alSur = 0;
    for (const s of semillas) {
      const { map, escena: e } = partidaDe(s);
      const a = analizar(map);
      const esc = escenarioDe(map, s);
      const W = map.width;
      for (const o of map.objects) {
        const lados = a.ciudadesPuente.get(o.id);
        if (o.kind !== 'town' || lados === undefined) continue;
        const donde = `s${s} ${o.id}`;
        const { rio, orilla, enfrente } = lados;
        expect(a.terreno[rio.y * W + rio.x], donde).toBe('water');
        const pu = e.puentes.find((p) => p.ciudad === o.id);
        if (pu === undefined) throw new Error(`${donde}: sin puente`);
        expect(pu.nodo, donde).toEqual([rio.x + 0.5, rio.y + 0.5]);
        expect(pu.eje, donde).toBe(orilla.x === rio.x ? 'ns' : 'eo');
        expect(pu.clase, donde).toBe('piedra');
        // El recinto, con la ciudad en el medio: tiene la puerta del río y no el
        // puente ni la orilla de enfrente.
        const recinto = e.recintos.find((k) => k.id === o.id);
        if (recinto === undefined) throw new Error(`${donde}: sin recinto`);
        expect(recinto.rect, donde).toEqual(recintoDeLaCiudad(o.at, W, map.height));
        const r = recinto.rect;
        const dentro = (p: { x: number; y: number }) =>
          p.x >= r.i0 && p.x <= r.i1 && p.y >= r.j0 && p.y <= r.j1;
        expect([dentro(orilla), dentro(rio), dentro(enfrente)], donde).toEqual([
          true,
          false,
          false,
        ]);
        // Y se entra desde el puente (criterio 8a): la cara del río lleva puerta.
        const cara = caraHacia(recinto.contorno, rio.x + 0.5, rio.y + 0.5);
        expect(recinto.puertas, donde).toContain(cara.cara);
        // El puente acaba al pie de esa cara, en el medio, y su otro estribo,
        // donde lo dejaba la pieza entera centrada en el río: acortado (H2 de
        // la vuelta 2), no corrido.
        const hacia = [Math.sign(orilla.x - rio.x), Math.sign(orilla.y - rio.y)] as const;
        const [cerca, lejos] = [...pu.extremos].sort(
          (p, q) =>
            Math.hypot(p[0] - cara.medio[0], p[1] - cara.medio[1]) -
            Math.hypot(q[0] - cara.medio[0], q[1] - cara.medio[1]),
        ) as [Punto, Punto];
        expect(Math.hypot(cerca[0] - cara.medio[0], cerca[1] - cara.medio[1]), donde).toBeLessThan(
          1e-9,
        );
        const largo = Math.hypot(lejos[0] - cerca[0], lejos[1] - cerca[1]) / pu.escala;
        expect(lejos[0], donde).toBeCloseTo(rio.x + 0.5 - (hacia[0] * largo) / 2, 9);
        expect(lejos[1], donde).toBeCloseTo(rio.y + 0.5 - (hacia[1] * largo) / 2, 9);
        expect(pu.escala, donde).toBeLessThan(1);
        expect(puentesSobreElAnillo([recinto.contorno], [pu]), donde).toEqual([]);
        expect(
          anilloSobreLaSenda(recinto, ejesDeLosPuentes([pu]), SEMIANCHO_DE_LA_HUELLA),
          donde,
        ).toEqual([]);
        // Con el río al sur, se pinta antes que la puerta y las torres de esa
        // cara: van delante del tablero, que entra por el arco.
        const tablero = e.sprites.find((t) => t.puente === pu.id);
        if (tablero === undefined) throw new Error(`${donde}: sin la pieza del puente`);
        if (hacia[1] < 0) {
          alSur++;
          const deLaCara = e.sprites.filter(
            (t) =>
              t.objeto?.id === o.id &&
              t.puente === undefined &&
              (t.recinto === 'puerta' || t.recinto === 'torre') &&
              Math.hypot(t.x - cara.medio[0], t.y - cara.medio[1]) < 1,
          );
          expect(deLaCara.length, donde).toBeGreaterThan(0);
          for (const t of deLaCara) expect(claveDe(tablero), donde).toBeLessThan(claveDe(t));
        }
        // La ciudad lleva su marca en su casilla, y quien está en el puente se
        // pinta en su tablero, como en el de un nodo.
        expect(esc.asientoDeObjeto.get(o.id), donde).toEqual([o.at.x + 0.5, o.at.y + 0.5]);
        const quien = pisada(esc, rio, PIES.heroe);
        expect([quien.x, quien.y], donde).toEqual(pu.asiento);
        // Pulsar el tablero sobre el río lleva a su casilla.
        expect(puenteEnElTerreno(e.puentes, map.terrain, W, ...pu.asiento)?.id, donde).toBe(pu.id);
      }
    }
    expect(alSur).toBeGreaterThanOrEqual(segunPrisa(1, 10));
  });

  it('en el cliente: pulsar una ciudad-puente lleva al héroe por sus puertas', () => {
    const s = new Session(37);
    s.revealAll = true;
    s.state.raiders.splice(0);
    const esc = escenarioDe(s.state.map, s.state.seed);
    const pu = esc.escena.puentes.find((p) => p.ciudad !== undefined);
    const ciudad = s.state.towns.find((t) => t.id === pu?.ciudad);
    if (ciudad === undefined) throw new Error('s37 no compone ninguna ciudad-puente');
    const escena = new EscenaAventura(() => s);
    const [ancho, alto] = [1600, 1000];
    escena.encuadrar(ancho, alto);
    const camara = centrarEn({ tile: TILE_INICIAL, x: 0, y: 0 }, focoDe(s), {
      ancho,
      alto,
      mapaAncho: s.state.map.width,
      mapaAlto: s.state.map.height,
      tileMinimo: topeDeAlejar(esc, ancho, alto),
    });
    const heroe = s.selectedHero;
    if (heroe === null) throw new Error('s37 sin héroe');
    // La ruta que va a andar entra por una puerta: el paso antes de la ciudad
    // es una puerta suya, y ninguno pisa su muralla.
    const ruta = pathFromReachable(
      s.state.map,
      alcanceDelHeroe(s.state, heroe),
      heroe.at,
      ciudad.at,
    );
    if (ruta === null) throw new Error(`s37: no se llega a ${ciudad.id}`);
    const puertas = puertasDeLaCiudad(s.state.map, ciudad.at).map((p) => p.casilla);
    const r = recintoDeLaCiudad(ciudad.at, s.state.map.width, s.state.map.height);
    for (const { at } of ruta) {
      const enElRecinto = at.x >= r.i0 && at.x <= r.i1 && at.y >= r.j0 && at.y <= r.j1;
      const esPuerta = puertas.some((p) => p.x === at.x && p.y === at.y);
      const esCiudad = at.x === ciudad.at.x && at.y === ciudad.at.y;
      expect(!enElRecinto || esPuerta || esCiudad, `(${at.x},${at.y})`).toBe(true);
    }
    expect(puertas).toContainEqual(ruta[ruta.length - 2]?.at);
    const p = mundoAPixel(camara, ciudad.at.x + 0.5, ciudad.at.y + 0.6);
    escena.mover(p.x, p.y);
    expect(s.status).not.toMatch(/No hay camino/);
    const antes = { ...heroe.at };
    escena.bajar(p.x, p.y);
    if (escena.soltar()) escena.pulsar(p.x, p.y, false);
    expect(s.status).not.toMatch(/No hay camino/);
    expect(s.selectedHero?.at).not.toEqual(antes);
  });

  // QA, H1/H2: en s7 y s30 la base de cada jugador iba en el río y su héroe
  // empezaba en la orilla donde se pintaba: pulsarlo lo metía en el castillo.
  it.each([7, 30])(
    's%i: ninguna base es ciudad-puente, y pulsar al propio héroe no lo mete en su castillo',
    (semilla) => {
      const s = new Session(semilla);
      for (const o of s.state.map.objects)
        if (o.kind === 'town' && o.owner !== null)
          expect(rioAnteLaCiudad(s.state.map, o.at), o.id).toBe(null);
      s.state.raiders.splice(0);
      // Nace dentro de su base (19-10-2026), y ahí pulsarlo es entrar: lo que se
      // vigila es que el de FUERA no se meta en ella. Se le saca al lado.
      fueraDeSuBase(s.state, 0);
      const esc = escenarioDe(s.state.map, s.state.seed);
      const escena = new EscenaAventura(() => s);
      const [ancho, alto] = [1600, 1000];
      escena.encuadrar(ancho, alto);
      const camara = centrarEn({ tile: TILE_INICIAL, x: 0, y: 0 }, focoDe(s), {
        ancho,
        alto,
        mapaAncho: s.state.map.width,
        mapaAlto: s.state.map.height,
        tileMinimo: topeDeAlejar(esc, ancho, alto),
      });
      const heroe = s.selectedHero;
      if (heroe === null) throw new Error(`s${semilla} sin héroe`);
      const antes = { ...heroe.at };
      const p = mundoAPixel(camara, antes.x + 0.5, antes.y + 0.5);
      escena.mover(p.x, p.y);
      escena.bajar(p.x, p.y);
      if (escena.soltar()) escena.pulsar(p.x, p.y, false);
      expect(s.selectedHero?.at).toEqual(antes);
      expect(s.status).toMatch(/ya está en esa casilla/);
    },
  );
});

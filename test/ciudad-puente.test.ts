/**
 * La ciudad-puente (#144, río continuo, paso 2): la ciudad del cruce que toca
 * el río va en una casilla del río (el núcleo la deja ahí, `intentarRed`), y la
 * escena la pinta en su orilla —el final de la frontera de la T— con un puente
 * de piedra en su casilla que cruza el río de frente hasta la tercera región.
 * Así el río sigue por debajo: no se corta en la ciudad.
 *
 * - `orillaDeLaCiudad` (núcleo): qué lado es su orilla.
 * - En los mapas del juego: su casilla es agua en la escena, su puente cruza de
 *   frente de enfrente al pie de la cara del río de su recinto, y no más allá
 *   (`puentesSobreElAnillo`, H2 de la vuelta 2), la ciudad se pinta en la orilla, su marca
 *   cuelga de ella, pulsar la orilla (si no se pisa) o el tablero lleva a la
 *   ciudad, y las sendas llegan a sus estribos por tierra: ni por el agua ni
 *   atravesando la barrera de la T.
 */
import { orillaDeLaCiudad, rioBajoLaCiudad } from '@core/map/rio.js';
import { isWalkable, type TerrainKind } from '@core/map/terrain.js';
import { describe, expect, it } from 'vitest';
import { EscenaAventura, focoDe } from '../src/client/escenas/aventura.js';
import { centrarEn, mundoAPixel, TILE_INICIAL } from '../src/client/render/camara-mapa.js';
import { analizar } from '../src/client/render/escenario/analizar.js';
import { sendaSobreElAgua } from '../src/client/render/escenario/escalon.js';
import { claveDe } from '../src/client/render/escenario/pintar.js';
import {
  ciudadEnLaOrilla,
  ejesDeLosPuentes,
  type Punto,
  puenteEnElTerreno,
} from '../src/client/render/escenario/puentes.js';
import {
  anilloSobreLaSenda,
  caraHacia,
  dentroDelContorno,
  puentesSobreElAnillo,
} from '../src/client/render/escenario/recinto.js';
import { SEMIANCHO_DE_LA_HUELLA } from '../src/client/render/escenario/sendas.js';
import { escenarioDe, pisada, topeDeAlejar } from '../src/client/render/escenario/superficie.js';
import { PIES } from '../src/client/render/mapa.js';
import { Session } from '../src/client/session.js';
import { partidaDe } from './helpers.js';
import { rango, segunPrisa } from './lento.js';

describe('la orilla de una ciudad-puente (`orillaDeLaCiudad`)', () => {
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
    expect(rioBajoLaCiudad(map, { x: 2, y: 2 })).toBe(true);
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

describe('la ciudad-puente en los mapas del juego', () => {
  // En el bucle rápido, s36 y s37 (cuatro ciudades-puente cada una, dos con el
  // río al sur, el caso de H2); en la lenta, 1-40 (48 ciudades-puente en 21
  // semillas desde el recinto de las ciudades del núcleo, vuelta 3).
  const semillas = segunPrisa([36, 37], rango(1, 40));

  it('su casilla es agua, su puente cruza de frente hasta el pie de su cara, y la ciudad y su marca van en la orilla', () => {
    let vistas = 0;
    let alSur = 0;
    for (const s of semillas) {
      const { map, escena: e } = partidaDe(s);
      const a = analizar(map);
      const esc = escenarioDe(map, s);
      const W = map.width;
      for (const o of map.objects) {
        if (o.kind !== 'town' || !rioBajoLaCiudad(map, o.at)) continue;
        vistas++;
        const donde = `s${s} ${o.id}`;
        const lados = a.ciudadesPuente.get(o.id);
        if (lados === undefined)
          throw new Error(`${donde}: la escena no la lleva por ciudad-puente`);
        const { orilla, enfrente } = lados;
        expect(a.terreno[o.at.y * W + o.at.x], donde).toBe('water');
        const pu = e.puentes.find((p) => p.id === o.id);
        if (pu === undefined) throw new Error(`${donde}: sin puente`);
        // De frente, de la orilla a enfrente, por el eje de su casilla.
        expect(pu.eje, donde).toBe(orilla.x === o.at.x ? 'ns' : 'eo');
        expect(pu.clase, donde).toBe('piedra');
        expect(pu.orilla, donde).toEqual([orilla.x + 0.5, orilla.y + 0.5]);
        expect(Math.abs(orilla.x - enfrente.x) + Math.abs(orilla.y - enfrente.y), donde).toBe(2);
        // La ciudad, su recinto, junto a la orilla: la contiene y no al puente.
        const recinto = e.recintos.find((k) => k.id === o.id);
        if (recinto === undefined) throw new Error(`${donde}: sin recinto`);
        const r = recinto.rect;
        const dentro = (p: { x: number; y: number }) =>
          p.x >= r.i0 && p.x <= r.i1 && p.y >= r.j0 && p.y <= r.j1;
        expect(dentro(orilla), donde).toBe(true);
        expect(dentro(o.at), donde).toBe(false);
        expect(dentro(enfrente), donde).toBe(false);
        // Y se entra desde el puente (criterio 8a): la cara del río lleva puerta,
        // con su arco en el eje del puente, y nada del anillo pisa el puente ni
        // lo que va de su estribo a la orilla.
        const rio = caraHacia(recinto.contorno, o.at.x + 0.5, o.at.y + 0.5);
        expect(recinto.puertas, donde).toContain(rio.cara);
        // El puente acaba al pie de esa cara, en el medio, y su otro estribo,
        // donde lo dejaba la pieza entera centrada en el río: acortado (H2 de
        // la vuelta 2), no corrido. Entero entraba casi una casilla en el recinto.
        const hacia = [Math.sign(orilla.x - o.at.x), Math.sign(orilla.y - o.at.y)] as const;
        const [cerca, lejos] = [...pu.extremos].sort(
          (p, q) =>
            Math.hypot(p[0] - rio.medio[0], p[1] - rio.medio[1]) -
            Math.hypot(q[0] - rio.medio[0], q[1] - rio.medio[1]),
        ) as [Punto, Punto];
        expect(Math.hypot(cerca[0] - rio.medio[0], cerca[1] - rio.medio[1]), donde).toBeLessThan(
          1e-9,
        );
        const largo = Math.hypot(lejos[0] - cerca[0], lejos[1] - cerca[1]) / pu.escala;
        expect(lejos[0], donde).toBeCloseTo(o.at.x + 0.5 - (hacia[0] * largo) / 2, 9);
        expect(lejos[1], donde).toBeCloseTo(o.at.y + 0.5 - (hacia[1] * largo) / 2, 9);
        expect(pu.escala, donde).toBeLessThan(1);
        expect(puentesSobreElAnillo([recinto.contorno], [pu]), donde).toEqual([]);
        // Y se pinta antes que las piezas de esa cara: con el río al sur, la
        // puerta y sus torres van delante del tablero, que entra por el arco.
        const tablero = e.sprites.find((t) => t.puente === o.id);
        if (tablero === undefined) throw new Error(`${donde}: sin la pieza del puente`);
        const deLaCara = e.sprites.filter(
          (t) =>
            t.objeto?.id === o.id &&
            t.puente === undefined &&
            (t.recinto === 'puerta' || t.recinto === 'torre') &&
            Math.hypot(t.x - rio.medio[0], t.y - rio.medio[1]) < 1,
        );
        if (hacia[1] < 0) {
          alSur++;
          expect(deLaCara.length, donde).toBeGreaterThan(0);
          for (const t of deLaCara) expect(claveDe(tablero), donde).toBeLessThan(claveDe(t));
        }
        if (pu.eje === 'ns')
          expect(Math.abs(rio.medio[0] - (o.at.x + 0.5)), donde).toBeLessThanOrEqual(0.06);
        else expect(Math.abs(rio.medio[1] - (o.at.y + 0.5)), donde).toBeLessThanOrEqual(0.06);
        expect(
          anilloSobreLaSenda(recinto, ejesDeLosPuentes([pu]), SEMIANCHO_DE_LA_HUELLA),
          donde,
        ).toEqual([]);
        expect(esc.asientoDeObjeto.get(o.id), donde).toEqual([orilla.x + 0.5, orilla.y + 0.5]);
        // Quien está dentro se pinta en la orilla, delante de la ciudad, como en
        // cualquier ciudad (QA, H5: en el puente, sobre los tejados de la de s13).
        const quien = pisada(esc, o.at, PIES.heroe);
        expect([quien.x, quien.y], donde).toEqual([orilla.x + 0.5, orilla.y + PIES.heroe]);
        expect(quien.clave, donde).toBeGreaterThanOrEqual(esc.claveDeObjeto.get(o.id) as number);
        // Pulsar el tablero sobre el río lleva a la ciudad (su `asiento`, el
        // punto alzado más cercano a su casilla: acortado, el medio del tablero
        // con el río al norte cae sobre la orilla de enfrente, y la tierra
        // manda); su orilla, se pise o no, también.
        expect(puenteEnElTerreno(e.puentes, map.terrain, W, ...pu.asiento)?.id, donde).toBe(o.id);
        for (const [dx, dy] of [
          [0.5, 0.5],
          [0.08, 0.92],
          [0.92, 0.08],
        ] as const)
          expect(ciudadEnLaOrilla(e.puentes, orilla.x + dx, orilla.y + dy)?.id, donde).toBe(o.id);
      }
    }
    expect(vistas).toBeGreaterThanOrEqual(segunPrisa(6, 40));
    expect(alSur).toBeGreaterThanOrEqual(segunPrisa(3, 15));
  });

  it('las sendas llegan a sus estribos por tierra, sin atravesar la barrera de la T, y ninguna se pinta sobre el agua', () => {
    for (const s of semillas) {
      const { map, escena: e } = partidaDe(s);
      const W = map.width;
      const sePisa = (x: number, y: number) =>
        isWalkable(map.terrain[Math.floor(y) * W + Math.floor(x)] as TerrainKind);
      for (const pu of e.puentes) {
        const { orilla } = pu;
        if (orilla === undefined) continue;
        // Las dos casillas de los estribos: la orilla y la de enfrente, que
        // puede ser el final de otra barrera (s37 (32,20), una montaña).
        const estribos = pu.extremos.map(([x, y]) => `${Math.floor(x)},${Math.floor(y)}`);
        // Y lo de dentro del recinto de la ciudad, que tapa su plaza: la senda va
        // del estribo a la puerta en cuerda (`sendasPorDentro`, la vuelta 2).
        const recinto = e.recintos.find((k) => k.id === pu.id);
        const enLaOrilla = (x: number, y: number) =>
          (Math.floor(x) === Math.floor(orilla[0]) && Math.floor(y) === Math.floor(orilla[1])) ||
          estribos.includes(`${Math.floor(x)},${Math.floor(y)}`) ||
          (recinto !== undefined && dentroDelContorno(recinto.contorno, x, y));
        for (const senda of e.sendas)
          for (const camino of [senda, [...senda].reverse()]) {
            const p = camino[0] as Punto;
            if (!pu.extremos.some((x) => Math.hypot(x[0] - p[0], x[1] - p[1]) < 1e-9)) continue;
            // La primera casilla de senda desde el estribo: la orilla y lo que se
            // pisa a su lado. Saltarse lo que «queda bajo el puente» la tiraba
            // recta por el bosque de la T (s13 (21-24, 7)).
            let largo = 0;
            for (const [k, r] of camino.entries()) {
              const q = camino[k - 1];
              if (q !== undefined) largo += Math.hypot(r[0] - q[0], r[1] - q[1]);
              if (largo > 1) break;
              expect(
                sePisa(r[0], r[1]) || enLaOrilla(r[0], r[1]),
                `s${s} ${pu.id}: (${r[0].toFixed(2)}, ${r[1].toFixed(2)})`,
              ).toBe(true);
            }
          }
      }
      expect(sendaSobreElAgua(e), `s${s}`).toBe(0);
      expect(e.informe.sendasDeEstriboEnAgua, `s${s}`).toBe(0);
    }
  });

  it('en el cliente: pulsar la ciudad en su orilla la señala y el héroe anda hacia ella', () => {
    // s36, la ciudad-puente de (24,7): se pinta en (24,6), en su recinto. Era s13
    // (25,5), que se pintaba en el final del bosque de la T, que no se pisa: sin
    // `ciudadEnLaOrilla`, el puntero señalaba el bosque.
    const s = new Session(36);
    s.revealAll = true;
    s.state.raiders.splice(0);
    const esc = escenarioDe(s.state.map, s.state.seed);
    const pu = esc.escena.puentes.find((p) => p.orilla !== undefined && p.nodo[0] === 24.5);
    if (pu?.orilla === undefined) throw new Error('s36 no compone la ciudad-puente de (24,7)');
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
    // A un lado de la orilla, lejos del tablero: ahí no lo coge el puente.
    const p = mundoAPixel(camara, pu.orilla[0] + 0.42, pu.orilla[1] + 0.3);
    escena.mover(p.x, p.y);
    expect(s.status).not.toMatch(/No hay camino/);
    const antes = { ...s.selectedHero!.at };
    escena.bajar(p.x, p.y);
    if (escena.soltar()) escena.pulsar(p.x, p.y, false);
    expect(s.status).not.toMatch(/No hay camino/);
    expect(s.selectedHero!.at).not.toEqual(antes);
  });

  // La orilla que se pisa: eran 14 de 121 en 1-100, todas bases con su casa a
  // los dos lados del río, y la decisión del usuario fue que pulsarla llevara a
  // la ciudad. Desde el QA (H2) ninguna base va en el río y en 1-300 no queda
  // ninguna; la regla sigue: `ciudadEnLaOrilla` no mira el terreno.
  it('la orilla, se pise o no, lleva a la ciudad: ciudadEnLaOrilla no mira el terreno', () => {
    const pu = { orilla: [12.5, 5.5] as Punto, nodo: [13.5, 5.5] as Punto, id: 'town-0' };
    expect(ciudadEnLaOrilla([pu], 12.3, 5.6)?.id).toBe('town-0');
    expect(ciudadEnLaOrilla([pu], 11.9, 5.6)).toBe(null);
  });

  // QA, H1/H2: en s7 y s30 la base de cada jugador iba en el río y su héroe
  // empezaba en la orilla donde se pintaba: pulsarlo lo metía en el castillo.
  it.each([7, 30])(
    's%i: ninguna base en el río, y pulsar al propio héroe no lo mete en su castillo',
    (semilla) => {
      const s = new Session(semilla);
      for (const o of s.state.map.objects)
        if (o.kind === 'town' && o.owner !== null)
          expect(rioBajoLaCiudad(s.state.map, o.at), o.id).toBe(false);
      s.state.raiders.splice(0);
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

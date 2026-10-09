/**
 * `queHayEn` (marcas de fallo): lo que una marca dice que hay en un punto del
 * escenario, leído del mismo `Escenario` que se pinta. Y los dos gestos de la
 * escena del mapa que usa el modo «marcar fallo»: el clic que no mueve a nadie
 * y la cámara que vuelve al sitio de una marca.
 */
import { describe, expect, it } from 'vitest';
import { EscenaAventura } from '../src/client/escenas/aventura.js';
import { cajaEnPixeles, mundoAPixel, pixelAMundo } from '../src/client/render/camara-mapa.js';
import { queHayEn } from '../src/client/render/escenario/inspeccion.js';
import { cajaDeSprite } from '../src/client/render/escenario/pasillo.js';
import { bandaDeCara } from '../src/client/render/escenario/relieve.js';
import { escenarioDe } from '../src/client/render/escenario/superficie.js';
import { Session } from '../src/client/session.js';
import { puenteSobreElAgua } from './helpers.js';

describe('queHayEn', () => {
  const s = new Session(1);
  const esc = escenarioDe(s.state.map, s.state.seed);

  it('en el centro de un módulo de una hoja lo devuelve con su caja, su hoja y su módulo', () => {
    const { W, H } = esc.escena;
    const sprite = esc.escena.sprites.find((x) => {
      if (x.clase !== 'masa' || x.src === null || !x.src.startsWith('modulos/')) return false;
      const [x0, y0, x1, y1] = cajaDeSprite(x);
      const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
      return cx >= 0 && cy >= 0 && cx < W && cy < H;
    });
    if (sprite === undefined)
      throw new Error('la semilla 1 no tiene ninguna masa con arte dentro del mapa');
    const caja = cajaDeSprite(sprite);
    const punto = { x: (caja[0] + caja[2]) / 2, y: (caja[1] + caja[3]) / 2 };
    const casilla = { x: Math.floor(punto.x), y: Math.floor(punto.y) };
    const hay = queHayEn(esc, punto, casilla);
    const suyo = hay.sprites.find((x) => x.src === sprite.src && x.ancla[0] === sprite.x);
    expect(suyo).toBeDefined();
    expect(suyo?.caja).toEqual(caja);
    expect(suyo?.cubrePunto).toBe(true);
    // La hoja y el módulo salen del catálogo por la `src`: `modulos/<hoja>/<nombre>.webp`.
    const [, hoja, nombre] = /^modulos\/([^/]+)\/([^/]+)\.webp$/.exec(sprite.src ?? '') ?? [];
    expect(suyo?.hoja).toBe(hoja);
    expect(suyo?.modulo).toBe(nombre);
    expect(suyo?.pieza).toBeNull();
    expect(hay.terreno).toBe(esc.terreno[casilla.y * esc.escena.W + casilla.x]);
    expect(hay.spritesDeLaEscena).toBe(esc.escena.sprites.length);
  });

  it('en una casilla bajo una cara de acantilado da la cara, con su banda, y la pared de su celda', () => {
    const cara = esc.escena.relieve.caras[0];
    if (cara === undefined) throw new Error('la semilla 1 no tiene caras');
    // Por celdas la cara va de junta a junta, en medias casillas (R4).
    const casilla = { x: Math.ceil(cara.x0), y: cara.y + 1 };
    const hay = queHayEn(esc, { x: casilla.x + 0.5, y: casilla.y + 0.1 }, casilla);
    const suya = hay.caras.find((c) => c.y === cara.y && c.x0 === cara.x0);
    expect(suya?.banda).toEqual(bandaDeCara(cara));
    expect(suya?.rampas).toBeUndefined();
    // La celda del vértice de la esquina de la casilla, con su tipo.
    expect(hay.celdas?.some((c) => c.tipo === 'S' && c.vy === cara.y + 1)).toBe(true);
  });

  it('donde arranca una bajada da la bajada (R5)', () => {
    for (let semilla = 1; semilla <= 10; semilla++) {
      const e = escenarioDe(new Session(semilla).state.map, semilla);
      const b = e.escena.relieve.bajadas[0];
      if (b === undefined) continue;
      const casilla = { x: Math.floor(b.arriba[0]), y: Math.floor(b.arriba[1]) };
      const hay = queHayEn(e, { x: b.arriba[0], y: b.arriba[1] }, casilla);
      expect(hay.bajadas?.map((x) => x.rumbo)).toContain(b.rumbo);
      return;
    }
    throw new Error('ninguna semilla de 1 a 10 tiene bajadas');
  });

  it('en el nodo de un puente da el puente', () => {
    // La primera semilla con un puente: el mapa no se elige a mano.
    for (let semilla = 1; semilla <= 30; semilla++) {
      const otra = new Session(semilla);
      const e = escenarioDe(otra.state.map, semilla);
      const puente = e.escena.puentes[0];
      if (puente === undefined) continue;
      const casilla = { x: Math.floor(puente.nodo[0]), y: Math.floor(puente.nodo[1]) };
      const hay = queHayEn(e, { x: puente.asiento[0], y: puente.asiento[1] }, casilla);
      expect(hay.puente?.id).toBe(puente.id);
      expect(hay.puente?.pieza).toBe(puente.pieza);
      return;
    }
    throw new Error('ninguna semilla de la 1 a la 30 tiene un puente');
  });

  it('un clic en el tablero de un puente marca la casilla de su nodo, como el puntero', () => {
    // Hacia el extremo del tablero, el puente se ve sobre el agua de otra
    // casilla (era s15, el puente de (16,1) sobre (16,0); se busca, que los
    // mapas cambian). La marca dice la casilla que señalaría el puntero, y su
    // `queHay` el mismo puente (`puenteEnElTerreno`, una sola cuenta).
    const { semilla, caso } = puenteSobreElAgua();
    const sesion = new Session(semilla);
    sesion.revealAll = true;
    const e = escenarioDe(sesion.state.map, sesion.state.seed);
    const escena = new EscenaAventura(() => sesion);
    escena.encuadrar(1600, 1000);
    const pu = e.escena.puentes.find((p) => p.id === caso.puente.id);
    if (pu === undefined)
      throw new Error(`s${semilla} no compone el puente que encontró la búsqueda`);
    const p = mundoAPixel(escena.camaraActual, ...caso.sobreElAgua);
    const { mundo, casilla } = escena.puntoBajo(p.x, p.y);
    expect(casilla).toEqual({ x: Math.floor(pu.nodo[0]), y: Math.floor(pu.nodo[1]) });
    expect(queHayEn(e, mundo, casilla).puente?.id).toBe(pu.id);
  });

  it('fuera del mapa lanza diciéndolo', () => {
    const { W, H } = esc.escena;
    for (const casilla of [
      { x: -1, y: 0 },
      { x: 0, y: H },
      { x: W, y: 3 },
    ])
      expect(() => queHayEn(esc, { x: casilla.x + 0.5, y: casilla.y + 0.5 }, casilla)).toThrow(
        /fuera del mapa/,
      );
  });
});

describe('la escena del mapa en el modo «marcar fallo»', () => {
  it('soltar solo dice si fue un clic: no mueve a nadie, y el clic lo reparte quien lo recibe', () => {
    // `main.ts` da el clic al modo «marcar fallo» o a `pulsar`: la escena no
    // sabe nada del modo, y soltar no puede andar por su cuenta.
    // Semilla 2: la casilla a dos al este del héroe se pisa (en la 3 era así
    // hasta las dos puertas de la mina, #230; en la 1, hasta las fronteras onduladas, #229; en la 12, hasta el mapa de 42×42,
    // #226; en la 10, hasta el acantilado en línea, #215; en la 5, hasta los
    // niveles del mapa, #143; en la 7, hasta #161).
    const s = new Session(2);
    const escena = new EscenaAventura(() => s);
    escena.encuadrar(1200, 800);
    const heroe = s.selectedHero;
    if (heroe === null) throw new Error('la semilla 2 no da héroe');
    const antes = { ...heroe.at };
    // Un arrastre no es un clic.
    escena.bajar(600, 400);
    escena.mover(640, 400);
    expect(escena.soltar()).toBe(false);
    // Una casilla a dos de distancia del héroe: pulsarla lo mueve.
    const { tile, x, y } = escena.camaraActual;
    const px = (antes.x + 2.5 - x) * tile;
    const py = (antes.y + 0.5 - y) * tile;
    escena.bajar(px, py);
    expect(escena.soltar()).toBe(true);
    expect(s.selectedHero?.at).toEqual(antes);
    // Y `pulsar` sí lo mueve: lo de arriba no pasa por no poder andar.
    escena.pulsar(px, py, false);
    expect(s.selectedHero?.at).not.toEqual(antes);
  });

  it('`mirarA` deja el punto en el centro del lienzo al zoom pedido, y no lo recentra en el héroe', () => {
    const s = new Session(3);
    const escena = new EscenaAventura(() => s);
    escena.encuadrar(1200, 800);
    escena.mirarA({ x: 17.25, y: 16.5 }, 82);
    escena.encuadrar(1200, 800);
    escena.encuadrar(1200, 800);
    const centro = pixelAMundo(escena.camaraActual, 600, 400);
    expect(escena.camaraActual.tile).toBe(82);
    expect(centro.x).toBeCloseTo(17.25, 9);
    expect(centro.y).toBeCloseTo(16.5, 9);
  });
});

describe('cajaEnPixeles: lo que cortan el juego y el taller', () => {
  it('redondea los dos bordes de la caja, y no deja un corte vacío', () => {
    // El juego: px CSS × densidad. El taller: casillas × tile, tras su margen.
    expect(cajaEnPixeles([10.2, 20.7, 110.2, 90.7], 1.5)).toEqual({
      sx: 15,
      sy: 31,
      sw: 150,
      sh: 105,
    });
    expect(cajaEnPixeles([1, 2, 3.5, 4], 100, 50)).toEqual({ sx: 150, sy: 250, sw: 250, sh: 200 });
    expect(cajaEnPixeles([3, 3, 3, 3], 2)).toEqual({ sx: 6, sy: 6, sw: 1, sh: 1 });
  });
});

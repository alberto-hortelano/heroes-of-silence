/**
 * Una figura al pie de un acantilado se ve entera (#185; auditoría 3 de 08-10,
 * §2.3).
 *
 * El mapa no levanta lo alto: la cara de una caída cuelga de su filo sobre la
 * casilla baja `caída × ALTO_DE_NIVEL` casillas, y la pieza que la pinta se
 * ordenaba por su pie, más abajo que los pies de quien estuviera debajo. En s36
 * el grupo mon-2 (7, 22), bajo una caída de 3, se quedaba en su chapa «5». Antes
 * del arreglo, 533 casillas pisables con la figura tapada en más de un cuarto en
 * las semillas 1, 2, 5, 9, 13, 24, 28, 34, 36 y 57 (84 en s36), y 2 281 en las
 * 1-40. Ahora la figura va delante de toda pieza que cuelga de su fila o de más
 * al norte (`delanteDeLasParedes`) y el informe lo recuenta (`pisablesTapadas`).
 */
import type { TerrainKind } from '@core/map/terrain.js';
import { describe, expect, it } from 'vitest';
import { perfilesDelCatalogo } from '../src/client/render/escenario/caras.js';
import type { Sprite } from '../src/client/render/escenario/colocar.js';
import {
  delanteDeLasParedes,
  FIGURA,
  pisablesTapadas,
} from '../src/client/render/escenario/figuras.js';
import { claveDeFigura, escenarioDe } from '../src/client/render/escenario/superficie.js';
import { PIES } from '../src/client/render/mapa.js';
import { catalogoDelDisco, partidaDe } from './helpers.js';
import { LENTO, rango } from './lento.js';

const sinPerfil = () => undefined;

/**
 * El marcador de una frontal que cuelga de la fila `filaAlta` con caída
 * `caida`, centrado en `x`: una caja cuadrada del filo menos el labio al pie.
 */
function frontal(x: number, filaAlta: number | undefined, fila: number, caida: number): Sprite {
  const pie = fila + 1 + caida * 0.6 + 0.05;
  return {
    src: null,
    nw: 1,
    nh: 1,
    ax: 0.5,
    ay: 1,
    x,
    y: pie,
    alto: caida * 0.6 + 0.5,
    clase: 'pared',
    color: '#4c463e',
    capa: 0,
    sombra: true,
    ...(filaAlta === undefined ? {} : { filaAlta }),
  };
}

const W = 5;
const H = 10;
const llano: TerrainKind[] = Array.from({ length: W * H }, () => 'grass');

describe('delanteDeLasParedes: quién va delante de una pieza del relieve', () => {
  it('la figura al pie de una caída de 3 va delante de la pieza que cuelga del norte', () => {
    const s = frontal(2.5, 4, 4, 3);
    const delante = delanteDeLasParedes([{ clave: s.y, s }], W, H, sinPerfil);
    // La pieza tapa la casilla (2, 5): sus pies, a 5,8, quedan por encima de su pie.
    expect(delante.get(5 * W + 2)).toBe(s.y);
  });

  it('la de su propia fila también: cae al sur desde sus pies', () => {
    const s = frontal(2.5, 5, 5, 1);
    const delante = delanteDeLasParedes([{ clave: s.y, s }], W, H, sinPerfil);
    expect(delante.get(5 * W + 2)).toBe(s.y);
  });

  it('no la de una casilla alta más al sur, ni un peñasco sin `filaAlta`: esos tapan', () => {
    const delSur = frontal(2.5, 6, 4, 3);
    const suelto = frontal(2.5, undefined, 4, 3);
    const delante = delanteDeLasParedes(
      [delSur, suelto].map((s) => ({ clave: s.y, s })),
      W,
      H,
      sinPerfil,
    );
    expect(delante.get(5 * W + 2)).toBeUndefined();
  });

  it('ni sube donde la pieza no toca la figura', () => {
    const s = frontal(2.5, 4, 4, 3);
    const delante = delanteDeLasParedes([{ clave: s.y, s }], W, H, sinPerfil);
    // La caja mide 2,3 de ancho alrededor de 2,5: no llega a la columna 0.
    expect(delante.get(5 * W + 0)).toBeUndefined();
  });
});

describe('pisablesTapadas: el informe cuenta la figura tapada (muerde)', () => {
  it('sin subir la clave, la casilla al pie cuenta; subiéndola, no', () => {
    const s = frontal(2.5, 4, 4, 3);
    const catalogo = perfilesDelCatalogo(catalogoDelDisco());
    expect(pisablesTapadas([s], llano, W, H, catalogo, false)).toContain(5 * W + 2);
    expect(pisablesTapadas([s], llano, W, H, catalogo)).toEqual([]);
  });

  it('una casilla que no se pisa no cuenta', () => {
    const s = frontal(2.5, 4, 4, 3);
    const agua = llano.map((t, i) => (i === 5 * W + 2 ? 'water' : t));
    const catalogo = perfilesDelCatalogo(catalogoDelDisco());
    expect(pisablesTapadas([s], agua, W, H, catalogo, false)).not.toContain(5 * W + 2);
  });

  it('la figura con que mide es la del héroe, la de pies más altos de `PIES`', () => {
    expect(FIGURA.pies).toBe(Math.min(...Object.values(PIES)));
  });
});

/** En la orden lenta, 1-40 y la 57; en `pnpm verify`, la 36 (la de la auditoría) y la 28. */
const SEMILLAS = LENTO ? [...rango(1, 40), 57] : [36, 28];

describe('en los mapas reales', () => {
  const perfilDe = perfilesDelCatalogo(catalogoDelDisco());

  for (const semilla of SEMILLAS)
    it(`semilla ${semilla}: ninguna figura que se pisa tapada por el relieve, por fuera y por el informe`, () => {
      const { map, escena: e } = partidaDe(semilla);
      expect(e.informe.pisablesTapadas).toBe(0);
      expect(pisablesTapadas(e.sprites, map.terrain, e.W, e.H, perfilDe)).toEqual([]);
    });

  // La auditoría vio el fallo en el grupo mon-2 de (7, 22). Qué casilla queda
  // bajo una cara depende de qué módulo de pared sale en cada sitio, y eso
  // cambia con cualquier cosa que gaste azar antes (la senda ancha de #191 movió
  // las paredes de esa ladera y dejó (7, 22) fuera): se mira cada casilla que
  // se taparía sin subir la clave, no una.
  // La auditoría era s36 (84 tapadas); con los niveles del mapa (#143) se le
  // quedan 21, y la que más tenía de 1-60 era la 32 (89); con menos mesetas
  // (#210), la 8 (57).
  it('s8: sin subir la clave, vuelven las tapadas de la auditoría, también donde hay un objeto', () => {
    const { map, escena: e } = partidaDe(8);
    const antes = pisablesTapadas(e.sprites, map.terrain, e.W, e.H, perfilDe, false);
    expect(antes.length).toBeGreaterThan(50);
    const objetos = new Set(map.objects.map((o) => o.at.y * e.W + o.at.x));
    expect(antes.some((i) => objetos.has(i))).toBe(true);
  });

  it('s8: cada figura que se taparía sin subir la clave se pinta después de toda pieza que la tapa con su silueta', () => {
    const { map, escena: e } = partidaDe(8);
    const antes = new Set(pisablesTapadas(e.sprites, map.terrain, e.W, e.H, perfilDe, false));
    const esc = escenarioDe(map, 8);
    let vistas = 0;
    for (const v of esc.separada.volumenes) {
      if (v.s.clase !== 'pared' || v.s.filaAlta === undefined) continue;
      // Las casillas que esta pieza tapa con su silueta: la regla de `delanteDeLasParedes`.
      for (const i of delanteDeLasParedes([v], e.W, e.H, perfilDe).keys()) {
        if (!antes.has(i)) continue;
        const [x, y] = [i % e.W, Math.floor(i / e.W)];
        const clave = claveDeFigura(esc, x, y + FIGURA.pies);
        expect(v.clave, `(${x}, ${y}): ${v.s.src ?? 'marcador'}`).toBeLessThanOrEqual(clave);
        vistas++;
      }
    }
    // Que mire algo: cada casilla de `antes` la tapa al menos una pieza.
    expect(vistas).toBeGreaterThanOrEqual(antes.size);
  });
});

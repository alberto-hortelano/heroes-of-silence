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
import { type Sprite, tapaElPunto } from '../src/client/render/escenario/colocar.js';
import {
  cajaDeFigura,
  delanteDeLasParedes,
  FIGURA,
  pisablesTapadas,
} from '../src/client/render/escenario/figuras.js';
import { cajaDeSprite } from '../src/client/render/escenario/pasillo.js';
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

  it('s36: sin subir la clave, vuelven las tapadas de la auditoría, (4, 22) entre ellas', () => {
    const { map, escena: e } = partidaDe(36);
    const antes = pisablesTapadas(e.sprites, map.terrain, e.W, e.H, perfilDe, false);
    expect(antes).toContain(22 * e.W + 4);
    expect(antes.length).toBeGreaterThan(50);
  });

  it('s36: el grupo mon-2 en (4, 22) se pinta después de toda pieza que cuelga sobre él', () => {
    // En (7, 22) hasta #188, que movió los objetos al guardar la puerta de las minas.
    const { map } = partidaDe(36);
    const mon = map.objects.find((o) => o.kind === 'monster' && o.at.x === 4 && o.at.y === 22);
    expect(mon, 'la auditoría lo vio en (7, 22), y #188 lo llevó a (4, 22)').toBeDefined();
    const esc = escenarioDe(map, 36);
    const clave = claveDeFigura(esc, 4, 22 + PIES.grupo);
    const [fx0, fy0, fx1, fy1] = cajaDeFigura(4, 22);
    // Las que tapan algo de la figura, no las que solo rozan su caja: con el
    // grupo en (7, 22) y la rampa de (8,19) al suroeste (#192), una frontal de
    // (6,20) llegaba a 0,002 de la caja con el borde transparente y no tapaba
    // ni un punto de ella.
    const tapaAlgo = (s: Sprite) =>
      Array.from({ length: 7 }, (_, i) => fx0 + ((i + 0.5) / 7) * (fx1 - fx0)).some((x) =>
        Array.from({ length: 10 }, (_, j) => fy0 + ((j + 0.5) / 10) * (fy1 - fy0)).some((y) =>
          tapaElPunto(s, perfilDe, x, y),
        ),
      );
    const encima = esc.separada.volumenes.filter(({ s }) => {
      if (s.clase !== 'pared' || s.filaAlta === undefined || s.filaAlta > 22) return false;
      const [x0, y0, x1, y1] = cajaDeSprite(s);
      return x0 < fx1 && x1 > fx0 && y0 < fy1 && y1 > fy0 && tapaAlgo(s);
    });
    // Las hay —la cara de la caída de encima— y ninguna se pinta después.
    expect(encima.length).toBeGreaterThan(0);
    for (const v of encima) expect(v.clave, v.s.src ?? 'marcador').toBeLessThanOrEqual(clave);
    expect(clave).toBeGreaterThan(22 + PIES.grupo);
  });
});

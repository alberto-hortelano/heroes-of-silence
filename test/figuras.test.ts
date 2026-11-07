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
import { barreraEn } from '@core/map/map.js';
import { isWalkable, type TerrainKind } from '@core/map/terrain.js';
import type { MejoraDelPuesto } from '@core/map/tipos.js';
import { describe, expect, it } from 'vitest';
import { altoDeLaSilueta, perfilesDelCatalogo } from '../src/client/render/escenario/caras.js';
import type { Sprite } from '../src/client/render/escenario/colocar.js';
import {
  cajaDeFigura,
  delanteDeLasParedes,
  delanteEnUnaBarrera,
  FIGURA,
  pisablesTapadas,
} from '../src/client/render/escenario/figuras.js';
import { cajaDeSprite } from '../src/client/render/escenario/pasillo.js';
import {
  type DeNodo,
  type NodoQueSeSabe,
  seVeConSuNodo,
} from '../src/client/render/escenario/puestos.js';
import { claveDeFigura, escenarioDe, pisada } from '../src/client/render/escenario/superficie.js';
import { PIES } from '../src/client/render/mapa.js';
import { catalogoDelDisco, partidaDe } from './escena-de-prueba.js';
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
  // (#210), la 8 (57); con los vestidos que se repiten por una silla (#224),
  // la 30 (54; la 8 se queda en 35); con el mapa de 42×42 (#226), la 21 (60;
  // la 30 se queda en 34); con las fronteras onduladas (#229, 09-10-2026), la
  // 5 (67; la 21 se queda en 17); con los ríos (#144, 16-10-2026), la 17 (65;
  // la 5 se queda en 17); con el río de lago de 20 casillas (17-10-2026),
  // la 39 (64; la 17 se queda sin mesetas).
  it('s39: sin subir la clave, vuelven las tapadas de la auditoría, también donde hay un objeto', () => {
    const { map, escena: e } = partidaDe(39);
    const antes = pisablesTapadas(e.sprites, map.terrain, e.W, e.H, perfilDe, false);
    expect(antes.length).toBeGreaterThan(50);
    const objetos = new Set(map.objects.map((o) => o.at.y * e.W + o.at.x));
    expect(antes.some((i) => objetos.has(i))).toBe(true);
  });

  it('s39: cada figura que se taparía sin subir la clave se pinta después de toda pieza que la tapa con su silueta', () => {
    // Era s8, que con las fronteras onduladas (#229) no tiene ninguna: el
    // test pasaba sin mirar nada, y ahora lo dice. La s5 tenía 67; con los
    // ríos (#144), la s17 tiene 65; con el río de lago de 20 casillas, la s39, 64.
    const { map, escena: e } = partidaDe(39);
    const antes = new Set(pisablesTapadas(e.sprites, map.terrain, e.W, e.H, perfilDe, false));
    expect(antes.size).toBeGreaterThan(0);
    const esc = escenarioDe(map, 39);
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

describe('delanteEnUnaBarrera: quien se infiltra se ve parado en una barrera (05-11-2026)', () => {
  /** Todo montaña salvo la fila 6, de hierba: la figura está en (2, 4). */
  const monte: TerrainKind[] = Array.from({ length: 10 * 10 }, (_, i) =>
    Math.floor(i / 10) === 6 ? 'grass' : 'mountain',
  );
  /** Una pieza de marcador de la clase `clase` con el pie en `pie`, centrada en `x`, de `alto` casillas. */
  const masaFrontal = (
    x: number,
    pie: number,
    alto: number,
    clase: Sprite['clase'] = 'masa',
  ): Sprite => ({
    ...frontal(x, undefined, 0, 1),
    y: pie,
    alto,
    clase,
  });
  /** Una torre del recinto de una ciudad: algo hecho. */
  const torre = (pie: number): Sprite => ({
    ...masaFrontal(2.5, pie, 2, 'objeto'),
    recinto: 'torre',
  });
  /** La clave de la figura con estas piezas, cada una con la de su pie o la que se le dé. */
  const clave = (
    sprites: readonly (Sprite | { readonly s: Sprite; readonly clave: number })[],
    terreno = monte,
    seVe: (d: DeNodo) => boolean = () => true,
  ): number =>
    delanteEnUnaBarrera(
      sprites.map((p) => ('s' in p ? p : { clave: p.y, s: p })),
      terreno,
      10,
      sinPerfil,
      2,
      4,
      seVe,
    );

  it('va delante de la masa de su casilla y de la de delante: la montaña y el bosque no lo esconden', () => {
    const suya = masaFrontal(2.5, 4.9, 2);
    const deDelante = masaFrontal(2.5, 5.3, 2);
    expect(clave([suya])).toBe(4.9);
    expect(clave([suya, deDelante])).toBe(5.3);
  });

  it('lo hecho de una fila más al sur (el recinto de una ciudad) lo sigue tapando: H1 de la vuelta 1 de QA', () => {
    expect(clave([torre(5.3)])).toBe(Number.NEGATIVE_INFINITY);
    // Lo hecho con el pie en sus pies o más al norte está detrás de él: sí sube
    // si se pinta después (ordenado por detrás de otra pieza, `ordenadoEn`).
    expect(clave([{ s: torre(4.7), clave: 5.3 }])).toBe(5.3);
  });

  it('lo hecho de su misma fila con el pie al sur de sus pies también lo tapa: N1 de la vuelta 2 de QA', () => {
    // Los pies en 4,8; la torre, en su fila (4) pero con el pie en 4,95. Con la
    // fila del pie (`Math.floor`) subía por encima de ella.
    expect(clave([torre(4.95)])).toBe(Number.NEGATIVE_INFINITY);
    expect(clave([torre(4.95), masaFrontal(2.5, 4.9, 2)])).toBe(4.9);
    // La masa de su fila con el pie al sur de sus pies sigue subiéndolo.
    expect(clave([masaFrontal(2.5, 4.95, 2)])).toBe(4.95);
  });

  it('de las piezas de un nodo cuenta solo la que se pinta: N2 de la vuelta 2 de QA', () => {
    // La empalizada de un paso de delante: si no se pinta (el paso es neutral),
    // ni lo para ni lo sube, y la masa de delante lo sube; si se pinta, lo para.
    const empalizada: Sprite = {
      ...masaFrontal(2.5, 5.3, 2, 'objeto'),
      deNodo: { id: 'node-1', cuando: 'empalizada' },
    };
    const masa = masaFrontal(2.5, 5.5, 2);
    expect(clave([empalizada, masa], monte, () => false)).toBe(5.5);
    expect(clave([empalizada, masa], monte, () => true)).toBe(Number.NEGATIVE_INFINITY);
    // Y la que está detrás, solo si se pinta.
    const detras: Sprite = { ...empalizada, y: 4.7 };
    expect(clave([{ s: detras, clave: 5.3 }], monte, () => false)).toBe(Number.NEGATIVE_INFINITY);
    expect(clave([{ s: detras, clave: 5.3 }], monte, () => true)).toBe(5.3);
  });

  it('de la masa de delante, no sube por la que se pintaría después de lo hecho que lo tapa', () => {
    expect(clave([torre(5.3), masaFrontal(2.5, 5.5, 2)])).toBe(Number.NEGATIVE_INFINITY);
    expect(clave([torre(5.3), masaFrontal(2.5, 5.3, 2)])).toBe(Number.NEGATIVE_INFINITY);
    expect(clave([torre(5.3), masaFrontal(2.5, 5.2, 2)])).toBe(5.2);
  });

  it('la cubierta de lo que se pisa (una casa de la labranza) no lo sube; la de una barrera, sí', () => {
    expect(clave([masaFrontal(2.5, 6.3, 2.5, 'cubierta')])).toBe(Number.NEGATIVE_INFINITY);
    expect(clave([masaFrontal(2.5, 5.3, 2, 'cubierta')])).toBe(5.3);
    // Un pico con el pie en lo que se pisa sigue siendo la masa de su cordillera.
    expect(clave([masaFrontal(2.5, 6.3, 2.5)])).toBe(6.3);
  });

  it('no sube por lo que se pinta antes ni por lo que no le toca la figura', () => {
    expect(clave([masaFrontal(2.5, 4.1, 2), masaFrontal(0.2, 5.3, 2)])).toBe(
      Number.NEGATIVE_INFINITY,
    );
  });

  /** Sin saber nada de ningún nodo: se pinta su hito, ninguna obra (`seVeConSuNodo`). */
  const sinSaber: ReadonlyMap<string, NodoQueSeSabe> = new Map();
  /** Si una pieza se pinta con lo que se sabe de los nodos. */
  const sePinta =
    (nodos: ReadonlyMap<string, NodoQueSeSabe>) =>
    (s: Sprite): boolean =>
      s.deNodo === undefined || seVeConSuNodo(s.deNodo, nodos.get(s.deNodo.id));
  /** Algo hecho, como lo cuenta `delanteEnUnaBarrera`: un objeto, un recinto, un puente. */
  const esHecho = (s: Sprite): boolean =>
    s.clase === 'objeto' ||
    s.objeto !== undefined ||
    s.recinto !== undefined ||
    s.puente !== undefined;

  /**
   * Qué parte de la figura de `(x, y)` (las muestras de su caja, 7 × 10) queda
   * bajo la silueta de alguna pieza de `esc` que pasa `filtro` y se pinta
   * `despues` de ella (con la clave `c`), o antes (la figura va encima). Mide lo
   * que se ve, no la regla. `filas`, las filas de muestras que se miran (la 0
   * es la cabeza).
   */
  function cuanto(
    esc: ReturnType<typeof escenarioDe>,
    x: number,
    y: number,
    c: number,
    filtro: (s: Sprite) => boolean,
    despues: boolean,
    filas = 10,
  ): number {
    const [fx0, fy0, fx1, fy1] = cajaDeFigura(x, y);
    const piezas = esc.separada.volumenes.filter(
      (v) => (despues ? v.clave > c : v.clave <= c) && filtro(v.s),
    );
    let bajo = 0;
    for (let i = 0; i < 7; i++)
      for (let j = 0; j < filas; j++) {
        const px = fx0 + ((i + 0.5) / 7) * (fx1 - fx0);
        const py = fy0 + ((j + 0.5) / 10) * (fy1 - fy0);
        const tapada = piezas.some((v) => {
          const caja = cajaDeSprite(v.s);
          if (px < caja[0] || px > caja[2] || py < caja[1] || py > caja[3]) return false;
          const alto = altoDeLaSilueta(v.s, esc.perfilDe(v.s), px, caja);
          return alto !== undefined && py >= alto;
        });
        if (tapada) bajo++;
      }
    return bajo / (7 * filas);
  }
  /** Cuánto de la figura tapan las piezas que pasan `filtro` y se pintan después de ella. */
  const cuantoLaTapan = (
    esc: ReturnType<typeof escenarioDe>,
    x: number,
    y: number,
    c: number,
    filtro: (s: Sprite) => boolean,
  ): number => cuanto(esc, x, y, c, filtro, true);
  /**
   * Cuánto de la figura de `(x, y)` se pinta encima de algo hecho con el pie al
   * sur de sus pies, de lo que se pinta (`nodos`): lo que está delante y no debe
   * taparse (N1 de la vuelta 2 de QA).
   */
  const encimaDeLoHecho = (
    esc: ReturnType<typeof escenarioDe>,
    x: number,
    y: number,
    c: number,
    nodos: ReadonlyMap<string, NodoQueSeSabe> = sinSaber,
  ): number =>
    cuanto(esc, x, y, c, (s) => sePinta(nodos)(s) && esHecho(s) && s.y > y + PIES.heroe, false);

  it('s8, la de QA: en la montaña al norte de Valdeluz, detrás de su recinto; en el bosque de (5,6), a la vista', () => {
    // Las casillas de QA eran (6,5) y (7,5), con Valdeluz en (7,7), y el bosque de
    // (4,7). Con las ciudades en su región (tarea 2, 05-11-2026) Valdeluz está en
    // (11,8): su montaña del norte es (10,6) y (11,6), con las mismas cifras.
    const { map } = partidaDe(8);
    const esc = escenarioDe(map, 8);
    const { W } = esc.escena;
    const esMasa = (s: Sprite) => s.recinto === undefined && s.objeto === undefined;
    for (const [x, y] of [
      [10, 6],
      [11, 6],
      [5, 6],
    ] as const) {
      expect(isWalkable(map.terrain[y * W + x] as TerrainKind), `(${x}, ${y})`).toBe(false);
      const c = pisada(esc, { x, y }, PIES.heroe, sinSaber).clave;
      // Ni la montaña ni el bosque lo tapan.
      expect(cuantoLaTapan(esc, x, y, c, esMasa), `(${x}, ${y})`).toBe(0);
    }
    for (const x of [10, 11]) {
      const c = pisada(esc, { x, y: 6 }, PIES.heroe, sinSaber).clave;
      // Y el recinto de delante sí: ninguna parte de la figura se pinta encima de
      // sus torres o sus casas (N1 de la vuelta 2 de QA: en (6,5) de entonces, el
      // 43 %, con los pies y el aro sobre la torre del noroeste; en (7,5), el 30 %).
      expect(encimaDeLoHecho(esc, x, 6, c), `(${x}, 6)`).toBe(0);
      expect(
        cuantoLaTapan(esc, x, 6, c, (s) => s.recinto !== undefined),
        `(${x}, 6)`,
      ).toBeGreaterThan(0);
      // Sin esconderlo: lo que tapa el recinto son las piernas (el 43 % de la
      // figura en (10,6), el 30 % en (11,6)); la cabeza y el torso (las cuatro
      // filas de muestras de arriba) se ven enteros, y se admite un cuarto.
      expect(
        cuanto(esc, x, 6, c, () => true, true, 4),
        `(${x}, 6)`,
      ).toBeLessThanOrEqual(0.25);
    }
  });

  it('una obra del puesto que no se pinta no lo deja tapado por la masa: N2 de la vuelta 2 de QA', () => {
    // s10 (3,10), la montaña al norte de node-1 (3,12), de los cuatro casos de QA
    // (s24 (15,8), s36 (8,22), s39 (23,9), s10 (3,10)): con la empalizada y la
    // torre del paso neutral contando como tope, la masa de delante la tapaba. Con
    // las ciudades en su región (tarea 2, 05-11-2026) el de s24, que era el de
    // este test, ya no tiene la obra delante.
    const { map } = partidaDe(10);
    const esc = escenarioDe(map, 10);
    const [x, y] = [3, 10];
    expect(isWalkable(map.terrain[y * esc.escena.W + x] as TerrainKind)).toBe(false);
    const nodosEn = (mejora: MejoraDelPuesto | null): ReadonlyMap<string, NodoQueSeSabe> =>
      new Map(
        map.objects
          .filter((o) => o.kind === 'node')
          .map((o) => [o.id, { owner: mejora === null ? null : 0, mejora: mejora ?? 'ninguna' }]),
      );
    // El paso en cada estado, sobre el mismo escenario: lo guardado por casilla
    // no se queda con lo que se sabía la primera vez.
    const claves = new Map<string, number>();
    for (const mejora of [null, 'ninguna', 'empalizada', 'muralla', null] as const) {
      const nodos = nodosEn(mejora);
      const nombre = mejora ?? 'neutral';
      const c = pisada(esc, { x, y }, PIES.heroe, nodos).clave;
      if (claves.has(nombre)) expect(c, nombre).toBe(claves.get(nombre));
      claves.set(nombre, c);
      const masa = (s: Sprite) => sePinta(nodos)(s) && !esHecho(s);
      // Sin la obra de delante a la vista, la masa no lo tapa; con ella, la obra
      // está delante y lo de después de ella también (H1 de la vuelta 1).
      if (mejora === null || mejora === 'ninguna')
        expect(cuantoLaTapan(esc, x, y, c, masa), nombre).toBeLessThan(0.5);
      else expect(c, nombre).toBeLessThan(claves.get('neutral') as number);
      expect(encimaDeLoHecho(esc, x, y, c, nodos), nombre).toBe(0);
    }
  });

  it('en un mapa de verdad: fuera de una barrera (también en la puerta de un recinto), nada cambia', () => {
    // La regla es la del núcleo, `barreraEn`: la puerta de un recinto con montaña
    // debajo (s8 (11,7), la del norte de Valdeluz; era (6,6), la del noroeste,
    // antes de las ciudades en su región) no es barrera, y en ella la
    // clave es la de siempre (N3 de la vuelta 3 de QA: bajaba de 2,4 a 3 casillas
    // en 177 puertas de s1-40 y el héroe quedaba escondido tras la torre).
    for (const semilla of [8, 39]) {
      const { map } = partidaDe(semilla);
      const esc = escenarioDe(map, semilla);
      const { W, H } = esc.escena;
      let fuera = 0;
      let puertas = 0;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (barreraEn(map, { x, y }) !== null || esc.tableros.has(y * W + x)) continue;
          expect(
            pisada(esc, { x, y }, PIES.heroe, new Map()).clave,
            `s${semilla} (${x}, ${y})`,
          ).toBe(claveDeFigura(esc, x, y + PIES.heroe));
          fuera++;
          if (!isWalkable(map.terrain[y * W + x] as TerrainKind)) puertas++;
        }
      expect(fuera).toBeGreaterThan(100);
      if (semilla === 8) {
        expect(isWalkable(map.terrain[7 * W + 11] as TerrainKind)).toBe(false);
        expect(barreraEn(map, { x: 11, y: 7 })).toBeNull();
        expect(puertas).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * Que se vea por dónde se pasa y por dónde no (14-10-2026). Dos marcas de la
 * semilla 1 casi iguales: el pasillo de hierba de (2,23), «por aquí se puede
 * caminar», y el bosque de (1,23), «por aquí no». En las dos había árboles de
 * punta a punta: la cubierta de lo que se pisa sembraba pinos y frondosos de la
 * hoja y el alto de la masa a radio √5 de todo bosque (`lindeDeBosque`), la copa
 * de la masa desbordaba de lado sobre lo que se pisa y bajo el bosque se pintaba
 * la misma hierba que fuera.
 *
 * Ahora, «árbol = no se pasa», la copa de la masa no entra por los lados más de
 * `MARGEN_SOBRE_LO_PISABLE` en lo que se pisa de la fila de su pie
 * (`altoPorLosLados`, la regla de la puerta y del contador `sobreLoPisable`)
 * y bajo el bosque va el sotobosque (`sotobosqueDe`).
 *
 * Vuelta de QA 1 (14-10-2026): los módulos de la cubierta que son árboles
 * tampoco (`ARBOLES_DE_LA_CUBIERTA`, los abetos en miniatura de la nieve); la
 * copa no tapa más de `TAPADO_DEL_PASILLO` de un pasillo estrecho de su norte
 * (`altoSobreLosPasillos`); y toda casilla de bosque lleva un árbol, también la
 * de junto a una ciudad (`bosqueSinArbol`).
 *
 * Vuelta de QA 2 (16-10-2026): la casilla de abajo de un pasillo de dos de
 * hondo también es estrecha (`pasillosEstrechos`, H10), y en la nieve que se
 * pisa no van los peñascos grises de su cubierta (`FUERA_DE_LO_QUE_SE_PISA`,
 * H9): al tope de alejar se leía como la sierra.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TerrainKind } from '@core/map/terrain.js';
import { describe, expect, it } from 'vitest';
import { analizar, type MapaDeEscena } from '../src/client/render/escenario/analizar.js';
import {
  APARTE,
  ARBOLES,
  ARBOLES_DE_LA_CUBIERTA,
  altoPorLosLados,
  altoSobreLosPasillos,
  bosqueSinArbol,
  componer,
  type Escena,
  esArbol,
  FUERA_DE_LO_QUE_SE_PISA,
  MARGEN_SOBRE_LO_PISABLE,
  pasillosEstrechos,
  type Sprite,
  sobreLoPisable,
  TAPADO_DEL_PASILLO,
} from '../src/client/render/escenario/colocar.js';
import { nivelPintado, SOTOBOSQUE, sotobosqueDe } from '../src/client/render/escenario/escalon.js';
import { cajaDeSprite } from '../src/client/render/escenario/pasillo.js';
import { trozosConAlfa } from '../src/client/render/escenario/pintar.js';
import { enElRecinto } from '../src/client/render/escenario/recinto.js';
import { catalogoDelDisco, partidaDe } from './helpers.js';
import { LENTO, rango } from './lento.js';

/**
 * Lo que una caja puede pasar del margen de una casilla sin entrar en ella: el
 * redondeo. La puerta encoge la masa hasta que su caja llega justo al margen
 * (`altoHastaLaColumna`), y al volver a medirla el borde sale a 1e-15 de él. Sin
 * esto, el recuento a mano daba por tapado el pasillo de s30 (0,11) con un abeto
 * de pie en x = −0,11 cuya caja llega a 0,2000…004 con margen 0,2, y el informe
 * (`pasillosTapados`), que cuenta con 1e-6, no: tenía razón el informe. No es
 * cosa del borde: con el paso 2b de los ríos salen 5 cajas así en s1, s3 (dos),
 * s5 y s36, ninguna a más de 1e-14 del margen (16-10-2026).
 */
const TOQUE = 1e-9;

/** Una pieza de la hoja `hoja` de `nw`×`nh`, con el ancla abajo en medio y el pie en `(x, y)`. */
function pieza(
  hoja: string,
  clase: Sprite['clase'],
  x: number,
  y: number,
  alto: number,
  nw = 100,
  nh = 100,
): Sprite {
  return {
    src: `modulos/${hoja}/1.webp`,
    nw,
    nh,
    ax: nw / 2,
    ay: nh,
    x,
    y,
    alto,
    clase,
    color: '#000',
    capa: 0,
    sombra: true,
  };
}

/** Lo que vale la máscara `m` en el centro de la casilla `(x, y)`. */
function enElCentro(m: ReturnType<typeof sotobosqueDe>, x: number, y: number): number {
  const p = Math.floor((y + 0.5) * m.R) * m.ancho + Math.floor((x + 0.5) * m.R);
  return m.alfa[p] as number;
}

/** Lo que de la caja de `s`, en la fila de su pie, entra en la casilla de la columna `c`. */
function entraEn(s: Sprite, c: number): number {
  const [x0, , x1] = cajaDeSprite(s);
  return Math.max(0, Math.min(x1, c + 1) - Math.max(x0, c));
}

/**
 * Lo que la caja de `s` pisa, en la fila de su pie, de lo que no se tapa de
 * alguna casilla que se pisa (de `c + M` a `c + 1 − M`): recontado a mano, sin
 * la regla de `colocar.ts`.
 */
function pisaDeLoPisable(s: Sprite, franjaDe: ArrayLike<number>, W: number): number {
  const fila = Math.floor(s.y);
  const M = MARGEN_SOBRE_LO_PISABLE;
  const [x0, , x1] = cajaDeSprite(s);
  let mas = 0;
  for (let c = 0; c < W; c++)
    if (franjaDe[fila * W + c] === -1)
      mas = Math.max(mas, Math.min(x1, c + 1 - M) - Math.max(x0, c + M));
  return mas;
}

describe('los guardias muerden', () => {
  // Dos filas de cinco: la de arriba, bosque entero; la de abajo, un pasillo de
  // hierba de una casilla en la columna 2 entre dos bosques.
  const W = 5;
  const franjaDe = Int32Array.from([0, 0, 0, 0, 0, 0, 0, -1, 1, 1]);

  it('un pino en la hierba cuenta, de cubierta o de masa; en el bosque, no', () => {
    const enLaHierba = pieza('pinos', 'cubierta', 2.5, 1.8, 0.6);
    const deMasa = pieza('frondosos', 'masa', 2.4, 1.7, 0.9);
    const enElBosque = pieza('pinos', 'cubierta', 1.5, 1.8, 0.6);
    const mata = pieza('cubierta-grass', 'cubierta', 2.5, 1.8, 0.4);
    expect(sobreLoPisable([enLaHierba, deMasa, enElBosque, mata], franjaDe, W).arboles).toEqual([
      enLaHierba,
      deMasa,
    ]);
  });

  it('la copa de 1,23 con el ancla en x = 1,95 entra en el pasillo y cuenta; una fila al norte, no', () => {
    // Como el frondoso de la marca: 1,5 veces más ancho que alto, de 1,23 llega a x = 2,87.
    const frondoso = pieza('frondosos', 'masa', 1.95, 1.81, 1.23, 150, 100);
    expect(entraEn(frondoso, 2)).toBeCloseTo(0.87, 2);
    expect(sobreLoPisable([frondoso], franjaDe, W).masas).toEqual([frondoso]);
    // Con el pie en la fila de arriba, todo bosque: su silueta no cuenta, es perspectiva.
    expect(sobreLoPisable([{ ...frondoso, y: 0.81 }], franjaDe, W).masas).toEqual([]);
    // Una cumbre que hace lo mismo va aparte: es una medida, no un guardia.
    const cumbre = { ...frondoso, cumbre: true as const };
    expect(sobreLoPisable([cumbre], franjaDe, W)).toEqual({
      arboles: [],
      masas: [],
      pasillos: [],
      cumbres: [cumbre],
    });
  });

  it('la que entra hasta el margen no cuenta; la que pasa de él, sí', () => {
    // Medio ancho de 0,25: con el ancla en 1,95 llega a 2,2, el margen justo.
    const alMargen = pieza('pinos', 'masa', 1.95, 1.8, 0.5);
    expect(entraEn(alMargen, 2)).toBeCloseTo(MARGEN_SOBRE_LO_PISABLE, 6);
    expect(sobreLoPisable([alMargen], franjaDe, W).masas).toEqual([]);
    const pasada = { ...alMargen, alto: 0.52 };
    expect(sobreLoPisable([pasada], franjaDe, W).masas).toEqual([pasada]);
  });

  it('el alto libre sale en cuenta cerrada: hasta el margen justo, por los dos lados', () => {
    // Medio ancho de 0,5 por casilla de alto: desde 1,95 llega a 2,2 con 0,5.
    expect(altoPorLosLados(pieza('pinos', 'masa', 1.95, 1.8, 1), franjaDe, W)).toBeCloseTo(0.5, 9);
    // Desde el bosque de la derecha (x = 3,1), hacia el oeste hasta 2,8: 0,3 de medio ancho.
    expect(altoPorLosLados(pieza('pinos', 'masa', 3.1, 1.8, 1), franjaDe, W)).toBeCloseTo(0.6, 9);
    // Lejos del pasillo, o con el pie en la fila de arriba, su alto.
    expect(altoPorLosLados(pieza('pinos', 'masa', 0.5, 1.8, 1), franjaDe, W)).toBe(1);
    expect(altoPorLosLados(pieza('pinos', 'masa', 1.95, 0.8, 1), franjaDe, W)).toBe(1);
  });

  it('los abetos en miniatura de la nieve son árboles; sus montones de nieve, no', () => {
    expect(esArbol('modulos/cubierta-snow/1.webp')).toBe(true);
    expect(esArbol('modulos/cubierta-sand/5.webp')).toBe(true);
    expect(esArbol('modulos/cubierta-snow/9.webp')).toBe(false);
    expect(esArbol('modulos/cubierta-grass/1.webp')).toBe(false);
    expect(esArbol(null)).toBe(false);
    // Una mata con la imagen del abeto cuenta en lo que se pisa (QA: 9 455 en 1-40).
    const abeto = pieza('cubierta-snow', 'cubierta', 2.5, 1.8, 0.42);
    const nieve = { ...abeto, src: 'modulos/cubierta-snow/9.webp' };
    expect(sobreLoPisable([abeto, nieve], franjaDe, W).arboles).toEqual([abeto]);
  });

  it('la cubierta no admite árboles (`APARTE`): `poner` lanzaría con uno', () => {
    const hojas = (APARTE.cubierta as NonNullable<typeof APARTE.cubierta>).hojas;
    expect(hojas.filter((h) => ARBOLES.includes(h))).toEqual([]);
  });
});

/**
 * La huella de cada hoja de cubierta cuando se miraron sus módulos uno a uno
 * (14-10-2026): el sha256 de sus líneas «imagen sha256», ordenadas. Si cambia
 * (arte nuevo, un módulo más), hay que volver a mirar las imágenes y rehacer
 * `ARBOLES_DE_LA_CUBIERTA`: un árbol nuevo entre las matas no lo ve nadie más.
 */
const HOJAS_MIRADAS: Readonly<Record<string, string>> = {
  'cubierta-dirt': '8cd535e5cc987254f00b72605b34050b923522c42a27f96a619befb9d26ee5a5',
  'cubierta-grass': 'b98f7660d25a6fd6869e451650f146ea65b65d6261027db2dbf2888b0dc613c5',
  'cubierta-lava': '41017e2ddb453dab7685c26260da05ba421115ec472548000a9971de55ba772d',
  'cubierta-rough': '537f693c52cf08be818fa18a203a22f38ed66a64efc9368c08700bf738939567',
  'cubierta-sand': '370d1e721dec308848cd75fcfc287f3c70a075b602071a1f005ce45263bf1c65',
  'cubierta-snow': '16b692d2150bda0d63806395243ba05a517c320975da41cc31dfaa40f6cd4822',
  'cubierta-swamp': 'b788cd06c1a88e8e31fe49375e69da38195df80647f019e3234121b5619d5124',
};

describe('los árboles de la cubierta, mirados uno a uno', () => {
  const MODULOS = join(import.meta.dirname, '..', 'assets', 'mapa', 'modulos');

  it('las hojas de cubierta son las que se miraron, sin cambiar', () => {
    for (const [hoja, suma] of Object.entries(HOJAS_MIRADAS)) {
      const { modulos } = JSON.parse(readFileSync(join(MODULOS, `${hoja}.json`), 'utf8')) as {
        modulos: { imagen: string; sha256: string }[];
      };
      const lineas = modulos.map((m) => `${m.imagen} ${m.sha256}`).sort();
      expect(
        createHash('sha256').update(lineas.join('\n')).digest('hex'),
        `${hoja}: vuelve a mirar sus módulos`,
      ).toBe(suma);
    }
  });

  it('cada árbol apuntado existe en su hoja', () => {
    const hojas = catalogoDelDisco().hojas;
    for (const [hoja, nombres] of ARBOLES_DE_LA_CUBIERTA)
      for (const nombre of nombres)
        expect(
          hojas[hoja]?.some((m) => m.nombre === nombre),
          `${hoja}/${nombre}`,
        ).toBe(true);
    // Y es de una hoja mirada.
    expect([...ARBOLES_DE_LA_CUBIERTA.keys()].filter((h) => !(h in HOJAS_MIRADAS))).toEqual([]);
  });
});

describe('la copa sobre un pasillo estrecho de su norte', () => {
  // Cuatro filas de cinco: bosque; un pasillo de este a oeste de una casilla;
  // bosque; bosque.
  const W = 5;
  const filas = (...f: string[]) =>
    Int32Array.from(f.flatMap((l) => [...l].map((c) => (c === '.' ? -1 : 0))));
  const franjaDe = filas('FFFFF', '.....', 'FFFFF', 'FFFFF');
  const estrechas = pasillosEstrechos(franjaDe, W);

  it('estrecha: sin nada que se pise al norte, o ni al este ni al oeste', () => {
    expect([...estrechas]).toEqual(
      [...filas('FFFFF', '.....', 'FFFFF', 'FFFFF')].map((f) => (f === -1 ? 1 : 0)),
    );
    // Con lo que se pisa al norte, no: es lo ancho. La fila de arriba del mapa sí.
    expect([...pasillosEstrechos(filas('.....', '.....', '.....', 'FFFFF'), W)]).toEqual([
      1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    // La punta de un pasillo de norte a sur, con lo que se pisa al norte, sí.
    expect([...pasillosEstrechos(filas('F.F', 'F.F', 'FFF'), 3)]).toEqual([
      0, 1, 0, 0, 1, 0, 0, 0, 0,
    ]);
  });

  it('el pasillo de dos de hondo es estrecho entero; el de tres, solo su fila de arriba', () => {
    const marcas = (...f: string[]) => [...pasillosEstrechos(filas(...f), W)];
    expect(marcas('FFFFF', '.....', '.....', 'FFFFF')).toEqual(
      [...filas('FFFFF', '.....', '.....', 'FFFFF')].map((f) => (f === -1 ? 1 : 0)),
    );
    expect(marcas('FFFFF', '.....', '.....', '.....', 'FFFFF')).toEqual(
      [...filas('FFFFF', '.....', 'FFFFF', 'FFFFF', 'FFFFF')].map((f) => (f === -1 ? 1 : 0)),
    );
    // Con lo que se pisa abajo hasta el borde del mapa, de dos de hondo tampoco.
    expect(marcas('FFFFF', '.....', '.....', '.....')).toEqual(
      [...filas('FFFFF', '.....', 'FFFFF', 'FFFFF')].map((f) => (f === -1 ? 1 : 0)),
    );
  });

  it('la copa de la fila de debajo tapa como mucho TAPADO_DEL_PASILLO: cuenta cerrada', () => {
    // Un pino cuadrado con el ancla abajo en medio: su caja sube su alto desde el pie.
    const pino = pieza('pinos', 'masa', 2.5, 2.5, 1.2);
    // Lo alto de la caja no pasa de 2 − 0,4: alto 0,9.
    expect(altoSobreLosPasillos(pino, estrechas, W)).toBeCloseTo(2.5 - (2 - TAPADO_DEL_PASILLO), 9);
    // Con el pie más abajo, cabe entero; dos filas más abajo, por encima del bosque, hasta el mismo sitio.
    expect(altoSobreLosPasillos({ ...pino, y: 2.95 }, estrechas, W)).toBe(1.2);
    expect(altoSobreLosPasillos({ ...pino, y: 3.5, alto: 2.5 }, estrechas, W)).toBeCloseTo(1.9, 9);
    // Lo ancho no tiene tope: la copa delante es perspectiva (#185).
    const ancho = pasillosEstrechos(filas('.....', '.....', '.....', 'FFFFF'), W);
    expect(altoSobreLosPasillos({ ...pino, y: 3.5 }, ancho, W)).toBe(1.2);
  });

  it('el contador lo ve en `pasillos`; una cumbre que hace lo mismo, en `cumbres`', () => {
    const pino = pieza('pinos', 'masa', 2.5, 2.5, 1.2);
    expect(sobreLoPisable([pino], franjaDe, W)).toEqual({
      arboles: [],
      masas: [],
      pasillos: [pino],
      cumbres: [],
    });
    const bajo = { ...pino, alto: 0.9 };
    expect(sobreLoPisable([bajo], franjaDe, W).pasillos).toEqual([]);
    const cumbre = { ...pino, cumbre: true as const };
    expect(sobreLoPisable([cumbre], franjaDe, W).cumbres).toEqual([cumbre]);
  });
});

describe('toda casilla de bosque con su árbol', () => {
  it('sin árbol cuenta; con uno, o tapada por un objeto o una pared, no', () => {
    const W = 4;
    const arbol = pieza('pinos', 'masa', 0.5, 0.8, 1);
    const mata = pieza('cubierta-grass', 'cubierta', 1.5, 0.8, 0.4);
    // Un pueblo de 1 × 1 con el pie en (3,5; 2,4): tapa el 0,6 de la casilla
    // (3, 1), que basta, y el 0,4 de (3, 2), que no.
    const ciudad: Sprite = {
      ...pieza('pueblos', 'objeto', 3.5, 2.4, 1),
      objeto: { id: 'village-1', kind: 'village' },
    };
    const bosque = [0, 1, 2, 7, 11];
    expect(bosqueSinArbol([arbol, mata, ciudad], bosque, W)).toEqual([1, 2, 11]);
    // La que tapa una pared por su centro, tampoco.
    expect(
      bosqueSinArbol([arbol, mata, ciudad], bosque, W, (x) => (x < 2 ? 'pared' : null)),
    ).toEqual([2, 11]);
  });
});

const SUELO: Readonly<Record<string, TerrainKind>> = { F: 'forest', '.': 'grass' };

/** Un mapa de una rejilla de texto, sin objetos ni caminos: `F` bosque y `.` prado. */
function mapaDe(filas: readonly string[]): MapaDeEscena {
  return {
    width: (filas[0] as string).length,
    height: filas.length,
    terrain: filas.flatMap((f) => [...f].map((c) => SUELO[c] as TerrainKind)),
    caminos: { tramos: [], sueltas: [] },
    objects: [],
    regions: [],
  };
}

describe('un pasillo de una casilla entre dos bosques', () => {
  const map = mapaDe(rango(1, 6).map(() => 'FF.FF'));
  const e = componer(map, 1, catalogoDelDisco());
  const a = analizar(map);

  it('en el pasillo, ni un árbol ni una copa que entre más del margen', () => {
    const { arboles, masas: tapan } = sobreLoPisable(e.sprites, a.franjaDe, e.W);
    expect(arboles).toEqual([]);
    expect(tapan).toEqual([]);
    // Recontado a mano, todo el pasillo es la columna 2. Sin los pies de encima
    // del mapa, que dejan su copa entera por encima. Por debajo no hay: el dardo
    // no baja del mapa, y su copa no tapa la última fila desde fuera de ella.
    const masas = e.sprites.filter((s) => s.clase === 'masa' && s.y >= 0);
    expect(masas.filter((s) => s.y >= e.H)).toEqual([]);
    for (const s of masas)
      expect(entraEn(s, 2)).toBeLessThanOrEqual(MARGEN_SOBRE_LO_PISABLE + 1e-6);
    expect(e.informe.arbolesSobreLoPisable).toBe(0);
    expect(e.informe.masaSobreLoPisable).toBe(0);
  });

  it('todo el bosque tiene formación, y su huella en el suelo; el pasillo, no', () => {
    expect(e.informe.casillasDeBarreraSinFormacion).toBe(0);
    const m = sotobosqueDe(e, nivelPintado(e));
    for (const y of rango(0, 5))
      for (const x of [0, 1, 3, 4]) expect(enElCentro(m, x, y)).toBeGreaterThanOrEqual(0.4 * 255);
    for (const y of rango(0, 5)) expect(enElCentro(m, 2, y)).toBe(0);
  });
});

/**
 * Un pasillo de este a oeste entre dos bosques, de una casilla de hondo y de dos
 * (H10): `sur` es la primera fila del bosque de debajo.
 */
for (const { hondo, filas, sur } of [
  { hondo: 'de una casilla', filas: ['FFFFFF', 'FFFFFF', '......', 'FFFFFF', 'FFFFFF'], sur: 3 },
  {
    hondo: 'de dos casillas de hondo',
    filas: ['FFFFFF', 'FFFFFF', '......', '......', 'FFFFFF', 'FFFFFF'],
    sur: 4,
  },
])
  describe(`un pasillo de este a oeste ${hondo} entre dos bosques`, () => {
    const map = mapaDe(filas);
    const e = componer(map, 1, catalogoDelDisco());
    const a = analizar(map);

    it('la copa de la fila de debajo no tapa más de TAPADO_DEL_PASILLO de la fila de abajo del pasillo', () => {
      expect(e.informe.pasillosTapados).toBe(0);
      // Recontado a mano: ninguna caja de una masa de la fila `sur` sube de
      // `sur` − TAPADO donde cae sobre lo que no se tapa del pasillo.
      const M = MARGEN_SOBRE_LO_PISABLE;
      for (const s of e.sprites.filter((t) => t.clase === 'masa' && Math.floor(t.y) === sur)) {
        const [x0, y0, x1] = cajaDeSprite(s);
        const sobre = [...Array(e.W).keys()].some(
          (c) => Math.min(x1, c + 1 - M) > Math.max(x0, c + M) + TOQUE,
        );
        if (sobre) expect(y0).toBeGreaterThanOrEqual(sur - TAPADO_DEL_PASILLO - 1e-9);
      }
      expect(sobreLoPisable(e.sprites, a.franjaDe, e.W).pasillos).toEqual([]);
    });

    it('el bosque de debajo sigue siendo bosque: formación, árboles y su borde de más de 0,5', () => {
      expect(e.informe.casillasDeBarreraSinFormacion).toBe(0);
      expect(e.informe.bosqueSinArbol).toBe(0);
      for (const x of rango(0, 5)) {
        const altos = e.sprites
          .filter((s) => s.clase === 'masa' && Math.floor(s.x) === x && Math.floor(s.y) === sur)
          .map((s) => s.alto);
        expect(Math.max(...altos), `(${x}, ${sur})`).toBeGreaterThan(0.5);
      }
    });
  });

describe('el pintor copia la máscara por trozos', () => {
  it('lo que llega al borde derecho también, aunque el ancho no sea de trozos enteros', () => {
    // 672 px, un 42×42 a 16 px: con `x0 <= ancho` el último trozo no se cerraba
    // y un bosque que llegaba al borde se quedaba sin sotobosque.
    const ancho = 672;
    const alto = 20;
    const alfa = new Uint8ClampedArray(ancho * alto);
    alfa[5 * ancho + ancho - 1] = 200;
    alfa[5 * ancho + 100] = 200;
    const trozos = trozosConAlfa({ ancho, alto, R: 16, alfa });
    const cubierto = (x: number, y: number) =>
      trozos.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
    expect(cubierto(ancho - 1, 5)).toBe(true);
    expect(cubierto(100, 5)).toBe(true);
    expect(cubierto(300, 5)).toBe(false);
  });
});

/*
 * Las casillas de las marcas y de QA eran de la s1 de antes de los ríos (#144,
 * 16-10-2026), que la vistió otra vez: se buscan por lo que eran, no por dónde.
 */
const BOSQUE = 'forest' as TerrainKind;

/** Las casillas que se pisan con un bosque al oeste en la misma fila: las marcas (2,23) y (1,23). */
function pisablesJuntoAlBosque(
  a: ReturnType<typeof analizar>,
  map: MapaDeEscena,
  recintos: Escena['recintos'],
): [number, number][] {
  const fuera: [number, number][] = [];
  for (let y = 0; y < map.height; y++)
    for (let x = 1; x < map.width; x++) {
      const i = y * map.width + x;
      const izq = a.franjaDe[i - 1] as number;
      if (a.franjaDe[i] !== -1 || izq === -1 || a.franjas[izq]?.barrera !== BOSQUE) continue;
      if (map.objects.some((o) => o.at.x === x && o.at.y === y)) continue;
      // El bosque de dentro del recinto de una ciudad es su plaza: ni masa ni sotobosque a la vista.
      if (recintos.some(({ rect }) => enElRecinto(rect, x - 0.5, y + 0.5))) continue;
      fuera.push([x, y]);
    }
  return fuera;
}

describe('las dos marcas de la semilla 1, por lo que eran', () => {
  const { map, escena: e } = partidaDe(1);
  const a = analizar(map);
  const pares = pisablesJuntoAlBosque(a, map, e.recintos);
  const estrechas = pasillosEstrechos(a.franjaDe, e.W);
  // La marca (2,23) era hierba de lo ancho, sin pasillo: la copa la mira por los lados.
  const anchas = pares.filter(([x, y]) => estrechas[y * e.W + x] === 0);

  it(`hay casillas así en s1 (${pares.length}, ${anchas.length} fuera de un pasillo)`, () => {
    expect(anchas.length).toBeGreaterThan(5);
  });

  it('la que se pisa, sin árbol ni copa que la tape por los lados', () => {
    for (const [x, y] of anchas) {
      expect(
        e.sprites.filter(
          (s) =>
            ARBOLES.some((h) => s.src?.startsWith(`modulos/${h}/`) === true) &&
            Math.floor(s.x) === x &&
            Math.floor(s.y) === y,
        ),
        `(${x}, ${y})`,
      ).toEqual([]);
      const tapan = e.sprites.filter(
        (s) =>
          s.clase === 'masa' &&
          s.cumbre !== true &&
          Math.floor(s.y) === y &&
          entraEn(s, x) > MARGEN_SOBRE_LO_PISABLE + 1e-6,
      );
      expect(tapan, `(${x}, ${y})`).toEqual([]);
    }
  });

  it('el bosque, con su masa y su sotobosque; lo que se pisa, sin sotobosque', () => {
    const m = sotobosqueDe(e, nivelPintado(e));
    for (const [x, y] of anchas) {
      expect(
        e.sprites.some(
          (s) => s.clase === 'masa' && Math.floor(s.x) === x - 1 && Math.floor(s.y) === y,
        ),
        `(${x - 1}, ${y})`,
      ).toBe(true);
      expect(enElCentro(m, x - 1, y), `(${x - 1}, ${y})`).toBeGreaterThanOrEqual(
        Math.round(255 * SOTOBOSQUE.alfa) - 1,
      );
      expect(enElCentro(m, x, y), `(${x}, ${y})`).toBe(0);
    }
  });
});

describe('lo que vio QA en la semilla 1, por lo que era', () => {
  /**
   * Si alguna masa del sur (sin cumbres) tapa la fila `y` de las columnas `xs`
   * más de lo que deja. La cuenta es cerrada, como la del informe
   * (`altoSobreLosPasillos`): la caja que la puerta encoge hasta el margen lo
   * toca y no entra (`TOQUE`).
   */
  const tapanDesdeElSur = (
    sprites: readonly Sprite[],
    xs: readonly number[],
    y: number,
  ): Sprite[] => {
    const M = MARGEN_SOBRE_LO_PISABLE;
    return sprites.filter((s) => {
      if (s.clase !== 'masa' || s.cumbre === true || Math.floor(s.y) <= y) return false;
      const [x0, y0, x1] = cajaDeSprite(s);
      return (
        xs.some((c) => Math.min(x1, c + 1 - M) > Math.max(x0, c + M) + TOQUE) &&
        y0 < y + 1 - TAPADO_DEL_PASILLO - 1e-9
      );
    });
  };

  /** Lo de `semilla` que miran los pasos y los pasillos: su escena, sus pasillos estrechos y su bosque. */
  const deLaSemilla = (semilla: number) => {
    const p = partidaDe(semilla);
    const an = analizar(p.map);
    const W = p.escena.W;
    return {
      e: p.escena,
      a: an,
      est: pasillosEstrechos(an.franjaDe, W),
      bosque: (x: number, y: number): boolean => {
        const f = an.franjaDe[y * W + x] as number;
        return f !== -1 && an.franjas[f]?.barrera === BOSQUE;
      },
    };
  };

  // La marca de (29-31, 17): un paso de este a oeste de una casilla de hondo,
  // con bosque al norte y al sur, de tres casillas o más. La s1 de hoy no tiene
  // ninguno; la s3 tenía cuatro (con su espejo) hasta el río de una casilla
  // (#144, paso 2), que la dejó sin ninguno: la s30, tres. Con el río de una
  // casilla al pie de la meseta (#144, paso 2b) la s30 no tiene ninguno: la
  // s11, tres. Con el río continuo (#144) la s11 no tiene ninguno y la s1, dos.
  it('los pasos de una casilla entre dos bosques (s1): la copa de su sur deja su 0,6 de arriba', () => {
    const { e: e1, a: a1, est: est1, bosque: bosque1 } = deLaSemilla(1);
    const W1 = e1.W;
    const pasos: [number, number][] = [];
    for (let y = 1; y < e1.H - 1; y++)
      for (let x = 0; x + 2 < W1; x++)
        if (
          [0, 1, 2].every(
            (d) =>
              est1[y * W1 + x + d] === 1 &&
              a1.franjaDe[y * W1 + x + d] === -1 &&
              bosque1(x + d, y - 1) &&
              bosque1(x + d, y + 1),
          )
        )
          pasos.push([x, y]);
    expect(pasos.length).toBeGreaterThan(0);
    const M = MARGEN_SOBRE_LO_PISABLE;
    for (const [x, y] of pasos) {
      const tapan = e1.sprites.filter((s) => {
        if (s.clase !== 'masa' || s.cumbre === true || Math.floor(s.y) <= y) return false;
        const [x0, y0, x1] = cajaDeSprite(s);
        return (
          [x, x + 1, x + 2].some((c) => Math.min(x1, c + 1 - M) > Math.max(x0, c + M) + TOQUE) &&
          y0 < y + 1 - TAPADO_DEL_PASILLO - 1e-9
        );
      });
      expect(tapan, `(${x}, ${y})`).toEqual([]);
    }
  });

  // La de (11-12, 8-9): un pasillo de dos de hondo y dos de ancho, con bosque
  // al sur. La s1 no tiene ninguno desde el río de una casilla (#144, paso 2):
  // la s36, seis. Con el río de una casilla al pie de la meseta (#144, paso 2b)
  // la s36 no tiene ninguno: la s12, ocho, la que más de 1-60.
  const hondos: [number, number][] = [];
  const conHondos = deLaSemilla(12);
  {
    const { e: eh, est, bosque } = conHondos;
    for (let y = 0; y + 2 < eh.H; y++)
      for (let x = 0; x + 1 < eh.W; x++)
        if (
          [0, 1].every(
            (dx) =>
              [0, 1].every((dy) => est[(y + dy) * eh.W + x + dx] === 1) && bosque(x + dx, y + 2),
          )
        )
          hondos.push([x, y]);
  }

  it(`los pasillos de dos de hondo con bosque al sur (${hondos.length} en s12): la copa deja el 0,6 de arriba de su fila de abajo`, () => {
    expect(hondos.length).toBeGreaterThan(0);
    for (const [x, y] of hondos)
      expect(tapanDesdeElSur(conHondos.e.sprites, [x, x + 1], y + 1), `(${x}, ${y})`).toEqual([]);
  });
});

/**
 * En `pnpm verify`, s1 (las marcas), s9 (la ciénaga junto al bosque, la que más
 * masa de montaña desbordaba: 82) y s13 (59 picos de montaña de más de 0,5); en
 * la orden lenta, 1-40.
 */
const SEMILLAS = LENTO ? rango(1, 40) : [1, 9, 13];

describe('en los mapas reales', () => {
  for (const semilla of SEMILLAS)
    it(`semilla ${semilla}: ningún árbol sobre lo que se pisa, ni copa que lo tape, ni bosque sin árbol`, () => {
      const { map, escena: e } = partidaDe(semilla);
      const a = analizar(map);
      expect(e.informe.arbolesSobreLoPisable).toBe(0);
      expect(e.informe.masaSobreLoPisable).toBe(0);
      expect(e.informe.pasillosTapados).toBe(0);
      expect(e.informe.bosqueSinArbol).toBe(0);
      expect(sobreLoPisable(e.sprites, a.franjaDe, e.W).arboles).toEqual([]);
      // Ni en lo que no se pisa: la cubierta no lleva sus módulos de árbol en ningún sitio.
      expect(e.sprites.filter((s) => s.clase === 'cubierta' && esArbol(s.src))).toEqual([]);
      // Recontado a mano: ninguna masa, salvo las cumbres, pisa lo que no se tapa.
      const tapan = e.sprites.filter(
        (s) =>
          s.clase === 'masa' && s.cumbre !== true && pisaDeLoPisable(s, a.franjaDe, e.W) > 1e-6,
      );
      expect(tapan).toEqual([]);
      // Ni los peñascos grises de la nieve (H9).
      expect(
        e.sprites.filter((s) => s.clase === 'cubierta' && peñascoEnLoQueSePisa(s, a.franjaDe, e.W)),
      ).toEqual([]);
    });
});

/**
 * Los peñascos de roca gris de la nieve, mirados en su hoja (16-10-2026): los
 * módulos 5-8 de `cubierta-snow`. Escritos aquí y no leídos de la tabla, para
 * que vaciarla haga rojo.
 */
const PEÑASCOS_GRISES = ['5', '6', '7', '8'].map((n) => `cubierta-snow/${n}`);
const esPeñascoGris = (s: Sprite) => PEÑASCOS_GRISES.some((p) => s.src === `modulos/${p}.webp`);

/** Si `s` es un peñasco gris de la nieve (`PEÑASCOS_GRISES`) con el pie en lo que se pisa. */
function peñascoEnLoQueSePisa(s: Sprite, franjaDe: ArrayLike<number>, W: number): boolean {
  return esPeñascoGris(s) && franjaDe[Math.floor(s.y) * W + Math.floor(s.x)] === -1;
}

describe('la nieve que se pisa, sin sus peñascos grises (H9)', () => {
  // s3: el Valle Hondo de QA, 547 casillas de nieve que se pisa. En 1-40 había
  // 13 230 peñascos en la nieve que se pisa: el 41 % de lo que cubría la de s1, 3 y 7.
  // Con el río de una casilla (#144, paso 2) la s3 no tiene mesetas nevadas: la
  // s5, 830 casillas de nieve que se pisa y 143 peñascos en lo alto. Con el río
  // de una casilla al pie de la meseta (#144, paso 2b) la s5 no tiene peñascos en
  // lo alto: la s56, 883 casillas de nieve que se pisa y 95 peñascos en lo alto.
  // Con el río continuo (#144) la s56 no tiene mesetas: la s79, la de más
  // nieve que se pisa de 1-80 con peñascos en lo alto (870 casillas y 81). Con
  // el recinto de las ciudades del núcleo (vuelta 3) la s79 no los tiene: la s4
  // (617 casillas y 41). Con las puertas de las ciudades (fase 2) la s4 no
  // tiene nieve que se pise: la s61 (464 casillas y 101 peñascos).
  const { map, escena: e } = partidaDe(61);
  const a = analizar(map);
  const rocas = e.sprites.filter((s) => s.clase === 'cubierta' && esPeñascoGris(s));

  it('son los de la tabla', () => {
    expect([...(FUERA_DE_LO_QUE_SE_PISA.get('cubierta-snow') ?? [])].sort()).toEqual(
      PEÑASCOS_GRISES.map((n) => n.split('/')[1]).sort(),
    );
  });

  it('ninguno con el pie en lo que se pisa; en lo alto del acantilado, sí', () => {
    expect(rocas.filter((s) => peñascoEnLoQueSePisa(s, a.franjaDe, e.W))).toEqual([]);
    expect(rocas.length).toBeGreaterThan(0);
  });

  it('la nieve que se pisa sigue cubierta: montones y matas nevadas', () => {
    const nieve = new Set(
      [...a.franjaDe.keys()].filter((i) => a.franjaDe[i] === -1 && e.suelo[i] === 'snow'),
    );
    const enLaNieve = e.sprites.filter(
      (s) =>
        s.clase === 'cubierta' &&
        s.src?.startsWith('modulos/cubierta-snow/') &&
        nieve.has(Math.floor(s.y) * e.W + Math.floor(s.x)),
    );
    // Con los peñascos, 5,42 piezas por casilla (2 965 en 547); sin ellos, 5,39:
    // los montones y las matas ocupan su sitio.
    expect(enLaNieve.length / nieve.size).toBeGreaterThan(5);
  });
});

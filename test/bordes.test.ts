/**
 * El borde de una meseta, entero (#212, auditoría 5, defectos 1 y 5).
 *
 * «Una elevación no puede acabar de repente, sin continuidad»: la cara al sur
 * llevaba su frontal y el este y el oeste sus laderas, pero el norte (la
 * espalda, que la cámara no ve) solo llevaba peñascos en los acantilados, y con
 * el nivel por región (#143) casi todo borde de meseta es lo que se pisa contra
 * el agua encajada: 795 casillas de espalda sin nada en 1-40. Una cadena de
 * laderas que tocaba el borde del mapa rematada con su morro, como si la
 * elevación empezara allí. La montaña de arena llevaba las mesas del cantil
 * (1 444 en 1-40) y lo alto del acantilado, la roca de su suelo y no la de su
 * cara (1 431 picos grises sobre arenisca roja en 1-40).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analizar } from '../src/client/render/escenario/analizar.js';
import {
  caraDeOtroMaterial,
  cimaDeOtroMaterial,
  esPiezaDelRelieve,
  espaldasSinReborde,
  materialDeLaCima,
  paredesTapadasPorLaMasa,
  sueloDeLaMeseta,
} from '../src/client/render/escenario/bordes.js';
import { perfilesDelCatalogo } from '../src/client/render/escenario/caras.js';
import { caidas, celdas as celdasDe } from '../src/client/render/escenario/celdas.js';
import {
  ANCHO_DE_MESA,
  esMesa,
  formasDeLasParedes,
  type Medible,
  RADIO_DE_OBJETO,
  type Sprite,
} from '../src/client/render/escenario/colocar.js';
import { Obstaculos } from '../src/client/render/escenario/pasillo.js';
import { isWalkable, type Suelo, type TerrainKind } from '../src/core/map/terrain.js';
import { catalogoDelDisco, partidaDe, primeraSemillaCon } from './helpers.js';
import { itLento, rango } from './lento.js';

const nunca = () => false;

describe('espaldasSinReborde: el guardia muerde', () => {
  // Dos filas de dos: arriba el agua (−1), abajo lo que se pisa (0).
  const terreno: TerrainKind[] = ['water', 'water', 'grass', 'cliff'];
  const rebordes = [
    [0, 1],
    [1, 1],
  ] as const;

  it('una espalda que se pisa o de acantilado sin nada en su mitad norte cuenta', () => {
    expect(espaldasSinReborde([], rebordes, terreno, 2, nunca)).toEqual([
      [0, 1],
      [1, 1],
    ]);
  });

  it('un peñasco con el pie en la mitad norte la cubre; en la mitad sur, no', () => {
    const sprites = [
      { clase: 'roca', x: 0.4, y: 1.2, alto: 0.4 },
      { clase: 'roca', x: 1.4, y: 1.7, alto: 0.4 },
    ];
    expect(espaldasSinReborde(sprites, rebordes, terreno, 2, nunca)).toEqual([[1, 1]]);
  });

  it('la cubierta no es reborde, y la razón declarada la excusa', () => {
    const mata = [{ clase: 'cubierta', x: 0.4, y: 1.2, alto: 0.4 }];
    expect(espaldasSinReborde(mata, rebordes, terreno, 2, nunca)).toHaveLength(2);
    expect(espaldasSinReborde([], rebordes, terreno, 2, (i) => i === 2)).toEqual([[1, 1]]);
  });

  it('la masa (montaña, bosque) y el agua no llevan reborde: no cuentan', () => {
    const masa: TerrainKind[] = ['water', 'water', 'mountain', 'water'];
    expect(espaldasSinReborde([], rebordes, masa, 2, nunca)).toEqual([]);
  });
});

describe('materialDeLaCima: lo alto del acantilado es de la roca de su cara', () => {
  // Tres filas de una columna: el acantilado de hierba (0) y el de arena (1)
  // a nivel 2, y la arena que se pisa (2) a nivel 1. Solo cae a la vista la
  // casilla de arena, al sur: su cara es de arenisca, y la hierba de detrás
  // lleva arenisca, no roca gris.
  const suelo: Suelo[] = ['grass', 'sand', 'sand'];
  const nivel = [2, 2, 1];
  const franja = { barrera: 'cliff' as const, casillas: [0, 1] };

  it('toda la franja, de la casilla más cercana que cae a la vista', () => {
    expect(materialDeLaCima(1, 3, suelo, nivel, [franja])).toEqual([
      'cara-arenisca',
      'cara-arenisca',
      'cara-arenisca',
    ]);
  });

  it('sin caída a la vista (solo de espaldas), cada casilla con su suelo', () => {
    expect(materialDeLaCima(1, 3, suelo, [2, 2, 2], [franja])).toEqual([
      'cara-roca',
      'cara-arenisca',
      'cara-arenisca',
    ]);
  });

  it('fuera de un acantilado, el de su suelo', () => {
    const monte = { barrera: 'mountain' as const, casillas: [0, 1] };
    expect(materialDeLaCima(1, 3, suelo, nivel, [monte])[0]).toBe('cara-roca');
  });
});

describe('cimaDeOtroMaterial: el guardia muerde', () => {
  const terreno: TerrainKind[] = ['cliff', 'grass'];
  const material = ['cara-arenisca', 'cara-roca'];
  const pico = (hoja: string, x: number) => ({
    clase: 'roca',
    src: `modulos/${hoja}/1.webp`,
    x,
    y: 0.6,
  });

  it('un pico gris en lo alto de una cara de arenisca cuenta; uno de arenisca, no', () => {
    expect(cimaDeOtroMaterial([pico('picos-roca', 0.5)], terreno, 2, material)).toEqual([0]);
    expect(cimaDeOtroMaterial([pico('picos-arenisca', 0.5)], terreno, 2, material)).toEqual([]);
  });

  it('fuera del acantilado, o un peñasco, no cuenta', () => {
    expect(cimaDeOtroMaterial([pico('picos-arenisca', 1.5)], terreno, 2, material)).toEqual([]);
    expect(cimaDeOtroMaterial([pico('rocas-caidas', 0.5)], terreno, 2, material)).toEqual([]);
  });
});

describe('las mesas de arenisca son del acantilado, no de la cordillera', () => {
  const indice = JSON.parse(
    readFileSync(join(import.meta.dirname, '../assets/mapa/modulos/picos-arenisca.json'), 'utf8'),
  ) as { modulos: { imagen: string; ancho: number; alto: number }[] };
  const mesas = indice.modulos
    .filter((m) => esMesa('picos-arenisca', { nw: m.ancho, nh: m.alto }))
    .map((m) => m.imagen)
    .sort();

  it(`más anchas que ${ANCHO_DE_MESA} veces su alto: las ocho de techo plano`, () => {
    expect(mesas).toEqual(
      ['1', '3', '6', '8', '9', '10', '13', '16'].map((n) => `${n}.webp`).sort(),
    );
  });

  it('las demás hojas no tienen mesas', () => {
    expect(esMesa('picos-roca', { nw: 400, nh: 100 })).toBe(false);
  });
});

describe('una cadena de laderas no remata en el borde del mapa', () => {
  // Dos columnas altas (nivel 1) y dos bajas (0): la caída al este en el vértice 2.
  const suelo = (n: number): Suelo[] => Array.from({ length: n }, () => 'grass');

  it('de borde a borde, sin morro ni cono: el desnivel sigue fuera del marco', () => {
    const nivel = [1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0];
    const [l, ...otras] = caidas(nivel, 4, 4, suelo(16)).laderas;
    expect(otras).toEqual([]);
    expect(l).toMatchObject({ lado: 'este', inicio: false, fin: false });
  });

  it('dentro del mapa, donde sigue de espaldas, sí remata', () => {
    // La meseta solo en las filas 1-4 de 6.
    const nivel = [
      ...[0, 0, 0, 0],
      ...[1, 1, 0, 0],
      ...[1, 1, 0, 0],
      ...[1, 1, 0, 0],
      ...[1, 1, 0, 0],
      ...[0, 0, 0, 0],
    ];
    const este = caidas(nivel, 4, 6, suelo(24)).laderas.find((l) => l.lado === 'este');
    expect(este).toMatchObject({ inicio: true });
  });
});

/** Las casillas de la huella de ciudades, pueblos y nodos, contadas por fuera de `componer`. */
function huellaDeLosObjetos(semilla: number): Set<number> {
  const { map } = partidaDe(semilla);
  const W = map.width;
  const huella = new Set<number>();
  for (const o of map.objects) {
    if (o.kind !== 'town' && o.kind !== 'village' && o.kind !== 'node') continue;
    const r = RADIO_DE_OBJETO[o.kind] as number;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = o.at.x + dx;
        const y = o.at.y + dy;
        if (x >= 0 && y >= 0 && x < W && y < map.height && Math.hypot(dx, dy) < r)
          huella.add(y * W + x);
      }
  }
  return huella;
}

/**
 * Las espaldas sin reborde de la semilla, contadas por fuera: sin la huella de
 * los objetos, ni junto a uno (su reserva aparta las rocas), ni las casillas por
 * cuyo canto norte pasa una senda (la razón declarada de `componer`, aquí más
 * ancha: toda senda a menos de media casilla).
 */
function espaldasDe(semilla: number): (readonly [number, number])[] {
  const { map, escena: e } = partidaDe(semilla);
  const huella = huellaDeLosObjetos(semilla);
  const porLaSenda = (i: number) => {
    const x = i % e.W;
    const y = Math.floor(i / e.W);
    return e.sendas.some((sd) =>
      sd.some(([px, py]) => px >= x - 0.5 && px <= x + 1.5 && py >= y - 0.5 && py <= y + 0.9),
    );
  };
  return espaldasSinReborde(
    e.sprites,
    e.relieve.rebordes,
    map.terrain,
    e.W,
    (i) =>
      huella.has(i) ||
      porLaSenda(i) ||
      map.objects.some(
        (o) => Math.abs(o.at.x - (i % e.W)) <= 1 && Math.abs(o.at.y - Math.floor(i / e.W)) <= 1,
      ),
  );
}

/** Las de la auditoría 5: los recortes del defecto 1 y del 5. */
const SEMILLAS_DE_LA_AUDITORIA = [2, 443, 1, 57, 9];

describe('en los mapas reales', () => {
  for (const semilla of SEMILLAS_DE_LA_AUDITORIA)
    it(`semilla ${semilla}: todo el borde de la meseta lleva pieza, y lo alto, su roca`, () => {
      const { informe } = partidaDe(semilla).escena;
      expect(espaldasDe(semilla)).toEqual([]);
      expect(informe.espaldasSinReborde).toBe(0);
      expect(informe.cimaDeOtroMaterial).toBe(0);
      expect(informe.mesasEnLaCordillera).toBe(0);
    });

  it('la montaña de arena lleva agujas y no mesas (s57 (15-18, 10-19) antes de #210)', () => {
    // Con los mapas de #210 la de s57 ya no está: la primera semilla con una
    // montaña de arena de más de 10 picos.
    const { caso: picos } = primeraSemillaCon('una montaña de arena con más de 10 picos', (s) => {
      const { map, escena: e } = partidaDe(s);
      const suyos = e.sprites.filter(
        (x) =>
          x.clase === 'masa' &&
          x.src?.startsWith('modulos/picos-arenisca/') === true &&
          map.terrain[Math.floor(x.y) * e.W + Math.floor(x.x)] === 'mountain',
      );
      return suyos.length > 10 ? suyos : undefined;
    });
    expect(picos.filter((s) => esMesa('picos-arenisca', s))).toEqual([]);
  });

  it('el informe muerde en un mapa real: quitar los peñascos de una espalda la cuenta', () => {
    const { map, escena: e } = partidaDe(2);
    const huella = huellaDeLosObjetos(2);
    const [x, y] = e.relieve.rebordes.find(
      ([x, y]) => isWalkable(map.terrain[y * e.W + x] as TerrainKind) && !huella.has(y * e.W + x),
    ) as readonly [number, number];
    const sin = e.sprites.filter((s) => Math.floor(s.x) !== x || Math.floor(s.y) !== y);
    expect(espaldasSinReborde(sin, e.relieve.rebordes, map.terrain, e.W, nunca)).toContainEqual([
      x,
      y,
    ]);
  });

  itLento(
    '1-40: ninguna espalda sin reborde, ninguna cima de otra roca, ninguna mesa en la cordillera',
    () => {
      for (const s of rango(1, 40)) {
        const { informe } = partidaDe(s).escena;
        expect(espaldasDe(s), `s${s}`).toEqual([]);
        expect([
          informe.espaldasSinReborde,
          informe.cimaDeOtroMaterial,
          informe.mesasEnLaCordillera,
        ]).toEqual([0, 0, 0]);
      }
    },
  );
});

/**
 * Un desnivel bajo una montaña (#216, auditoría 6, defectos 2 y 3): la pared
 * corre entera por delante del pie de la cordillera, sin picos delante, y es de
 * la roca de su meseta y no del suelo de abajo.
 */
describe('sueloDeLaMeseta: la barrera alta lleva el suelo de su meseta', () => {
  // Una fila: arena a 1, una montaña a 1 (su suelo más cercano, la ciénaga de
  // al lado), la ciénaga a 0.
  const region = [0, -1, -1, 1];
  const suelo: Suelo[] = ['sand', 'swamp', 'swamp', 'swamp'];

  it('la montaña a 1 toma la arena de su nivel aunque la ciénaga de abajo esté más cerca', () => {
    expect(sueloDeLaMeseta(4, 1, region, suelo, [1, 1, 1, 0])).toEqual([
      'sand',
      'sand',
      'sand',
      'swamp',
    ]);
  });

  it('lo que no llega a nada de su nivel se queda con su suelo', () => {
    expect(sueloDeLaMeseta(4, 1, region, suelo, [1, 2, 2, 0])).toEqual(suelo);
  });

  it('un nodo no es fuente: su suelo es el más cercano de cualquier nivel', () => {
    // El nodo (región −1) de lava junto a la montaña nevada: la montaña sigue
    // con la nieve de su meseta, aunque el nodo esté antes en la rejilla.
    const conNodo = sueloDeLaMeseta(
      4,
      1,
      [-1, -1, 0, 1],
      ['lava', 'lava', 'snow', 'swamp'],
      [1, 1, 1, 0],
    );
    expect(conNodo[1]).toBe('snow');
  });
});

describe('caraDeOtroMaterial: el guardia muerde', () => {
  // Dos por dos: arriba arena (1) y una montaña a 1; abajo la ciénaga (0).
  const terreno: TerrainKind[] = ['sand', 'mountain', 'swamp', 'swamp'];
  const region = [0, -1, 1, 1];
  const nivel = [1, 1, 0, 0];
  const pared = (material: string) => ({ vx: 1, vy: 1, desde: 1, material });

  it('una pared gris bajo la meseta de arena cuenta; una de arenisca, no', () => {
    expect(caraDeOtroMaterial([pared('cara-roca')], 2, 2, terreno, region, nivel)).toHaveLength(1);
    expect(caraDeOtroMaterial([pared('cara-arenisca')], 2, 2, terreno, region, nivel)).toEqual([]);
  });

  it('en un mapa real: con la roca del suelo de cada casilla, como antes de #216, cuenta', () => {
    const { map, escena: e } = partidaDe(5);
    const a = analizar(map);
    const antes = celdasDe(e.nivel, e.W, e.H, a.suelo).filter((c) =>
      e.relieve.celdas.some((v) => v.vx === c.vx && v.vy === c.vy && v.tipo === c.tipo),
    );
    expect(
      caraDeOtroMaterial(antes, e.W, e.H, map.terrain, a.region, e.nivel).length,
    ).toBeGreaterThan(0);
    expect(caraDeOtroMaterial(e.relieve.celdas, e.W, e.H, map.terrain, a.region, e.nivel)).toEqual(
      [],
    );
  });
});

describe('paredesTapadasPorLaMasa: el guardia muerde, y la masa se aparta de la pared', () => {
  const catalogo = catalogoDelDisco();
  const perfilDe = perfilesDelCatalogo(catalogo);
  // Una frontal de la escena de s5 y un pico, delante (más al sur) o detrás.
  const { escena: e } = partidaDe(5);
  const pared = e.sprites.find(esPiezaDelRelieve) as Sprite;
  const pico = (dy: number): Sprite => ({
    src: 'modulos/picos-arenisca/2.webp',
    nw: 100,
    nh: 200,
    ax: 50,
    ay: 200,
    x: pared.x,
    y: pared.y + dy,
    alto: 2,
    clase: 'masa',
    color: '#000',
    capa: 0,
    sombra: true,
  });

  it('un pico que se pinta después, sobre su silueta, la tapa; uno que se pinta antes, no', () => {
    expect(paredesTapadasPorLaMasa([pared, pico(0.3)], perfilDe)).toEqual([
      { pared: 0, tapada: expect.any(Number) },
    ]);
    expect(paredesTapadasPorLaMasa([pared, pico(-0.3)], perfilDe)).toEqual([]);
  });

  it('el obstáculo de la pared no deja entrar el pico de delante y sí el de detrás', () => {
    const obstaculos = new Obstaculos<Medible>(formasDeLasParedes([pared], perfilDe));
    expect(obstaculos.pisa(pico(0.3))).toBe(true);
    expect(obstaculos.altoLibre(pico(0.3))).toBeLessThan(2);
    expect(obstaculos.pisa(pico(-0.3))).toBe(false);
    // Lo que no es masa no lo mira: el pedregal del pie va delante a propósito.
    expect(obstaculos.pisa({ ...pico(0.3), clase: 'roca' })).toBe(false);
  });
});

/** Las de la auditoría 6: los recortes de los defectos 2 y 3. */
const SEMILLAS_DE_LA_AUDITORIA_6 = [24, 2, 5];

describe('un desnivel bajo una montaña, en los mapas reales (#216)', () => {
  for (const semilla of SEMILLAS_DE_LA_AUDITORIA_6)
    it(`semilla ${semilla}: ninguna masa tapa una pared, y cada pared es de la roca de su meseta`, () => {
      const { informe } = partidaDe(semilla).escena;
      expect(informe.paredesTapadas).toBe(0);
      expect(informe.caraDeOtroMaterial).toBe(0);
    });

  it('s5 (2-8, 27-31): la pared bajo la cordillera de arena es de arenisca', () => {
    const { escena: e } = partidaDe(5);
    const bajoLaArena = e.relieve.celdas.filter(
      (c) => c.vx >= 2 && c.vx <= 8 && c.vy >= 27 && c.vy <= 31,
    );
    expect(bajoLaArena.length).toBeGreaterThan(0);
    expect(new Set(bajoLaArena.map((c) => c.material))).toEqual(new Set(['cara-arenisca']));
  });

  itLento('1-40: ninguna masa tapa una pared, ninguna pared de otra roca que su meseta', () => {
    for (const s of rango(1, 40)) {
      const { informe } = partidaDe(s).escena;
      expect([informe.paredesTapadas, informe.caraDeOtroMaterial], `s${s}`).toEqual([0, 0]);
    }
  });
});

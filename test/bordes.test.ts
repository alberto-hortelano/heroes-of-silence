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
  sueloQueSePinta,
} from '../src/client/render/escenario/bordes.js';
import { perfilesDelCatalogo } from '../src/client/render/escenario/caras.js';
import { caidas, celdas as celdasDe } from '../src/client/render/escenario/celdas.js';
import {
  ANCHO_DE_MESA,
  casillasDeLaHuella,
  esMesa,
  formasDeLasParedes,
  type Medible,
  type Sprite,
} from '../src/client/render/escenario/colocar.js';
import { Obstaculos } from '../src/client/render/escenario/pasillo.js';
import { recintoDeLaCiudad } from '../src/core/map/recinto.js';
import { esBarrera, isWalkable, type Suelo, type TerrainKind } from '../src/core/map/terrain.js';
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

/** Las casillas de la huella de ciudades, pueblos y nodos (`casillasDeLaHuella`, la de `componer`). */
function huellaDeLosObjetos(semilla: number): Set<number> {
  const { map } = partidaDe(semilla);
  const W = map.width;
  const huella = new Set<number>();
  for (const o of map.objects) {
    // La ciudad, su recinto entero, con ella en el medio (también la ciudad-puente).
    const rect = o.kind === 'town' ? recintoDeLaCiudad(o.at, W, map.height) : undefined;
    for (const [x, y] of casillasDeLaHuella(o, o.at, rect, W, map.height)) huella.add(y * W + x);
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

/**
 * Las de la auditoría 5: los recortes del defecto 1 y del 5. La 3 en vez de la 2
 * desde las dos puertas de la mina (#230), que dejan la 2 sin meseta.
 */
const SEMILLAS_DE_LA_AUDITORIA = [3, 443, 1, 57, 9];

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
    // Era la s2, que con las fronteras onduladas (#229, 09-10-2026) se quedó
    // sin espalda que se pise fuera de la huella de un objeto: se busca.
    const { caso } = primeraSemillaCon('una espalda que se pisa, fuera de toda huella', (s) => {
      const { map, escena: e } = partidaDe(s);
      const huella = huellaDeLosObjetos(s);
      const r = e.relieve.rebordes.find(
        ([x, y]) => isWalkable(map.terrain[y * e.W + x] as TerrainKind) && !huella.has(y * e.W + x),
      );
      return r === undefined ? undefined : { map, e, r };
    });
    const { map, e } = caso;
    const [x, y] = caso.r;
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

  it('una isla de barrera toma lo que se pisa a su nivel más cercano, pasando por otro nivel', () => {
    // Lava a 1, una montaña a 0, dos montañas a 1 sin nada a 1 unido a ellas
    // (las separa la de 0) y la ciénaga a 0. Las dos de 1 toman la lava de dos
    // casillas más allá, no la ciénaga de al lado (s9 (22-23, 28) con los ríos;
    // s1037 (33, 32-33) con el río de una casilla; s731 (24, 29) con el río
    // continuo). Sin agua de frontera fuera del río (QA del río continuo, H3)
    // ninguna semilla de 1-1600 tiene una isla así, y su test sobre el mapa se
    // fue: queda esta rejilla.
    expect(
      sueloDeLaMeseta(
        5,
        1,
        [0, -1, -1, -1, 1],
        ['lava', 'swamp', 'swamp', 'swamp', 'swamp'],
        [1, 0, 1, 1, 0],
      ),
    ).toEqual(['lava', 'swamp', 'lava', 'lava', 'swamp']);
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

/**
 * El suelo que se pinta en una barrera es el de su meseta (#217): con el más
 * cercano de cualquier nivel, los picos nevados de s24 (22-29, 9-16) iban
 * sobre el áspero oscuro de abajo.
 */
describe('sueloQueSePinta: la barrera y el nodo pintan el suelo de su meseta', () => {
  it('la montaña y el nodo (sin región) toman el de su meseta; lo que se pisa, el suyo aunque la meseta diga otro', () => {
    // Hierba, una montaña, un nodo y la ciénaga.
    const region = [0, -1, -1, 1];
    expect(
      sueloQueSePinta(
        region,
        ['grass', 'swamp', 'swamp', 'swamp'],
        ['grass', 'grass', 'grass', 'dirt'],
      ),
    ).toEqual(['grass', 'grass', 'grass', 'swamp']);
  });

  it('s3 (32,8): el nodo sin camino que va a la meseta de nieve pinta nieve, no la lava de abajo (#220)', () => {
    // Era s13 (18,7), con la nieve abajo; desde #226 (42×42), s40 (8,12), con
    // la ciénaga abajo. Con las fronteras onduladas (#229, 09-10-2026), s1
    // (11,34), con la hierba; con los ríos (#144, 16-10-2026), s6 (34,6), otra
    // vez con la ciénaga. Con el río continuo (#144), s66 (12,30), la primera
    // de 1-80 con la nieve arriba y la ciénaga abajo. Con las puertas de las
    // ciudades (fase 2, 21-10-2026), s8 (9,11), con la hierba abajo. Sin minas
    // (21-10-2026), s3 (32,8), con la lava abajo.
    const { map, escena: e } = partidaDe(3);
    const a = analizar(map);
    const i = 8 * a.W + 32;
    expect(map.objects.some((o) => o.kind === 'node' && o.at.x === 32 && o.at.y === 8)).toBe(true);
    expect(map.caminos.tiene({ x: 32, y: 8 })).toBe(false);
    expect(e.nivel[i]).toBe(2);
    // Que el guardia no mire al vacío: el más cercano de cualquier nivel es la lava.
    expect(a.suelo[i]).toBe('lava');
    expect(e.suelo[i]).toBe('snow');
  });

  it('semilla 7: cada casilla de barrera de la escena lleva el suelo de su meseta, y antes no', () => {
    // La 7 desde el río continuo (#144), que dejó la 24 sin meseta: 98 casillas
    // de barrera con otro suelo más cercano que el de su meseta (nieve sobre
    // hierba y arena, como los picos de s24).
    const { map, escena: e } = partidaDe(7);
    const a = analizar(map);
    const meseta = sueloDeLaMeseta(a.W, a.H, a.region, a.suelo, e.nivel);
    let barreras = 0;
    let distintasAntes = 0;
    for (let i = 0; i < a.W * a.H; i++) {
      if (!esBarrera(a.terreno[i] as TerrainKind)) continue;
      barreras++;
      expect(e.suelo[i]).toBe(meseta[i]);
      if (a.suelo[i] !== meseta[i]) distintasAntes++;
    }
    expect(barreras).toBeGreaterThan(0);
    // Que el guardia no mire al vacío: con `Analisis.suelo`, la s7 tenía de las otras.
    expect(distintasAntes).toBeGreaterThan(0);
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
    // s2: la s5 dejó de tenerla con el acantilado en línea (#215), la s2 se
    // quedó sin meseta con las dos puertas de la mina (#230) y la s3 con el río
    // continuo (#144); la s12 daba 21 caras de otro material con la roca de
    // antes, y con las puertas de las ciudades (fase 2), otra vez la s2, 11.
    const { map, escena: e } = partidaDe(2);
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
  // Una frontal de la escena de s12 (s5 hasta #215, s2 hasta #230, que la dejó
  // sin meseta, s3 hasta el río continuo, #144, por lo mismo) y un pico,
  // delante (más al sur) o detrás.
  const { escena: e } = partidaDe(12);
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

/**
 * Las de la auditoría 6 eran los recortes de los defectos 2 y 3 (24, 3 y 5; la 3
 * en vez de la 2 desde las dos puertas de la mina, #230). Con el río continuo
 * (#144) ninguna de las tres tiene una montaña que caiga a lo bajo: van las de
 * 1-60 con más casillas así (la 22, 41; la 17, 38; la 25, 31).
 */
const SEMILLAS_DE_LA_AUDITORIA_6 = [22, 17, 25];

describe('un desnivel bajo una montaña, en los mapas reales (#216)', () => {
  for (const semilla of SEMILLAS_DE_LA_AUDITORIA_6)
    it(`semilla ${semilla}: ninguna masa tapa una pared, y cada pared es de la roca de su meseta`, () => {
      const { informe } = partidaDe(semilla).escena;
      expect(informe.paredesTapadas).toBe(0);
      // Sin excepciones desde #226: la de s24 (10, la cordillera de (32-33, 9-11)
      // en 34×34) era de otro mapa, y en 42×42 1-40 están todas a 0 (09-10-2026).
      expect(informe.caraDeOtroMaterial).toBe(0);
    });

  it('s60 (30-37, 0-6): la pared bajo la cordillera de arena es de arenisca', () => {
    // Era s5 (2-8, 27-31), de la auditoría; con el acantilado en línea (#215)
    // es otro mapa, y s2 (14-20, 0-5) hasta los vestidos que se repiten por una
    // silla (#224), s7 (23-29, 20-25) hasta el mapa de 42×42 (#226) y s29
    // (20-29, 7-14) hasta las fronteras onduladas (#229, 09-10-2026). En s53,
    // la montaña de (29-41, 3-7) es de la meseta de arena y 16 de sus 39
    // casillas tienen otro suelo más cercano de cualquier nivel: con la roca de
    // ese suelo, como antes de #216, saldría de otra. Con el río continuo (#144)
    // la s53 no tiene cordillera en la arena: va la s60, la de más casillas
    // así de 1-80, donde la montaña de (30-37, 0-6) es de la meseta de arena y
    // 11 de sus 27 casillas tienen otro suelo más cercano de cualquier nivel.
    const { escena: e } = partidaDe(60);
    const bajoLaArena = e.relieve.celdas.filter(
      (c) => c.vx >= 30 && c.vx <= 37 && c.vy >= 0 && c.vy <= 6,
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
